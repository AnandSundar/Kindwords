import { redirect } from "next/navigation";
import { getAdminSession } from "@/server/auth/guard";
import { getDb } from "@/server/db/client";
import { getAdmin } from "@/server/db/repositories/admin";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ "signed-out"?: string }> }) {
  if (!(await getAdmin(getDb()))) redirect("/setup");
  if (await getAdminSession()) redirect("/admin");
  const signedOut = (await searchParams)["signed-out"] !== undefined;
  return (
    <main className="kw-ui kw-narrow">
      <h1>Sign in to Kindwords</h1>
      {signedOut && <p role="status">You have signed out.</p>}
      <LoginForm />
      <p>
        <small>Forgot the password? Run the reset-password command inside the container.</small>
      </p>
    </main>
  );
}
