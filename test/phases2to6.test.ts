import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StepSequence, type SpeakOutcome, type StepDeps } from '../src/core/stepSequence.ts';
import { animalQuestionSteps } from '../src/core/animalSteps.ts';
import { ALPHABET, ALPHABET_CONFIG, ALPHABET_DONE, ALPHABET_INTRO, alphabetSteps } from '../src/core/alphabet.ts';
import { ANIMAL_CONFIG, ANIMAL_INTRO, ANIMAL_QUESTION, MAKER_LABEL, MAKER_MOVES } from '../src/core/games.ts';
import { AVATARS, AVATAR_IDS, AVATAR_STATES, AVATAR_STORAGE_KEY, DEFAULT_AVATAR, avatarStateOf, loadAvatar, parseAvatarId, saveAvatar } from '../src/core/avatars.ts';
import { STATE_INFO } from '../src/core/character.ts';
import { RHYMES } from '../src/core/rhymes.ts';
import { segment } from '../src/core/phrases.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOICES = JSON.parse(readFileSync(join(root, 'public/audio/voice/clips.json'), 'utf8')).voices as Record<string, Record<string, { file: string }>>;
/** A clip counts only if EVERY avatar's voice has it (so each buddy can say every line). */
const clips = new Proxy({} as Record<string, { file: string }>, { get: (_t, id: string) => (['dino', 'cat', 'dog', 'bear'].every((a) => VOICES[a]?.[id]) ? VOICES.dino[id] : undefined) });
const src = (p: string) => readFileSync(join(root, p), 'utf8');

/** Controllable world: speech completes and timers fire only when the test says so. */
function world() {
  const log: string[] = [];
  const speaks: { text: string; done: (r: SpeakOutcome, why?: string) => void; cancelled: boolean }[] = [];
  const timers: { ms: number; cb: () => void; live: boolean }[] = [];
  const deps: StepDeps = {
    speak: (text, done) => { const s = { text, done, cancelled: false }; speaks.push(s); log.push(`speak:${text}`); return () => { s.cancelled = true; }; },
    wait: (ms, cb) => { const t = { ms, cb, live: true }; timers.push(t); log.push(`wait:${ms}`); return () => { t.live = false; }; },
  };
  const finishSpeech = (r: SpeakOutcome = 'completed', why?: string) => speaks[speaks.length - 1].done(r, why);
  const fire = () => { const t = [...timers].reverse().find((x) => x.live)!; t.live = false; t.cb(); };
  return { log, speaks, timers, deps, finishSpeech, fire };
}

/* ---------------- generic runner ---------------- */
test('StepSequence: stages run in order, each only after the previous really finished', () => {
  const w = world(); const log = w.log;
  let soundHandlers: { onEnd: () => void; onError: (m: string) => void } | null = null;
  const seq = new StepSequence(w.deps);
  seq.run([
    { type: 'speak', text: 'A' }, { type: 'wait', ms: 5 },
    { type: 'sound', start: (h) => { soundHandlers = h; log.push('sound:start'); } },
    { type: 'wait', ms: 7 }, { type: 'speak', text: 'B' }, { type: 'do', fn: () => log.push('do') },
  ]);
  assert.deepEqual(log, ['speak:A']);
  w.finishSpeech(); assert.deepEqual(log.slice(-1), ['wait:5']);
  w.fire(); assert.deepEqual(log.slice(-1), ['sound:start']);
  assert.equal(log.includes('wait:7'), false, 'next pause waits for the recording to END');
  soundHandlers!.onEnd(); assert.deepEqual(log.slice(-1), ['wait:7']);
  w.fire(); assert.deepEqual(log.slice(-1), ['speak:B']);
  w.finishSpeech(); assert.equal(seq.state, 'DONE'); assert.equal(log.slice(-1)[0], 'do');
});

test('StepSequence: cancel stops speech, timers and sound; late callbacks do nothing', () => {
  const w = world(); let stopped = 0; let handlers: { onEnd: () => void; onError: (m: string) => void } | null = null;
  const seq = new StepSequence(w.deps);
  seq.run([{ type: 'sound', start: (h) => { handlers = h; }, stop: () => { stopped++; } }, { type: 'speak', text: 'never' }]);
  seq.cancel();
  assert.equal(stopped, 1); assert.equal(seq.state, 'CANCELLED');
  handlers!.onEnd();
  assert.equal(w.speaks.length, 0, 'a late sound-end cannot start the next step');
});

