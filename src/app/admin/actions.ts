"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth/guard";
import { SESSION_COOKIE } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { deleteSession } from "@/server/db/repositories/sessions";

export async function logout(): Promise<void> {
  const session = await requireAdmin();
  await deleteSession(getDb(), session.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?signed-out");
}
