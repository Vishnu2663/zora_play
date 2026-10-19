// Tests for the Bedrock content pipeline. No AWS needed: a fake client stands in for Bedrock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkLocal, checkWithGuardrail, dedupe, explainAwsError, generateLines, interpretGuardrail, isImportable,
  normalize, parseModelJson, validateBatch, withBackoff, lineId, textHash,
} from '../scripts/lib/bedrock-lib.mjs';
import { checkFiles } from '../scripts/bedrock-check.mjs';
import { collect, main as importMain, render } from '../scripts/import-approved.mjs';
import { decide } from '../scripts/review-lines.mjs';
import { PROMPT_VERSION, buildUserPrompt } from '../scripts/bedrock-prompts.mjs';
import { allPhrases, segment } from '../src/core/phrases.ts';
import { JOKES } from '../src/core/responses.ts';

const ROOT = join(import.meta.dirname, '..');
const text = (s: string) => ({ output: { message: { content: [{ text: s }] } }, stopReason: 'end_turn' });
const err = (name: string) => Object.assign(new Error(name), { name });
const noSleep = { sleep: async () => {}, baseMs: 1 };

/* ------------------------------ parsing + validation ------------------------------ */

test('parseModelJson accepts plain, fenced and chatty JSON; rejects bad JSON', () => {
  const j = '{"items":[{"line":"Rest now."}]}';
  assert.equal(parseModelJson(j).items.length, 1);
  assert.equal(parseModelJson('```json\n' + j + '\n```').items.length, 1);
  assert.equal(parseModelJson('Here you go:\n' + j + '\nEnjoy!').items.length, 1);
  assert.throws(() => parseModelJson('not json'), /no JSON/);
  assert.throws(() => parseModelJson('{"items": [oops]}'), /bad JSON/);
  assert.throws(() => parseModelJson('{"things":[]}'), /items/);
  assert.throws(() => parseModelJson(''), /empty/);
});

test('validateBatch shapes every kind and rejects bad shapes', () => {
  const jokes = validateBatch('jokes', { items: [{ question: 'Why is the cat happy', answer: 'It has a nap!' }, { question: 'x' }, 'str'] });
  assert.equal(jokes.valid[0].text, 'Why is the cat happy? It has a nap!');
  assert.equal(jokes.rejected.length, 2);
  const facts = validateBatch('animal-facts', { items: [{ animal: 'dog', fact: 'Dogs love to play.' }, { animal: 'dragon', fact: 'Dragons are big.' }] }, { animals: ['dog', 'cat'] });
  assert.equal(facts.valid.length, 1);
  assert.equal(facts.valid[0].animal, 'dog');
  const talk = validateBatch('talk-replies', { items: [{ topic: 'kindness', sentences: ['Being kind is great.', 'Can you share a smile?'] }] });
  assert.equal(talk.valid[0].text, 'Being kind is great. Can you share a smile?');
  assert.equal(validateBatch('bedtime', { items: [{ line: 'The stars are sleepy.' }] }).valid.length, 1);
});

/* ------------------------------ local safety rules ------------------------------ */

test('local rules accept good lines', () => {
  assert.ok(checkLocal('jokes', { text: 'Why did the duck smile? It saw a pond!' }).ok);
  assert.ok(checkLocal('riddles', { text: 'What has four legs and says moo? A cow!' }).ok);
  assert.ok(checkLocal('animal-facts', { text: 'Frogs can jump really far.' }).ok);
  assert.ok(checkLocal('talk-replies', { text: 'Being kind is great. Can you share a smile today?' }).ok);
  assert.ok(checkLocal('bedtime', { text: 'The moon is up. Time to rest.' }).ok);
});

