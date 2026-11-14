"use client";

import { useActionState } from "react";
import { createSpaceAction, deleteSpaceAction, renameSpaceAction, type SpaceFormState } from "./actions";

type Action = (previous: SpaceFormState, form: FormData) => Promise<SpaceFormState>;

/** One labelled text field with its error tied to it, a hidden space ID, and a submit button. */
function SpaceForm(props: {
  action: Action;
  spaceId?: string;
  field: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  submit: string;
  pendingText: string;
}) {
  const [state, action, pending] = useActionState(props.action, {});
  const id = `${props.field}-${props.spaceId ?? "new"}`;
  const describedBy = [props.hint && `${id}-hint`, state.error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <form action={action}>
      {props.spaceId && <input type="hidden" name="id" value={props.spaceId} />}
      <p>
        <label htmlFor={id}>{props.label}</label>
        <br />
        <input
          id={id}
          name={props.field}
          type="text"
          autoComplete="off"
          required
          defaultValue={props.defaultValue}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />{" "}
        <button type="submit" disabled={pending}>
          {pending ? props.pendingText : props.submit}
        </button>
        {props.hint && (
          <small id={`${id}-hint`}>
            <br />
            {props.hint}
          </small>
        )}
        {state.error && (
          <span id={`${id}-error`} role="alert">
            <br />
            {state.error}
          </span>
        )}
      </p>
    </form>
  );
}

export function CreateSpaceForm() {
  return (
    <SpaceForm
      action={createSpaceAction}
      field="name"
      label="Space name"
      hint="Usually your product's name. Customers see it on the collection form."
      submit="Create space"
      pendingText="Creating…"
    />
  );
}

export function RenameSpaceForm({ spaceId, name }: { spaceId: string; name: string }) {
  return (
    <SpaceForm
      action={renameSpaceAction}
      spaceId={spaceId}
      field="name"
      label="Space name"
      defaultValue={name}
      submit="Rename"
      pendingText="Saving…"
    />
  );
}

export function DeleteSpaceForm({ spaceId, name }: { spaceId: string; name: string }) {
  return (
    <SpaceForm
      action={deleteSpaceAction}
      spaceId={spaceId}
      field="confirm"
      label={`Type “${name}” to confirm`}
      hint="This permanently deletes the space, all its testimonials and their photos. Embeds that use it will show an empty wall."
      submit="Delete space"
      pendingText="Deleting…"
    />
  );
}
