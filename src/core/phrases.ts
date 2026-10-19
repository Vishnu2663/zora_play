// Phrase catalog: every line Milo can say, each with a stable ID derived from
// its text. The voice generator (scripts/gen-voice.py) records one clip per ID;
// the speech service maps any say() text to clips via `segment()`.
//
// Lines are spoken sentence-by-sentence when needed, so composed lines like
// "Surprise! Wobble wobble!" or "Good try! Let's try another one. Find the star!"
// resolve to several clips without listing every combination.

import { ANIMALS, ANIMAL_INTRO, ANIMAL_QUESTION, ANIMAL_TRY_AGAIN, SHAPES, animalCorrect, animalFacts } from './games.ts';
import { TALK_LINES } from './talk.ts';
import { ALPHABET_LINES } from './alphabet.ts';
import { AVATAR_IDS, AVATARS } from './avatars.ts';
import { FEELING_REPLY, JOKES, PHRASE_REPLY, SAY, LAUGH_LINE, PICK_LINE, withBuddyName } from './responses.ts';
import { BEDTIME_LINES } from './generatedLines.ts';
import { RHYMES, RHYME_SEQUENCE_CONFIG } from './rhymes.ts';

export interface Phrase { id: string; text: string; speak: string; source: string }

/** Lines that read badly aloud get a spoken form; the bubble still shows `text`. */
export const SPEAK_AS: Record<string, string> = {
  // "A for" is read as the quick article "a"; the comma makes it the letter name "ay" (checked with espeak-ng)
  'A for Apple.': 'A, for Apple.',
  'Zzz... (say "wake up!")': 'Zzz... Say, wake up!',
  'RAWR! ...that was a tiny roar.': 'Rawr! That was a tiny roar.',
};

/** Lines composed or written in the UI layer (src/web). Keep in sync: test/phrases.test.ts checks it. */
export const UI_LINES: string[] = [
  'Yay! We sang it!',
  LAUGH_LINE,
  PICK_LINE,
  'Press an instrument to play it!',
  'Fresh start! Hello again!',
  'Bye bye! See you soon!',
  'Who says this?',
  'Yes!',
  'Your turn! What did I do?',
  'Good try! Watch again!',
  'Watch closely! Two moves!',
  'Pick 4 moves, then press Go!',
  'Pick a move first!',
  'Here comes YOUR dance!',
  'Ahh. All calm. You did great!',
  'Breathe in through your nose... and blow out slowly.',
  ...BEDTIME_LINES,
];

/** Templated lines, fully enumerated. */
export const TEMPLATE_LINES: { template: string; lines: string[] }[] = [
  { template: 'Find the ${shape}!', lines: SHAPES.map((s) => `Find the ${s}!`) },
  { template: 'Rhyme title', lines: RHYMES.map((r) => r.title) },
  { template: 'Alphabet lines', lines: ALPHABET_LINES },
  { template: 'Watch ${avatar}!', lines: AVATAR_IDS.map((id) => `Watch ${AVATARS[id].name}!`) },
  { template: 'Welcome with the buddy name', lines: AVATAR_IDS.flatMap((id) => SAY.welcome.map((t) => withBuddyName(t, AVATARS[id].name))) },
  { template: 'Avatar intro', lines: AVATAR_IDS.map((id) => AVATARS[id].intro) },
  { template: 'Rhyme intro', lines: [RHYME_SEQUENCE_CONFIG.introLine] },
  { template: "Yes! It's ${animal}!", lines: ANIMALS.map((a) => animalCorrect(a)) },
  { template: '${fun fact}', lines: ANIMALS.flatMap((a) => animalFacts(a)) },
  { template: 'Animal Sounds lines', lines: [ANIMAL_INTRO, ANIMAL_QUESTION, ANIMAL_TRY_AGAIN] },
  { template: 'Talk lines', lines: TALK_LINES },
];

/** FNV-1a 32-bit, hex. Stable across platforms. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function phraseId(text: string): string {
  const slug = normalizeForMatch(text).replace(/'/g, '').split(' ').slice(0, 5).join('-').slice(0, 32) || 'line';
  return `${slug}-${fnv(normalizeForMatch(text)).slice(0, 6)}`;
}

/** Split into sentences, keeping punctuation ("Hi! How are you?" -> ["Hi!", "How are you?"]). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

let cache: Phrase[] | null = null;
export function allPhrases(): Phrase[] {
  if (cache) return cache;
  const out = new Map<string, Phrase>();
  const add = (text: string, source: string) => {
    const key = normalizeForMatch(text);
    if (!key || out.has(key)) return;
    out.set(key, { id: phraseId(text), text, speak: SPEAK_AS[text] ?? text, source });
  };
  for (const [k, lines] of Object.entries(SAY)) lines.forEach((l) => add(l, `responses.SAY.${k}`));
  for (const [k, lines] of Object.entries(FEELING_REPLY)) lines.forEach((l) => add(l, `responses.FEELING_REPLY.${k}`));
  // each joke is told in two parts (question, pause, answer), so both parts are recorded as lines of their own
  JOKES.forEach((l) => { const q = l.indexOf('?'); add(l.slice(0, q + 1), 'responses.JOKES'); add(l.slice(q + 1).trim(), 'responses.JOKES'); });
  Object.values(PHRASE_REPLY).forEach((l) => add(l, 'responses.PHRASE_REPLY'));
  UI_LINES.forEach((l) => add(l, 'ui'));
  for (const t of TEMPLATE_LINES) t.lines.forEach((l) => add(l, `template:${t.template}`));
  cache = [...out.values()];
  return cache;
}

export interface Segmented { phrases: Phrase[]; missing: string[] }

/**
 * Cover `text` with catalog phrases: whole text first, else greedy longest runs
 * of consecutive sentences. Any sentence that can't be covered is reported in
 * `missing` (never silently dropped).
 */
export function segment(text: string, catalog: Phrase[] = allPhrases()): Segmented {
  const byNorm = new Map(catalog.map((p) => [normalizeForMatch(p.text), p]));
  const whole = byNorm.get(normalizeForMatch(text));
  if (whole) return { phrases: [whole], missing: [] };
  const s = splitSentences(text);
  const phrases: Phrase[] = [];
  const missing: string[] = [];
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (let j = s.length; j > i; j--) {
      const p = byNorm.get(normalizeForMatch(s.slice(i, j).join(' ')));
      if (p) { phrases.push(p); i = j; matched = true; break; }
    }
    if (!matched) { missing.push(s[i]); i++; }
  }
  return { phrases, missing };
}
