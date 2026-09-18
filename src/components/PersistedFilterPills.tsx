"use client";

import Link from "next/link";

// A pill-row filter (accounts, currencies, ...) that remembers your last
// choice in a cookie, so it doesn't silently reset back to "all" every time
// you come back to the page. The page itself still does the actual
// filtering server-side from the URL — this component's only job is to
// stash the value you just picked in a cookie on the way there, so the next
// *fresh* visit (no explicit filter in the URL) can fall back to it.
export type FilterPillItem = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  // The raw value this pill represents, written to the cookie on click.
  cookieValue: string;
};

export function PersistedFilterPills({ items, cookieName }: { items: FilterPillItem[]; cookieName: string }) {
  function remember(value: string) {
    try {
      // Deliberate write to a browser global from inside a click handler
      // (never during render) — not a render-purity violation, just how you
      // set a cookie. 1 year, readable by the app's own pages only.
      // eslint-disable-next-line react-hooks/immutability -- see above
      document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  }

  return (
    <div className="acct-pills">
      {items.map((item) => (
        <Link key={item.key} href={item.href} className={`acct-pill${item.active ? " active" : ""}`} onClick={() => remember(item.cookieValue)}>
          <span className="dot" /> {item.label}
        </Link>
      ))}
    </div>
  );
}
