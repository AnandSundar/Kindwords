"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/guard";
import { getDb } from "@/server/db/client";
import { addSpace, deleteSpaceAndFiles, editSpaceName } from "@/server/spaces";
import { getStorage } from "@/server/storage";

export type SpaceFormState = { error?: string };

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function createSpaceAction(_previous: SpaceFormState, form: FormData): Promise<SpaceFormState> {
  await requireAdmin();
  const result = await addSpace(getDb(), field(form, "name"));
  if ("error" in result) return result;
  redirect(`/admin/spaces/${result.space.id}`);
}

export async function renameSpaceAction(_previous: SpaceFormState, form: FormData): Promise<SpaceFormState> {
  await requireAdmin();
  const id = field(form, "id");
  const result = await editSpaceName(getDb(), id, field(form, "name"));
  if ("error" in result) return result;
  // A redirect re-renders the page, so the heading and delete prompt show the new name.
  redirect(`/admin/spaces/${id}?renamed`);
}

export async function deleteSpaceAction(_previous: SpaceFormState, form: FormData): Promise<SpaceFormState> {
  await requireAdmin();
  const result = await deleteSpaceAndFiles(getDb(), getStorage(), field(form, "id"), field(form, "confirm"));
  if ("error" in result) return result;
  redirect("/admin?deleted");
}