test('StepSequence: missing voice or recording => ERROR with a clear message', () => {
  const w = world(); const errors: string[] = [];
  const seq = new StepSequence(w.deps, { onError: (m) => errors.push(m) });
  seq.run([{ type: 'speak', text: 'Hello' }, { type: 'speak', text: 'Next' }]);
  w.finishSpeech('failed', 'no clip');
  assert.equal(seq.state, 'ERROR'); assert.match(errors[0], /Cannot speak "Hello": no clip/); assert.equal(w.speaks.length, 1);
  const seq2 = new StepSequence(w.deps, { onError: (m) => errors.push(m) });
  seq2.run([{ type: 'sound', start: (h) => h.onError('cannot load audio/animals/dog.mp3') }]);
  assert.match(errors[1], /cannot load audio\/animals\/dog\.mp3/);
});

/* ---------------- phase 3: animal question order ---------------- */
test('animal question: intro, pause, recording, pause, question, then options - recording never overlaps speech', () => {
  const w = world(); const log = w.log; let h: { onEnd: () => void; onError: (m: string) => void } | null = null;
  const seq = new StepSequence(w.deps);
  seq.run(animalQuestionSteps('dog', true, (x) => { h = x; log.push('animal:play'); }, () => log.push('animal:stop'), () => log.push('options')));
  assert.deepEqual(log, [`speak:${ANIMAL_INTRO}`]);
  w.finishSpeech(); assert.deepEqual(log.slice(-1), [`wait:${ANIMAL_CONFIG.introPauseMs}`]);
  w.fire(); assert.deepEqual(log.slice(-1), ['animal:play']);
  assert.equal(log.some((l) => l === `speak:${ANIMAL_QUESTION}`), false, 'question not asked while the recording plays');
  h!.onEnd(); assert.deepEqual(log.slice(-1), [`wait:${ANIMAL_CONFIG.afterSoundPauseMs}`]);
  w.fire(); assert.deepEqual(log.slice(-1), [`speak:${ANIMAL_QUESTION}`]);
  assert.equal(log.includes('options'), false, 'options appear only after the question finished');
  w.finishSpeech(); assert.deepEqual(log.slice(-1), ['options']);
  // later questions skip the intro
  const w2 = world();
  new StepSequence(w2.deps).run(animalQuestionSteps('cat', false, () => w2.log.push('animal:play'), () => {}, () => {}));
  assert.deepEqual(w2.log, ['animal:play']);
});

/* ---------------- phase 4: dance moves ---------------- */
test('dance maker: six clear moves with labels, mapped to real animation states; clapping replaced', () => {
  assert.deepEqual([...MAKER_MOVES], ['wave', 'jump', 'sidestep', 'turn', 'handsup', 'bounce']);
  assert.ok(!(MAKER_MOVES as readonly string[]).includes('clap'));
  const screens = src('src/web/screens.tsx');
  for (const m of MAKER_MOVES) {
    assert.ok(MAKER_LABEL[m].length > 2);
    const state = new RegExp(`${m}: \\['([A-Z_]+)'`).exec(screens)?.[1];
    assert.ok(state && state in STATE_INFO, `${m} maps to a character state`);
  }
  const milo = src('src/web/Milo.tsx');
  for (const st of ['SIDESTEPPING', 'HANDSUP', 'BOUNCING']) assert.match(milo, new RegExp(`case '${st}'`), `${st} has its own pose`);
  assert.equal(STATE_INFO.SIDESTEPPING.loops, false, 'each move ends and returns to idle');
});

/* ---------------- phase 5: avatars ---------------- */
test('avatars: Dino, Cat, Dog, Bear - distinct, all six animation states, safe persistence', () => {
  assert.deepEqual([...AVATAR_IDS], ['dino', 'cat', 'dog', 'bear']);
  const bodies = new Set(AVATAR_IDS.map((id) => AVATARS[id].skin.bodyMid));
  assert.equal(bodies.size, 4, 'four different colour schemes');
  assert.equal(new Set(AVATAR_IDS.map((id) => `${AVATARS[id].skin.ears}/${AVATARS[id].skin.face}/${AVATARS[id].skin.tail}`)).size, 4, 'four different silhouettes');
  for (const id of AVATAR_IDS) for (const st of AVATAR_STATES) assert.ok(AVATARS[id].animations[st], `${id}:${st}`);
  assert.equal(parseAvatarId('lion'), DEFAULT_AVATAR); assert.equal(parseAvatarId(null), 'dino'); assert.equal(parseAvatarId(42), 'dino'); assert.equal(parseAvatarId('cat'), 'cat');
  const mem: Record<string, string> = {};
  const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  assert.equal(saveAvatar('bear', store), true); assert.equal(mem[AVATAR_STORAGE_KEY], 'bear'); assert.equal(loadAvatar(store), 'bear');
  mem[AVATAR_STORAGE_KEY] = '<script>'; assert.equal(loadAvatar(store), 'dino', 'invalid stored value falls back to Dino');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadAvatar(broken), 'dino'); assert.equal(saveAvatar('cat', broken), false); assert.equal(loadAvatar(null), 'dino');
  assert.equal(avatarStateOf('SINGING'), 'singing'); assert.equal(avatarStateOf('DANCING'), 'dancing'); assert.equal(avatarStateOf('SPEAKING'), 'speaking'); assert.equal(avatarStateOf('IDLE'), 'idle');
});