test('local rules reject length, digits, urls, emails, odd punctuation, blocked and hard words', () => {
  const r = (k: string, t: string, extra = {}) => checkLocal(k, { text: t, ...extra }).reasons.join('|');
  assert.match(r('jokes', 'Why did the little duck decide to go all the way to the big pond today? To swim!'), /too-long/);
  assert.match(r('animal-facts', 'Dogs have 4 legs.'), /digits/);
  assert.match(r('animal-facts', 'Visit www.dogs.com now.'), /url/);
  assert.match(r('animal-facts', 'Mail dog@zoo.org please.'), /email/);
  assert.match(r('animal-facts', 'Dogs are cool (really).'), /disallowed-characters/);
  assert.match(r('animal-facts', 'Dogs love Disney.'), /blocked-word:disney/);
  assert.match(r('jokes', 'Why is the monster scary? It is!'), /blocked-word/);
  assert.match(r('animal-facts', 'Elephants are extraordinarily magnificent.'), /hard-word/);
  assert.match(r('jokes', 'No question here.'), /needs-one-question-mark/);
  assert.match(r('jokes', 'Why? Why? Because.'), /needs-one-question-mark/);
  assert.match(r('jokes', 'Why?'), /empty-question/);
  assert.match(r('jokes', 'Why is it so? '), /untrimmed|missing-answer/);
  assert.match(r('jokes', 'Why is it so? So. Yes!'), /answer-not-one-sentence/);
  assert.match(r('talk-replies', 'Hello there.'), /sentence-count/);
  assert.match(r('animal-facts', 'Dogs run. Cats nap.'), /not-one-sentence/);
});

test('digits are allowed only in counting talk replies', () => {
  assert.ok(checkLocal('talk-replies', { text: 'Count with me. 1, 2, 3!', topic: 'counting' }).ok);
  assert.ok(!checkLocal('talk-replies', { text: 'Count with me. 1, 2, 3!', topic: 'colours' }).ok);
});

/* ------------------------------ dedupe ------------------------------ */

test('dedupe drops repeats of existing lines and within a batch (case/punctuation blind)', () => {
  const seen = new Set([normalize('Hens lay eggs.')]);
  const { fresh, dupes } = dedupe([{ text: 'hens lay eggs' }, { text: 'Cats purr.' }, { text: 'CATS PURR!' }], seen);
  assert.deepEqual(fresh.map((f: { text: string }) => f.text), ['Cats purr.']);
  assert.equal(dupes.length, 2);
  assert.ok(seen.has('cats purr'));
});

/* ------------------------------ retry / backoff ------------------------------ */

test('withBackoff retries throttling with growing waits, then succeeds', async () => {
  let calls = 0; const waits: number[] = [];
  const v = await withBackoff(async () => { if (++calls < 3) throw err('ThrottlingException'); return 'ok'; }, { baseMs: 100, sleep: async (ms: number) => { waits.push(ms); } });
  assert.equal(v, 'ok'); assert.equal(calls, 3);
  assert.ok(waits[0] >= 100 && waits[0] < 400 && waits[1] >= 200 && waits[1] < 500 && waits[1] > waits[0] - 250);
});

