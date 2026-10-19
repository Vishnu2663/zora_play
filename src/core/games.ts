// Pure game logic. No timers, no rendering — screens drive these with the remote.

import type { Rng } from './responses.ts';
import { ANIMAL_FACTS_GENERATED } from './generatedLines.ts';

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistinct<T>(pool: readonly T[], n: number, must: T, rng: Rng): T[] {
  const others = shuffle(pool.filter((x) => x !== must), rng).slice(0, n - 1);
  return shuffle([must, ...others], rng);
}

/* ------------------------------------------------------------------ */
/* Choice games: Shape Match and Animal Sounds share one engine.       */
/* ------------------------------------------------------------------ */

export interface ChoiceGame<T extends string> {
  round: number; // 1-based
  total: number;
  score: number; // first-try correct answers
  target: T;
  options: T[];
  attempts: number; // wrong attempts this round
  finished: boolean;
  lastResult: 'correct' | 'wrong' | null;
  history: T[]; // previous targets, to avoid repeats
}

export function newChoiceGame<T extends string>(pool: readonly T[], rng: Rng, total = 5, optionCount = 3): ChoiceGame<T> {
  const target = pool[Math.floor(rng() * pool.length)];
  return { round: 1, total, score: 0, target, options: pickDistinct(pool, optionCount, target, rng), attempts: 0, finished: false, lastResult: null, history: [target] };
}

export function answerChoice<T extends string>(g: ChoiceGame<T>, choice: T): ChoiceGame<T> {
  if (g.finished) return g;
  if (!g.options.includes(choice)) return g; // ignore anything that is not on screen
  if (choice === g.target) return { ...g, score: g.attempts === 0 ? g.score + 1 : g.score, lastResult: 'correct' };
  return { ...g, attempts: g.attempts + 1, lastResult: 'wrong' };
}

export function nextChoiceRound<T extends string>(g: ChoiceGame<T>, pool: readonly T[], rng: Rng, optionCount = 3): ChoiceGame<T> {
  if (g.round >= g.total) return { ...g, finished: true, lastResult: null };
  const fresh = pool.filter((p) => !g.history.slice(-2).includes(p));
  const target = fresh[Math.floor(rng() * fresh.length)];
  return { ...g, round: g.round + 1, target, options: pickDistinct(pool, optionCount, target, rng), attempts: 0, lastResult: null, history: [...g.history, target] };
}

/** After two misses, gently point at the answer. */
export const shouldHint = (g: ChoiceGame<string>) => g.attempts >= 2;

export const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond'] as const;
export type ShapeId = (typeof SHAPES)[number];

/** Every animal that has artwork. */
export const ALL_ANIMALS = ['cow', 'duck', 'cat', 'dog', 'owl', 'frog', 'sheep', 'goat', 'horse', 'rooster', 'hen', 'lion', 'elephant', 'pig', 'monkey'] as const;
export type AnimalId = (typeof ALL_ANIMALS)[number];

/**
 * Animals the game asks about: ONLY those with a real recording in public/audio/animals/
 * (see public/audio/MANIFEST.json for each file's source and licence). cow, duck, pig and monkey have artwork
 * but no licensed real recording yet, so they are not offered (no synthetic stand-ins).
 */
export const ANIMALS = ['dog', 'cat', 'sheep', 'goat', 'horse', 'rooster', 'hen', 'frog', 'lion', 'elephant', 'owl'] as const;
export type PlayableAnimal = (typeof ANIMALS)[number];

/** Path of each animal's recording, relative to index.html. */
export const animalSoundPath = (a: AnimalId) => `audio/animals/${a}.mp3`;

