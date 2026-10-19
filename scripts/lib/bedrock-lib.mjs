// Shared logic for the Bedrock content pipeline. Build-time only: nothing in src/ imports this.
// Pure functions are unit-tested with a fake client (test/bedrock-pipeline.test.ts), no AWS needed.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KINDS, PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } from '../bedrock-prompts.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GENERATED_DIR = join(ROOT, 'voice', 'generated');

/** True when this module is the script being run (not imported). */
export const isMain = (metaUrl) => !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === metaUrl;

/** --key=value and --flag arguments. */
export function parseArgs(argv) {
  const a = {};
  for (const x of argv) { const m = /^--([^=]+)(?:=(.*))?$/.exec(x); if (m) a[m[1]] = m[2] ?? true; }
  return a;
}

/* ---------------------------------- text helpers --------------------------------- */

export const normalize = (t) => String(t).toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const words = (t) => normalize(t).split(' ').filter(Boolean);
export const sentences = (t) => (String(t).match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
/** Hash of the exact normalised text, stored with the guardrail verdict so edited text can never reuse an old pass. */
export const textHash = (t) => createHash('sha256').update(normalize(t)).digest('hex').slice(0, 16);
export const lineId = (kind, text) => `gen-${kind}-${createHash('sha1').update(normalize(text)).digest('hex').slice(0, 10)}`;

/** Rough syllable count, good enough to flag hard words. */
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/* ---------------------------------- local safety rules --------------------------------- */

// Words that must never be spoken to a 3-8 year old. Whole-word match, lowercase.
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
const PERSONAL_ASK = /\b(your (name|age|address|phone|school|home|house|mum|mom|dad|surname)|how old|where do you live|where you live)\b/i;
const URL_RE = /https?:|www\.|\bdot (com|org|net)\b|\b[a-z0-9-]+\.(com|org|net|io|co|ly|me|app|dev|tv|info|xyz)\b/i;
const MAX_TEXT = 300;

const ALLOWED_CHARS = /^[A-Za-z ,.!?'’-]+$/;
const LIMITS = {
  jokes: { maxWords: 12 }, // easy jokes for 3 to 5 year olds (prompt 1.2.0)
  riddles: { maxWords: 14 },
  'animal-facts': { maxWords: 12 },
  'talk-replies': { minSentences: 2, maxSentences: 3, maxSentenceWords: 10 },
  bedtime: { minSentences: 1, maxSentences: 2, maxSentenceWords: 12 },
};
const MAX_SYLLABLES = 3;

/**
 * Local rules. `item` is a normalised line: { text, topic? }.
 * Digits are only allowed for counting lines (talk-replies with topic "counting").
 * Returns { ok, reasons[] }.
 */
export function checkLocal(kind, item) {
  const text = String(item?.text ?? '').trim();
  const reasons = [];
  const lim = LIMITS[kind];
  if (!lim) return { ok: false, reasons: [`unknown kind ${kind}`] };
  if (!text) return { ok: false, reasons: ['empty'] };
  if (String(item.text) !== text) reasons.push('untrimmed');
  if (text.length > MAX_TEXT) return { ok: false, reasons: [...reasons, 'too-long'] };
  if (URL_RE.test(text)) reasons.push('url');
  if (text.includes('@')) reasons.push('email');
  const countingOk = kind === 'talk-replies' && item.topic === 'counting';
  if (/\d/.test(text) && !countingOk) reasons.push('digits');
  // counting lines may hold short numbers (one or two digits), never long digit runs like phone numbers
  const stripped = countingOk ? text.replace(/\b\d{1,2}\b/g, '') : text;
  if (countingOk && /\d/.test(stripped)) reasons.push('long-number');
  if (!ALLOWED_CHARS.test(stripped)) reasons.push('disallowed-characters');
  const ws = words(text);
  const bad = ws.filter((w) => BLOCKED_WORDS.includes(w));
  if (bad.length) reasons.push(`blocked-word:${[...new Set(bad)].join(',')}`);
  const hard = ws.filter((w) => syllables(w) > MAX_SYLLABLES);
  if (hard.length) reasons.push(`hard-word:${[...new Set(hard)].join(',')}`);
  const ss = sentences(text);
  if (lim.maxWords && ws.length > lim.maxWords) reasons.push(`too-long:${ws.length}>${lim.maxWords}`);
  if (lim.maxSentences && (ss.length < lim.minSentences || ss.length > lim.maxSentences)) reasons.push(`sentence-count:${ss.length}`);
  if (lim.maxSentenceWords && ss.some((s) => words(s).length > lim.maxSentenceWords)) reasons.push('sentence-too-long');
  if (kind === 'jokes' || kind === 'riddles') {
    const q = text.indexOf('?');
    if (q < 0 || (text.match(/\?/g) ?? []).length !== 1) reasons.push('needs-one-question-mark');
    else if (words(text.slice(0, q)).length < 2 || !/^[A-Za-z]/.test(text)) reasons.push('empty-question');
    else if (!text.slice(q + 1).trim()) reasons.push('missing-answer');
    else if (sentences(text.slice(q + 1)).length !== 1) reasons.push('answer-not-one-sentence');
  }
  if (kind === 'animal-facts' && ss.length !== 1) reasons.push('not-one-sentence');
  if (kind === 'animal-facts' && item.animal !== undefined && !normalize(text).includes(normalize(item.animal))) reasons.push('animal-not-mentioned');
  if (kind === 'talk-replies' && ss.some((s) => s.endsWith('?') && PERSONAL_ASK.test(s))) reasons.push('personal-question');
  return { ok: reasons.length === 0, reasons };
}

/* ---------------------------------- parse + validate model output --------------------------------- */

/** Pull one JSON object out of model text (tolerates code fences and chatter around it). */
export function parseModelJson(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty model response');
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON object in model response');
  s = s.slice(a, b + 1);
  let obj;
  try { obj = JSON.parse(s); } catch (e) { throw new Error(`bad JSON: ${e.message}`); }
  if (!obj || !Array.isArray(obj.items)) throw new Error('JSON has no "items" array');
  return obj;
}

const str = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const asQuestion = (q) => (q.endsWith('?') ? q : q.replace(/[.!]+$/, '') + '?');

/** Turn one raw model item into a normalised { text, topic?, animal? } or null if the shape is wrong. */
export function shapeItem(kind, raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') return null;
  if (kind === 'jokes' || kind === 'riddles') {
    const q = str(raw.question), a = str(raw.answer);
    return q && a ? { text: `${asQuestion(q)} ${a}` } : null;
  }
  if (kind === 'animal-facts') {
    const animal = str(raw.animal).toLowerCase(), fact = str(raw.fact);
    if (!fact || (ctx.animals && !ctx.animals.includes(animal))) return null;
    return { text: fact, animal };
  }
  if (kind === 'talk-replies') {
    const parts = Array.isArray(raw.sentences) ? raw.sentences.map(str).filter(Boolean) : [];
    return parts.length ? { text: parts.join(' '), topic: str(raw.topic).toLowerCase() || undefined } : null;
  }
  if (kind === 'bedtime') { const l = str(raw.line); return l ? { text: l } : null; }
  return null;
}

/** Validate a parsed response. Returns { valid: [item], rejected: [{raw, reasons}] }. */
export function validateBatch(kind, obj, ctx = {}) {
  const valid = [], rejected = [];
  for (const raw of obj.items) {
    const item = shapeItem(kind, raw, ctx);
    if (!item) { rejected.push({ raw, reasons: ['bad-shape'] }); continue; }
    const r = checkLocal(kind, item);
    if (r.ok) valid.push(item); else rejected.push({ raw: item.text, reasons: r.reasons });
  }
  return { valid, rejected };
}

/* ---------------------------------- dedupe --------------------------------- */

/** Drops items already in `seen` (a Set of normalised text, mutated) and repeats inside the batch. */
export function dedupe(items, seen) {
  const fresh = [], dupes = [];
  for (const it of items) {
    const k = normalize(it.text);
    if (!k || seen.has(k)) { dupes.push(it); continue; }
    seen.add(k);
    fresh.push(it);
  }
  return { fresh, dupes };
}

/** Existing lines in the app (src/core) plus earlier generated files. Returns { seen:Set, samples:{kind:[]}, animals:[] }. */
export async function loadExisting(root = ROOT, generatedDir = join(root, 'voice', 'generated')) {
  const load = (f) => import(pathToFileURL(join(root, 'src', 'core', f)).href);
  const [responses, talk, games] = await Promise.all([load('responses.ts'), load('talk.ts'), load('games.ts')]);
  const lines = [...talk.TALK_LINES, ...Object.values(games.ANIMAL_FACT), ...responses.JOKES];
  for (const j of responses.JOKES) { const q = j.indexOf('?'); lines.push(j.slice(0, q + 1), j.slice(q + 1).trim()); }
  for (const f of listGeneratedFiles(generatedDir)) for (const l of readGenerated(f).lines) lines.push(l.text);
  const seen = new Set(lines.map(normalize));
  const samples = {
    jokes: responses.JOKES, riddles: responses.JOKES, 'animal-facts': Object.values(games.ANIMAL_FACT),
    'talk-replies': talk.TALK_LINES, bedtime: [],
  };
  return { seen, samples, animals: [...games.ANIMALS] };
}

/* ---------------------------------- retry / backoff --------------------------------- */

const THROTTLE = new Set(['ThrottlingException', 'TooManyRequestsException', 'ServiceUnavailableException', 'ModelNotReadyException', 'ModelTimeoutException', 'InternalServerException']);
export const isThrottle = (e) => THROTTLE.has(e?.name) || e?.$retryable?.throttling === true || e?.$metadata?.httpStatusCode === 429;

/** Run fn(); on throttling wait baseMs * 2^n (+ jitter) and retry. `sleep` is injectable for tests. */
export async function withBackoff(fn, { retries: r0 = 5, baseMs: b0 = 1000, maxMs = 30000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry = () => {} } = {}) {
  const retries = Number.isFinite(Number(r0)) ? Number(r0) : 5, baseMs = Number.isFinite(Number(b0)) ? Number(b0) : 1000;
  for (let n = 0; ; n++) {
    try { return await fn(); } catch (e) {
      if (!isThrottle(e) || !(n < retries)) throw e;
      const wait = Math.min(maxMs, baseMs * 2 ** n) + Math.floor(Math.random() * 250);
      onRetry(n + 1, wait, e);
      await sleep(wait);
    }
  }
}

/** Turn raw AWS errors into messages that say what to do. */
export function explainAwsError(e, ctx = {}) {
  const name = e?.name ?? 'Error', msg = e?.message ?? String(e);
  if (/credentials|CredentialsProviderError|Could not load credentials/i.test(`${name} ${msg}`)) {
    return 'No AWS credentials found. Set AWS_PROFILE, or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (never commit them).';
  }
  if (name === 'AccessDeniedException' || /access to the model|not authorized|don't have access/i.test(msg)) {
    return `Bedrock says access is denied (${name}). Check: (1) model access is granted for "${ctx.model ?? 'your model'}" in region ${ctx.region ?? '?'} (Bedrock console > Model access); (2) your IAM user/role allows bedrock:InvokeModel and bedrock:ApplyGuardrail; (3) the model is offered in this region. Original: ${msg}`;
  }
  if (name === 'ResourceNotFoundException' || /model identifier is invalid|ResourceNotFound/i.test(msg)) {
    return `Bedrock cannot find the model or guardrail (${name}). Check --model / BEDROCK_MODEL_ID (some models need an inference profile id such as "us.<model>") and the guardrail id:version. Original: ${msg}`;
  }
  if (name === 'ValidationException') return `Bedrock rejected the request (ValidationException): ${msg}`;
  if (isThrottle(e)) return `Bedrock kept throttling the request (${name}). Wait a minute and retry, or ask for a higher quota.`;
  return `${name}: ${msg}`;
}

/* ---------------------------------- Bedrock adapter (SDK loaded lazily) --------------------------------- */

/** Real client. Imported lazily so tests and --dry-run never need the SDK or any credentials. */
export async function createBedrockClient(region) {
  let sdk;
  try { sdk = await import('@aws-sdk/client-bedrock-runtime'); } catch {
    throw new Error('Missing devDependency. Run: npm install --save-dev @aws-sdk/client-bedrock-runtime');
  }
  const client = new sdk.BedrockRuntimeClient({ region, maxAttempts: 1 }); // we do our own backoff
  return {
    converse: (input) => client.send(new sdk.ConverseCommand(input)),
    applyGuardrail: (input) => client.send(new sdk.ApplyGuardrailCommand(input)),
  };
}

export const splitGuardrail = (v) => {
  const [id, version] = String(v ?? '').split(':');
  return id && version ? { id, version } : null;
};

export function converseText(resp) {
  const parts = resp?.output?.message?.content ?? [];
  return parts.map((p) => p.text ?? '').join('').trim();
}

/* ---------------------------------- guardrail result handling --------------------------------- */

/**
 * Read an ApplyGuardrail response. verdict is "pass" only when action is NONE.
 * triggered lists every filter/topic/word/PII entity that fired, even if it only detected.
 */
export function interpretGuardrail(resp) {
  const triggered = [];
  const assessments = Array.isArray(resp?.assessments) ? resp.assessments : [];
  for (const a of assessments) {
    for (const t of a.topicPolicy?.topics ?? []) triggered.push(`topic:${t.name}`);
    for (const f of a.contentPolicy?.filters ?? []) triggered.push(`content:${f.type}`);
    for (const w of a.wordPolicy?.customWords ?? []) triggered.push(`word:${w.match}`);
    for (const w of a.wordPolicy?.managedWordLists ?? []) triggered.push(`managed-word:${w.type ?? w.match}`);
    for (const p of a.sensitiveInformationPolicy?.piiEntities ?? []) triggered.push(`pii:${p.type}`);
    for (const r of a.sensitiveInformationPolicy?.regexes ?? []) triggered.push(`regex:${r.name}`);
  }
  // pass only when nothing fired, even in detect-only mode
  const verdict = resp?.action === 'NONE' && triggered.length === 0 ? 'pass' : 'blocked';
  return { verdict, triggered: [...new Set(triggered)] };
}

export async function checkWithGuardrail(client, { id, version }, text, source = 'OUTPUT', backoff = {}) {
  const resp = await withBackoff(() => client.applyGuardrail({ guardrailIdentifier: id, guardrailVersion: version, source, content: [{ text: { text } }] }), backoff);
  return interpretGuardrail(resp);
}

/* ---------------------------------- generation --------------------------------- */

/**
 * Ask the model until `count` fresh, valid lines are collected or `maxAttempts` is used up.
 * Bad JSON and bad lines are retried. Returns { lines, stats }.
 */
export async function generateLines(client, opts) {
  const { kind, count, model, region, guardrail, seen, sample = [], animals = [], maxAttempts = 5, backoff = {}, log = () => {}, now = () => new Date() } = opts;
  if (!KINDS.includes(kind)) throw new Error(`Unknown kind "${kind}". Use one of: ${KINDS.join(', ')}`);
  const ctx = { animals, avoid: sample };
  const lines = [];
  const stats = { attempts: 0, badJson: 0, rejected: 0, dupes: 0, guardrailBlocked: 0 };
  while (lines.length < count && stats.attempts < maxAttempts) {
    stats.attempts++;
    const want = Math.min(20, count - lines.length + 2); // a little extra: some will be dropped
    const input = {
      modelId: model,
      system: [{ text: SYSTEM_PROMPT }],
      // With a guardrail, only the guardContent block is checked on the way IN. Our own instruction text ("do not ask for
      // personal facts", "return ONLY JSON") trips the High PROMPT_ATTACK filter and blocked whole jokes / talk-replies batches.
      // The model's OUTPUT is still checked by the guardrail here, and again line by line by bedrock-check.mjs.
      messages: [{ role: 'user', content: [{ text: buildUserPrompt(kind, want, ctx) }, ...(guardrail ? [{ guardContent: { text: { text: `Write short, gentle ${kind} lines for children.` } } }] : [])] }],
      inferenceConfig: { maxTokens: 4000, temperature: 0.8 },
      ...(guardrail ? { guardrailConfig: { guardrailIdentifier: guardrail.id, guardrailVersion: guardrail.version } } : {}),
    };
    let resp;
    try { resp = await withBackoff(() => client.converse(input), { ...backoff, onRetry: (n, ms) => log(`throttled, retry ${n} in ${ms} ms`) }); }
    catch (e) { throw new Error(explainAwsError(e, { model, region })); }
    if (resp?.stopReason === 'guardrail_intervened') { stats.guardrailBlocked++; log('guardrail blocked a whole response, retrying'); continue; }
    if (resp?.stopReason === 'max_tokens') log('response was cut off (max_tokens); it will likely fail JSON parsing');
    let parsed;
    try { parsed = parseModelJson(converseText(resp)); } catch (e) { stats.badJson++; log(`attempt ${stats.attempts}: ${e.message}, retrying`); continue; }
    const { valid, rejected } = validateBatch(kind, parsed, ctx);
    stats.rejected += rejected.length;
    const { fresh, dupes } = dedupe(valid, seen);
    stats.dupes += dupes.length;
    const date = now().toISOString();
    for (const it of fresh.slice(0, count - lines.length)) {
      lines.push({
        id: lineId(kind, it.text), kind, text: it.text,
        ...(it.animal ? { animal: it.animal } : {}), ...(it.topic ? { topic: it.topic } : {}),
        status: 'pending', generatedWith: { model, region, date, promptVersion: PROMPT_VERSION },
      });
    }
    log(`attempt ${stats.attempts}: +${fresh.length} ok, ${rejected.length} rejected, ${dupes.length} duplicates (${lines.length}/${count})`);
  }
  return { lines, stats };
}

/* ---------------------------------- generated files --------------------------------- */

export const listGeneratedFiles = (dir = GENERATED_DIR) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'safety-report.json').map((f) => join(dir, f)) : [];

export function readGenerated(file) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  if (!j || !Array.isArray(j.lines)) throw new Error(`${file} is not a generated-lines file`);
  return j;
}

export function writeJson(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

/** A line can reach the app only if: approved by a human, guardrail passed, local rules pass. */
export const isEligible = (l) => l?.safety?.guardrail?.verdict === 'pass' && l?.safety?.local?.ok === true && l.safety.guardrail.textHash === textHash(l.text);
export const isImportable = (l) => l?.status === 'approved' && isEligible(l) && typeof l.review?.reviewer === 'string' && l.review.reviewer.trim() !== '' && !!l.review.date;
