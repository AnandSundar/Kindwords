import Link from "next/link";
import { requireAdmin } from "@/server/auth/guard";
import { getDb } from "@/server/db/client";
import { listSpaces } from "@/server/db/repositories/spaces";
import { CreateSpaceForm } from "./spaces/forms";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  // Layouts do not re-run on every navigation, so each admin page checks too (KTD6).
  await requireAdmin();
  const spaces = await listSpaces(getDb());
  const deleted = (await searchParams).deleted !== undefined;
  return (
    <>
      <h1>Dashboard</h1>
      {deleted && <p role="status">The space was deleted.</p>}
      {spaces.length === 0 ? (
        <p>You have no spaces yet. Create one for each product you collect testimonials for.</p>
      ) : (
        <section aria-labelledby="spaces-heading">
          <h2 id="spaces-heading">Spaces</h2>
          <ul className="kw-list">
            {spaces.map((space) => (
              <li key={space.id}>
                <Link href={`/admin/spaces/${space.id}`}>{space.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="create-heading">
        <h2 id="create-heading">{spaces.length === 0 ? "Create your first space" : "New space"}</h2>
        <CreateSpaceForm />
      </section>
    </>
  );
}
