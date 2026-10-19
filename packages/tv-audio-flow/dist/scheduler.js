/** setTimeout-based scheduler with a monotonic clock where available. */
export function defaultScheduler() {
    const perf = globalThis.performance;
    return {
        delay(ms, cb) {
            const h = setTimeout(cb, ms);
            return () => clearTimeout(h);
        },
        now: perf && typeof perf.now === 'function' ? () => perf.now() : () => Date.now(),
    };
}
//# sourceMappingURL=scheduler.js.map