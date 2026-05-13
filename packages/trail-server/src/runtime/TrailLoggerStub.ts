// Temporary stub — replaced by real TrailLogger implementation in P2.
// DO NOT use in production code outside trail-server.
export const TrailLogger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, err?: unknown, ...args: unknown[]) =>
    console.error(`[ERROR] ${msg}`, err, ...args),
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  debugPerf: (_meta: unknown) => { /* noop in stub — enabled via TRAIL_DEBUG_PERF in P2 */ },
};
