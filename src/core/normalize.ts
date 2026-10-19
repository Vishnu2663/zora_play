// Input normalization: turns a transcript (or a Talk Wheel phrase) into
// clean lowercase tokens. Never evaluates input; it is only ever matched
// against fixed word lists.

const FILLERS = new Set([
  'milo', 'zora', 'please', 'um', 'uh', 'umm', 'hmm', 'ok', 'okay', 'oh', 'pls', 'plz', 'dragon', 'buddy',
]);

const LEADING_PHRASES = [
  'can you', 'could you', 'will you', 'would you', 'i want you to', 'i want to', 'i wanna',
  'do you want to', 'you should', 'go ahead and', 'now',
];

export interface Normalized {
  text: string; // cleaned sentence (fillers removed)
  tokens: string[];
  raw: string; // lowercased original (used only for privacy checks; never stored)
}

export function normalize(input: string): Normalized {
  const raw = String(input ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .slice(0, 200); // bound input size

  let text = raw
    .replace(/let's/g, 'lets')
    .replace(/\bi'm\b/g, 'im')
    .replace(/\bi am\b/g, 'im')
    .replace(/\bwhat's\b/g, 'what is')
    .replace(/\bdon't\b/g, 'dont')
    .replace(/'/g, '')
    .replace(/[^a-z0-9@\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove polite/lead-in phrases at the start, repeatedly.
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of LEADING_PHRASES) {
      if (text === p) { text = ''; changed = true; }
      else if (text.startsWith(p + ' ')) { text = text.slice(p.length + 1); changed = true; }
    }
    const first = text.split(' ')[0];
    if (first && (first === 'hey' || first === 'hi') && text.split(' ').length > 2 && (text.split(' ')[1] === 'milo' || text.split(' ')[1] === 'zora')) {
      text = text.split(' ').slice(2).join(' ');
      changed = true;
    }
  }

  const tokens = text.split(' ').filter((t) => t && !FILLERS.has(t));
  return { text: tokens.join(' '), tokens, raw };
}

/** Damerau (optimal string alignment) distance: a swapped pair ("dnace") counts as one edit. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const PRIVATE_PATTERNS: RegExp[] = [
  /\bmy name is\b/,
  /\bmy names\b/,
  /\bi live\b/,
  /\bmy (home )?address\b/,
  /\bmy (phone|number|school|teacher|street|house|password|email)\b/,
  /\bi go to\b.*\bschool\b/,
  /\bmy (mom|mum|dad)s? (name|phone|number)\b/,
  /\d{3,}/, // phone numbers, house numbers, codes
  /@/,
];

/** True when the utterance looks like personal information. Nothing is stored either way. */
export function looksPrivate(raw: string): boolean {
  return PRIVATE_PATTERNS.some((re) => re.test(raw));
}
