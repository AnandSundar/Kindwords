import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/guard";
import { getDb } from "@/server/db/client";
import { getSpace } from "@/server/db/repositories/spaces";
import { TestimonialForm } from "../form";

/** R13: add a testimonial by hand, e.g. one received by email. The admin attests to consent. */
export default async function NewTestimonialPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const space = await getSpace(getDb(), (await params).id);
  if (!space) notFound();

  return (
    <>
      <p className="kw-back">
        <Link href={`/admin/spaces/${space.id}/inbox`}>← Inbox</Link>
      </p>
      <h1>Add a testimonial to {space.name}</h1>
      <p>Only add words the person agreed you may publish.</p>
      <TestimonialForm mode="new" spaceId={space.id} />
    </>
  );
}
