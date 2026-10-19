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

// From idle or a terminal status only start() moves on; `cancelled` is reachable when an action step cancels.
const FROM_REST = ['playing', 'waiting', 'completed', 'cancelled', 'failed'] as const;

/** Every allowed status change. Anything else is a bug and throws `invalid-state`. */
export const TRANSITIONS: Readonly<Record<SequenceStatus, readonly SequenceStatus[]>> = Object.freeze({
  idle: FROM_REST,
  playing: ['playing', 'waiting', 'paused', 'completed', 'cancelled', 'failed'],
  waiting: ['playing', 'waiting', 'paused', 'completed', 'cancelled', 'failed'],
  paused: ['playing', 'waiting', 'cancelled', 'failed'],
  completed: FROM_REST,
  cancelled: FROM_REST,
  failed: FROM_REST,
});

export function canTransition(from: SequenceStatus, to: SequenceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: SequenceStatus): status is TerminalStatus {
  return status === 'completed' || status === 'cancelled' || status === 'failed';
}
