// Test doubles for code that uses tv-audio-flow: a scriptable adapter and a manual clock.
// Nothing here plays sound or uses real timers, so tests are deterministic.
import { AudioFlowError } from '../errors.ts';
import type { AudioAdapter, ClipCallbacks, ClipHandle, Scheduler } from '../types.ts';

/** One clip the MockAdapter was asked to play. Drive it from the test. */
export class MockClip<S> {
  readonly source: S;
  readonly callbacks: ClipCallbacks;
  stopped = false;
  paused = false;
  stopCalls = 0;
  readonly handle: ClipHandle;

  constructor(source: S, callbacks: ClipCallbacks, canPause: boolean) {
    this.source = source;
    this.callbacks = callbacks;
    const base = { stop: () => { this.stopCalls++; this.stopped = true; } };
    this.handle = canPause
      ? { ...base, pause: () => { this.paused = true; }, resume: () => { this.paused = false; } }
      : base;
  }

  /** Simulate the platform's "playing" event. */
  start(): void { this.callbacks.onStarted(); }
  /** Simulate the real end of the audio. Deliberately NOT guarded: tests use it to send late/duplicate events. */
  end(): void { this.callbacks.onEnded(); }
  /** Simulate a failure. */
  fail(error: unknown = new AudioFlowError('decode', `cannot decode ${String(this.source)}`)): void { this.callbacks.onError(error); }
  /** Audible from the adapter's point of view: not stopped, not paused. */
  get audible(): boolean { return !this.stopped && !this.paused; }
}

export interface MockAdapterOptions<S> {
  /** Declared pause capability (default true). */
  pause?: boolean;
  /** Throw this from play() for matching sources, e.g. to simulate an unsupported source. */
  throwOnPlay?: (source: S) => unknown;
}

/** Records every play() call; the test decides when each clip starts, ends or fails. */
export class MockAdapter<S = string> implements AudioAdapter<S> {
  readonly capabilities: { readonly pause: boolean };
  readonly clips: MockClip<S>[] = [];
  private readonly throwOnPlay: ((source: S) => unknown) | undefined;

  constructor(options: MockAdapterOptions<S> = {}) {
    this.capabilities = { pause: options.pause ?? true };
    this.throwOnPlay = options.throwOnPlay;
  }

  play(source: S, callbacks: ClipCallbacks): ClipHandle {
    const err = this.throwOnPlay?.(source);
    if (err !== undefined) throw err;
    const c = new MockClip(source, callbacks, this.capabilities.pause);
    this.clips.push(c);
    return c.handle;
  }

  /** Most recent clip. */
  get last(): MockClip<S> | undefined { return this.clips[this.clips.length - 1]; }
  /** Sources of every clip play() was asked for, in order. */
  get sources(): S[] { return this.clips.map((c) => c.source); }
}

interface ManualTimer { at: number; seq: number; cb: () => void; live: boolean; ms: number }

/** A clock that only moves when the test calls `advance()` / `runAll()`. */
export class ManualScheduler implements Scheduler {
  private time = 0;
  private seq = 0;
  private timers: ManualTimer[] = [];

  now(): number { return this.time; }

  delay(ms: number, cb: () => void): () => void {
    const t: ManualTimer = { at: this.time + ms, seq: this.seq++, cb, live: true, ms };
    this.timers.push(t);
    return () => { t.live = false; };
  }

  /** Timers that are scheduled and not cancelled. */
  get pending(): number { return this.timers.filter((t) => t.live).length; }
  /** Durations of the live timers, in creation order. */
  get pendingDelays(): number[] { return this.timers.filter((t) => t.live).map((t) => t.ms); }

  /** Move the clock forward, firing due timers in time order (timers created meanwhile included). */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.live && t.at <= target).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.time = due.at;
      due.live = false;
      due.cb();
    }
    this.time = target;
    this.timers = this.timers.filter((t) => t.live);
  }

  /** Fire every pending timer (and any they schedule), up to `limit` timers. */
  runAll(limit = 1000): void {
    for (let i = 0; i < limit; i++) {
      const next = this.timers.filter((t) => t.live).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!next) return;
      this.advance(next.at - this.time);
    }
    throw new Error('ManualScheduler.runAll: timer limit reached (infinite loop?)');
  }
}
