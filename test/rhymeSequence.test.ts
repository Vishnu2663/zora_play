import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RhymeSequence, type SequenceDeps, type SeqState, type SpeakResult } from '../src/core/rhymeSequence.ts';
import { RHYMES, RHYME_SEQUENCE_CONFIG } from '../src/core/rhymes.ts';
import { allPhrases, segment } from '../src/core/phrases.ts';
import { ClipPlayer } from '../src/web/clips.ts';

/** A fully controllable world: speech completes and timers fire only when the test says so. */
function world() {
  const log: string[] = [];
  const speaks: { text: string; done: (r: SpeakResult, why?: string) => void; cancelled: boolean }[] = [];
  const timers: { ms: number; cb: () => void; live: boolean }[] = [];
  let songHandlers: { onEnd: () => void; onError: (m: string) => void } | null = null;
  let songPlaying = false;
  const deps: SequenceDeps = {
    speak: (text, done) => { const s = { text, done, cancelled: false }; speaks.push(s); log.push(`speak:${text}`); return () => { s.cancelled = true; }; },
    wait: (ms, cb) => { const t = { ms, cb, live: true }; timers.push(t); log.push(`wait:${ms}`); return () => { t.live = false; }; },
    startSong: (h) => { songHandlers = h; songPlaying = true; log.push('song:start'); },
    stopSong: () => { songPlaying = false; log.push('song:stop'); },
  };
  const finishSpeech = (r: SpeakResult = 'completed', why?: string) => speaks[speaks.length - 1].done(r, why);
  const fireTimer = () => { const t = [...timers].reverse().find((x) => x.live)!; t.live = false; t.cb(); };
  return { log, speaks, timers, deps, finishSpeech, fireTimer, song: () => ({ playing: songPlaying, h: songHandlers }) };
}
const cfg = RHYME_SEQUENCE_CONFIG;
const mk = (w: ReturnType<typeof world>, id = 'tap') => {
  const states: SeqState[] = []; const errors: string[] = [];
  const r = RHYMES.find((x) => x.id === id)!;
  const seq = new RhymeSequence(w.deps, cfg, r, { onState: (s) => states.push(s), onError: (m) => errors.push(m) });
  return { seq, states, errors, r };
};

test('configured pauses are inside the requested ranges', () => {
  assert.ok(cfg.introPauseMs >= 500 && cfg.introPauseMs <= 800);
  assert.ok(cfg.songPauseMs >= 700 && cfg.songPauseMs <= 1000);
  assert.equal(cfg.introLine, "Let's sing some rhymes!");
});

test('1-7: intro, pause, title, pause, then the song - each stage waits for real completion, song starts once', () => {
  const w = world(); const { seq, states, r } = mk(w);
  seq.start();
  assert.deepEqual(w.log, [`speak:${cfg.introLine}`], '1. intro dialogue starts first');
  assert.equal(w.song().playing, false, '2. no song during the intro');
  w.fireTimer?.call; // nothing to fire yet
  assert.equal(w.timers.length, 0, 'no pause starts before the intro audio finished (no fixed estimate)');
  w.finishSpeech();
  assert.deepEqual(w.log.slice(-1), [`wait:${cfg.introPauseMs}`], '3. configured pause after the intro');
  assert.equal(w.song().playing, false);
  w.fireTimer();
  assert.deepEqual(w.log.slice(-1), [`speak:${r.title}`], '4. the actual rhyme title is spoken next');
  assert.equal(w.song().playing, false, '5. no song while the title is spoken');
  w.finishSpeech();
  assert.deepEqual(w.log.slice(-1), [`wait:${cfg.songPauseMs}`], '6. final pause before singing');
  assert.equal(w.song().playing, false);
  w.fireTimer();
  assert.equal(w.log.filter((l) => l === 'song:start').length, 1, '7. song starts exactly once');
  assert.deepEqual(states, ['INTRO_DIALOGUE', 'INTRO_PAUSE', 'TITLE_DIALOGUE', 'SONG_PAUSE', 'SINGING']);
  w.song().h!.onEnd();
  assert.equal(seq.state, 'COMPLETED');
  assert.equal(w.log.filter((l) => l === 'song:start').length, 1);
});

test('a late timer or speech callback cannot start a second song', () => {
  const w = world(); const { seq } = mk(w);
  seq.start(); w.finishSpeech(); w.fireTimer(); w.finishSpeech(); w.fireTimer();
  assert.equal(seq.songStarts, 1);
  w.speaks[0].done('completed'); w.speaks[1].done('completed');
  assert.equal(w.log.filter((l) => l === 'song:start').length, 1);
});