test('withBackoff gives up after the retry limit and never retries other errors', async () => {
  let calls = 0;
  await assert.rejects(withBackoff(async () => { calls++; throw err('ThrottlingException'); }, { retries: 2, ...noSleep }), /Throttling/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(withBackoff(async () => { calls++; throw err('ValidationException'); }, { ...noSleep }), /Validation/);
  assert.equal(calls, 1);
});

test('explainAwsError names the fix for missing model access, credentials and bad model id', () => {
  assert.match(explainAwsError(err('AccessDeniedException'), { model: 'm1', region: 'us-east-1' }), /Model access.*bedrock:InvokeModel/s);
  assert.match(explainAwsError(Object.assign(new Error('x'), { name: 'CredentialsProviderError' })), /No AWS credentials/);
  assert.match(explainAwsError(err('ResourceNotFoundException')), /inference profile/);
});

/* ------------------------------ generation with a fake client ------------------------------ */

const jokeJson = (...qa: [string, string][]) => text(JSON.stringify({ items: qa.map(([question, answer]) => ({ question, answer })) }));

test('generateLines retries bad JSON and throttling, filters bad and duplicate lines, stamps metadata', async () => {
  const replies = [
    () => { throw err('ThrottlingException'); },
    () => text('sorry, no json'),
    () => jokeJson(['Why is the pig happy?', 'It rolled in mud!'], ['Why is the pig happy?', 'It rolled in mud!'], ['Why is the ghost scary?', 'Boo!'], ['Existing joke here?', 'Yes it is!']),
    () => jokeJson(['What do ducks wear?', 'Quack suits!'], ['Where do bees nap?', 'In a hive-ing room!']),
  ];
  const calls: any[] = [];
  const client = { converse: async (i: unknown) => { calls.push(i); return replies[calls.length - 1](); }, applyGuardrail: async () => ({}) };
  const seen = new Set([normalize('Existing joke here? Yes it is!')]);
  const { lines, stats } = await generateLines(client, { kind: 'jokes', count: 3, model: 'test-model', region: 'test-region', seen, backoff: noSleep, now: () => new Date('2026-01-02T03:04:05Z') });
  assert.equal(lines.length, 3);
  assert.equal(calls.length, 4);
  assert.equal(stats.badJson, 1);
  assert.equal(stats.rejected, 1, 'the ghost joke fails local rules');
  assert.equal(stats.dupes, 2);
  for (const l of lines) {
    assert.equal(l.status, 'pending');
    assert.deepEqual(l.generatedWith, { model: 'test-model', region: 'test-region', date: '2026-01-02T03:04:05.000Z', promptVersion: PROMPT_VERSION });
    assert.equal(l.id, lineId('jokes', l.text));
  }
  assert.equal(calls[0].modelId, 'test-model');
  assert.equal(calls[0].guardrailConfig, undefined);
});

test('generateLines passes the guardrail to Converse and survives a blocked response', async () => {
  let n = 0; const inputs: any[] = [];
  const client = {
    converse: async (i: any) => { inputs.push(i); return ++n === 1 ? { stopReason: 'guardrail_intervened', output: { message: { content: [{ text: 'blocked' }] } } } : text(JSON.stringify({ items: [{ line: 'The moon is up.' }] })); },
    applyGuardrail: async () => ({}),
  };
  const { lines, stats } = await generateLines(client, { kind: 'bedtime', count: 1, model: 'm', region: 'r', guardrail: { id: 'gr1', version: '2' }, seen: new Set(), backoff: noSleep });
  assert.equal(lines.length, 1);
  assert.equal(stats.guardrailBlocked, 1);
  assert.deepEqual(inputs[0].guardrailConfig, { guardrailIdentifier: 'gr1', guardrailVersion: '2' });
});

test('generateLines stops after maxAttempts and explains access errors', async () => {
  const empty = { converse: async () => text('{"items":[]}'), applyGuardrail: async () => ({}) };
  const r = await generateLines(empty, { kind: 'bedtime', count: 2, model: 'm', region: 'r', seen: new Set(), maxAttempts: 2, backoff: noSleep });
  assert.equal(r.lines.length, 0); assert.equal(r.stats.attempts, 2);
  const denied = { converse: async () => { throw err('AccessDeniedException'); }, applyGuardrail: async () => ({}) };
  await assert.rejects(generateLines(denied, { kind: 'bedtime', count: 1, model: 'm', region: 'r', seen: new Set(), backoff: noSleep }), /Model access/);
});

test('dry-run prompt text carries the safety rules and the kind task', () => {
  const p = buildUserPrompt('animal-facts', 5, { animals: ['dog', 'cat'], avoid: ['Hens lay eggs.'] });
  assert.match(p, /dog, cat/); assert.match(p, /Hens lay eggs/); assert.match(p, /"items"/);
  assert.throws(() => buildUserPrompt('poems', 1), /Unknown kind/);
});

/* ------------------------------ guardrail result handling ------------------------------ */

test('interpretGuardrail: NONE passes; intervention lists every triggered filter', () => {
  assert.deepEqual(interpretGuardrail({ action: 'NONE', assessments: [] }), { verdict: 'pass', triggered: [] });
  const r = interpretGuardrail({
    action: 'GUARDRAIL_INTERVENED',
    assessments: [{
      contentPolicy: { filters: [{ type: 'VIOLENCE', action: 'BLOCKED' }] },
      topicPolicy: { topics: [{ name: 'Scary', action: 'BLOCKED' }] },
      wordPolicy: { customWords: [{ match: 'bad' }] },
      sensitiveInformationPolicy: { piiEntities: [{ type: 'EMAIL' }] },
    }],
  });
  assert.equal(r.verdict, 'blocked');
  assert.deepEqual(r.triggered.sort(), ['content:VIOLENCE', 'pii:EMAIL', 'topic:Scary', 'word:bad']);
  assert.equal(interpretGuardrail(undefined).verdict, 'blocked', 'no answer is never a pass');
});

function tmpGenerated(lines: object[], kind = 'bedtime') {
  const dir = mkdtempSync(join(tmpdir(), 'zp-gen-'));
  const file = join(dir, `${kind}.json`);
  writeFileSync(file, JSON.stringify({ metadata: { kind }, lines }));
  return { dir, file };
}
const mk = (id: string, t: string, status = 'pending', kind = 'bedtime') => ({ id, kind, text: t, status });

test('checkFiles calls ApplyGuardrail per line, stamps safety, and pulls back approved lines that now fail', async () => {
  const { file } = tmpGenerated([mk('a', 'The moon is up.'), mk('b', 'Time to rest.'), mk('c', 'Sleep tight, little star.', 'approved')]);
  const seenInputs: any[] = [];
  const client = {
    converse: async () => ({}),
    applyGuardrail: async (i: any) => { seenInputs.push(i); return i.content[0].text.text.includes('rest') ? { action: 'GUARDRAIL_INTERVENED', assessments: [{ contentPolicy: { filters: [{ type: 'MISCONDUCT' }] } }] } : { action: 'NONE', assessments: [] }; },
  };
  const gr = { id: 'g1', version: '1' };
  const report = await checkFiles({ files: [file], client, guardrail: gr, now: () => new Date('2026-02-03T00:00:00Z') });
  assert.equal(report.length, 3);
  assert.equal(seenInputs[0].source, 'OUTPUT');
  assert.equal(seenInputs[0].guardrailIdentifier, 'g1');
  assert.deepEqual(report.map((r: any) => r.eligible), [true, false, true]);
  assert.deepEqual(report[1].triggered, ['content:MISCONDUCT']);
  assert.equal(report[1].guardrail, 'g1:1');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.lines[1].safety.guardrail.verdict, 'blocked');
  // second run: same guardrail version is not re-called
  await checkFiles({ files: [file], client, guardrail: gr });
  assert.equal(seenInputs.length, 3);
  // a stricter local rule failing demotes an approved line
  const { file: f2 } = tmpGenerated([mk('d', 'Dogs have 4 legs.', 'approved', 'animal-facts')], 'animal-facts');
  await checkFiles({ files: [f2], client, guardrail: gr });
  assert.equal(JSON.parse(readFileSync(f2, 'utf8')).lines[0].status, 'pending');
  // OUTPUT/INPUT source is honoured
  await checkFiles({ files: [file], client, guardrail: gr, source: 'INPUT', recheck: true });
  assert.equal(seenInputs.at(-1).source, 'INPUT');
});

