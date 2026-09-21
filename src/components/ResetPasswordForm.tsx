"use client";

import { useActionState, useState } from "react";
import { resetPassword, type AuthFormState } from "@/app/actions/auth";

const initialState: AuthFormState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          type="password"
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <div className="sub" style={{ marginTop: 4 }}>
          At least 8 characters.
        </div>
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input
          type="password"
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {mismatch && (
          <div className="sub" style={{ marginTop: 4, color: "var(--bad)" }}>
            Passwords don&apos;t match.
          </div>
        )}
      </div>
      {state.error && <div className="auth-error">{state.error}</div>}
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending || mismatch}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
