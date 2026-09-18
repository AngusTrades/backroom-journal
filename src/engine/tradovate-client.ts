/**
 * Minimal Tradovate REST + real-time (WebSocket) client.
 *
 * Built directly from Tradovate's official Partner API docs
 * (partner.tradovate.com) and cross-checked against a couple of open
 * community implementations. IMPORTANT: this has NOT been exercised
 * against a live Tradovate connection — this sandbox has no network path
 * to Tradovate's servers, so nothing here has actually been run end to
 * end. Field names on the REST auth/order calls are taken verbatim from
 * the docs and are high-confidence; the exact shape of real-time "fill"
 * push events is lower-confidence (Tradovate's docs didn't spell out
 * every field) — see the big comment in copy-engine.ts's onFill handler.
 * Log everything, verify against your own demo account before trusting
 * any of this with real orders.
 */

import WebSocket from "ws";

export type TradovateEnvironment = "demo" | "live";

export interface TradovateCredentials {
  name: string; // Tradovate login username
  password: string;
  appId: string;
  appVersion: string;
  cid: string; // Partner API client id
  sec: string; // Partner API client secret
  deviceId?: string;
}

export interface TradovateAuthResult {
  accessToken: string;
  mdAccessToken?: string;
  expirationTime: string;
  userId: number;
  name: string;
  hasLive?: boolean;
}

export interface PlaceOrderParams {
  accountSpec: string; // the Tradovate username the account belongs to
  accountId: number;
  action: "Buy" | "Sell";
  symbol: string;
  orderQty: number;
  orderType: "Market" | "Limit" | "Stop" | "StopLimit";
  price?: number;
  stopPrice?: number;
  isAutomated?: boolean;
}

export function baseUrlFor(env: TradovateEnvironment) {
  // Demo is directly confirmed from Tradovate's docs
  // (https://demo.tradovateapi.com). The live hostname follows the same
  // documented naming convention but wasn't independently confirmed here
  // — double check it in your Tradovate dashboard / API docs before you
  // ever set TRADOVATE_ENV=live.
  return env === "live" ? "https://live.tradovateapi.com" : "https://demo.tradovateapi.com";
}

export function wsUrlFor(env: TradovateEnvironment) {
  return env === "live" ? "wss://live.tradovateapi.com/v1/websocket" : "wss://demo.tradovateapi.com/v1/websocket";
}

export class TradovateClient {
  private env: TradovateEnvironment;
  private creds: TradovateCredentials;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(env: TradovateEnvironment, creds: TradovateCredentials) {
    this.env = env;
    this.creds = creds;
  }

  private get baseUrl() {
    return baseUrlFor(this.env);
  }

