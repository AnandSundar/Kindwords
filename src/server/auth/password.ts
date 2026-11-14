import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// KTD5: N=2^17, r=8, p=1 needs 128 MB, above Node's 32 MB default maxmem.
const LOG_N = 17;
const R = 8;
const P = 1;
const MAXMEM = 256 * 1024 * 1024;
const KEY_LENGTH = 32;

export const MIN_PASSWORD_LENGTH = 8;

/** The one rule a new password must meet (setup and the reset CLI); returns the problem or undefined. */
export function passwordProblem(password: string): string | undefined {
  return password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined;
}

function derive(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, { N: 2 ** logN, r, p, maxmem: MAXMEM }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** Returns `scrypt$logN$r$p$salt$hash` (base64url), so parameters can change without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, LOG_N, R, P);
  return ["scrypt", LOG_N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(logN), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