test('checkWithGuardrail retries throttling', async () => {
  let n = 0;
  const client = { converse: async () => ({}), applyGuardrail: async () => { if (++n < 2) throw err('ThrottlingException'); return { action: 'NONE' }; } };
  const r = await checkWithGuardrail(client, { id: 'g', version: '1' }, 'Hi.', 'OUTPUT', noSleep);
  assert.equal(r.verdict, 'pass'); assert.equal(n, 2);
});

/* ------------------------------ review gate + approved-only import ------------------------------ */

const S = (l: any, verdict = 'pass', review = true) => ({
  ...l,
  safety: { local: { ok: true, reasons: [] }, guardrail: { verdict, triggered: [], id: 'g', version: '1', textHash: textHash(l.text) } },
  ...(review && l.status === 'approved' ? { review: { reviewer: 'Pat Lee', date: '2026-01-01T00:00:00Z' } } : {}),
});

test('review: only checked, eligible lines can be approved, and a reviewer is required', () => {
  const ok = S(mk('a', 'The moon is up.'));
  assert.throws(() => decide({ ...ok }, 'approved', ''), /reviewer/);
  assert.throws(() => decide(mk('b', 'No check yet.'), 'approved', 'Pat Lee'), /Cannot approve/);
  assert.throws(() => decide(S(mk('a', 'The moon is up.'), 'blocked'), 'approved', 'Pat Lee'), /Cannot approve/);
  const l = decide({ ...ok }, 'approved', 'Pat Lee', () => new Date('2026-03-04T00:00:00Z'));
  assert.deepEqual(l.review, { reviewer: 'Pat Lee', date: '2026-03-04T00:00:00.000Z' });
  assert.equal(decide(mk('c', 'Rejected one.'), 'rejected', 'Pat Lee').status, 'rejected');
});

