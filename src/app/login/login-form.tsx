"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action}>
      <p>
        <label htmlFor="password">Password</label>
        <br />
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-error" : undefined}
        />
        {state.error && (
          <span id="password-error" role="alert">
            <br />
            {state.error}
          </span>
        )}
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
