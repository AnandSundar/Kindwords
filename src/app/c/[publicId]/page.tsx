import { notFound } from "next/navigation";
import { getDb } from "@/server/db/client";
import { getSpaceByPublicId } from "@/server/db/repositories/spaces";
import { SubmitForm } from "./submit-form";

export default async function CollectPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const space = await getSpaceByPublicId(getDb(), publicId);
  if (!space) notFound();
  return (
    <main>
      <h1>Share your experience with {space.name}</h1>
      <p>Your words help others decide. It takes about a minute.</p>
      <SubmitForm publicId={space.publicId} />
    </main>
  );
}
