// Runs once when the server starts (KTD5): print the setup code while no admin exists.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initSetupCode } = await import("./server/auth/setup-code");
  const { getDb } = await import("./server/db/client");
  await initSetupCode(getDb());
}
