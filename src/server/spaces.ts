import type { Db } from "./db/client";
import { createSpace, deleteSpace, getSpace, renameSpace, type Space } from "./db/repositories/spaces";
import { listAvatarKeys } from "./db/repositories/testimonials";
import type { Storage } from "./storage";

export const MAX_SPACE_NAME = 100;

/** Problem with a trimmed space name, or undefined. Counts characters, not UTF-16 units. */
export function spaceNameProblem(name: string): string | undefined {
  if (!name) return "Enter a name for the space.";
  if ([...name].length > MAX_SPACE_NAME) return `Keep the name to ${MAX_SPACE_NAME} characters or fewer.`;
}

export async function addSpace(db: Db, rawName: string): Promise<{ space: Space } | { error: string }> {
  const name = rawName.trim();
  const error = spaceNameProblem(name);
  return error ? { error } : { space: await createSpace(db, name) };
}

export async function editSpaceName(db: Db, id: string, rawName: string): Promise<{ saved: true } | { error: string }> {
  const name = rawName.trim();
  const error = spaceNameProblem(name);
  if (error) return { error };
  return (await renameSpace(db, id, name)) ? { saved: true } : { error: "That space no longer exists." };
}

/**
 * R26: the typed name must match exactly. Rows go first (cascade); avatar files after, because once the
 * rows are gone the files are unreachable, so a failed file delete is logged, not fatal.
 * shortcut: a testimonial submitted between reading the keys and the delete leaves an orphaned file;
 * add a storage sweep if that ever matters.
 */
export async function deleteSpaceAndFiles(
  db: Db,
  storage: Storage,
  id: string,
  typedName: string,
): Promise<{ deleted: true } | { error: string }> {
  const space = await getSpace(db, id);
  if (!space) return { error: "That space no longer exists." };
  if (typedName !== space.name) return { error: "The name you typed does not match. Type the space name exactly." };
  const keys = await listAvatarKeys(db, id);
  await deleteSpace(db, id);
  const results = await Promise.allSettled(keys.map((key) => storage.delete(key)));
  results.forEach((result, i) => {
    if (result.status === "rejected") console.error(`Could not delete avatar ${keys[i]} of deleted space ${id}:`, result.reason);
  });
  return { deleted: true };
}

/** Share links and embed code for a space (KTD4, KTD13); `origin` is PUBLIC_URL or the request origin. */
export function spaceSnippets(origin: string, publicId: string) {
  const wall = `${origin}/w/${publicId}`;
  return {
    collect: `${origin}/c/${publicId}`,
    wall,
    iframe: `<iframe src="${wall}" title="Testimonials" loading="lazy" style="width:100%;height:600px;border:0"></iframe>`,
    script: `<script src="${origin}/embed.js" data-space="${publicId}" async></script>`,
  };
}
