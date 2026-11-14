import { randomBytes } from "node:crypto";

/** 128 random bits, base64url: used for internal and public IDs, never derived from user input. */
export function newId(): string {
  return randomBytes(16).toString("base64url");
}
