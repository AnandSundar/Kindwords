"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/guard";
import { getDb } from "@/server/db/client";
import { getTestimonial } from "@/server/db/repositories/testimonials";
import { getStorage } from "@/server/storage";
import { changeStatus, removeTestimonial, saveTestimonial, setFeatured } from "@/server/testimonials/moderate";
import { isStatus } from "@/server/testimonials/status";
import type { FieldErrors } from "@/server/testimonials/validate";

export type TestimonialFormState = { error?: string; fieldErrors?: FieldErrors };

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/** Back to the inbox tab the admin acted from; only known filters are echoed into the URL. */
function backToInbox(spaceId: string, form: FormData): never {
  const filter = field(form, "filter");
  redirect(`/admin/spaces/${spaceId}/inbox${isStatus(filter) || filter === "all" ? `?status=${filter}` : ""}`);
}

export async function setStatusAction(form: FormData): Promise<void> {
  await requireAdmin();
  const status = field(form, "status");
  if (!isStatus(status)) return;
  const updated = await changeStatus(getDb(), field(form, "id"), status);
  if (updated) backToInbox(updated.spaceId, form);
}

export async function setFeaturedAction(form: FormData): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const id = field(form, "id");
  await setFeatured(db, id, field(form, "featured") === "true");
  const testimonial = await getTestimonial(db, id);
  if (testimonial) backToInbox(testimonial.spaceId, form);
}

export async function deleteTestimonialAction(form: FormData): Promise<void> {
  await requireAdmin();
  const db = getDb();
  const testimonial = await getTestimonial(db, field(form, "id"));
  if (!testimonial) return;
  await removeTestimonial(db, getStorage(), testimonial.id);
  backToInbox(testimonial.spaceId, form);
}

/** Edit (form has `id`) or manual add (form has `spaceId`, R13). */
export async function saveTestimonialAction(_previous: TestimonialFormState, form: FormData): Promise<TestimonialFormState> {
  await requireAdmin();
  const id = field(form, "id");
  const target = id ? { id } : { spaceId: field(form, "spaceId"), publish: form.has("publish") };
  const file = form.get("avatar");
  const result = await saveTestimonial(
    getDb(),
    getStorage(),
    target,
    {
      name: field(form, "name"),
      email: field(form, "email"),
      roleCompany: field(form, "role"),
      rating: field(form, "rating"),
      text: field(form, "text"),
    },
    {
      file: file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : undefined,
      remove: form.has("removeAvatar"),
    },
  );
  if (!("testimonial" in result)) return result;
  const { spaceId, status } = result.testimonial;
  redirect(`/admin/spaces/${spaceId}/inbox?status=${status}&saved`);
}
