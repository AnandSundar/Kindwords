const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX = 5;
const SPACE_WINDOW_MS = 60 * 60 * 1000;
const SPACE_MAX = 50;

/**
 * KTD7: public submissions are limited to 5 per IP per space per 10 minutes, and 50 per space per hour
 * as a backstop. A slot is taken before the body is read, so parallel requests cannot slip past.
 * shortcut: in memory, so it resets on restart and assumes one process; move to the database if
 * multi-instance deploys are ever supported.
 */
export function createSubmitLimiter() {
  const hits = new Map<string, number[]>();

  return {
    /** Takes a slot for `ip` in `spaceId`, or returns undefined when either limit is reached. */
    take(ip: string, spaceId: string, now = Date.now()): { refund(): void } | undefined {
      for (const [key, times] of hits) {
        const recent = times.filter((t) => now - t < SPACE_WINDOW_MS);
        if (recent.length) hits.set(key, recent);
        else hits.delete(key);
      }
      const ipKey = `${spaceId} ${ip}`;
      const mine = hits.get(ipKey) ?? [];
      const space = hits.get(spaceId) ?? [];
      if (mine.filter((t) => now - t < IP_WINDOW_MS).length >= IP_MAX || space.length >= SPACE_MAX) return undefined;
      hits.set(ipKey, [...mine, now]);
      hits.set(spaceId, [...space, now]);
      const drop = (key: string) => {
        const times = hits.get(key);
        times?.splice(times.indexOf(now), 1);
      };
      return {
        refund() {
          drop(ipKey);
          drop(spaceId);
        },
      };
    },
  };
}

export type SubmitLimiter = ReturnType<typeof createSubmitLimiter>;

/** The process-wide limiter used by the submit route. */
export const submitLimiter: SubmitLimiter = createSubmitLimiter();
