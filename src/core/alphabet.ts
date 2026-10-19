// Alphabets A-Z: one entry per letter. The displayed word, the picture (`art`) and the spoken phrase all
// come from this single entry, so they cannot disagree (test/alphabet.test.ts checks every letter).

import type { Step } from './stepSequence.ts';

export interface LetterEntry {
  letter: string; // uppercase
  lower: string;
  word: string; // as displayed ("Ice cream")
  phrase: string; // as spoken and displayed ("I for Ice cream.")
  art: string; // id of the illustration in src/web/alphabetArt.tsx
}

const WORDS: [string, string][] = [
  ['A', 'Apple'], ['B', 'Ball'], ['C', 'Cat'], ['D', 'Dog'], ['E', 'Elephant'], ['F', 'Fish'], ['G', 'Grapes'],
  ['H', 'Hat'], ['I', 'Ice cream'], ['J', 'Jar'], ['K', 'Kite'], ['L', 'Lion'], ['M', 'Moon'], ['N', 'Nest'],
  ['O', 'Orange'], ['P', 'Pig'], ['Q', 'Queen'], ['R', 'Rainbow'], ['S', 'Sun'], ['T', 'Tree'], ['U', 'Umbrella'],
  ['V', 'Van'], ['W', 'Whale'], ['X', 'Xylophone'], ['Y', 'Yo-yo'], ['Z', 'Zebra'],
];

export const ALPHABET: LetterEntry[] = WORDS.map(([letter, word]) => ({
  letter, lower: letter.toLowerCase(), word, phrase: `${letter} for ${word}.`, art: word.toLowerCase().replace(/[^a-z]/g, ''),
}));

export const ALPHABET_INTRO = "Let's learn the alphabet!";
export const ALPHABET_DONE = 'Well done! You learned the whole alphabet!';
export const ALPHABET_CONFIG = {
  /** Pause after the intro sentence finished, before letter A appears (ms). */
  introPauseMs: 1600,
  /** Pause after a letter's phrase finished, before the next letter (ms). */
  letterPauseMs: 1400,
  /** Letter A is shown this long before it is spoken, so the child can look first (ms). */
  firstLetterLeadMs: 1100,
};

/** Every line the Alphabets section can speak. */
export const ALPHABET_LINES: string[] = [ALPHABET_INTRO, ALPHABET_DONE, ...ALPHABET.map((l) => l.phrase)];

/** Steps that teach letters from `from` to Z (intro first when starting at A and `withIntro`). Pure: used by tests too. */
/** Speed levels: scale for the pauses and the voice/tune playback rate. */
export const ALPHABET_SPEEDS = [
  { id: 'slow', label: 'Slow', pause: 1.6, rate: 0.88 },
  { id: 'normal', label: 'Normal', pause: 1, rate: 1 },
  { id: 'fast', label: 'Fast', pause: 0.55, rate: 1.15 },
] as const;
export const DEFAULT_ALPHABET_SPEED = 1;

export function alphabetSteps(from: number, withIntro: boolean, show: (i: number) => void, done: () => void, pauseScale: () => number = () => 1): Step[] {
  const steps: Step[] = [];
  if (withIntro) steps.push({ type: 'speak', text: ALPHABET_INTRO, label: 'intro' }, { type: 'wait', ms: () => ALPHABET_CONFIG.introPauseMs * pauseScale(), label: 'intro-pause' });
  for (let i = from; i < ALPHABET.length; i++) {
    steps.push({ type: 'do', fn: () => show(i), label: `show-${ALPHABET[i].letter}` });
    if (i === 0) steps.push({ type: 'wait', ms: () => ALPHABET_CONFIG.firstLetterLeadMs * pauseScale(), label: 'lead-A' });
    steps.push({ type: 'speak', text: ALPHABET[i].phrase, label: `say-${ALPHABET[i].letter}` });
    if (i < ALPHABET.length - 1) steps.push({ type: 'wait', ms: () => ALPHABET_CONFIG.letterPauseMs * pauseScale(), label: `pause-${ALPHABET[i].letter}` });
  }
  steps.push({ type: 'wait', ms: () => ALPHABET_CONFIG.letterPauseMs * pauseScale(), label: 'done-pause' }, { type: 'do', fn: done, label: 'done' }, { type: 'speak', text: ALPHABET_DONE, label: 'done-say' });
  return steps;
}

