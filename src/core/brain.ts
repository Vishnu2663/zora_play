// MiloBrain: the interaction engine.
// input (voice transcript, Talk Wheel phrase, or remote action)
//   -> parseCommand -> validate (registry allowlist) -> resolve with session context
//   -> Reaction { say, character change, effects }
// The UI applies effects through its services. Nothing here touches a
// screen, a speaker or the network, so the whole flow is unit-testable.

import { CharacterMachine, SPEED_STEPS } from './character.ts';
import { parseCommand } from './parser.ts';
import { validate } from './registry.ts';
import { DANCE_LINE, FEELING_REPLY, JOKES, PHRASE_REPLY, line, pick, type Rng } from './responses.ts';
import { RHYMES } from './rhymes.ts';
import type { CharacterState, CommandParams, DanceStyle, GameId, Intent, Mood, ParsedCommand, Screen } from './types.ts';

export type Particle = 'notes' | 'sparkles' | 'hearts' | 'zzz' | 'bubbles' | 'question';

export type Effect =
  | { type: 'navigate'; screen: Screen }
  | { type: 'sfx'; name: string }
  | { type: 'rhyme'; action: 'play' | 'pause' | 'resume' | 'stop' | 'restart'; id?: string }
  | { type: 'tempo'; speed: number }
  | { type: 'stopAll' }
  | { type: 'particles'; kind: Particle }
  | { type: 'game'; action: 'restart' };

export interface Reaction {
  intent: Intent;
  accepted: boolean;
  say: string;
  mood: Mood;
  effects: Effect[];
  /** Big buttons to offer when Milo asks the child to choose. */
  choices?: Intent[];
}

interface LastAction { intent: Intent; params: CommandParams }

const GAME_SCREEN: Record<GameId, Screen> = { shape: 'shape', simon: 'simon', animal: 'animal', maker: 'maker' };
const GAME_SCREENS: Screen[] = ['shape', 'simon', 'animal'];

export class MiloBrain {
  readonly machine: CharacterMachine;
  private last: LastAction | null = null;
  private rhymeIndex = -1;
  rhymeActive = false;
  screen: Screen = 'home';

  private rng: Rng;

  constructor(rng: Rng = Math.random, now = 0) {
    this.rng = rng;
    this.machine = new CharacterMachine(now);
  }

  get lastIntent(): Intent | undefined { return this.last?.intent; }
  get currentRhymeId(): string | undefined { return this.rhymeIndex >= 0 ? RHYMES[this.rhymeIndex].id : undefined; }

  /** Entry point for any words (voice or Talk Wheel). The text itself is never stored. */
  hear(text: string, now: number): Reaction {
    return this.handle(parseCommand(text, { lastIntent: this.last?.intent }), now);
  }

  /** Mark a rhyme as chosen from the Rhyme Room so "sing again" replays it. */
  selectRhyme(id: string) {
    const i = RHYMES.findIndex((r) => r.id === id);
    if (i >= 0) { this.rhymeIndex = i; this.rhymeActive = true; this.last = { intent: 'SING', params: { again: true } }; }
  }

  /** Called by the UI when audio finishes or the child stops it from a button. */
  rhymeEnded(now: number) { this.rhymeActive = false; if (this.machine.snapshot.state === 'SINGING') this.machine.enter('IDLE', now, {}); }