  async authenticate(): Promise<TradovateAuthResult> {
    const res = await fetch(`${this.baseUrl}/v1/auth/accesstokenrequest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: this.creds.name,
        password: this.creds.password,
        appId: this.creds.appId,
        appVersion: this.creds.appVersion,
        cid: this.creds.cid,
        sec: this.creds.sec,
        deviceId: this.creds.deviceId ?? "backroom-copy-engine",
      }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.accessToken) {
      throw new Error(`Tradovate auth failed (${res.status}): ${JSON.stringify(body)}`);
    }

    this.accessToken = body.accessToken;
    // expirationTime is an ISO string per the docs; fall back to a
    // conservative 20-minute assumption if it's missing/unparsable.
    const parsed = body.expirationTime ? Date.parse(body.expirationTime) : NaN;
    this.tokenExpiresAt = Number.isFinite(parsed) ? parsed : Date.now() + 20 * 60 * 1000;

    return body as TradovateAuthResult;
  }

  private async ensureToken(): Promise<string> {
    // Refresh a little before actual expiry.
    if (!this.accessToken || Date.now() > this.tokenExpiresAt - 60_000) {
      await this.authenticate();
    }
    return this.accessToken!;
  }

  /** Low-level authenticated REST call against the Tradovate API. */
  async request<T = unknown>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.baseUrl}/v1/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const parsed = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Tradovate ${method} ${path} failed (${res.status}): ${JSON.stringify(parsed)}`);
    }
    return parsed as T;
  }

  /**
   * Places a real order. NOTE: the exact endpoint casing
   * ("order/placeOrder" vs "order/placeorder") differs between the
   * official docs and community implementations that clearly work — try
   * the camelCase form first; if Tradovate returns a 404, switch to the
   * lowercase form. A 404 here is a safe, loud failure — nothing gets
   * placed silently wrong.
   */
  async placeOrder(params: PlaceOrderParams) {
    return this.request("POST", "order/placeOrder", { isAutomated: true, ...params });
  }

  /**
   * Opens the real-time WebSocket connection, authorizes it, subscribes
   * to account/order/fill updates via user/syncrequest, and calls
   * onEvent for every parsed push message. Handles the documented
   * heartbeat (send `[]` every 2.5s) and reconnects if the socket goes
   * quiet for more than 15s or closes unexpectedly.
   *
   * Returns a function you can call to close the connection deliberately
   * (stops the automatic reconnect).
   */
  connectRealtime(onEvent: (msg: unknown) => void, onStatus?: (status: string) => void): () => void {
    let stopped = false;
    let ws: WebSocket | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let requestId = 1;

    const clearTimers = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (watchdogTimer) clearTimeout(watchdogTimer);
    };

    const resetWatchdog = () => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => {
        onStatus?.("watchdog-timeout — no message in 15s, reconnecting");
        ws?.close();
      }, 15_000);
    };

    const connectOnce = async () => {
      if (stopped) return;
      const token = await this.ensureToken();
      onStatus?.(`connecting to ${wsUrlFor(this.env)}`);
      ws = new WebSocket(wsUrlFor(this.env));

      ws.onopen = () => {
        onStatus?.("socket open — authorizing");
        ws!.send(`authorize\n0\n\n${token}`);
        resetWatchdog();
        heartbeatTimer = setInterval(() => {
          ws?.send("[]");
        }, 2500);
      };

      ws.onmessage = (event) => {
        resetWatchdog();
        const raw = String(event.data);
        const type = raw[0];
        const payload = raw.slice(1);

        if (type === "o") {
          onStatus?.("frame:open");
          return;
        }
        if (type === "h") {
          // server heartbeat, nothing to do
          return;
        }
        if (type === "c") {
          onStatus?.(`frame:close ${payload}`);
          return;
        }
        if (type === "a") {
          let messages: unknown[] = [];
          try {
            messages = JSON.parse(payload);
          } catch {
            onStatus?.(`could not parse frame: ${raw.slice(0, 200)}`);
            return;
          }
          for (const msg of messages) {
            const anyMsg = msg as { i?: number; s?: number };
            if (anyMsg.i === 0) {
              // response to our authorize frame
              onStatus?.(anyMsg.s === 200 ? "authorized" : `authorize failed: ${JSON.stringify(msg)}`);
              if (anyMsg.s === 200) {
                ws!.send(
                  `user/syncrequest\n${requestId++}\n\n` +
                    JSON.stringify({
                      splitResponses: true,
                      entityTypes: ["account", "order", "fill", "executionReport"],
                      shardingExpression: { expressionType: "modUserId", divisor: 1, remainder: 0 },
                    }),
                );
              }
              continue;
            }
            onEvent(msg);
          }
          return;
        }
        // Unrecognized frame type — surface it rather than silently drop it.
        onStatus?.(`unrecognized frame: ${raw.slice(0, 200)}`);
      };

      ws.onerror = (err) => {
        onStatus?.(`socket error: ${String(err)}`);
      };

      ws.onclose = () => {
        clearTimers();
        onStatus?.("socket closed");
        if (!stopped) {
          setTimeout(connectOnce, 2000);
        }
      };
    };

    connectOnce();

    return () => {
      stopped = true;
      clearTimers();
      ws?.close();
    };
  }
}
