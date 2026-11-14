"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { attemptLogin, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { clientIp } from "@/server/client-ip";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db/client";

export type LoginState = { error?: string };

export async function login(_previous: LoginState, form: FormData): Promise<LoginState> {
  const config = getConfig();
  const ip = clientIp(await headers(), config.trustedProxyCount);
  const result = await attemptLogin(getDb(), ip, String(form.get("password") ?? ""));
  if ("error" in result) return result;
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions(config.cookieSecure));
  redirect("/admin");
}
