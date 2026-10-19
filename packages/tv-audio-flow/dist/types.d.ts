import type { AudioFlowError } from './errors.ts';
import type { SequenceStatus, TerminalStatus } from './state.ts';
/** Play one clip. `source` is whatever your adapter understands (a URL, an id, an object...). */
export interface ClipStep<S> {
    readonly kind: 'clip';
    readonly source: S;
    readonly label?: string;
}
/** Wait `ms` milliseconds. Starts only after the previous step really finished. */
export interface DelayStep {
    readonly kind: 'delay';
    readonly ms: number;
    readonly label?: string;
}
/**
 * Run a synchronous callback in order (show answer buttons, update a UI index...).
 * It runs only if the sequence is still active when it is reached.
 */
export interface ActionStep {
    readonly kind: 'action';
    readonly run: () => void;
    readonly label?: string;
}
export type Step<S> = ClipStep<S> | DelayStep | ActionStep;
/**
 * Callbacks an adapter uses to report on ONE clip. The engine ignores every call after the first
 * terminal one (`onEnded` / `onError`) and every call that arrives after the clip was stopped,
 * so adapters do not need to de-duplicate platform events themselves.
 */
export interface ClipCallbacks {
    /** Audio actually started (optional, informational). */
    onStarted(): void;
    /** The clip really finished. This is the only signal that advances the sequence. */
    onEnded(): void;
    /**
     * The clip cannot play. Pass an AudioFlowError for a precise code; anything else becomes `adapter`.
     * An AudioFlowError with code `cancelled` means "interrupted from outside": the sequence ends
     * `cancelled` instead of `failed`.
     */
    onError(error: unknown): void;
}
/** Control of one playing clip, returned by {@link AudioAdapter.play}. */
export interface ClipHandle {
    /** Stop now and release resources/listeners. Must be safe to call more than once. */
    stop(): void;
    /** Required when the adapter declares `capabilities.pause`. */
    pause?(): void;
    /** Required when the adapter declares `capabilities.pause`. */
    resume?(): void;
}
export interface AdapterCapabilities {
    /** The adapter can pause and resume a clip in place. */
    readonly pause: boolean;
}
/** Platform bridge. The core never touches audio APIs directly. */
export interface AudioAdapter<S> {
    readonly capabilities: AdapterCapabilities;
    /**
     * Start playing `source` and report its outcome through `callbacks`. May throw synchronously
     * (reported as a step failure). May call the callbacks synchronously.
     */
    play(source: S, callbacks: ClipCallbacks): ClipHandle;
}
/** Injectable clock, so tests are deterministic and hosts can use their own timers. */
export interface Scheduler {
    /** Call `cb` once after `ms`. Returns a canceller that must prevent the call. */
    delay(ms: number, cb: () => void): () => void;
    /** Monotonic milliseconds; used to keep the remaining time of a paused delay. */
    now(): number;
}
export interface SequenceResult {
    readonly status: TerminalStatus;
    /** Set for `failed` and `cancelled`. */
    readonly error?: AudioFlowError;
    /** Index of the last step reached (-1 if none). */
    readonly stepIndex: number;
}
export interface StepEvent<S> {
    readonly index: number;
    readonly step: Step<S>;
}
export interface SequenceEvents<S> {
    /** Every status change. */
    state: {
        status: SequenceStatus;
        previous: SequenceStatus;
    };
    /** A step begins (clip about to play, delay about to wait, action about to run). */
    step: StepEvent<S>;
    /** A step finished normally. */
    stepend: StepEvent<S>;
    /** The adapter reported that a clip's audio really started. */
    clipstart: StepEvent<S>;
    /** The sequence failed. */
    error: AudioFlowError;
    /** The run reached a terminal status. */
    end: SequenceResult;
}
export type SequenceEventName = keyof SequenceEvents<unknown>;
//# sourceMappingURL=types.d.ts.map