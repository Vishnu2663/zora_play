/**
 * Status model of an {@link AudioSequence}.
 *
 * - `idle`      created, never started
 * - `playing`   a clip step is active (loading or audible)
 * - `waiting`   a delay step is counting down
 * - `paused`    a clip or delay is frozen; `resume()` returns to `playing` / `waiting`
 * - `completed` every step finished                                     (terminal)
 * - `cancelled` `cancel()` was called, or a clip was interrupted from outside (terminal)
 * - `failed`    a step failed; see `sequence.error`                      (terminal)
 *
 * Terminal states can be left only by calling `start()` again (the sequence is reusable).
 */
export type SequenceStatus = 'idle' | 'playing' | 'waiting' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type TerminalStatus = 'completed' | 'cancelled' | 'failed';
/** Every allowed status change. Anything else is a bug and throws `invalid-state`. */
export declare const TRANSITIONS: Readonly<Record<SequenceStatus, readonly SequenceStatus[]>>;
export declare function canTransition(from: SequenceStatus, to: SequenceStatus): boolean;
export declare function isTerminal(status: SequenceStatus): status is TerminalStatus;
//# sourceMappingURL=state.d.ts.map