"use client";

import { useEffect } from "react";

// Hits the browser's native print dialog, which doubles as "Save as PDF" in
// every major browser — the print stylesheet (globals.css, @media print)
// hides the sidebar/nav/forms/buttons and leaves only the year-summary
// ledger below, so what comes out is a clean set of pages to hand to an
// accountant, not a screenshot of the whole app.
//
// The Income/Expense category blocks are collapsible <details> on screen
// (see .tax-category-block) so the summary reads a summary-length instead
// of a wall of entries — but the printed/PDF'd copy should always come out
// fully itemized, every line, regardless of which categories happened to
// be expanded when Print was clicked. That used to be handled with a pure
// CSS override (`.print-area details:not([open]) > * { display: block }`),
// but current Chromium renders a closed <details>'s content inside an
// internal `::details-content` box that a plain `display` override on the
// children can't reach — the children genuinely compute `display: block`
// while still never being painted, so the printed PDF silently came out
// with categories collapsed to just their totals. Actually setting the
// `open` attribute (native DOM state, not React state — this component
// never renders an `open` prop) is the only thing that reliably expands
// them, so do that right before print and put it back after, so the
// on-screen collapsed/expanded state a member left things in isn't
// disturbed. beforeprint/afterprint also cover Ctrl+P / the browser's own
// print menu, not just this button.
export function PrintButton() {
  useEffect(() => {
    function openAllForPrint() {
      document.querySelectorAll<HTMLDetailsElement>(".print-area details").forEach((d) => {
        if (!d.open) {
          d.dataset.reopenAfterPrint = "1";
          d.open = true;
        }
      });
    }
    function restoreAfterPrint() {
      document.querySelectorAll<HTMLDetailsElement>(".print-area details[data-reopen-after-print]").forEach((d) => {
        d.open = false;
        delete d.dataset.reopenAfterPrint;
      });
    }
    window.addEventListener("beforeprint", openAllForPrint);
    window.addEventListener("afterprint", restoreAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", openAllForPrint);
      window.removeEventListener("afterprint", restoreAfterPrint);
    };
  }, []);

  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
