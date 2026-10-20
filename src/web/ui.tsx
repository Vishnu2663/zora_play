// Shared UI building blocks and the context screens use.
import React from 'react';
import type { MiloBrain } from '../core/brain.ts';
import type { CharacterState, Intent, Mood, ParsedCommand, Screen } from '../core/types.ts';
import type { AudioService, Volume } from './audio.ts';
import type { AvatarId } from '../core/avatars.ts';

export interface Settings {
  sound: boolean;
  volume: Volume;
  voice: boolean; // Milo speaks (bundled voice clips)
  systemTts: boolean; // fallback to the device's speechSynthesis; usable only once the audio probe verified it
  motion: 'full' | 'gentle';
  windDownMin: 0 | 15 | 30 | 45;
  dev: boolean; // developer text console (clearly labelled, off by default)
}

export interface RhymeState { id: string | null; status: 'idle' | 'playing' | 'paused' }

export interface Ctx {
  brain: MiloBrain;
  audio: AudioService;
  settings: Settings;
  setSettings: (s: Settings) => void;
  /** Send words to Milo (Talk Wheel / dev console / future voice). */
  hear: (text: string) => void;
  /** Send a structured command (remote buttons). */
  act: (cmd: Omit<ParsedCommand, 'confidence'> & { confidence?: number }) => void;
  go: (s: Screen) => void;
  say: (text: string, mood?: Mood) => void;
  /** Cancel a half-told joke (its answer and laugh must not talk over whatever is said next). */
  cancelJoke: () => void;
  /** Show text in the speech bubble without speaking it (used when a step runner speaks the line itself). */
  bubble: (text: string, mood?: Mood) => void;
  sfx: (name: string) => void;
  anim: (state: CharacterState, durationMs?: number | null) => void;
  particles: (kind: 'notes' | 'sparkles' | 'hearts' | 'zzz' | 'bubbles' | 'question', n?: number) => void;
  earnScale: (color: string) => void;
  avatar: AvatarId;
  setAvatar: (id: AvatarId) => void;
  rhyme: RhymeState;
  playRhyme: (id: string) => void;
  pauseRhyme: () => void;
  resumeRhyme: () => void;
  restartRhyme: () => void;
  stopRhyme: () => void;
  musicHold: React.MutableRefObject<boolean>;
  /** Dance Maker's own speed for the music (null = follow the character's speed). */
  musicTempo: React.MutableRefObject<number | null>;
  breathStart: React.MutableRefObject<number>;
  gameKey: number;
  bedtime: boolean;
  charState: CharacterState;
  speedIndex: number;
  reduced: boolean;
  scales: string[];
  resetSession: () => void;
}

export function Btn(props: {
  fkey: string;
  onSelect?: () => void;
  autoFocus?: boolean;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  dim?: boolean;
  label?: string;
  style?: React.CSSProperties;
  extra?: Record<string, string>;
}) {
  const { fkey, onSelect, autoFocus, className = '', children, disabled, dim, label, style, extra } = props;
  return (
    <button
      type="button"
      data-focusable=""
      data-fkey={fkey}
      {...(autoFocus ? { 'data-autofocus': '' } : {})}
      {...(extra ?? {})}
      className={`btn ${className}${dim ? ' dim' : ''}`}
      onClick={() => { if (!dim) onSelect?.(); }}
      disabled={disabled}
      aria-label={label}
      aria-disabled={dim || undefined}
      style={style}
    >
      {children}
    </button>
  );
}

export function Panel({ title, sub, children, className = '' }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <h1 className="panel-title">{title}</h1>
      {sub && <p className="panel-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function Dots({ total, done, current }: { total: number; done: number; current?: number }) {
  return (
    <div className="dots" aria-label={`${done} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`dot${i < done ? ' on' : ''}${current === i ? ' cur' : ''}`} />
      ))}
    </div>
  );
}

export const INTENT_PHRASE: Partial<Record<Intent, string>> = {
  DANCE: 'Dance', SING: 'Sing', PLAY: 'Play a game', JUMP: 'Jump', WAVE: 'Wave', CLAP: 'Clap', SPIN: 'Spin',
  SLEEP: 'Sleep', WAKE: 'Wake up!', BREATHE: 'Calm breaths', LAUGH: 'Laugh',
};
