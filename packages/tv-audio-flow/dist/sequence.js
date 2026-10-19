import { AudioFlowError, toAudioFlowError } from "./errors.js";
import { canTransition } from "./state.js";
import { defaultScheduler } from "./scheduler.js";
function validate(steps) {
    steps.forEach((step, i) => {
        const bad = (why) => new AudioFlowError('invalid-step', `step ${i}: ${why}`, { stepIndex: i, label: step?.label });
        if (!step || typeof step !== 'object')
            throw bad('not a step object');
        if (step.kind === 'delay') {
            if (typeof step.ms !== 'number' || !Number.isFinite(step.ms) || step.ms < 0)
                throw bad(`delay ms must be a finite number >= 0 (got ${String(step.ms)})`);
        }
        else if (step.kind === 'clip') {
            if (step.source === undefined || step.source === null)
                throw bad('clip has no source');
        }
        else if (step.kind === 'action') {
            if (typeof step.run !== 'function')
                throw bad('action has no run() function');
        }
        else {
            throw bad(`unknown kind "${String(step.kind)}"`);
        }
    });
}
/**
 * Plays a fixed list of clip / delay / action steps strictly in order.
 *
 * - A step starts only after the previous one REALLY finished (adapter `onEnded`, timer fired).
 * - `cancel()` stops the current clip, clears the timer and guarantees no later step ever starts.
 * - Every async callback is tied to the run and clip it belongs to; stale or duplicate callbacks are ignored.
 * - `start()` never rejects: it resolves with the terminal {@link SequenceResult}.
 * - The sequence is reusable: `start()` again after it ended. `dispose()` makes it unusable.
 */
