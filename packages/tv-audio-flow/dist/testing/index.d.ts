import type { AudioAdapter, ClipCallbacks, ClipHandle, Scheduler } from '../types.ts';
/** One clip the MockAdapter was asked to play. Drive it from the test. */
export declare class MockClip<S> {
    readonly source: S;
    readonly callbacks: ClipCallbacks;
    stopped: boolean;
    paused: boolean;
    stopCalls: number;
    readonly handle: ClipHandle;
    constructor(source: S, callbacks: ClipCallbacks, canPause: boolean);
    /** Simulate the platform's "playing" event. */
    start(): void;
    /** Simulate the real end of the audio. Deliberately NOT guarded: tests use it to send late/duplicate events. */
    end(): void;
    /** Simulate a failure. */
    fail(error?: unknown): void;
    /** Audible from the adapter's point of view: not stopped, not paused. */
    get audible(): boolean;
}
export interface MockAdapterOptions<S> {
    /** Declared pause capability (default true). */
    pause?: boolean;
    /** Throw this from play() for matching sources, e.g. to simulate an unsupported source. */
    throwOnPlay?: (source: S) => unknown;
}
/** Records every play() call; the test decides when each clip starts, ends or fails. */
export declare class MockAdapter<S = string> implements AudioAdapter<S> {
    readonly capabilities: {
        readonly pause: boolean;
    };
    readonly clips: MockClip<S>[];
    private readonly throwOnPlay;
    constructor(options?: MockAdapterOptions<S>);
    play(source: S, callbacks: ClipCallbacks): ClipHandle;
    /** Most recent clip. */
    get last(): MockClip<S> | undefined;
    /** Sources of every clip play() was asked for, in order. */
    get sources(): S[];
}
/** A clock that only moves when the test calls `advance()` / `runAll()`. */
export declare class ManualScheduler implements Scheduler {
    private time;
    private seq;
    private timers;
    now(): number;
    delay(ms: number, cb: () => void): () => void;
    /** Timers that are scheduled and not cancelled. */
    get pending(): number;
    /** Durations of the live timers, in creation order. */
    get pendingDelays(): number[];
    /** Move the clock forward, firing due timers in time order (timers created meanwhile included). */
    advance(ms: number): void;
    /** Fire every pending timer (and any they schedule), up to `limit` timers. */
    runAll(limit?: number): void;
}
//# sourceMappingURL=index.d.ts.map