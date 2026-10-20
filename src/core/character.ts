// Character state machine. Pure and clock-injected so it is fully testable.
// Guarantees: every state has a safety timeout, so Milo can never get stuck
// listening, speaking or dancing forever.

import type { CharacterState, DanceStyle, Mood } from './types.ts';

export interface StateInfo {
  loops: boolean; // keeps going until stopped/replaced
  mood: Mood;
  maxMs: number; // hard safety cap; after this Milo returns to IDLE
  /** Fallback state used if this state is entered from somewhere invalid. */
  fallback: CharacterState;
}

const S = (loops: boolean, mood: Mood, maxMs: number, fallback: CharacterState = 'IDLE'): StateInfo => ({ loops, mood, maxMs, fallback });

export const STATE_INFO: Record<CharacterState, StateInfo> = {
  IDLE: S(true, 'calm', Infinity),
  LISTENING: S(true, 'calm', 8000),
  THINKING: S(false, 'puzzled', 3000),
  SPEAKING: S(false, 'happy', 6000),
  HAPPY: S(false, 'happy', 4000),
  LAUGHING: S(false, 'excited', 4000),
  DANCING: S(true, 'excited', 120000),
  ROBOT_DANCE: S(true, 'excited', 120000),
  SINGING: S(true, 'happy', 180000),
  JUMPING: S(false, 'excited', 4000),
  WAVING: S(false, 'happy', 4000),
  CLAPPING: S(false, 'happy', 4000),
  SPINNING: S(false, 'excited', 4000),
  SIDESTEPPING: S(false, 'happy', 4000),
  HANDSUP: S(false, 'excited', 4000),
  POINTING: S(false, 'happy', 6000),
  // each buddy's own special move (see AVATARS[id].special)
  FLYING: S(false, 'excited', 6000),
  SOMERSAULT: S(false, 'excited', 5000),
  TAILCHASE: S(false, 'excited', 5000),
  BEARHUG: S(false, 'happy', 6000),
  BOUNCING: S(false, 'happy', 4000),
  PLAY_PIANO: S(false, 'happy', 2500), PLAY_GUITAR: S(false, 'happy', 2500), PLAY_XYLO: S(false, 'happy', 2500), PLAY_TRUMPET: S(false, 'excited', 2500), PLAY_DRUM: S(false, 'excited', 2500),
  PLAY_FLUTE: S(false, 'calm', 2500), PLAY_HARP: S(false, 'calm', 2500), PLAY_MARACAS: S(false, 'excited', 2500), PLAY_BELLS: S(false, 'happy', 2500), PLAY_TAMBOURINE: S(false, 'excited', 2500),
  SLEEPING: S(true, 'sleepy', 10 * 60000),
  CELEBRATING: S(false, 'excited', 5000),
  CONFUSED: S(false, 'puzzled', 4000),
  SUPPORTIVE: S(false, 'caring', 6000),
  BREATHING: S(true, 'caring', 120000),
  STOPPING: S(false, 'calm', 1000),
};

export const ALL_STATES = Object.keys(STATE_INFO) as CharacterState[];

/** States that may not be interrupted by an ordinary action (only by WAKE/STOP). */
const BLOCKING: Partial<Record<CharacterState, CharacterState[]>> = {
  SLEEPING: ['HAPPY', 'STOPPING', 'IDLE', 'SLEEPING'],
};

export function canTransition(from: CharacterState, to: CharacterState): boolean {
  if (to === 'STOPPING') return true; // ANY -> STOPPING
  if (from === 'STOPPING') return true; // stopping is short; new commands may interrupt
  const only = BLOCKING[from];
  return only ? only.includes(to) : true;
}

export const SPEED_STEPS = [0.5, 0.75, 1, 1.4, 1.9] as const;
export const DEFAULT_SPEED_INDEX = 2;

export interface CharacterSnapshot {
  state: CharacterState;
  enteredAt: number;
  until: number | null; // when a bounded state auto-ends
  returnTo: CharacterState;
  speedIndex: number;
  style: DanceStyle;
  /** increments on every (re)entry so the UI can restart an animation even for the same state */
  seq: number;
}

export interface EnterOptions {
  durationMs?: number | null;
  returnTo?: CharacterState;
  style?: DanceStyle;
  speedIndex?: number;
}

export class CharacterMachine {
  private s: CharacterSnapshot;
  private listeners = new Set<(s: CharacterSnapshot) => void>();

  constructor(now = 0) {
    this.s = { state: 'IDLE', enteredAt: now, until: null, returnTo: 'IDLE', speedIndex: DEFAULT_SPEED_INDEX, style: 'normal', seq: 0 };
  }

  get snapshot(): CharacterSnapshot { return this.s; }
  get speed(): number { return SPEED_STEPS[this.s.speedIndex]; }

  subscribe(fn: (s: CharacterSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: CharacterSnapshot) {
    this.s = next;
    for (const l of this.listeners) l(next);
  }

  /** Enter a state. Returns false if the transition is not allowed (e.g. dancing while asleep). */
  enter(state: CharacterState, now: number, opts: EnterOptions = {}): boolean {
    if (!canTransition(this.s.state, state)) return false;
    const info = STATE_INFO[state];
    const duration = opts.durationMs === undefined ? (info.loops ? null : 2000) : opts.durationMs;
    const cap = info.maxMs;
    const until = duration === null ? (Number.isFinite(cap) ? now + cap : null) : now + Math.min(duration, cap);
    this.set({
      state,
      enteredAt: now,
      until,
      returnTo: opts.returnTo ?? 'IDLE',
      speedIndex: opts.speedIndex ?? this.s.speedIndex,
      style: opts.style ?? this.s.style,
      seq: this.s.seq + 1,
    });
    return true;
  }

  /** Change animation speed by +1/-1 step. Returns the new speed index, or null if already at the limit. */
  nudgeSpeed(delta: 1 | -1): number | null {
    const next = this.s.speedIndex + delta;
    if (next < 0 || next >= SPEED_STEPS.length) return null;
    this.set({ ...this.s, speedIndex: next });
    return next;
  }

  resetSpeed() { this.set({ ...this.s, speedIndex: DEFAULT_SPEED_INDEX }); }

  /** ANY -> STOPPING -> IDLE */
  stop(now: number) {
    this.enter('STOPPING', now, { durationMs: 400, returnTo: 'IDLE' });
  }

  /** Advance time; auto-ends bounded states. Returns true if the state changed. */
  tick(now: number): boolean {
    const { until, returnTo, state } = this.s;
    if (until !== null && now >= until) {
      // A looping state hitting its safety cap always goes to IDLE.
      const target = STATE_INFO[state].loops ? 'IDLE' : returnTo;
      this.set({ ...this.s, state: target, enteredAt: now, until: target === 'SLEEPING' ? now + STATE_INFO.SLEEPING.maxMs : null, returnTo: 'IDLE', seq: this.s.seq + 1 });
      return true;
    }
    return false;
  }

  get isDancing() { return this.s.state === 'DANCING' || this.s.state === 'ROBOT_DANCE'; }
  get isAsleep() { return this.s.state === 'SLEEPING'; }
}
