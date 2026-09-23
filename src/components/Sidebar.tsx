"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandCrest } from "./BrandCrest";
import { ThemeToggle } from "./ThemeToggle";
import { PrivacyToggle } from "./PrivacyToggle";
import { logout } from "@/app/actions/auth";

const NAV = [
  {
    href: "/",
    label: "Journal",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="14" y2="18" />
      </svg>
    ),
  },
  {
    href: "/add-trade",
    label: "Add Trade",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        <line x1="12" y1="8.5" x2="12" y2="15.5" />
        <line x1="8.5" y1="12" x2="15.5" y2="12" />
      </svg>
    ),
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="5" y1="19" x2="5" y2="11" />
        <line x1="12" y1="19" x2="12" y2="6" />
        <line x1="19" y1="19" x2="19" y2="14" />
      </svg>
    ),
  },
  {
    href: "/calendar",
    label: "PnL Calendar",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
        <path d="M4 10h16" />
        <path d="M8 3.5v3.5M16 3.5v3.5" />
      </svg>
    ),
  },
  {
    href: "/market-bias",
    label: "Market Bias",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15l4-4 4 3 4-7 4 4" />
      </svg>
    ),
  },
  {
    href: "/news",
    label: "News",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
        <path d="M4 10h16" />
        <circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
        <path d="M12.5 14h5M8.5 17.3h9" />
      </svg>
    ),
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="7" width="16" height="12" rx="2" />
        <path d="M4 10h16" />
        <path d="M8 7V5.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 5.5V7" />
      </svg>
    ),
  },
  {
    href: "/budgeting",
    label: "Budgeting & Tax",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v9M15 10c0-1.4-1.4-2-3-2s-3 .7-3 2c0 1.3 1.3 1.7 3 2.2s3 .8 3 2.1c0 1.3-1.4 2-3 2s-3-.5-3-1.8" />
      </svg>
    ),
  },
];

const ADMIN_ITEM = {
  href: "/admin/invites",
  label: "Invite Codes",
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 3.5 8v4c0 5 3.6 8.4 8.5 9.5 4.9-1.1 8.5-4.5 8.5-9.5V8L12 3.5Z" />
      <path d="M9 12.2 11 14l4-4" />
    </svg>
  ),
};

const INSTAGRAM_ITEM = {
  href: "/stories",
  label: "Story Maker",
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const DM_ITEM = {
  href: "/dm-replies",
  label: "DM Replies",
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  ),
};

const EV_ITEM = {
  href: "/ev-calculator",
  label: "EV Calculator",
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
};

function NavLink({
  href,
  label,
  icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-[7px] px-2.5 py-2.5 text-[13px] font-medium"
      style={
        active
          ? { background: "var(--accent-soft)", color: "var(--accent-strong)" }
          : { color: "var(--text-soft)" }
      }
    >
      <span className="flex-none opacity-85">{icon}</span>
      {label}
    </Link>
  );
}

export function Sidebar({
  userName,
  isAdmin,
  showInstagram = false,
}: {
  userName: string;
  isAdmin: boolean;
  showInstagram?: boolean;
}) {
  // Below the `md` breakpoint the sidebar becomes an off-canvas drawer
  // (fixed, slid out via translate-x) opened by a hamburger button in a
  // small top bar; at `md` and up it reverts to the original always-visible
  // static column. Closed by default so a fresh mobile page load doesn't
  // show a half-covered screen.
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer automatically whenever navigation actually happens
  // (covers back/forward and any navigation not going through NavLink's
  // own onClick, e.g. the browser's own gesture nav). This is a legitimate
  // post-navigation sync with an external source (the URL), the same
  // situation already documented and disabled this same way for
  // PnlCalendarGrid's localStorage-restore effect — not something a
  // useState lazy initializer can replace, since `open` isn't derived from
  // `pathname`, it just needs resetting whenever `pathname` changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  const close = () => setOpen(false);

  return (
    <>
      {/* Mobile-only top bar: hidden entirely at md+ where the sidebar is
          always visible and this would be redundant. */}
      <div
        className="fixed inset-x-0 top-0 z-30 flex h-[52px] items-center justify-between px-3.5 md:hidden"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border-soft)" }}
      >
        <div className="flex items-center gap-2">
          <BrandCrest size={18} />
          <span
            className="whitespace-nowrap text-[13px] tracking-[0.09em]"
            style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
          >
            THE <b className="font-medium" style={{ color: "var(--accent)" }}>BACKROOM</b>
          </span>
        </div>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[7px]"
          style={{ color: "var(--text-soft)", background: "var(--surface-2)", border: "1px solid var(--border-soft)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Backdrop, mobile-only, only rendered while the drawer is open. */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <div
        className={`sidebar fixed inset-y-0 left-0 z-40 flex w-[240px] flex-none flex-col p-3.5 transition-transform duration-200 ease-out md:static md:z-auto md:w-[216px] md:translate-x-0 md:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--surface)", borderRight: "1px solid var(--border-soft)" }}
      >
        <div className="mb-3.5 border-b px-2 pb-5 pt-1.5" style={{ borderColor: "var(--border-soft)" }}>
          <div className="flex items-center gap-2.5">
            <BrandCrest size={20} />
            <span
              className="whitespace-nowrap text-[14.5px] tracking-[0.09em]"
              style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
            >
              THE <b className="font-medium" style={{ color: "var(--accent)" }}>BACKROOM</b>
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="text-[9.5px] uppercase tracking-[0.1em]"
              style={{ fontFamily: "var(--font-data)", color: "var(--text-mute)" }}
            >
              Member Desk
            </span>
            <span
              className="rounded-[3px] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.07em]"
              style={{
                fontFamily: "var(--font-data)",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                border: "1px solid var(--accent-line)",
              }}
            >
              BETA
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={close} />
          ))}
          <div className="my-2.5 mx-1 h-px" style={{ background: "var(--border-soft)" }} />
          <NavLink {...EV_ITEM} onNavigate={close} />
          {isAdmin && <NavLink {...ADMIN_ITEM} onNavigate={close} />}
          {showInstagram && <NavLink {...INSTAGRAM_ITEM} onNavigate={close} />}
          {showInstagram && <NavLink {...DM_ITEM} onNavigate={close} />}
        </nav>

        <div className="mt-auto pt-2.5" style={{ borderTop: "1px solid var(--border-soft)" }}>
          <PrivacyToggle />
          <ThemeToggle />
          <div className="flex items-center justify-between gap-2 px-2 pb-0.5 pt-1 text-[11px]" style={{ color: "var(--text-mute)" }}>
            <span className="truncate">
              Signed in as <b className="font-semibold" style={{ color: "var(--text-soft)" }}>{userName}</b>
            </span>
            <form action={logout}>
              <button type="submit" className="flex-none" style={{ color: "var(--text-mute)", textDecoration: "underline", cursor: "pointer" }}>
                Log out
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
