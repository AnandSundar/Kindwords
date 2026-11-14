const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 5;
/** Failures from all IPs in the window before every attempt is slowed down. */
export const GLOBAL_THRESHOLD = 50;
const DELAY_STEP_MS = 100;
const MAX_DELAY_MS = 5000;

export type Throttle = ReturnType<typeof createThrottle>;

/**
 * KTD5: login and setup share one throttle. 5 failures per IP per 15 minutes are refused; past the
 * global threshold every attempt waits longer but is still checked, so the admin cannot be locked out.
 * shortcut: in memory, so it resets on restart and assumes one process (KTD7); move to the database if
 * multi-instance deploys are ever supported.
 */
export function createThrottle() {
  const perIp = new Map<string, number[]>();
  let all: number[] = [];

  function prune(now: number) {
    all = all.filter((t) => now - t < WINDOW_MS);
    for (const [ip, times] of perIp) {
      const recent = times.filter((t) => now - t < WINDOW_MS);
      if (recent.length) perIp.set(ip, recent);
      else perIp.delete(ip);
    }
  }

  return {
    /** Runs `check` unless `ip` is over its limit; a false result counts as a failure. */
    async attempt(ip: string, check: () => Promise<boolean>): Promise<boolean | "throttled"> {
      const now = Date.now();
      prune(now);
      const mine = perIp.get(ip) ?? [];
      if (mine.length >= MAX_FAILURES_PER_IP) return "throttled";
      const over = all.length - GLOBAL_THRESHOLD;
      // Counted before the check, so parallel attempts from one IP cannot slip past the limit.
      mine.push(now);
      perIp.set(ip, mine);
      all.push(now);
      if (over >= 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min((over + 1) * DELAY_STEP_MS, MAX_DELAY_MS)));
      }
      const ok = await check();
      if (ok) {
        perIp.delete(ip);
        all.splice(all.indexOf(now), 1);
      }
      return ok;
    },
  };
}

const KEY = Symbol.for("kindwords.loginThrottle");
const store = globalThis as typeof globalThis & { [KEY]?: Throttle };

/** The process-wide throttle, on globalThis so the login and setup action bundles share it. */
export const loginThrottle: Throttle = (store[KEY] ??= createThrottle());

export const TOO_MANY_ATTEMPTS = "Too many attempts from your network. Wait 15 minutes and try again.";
