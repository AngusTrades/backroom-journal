"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordFormState } from "@/app/actions/auth";

const initialState: ForgotPasswordFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  // Once a request has gone through (sent, or errored), replace the form
  // with the outcome rather than leaving it up — resubmitting the same
  // email isn't useful (a fresh request just invalidates the link that was
  // already emailed) and re-showing the form invites exactly that.
  if (state.sent) {
    return (
      <div className="auth-success">
        If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 1 hour.
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input type="email" id="email" name="email" autoComplete="email" required autoFocus />
      </div>
      {state.error && <div className="auth-error">{state.error}</div>}
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
