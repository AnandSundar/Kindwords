import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/server/auth/guard";
import { logout } from "./actions";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="kw-ui kw-admin">
      <header>
        <nav aria-label="Admin">
          <Link href="/admin">Kindwords admin</Link>{" "}
          <form action={logout} style={{ display: "inline" }}>
            <button type="submit">Log out</button>
          </form>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
