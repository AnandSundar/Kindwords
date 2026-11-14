import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { withTransaction, type Db } from "../db/client";
import { createAdmin, getAdmin } from "../db/repositories/admin";
import { loginThrottle, TOO_MANY_ATTEMPTS, type Throttle } from "./login-throttle";
import { hashPassword, passwordProblem } from "./password";
import { startSession } from "./session";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return bits > 0 ? out + BASE32[(value << (5 - bits)) & 31] : out;
}

/** 160 random bits as 32 base32 characters (R28 needs at least 128). */
export const generateSetupCode = () => base32(randomBytes(20));

// On globalThis because instrumentation and the setup action are separate bundles (KTD5).
const KEY = Symbol.for("kindwords.setupCode");
const store = globalThis as typeof globalThis & { [KEY]?: string };

export function setSetupCode(code: string | undefined): void {
  store[KEY] = code;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison; case and whitespace are ignored so a copied code still works. */
export function setupCodeMatches(input: string): boolean {
  const expected = store[KEY];
  if (!expected) return false;
  return timingSafeEqual(digest(input.replace(/\s+/g, "").toUpperCase()), digest(expected));
}

/** Called once at boot: while no admin exists, generate a code and print it to the logs. */
export async function initSetupCode(db: Db): Promise<void> {
  if (await getAdmin(db)) return;
  const code = generateSetupCode();
  setSetupCode(code);
  console.log(`\nKindwords setup code: ${code}\nOpen /setup in your browser and enter this code to create the admin account.\n`);
}

export type SetupState = {
  error?: string;
  fieldErrors?: { code?: string; password?: string; confirm?: string };
};

export const SETUP_DONE = "Setup is already complete. Sign in instead.";

export async function completeSetup(
  db: Db,
  ip: string,
  input: { code: string; password: string; confirm: string },
  throttle: Throttle = loginThrottle,
): Promise<{ token: string } | SetupState> {
  if (await getAdmin(db)) return { error: SETUP_DONE };
  const problem = passwordProblem(input.password);
  if (problem) return { fieldErrors: { password: problem } };
  if (input.password !== input.confirm) return { fieldErrors: { confirm: "The passwords do not match." } };

  const ok = await throttle.attempt(ip, async () => setupCodeMatches(input.code));
  if (ok === "throttled") return { error: TOO_MANY_ATTEMPTS };
  if (!ok) return { fieldErrors: { code: "That setup code is not correct. Copy it from the container logs." } };

  const passwordHash = await hashPassword(input.password);
  try {
    // createAdmin fails on the one-admin constraint, so concurrent submissions yield exactly one admin.
    const token = await withTransaction(db, async (tx) => {
      await createAdmin(tx, passwordHash);
      return startSession(tx);
    });
    setSetupCode(undefined);
    return { token };
  } catch (error) {
    if (await getAdmin(db)) return { error: SETUP_DONE };
    throw error;
  }
}
