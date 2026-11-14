import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/guard";
import { getDb } from "@/server/db/client";
import { getSpace } from "@/server/db/repositories/spaces";
import { listTestimonials, type TestimonialStatus } from "@/server/db/repositories/testimonials";
import { isStatus, STATUSES } from "@/server/testimonials/status";
import { setFeaturedAction, setStatusAction } from "../testimonials/actions";
import { DeleteTestimonialButton } from "../testimonials/form";

const VERB: Record<TestimonialStatus, string> = { pending: "Move to pending", approved: "Approve", rejected: "Reject" };
const FILTERS = [...STATUSES, "all"] as const;
const LABEL: Record<(typeof FILTERS)[number], string> = { pending: "Pending", approved: "Approved", rejected: "Rejected", all: "All" };

/** R10: a space's testimonials by status, newest first, with every moderation action (U7). */
export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; saved?: string }>;
}) {
  await requireAdmin();
  const db = getDb();
  const space = await getSpace(db, (await params).id);
  if (!space) notFound();
  const query = await searchParams;
  const filter = isStatus(query.status) || query.status === "all" ? query.status : "pending";
  const items = await listTestimonials(db, space.id, filter === "all" ? undefined : filter);
  const base = `/admin/spaces/${space.id}`;

  return (
    <>
      <p className="kw-back">
        <Link href={base}>← {space.name}</Link>
      </p>
      <h1>Inbox: {space.name}</h1>
      {query.saved !== undefined && <p role="status">Saved.</p>}
      <nav aria-label="Filter by status" className="kw-filters">
        {FILTERS.map((f) => (
          <span key={f}>
            <Link href={`${base}/inbox?status=${f}`} aria-current={f === filter ? "page" : undefined}>
              {LABEL[f]}
            </Link>{" "}
          </span>
        ))}
        <Link href={`${base}/testimonials/new`} className="kw-add">
          Add a testimonial by hand
        </Link>
      </nav>

      {items.length === 0 ? (
        <p>{filter === "pending" ? "Nothing waiting for review." : `No ${filter === "all" ? "" : `${filter} `}testimonials yet.`}</p>
      ) : (
        <ol className="kw-items">
          {items.map((t) => (
            <li key={t.id}>
              <article aria-labelledby={`t-${t.id}`} data-featured={t.featured ? "" : undefined}>
                <h2 id={`t-${t.id}`}>
                  {t.avatarKey && (
                    // eslint-disable-next-line @next/next/no-img-element -- fixed 256px webp from /media
                    <img src={`/media/${t.avatarKey}`} alt="" width={40} height={40} />
                  )}{" "}
                  {t.name}
                  {t.roleCompany && <small> · {t.roleCompany}</small>}
                </h2>
                <p className="kw-meta">
                  <strong>{LABEL[t.status]}</strong>
                  {t.featured && " · Featured"}
                  {t.rating && ` · ${t.rating} of 5 stars`} · {new Date(t.createdAt).toISOString().slice(0, 10)}
                  {t.email && ` · ${t.email}`}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>{t.text}</p>
                <div className="kw-actions">
                  {STATUSES.filter((s) => s !== t.status).map((s) => (
                    <form key={s} action={setStatusAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value={s} />
                      <input type="hidden" name="filter" value={filter} />
                      <button type="submit" className={s === "approved" ? "kw-primary" : undefined}>
                        {VERB[s]}
                      </button>{" "}
                    </form>
                  ))}
                  {t.status === "approved" && (
                    <form action={setFeaturedAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="featured" value={String(!t.featured)} />
                      <input type="hidden" name="filter" value={filter} />
                      <button type="submit">{t.featured ? "Unfeature" : "Feature"}</button>{" "}
                    </form>
                  )}
                  <Link href={`${base}/testimonials/${t.id}/edit`}>Edit</Link>{" "}
                  <DeleteTestimonialButton id={t.id} name={t.name} filter={filter} />
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
