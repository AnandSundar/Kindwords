import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getSpaceByPublicId } from "@/server/db/repositories/spaces";

export default async function ThanksPage({ params }: { params: Promise<{ publicId: string }> }) {
  const space = await getSpaceByPublicId(getDb(), (await params).publicId);
  if (!space) notFound();
  return (
    <main>
      <h1>Thank you!</h1>
      <p>Your testimonial for {space.name} has been received. It will appear once it has been reviewed.</p>
    </main>
  );
}
