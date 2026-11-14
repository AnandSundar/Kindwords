"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";
import { completeSetup, type SetupState } from "@/server/auth/setup-code";
import { clientIp } from "@/server/client-ip";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db/client";

export async function setup(_previous: SetupState, form: FormData): Promise<SetupState> {
  const config = getConfig();
  const result = await completeSetup(getDb(), clientIp(await headers(), config.trustedProxyCount), {
    code: String(form.get("code") ?? ""),
    password: String(form.get("password") ?? ""),
    confirm: String(form.get("confirm") ?? ""),
  });
  if (!("token" in result)) return result;
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions(config.cookieSecure));
  redirect("/admin");
}
