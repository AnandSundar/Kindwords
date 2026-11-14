"use client";

import { useActionState, type ReactNode } from "react";
import { choiceInput, choiceLabel } from "@/app/choice-style";
import type { Testimonial } from "@/server/db/repositories/testimonials";
import { deleteTestimonialAction, saveTestimonialAction } from "./actions";

type Props =
  | { mode: "edit"; testimonial: Pick<Testimonial, "id" | "name" | "email" | "roleCompany" | "rating" | "text" | "avatarKey"> }
  | { mode: "new"; spaceId: string };

/** Admin edit and manual-add form (U7). Field errors sit beside their field and are tied to it. */
export function TestimonialForm(props: Props) {
  const [state, action, pending] = useActionState(saveTestimonialAction, {});
  const t = props.mode === "edit" ? props.testimonial : undefined;
  const errors = state.fieldErrors ?? {};
  const v = state.values;

  const row = (name: keyof typeof errors, label: string, control: (aria: object) => ReactNode, hint?: string) => {
    const describedBy = [hint && `${name}-hint`, errors[name] && `${name}-error`].filter(Boolean).join(" ");
    return (
      <p>
        <label htmlFor={name}>{label}</label>
        <br />
        {control({ id: name, "aria-invalid": errors[name] ? true : undefined, "aria-describedby": describedBy || undefined })}
        {hint && (
          <small id={`${name}-hint`}>
            <br />
            {hint}
          </small>
        )}
        {errors[name] && (
          <span id={`${name}-error`} role="alert">
            <br />
            {errors[name]}
          </span>
        )}
      </p>
    );
  };

  return (
    <form action={action}>
      {t ? <input type="hidden" name="id" value={t.id} /> : <input type="hidden" name="spaceId" value={(props as { spaceId: string }).spaceId} />}
      {state.error && <p role="alert">{state.error}</p>}
      {row("name", "Name", (aria) => <input {...aria} name="name" type="text" required maxLength={80} defaultValue={v?.name ?? t?.name} />)}
      {row("roleCompany", "Role and company (optional)", (aria) => (
        <input {...aria} name="role" type="text" maxLength={120} defaultValue={v?.roleCompany ?? t?.roleCompany ?? ""} />
      ))}
      {row(
        "email",
        "Email (optional, never shown publicly)",
        (aria) => <input {...aria} name="email" type="email" maxLength={254} defaultValue={v?.email ?? t?.email ?? ""} />,
      )}
      {row("rating", "Rating", (aria) => (
        <select {...aria} name="rating" defaultValue={v?.rating ?? (t?.rating ? String(t.rating) : "")}>
          <option value="">No rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "star" : "stars"}
            </option>
          ))}
        </select>
      ))}
      {row("text", "Testimonial", (aria) => (
        <textarea {...aria} name="text" required rows={6} cols={60} maxLength={2000} defaultValue={v?.text ?? t?.text} />
      ))}
      {row(
        "avatar",
        t?.avatarKey ? "Replace photo (optional)" : "Photo (optional)",
        (aria) => <input {...aria} name="avatar" type="file" accept="image/jpeg,image/png,image/webp" />,
        "JPEG, PNG or WebP, up to 2 MB.",
      )}
      {t?.avatarKey && (
        <p>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed 256px webp from /media */}
          <img src={`/media/${t.avatarKey}`} alt="Current photo" width={64} height={64} />{" "}
          <label style={choiceLabel}>
            <input type="checkbox" name="removeAvatar" style={choiceInput} defaultChecked={v?.removeAvatar} /> Remove photo
          </label>
        </p>
      )}
      {!t && (
        <p>
          <label style={choiceLabel}>
            <input type="checkbox" name="publish" style={choiceInput} defaultChecked={v?.publish ?? true} /> Publish now (otherwise it waits in the inbox as pending)
          </label>
        </p>
      )}
      <p>
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : t ? "Save changes" : "Add testimonial"}
        </button>
      </p>
    </form>
  );
}

/** Asks before deleting when JavaScript is on; without it, the button deletes directly. */
export function DeleteTestimonialButton({ id, name, filter }: { id: string; name: string; filter?: string }) {
  return (
    <form
      action={deleteTestimonialAction}
      style={{ display: "inline" }}
      onSubmit={(event) => {
        if (!window.confirm(`Delete the testimonial from ${name}? This cannot be undone.`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {filter && <input type="hidden" name="filter" value={filter} />}
      <button type="submit">Delete</button>
    </form>
  );
}
