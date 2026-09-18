"use client";

import { useActionState } from "react";
import { signup, type AuthFormState } from "@/app/actions/auth";

const initialState: AuthFormState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <div className="field">
        <label htmlFor="name">Name</label>
        <input type="text" id="name" name="name" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input type="email" id="email" name="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input type="password" id="password" name="password" autoComplete="new-password" required minLength={8} />
        <div className="sub" style={{ marginTop: 4 }}>
          At least 8 characters.
        </div>
      </div>
      <div className="field">
        <label htmlFor="code">Invite code</label>
        <input type="text" id="code" name="code" placeholder="e.g. from The Backroom Discord" required />
      </div>
      {state.error && (
        <div className="auth-error">{state.error}</div>
      )}
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
