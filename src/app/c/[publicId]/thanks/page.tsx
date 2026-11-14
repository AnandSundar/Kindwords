import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getSpaceByPublicId } from "@/server/db/repositories/spaces";

type Props = { params: Promise<{ publicId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const space = await getSpaceByPublicId(getDb(), (await params).publicId);
  return { title: space ? `Thank you · ${space.name}` : "Kindwords" };
}

export default async function ThanksPage({ params }: { params: Promise<{ publicId: string }> }) {
  const space = await getSpaceByPublicId(getDb(), (await params).publicId);
  if (!space) notFound();
  return (
    <main className="kw-ui kw-narrow">
      <h1>Thank you!</h1>
      <p>Your testimonial for {space.name} has been received. It will appear once it has been reviewed.</p>
    </main>
  );
}
