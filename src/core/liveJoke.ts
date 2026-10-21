// Live joke: the optional "fresh joke" that the Tell me a joke button can fetch from our small joke service when the TV is
// online. Platform-free: this file only describes the reply and decides whether a reply is safe to use. The network call
// itself is in src/web/liveJoke.ts. Nothing about the child is ever sent; the request carries only the buddy's id.
//
// Every reply is checked here AGAIN on the device, whatever the service already did: if anything looks wrong the app
// quietly tells one of the stored, reviewed jokes instead.

/** The joke service's address (an API behind which a small function writes one joke and speaks it). */
export const LIVE_JOKE_URL = 'https://xmh6l5ac9h.execute-api.ap-south-1.amazonaws.com/';
/** How long the child waits before the app gives up and tells a stored joke. */
export const LIVE_JOKE_TIMEOUT_MS = 5000;

export interface LiveJoke {
  question: string;
  answer: string;
  /** mp3 data (base64) of the question and of the answer, in the buddy's voice. */
  audioQuestion: string;
  audioAnswer: string;
}

export const MAX_WORDS = 14;
export const MAX_SYLLABLES = 3; // a word of four or more syllables is too hard for a 3 year old

/** Same list as the build pipeline and the joke service (test/liveJoke.test.ts keeps them identical). */
export const BLOCKED_WORDS: string[] = [
  'kill', 'killed', 'die', 'died', 'dead', 'death', 'blood', 'bloody', 'gun', 'knife', 'weapon', 'bomb', 'war', 'fight', 'hit', 'hate', 'stupid', 'dumb', 'idiot', 'ugly', 'fat',
  'scary', 'scared', 'monster', 'ghost', 'nightmare', 'demon', 'devil', 'hell', 'damn', 'crap', 'sucks', 'shut',
  'kiss', 'boyfriend', 'girlfriend', 'date', 'sexy', 'beer', 'wine', 'drunk', 'drug', 'drugs', 'smoke', 'cigarette',
  'doctor', 'medicine', 'pill', 'pills', 'sick', 'hospital', 'cancer', 'virus', 'vote', 'election', 'president', 'god', 'church',
  'google', 'amazon', 'disney', 'coca', 'pepsi', 'mcdonalds', 'youtube', 'tiktok', 'netflix', 'lego', 'barbie', 'pokemon',
  'address', 'phone', 'password', 'school',
  'kills', 'killing', 'dies', 'dying', 'monsters', 'ghosts', 'scarier', 'scariest', 'scare', 'scares', 'bombs', 'guns', 'knives', 'weapons', 'fights', 'fighting',
  'hates', 'hurt', 'hurts', 'afraid', 'cry', 'cries', 'steal', 'stole', 'stab', 'shoot', 'poop', 'fart', 'loser', 'drugs', 'beers', 'blind', 'cigarettes',
];

const ALLOWED = /^[A-Za-z ,.!?'-]+$/;
const PERSONAL_ASK = /\b(your (name|age|address|phone|school|home|house|mum|mom|dad|surname)|how old|where do you live|where you live)\b/i;
const URL_RE = /https?:|www\.|\bdot (com|org|net)\b|\b[a-z0-9-]+\.(com|org|net|io|co|ly|me|app|dev|tv|info|xyz)\b/i;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_AUDIO_CHARS = 600_000; // about 450 KB of mp3: a short sentence is far smaller

/** Rough syllable count, good enough to flag hard words. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

const wordsOf = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);

/** True when this is one short, gentle, easy joke for children aged 3 to 8: one question, a short answer, plain everyday words. */
export function isCleanJoke(question: string, answer: string): boolean {
  const q = question.trim().replace(/\u2019/g, "'");
  const a = answer.trim().replace(/\u2019/g, "'");
  const text = `${q} ${a}`;
  if (!q.endsWith('?') || (text.match(/\?/g) ?? []).length !== 1) return false;
  if (!ALLOWED.test(text)) return false;
  if (URL_RE.test(text) || PERSONAL_ASK.test(text)) return false;
  const ws = wordsOf(text);
  if (ws.length < 4 || ws.length > MAX_WORDS) return false;
  if (wordsOf(q).length < 2 || wordsOf(a).length < 1) return false;
  if (ws.some((w) => BLOCKED_WORDS.includes(w))) return false;
  if (ws.some((w) => syllables(w) > MAX_SYLLABLES)) return false;
  return true;
}

/**
 * Should the Tell me a joke button ask the joke service? Yes, every time, whenever the TV is connected and a grown-up has
 * not switched the feature off. With no connection a stored joke is told straight away. (A single request that fails or is
 * too slow also falls back to a stored joke for that one press; the next press asks the service again.)
 */
export function shouldTryLiveJoke(o: { enabled: boolean; online: boolean }): boolean {
  return o.enabled && o.online;
}

/** Turns whatever the service sent into a LiveJoke, or null if any part of it is missing or not safe to use. */
export function parseLiveJoke(data: unknown): LiveJoke | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const { question, answer, audioQuestion, audioAnswer } = d;
  if (typeof question !== 'string' || typeof answer !== 'string' || typeof audioQuestion !== 'string' || typeof audioAnswer !== 'string') return null;
  if (!isCleanJoke(question, answer)) return null;
  for (const a of [audioQuestion, audioAnswer]) {
    if (a.length < 200 || a.length > MAX_AUDIO_CHARS || !BASE64.test(a)) return null;
  }
  return {
    question: question.trim().replace(/’/g, "'"),
    answer: answer.trim().replace(/’/g, "'"),
    audioQuestion,
    audioAnswer,
  };
}
