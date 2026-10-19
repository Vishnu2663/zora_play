import type { Scheduler } from './types.ts';

/** setTimeout-based scheduler with a monotonic clock where available. */
export function defaultScheduler(): Scheduler {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return {
    delay(ms, cb) {
      const h = setTimeout(cb, ms);
      return () => clearTimeout(h);
    },
    now: perf && typeof perf.now === 'function' ? () => perf.now() : () => Date.now(),
  };
}
