import { requireAdmin } from "@/server/auth/guard";

export default async function AdminHome() {
  // Layouts do not re-run on every navigation, so each admin page checks too (KTD6).
  await requireAdmin();
  return (
    <>
      <h1>Dashboard</h1>
      <p>You have no spaces yet.</p>
    </>
  );
}
