import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AudioFlowError, AudioSequence, TRANSITIONS, action, canTransition, clip, delay, isAudioFlowError, isTerminal,
  type SequenceStatus,
} from '../src/index.ts';
import { ManualScheduler, MockAdapter } from '../src/testing/index.ts';
import { rig } from './helpers.ts';

test('steps run strictly in order and only advance on a real completion signal', async () => {
  const log: string[] = [];
  const { adapter, clock, seq, states } = rig([clip('intro.mp3'), delay(600), clip('title.mp3'), delay(800), action(() => log.push('buttons'))]);
  seq.on('step', ({ index, step }) => log.push(`step${index}:${step.kind}`));
  const done = seq.start();
  assert.deepEqual(adapter.sources, ['intro.mp3']);
  adapter.last!.start();
  assert.equal(clock.pending, 0, 'no timer while the clip is playing: nothing is estimated');
  clock.advance(60_000);
  assert.deepEqual(adapter.sources, ['intro.mp3'], 'time alone never advances a clip');
  adapter.last!.end();
  assert.deepEqual(clock.pendingDelays, [600]);
  clock.advance(599);
  assert.equal(adapter.clips.length, 1);
  clock.advance(1);
  assert.deepEqual(adapter.sources, ['intro.mp3', 'title.mp3']);
  adapter.last!.end();
  clock.advance(800);
  const r = await done;
  assert.equal(r.status, 'completed');
  assert.equal(r.stepIndex, 4);
  assert.deepEqual(log, ['step0:clip', 'step1:delay', 'step2:clip', 'step3:delay', 'step4:action', 'buttons']);
  assert.deepEqual(states, ['playing', 'waiting', 'playing', 'waiting', 'completed']);
});

test('the transition table matches the documented model and every recorded change is legal', () => {
  const all: SequenceStatus[] = ['idle', 'playing', 'waiting', 'paused', 'completed', 'cancelled', 'failed'];
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...all].sort());
  assert.equal(canTransition('idle', 'paused'), false);
  assert.equal(canTransition('paused', 'completed'), false, 'a paused sequence cannot complete');
  assert.equal(canTransition('completed', 'paused'), false);
  assert.equal(canTransition('waiting', 'paused'), true);
  for (const s of all) assert.equal(isTerminal(s), s === 'completed' || s === 'cancelled' || s === 'failed');
  // Walk several scenarios and check every emitted change against the table.
  const { adapter, clock, seq } = rig([clip('a'), delay(10), clip('b')]);
  const seen: [SequenceStatus, SequenceStatus][] = [];
  seq.on('state', ({ status, previous }) => seen.push([previous, status]));
  void seq.start(); seq.pause(); seq.resume(); adapter.last!.end(); seq.pause(); seq.resume(); clock.advance(10); adapter.last!.fail();
  void seq.start(); seq.cancel();
  void seq.start(); adapter.last!.end(); clock.advance(10); adapter.last!.end();
  for (const [from, to] of seen) assert.ok(canTransition(from, to), `${from} -> ${to}`);
  assert.equal(seen.at(-1)![1], 'completed');
});

test('empty and action-only sequences complete immediately', async () => {
  const hits: number[] = [];
  const { seq, states } = rig([action(() => hits.push(1)), action(() => hits.push(2))]);
  const r = await seq.start();
  assert.equal(r.status, 'completed');
  assert.deepEqual(hits, [1, 2]);
  assert.deepEqual(states, ['completed']);
  assert.equal((await rig([]).seq.start()).status, 'completed');
});

test('an action that cancels the sequence stops it before any later step', async () => {
  const later: string[] = [];
  const { adapter, seq } = rig([action(() => { seq.cancel('from action'); }), clip('never.mp3'), action(() => later.push('x'))]);
  const r = await seq.start();
  assert.equal(r.status, 'cancelled');
  assert.equal(adapter.clips.length, 0);
  assert.deepEqual(later, []);
});

test('a throwing action fails the sequence with code adapter', async () => {
  const { seq } = rig([action(() => { throw new Error('ui exploded'); }), clip('never.mp3')]);
  const r = await seq.start();
  assert.equal(r.status, 'failed');
  assert.equal(r.error?.code, 'adapter');
  assert.match(r.error!.message, /ui exploded/);
});