  handle(cmd: ParsedCommand, now: number): Reaction {
    const v = validate(cmd);
    if (!v.ok) return this.unknown(now);
    const m = this.machine;
    const r = (say: string, mood: Mood, effects: Effect[] = [], extra: Partial<Reaction> = {}): Reaction =>
      ({ intent: cmd.intent, accepted: true, say, mood, effects, ...extra });
    const anim = (state: CharacterState, durationMs?: number | null, style?: DanceStyle) =>
      m.enter(state, now, { durationMs: durationMs ?? v.def.durationMs ?? undefined, style });

    // Asleep: only waking up, stopping, or feelings get through.
    if (m.isAsleep && !['WAKE', 'STOP', 'FEELING', 'PRIVATE', 'GREET', 'HELP'].includes(cmd.intent)) {
      return { intent: cmd.intent, accepted: false, say: line('sleepingHint', this.rng), mood: 'sleepy', effects: [{ type: 'particles', kind: 'zzz' }], choices: ['WAKE' as Intent] };
    }

    switch (cmd.intent) {
      case 'STOP': {
        m.stop(now);
        this.rhymeActive = false;
        return r(line('stop', this.rng), 'calm', [{ type: 'stopAll' }]);
      }
      case 'DANCE': return this.dance(cmd.params, now);
      case 'FASTER':
      case 'SLOWER': return this.changeSpeed(cmd.intent === 'FASTER' ? 1 : -1, now);
      case 'AGAIN': {
        if (GAME_SCREENS.includes(this.screen)) return r(line('again', this.rng), 'excited', [{ type: 'game', action: 'restart' }]);
        if (!this.last) return { ...r(line('nothingToRepeat', this.rng), 'puzzled', [], { choices: ['DANCE', 'SING', 'JUMP'] }), accepted: false };
        const again = this.handle({ intent: this.last.intent, params: { ...this.last.params, ...(this.last.intent === 'DANCE' || this.last.intent === 'SING' ? { again: true } : {}) }, confidence: 1 }, now);
        return { ...again, say: line('again', this.rng) };
      }
      case 'SING': {
        if (!cmd.params.again || this.rhymeIndex < 0) this.rhymeIndex = (this.rhymeIndex + 1) % RHYMES.length;
        const id = RHYMES[this.rhymeIndex].id;
        anim('SINGING', null);
        this.rhymeActive = true;
        this.last = { intent: 'SING', params: {} };
        return r(line('sing', this.rng), 'happy', [
          ...(this.screen !== 'rhymes' ? [{ type: 'navigate', screen: 'rhymes' } as Effect] : []),
          { type: 'rhyme', action: 'play', id },
          { type: 'particles', kind: 'notes' },
        ]);
      }
      case 'PAUSE':
        if (this.rhymeActive) return r(line('pause', this.rng), 'calm', [{ type: 'rhyme', action: 'pause' }]);
        m.stop(now);
        return r(line('stop', this.rng), 'calm', [{ type: 'stopAll' }]);
      case 'RESUME':
        if (this.rhymeActive) { anim('SINGING', null); return r(line('resume', this.rng), 'happy', [{ type: 'rhyme', action: 'resume' }]); }
        return this.handle({ intent: 'AGAIN', params: {}, confidence: 1 }, now);
      case 'JUMP': case 'WAVE': case 'CLAP': case 'SPIN': {
        const state = v.def.animation as CharacterState;
        anim(state);
        this.last = { intent: cmd.intent, params: {} };
        const key = cmd.intent.toLowerCase() as 'jump' | 'wave' | 'clap' | 'spin';
        return r(line(key, this.rng), 'excited', [{ type: 'sfx', name: v.def.sfx! }]);
      }
      case 'LAUGH': {
        anim('LAUGHING');
        this.last = { intent: 'LAUGH', params: {} };
        return r(pick(JOKES, this.rng), 'excited', [{ type: 'sfx', name: 'laughAfter' }, { type: 'particles', kind: 'sparkles' }]);
      }
      case 'SLEEP':
        this.stopAudioState();
        anim('SLEEPING', null);
        return r(line('sleep', this.rng), 'sleepy', [{ type: 'stopAll' }, { type: 'particles', kind: 'zzz' }]);
      case 'WAKE':
        if (!m.isAsleep) { anim('HAPPY'); return r(line('alreadyAwake', this.rng), 'happy'); }
        m.enter('HAPPY', now, { durationMs: 1500 });
        return r(line('wake', this.rng), 'happy', [{ type: 'sfx', name: 'chime' }, { type: 'particles', kind: 'sparkles' }]);
      case 'PLAY': {
        anim('HAPPY');
        const g = cmd.params.game;
        return r(line('play', this.rng), 'excited', [{ type: 'navigate', screen: g ? GAME_SCREEN[g] : 'play' }, { type: 'sfx', name: 'chime' }]);
      }
      case 'BREATHE':
        this.stopAudioState();
        return r(line('breathe', this.rng), 'caring', [{ type: 'stopAll' }, { type: 'navigate', screen: 'breathe' }]);
      case 'SAY': {
        const p = cmd.params.phrase;
        anim('SPEAKING');
        if (!p) return { ...r(line('sayWhat', this.rng), 'happy'), accepted: false };
        this.last = { intent: 'SAY', params: { phrase: p } };
        return r(PHRASE_REPLY[p] ?? p, 'happy', [{ type: 'particles', kind: p === 'i love you' ? 'hearts' : 'sparkles' }]);
      }
      case 'GREET':
        anim('WAVING');
        return r(line('greet', this.rng), 'happy', [{ type: 'sfx', name: 'chime' }]);
      case 'HELP':
        anim('SPEAKING');
        return r(line('help', this.rng), 'happy', [{ type: 'navigate', screen: 'help' }]);
      case 'SURPRISE': {
        const options: ParsedCommand[] = [
          { intent: 'DANCE', params: { style: 'funny' }, confidence: 1 },
          { intent: 'SPIN', params: {}, confidence: 1 },
          { intent: 'LAUGH', params: {}, confidence: 1 },
          { intent: 'CLAP', params: {}, confidence: 1 },
        ];
        const out = this.handle(pick(options, this.rng), now);
        this.last = { intent: 'SURPRISE', params: {} };
        return { ...out, intent: 'SURPRISE', say: `${line('surprise', this.rng)} ${out.say}`, effects: [...out.effects, { type: 'particles', kind: 'sparkles' }] };
      }
      case 'FEELING': {
        const f = cmd.params.feeling!;
        const say = pick(FEELING_REPLY[f], this.rng);
        if (f === 'happy') { anim('CELEBRATING'); return r(say, 'excited', [{ type: 'particles', kind: 'sparkles' }]); }
        anim('SUPPORTIVE');
        const choices: Intent[] = f === 'tired' ? ['SING', 'SLEEP'] : f === 'bored' ? ['PLAY', 'DANCE'] : ['BREATHE', 'PLAY'];
        return r(say, 'caring', [{ type: 'particles', kind: 'hearts' }], { choices });
      }
      case 'PRIVATE':
        anim('SUPPORTIVE');
        return r(line('private', this.rng), 'caring');
      case 'CLARIFY':
        anim('CONFUSED');
        return { ...r(line('clarify', this.rng), 'puzzled', [{ type: 'particles', kind: 'question' }], { choices: cmd.params.options }), accepted: false };
      default:
        return this.unknown(now);
    }
  }

