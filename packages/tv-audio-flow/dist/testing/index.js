// Test doubles for code that uses tv-audio-flow: a scriptable adapter and a manual clock.
// Nothing here plays sound or uses real timers, so tests are deterministic.
import { AudioFlowError } from "../errors.js";
/** One clip the MockAdapter was asked to play. Drive it from the test. */
export class MockClip {
    constructor(source, callbacks, canPause) {
        this.stopped = false;
        this.paused = false;
        this.stopCalls = 0;
        this.source = source;
        this.callbacks = callbacks;
        const base = { stop: () => { this.stopCalls++; this.stopped = true; } };
        this.handle = canPause
            ? { ...base, pause: () => { this.paused = true; }, resume: () => { this.paused = false; } }
            : base;
    }
    /** Simulate the platform's "playing" event. */
    start() { this.callbacks.onStarted(); }
    /** Simulate the real end of the audio. Deliberately NOT guarded: tests use it to send late/duplicate events. */
    end() { this.callbacks.onEnded(); }
    /** Simulate a failure. */
    fail(error = new AudioFlowError('decode', `cannot decode ${String(this.source)}`)) { this.callbacks.onError(error); }
    /** Audible from the adapter's point of view: not stopped, not paused. */
    get audible() { return !this.stopped && !this.paused; }
}
/** Records every play() call; the test decides when each clip starts, ends or fails. */
export class MockAdapter {
    constructor(options = {}) {
        this.clips = [];
        this.capabilities = { pause: options.pause ?? true };
        this.throwOnPlay = options.throwOnPlay;
    }
    play(source, callbacks) {
        const err = this.throwOnPlay?.(source);
        if (err !== undefined)
            throw err;
        const c = new MockClip(source, callbacks, this.capabilities.pause);
        this.clips.push(c);
        return c.handle;
    }
    /** Most recent clip. */
    get last() { return this.clips[this.clips.length - 1]; }
    /** Sources of every clip play() was asked for, in order. */
    get sources() { return this.clips.map((c) => c.source); }
}
/** A clock that only moves when the test calls `advance()` / `runAll()`. */
export class ManualScheduler {
    constructor() {
        this.time = 0;
        this.seq = 0;
        this.timers = [];
    }
    now() { return this.time; }
    delay(ms, cb) {
        const t = { at: this.time + ms, seq: this.seq++, cb, live: true, ms };
        this.timers.push(t);
        return () => { t.live = false; };
    }
    /** Timers that are scheduled and not cancelled. */
    get pending() { return this.timers.filter((t) => t.live).length; }
    /** Durations of the live timers, in creation order. */
    get pendingDelays() { return this.timers.filter((t) => t.live).map((t) => t.ms); }
    /** Move the clock forward, firing due timers in time order (timers created meanwhile included). */
    advance(ms) {
        const target = this.time + ms;
        for (;;) {
            const due = this.timers.filter((t) => t.live && t.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
            if (!due)
                break;
            this.time = due.at;
            due.live = false;
            due.cb();
        }
        this.time = target;
        this.timers = this.timers.filter((t) => t.live);
    }
    /** Fire every pending timer (and any they schedule), up to `limit` timers. */
    runAll(limit = 1000) {
        for (let i = 0; i < limit; i++) {
            const next = this.timers.filter((t) => t.live).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
            if (!next)
                return;
            this.advance(next.at - this.time);
        }
        throw new Error('ManualScheduler.runAll: timer limit reached (infinite loop?)');
    }
}
//# sourceMappingURL=index.js.map