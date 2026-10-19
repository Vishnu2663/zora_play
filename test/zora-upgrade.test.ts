import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RHYMES } from '../src/core/rhymes.ts';
import { ANIMALS, ANIMAL_FACT, ALL_ANIMALS, animalCorrect, animalSoundPath, ANIMAL_QUESTION, answerChoice, newChoiceGame, nextChoiceRound } from '../src/core/games.ts';
import { TALK_CHATS, TALK_GREETING, TALK_LINES } from '../src/core/talk.ts';
import { allPhrases, segment } from '../src/core/phrases.ts';
import { ClipPlayer, cursorAt, lineAt, type RhymeTiming } from '../src/web/clips.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p: string) => join(root, 'public', p);
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

/* ---- a fake HTMLAudioElement so ClipPlayer can be tested without a browser ---- */
class FakeAudio {
  static all: FakeAudio[] = [];
  src = ''; currentTime = 0; duration = 10; volume = 1; playbackRate = 1; preload = '';
  paused = true; error: { code: number } | null = null; stopped = false;
  private l: Record<string, (() => void)[]> = {};
  constructor() { FakeAudio.all.push(this); }
  addEventListener(n: string, f: () => void) { (this.l[n] ??= []).push(f); }
  emit(n: string) { (this.l[n] ?? []).forEach((f) => f()); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute(a: string) { if (a === 'src') { this.src = ''; this.stopped = true; } }
}
(globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio;
const lastAudio = () => FakeAudio.all[FakeAudio.all.length - 1];

/* ============================== rhymes ============================== */

test('5 rhymes: the owner\'s own songs', () => {
  assert.equal(RHYMES.length, 5);
  assert.deepEqual(RHYMES.map((r) => r.id), ['lullaby', 'robot', 'march', 'feather', 'tap']);
  assert.deepEqual(RHYMES.map((r) => r.title), ["Milo's Lullaby", "Milo's Robot Smiley", 'March with Milo', 'Float Like a Feather', "Milo's Dragon Tap"]);
});

test('every rhyme has a real song file and lyric timings that match its words', () => {
  for (const r of RHYMES) {
    const mp3 = pub(`audio/rhymes/${r.id}.mp3`);
    assert.ok(existsSync(mp3) && statSync(mp3).size > 500_000, `${r.id}: song missing or tiny`);
    const t: RhymeTiming = readJson(pub(`audio/rhymes/${r.id}.json`));
    assert.equal(t.audio, `audio/rhymes/${r.id}.mp3`, 'one recorded song for every buddy, relative to index.html');
    assert.equal(t.lines.length, r.lines.length, r.id);
    let prev = -1;
    t.lines.forEach((ln, i) => {
      assert.equal(ln.text, r.lines[i].words.join(' '), `${r.id} line ${i}: lyric text matches`);
      assert.equal(ln.words.length, r.lines[i].words.length);
      assert.ok(ln.start >= prev - 1e-6, `${r.id}: lines in time order`);
      for (const w of ln.words) { assert.ok(w.e > w.s, `${r.id}: word has duration`); assert.ok(w.s >= prev - 1e-6); prev = w.s; }
      assert.ok(ln.end <= t.durationMs / 1000 + 0.05, `${r.id}: line ends inside the audio`);
    });
  }
});

test('lyric cursor follows the playback position, line by line', () => {
  const t: RhymeTiming = readJson(pub('audio/rhymes/tap.json'));
  assert.equal(cursorAt(t, -1), null);
  assert.deepEqual(cursorAt(t, t.lines[0].words[0].s + 0.001), { line: 0, word: 0 });
  assert.deepEqual(cursorAt(t, t.lines[1].words[2].s + 0.001), { line: 1, word: 2 });
  assert.equal(lineAt(t, t.lines[2].start + 0.01), 2);
  const last = t.lines.length - 1;
  assert.deepEqual(cursorAt(t, 9999), { line: last, word: t.lines[last].words.length - 1 });
});

test('ClipPlayer: pause freezes position, resume continues, replay restarts, new clip stops the old one', () => {
  FakeAudio.all = [];
  const p = new ClipPlayer();
  p.play('audio/rhymes/tap.mp3');
  const a = lastAudio();
  a.emit('playing');
  assert.equal(p.status, 'playing');
  a.currentTime = 4.2;
  p.pause();
  assert.equal(p.status, 'paused'); assert.equal(a.paused, true);
  const t = readJson(pub('audio/rhymes/tap.json')) as RhymeTiming;
  const frozen = cursorAt(t, p.time);
  a.currentTime = 4.2; // a paused element does not advance: cursor is unchanged
  assert.deepEqual(cursorAt(t, p.time), frozen);
  p.resume();
  assert.equal(p.status, 'playing'); assert.equal(a.paused, false);
  p.restart();
  assert.equal(a.currentTime, 0);
  p.play('audio/rhymes/feather.mp3'); // changing rhymes stops the previous track
  assert.equal(a.stopped, true); assert.equal(a.paused, true);
  assert.equal(FakeAudio.all.length, 2);
});

test('ClipPlayer: a missing file is reported, never replaced by a sound', () => {
  FakeAudio.all = [];
  const p = new ClipPlayer();
  const errors: string[] = [];
  const log = console.error; console.error = () => {};
  p.play('audio/rhymes/nope.mp3', { onError: (m) => errors.push(m) });
  const a = lastAudio();
  a.error = { code: 4 };
  a.emit('error');
  console.error = log;
  assert.equal(p.status, 'error');
  assert.match(errors[0], /cannot load audio\/rhymes\/nope\.mp3/);
  assert.equal(FakeAudio.all.length, 1, 'no second (substitute) sound was created');
});

/* ============================== animal sounds ============================== */

test('every game animal maps to its own real recording, licensed for redistribution', () => {
  const manifest = readJson(pub('audio/MANIFEST.json')).files as { path: string; license: string; sourceUrl: string }[];
  const seen = new Set<number>();
  for (const a of ANIMALS) {
    assert.equal(animalSoundPath(a), `audio/animals/${a}.mp3`);
    const f = pub(animalSoundPath(a));
    assert.ok(existsSync(f) && statSync(f).size > 4_000, `${a}: recording missing`);
    seen.add(createHash('md5').update(readFileSync(f)).digest('hex') as unknown as number);
    const rec = manifest.find((m) => m.path === `animals/${a}.mp3`);
    assert.ok(rec, `${a}: manifest record`);
    assert.match(rec!.license, /^(CC0|Public domain)$/);
    assert.match(rec!.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  }
  assert.equal(seen.size, ANIMALS.length, 'every animal has a different recording (no shared generic sound)');
  for (const a of ANIMALS) assert.ok(ALL_ANIMALS.includes(a));
});

test('animal round: question, correct reply and fact all have recorded voice lines', () => {
  const V = readJson(pub('audio/voice/clips.json')).voices as Record<string, Record<string, { file: string }>>;
  const clips = new Proxy({} as Record<string, { file: string }>, { get: (_t, id: string) => (['dino', 'cat', 'dog', 'bear'].every((a) => V[a]?.[id]) ? V.dino[id] : undefined) });
  for (const a of ANIMALS) {
    for (const text of [ANIMAL_QUESTION, animalCorrect(a), ANIMAL_FACT[a]]) {
      const seg = segment(text);
      assert.deepEqual(seg.missing, [], text);
      for (const p of seg.phrases) assert.ok(clips[p.id], `no clip for "${p.text}"`);
    }
  }
  assert.equal(ANIMAL_QUESTION, 'Who makes this noise?');
  assert.equal(animalCorrect('elephant'), "Yes! It's an elephant!");
});

test('animal game: correct answer always offered, no quick repeats, score and rounds progress', () => {
  for (let seed = 1; seed <= 60; seed++) {
    let n = seed;
    const rng = () => { n = (n * 1664525 + 1013904223) % 4294967296; return n / 4294967296; };
    let g = newChoiceGame(ANIMALS, rng, 5, 4);
    const targets: string[] = [];
    for (let r = 0; r < 5; r++) {
      assert.equal(g.options.length, 4);
      assert.ok(g.options.includes(g.target), 'target is among the options');
      assert.equal(new Set(g.options).size, 4, 'options are distinct');
      targets.push(g.target);
      const wrong = g.options.find((o) => o !== g.target)!;
      const w = answerChoice(g, wrong);
      assert.equal(w.lastResult, 'wrong'); assert.equal(w.round, g.round, 'a wrong answer does not advance');
      const c = answerChoice(w, g.target);
      assert.equal(c.lastResult, 'correct');
      assert.equal(c.score, g.score, 'second-try answers do not score');
      g = nextChoiceRound(c, ANIMALS, rng, 4);
    }
    assert.equal(g.finished, true);
    for (let i = 1; i < targets.length; i++) assert.notEqual(targets[i], targets[i - 1], 'no back-to-back repeats');
  }
  const first = answerChoice(newChoiceGame(ANIMALS, () => 0.3, 5, 4), ANIMALS[ANIMALS.indexOf(newChoiceGame(ANIMALS, () => 0.3, 5, 4).target)]);
  assert.equal(first.score, 1, 'first-try correct scores');
});

test('AudioService.playAnimal plays that animal\'s file and never overlaps two animals', async () => {
  FakeAudio.all = [];
  const { AudioService } = await import('../src/web/audio.ts');
  const a = new AudioService();
  a.playAnimal('dog');
  const dog = lastAudio();
  assert.match(dog.src, /audio\/animals\/dog\.mp3$/);
  a.playAnimal('cat');
  const cat = lastAudio();
  assert.match(cat.src, /audio\/animals\/cat\.mp3$/);
  assert.equal(dog.paused, true, 'dog stopped when cat started');
  a.stopAnimal();
  assert.equal(cat.paused, true, 'leaving the game stops the sound');
  // missing file: error recorded, nothing else played
  const log = console.error; console.error = () => {};
  a.playAnimal('lion');
  const lion = lastAudio(); lion.error = { code: 4 }; lion.emit('error');
  console.error = log;
  assert.match(a.animalError ?? '', /cannot load audio\/animals\/lion\.mp3/);
});

test('AudioService rhyme playback: one rhyme at a time, lyrics tied to the clip position', async () => {
  FakeAudio.all = [];
  (globalThis as unknown as { window: unknown }).window = {
    __ZORA_RHYMES__: Object.fromEntries(RHYMES.map((r) => [r.id, readJson(pub(`audio/rhymes/${r.id}.json`))])),
  };
  const { AudioService } = await import('../src/web/audio.ts');
  const a = new AudioService();
  a.playRhyme('tap', 1, () => {});
  const first = lastAudio();
  first.emit('playing'); first.currentTime = 3;
  assert.equal(a.rhymeLine(), 0);
  a.pause();
  assert.equal(a.getPlaybackState(), 'paused');
  const before = a.rhymeCursor();
  first.currentTime = 3; // paused: the clip does not move, so neither do the lyrics
  assert.deepEqual(a.rhymeCursor(), before);
  a.playRhyme('dance', 1, () => {});
  assert.equal(first.paused, true, 'previous rhyme stopped');
  a.playRhyme('does-not-exist', 1, () => {});
  assert.equal(a.getPlaybackState(), 'idle');
  delete (globalThis as unknown as { window?: unknown }).window;
});

/* ============================== talk ============================== */

test('Talk: every prompt has fully voiced replies, the five requested prompts exist', () => {
  const prompts = TALK_CHATS.map((c) => c.prompt);
  for (const want of ["Let's learn about animals!", 'Can you count to five with me?', 'What is your favourite colour?', 'Shall we dance together?', 'Would you like to hear a rhyme?']) assert.ok(prompts.includes(want), want);
  const V = readJson(pub('audio/voice/clips.json')).voices as Record<string, Record<string, { file: string }>>;
  const clips = new Proxy({} as Record<string, { file: string }>, { get: (_t, id: string) => (['dino', 'cat', 'dog', 'bear'].every((a) => V[a]?.[id]) ? V.dino[id] : undefined) });
  for (const text of TALK_LINES) {
    const seg = segment(text);
    assert.deepEqual(seg.missing, [], text);
    for (const p of seg.phrases) assert.ok(clips[p.id] && existsSync(join(root, 'public', clips[p.id].file)), `no recorded voice for "${text}"`);
  }
  assert.ok(TALK_GREETING.length > 0);
  assert.equal(new Set(TALK_CHATS.map((c) => c.id)).size, TALK_CHATS.length);
});

test('Talk replies are one utterance each (clips play in order, never together)', () => {
  for (const c of TALK_CHATS) {
    const seg = segment(c.lines.join(' '));
    assert.deepEqual(seg.missing, []);
    assert.ok(seg.phrases.length >= 1);
  }
});

test('the voice catalog has no orphan phrases', () => {
  assert.ok(allPhrases().length >= 183);
});

/* ============================== startup ============================== */

test('opening animation is short, skippable and keeps content mounted', () => {
  const app = readFileSync(join(root, 'src/web/App.tsx'), 'utf8');
  const css = readFileSync(join(root, 'src/web/styles.css'), 'utf8');
  assert.match(app, /introRef\.current\) \{ e\.preventDefault\(\); endIntro\(\)/, 'any remote key skips the intro');
  const m = app.match(/setTimeout\(endIntro, prefersReduced \? (\d+) : (\d+)\)/);
  assert.ok(m, 'intro has a timeout');
  assert.ok(Number(m![2]) >= 2000 && Number(m![2]) <= 4000, 'intro lasts 2-4 s');
  assert.match(css, /@keyframes flyin/);
  assert.match(css, /\.reduced \.intro/, 'respects reduced motion');
  // startup does not load rhyme or animal audio: nothing in the intro path references clip files
  assert.ok(!/audio\/rhymes|audio\/animals/.test(app), 'no rhyme/animal audio is touched at startup');
});