test('the selected avatar is what is rendered: the character component and every screen read it', () => {
  const app = src('src/web/App.tsx');
  assert.match(app, /<Milo avatar=\{avatar\}/, 'the one character component on every screen gets the avatar');
  const milo = src('src/web/Milo.tsx');
  assert.match(milo, /AVATARS\[avatar\]\.skin/, 'renderer draws from the registry skin, not hard-coded dragon colours');
  assert.match(milo, /skin\.ears/); assert.match(milo, /skin\.wings/);
  assert.match(src('src/web/screens.tsx'), /MoveDemo move=\{m\} avatar=\{ctx\.avatar\}/, 'Dance Maker previews use the chosen avatar');
});

/* ---------------- phase 6: alphabets ---------------- */
test('alphabets: 26 letters A-Z, each with word, art and a recorded spoken phrase that matches', async () => {
  assert.equal(ALPHABET.length, 26);
  assert.equal(ALPHABET.map((l) => l.letter).join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const { hasArt } = await import('../src/web/alphabetArt.tsx').catch(() => ({ hasArt: null as null | ((id: string) => boolean) }));
  const artSrc = src('src/web/alphabetArt.tsx');
  for (const l of ALPHABET) {
    assert.equal(l.phrase, `${l.letter} for ${l.word}.`, 'spoken phrase = letter + the displayed word');
    assert.equal(l.lower, l.letter.toLowerCase());
    assert.ok(l.word.toLowerCase().startsWith(l.letter.toLowerCase()), `${l.word} starts with ${l.letter}`);
    const animal = ['cat', 'dog', 'elephant', 'lion', 'pig'].includes(l.art);
    assert.ok(animal ? new RegExp(`${l.art}: '${l.art}'`).test(artSrc) : new RegExp(`\\b${l.art}: <g[ >]`).test(artSrc), `illustration for ${l.art}`);
    if (hasArt) assert.ok(hasArt(l.art));
    const seg = segment(l.phrase); assert.deepEqual(seg.missing, [], l.phrase);
    for (const p of seg.phrases) assert.ok(clips[p.id] && existsSync(join(root, 'public', clips[p.id].file)), `voice clip for "${l.phrase}"`);
  }
  assert.equal(new Set(ALPHABET.map((l) => l.word)).size, 26);
  for (const text of [ALPHABET_INTRO, ALPHABET_DONE]) for (const p of segment(text).phrases) assert.ok(clips[p.id]);
  assert.equal(ALPHABET[0].phrase, 'A for Apple.'); assert.equal(ALPHABET[0].art, 'apple');
});

test('alphabets: intro, pause, then each letter shown, spoken to the end, pause, next - nothing overlaps', () => {
  const w = world(); const shown: string[] = []; let done = false;
  const seq = new StepSequence(w.deps);
  seq.run(alphabetSteps(0, true, (i) => { shown.push(ALPHABET[i].letter); w.log.push(`show:${ALPHABET[i].letter}`); }, () => { done = true; }));
  assert.deepEqual(w.log, [`speak:${ALPHABET_INTRO}`]);
  w.finishSpeech(); assert.deepEqual(w.log.slice(-1), [`wait:${ALPHABET_CONFIG.introPauseMs}`]);
  assert.deepEqual(shown, [], 'letter A is not shown until the intro and its pause are over');
  w.fire(); assert.deepEqual(w.log.slice(-2), ['show:A', `wait:${ALPHABET_CONFIG.firstLetterLeadMs}`], 'letter A is shown first, with a calm lead before it is spoken');
  w.fire(); assert.deepEqual(w.log.slice(-1), ['speak:A for Apple.']);
  w.finishSpeech(); assert.deepEqual(w.log.slice(-1), [`wait:${ALPHABET_CONFIG.letterPauseMs}`]);
  assert.equal(shown.length, 1, 'B not shown before the pause ends');
  w.fire(); assert.deepEqual(w.log.slice(-2), ['show:B', 'speak:B for Ball.']);
  seq.cancel();
  w.speaks.at(-1)!.done('completed'); w.timers.forEach((t) => t.cb());
  assert.equal(shown.length, 2, 'cancelled: nothing more is shown or spoken');
  // full run reaches Z then the completion line
  const w2 = world(); const sh: string[] = [];
  const s2 = new StepSequence(w2.deps);
  s2.run(alphabetSteps(0, false, (i) => sh.push(ALPHABET[i].letter), () => { done = true; }));
  for (let n = 0; n < 200 && s2.state === 'RUNNING'; n++) { if (w2.speaks.length && !(w2.speaks.at(-1) as unknown as { fin?: boolean }).fin) { const sp = w2.speaks.at(-1) as unknown as { fin?: boolean; done: (r: SpeakOutcome) => void }; sp.fin = true; sp.done('completed'); } else if (w2.timers.some((t) => t.live)) w2.fire(); else break; }
  assert.equal(sh.join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'); assert.equal(done, true);
  assert.equal(w2.log.at(-1), `speak:${ALPHABET_DONE}`);
});

test('alphabets: lazy - only the current letter art is rendered; screens clean up audio on exit', () => {
  const s = src('src/web/screensNew.tsx');
  assert.match(s, /<LetterArt art=\{cur\.art\}/); assert.ok(!/ALPHABET\.map\([^)]*LetterArt/.test(s), 'no eager rendering of all 26 pictures');
  assert.match(s, /speech\.cancel\('leave alphabets'\)/); assert.match(s, /speech\.cancel\('leave avatars'\)/);
  const animal = s;
  assert.match(animal, /ctx\.audio\.stopAnimal\(\)/);
});

/* ---------------- phase 2: rhyme room layout ---------------- */
test('rhyme room: 5 song cards in a two-column scrolling grid with art, title and Play, reachable by remote', () => {
  const screens = src('src/web/screens.tsx'); const css = src('src/web/styles.css');
  assert.equal(RHYMES.length, 5);
  assert.match(css, /\.rhyme-grid \{ display: grid; grid-template-columns: 1fr 1fr/);
  assert.match(css, /\.scroll-y \{ overflow-y: auto/);
  assert.match(screens, /RHYMES\.map\(\(r, i\) =>/); assert.match(screens, /<RhymeArt id=\{r\.id\}/); assert.match(screens, /▶ Play/); assert.match(screens, /Playing/);
  assert.match(src('src/web/App.tsx'), /revealInScroller\(next\)/, 'focus movement scrolls the focused card into view');
  const art = src('src/web/rhymeArt.tsx');
  for (const r of RHYMES) assert.ok(art.includes(`case '${r.id}'`), `art for ${r.id}`);
});

import { ALPHABET_SPEEDS } from '../src/core/alphabet.ts';
test('alphabet speed: pauses follow the live speed, slow > normal > fast; voice rate rises with speed', () => {
  assert.deepEqual(ALPHABET_SPEEDS.map((s) => s.id), ['slow', 'normal', 'fast']);
  assert.ok(ALPHABET_SPEEDS[0].pause > ALPHABET_SPEEDS[1].pause && ALPHABET_SPEEDS[1].pause > ALPHABET_SPEEDS[2].pause);
  assert.ok(ALPHABET_SPEEDS[0].rate < ALPHABET_SPEEDS[1].rate && ALPHABET_SPEEDS[1].rate < ALPHABET_SPEEDS[2].rate);
  let scale = 1; const w = world(); const seq = new StepSequence(w.deps);
  seq.run(alphabetSteps(0, false, () => {}, () => {}, () => scale));
  w.fire(); // the lead before letter A is over
  w.finishSpeech(); // letter A spoken -> first pause is scheduled
  assert.equal(w.timers[w.timers.length - 1].ms, ALPHABET_CONFIG.letterPauseMs * 1);
  w.fire(); scale = ALPHABET_SPEEDS[2].pause; w.finishSpeech(); // child pressed Faster while B was being said
  assert.equal(w.timers[w.timers.length - 1].ms, ALPHABET_CONFIG.letterPauseMs * ALPHABET_SPEEDS[2].pause, 'the next pause is shorter');
});
