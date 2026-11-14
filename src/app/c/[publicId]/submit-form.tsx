"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { SubmitError } from "@/server/testimonials/submit";
import type { FieldErrors } from "@/server/testimonials/validate";

const FAILED = "Your testimonial could not be sent. Check your connection and try again.";
const LABELS: Record<keyof FieldErrors, string> = {
  name: "Your name",
  email: "Email",
  roleCompany: "Role and company",
  rating: "Rating",
  text: "Your testimonial",
  avatar: "Photo",
  consent: "Agreement",
};

/** "Please fix 2 fields: Your name, Email." so a screen reader hears what is wrong, not just that something is. */
function summary(errors: FieldErrors): string {
  const names = Object.keys(errors).map((key) => LABELS[key as keyof FieldErrors]);
  return `Please fix ${names.length === 1 ? "1 field" : `${names.length} fields`}: ${names.join(", ")}.`;
}

export function SubmitForm({ publicId }: { publicId: string }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  // After a refused submit, move focus to the first field that needs fixing (WCAG 2.4.3, 3.3.1).
  useEffect(() => {
    if (attempt) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not(fieldset), [aria-invalid="true"] input')?.focus();
  }, [attempt]);

  // The form also posts natively without JavaScript; with it, errors come back without losing what was typed.
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(event.currentTarget.action, { method: "POST", body: new FormData(event.currentTarget) });
      if (res.redirected) return window.location.assign(res.url);
      const body = (await res.json().catch(() => ({}))) as SubmitError;
      setErrors(body.fieldErrors ?? {});
      setMessage(body.error ?? (body.fieldErrors ? summary(body.fieldErrors) : FAILED));
      setAttempt((n) => n + 1);
    } catch {
      setMessage(FAILED);
    }
    setPending(false);
  }

  /** Ties a field to its hint and error for assistive technology. */
  const aria = (name: keyof FieldErrors, hint?: boolean) => {
    const ids = [hint && `${name}-hint`, errors[name] && `${name}-error`].filter(Boolean).join(" ");
    return { "aria-invalid": errors[name] ? true : undefined, "aria-describedby": ids || undefined };
  };
  const error = (name: keyof FieldErrors): ReactNode =>
    errors[name] && (
      <span id={`${name}-error`}>
        <br />
        <strong>{errors[name]}</strong>
      </span>
    );

  return (
    <form ref={form} action={`/api/submit/${publicId}`} method="post" encType="multipart/form-data" onSubmit={onSubmit}>
      {message && <p role="alert">{message}</p>}
      <p>
        <label htmlFor="name">Your name</label>
        <br />
        <input id="name" name="name" type="text" autoComplete="name" required {...aria("name")} />
        {error("name")}
      </p>
      <p>
        <label htmlFor="email">Email</label>
        <br />
        <input id="email" name="email" type="email" autoComplete="email" required {...aria("email", true)} />
        <small id="email-hint">
          <br />
          Never shown publicly.
        </small>
        {error("email")}
      </p>
      <p>
        <label htmlFor="role">Role and company (optional)</label>
        <br />
        <input id="role" name="role" type="text" autoComplete="organization-title" {...aria("roleCompany")} />
        {error("roleCompany")}
      </p>
      <fieldset role="radiogroup" aria-labelledby="rating-legend" {...aria("rating")}>
        <legend id="rating-legend">Rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n}>
            <input type="radio" name="rating" value={n} required /> {n} {n === 1 ? "star" : "stars"}{" "}
          </label>
        ))}
        {error("rating")}
      </fieldset>
      <p>
        <label htmlFor="text">Your testimonial</label>
        <br />
        <textarea
          id="text"
          name="text"
          rows={6}
          cols={50}
          minLength={10}
          maxLength={2000}
          required
          style={{ maxWidth: "100%" }}
          {...aria("text", true)}
        />
        <small id="text-hint">
          <br />
          10 to 2000 characters, plain text.
        </small>
        {error("text")}
      </p>
      <p>
        <label htmlFor="avatar">Photo (optional)</label>
        <br />
        <input id="avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" {...aria("avatar", true)} />
        <small id="avatar-hint">
          <br />
          JPEG, PNG or WebP, up to 2 MB.
        </small>
        {error("avatar")}
      </p>
      {/* Honeypot (R7): invisible, skipped by keyboard and screen readers; only bots fill it in. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p>
        <label>
          <input name="consent" type="checkbox" required {...aria("consent")} /> I agree that my name, role, photo,
          rating and testimonial may be shown publicly.
        </label>
        {error("consent")}
      </p>
      {/* aria-disabled, not disabled: disabling the focused button would drop keyboard focus to the page. */}
      <button type="submit" aria-disabled={pending || undefined}>
        {pending ? "Sending…" : "Send testimonial"}
      </button>
    </form>
  );
}
