// Central allowlist of everything Milo is permitted to do.
// A parsed command that does not validate here is never executed.

import type { CharacterState, CommandParams, DanceStyle, GameId, Intent, ParsedCommand } from './types.ts';

export type Service = 'animation' | 'audio' | 'game' | 'system' | 'speech';

export interface ActionDef {
  id: Intent;
  service: Service;
  animation?: CharacterState;
  /** ms; null = loops until stopped; undefined = no animation */
  durationMs?: number | null;
  sfx?: string;
  allowedParams: (keyof CommandParams)[];
  supportsRepeat: boolean;
  supportsSpeed: boolean;
  cancellable: boolean;
  returnsTo: CharacterState;
}

export const DANCE_STYLES: readonly DanceStyle[] = ['normal', 'robot', 'funny', 'slow'];
export const GAMES: readonly GameId[] = ['shape', 'simon', 'animal', 'maker'];
export const MIN_CONFIDENCE = 0.5;

const def = (d: Partial<ActionDef> & Pick<ActionDef, 'id' | 'service'>): ActionDef => ({
  allowedParams: [],
  supportsRepeat: false,
  supportsSpeed: false,
  cancellable: true,
  returnsTo: 'IDLE',
  ...d,
});

export const REGISTRY: Readonly<Partial<Record<Intent, ActionDef>>> = Object.freeze({
  DANCE: def({ id: 'DANCE', service: 'animation', animation: 'DANCING', durationMs: null, sfx: 'beat',
    allowedParams: ['style', 'speed', 'again'], supportsRepeat: true, supportsSpeed: true }),
  SING: def({ id: 'SING', service: 'audio', animation: 'SINGING', durationMs: null,
    allowedParams: ['again'], supportsRepeat: true, supportsSpeed: true }),
  JUMP: def({ id: 'JUMP', service: 'animation', animation: 'JUMPING', durationMs: 1600, sfx: 'boing', supportsRepeat: true }),
  WAVE: def({ id: 'WAVE', service: 'animation', animation: 'WAVING', durationMs: 1800, sfx: 'chime', supportsRepeat: true }),
  CLAP: def({ id: 'CLAP', service: 'animation', animation: 'CLAPPING', durationMs: 1800, sfx: 'clap', supportsRepeat: true }),
  SPIN: def({ id: 'SPIN', service: 'animation', animation: 'SPINNING', durationMs: 1500, sfx: 'whoosh', supportsRepeat: true }),
  LAUGH: def({ id: 'LAUGH', service: 'animation', animation: 'LAUGHING', durationMs: 2600, sfx: 'giggle', supportsRepeat: true }),
  SLEEP: def({ id: 'SLEEP', service: 'animation', animation: 'SLEEPING', durationMs: null, returnsTo: 'SLEEPING' }),
  WAKE: def({ id: 'WAKE', service: 'animation', animation: 'HAPPY', durationMs: 1500, sfx: 'chime' }),
  BREATHE: def({ id: 'BREATHE', service: 'system', animation: 'BREATHING', durationMs: null }),
  PLAY: def({ id: 'PLAY', service: 'game', animation: 'HAPPY', durationMs: 1200, allowedParams: ['game'] }),
  SAY: def({ id: 'SAY', service: 'speech', animation: 'SPEAKING', durationMs: 1800, allowedParams: ['phrase'], supportsRepeat: true }),
  GREET: def({ id: 'GREET', service: 'speech', animation: 'WAVING', durationMs: 1800 }),
  HELP: def({ id: 'HELP', service: 'system', animation: 'SPEAKING', durationMs: 2200 }),
  SURPRISE: def({ id: 'SURPRISE', service: 'animation', animation: 'CELEBRATING', durationMs: 1800 }),
  FEELING: def({ id: 'FEELING', service: 'speech', animation: 'SUPPORTIVE', durationMs: 3000, allowedParams: ['feeling'] }),
  AGAIN: def({ id: 'AGAIN', service: 'system' }),
  FASTER: def({ id: 'FASTER', service: 'system', allowedParams: ['speed'] }),
  SLOWER: def({ id: 'SLOWER', service: 'system', allowedParams: ['speed'] }),
  STOP: def({ id: 'STOP', service: 'system', animation: 'STOPPING', durationMs: 400, cancellable: false }),
  PAUSE: def({ id: 'PAUSE', service: 'audio' }),
  RESUME: def({ id: 'RESUME', service: 'audio' }),
  PRIVATE: def({ id: 'PRIVATE', service: 'speech', animation: 'SUPPORTIVE', durationMs: 2500 }),
  CLARIFY: def({ id: 'CLARIFY', service: 'speech', animation: 'CONFUSED', durationMs: 2000, allowedParams: ['options'] }),
  UNKNOWN: def({ id: 'UNKNOWN', service: 'speech', animation: 'CONFUSED', durationMs: 2000 }),
});

export type Validation = { ok: true; def: ActionDef } | { ok: false; reason: string };

/** Validate a parsed command against the allowlist. Unknown intents/params are rejected. */
export function validate(cmd: ParsedCommand): Validation {
  const d = REGISTRY[cmd.intent];
  if (!d) return { ok: false, reason: `intent ${cmd.intent} not registered` };
  if (cmd.intent !== 'UNKNOWN' && cmd.confidence < MIN_CONFIDENCE) return { ok: false, reason: 'low confidence' };
  for (const key of Object.keys(cmd.params) as (keyof CommandParams)[]) {
    if (!d.allowedParams.includes(key)) return { ok: false, reason: `param ${key} not allowed for ${cmd.intent}` };
  }
  const p = cmd.params;
  if (p.style !== undefined && !DANCE_STYLES.includes(p.style)) return { ok: false, reason: 'bad dance style' };
  if (p.game !== undefined && !GAMES.includes(p.game)) return { ok: false, reason: 'bad game' };
  if (p.speed !== undefined && p.speed !== 'faster' && p.speed !== 'slower') return { ok: false, reason: 'bad speed' };
  return { ok: true, def: d };
}