/** Sound word, as shown and spoken in the question ("Who says bow wow?"). */
export const ANIMAL_CLUE: Record<AnimalId, string> = {
  cow: 'Mooo!', duck: 'Quack quack!', cat: 'Meow!', dog: 'Bow wow!', owl: 'Hoo hoo!', frog: 'Ribbit!',
  sheep: 'Baa baa!', goat: 'Maa maa!', horse: 'Neigh!', rooster: 'Cock-a-doodle-doo!', hen: 'Cluck cluck!', lion: 'Roar!',
  elephant: 'Toot toot!', pig: 'Oink oink!', monkey: 'Ooh ooh ah ah!',
};
/** Name with its article, for "Yes! It's a dog!". */
export const ANIMAL_NAME: Record<AnimalId, string> = {
  cow: 'a cow', duck: 'a duck', cat: 'a cat', dog: 'a dog', owl: 'an owl', frog: 'a frog', sheep: 'a sheep', goat: 'a goat', horse: 'a horse',
  rooster: 'a rooster', hen: 'a hen', lion: 'a lion', elephant: 'an elephant', pig: 'a pig', monkey: 'a monkey',
};
/** One friendly fact, said after a correct answer. */
export const ANIMAL_FACT: Record<PlayableAnimal, string> = {
  dog: 'Dogs wag their tails when they are happy.',
  cat: 'Cats purr when they feel cosy.',
  sheep: 'Sheep have soft, woolly coats.',
  goat: 'Goats are great at climbing.',
  horse: 'Horses can run very fast.',
  rooster: 'Roosters crow when the sun comes up.',
  hen: 'Hens lay eggs.',
  frog: 'Frogs can jump really far.',
  lion: 'A lion has a big, fluffy mane.',
  elephant: 'Elephants use their trunks like a hand.',
  owl: 'Owls are awake at night.',
};
/** Every fact we can say for an animal: the hand-written one first, then approved generated ones. */
export const animalFacts = (a: PlayableAnimal): string[] => [ANIMAL_FACT[a], ...(ANIMAL_FACTS_GENERATED[a] ?? [])];
export const animalFact = (a: PlayableAnimal, rng: Rng): string => { const f = animalFacts(a); return f[Math.floor(rng() * f.length) % f.length]; };
export const animalCorrect = (a: AnimalId) => `Yes! It's ${ANIMAL_NAME[a]}!`;
/** Animal Sounds spoken lines and pauses (ms). Order per question: intro (first only) -> pause -> recording -> pause -> question. */
export const ANIMAL_INTRO = "Let's learn animal sounds!";
export const ANIMAL_QUESTION = 'Who makes this noise?';
export const ANIMAL_CONFIG = { introPauseMs: 600, afterSoundPauseMs: 700, afterResponsePauseMs: 800 };
export const ANIMAL_TRY_AGAIN = "Good try! Let's listen again.";

/* ------------------------------------------------------------------ */
/* Milo Says (Simon Says): watch Milo, then copy him with the remote.  */
/* Rounds 1-3: one move. Rounds 4-5: a two-move combo (memory!).        */
/* ------------------------------------------------------------------ */

export const MOVES = ['jump', 'wave', 'clap', 'spin'] as const;
export type Move = (typeof MOVES)[number];

export interface SimonGame {
  round: number;
  total: number;
  score: number;
  sequence: Move[];
  input: Move[];
  phase: 'watch' | 'answer' | 'feedback' | 'done';
  lastResult: 'correct' | 'wrong' | null;
}

export const simonLength = (round: number) => (round <= 3 ? 1 : 2);

function makeSequence(len: number, rng: Rng): Move[] {
  const seq: Move[] = [];
  while (seq.length < len) {
    const m = MOVES[Math.floor(rng() * MOVES.length)];
    if (seq[seq.length - 1] !== m) seq.push(m); // no back-to-back duplicates (easier to follow)
  }
  return seq;
}

export function newSimon(rng: Rng, total = 5): SimonGame {
  return { round: 1, total, score: 0, sequence: makeSequence(simonLength(1), rng), input: [], phase: 'watch', lastResult: null };
}

export const simonStartAnswer = (g: SimonGame): SimonGame => (g.phase === 'watch' ? { ...g, phase: 'answer', input: [] } : g);

