import type { Db } from "../db/client";
import { getSpace } from "../db/repositories/spaces";
import {
  createTestimonial,
  deleteTestimonial,
  getTestimonial,
  setTestimonialFeatured,
  updateTestimonial,
  type Testimonial,
  type TestimonialStatus,
} from "../db/repositories/testimonials";
import { newMediaKey, type Storage } from "../storage";
import { AvatarError, processAvatar } from "../uploads/avatar";
import { statusPatch } from "./status";
import { validateSubmission, type FieldErrors } from "./validate";

/** The admin form's raw fields (edit and manual add). */
export type AdminFields = { name: string; email: string; roleCompany: string; rating: string; text: string };

/** `file` is the uploaded avatar's bytes (empty when none chosen); `remove` drops the current avatar. */
export type AvatarChange = { file?: Buffer; remove?: boolean };

export type SaveResult = { testimonial: Testimonial } | { fieldErrors: FieldErrors } | { error: string };

export async function changeStatus(db: Db, id: string, status: TestimonialStatus): Promise<Testimonial | undefined> {
  return updateTestimonial(db, id, statusPatch(status));
}

/** R12: featured can be set only while approved. */
export async function setFeatured(db: Db, id: string, featured: boolean): Promise<{ saved: true } | { error: string }> {
  if (await setTestimonialFeatured(db, id, featured)) return { saved: true };
  return { error: "Only approved testimonials can be featured. Approve it first." };
}

const logDeleteFailure = (key: string) => (error: unknown) => console.error(`Could not delete avatar ${key}:`, error);

/** Deletes the row, then its avatar file; a failed file delete is logged, not fatal (the row is gone). */
export async function removeTestimonial(db: Db, storage: Storage, id: string): Promise<boolean> {
  const existing = await getTestimonial(db, id);
  if (!existing || !(await deleteTestimonial(db, id))) return false;
  if (existing.avatarKey) await storage.delete(existing.avatarKey).catch(logDeleteFailure(existing.avatarKey));
  return true;
}

/**
 * Edits an existing testimonial (`target.id`) or adds one by hand (`target.spaceId`, R13). Original text
 * is never touched by an edit (R11), and a manual add has none. A new avatar is stored before the row is
 * written and the replaced one deleted after, so a failure never leaves the row pointing at a missing file.
 */
export async function saveTestimonial(
  db: Db,
  storage: Storage,
  target: { id: string } | { spaceId: string; publish: boolean },
  fields: AdminFields,
  avatar: AvatarChange = {},
): Promise<SaveResult> {
  const result = validateSubmission({ ...fields, consent: true }, "admin");
  if ("fieldErrors" in result) return result;

  const existing = "id" in target ? await getTestimonial(db, target.id) : undefined;
  if ("id" in target && !existing) return { error: "That testimonial no longer exists." };
  if ("spaceId" in target && !(await getSpace(db, target.spaceId))) return { error: "That space no longer exists." };

  let image: Buffer | undefined;
  if (avatar.file?.length) {
    try {
      image = await processAvatar(avatar.file);
    } catch (error) {
      if (!(error instanceof AvatarError)) throw error;
      return { fieldErrors: { avatar: error.message } };
    }
  }

  const newKey = image ? newMediaKey() : undefined;
  if (newKey) await storage.put(newKey, image!);
  const avatarKey = newKey ?? (avatar.remove ? null : (existing?.avatarKey ?? null));
  let testimonial: Testimonial | undefined;
  try {
    testimonial =
      "id" in target
        ? await updateTestimonial(db, target.id, { ...result.values, avatarKey })
        : await createTestimonial(db, {
            spaceId: target.spaceId,
            status: target.publish ? "approved" : "pending",
            ...result.values,
            avatarKey,
          });
  } catch (error) {
    if (newKey) await storage.delete(newKey).catch(logDeleteFailure(newKey));
    throw error;
  }
  if (!testimonial) {
    // Deleted between our read and the update.
    if (newKey) await storage.delete(newKey).catch(logDeleteFailure(newKey));
    return { error: "That testimonial no longer exists." };
  }
  if (existing?.avatarKey && existing.avatarKey !== avatarKey) {
    await storage.delete(existing.avatarKey).catch(logDeleteFailure(existing.avatarKey));
  }
  return { testimonial };
}
