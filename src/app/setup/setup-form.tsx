"use client";

import { useActionState } from "react";
import { setup } from "./actions";

const fields = (minLength: number) => [
  { name: "code", label: "Setup code", type: "text", autoComplete: "off", hint: "Printed in the container logs at startup." },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: `At least ${minLength} characters.` },
  { name: "confirm", label: "Confirm password", type: "password", autoComplete: "new-password", hint: undefined },
] as const;

export function SetupForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(setup, {});
  return (
    <form action={action}>
      {state.error && <p role="alert">{state.error}</p>}
      {fields(minLength).map(({ name, label, type, autoComplete, hint }) => {
        const error = state.fieldErrors?.[name];
        const describedBy = [hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(" ");
        return (
          <p key={name}>
            <label htmlFor={name}>{label}</label>
            <br />
            <input
              id={name}
              name={name}
              type={type}
              autoComplete={autoComplete}
              required
              minLength={type === "password" ? minLength : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
            />
            {hint && <small id={`${name}-hint`}> {hint}</small>}
            {error && (
              <span id={`${name}-error`} role="alert">
                <br />
                {error}
              </span>
            )}
          </p>
        );
      })}
      <button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create admin account"}
      </button>
    </form>
  );
}