export function simonPress(g: SimonGame, move: Move): SimonGame {
  if (g.phase !== 'answer') return g;
  const input = [...g.input, move];
  const i = input.length - 1;
  if (g.sequence[i] !== move) return { ...g, input, phase: 'feedback', lastResult: 'wrong' };
  if (input.length === g.sequence.length) return { ...g, input, phase: 'feedback', lastResult: 'correct', score: g.score + 1 };
  return { ...g, input }; // correct so far, keep going
}

/** After feedback: a wrong answer replays the same moves; a right one advances. */
export function simonNext(g: SimonGame, rng: Rng): SimonGame {
  if (g.phase !== 'feedback') return g;
  if (g.lastResult === 'wrong') return { ...g, phase: 'watch', input: [], lastResult: null };
  if (g.round >= g.total) return { ...g, phase: 'done' };
  const round = g.round + 1;
  return { ...g, round, sequence: makeSequence(simonLength(round), rng), input: [], phase: 'watch', lastResult: null };
}

/* ------------------------------------------------------------------ */
/* Dance Maker: the child choreographs 4 moves, Milo performs them.     */
/* ------------------------------------------------------------------ */

export const MAKER_MOVES = ['wave', 'jump', 'sidestep', 'turn', 'handsup', 'bounce'] as const;
/** Child-friendly names for the move cards. */
export const MAKER_LABEL: Record<(typeof MAKER_MOVES)[number], string> = {
  wave: 'Wave', jump: 'Jump', sidestep: 'Side step', turn: 'Turn around', handsup: 'Hands up', bounce: 'Bounce',
};
export type MakerMove = (typeof MAKER_MOVES)[number];
export const MAKER_SLOTS = 4;
export const MOVE_BEAT_MS = 1400;

export type Choreo = (MakerMove | null)[];
export const emptyChoreo = (): Choreo => Array(MAKER_SLOTS).fill(null);

/** Put a move in the first empty slot (or replace the last one if full). */
export function addMove(c: Choreo, m: MakerMove): Choreo {
  const next = c.slice();
  const idx = next.indexOf(null);
  next[idx === -1 ? MAKER_SLOTS - 1 : idx] = m;
  return next;
}
export function removeLast(c: Choreo): Choreo {
  const next = c.slice();
  for (let i = MAKER_SLOTS - 1; i >= 0; i--) if (next[i] !== null) { next[i] = null; break; }
  return next;
}
export const choreoReady = (c: Choreo) => c.some((m) => m !== null);

export interface Step { move: MakerMove; startMs: number; durMs: number; slot: number }
export function choreoTimeline(c: Choreo, speed: number): Step[] {
  const dur = MOVE_BEAT_MS / speed;
  return c
    .map((m, slot) => ({ m, slot }))
    .filter((x): x is { m: MakerMove; slot: number } => x.m !== null)
    .map((x, i) => ({ move: x.m, slot: x.slot, startMs: i * dur, durMs: dur }));
}
export function stepAt(timeline: Step[], elapsedMs: number, loop = true): Step | null {
  if (!timeline.length) return null;
  const total = timeline[timeline.length - 1].startMs + timeline[timeline.length - 1].durMs;
  const t = loop ? elapsedMs % total : elapsedMs;
  return timeline.find((s) => t >= s.startMs && t < s.startMs + s.durMs) ?? null;
}

/* ------------------------------------------------------------------ */
/* Dragon Breath: a calming breathing exercise.                         */
/* ------------------------------------------------------------------ */

export const BREATH = { inMs: 3500, outMs: 4500, cycles: 3 };
export interface BreathPhase { phase: 'in' | 'out' | 'done'; progress: number; cycle: number }
export function breathPhase(elapsedMs: number, cfg = BREATH): BreathPhase {
  const cycleMs = cfg.inMs + cfg.outMs;
  const cycle = Math.floor(elapsedMs / cycleMs);
  if (cycle >= cfg.cycles) return { phase: 'done', progress: 1, cycle: cfg.cycles };
  const t = elapsedMs - cycle * cycleMs;
  return t < cfg.inMs
    ? { phase: 'in', progress: t / cfg.inMs, cycle: cycle + 1 }
    : { phase: 'out', progress: (t - cfg.inMs) / cfg.outMs, cycle: cycle + 1 };
}