export class AudioSequence {
    constructor(adapter, steps, options = {}) {
        this._status = 'idle';
        this._index = -1;
        this._error = null;
        this.active = false;
        this.disposed = false;
        /** Bumped on every start and every terminal transition; callbacks from older runs are ignored. */
        this.run = 0;
        this.clip = null;
        this.delay = null;
        this.pausedFrom = null;
        this.settle = null;
        this.listeners = new Map();
        if (!adapter || typeof adapter.play !== 'function')
            throw new AudioFlowError('invalid-state', 'AudioSequence needs an adapter with play()');
        validate(steps);
        this.adapter = adapter;
        this.steps = Object.freeze([...steps]);
        this.scheduler = options.scheduler ?? defaultScheduler();
        this.name = options.name ?? 'sequence';
        this.onListenerError = options.onListenerError ?? ((e, ev) => { console.error(`[tv-audio-flow] ${this.name}: "${ev}" listener threw`, e); });
    }
    /* ---------------------------------------------------------------- queries */
    get status() { return this._status; }
    /** Index of the current (or last reached) step, -1 before the first. */
    get stepIndex() { return this._index; }
    get currentStep() { return this._index >= 0 && this._index < this.steps.length ? this.steps[this._index] : null; }
    /** The error of the last run, if it failed or was cancelled. */
    get error() { return this._error; }
    /** True from `start()` until the run reaches a terminal status. */
    get isActive() { return this.active; }
    /** Whether `pause()` can work: the adapter declared `capabilities.pause`. */
    get canPause() { return this.adapter.capabilities?.pause === true; }
    get isDisposed() { return this.disposed; }
    /* ----------------------------------------------------------------- events */
    on(event, listener) {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(listener);
        return () => { this.listeners.get(event)?.delete(listener); };
    }
    /** Number of registered listeners (all events, or one). Useful to verify cleanup. */
    listenerCount(event) {
        if (event)
            return this.listeners.get(event)?.size ?? 0;
        let n = 0;
        for (const s of this.listeners.values())
            n += s.size;
        return n;
    }
    emit(event, payload) {
        const set = this.listeners.get(event);
        if (!set || set.size === 0)
            return;
        for (const l of [...set]) {
            try {
                l(payload);
            }
            catch (e) {
                this.onListenerError(e, event);
            }
        }
    }
    /* --------------------------------------------------------------- commands */
    /**
     * Run the steps from the first one. Resolves (never rejects) when the run ends.
     * Throws `invalid-state` if the sequence is already active or was disposed.
     */
    start() {
        if (this.disposed)
            throw new AudioFlowError('invalid-state', `${this.name}: start() after dispose()`);
        if (this.active)
            throw new AudioFlowError('invalid-state', `${this.name}: start() while ${this._status}; cancel() first or use an AudioChannel`);
        const run = ++this.run;
        this.active = true;
        this._error = null;
        this._index = -1;
        this.pausedFrom = null;
        const done = new Promise((resolve) => { this.settle = resolve; });
        this.advance(run, 0);
        return done;
    }
    /**
     * Stop everything: current clip, pending delay, every later step. Safe at any time.
     * Returns true if a running sequence was cancelled, false if there was nothing to cancel.
     */
    cancel(reason = 'cancelled') {
        if (!this.active)
            return false;
        this.end(this.run, 'cancelled', new AudioFlowError('cancelled', `${this.name}: ${reason}`, { stepIndex: this._index, label: this.currentStep?.label }));
        return true;
    }
    /**
     * Freeze the current clip or delay. Only possible when `canPause` and while `playing` / `waiting`.
     * Returns false (and changes nothing) otherwise.
     */
    pause() {
        if (!this.canPause || !this.active)
            return false;
        const from = this._status;
        if (from !== 'playing' && from !== 'waiting')
            return false;
        const run = this.run;
        if (from === 'waiting' && this.delay) {
            const d = this.delay;
            d.cancel?.();
            d.cancel = null;
            d.remaining = Math.max(0, d.remaining - (this.scheduler.now() - d.startedAt));
        }
        else if (from === 'playing' && this.clip?.handle) {
            try {
                this.clip.handle.pause?.();
            }
            catch (e) {
                this.fail(run, e);
                return false;
            }
        }
        this.pausedFrom = from;
        this.setStatus('paused');
        return true;
    }
    /** Continue after `pause()`. Returns false (and changes nothing) unless the sequence is paused. */
    resume() {
        if (this._status !== 'paused' || !this.active || !this.pausedFrom)
            return false;
        const run = this.run;
        const to = this.pausedFrom;
        this.pausedFrom = null;
        this.setStatus(to);
        if (to === 'waiting' && this.delay)
            this.armDelay(run, this.delay, this._index);
        else if (to === 'playing' && this.clip) {
            const c = this.clip;
            if (c.endedWhilePaused) {
                this.clipEnded(run, c, this._index);
                return true;
            }
            try {
                c.handle?.resume?.();
            }
            catch (e) {
                this.fail(run, e);
            }
        }
        return true;
    }
    /** Cancel and drop every listener. The sequence cannot be started again. */
    dispose() {
        this.cancel('disposed');
        this.listeners.clear();
        this.disposed = true;
    }
    /* --------------------------------------------------------------- internals */
    setStatus(next) {
        const prev = this._status;
        if (prev === next)
            return;
        if (!canTransition(prev, next))
            throw new AudioFlowError('invalid-state', `${this.name}: illegal transition ${prev} -> ${next}`);
        this._status = next;
        this.emit('state', { status: next, previous: prev });
    }
    event(index) { return { index, step: this.steps[index] }; }
    /** Run steps from `i` until one needs to wait for something. */
    advance(run, i) {
        for (;;) {
            if (run !== this.run)
                return;
            if (i >= this.steps.length) {
                this.end(run, 'completed');
                return;
            }
            const step = this.steps[i];
            this._index = i;
            if (step.kind === 'action') {
                this.emit('step', this.event(i));
                if (run !== this.run)
                    return;
                try {
                    step.run();
                }
                catch (e) {
                    this.fail(run, e);
                    return;
                }
                if (run !== this.run)
                    return;
                this.emit('stepend', this.event(i));
                i++;
                continue;
            }
            this.setStatus(step.kind === 'clip' ? 'playing' : 'waiting');
            this.emit('step', this.event(i));
            if (run !== this.run)
                return; // a listener cancelled
            if (step.kind === 'delay')
                this.startDelay(run, i, step.ms);
            else
                this.startClip(run, i, step);
            return;
        }
    }
    startDelay(run, i, ms) {
        const d = { run, remaining: ms, startedAt: 0, cancel: null };
        this.delay = d;
        this.armDelay(run, d, i);
    }
    armDelay(run, d, i) {
        d.startedAt = this.scheduler.now();
        d.cancel = this.scheduler.delay(d.remaining, () => {
            if (run !== this.run || this.delay !== d || this._status !== 'waiting')
                return; // stale / paused
            this.delay = null;
            this.emit('stepend', this.event(i));
            this.advance(run, i + 1);
        });
    }
    startClip(run, i, step) {
        const c = { run, handle: null, done: false, started: false, endedWhilePaused: false };
        this.clip = c;
        const live = () => run === this.run && this.clip === c && !c.done;
        let handle;
        try {
            handle = this.adapter.play(step.source, {
                onStarted: () => { if (live() && !c.started) {
                    c.started = true;
                    this.emit('clipstart', this.event(i));
                } },
                onEnded: () => {
                    if (!live())
                        return;
                    if (this._status === 'paused') {
                        c.endedWhilePaused = true;
                        return;
                    }
                    this.clipEnded(run, c, i);
                },
                onError: (err) => {
                    if (!live())
                        return;
                    const e = toAudioFlowError(err, i, step.label);
                    if (e.code === 'cancelled')
                        this.end(run, 'cancelled', e);
                    else
                        this.fail(run, e);
                },
            });
        }
        catch (e) {
            this.fail(run, e);
            return;
        }
        // The clip may already have ended/failed synchronously, or the run may have moved on.
        if (c.done || run !== this.run || this.clip !== c) {
            safeStop(handle);
            return;
        }
        c.handle = handle;
    }
    clipEnded(run, c, i) {
        c.done = true;
        this.clip = null;
        this.emit('stepend', this.event(i));
        this.advance(run, i + 1);
    }
    fail(run, err) {
        if (run !== this.run)
            return;
        this.end(run, 'failed', toAudioFlowError(err, this._index, this.currentStep?.label));
    }
    /** Single exit point of a run: release everything, then report. */
    end(run, status, error) {
        if (run !== this.run || !this.active)
            return;
        this.run++;
        this.active = false;
        this.pausedFrom = null;
        const c = this.clip;
        this.clip = null;
        if (c) {
            c.done = true;
            safeStop(c.handle);
        }
        const d = this.delay;
        this.delay = null;
        d?.cancel?.();
        this._error = error ?? null;
        this.setStatus(status);
        if (status === 'failed' && error)
            this.emit('error', error);
        const result = error ? { status, error, stepIndex: this._index } : { status, stepIndex: this._index };
        const settle = this.settle;
        this.settle = null;
        settle?.(result);
        this.emit('end', result);
    }
}
function safeStop(handle) {
    if (!handle)
        return;
    try {
        handle.stop();
    }
    catch { /* adapter already torn down */ }
}
//# sourceMappingURL=sequence.js.map