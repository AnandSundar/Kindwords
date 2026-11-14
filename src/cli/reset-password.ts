// R3: `reset-password` inside the container. Reads the new password from the first line of stdin
// (typed at the prompt or piped), replaces the hash and signs out every session.
import { createInterface } from "node:readline/promises";
import { hashPassword, passwordProblem } from "../server/auth/password";
import { parseConfig } from "../server/config";
import { openDb } from "../server/db/client";
import { setAdminPassword } from "../server/db/repositories/admin";
import { deleteAllSessions } from "../server/db/repositories/sessions";

const input = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
if (process.stdin.isTTY) process.stderr.write("New admin password: ");
const lines = input[Symbol.asyncIterator]();
const password = (await lines.next()).value ?? "";
input.close();

const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const db = openDb(parseConfig(process.env).databaseUrl);
try {
  if (!(await setAdminPassword(db, await hashPassword(password)))) {
    console.error("No admin account exists yet. Open /setup with the code from the logs instead.");
    process.exitCode = 1;
  } else {
    await deleteAllSessions(db);
    console.log("Password changed. All sessions are signed out.");
  }
} finally {
  await db.close();
}
