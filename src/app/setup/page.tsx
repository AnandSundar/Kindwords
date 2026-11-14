import { notFound } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { getDb } from "@/server/db/client";
import { getAdmin } from "@/server/db/repositories/admin";
import { SetupForm } from "./setup-form";

// R1: setup exists only until the admin does.
export default async function SetupPage() {
  if (await getAdmin(getDb())) notFound();
  return (
    <main>
      <h1>Set up Kindwords</h1>
      <p>Create the admin account. You need the setup code from the container logs.</p>
      <SetupForm minLength={MIN_PASSWORD_LENGTH} />
    </main>
  );
}
