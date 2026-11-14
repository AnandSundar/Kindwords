import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/guard";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { getSpace } from "@/server/db/repositories/spaces";
import { listTestimonials } from "@/server/db/repositories/testimonials";
import { spaceSnippets } from "@/server/spaces";
import { DeleteSpaceForm, RenameSpaceForm } from "../forms";

export default async function SpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ renamed?: string }>;
}) {
  await requireAdmin();
  const space = await getSpace(getDb(), (await params).id);
  if (!space) notFound();
  const pending = (await listTestimonials(getDb(), space.id, "pending")).length;
  const renamed = (await searchParams).renamed !== undefined;

  // KTD13: PUBLIC_URL, else the origin this request came in on.
  const h = await headers();
  const origin = getConfig().publicUrl ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const s = spaceSnippets(origin, space.publicId);

  return (
    <>
      <p>
        <Link href="/admin">← All spaces</Link>
      </p>
      <h1>{space.name}</h1>
      {renamed && <p role="status">The space was renamed.</p>}

      <p>
        <Link href={`/admin/spaces/${space.id}/inbox`}>Inbox ({pending} pending)</Link> ·{" "}
        <Link href={`/admin/spaces/${space.id}/testimonials/new`}>Add a testimonial by hand</Link>
      </p>

      <section aria-labelledby="share-heading">
        <h2 id="share-heading">Share and embed</h2>
        <dl>
          <dt>Collection link (send this to customers)</dt>
          <dd>
            <a href={s.collect}>{s.collect}</a>
          </dd>
          <dt>Wall page</dt>
          <dd>
            <a href={s.wall}>{s.wall}</a>
          </dd>
        </dl>
        <p>
          <label htmlFor="script-snippet">Script tag (recommended)</label>
          <br />
          <textarea id="script-snippet" readOnly rows={2} cols={80} value={s.script} />
        </p>
        <p>
          <label htmlFor="iframe-snippet">Iframe (for sites that block scripts)</label>
          <br />
          <textarea id="iframe-snippet" readOnly rows={3} cols={80} value={s.iframe} />
        </p>
      </section>

      <section aria-labelledby="rename-heading">
        <h2 id="rename-heading">Rename</h2>
        <p>Renaming keeps every link and embed working.</p>
        <RenameSpaceForm spaceId={space.id} name={space.name} />
      </section>

      <section aria-labelledby="delete-heading">
        <h2 id="delete-heading">Delete space</h2>
        <DeleteSpaceForm spaceId={space.id} name={space.name} />
      </section>
    </>
  );
}
