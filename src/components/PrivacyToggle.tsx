"use client";

import { useEffect, useState } from "react";

// Blurs every dollar figure on the site (anything wrapped in a `.money`
// span) — for streaming or screen-sharing without doxxing your account
// balance. Purely a client-side display toggle: nothing is sent to the
// server, and it's remembered per-browser via localStorage.
export function PrivacyToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(document.documentElement.getAttribute("data-privacy") === "on");
  }, []);

  function toggle() {
    const next = !hidden;
    if (next) {
      document.documentElement.setAttribute("data-privacy", "on");
    } else {
      document.documentElement.removeAttribute("data-privacy");
    }
    try {
      localStorage.setItem("backroom-privacy", next ? "on" : "off");
    } catch {}
    setHidden(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="mb-2 flex w-full items-center justify-center gap-2 rounded-[7px] border py-1.5 text-[11.5px] font-semibold"
      style={{
        borderColor: "var(--border)",
        background: hidden ? "var(--accent-soft)" : "var(--surface-2)",
        color: hidden ? "var(--accent-strong)" : "var(--text-mute)",
      }}
      title={hidden ? "Show dollar amounts" : "Hide dollar amounts (for streaming / screen-sharing)"}
    >
      {hidden ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 9.5 5.5 9.9 7a11.6 11.6 0 0 1-2.7 3.9M6.6 6.6C3.7 8.4 2.1 11.3 2.1 12c.4 1.5 3.9 7 9.9 7 1.4 0 2.7-.3 3.8-.8" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.1 12S5.6 5 12 5s9.9 7 9.9 7-3.5 7-9.9 7-9.9-7-9.9-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
      {hidden ? "$ amounts hidden" : "Hide $ amounts"}
    </button>
  );
}
