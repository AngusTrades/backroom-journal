"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type AuthFormState } from "@/app/actions/auth";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input type="email" id="email" name="email" autoComplete="email" required />
      </div>
      <div className="field">
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <label htmlFor="password" style={{ marginBottom: 0 }}>
            Password
          </label>
          <Link href="/forgot-password" className="link" style={{ fontSize: 12 }}>
            Forgot password?
          </Link>
        </div>
        <input type="password" id="password" name="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <div className="auth-error">{state.error}</div>
      )}
      <button type="submit" className="btn btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
