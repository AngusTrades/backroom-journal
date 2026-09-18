"use client";

// Hits the browser's native print dialog, which doubles as "Save as PDF" in
// every major browser — the print stylesheet (globals.css, @media print)
// hides the sidebar/nav/forms/buttons and leaves only the year-summary
// ledger below, so what comes out is a clean set of pages to hand to an
// accountant, not a screenshot of the whole app.
export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