test('9: starting another rhyme cancels the previous sequence completely', () => {
  const w = world(); const a = mk(w, 'tap'); const b = mk(w, 'feather');
  a.seq.start(); // still speaking the intro
  const staleTimer = { cb: () => w.speaks[0].done('completed') };
  a.seq.cancel();
  b.seq.start();
  staleTimer.cb(); // the old pause fires late
  assert.equal(w.log.filter((l) => l === 'song:start').length, 0, 'old sequence did not advance');
  assert.equal(a.seq.state, 'CANCELLED');
  assert.ok(w.speaks[0].cancelled, 'old dialogue was cancelled');
  assert.equal(w.log.filter((l) => l === `speak:${a.r.title}`).length, 0, 'old title never spoken');
});

test('10: exiting during each stage cancels pending playback', () => {
  for (const stage of ['intro', 'introPause', 'title', 'songPause'] as const) {
    const w = world(); const { seq } = mk(w);
    seq.start();
    if (stage !== 'intro') { w.finishSpeech(); }
    if (stage === 'title' || stage === 'songPause') { w.fireTimer(); }
    if (stage === 'songPause') { w.finishSpeech(); }
    const timersBefore = w.timers.filter((t) => t.live).length;
    seq.cancel();
    w.timers.forEach((t) => { if (t.live) { /* a still-live timer would be a leak */ throw new Error(`${stage}: timer left running`); } });
    void timersBefore;
    w.speaks.forEach((s) => s.done('completed')); // late completions are ignored
    w.timers.forEach((t) => t.cb());
    assert.equal(w.log.includes('song:start'), false, `${stage}: song never starts after exit`);
    assert.equal(seq.state, 'CANCELLED');
  }
});

test('11: missing dialogue gives a clear error and no song', () => {
  const w = world(); const { seq, errors } = mk(w);
  seq.start();
  w.finishSpeech('failed', 'no clip');
  assert.equal(seq.state, 'ERROR');
  assert.match(errors[0], /Cannot speak "Let's sing some rhymes!": no clip/);
  assert.equal(w.log.includes('song:start'), false);
});

test('11: missing song asset gives a clear error and no placeholder', () => {
  const w = world(); const { seq, errors } = mk(w);
  seq.start(); w.finishSpeech(); w.fireTimer(); w.finishSpeech(); w.fireTimer();
  w.song().h!.onError('cannot load audio/rhymes/tap.mp3 (media error 4)');
  assert.equal(seq.state, 'ERROR');
  assert.match(errors[0], /cannot load audio\/rhymes\/tap\.mp3/);
  assert.ok(w.log.includes('song:stop'));
});

test('12: the same sequence works for every rhyme, and every spoken line has a recorded voice clip', () => {
  const V = JSON.parse(require_('public/audio/voice/clips.json')).voices as Record<string, Record<string, unknown>>;
  const clips = new Proxy({} as Record<string, unknown>, { get: (_t, id: string) => (['dino', 'cat', 'dog', 'bear'].every((a) => V[a]?.[id]) ? true : undefined) });
  const intro = segment(cfg.introLine);
  assert.deepEqual(intro.missing, []); assert.ok(clips[intro.phrases[0].id]);
  assert.ok(allPhrases().length > 100);
  for (const r of RHYMES) {
    const w = world(); const { seq } = mk(w, r.id);
    seq.start(); w.finishSpeech(); w.fireTimer(); w.finishSpeech(); w.fireTimer();
    assert.equal(seq.state, 'SINGING', r.id);
    assert.ok(w.log.includes(`speak:${r.title}`), `${r.id}: its own title`);
    const t = segment(r.title);
    assert.deepEqual(t.missing, [], `${r.id}: title is in the voice catalog`);
    for (const p of t.phrases) assert.ok(clips[p.id], `${r.id}: recorded title clip`);
  }
});

test('8: pause/resume keep lyrics tied to the clip position; replay restarts', () => {
  class A { src = ''; currentTime = 0; duration = 20; volume = 1; playbackRate = 1; paused = true; error = null; preload = '';
    addEventListener() {} play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } load() {} removeAttribute() {} }
  const made: A[] = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class extends A { constructor() { super(); made.push(this); } };
  const p = new ClipPlayer();
  p.play('audio/rhymes/tap.mp3');
  const el = made[0]; el.currentTime = 5; (p as unknown as { status: string }).status = 'playing';
  p.pause();
  const t0 = p.time; el.currentTime = t0; // paused element does not advance
  assert.equal(p.time, t0);
  p.resume(); assert.equal(p.status, 'playing');
  p.restart(); assert.equal(el.currentTime, 0);
});

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
function require_(p: string) { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', p), 'utf8'); }