test('import: only approved + eligible + locally valid lines are collected', () => {
  const dirJ = tmpGenerated([
    S(mk('j1', 'Why do cows nap? They are mooo-ved!', 'approved', 'jokes')),
    S(mk('j2', 'Pending joke here? Yes!', 'pending', 'jokes')),
    S(mk('j3', 'Rejected joke here? Yes!', 'rejected', 'jokes')),
    { ...mk('j4', 'Approved but unchecked? Yes!', 'approved', 'jokes') },
    S(mk('j5', 'Approved but blocked? Yes!', 'approved', 'jokes'), 'blocked'),
    S(mk('j6', 'Approved but has 7 digits? Yes!', 'approved', 'jokes')),
  ], 'jokes');
  const dirF = tmpGenerated([S({ ...mk('f1', 'Frogs can jump really far.', 'approved', 'animal-facts'), animal: 'frog' })], 'animal-facts');
  const { out, skipped } = collect([dirJ.file, dirF.file]);
  assert.deepEqual(out.jokes, ['Why do cows nap? They are mooo-ved!']);
  assert.deepEqual({ ...out.facts }, { frog: ['Frogs can jump really far.'] });
  assert.deepEqual(skipped.map((s: any) => s.id).sort(), ['j4', 'j5', 'j6']);
  assert.ok(!isImportable(mk('x', 'y', 'approved')));
  const src = render(out);
  assert.match(src, /JOKES_GENERATED: string\[\] = \[\n  "Why do cows nap\?/);
  assert.match(src, /"frog": \[/);
  assert.doesNotMatch(src, /Pending joke/);
});

test('import: writes generatedLines.ts, and --dry-run writes nothing', async () => {
  const d = tmpGenerated([S(mk('b1', 'The moon is up.', 'approved'))]);
  const target = join(d.dir, 'out.ts');
  await importMain(['--dry-run'], d.dir, target);
  assert.throws(() => statSync(target));
  await importMain([], d.dir, target);
  assert.match(readFileSync(target, 'utf8'), /BEDTIME_LINES: string\[\] = \[\n  "The moon is up\."/);
});

/* ------------------------------ app stays offline + catalog ------------------------------ */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

test('nothing in src/ imports the AWS SDK or scripts/, and the SDK is a devDependency only', () => {
  for (const f of walk(join(ROOT, 'src')).filter((p) => /\.(ts|tsx|js|mjs)$/.test(p))) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /@aws-sdk|aws-sdk|client-bedrock|smithy/i, f);
    assert.doesNotMatch(s, /from ['"][./]*\/?scripts\//, f);
    assert.doesNotMatch(s, /bedrock/i, f);
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies?.['@aws-sdk/client-bedrock-runtime'], undefined);
  const lock = readFileSync(join(ROOT, 'package-lock.json'), 'utf8');
  if (lock.includes('@aws-sdk/client-bedrock-runtime')) assert.ok(pkg.devDependencies?.['@aws-sdk/client-bedrock-runtime'], 'SDK must be a devDependency');
});

test('every spoken line, including generated ones, is voiced (in the catalog)', () => {
  for (const j of JOKES) assert.deepEqual(segment(j).missing, [], j);
  const texts = new Set(allPhrases().map((p) => p.text));
  for (const j of JOKES) { const q = j.indexOf('?'); assert.ok(texts.has(j.slice(0, q + 1)) && texts.has(j.slice(q + 1).trim()), j); }
});

/* ------------------------------ review-driven hardening ------------------------------ */

test('a guardrail pass is tied to the exact text: edited text is not eligible and is re-checked', async () => {
  const good = S(mk('e1', 'The moon is up.', 'approved'));
  assert.ok(isImportable(good));
  assert.ok(!isImportable({ ...good, text: 'Evil edited line now.' }), 'edited text must not reuse the old pass');
  assert.ok(!isImportable({ ...good, review: undefined }), 'approval needs a reviewer and date');
  const { file } = tmpGenerated([{ ...good, text: 'Time to rest.' }]);
  let calls = 0;
  const client = { converse: async () => ({}), applyGuardrail: async () => { calls++; return { action: 'NONE', assessments: [] }; } };
  await checkFiles({ files: [file], client, guardrail: { id: 'g', version: '1' } });
  assert.equal(calls, 1, 'hash mismatch forces a new ApplyGuardrail call');
});

test('guardrail detect-only (action NONE but a filter fired) is not a pass; odd responses do not throw', () => {
  const r = interpretGuardrail({ action: 'NONE', assessments: [{ contentPolicy: { filters: [{ type: 'HATE', action: 'NONE' }] } }] });
  assert.equal(r.verdict, 'blocked');
  assert.equal(interpretGuardrail({ action: 'NONE', assessments: 'oops' }).verdict, 'pass');
});

test('import survives odd animal keys and rejects wrong animals', () => {
  const mkF = (id: string, t: string, animal: string) => S({ ...mk(id, t, 'approved', 'animal-facts'), animal });
  const { file } = tmpGenerated([mkF('p1', 'Dogs like to run.', '__proto__'), mkF('p2', 'Cats like to nap.', 'dog'), mkF('p3', 'Dragons fly high.', 'dragon'), mkF('p4', 'Frogs can jump really far.', 'frog')], 'animal-facts');
  const { out, skipped } = collect([file], ['dog', 'cat', 'frog']);
  assert.deepEqual({ ...out.facts }, { frog: ['Frogs can jump really far.'] });
  assert.equal(skipped.length, 3);
});

test('stricter local rules: empty question, urls, personal questions, long numbers, untrimmed, huge text', () => {
  const r = (k: string, t: string, extra = {}) => checkLocal(k, { text: t, ...extra }).reasons.join('|');
  assert.match(r('jokes', '? Boo!'), /empty-question|needs/);
  assert.match(r('jokes', 'Why? Boo!'), /empty-question/);
  assert.match(r('bedtime', 'Go to example.io now.'), /url/);
  assert.match(r('bedtime', 'Visit zora dot com now.'), /url/);
  assert.match(r('talk-replies', 'What is your name? Tell me please.'), /personal-question/);
  assert.match(r('talk-replies', 'Call 5551234 now. Ok then.', { topic: 'counting' }), /long-number/);
  assert.equal(r('talk-replies', 'Count with me. 1, 2, 3!', { topic: 'counting' }), '');
  assert.match(r('bedtime', 'Rest now. '), /untrimmed/);
  assert.match(r('bedtime', 'a'.repeat(90000)), /too-long/);
  assert.match(r('bedtime', 'The monsters sleep.'), /blocked-word/);
  assert.match(r('animal-facts', 'Cats like to nap.', { animal: 'dog' }), /animal-not-mentioned/);
});

test('reviewer must be a real name; withBackoff survives NaN options', async () => {
  const ok = S(mk('r1', 'The moon is up.'));
  assert.throws(() => decide({ ...ok }, 'approved', 'Your Name'), /placeholder/);
  assert.throws(() => decide({ ...ok }, 'approved', true as unknown as string), /reviewer/);
  assert.throws(() => decide({ ...ok }, 'approved', '   '), /reviewer/);
  let calls = 0;
  await assert.rejects(withBackoff(async () => { calls++; throw err('ThrottlingException'); }, { retries: NaN, baseMs: NaN, sleep: async () => {} }), /Throttling/);
  assert.equal(calls, 6);
});
