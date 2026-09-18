"use client";

import { useState } from "react";

// R:R is always stored/submitted as a positive magnitude — Outcome is what
// makes it count as a loss in Net R and Profit Factor (see the schema note
// on trades.rr). Typing a negative number used to just hit a hard wall
// (min="0" on a plain <input>), which was confusing on a real losing
// trade — "I lost double risk, why won't it let me type -2?" This pairs the
// R:R field with the Outcome select so a negative number is still typed
// naturally: the moment it goes negative, Outcome flips to Loss for you,
// and the field normalizes back to its positive magnitude once you're done
// typing. The server action still runs Math.abs() on submit regardless, so
// this is purely a friendlier way to arrive at the same correct data.
//
// Deliberately type="text" (with inputMode="decimal" for a numeric mobile
// keyboard), not type="number" — a controlled type="number" input actively
// fights typing a minus sign: per the HTML spec, a lone "-" isn't a valid
// number yet, so the browser reports the DOM value as "" while it's on
// screen, and syncing that "" straight back into React's state erases the
// "-" the instant you type it, leaving just the digit behind ("-2" reads
// back as "2"). A plain text field has no such intermediate-value coercion,
// so every keystroke — including the minus sign — sticks.
export function RrOutcomeFields({
  defaultRr = "1.0",
  defaultOutcome = "win",
}: {
  defaultRr?: string | number;
  defaultOutcome?: "win" | "loss" | "be";
}) {
  const [rr, setRr] = useState(String(defaultRr));
  const [outcome, setOutcome] = useState<"win" | "loss" | "be">(defaultOutcome);

  function handleRrChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setRr(raw);
    const num = parseFloat(raw);
    if (!Number.isNaN(num) && num < 0) {
      setOutcome("loss");
    }
  }

  function handleRrBlur() {
    const num = parseFloat(rr);
    if (!Number.isNaN(num) && num < 0) {
      setRr(String(Math.abs(num)));
    }
  }

  return (
    <>
      <div className="field">
        <label htmlFor="rr">R:R</label>
        <input
          type="text"
          inputMode="decimal"
          pattern="-?[0-9]*\.?[0-9]*"
          id="rr"
          name="rr"
          value={rr}
          onChange={handleRrChange}
          onFocus={(e) => e.target.select()}
          onBlur={handleRrBlur}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="outcome">Outcome</label>
        <select id="outcome" name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as "win" | "loss" | "be")}>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="be">Break-even</option>
        </select>
      </div>
    </>
  );
}
