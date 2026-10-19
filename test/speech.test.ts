import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechQueue, type Player, type Resolution, type Speakable } from '../src/core/speechQueue.ts';

/** Fake player: records what plays; the test decides when audio starts/ends. */
function fakePlayer() {
  const plays: { item: Speakable; start: () => void; end: (ok: boolean, e?: string) => void; stopped: boolean; paused: boolean }[] = [];
  const player: Player = {
    play(item, cb) {
      const p = { item, start: cb.onStart, end: cb.onEnd, stopped: false, paused: false };
      plays.push(p);
      return { stop: () => { p.stopped = true; }, pause: () => { p.paused = true; }, resume: () => { p.paused = false; } };
    },
  };
  const active = () => plays.filter((p) => !p.stopped);
  return { player, plays, active };
}

const clipFor = (text: string): Resolution =>
  text.startsWith('NOCLIP') ? { speakable: null, reason: 'missing clip for 1 sentence' } : { speakable: { kind: 'clips', clips: [{ id: text, src: `${text}.mp3`, ms: 500 }] } };

function setup(opts: { dedupeMs?: number } = {}) {
  let now = 0;
  const logs: string[] = [];
  const fp = fakePlayer();
  const q = new SpeechQueue(fp.player, clipFor, { now: () => now, dedupeMs: opts.dedupeMs ?? 600, log: (_l, m) => logs.push(m) });
  return { q, fp, logs, tick: (ms: number) => { now += ms; } };
}

test('speaks: queued -> speaking -> completed, only after real start/end', () => {
  const { q, fp } = setup();
  const u = q.speak('Hello');
  assert.equal(u.state, 'queued');
  fp.plays[0].start();
  assert.equal(u.state, 'speaking');
  assert.equal(q.speaking, true);
  fp.plays[0].end(true);
  assert.equal(u.state, 'completed');
  assert.equal(q.speaking, false);
});

test('voice off: line is skipped, nothing plays', () => {
  const { q, fp } = setup();
  q.enabled = false;
  const u = q.speak('Hello');
  assert.equal(u.state, 'skipped');
  assert.equal(fp.plays.length, 0);
});

test('missing clip: failed with a diagnostic, never completed, nothing plays', () => {
  const { q, fp, logs } = setup();
  const u = q.speak('NOCLIP line');
  assert.equal(u.state, 'failed');
  assert.match(u.reason!, /missing clip/);
  assert.equal(fp.plays.length, 0);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /no voice for "NOCLIP line"/);
});

test('playback error: failed, not completed', () => {
  const { q, fp } = setup();
  const u = q.speak('Hello');
  fp.plays[0].end(false, 'media error 4');
  assert.equal(u.state, 'failed');
  assert.equal(u.reason, 'media error 4');
});

test('rapid remote presses never overlap: each replace stops the previous line', () => {
  const { q, fp, tick } = setup({ dedupeMs: 0 });
  for (let i = 0; i < 10; i++) { q.speak(`Line ${i}`); fp.plays[fp.plays.length - 1].start(); tick(50); }
  assert.equal(fp.active().length, 1, 'only the newest line is still playing');
  assert.equal(fp.plays.filter((p) => p.stopped).length, 9);
  assert.equal(q.currentUtterance!.text, 'Line 9');
});

test('dedupe: same line re-requested by a re-render is not played twice', () => {
  const { q, fp, tick } = setup();
  const a = q.speak('Find the star!');
  tick(100);
  const b = q.speak('Find the star!');
  assert.equal(a, b);
  assert.equal(fp.plays.length, 1);
  tick(700);
  q.speak('Find the star!');
  assert.equal(fp.plays.length, 2, 'after the window it can be said again');
});

test('queue priority waits its turn; queue is bounded', () => {
  const { q, fp } = setup({ dedupeMs: 0 });
  q.speak('First');
  const b = q.speak('Second', { priority: 'queue' });
  const c = q.speak('Third', { priority: 'queue' });
  const d = q.speak('Fourth', { priority: 'queue' });
  assert.equal(fp.plays.length, 1);
  assert.equal(b.state, 'cancelled', 'oldest waiting line dropped when queue is full');
  fp.plays[0].start(); fp.plays[0].end(true);
  assert.equal(fp.plays.length, 2);
  assert.equal((fp.plays[1].item as { clips: { id: string }[] }).clips[0].id, 'Third');
  assert.equal(c.state, 'queued');
  fp.plays[1].start();
  assert.equal(c.state, 'speaking');
  assert.equal(d.state, 'queued');
});

test('cancelAll (navigation) stops current and drops queued; late end events are ignored', () => {
  const { q, fp } = setup({ dedupeMs: 0 });
  const a = q.speak('A');
  fp.plays[0].start();
  const b = q.speak('B', { priority: 'queue' });
  q.cancelAll('navigate');
  assert.equal(a.state, 'cancelled');
  assert.equal(b.state, 'cancelled');
  assert.equal(fp.plays[0].stopped, true);
  fp.plays[0].end(true); // a late 'ended' from the stopped element
  assert.equal(a.state, 'cancelled', 'not flipped to completed');
  assert.equal(fp.plays.length, 1, 'queued line never started');
});

test('pause and resume the current line', () => {
  const { q, fp } = setup();
  const u = q.speak('Hello');
  fp.plays[0].start();
  q.pause();
  assert.equal(u.state, 'paused');
  assert.equal(fp.plays[0].paused, true);
  q.resume();
  assert.equal(u.state, 'speaking');
  assert.equal(fp.plays[0].paused, false);
});

test('history is bounded', () => {
  const { q, fp } = setup({ dedupeMs: 0 });
  for (let i = 0; i < 100; i++) { q.speak(`L${i}`); fp.plays[i].end(true); }
  assert.ok(q.history.length <= 50);
});
