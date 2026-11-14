import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/guard";
import { getDb } from "@/server/db/client";
import { getTestimonial } from "@/server/db/repositories/testimonials";
import { TestimonialForm } from "../../form";

/** R11: edit the displayed fields; the submitted text stays as it was and shows here when it differs (AE4). */
export default async function EditTestimonialPage({ params }: { params: Promise<{ id: string; tid: string }> }) {
  await requireAdmin();
  const { id, tid } = await params;
  const t = await getTestimonial(getDb(), tid);
  if (!t || t.spaceId !== id) notFound();

  return (
    <>
      <p className="kw-back">
        <Link href={`/admin/spaces/${id}/inbox?status=${t.status}`}>← Inbox</Link>
      </p>
      <h1>Edit testimonial from {t.name}</h1>
      {t.originalText !== null && t.originalText !== t.text && (
        <section aria-labelledby="original-heading">
          <h2 id="original-heading">Original</h2>
          <p>As submitted. Only you can see this; the public sees the edited text with no &ldquo;edited&rdquo; label.</p>
          <blockquote style={{ whiteSpace: "pre-wrap" }}>{t.originalText}</blockquote>
        </section>
      )}
      <TestimonialForm mode="edit" testimonial={t} />
    </>
  );
}
