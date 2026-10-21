// Age rules for a live joke: children aged 3 to 8. Used by the Lambda (index.mjs). src/core/liveJoke.ts applies the SAME rules on
// the TV, and test/liveJoke.test.ts fails if the two ever disagree or if the blocked words differ from the build pipeline's list.

export const MAX_WORDS = 14;
export const MAX_SYLLABLES = 3; // a word of four or more syllables is too hard for a 3 year old

export const BLOCKED_WORDS = [
  'kill', 'killed', 'die', 'died', 'dead', 'death', 'blood', 'bloody', 'gun', 'knife', 'weapon', 'bomb', 'war', 'fight', 'hit', 'hate', 'stupid', 'dumb', 'idiot', 'ugly', 'fat',
  'scary', 'scared', 'monster', 'ghost', 'nightmare', 'demon', 'devil', 'hell', 'damn', 'crap', 'sucks', 'shut',
  'kiss', 'boyfriend', 'girlfriend', 'date', 'sexy', 'beer', 'wine', 'drunk', 'drug', 'drugs', 'smoke', 'cigarette',
  'doctor', 'medicine', 'pill', 'pills', 'sick', 'hospital', 'cancer', 'virus', 'vote', 'election', 'president', 'god', 'church',
  'google', 'amazon', 'disney', 'coca', 'pepsi', 'mcdonalds', 'youtube', 'tiktok', 'netflix', 'lego', 'barbie', 'pokemon',
  'address', 'phone', 'password', 'school',
  // inflections and extras
  'kills', 'killing', 'dies', 'dying', 'monsters', 'ghosts', 'scarier', 'scariest', 'scare', 'scares', 'bombs', 'guns', 'knives', 'weapons', 'fights', 'fighting',
  'hates', 'hurt', 'hurts', 'afraid', 'cry', 'cries', 'steal', 'stole', 'stab', 'shoot', 'poop', 'fart', 'loser', 'drugs', 'beers', 'blind', 'cigarettes',
];

const ALLOWED_CHARS = /^[A-Za-z ,.!?'-]+$/;
const PERSONAL_ASK = /\b(your (name|age|address|phone|school|home|house|mum|mom|dad|surname)|how old|where do you live|where you live)\b/i;
const URL_RE = /https?:|www\.|\bdot (com|org|net)\b|\b[a-z0-9-]+\.(com|org|net|io|co|ly|me|app|dev|tv|info|xyz)\b/i;

/** Rough syllable count, good enough to flag hard words. */
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

const wordsOf = (t) => t.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);

/** True when this question and answer make one short, gentle, easy joke for ages 3 to 8. */
export function isJokeForAges3to8(question, answer) {
  if (typeof question !== 'string' || typeof answer !== 'string') return false;
  const q = question.trim().replace(/’/g, "'");
  const a = answer.trim().replace(/’/g, "'");
  const text = `${q} ${a}`;
  if (!q.endsWith('?') || (text.match(/\?/g) || []).length !== 1) return false;
  if (!ALLOWED_CHARS.test(text)) return false;
  if (URL_RE.test(text) || PERSONAL_ASK.test(text)) return false;
  const ws = wordsOf(text);
  if (ws.length < 4 || ws.length > MAX_WORDS) return false;
  if (wordsOf(q).length < 2 || wordsOf(a).length < 1) return false;
  if (ws.some((w) => BLOCKED_WORDS.includes(w))) return false;
  if (ws.some((w) => syllables(w) > MAX_SYLLABLES)) return false;
  return true;
}