  private stopAudioState() { this.rhymeActive = false; }

  private unknown(now: number): Reaction {
    if (this.machine.isAsleep) return { intent: 'UNKNOWN', accepted: false, say: line('sleepingHint', this.rng), mood: 'sleepy', effects: [] };
    this.machine.enter('CONFUSED', now, { durationMs: 2000 });
    return { intent: 'UNKNOWN', accepted: false, say: line('unknown', this.rng), mood: 'puzzled', effects: [{ type: 'particles', kind: 'question' }], choices: ['DANCE', 'SING', 'PLAY'] };
  }

  private dance(p: CommandParams, now: number): Reaction {
    const m = this.machine;
    const prevStyle = this.last?.intent === 'DANCE' ? (this.last.params.style ?? 'normal') : 'normal';
    const style: DanceStyle = p.style ?? (p.again ? prevStyle : 'normal');
    if (!p.again && !p.speed) m.resetSpeed();
    if (style === 'slow' && !p.speed) m.enter('DANCING', now, { durationMs: null, style, speedIndex: 1 });
    else m.enter(style === 'robot' ? 'ROBOT_DANCE' : 'DANCING', now, { durationMs: null, style });
    if (p.speed) m.nudgeSpeed(p.speed === 'faster' ? 1 : -1);
    this.last = { intent: 'DANCE', params: { style } };
    const say = p.speed ? line(p.speed, this.rng) : line(DANCE_LINE[style] as 'danceNormal', this.rng);
    return { intent: 'DANCE', accepted: true, say, mood: 'excited', effects: [{ type: 'sfx', name: 'beat' }, { type: 'particles', kind: 'notes' }, { type: 'tempo', speed: m.speed }] };
  }

  private changeSpeed(delta: 1 | -1, now: number): Reaction {
    const m = this.machine;
    const key = delta > 0 ? 'faster' : 'slower';
    if (m.isDancing) {
      const res = m.nudgeSpeed(delta);
      const say = res === null ? line(delta > 0 ? 'fastest' : 'slowest', this.rng) : line(key, this.rng);
      return { intent: delta > 0 ? 'FASTER' : 'SLOWER', accepted: true, say, mood: 'excited', effects: [{ type: 'tempo', speed: m.speed }] };
    }
    if (this.rhymeActive) {
      const res = m.nudgeSpeed(delta);
      const say = res === null ? line(delta > 0 ? 'fastest' : 'slowest', this.rng) : line(key, this.rng);
      return { intent: delta > 0 ? 'FASTER' : 'SLOWER', accepted: true, say, mood: 'happy', effects: [{ type: 'tempo', speed: m.speed }] };
    }
    if (this.last?.intent === 'DANCE') {
      // "faster!" right after a dance ended: start dancing again, faster.
      return this.dance({ again: true, speed: key }, now);
    }
    // Nothing is going on: Faster starts a quick, bouncy dance; Slower starts a slow, floaty one.
    if (delta > 0) return this.dance({ speed: 'faster' }, now);
    const slow = this.dance({ style: 'slow', speed: 'slower' }, now);
    m.nudgeSpeed(-1); // really slow and floaty
    return { ...slow, effects: slow.effects.map((e) => (e.type === 'tempo' ? { ...e, speed: m.speed } : e)) };
  }

  /** Session reset (parent area). Clears everything; nothing persists anyway. */
  reset(now: number) {
    this.last = null;
    this.rhymeIndex = -1;
    this.rhymeActive = false;
    this.machine.enter('IDLE', now, {});
    this.machine.resetSpeed();
  }
}

export { SPEED_STEPS };