test('invalid steps are rejected up front with invalid-step', () => {
  const adapter = new MockAdapter();
  const bad = (steps: unknown[]) => assert.throws(() => new AudioSequence(adapter, steps as never), (e: unknown) => isAudioFlowError(e) && e.code === 'invalid-step');
  bad([delay(-1)]);
  bad([delay(Number.NaN)]);
  bad([{ kind: 'clip' }]);
  bad([{ kind: 'action' }]);
  bad([{ kind: 'mystery' }]);
  bad([null]);
});

test('the sequence is reusable: start again after completed, failed and cancelled', async () => {
  const { adapter, seq } = rig([clip('a.mp3')]);
  let d = seq.start(); adapter.last!.end(); assert.equal((await d).status, 'completed');
  d = seq.start(); adapter.last!.fail(); assert.equal((await d).status, 'failed');
  assert.equal(seq.error?.code, 'decode');
  d = seq.start(); assert.equal(seq.error, null, 'error cleared on restart'); seq.cancel(); assert.equal((await d).status, 'cancelled');
  d = seq.start(); adapter.last!.end(); assert.equal((await d).status, 'completed');
  assert.equal(adapter.clips.length, 4);
});

test('listeners: unsubscribe, listenerCount, dispose releases everything', async () => {
  const { adapter, seq } = rig([clip('a.mp3'), clip('b.mp3')]);
  const base = seq.listenerCount(); // the rig's own state listener
  let steps = 0;
  const off = seq.on('step', () => { steps++; });
  const offEnd = seq.on('end', () => {});
  assert.equal(seq.listenerCount(), base + 2);
  assert.equal(seq.listenerCount('step'), 1);
  void seq.start();
  off();
  off(); // idempotent
  adapter.last!.end();
  assert.equal(steps, 1, 'listener not called after unsubscribe');
  offEnd();
  assert.equal(seq.listenerCount(), base);
  seq.on('state', () => {});
  seq.dispose();
  assert.equal(seq.listenerCount(), 0);
  assert.equal(seq.status, 'cancelled');
  assert.equal(adapter.last!.stopped, true);
  assert.throws(() => seq.start(), (e: unknown) => isAudioFlowError(e) && e.code === 'invalid-state');
});

test('a throwing listener does not break the sequence', async () => {
  const reported: string[] = [];
  const { adapter, seq } = rig([clip('a.mp3'), clip('b.mp3')], {}, { onListenerError: (_e, ev) => reported.push(ev) });
  seq.on('step', () => { throw new Error('bad listener'); });
  const d = seq.start();
  adapter.last!.end();
  adapter.last!.end();
  assert.equal((await d).status, 'completed');
  assert.deepEqual(reported, ['step', 'step']);
});

test('events: clipstart only for the live clip, stepend for finished steps, end with the result', async () => {
  const { adapter, clock, seq } = rig([clip('a.mp3'), delay(5)]);
  const ev: string[] = [];
  seq.on('clipstart', ({ index }) => ev.push(`clipstart${index}`));
  seq.on('stepend', ({ index }) => ev.push(`stepend${index}`));
  seq.on('end', (r) => ev.push(`end:${r.status}`));
  void seq.start();
  const a = adapter.last!;
  a.start(); a.start();
  a.end();
  a.start(); // late "playing" after end: ignored
  clock.advance(5);
  assert.deepEqual(ev, ['clipstart0', 'stepend0', 'stepend1', 'end:completed']);
});

test('pause of a clip whose handle lacks pause() still freezes the sequence', () => {
  const clock = new ManualScheduler();
  const seq = new AudioSequence<string>({ capabilities: { pause: true }, play: () => ({ stop() {} }) }, [clip('a')], { scheduler: clock });
  void seq.start();
  assert.equal(seq.pause(), true);
  assert.equal(seq.status, 'paused');
});

test('errors are typed and structural', () => {
  const e = new AudioFlowError('decode', 'bad file', { stepIndex: 2, label: 'song', cause: new Error('x') });
  assert.equal(e.name, 'AudioFlowError');
  assert.equal(e.code, 'decode');
  assert.equal(e.stepIndex, 2);
  assert.ok(e instanceof Error);
  assert.ok(isAudioFlowError({ name: 'AudioFlowError', code: 'missing', message: 'm' }));
  assert.equal(isAudioFlowError(new Error('x')), false);
});

test('the core is platform-free: no DOM / HTMLAudioElement use outside src/web', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const coreFiles = readdirSync(root).filter((f) => f.endsWith('.ts'));
  assert.ok(coreFiles.length >= 5);
  for (const f of coreFiles) {
    const code = readFileSync(join(root, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /\b(HTMLAudioElement|new Audio\(|document\.|window\.|AudioContext)\b/, f);
  }
});
