import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { allPhrases, phraseId, segment, splitSentences, SPEAK_AS, TEMPLATE_LINES } from '../src/core/phrases.ts';
import { SAY, FEELING_REPLY, JOKES, line } from '../src/core/responses.ts';
import { MiloBrain } from '../src/core/brain.ts';

test('every catalog phrase has a unique, stable, file-safe id', () => {
  const ps = allPhrases();
  assert.ok(ps.length > 100, `only ${ps.length} phrases`);
  const ids = new Set(ps.map((p) => p.id));
  assert.equal(ids.size, ps.length, 'ids are unique');
  for (const p of ps) assert.match(p.id, /^[a-z0-9-]+-[0-9a-f]{6}$/, p.id);
  assert.equal(phraseId("Let's wiggle!"), phraseId("let's wiggle"), 'punctuation/case do not change the id');
});

test('every response-catalog line is covered', () => {
  const all = [...Object.values(SAY).flat(), ...Object.values(FEELING_REPLY).flat(), ...JOKES];
  for (const l of all) assert.deepEqual(segment(l).missing, [], l);
});

test('composed lines split into sentence clips; unknown sentences are reported, never dropped', () => {
  const r = segment("Surprise! Wobble wobble!");
  assert.deepEqual(r.phrases.map((p) => p.text), ['Surprise!', 'Wobble wobble!']);
  const g = segment(`${SAY.goodTry[0]} Find the star!`);
  assert.deepEqual(g.missing, []);
  assert.equal(g.phrases.length, 2);
  const bad = segment('Hello there! Buy a pony now!');
  assert.deepEqual(bad.missing, ['Hello there!', 'Buy a pony now!']);
  assert.deepEqual(splitSentences('Ahh. All calm. You did great!'), ['Ahh.', 'All calm.', 'You did great!']);
  assert.equal(segment('Ahh. All calm. You did great!').phrases.length, 1, 'whole line preferred over pieces');
});

test('templated lines are fully enumerated', () => {
  assert.deepEqual(segment('Find the diamond!').missing, []);
  assert.deepEqual(segment("Milo's Lullaby").missing, []);
  assert.deepEqual(segment("Yes! It's a dog!").missing, []);
  assert.deepEqual(segment('Who makes this noise?').missing, []);
  for (const t of TEMPLATE_LINES) assert.ok(t.lines.length > 0, t.template);
});

test('lines that read badly aloud get a spoken form', () => {
  const p = allPhrases().find((x) => x.text in SPEAK_AS)!;
  assert.notEqual(p.speak, p.text);
});

test('every brain reaction can be voiced (many random runs)', () => {
  let rng = 1;
  const r = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  const inputs = ['dance', 'faster', 'slower', 'again', 'stop', 'sing', 'jump', 'wave', 'clap', 'spin', 'laugh', 'tell me a joke',
    'go to sleep', 'dance', 'wake up', 'wake up', "let's play", 'dragon breath', 'say hello', 'say roar', 'repeat after me banana', 'hi',
    'what can you do', 'surprise me', 'surprise me', 'surprise me', "i'm sad", "i'm scared", "i'm happy", "i'm tired", "i'm bored", "i'm angry",
    'my name is Sam', 'dance and sing', 'order pizza', 'pause', 'keep going'];
  for (let run = 0; run < 20; run++) {
    const b = new MiloBrain(r, 0);
    inputs.forEach((t, i) => {
      const say = b.hear(t, i * 100).say;
      assert.deepEqual(segment(say).missing, [], `"${t}" -> "${say}"`);
    });
  }
  assert.deepEqual(segment(line('bedtime', r)).missing, []);
});

test('every literal say() in the UI is in the catalog; template call sites are known', () => {
  const dir = join(import.meta.dirname, '..', 'src', 'web');
  let templates = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/\bsay\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const text = m[1].replace(/\\'/g, "'");
      assert.deepEqual(segment(text).missing, [], `${f}: say('${text}')`);
    }
    templates += [...src.matchAll(/\bsay\(\s*`/g)].length;
  }
  // If this number changes, add the new template to TEMPLATE_LINES (or UI_LINES) in src/core/phrases.ts.
  assert.equal(templates, 2);
});
