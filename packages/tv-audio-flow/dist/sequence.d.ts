import { AudioFlowError } from './errors.ts';
import { type SequenceStatus } from './state.ts';
import type { AudioAdapter, Scheduler, SequenceEventName, SequenceEvents, SequenceResult, Step } from './types.ts';
export interface SequenceOptions {
    /** Timers and clock. Defaults to setTimeout + performance.now / Date.now. */
    scheduler?: Scheduler;
    /** Name used in error messages and by AudioChannel diagnostics. */
    name?: string;
    /** Called when one of your event listeners throws. Defaults to console.error. */
    onListenerError?: (error: unknown, event: SequenceEventName) => void;
}
type Listener<S, K extends SequenceEventName> = (payload: SequenceEvents<S>[K]) => void;
/**
 * Plays a fixed list of clip / delay / action steps strictly in order.
 *
 * - A step starts only after the previous one REALLY finished (adapter `onEnded`, timer fired).
 * - `cancel()` stops the current clip, clears the timer and guarantees no later step ever starts.
 * - Every async callback is tied to the run and clip it belongs to; stale or duplicate callbacks are ignored.
 * - `start()` never rejects: it resolves with the terminal {@link SequenceResult}.
 * - The sequence is reusable: `start()` again after it ended. `dispose()` makes it unusable.
 */
export declare class AudioSequence<S = string> {
    readonly name: string;
    readonly steps: readonly Step<S>[];
    private readonly adapter;
    private readonly scheduler;
    private readonly onListenerError;
    private _status;
    private _index;
    private _error;
    private active;
    private disposed;
    /** Bumped on every start and every terminal transition; callbacks from older runs are ignored. */
    private run;
    private clip;
    private delay;
    private pausedFrom;
    private settle;
    private readonly listeners;
    constructor(adapter: AudioAdapter<S>, steps: readonly Step<S>[], options?: SequenceOptions);
    get status(): SequenceStatus;
    /** Index of the current (or last reached) step, -1 before the first. */
    get stepIndex(): number;
    get currentStep(): Step<S> | null;
    /** The error of the last run, if it failed or was cancelled. */
    get error(): AudioFlowError | null;
    /** True from `start()` until the run reaches a terminal status. */
    get isActive(): boolean;
    /** Whether `pause()` can work: the adapter declared `capabilities.pause`. */
    get canPause(): boolean;
    get isDisposed(): boolean;
    on<K extends SequenceEventName>(event: K, listener: Listener<S, K>): () => void;
    /** Number of registered listeners (all events, or one). Useful to verify cleanup. */
    listenerCount(event?: SequenceEventName): number;
    private emit;
    /**
     * Run the steps from the first one. Resolves (never rejects) when the run ends.
     * Throws `invalid-state` if the sequence is already active or was disposed.
     */
    start(): Promise<SequenceResult>;
    /**
     * Stop everything: current clip, pending delay, every later step. Safe at any time.
     * Returns true if a running sequence was cancelled, false if there was nothing to cancel.
     */
    cancel(reason?: string): boolean;
    /**
     * Freeze the current clip or delay. Only possible when `canPause` and while `playing` / `waiting`.
     * Returns false (and changes nothing) otherwise.
     */
    pause(): boolean;
    /** Continue after `pause()`. Returns false (and changes nothing) unless the sequence is paused. */
    resume(): boolean;
    /** Cancel and drop every listener. The sequence cannot be started again. */
    dispose(): void;
    private setStatus;
    private event;
    /** Run steps from `i` until one needs to wait for something. */
    private advance;
    private startDelay;
    private armDelay;
    private startClip;
    private clipEnded;
    private fail;
    /** Single exit point of a run: release everything, then report. */
    private end;
}
export {};
//# sourceMappingURL=sequence.d.ts.map