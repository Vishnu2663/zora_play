// The 12 race conditions from the spec. Every test is deterministic: the mock adapter only ends a clip
// when the test says so, and the manual clock only moves when the test advances it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioChannel, AudioFlowError, AudioSequence, clip, delay, type SequenceResult } from '../src/index.ts';
import { ManualScheduler, MockAdapter } from '../src/testing/index.ts';
import { flush, rig } from './helpers.ts';

const THREE = [clip('a.mp3'), delay(500), clip('b.mp3')];

test('race 1: cancel during a clip stops it and never starts later clips', async () => {
  const { adapter, clock, seq } = rig(THREE);
  const done = seq.start();
  const a = adapter.last!;
  assert.equal(seq.status, 'playing');
  assert.equal(seq.cancel('user left'), true);
  assert.equal(a.stopped, true, 'current clip stopped');
  a.end(); // the platform still fires "ended" afterwards
  clock.runAll();
  assert.deepEqual(adapter.sources, ['a.mp3'], 'b.mp3 never requested');
  const r = await done;
  assert.equal(r.status, 'cancelled');
  assert.equal(r.error?.code, 'cancelled');
  assert.equal(seq.status, 'cancelled');
});

test('race 2: cancel during a delay clears the timer and never starts the next clip', async () => {
  const { adapter, clock, seq } = rig(THREE);
  const done = seq.start();
  adapter.last!.end();
  assert.equal(seq.status, 'waiting');
  assert.equal(clock.pending, 1);
  seq.cancel();
  assert.equal(clock.pending, 0, 'timer cleared');
  clock.advance(10_000);
  assert.deepEqual(adapter.sources, ['a.mp3']);
  assert.equal((await done).status, 'cancelled');
});

test('race 3: a new sequence started right after cancel runs cleanly and alone', async () => {
  const adapter = new MockAdapter();
  const clock = new ManualScheduler();
  const first = new AudioSequence(adapter, THREE, { scheduler: clock });
  const second = new AudioSequence(adapter, [clip('c.mp3'), clip('d.mp3')], { scheduler: clock });
  void first.start();
  adapter.last!.end(); // first is now waiting
  first.cancel();
  const done = second.start();
  clock.runAll(); // the first one's delay must not fire
  adapter.last!.end();
  adapter.last!.end();
  assert.deepEqual(adapter.sources, ['a.mp3', 'c.mp3', 'd.mp3']);
  assert.equal((await done).status, 'completed');
  assert.equal(first.status, 'cancelled');
});

test('race 4: a late completion from an old clip is ignored after restart', async () => {
  const { adapter, seq } = rig([clip('a.mp3'), clip('b.mp3')]);
  void seq.start();
  const oldA = adapter.last!;
  seq.cancel();
  const done = seq.start(); // same instance, new run
  const newA = adapter.last!;
  assert.notEqual(oldA, newA);
  oldA.end(); // late "ended" from the cancelled run
  assert.equal(seq.stepIndex, 0, 'still on the first clip of the new run');
  assert.deepEqual(adapter.sources, ['a.mp3', 'a.mp3']);
  newA.end();
  adapter.last!.end();
  assert.equal((await done).status, 'completed');
});

test('race 5: an old run\'s promise settles as cancelled and cannot affect a newer run', async () => {
  const { adapter, seq } = rig([clip('a.mp3'), clip('b.mp3')]);
  const results: string[] = [];
  const firstRun = seq.start().then((r) => { results.push(`old:${r.status}`); });
  seq.cancel();
  const secondRun = seq.start().then((r) => { results.push(`new:${r.status}`); });
  await firstRun; // old promise settles while the new run is in progress
  assert.equal(seq.status, 'playing', 'new run unaffected by the old promise');
  assert.equal(seq.isActive, true);
  adapter.last!.end();
  adapter.last!.end();
  await secondRun;
  assert.deepEqual(results, ['old:cancelled', 'new:completed']);
});

test('race 6: a load failure fails the sequence with a typed error and plays nothing after it', async () => {
  const { adapter, clock, seq } = rig(THREE);
  const errors: AudioFlowError[] = [];
  seq.on('error', (e) => errors.push(e));
  const done = seq.start();
  adapter.last!.fail(new AudioFlowError('missing', 'cannot load a.mp3'));
  clock.runAll();
  const r = await done;
  assert.equal(r.status, 'failed');
  assert.equal(r.error?.code, 'missing');
  assert.equal(r.error?.stepIndex, 0);
  assert.equal(errors.length, 1);
  assert.equal(adapter.clips[0].stopped, true, 'failed clip released');
  assert.deepEqual(adapter.sources, ['a.mp3']);
  // A non-AudioFlowError from an adapter becomes code "adapter"
  const r2 = rig([clip('x.mp3')]);
  const d2 = r2.seq.start();
  r2.adapter.last!.fail(new Error('boom'));
  assert.equal((await d2).error?.code, 'adapter');
  // A synchronous throw from play() is also a step failure
  const r3 = rig([clip('x.flac')], { throwOnPlay: () => new AudioFlowError('unsupported', 'flac not supported') });
  assert.equal((await r3.seq.start()).error?.code, 'unsupported');
});

test('race 7: duplicate completion events advance only once', async () => {
  const { adapter, clock, seq } = rig([clip('a.mp3'), delay(100), clip('b.mp3'), clip('c.mp3')]);
  const done = seq.start();
  const a = adapter.last!;
  a.end(); a.end(); a.end();
  assert.equal(clock.pending, 1, 'one delay, not three');
  clock.advance(100);
  const b = adapter.last!;
  b.end(); b.end();
  assert.deepEqual(adapter.sources, ['a.mp3', 'b.mp3', 'c.mp3']);
  adapter.last!.end();
  adapter.last!.end();
  assert.equal((await done).status, 'completed');
  assert.equal(adapter.clips.length, 3);
});

test('race 8: pause while waiting freezes the remaining delay', () => {
  const { adapter, clock, seq } = rig(THREE);
  void seq.start();
  adapter.last!.end();
  clock.advance(200); // 300 ms left
  assert.equal(seq.pause(), true);
  assert.equal(seq.status, 'paused');
  assert.equal(clock.pending, 0, 'timer stopped while paused');
  clock.advance(10_000);
  assert.deepEqual(adapter.sources, ['a.mp3'], 'nothing starts while paused');
});

test('race 9: resume continues exactly where it paused (delay remainder and clip)', async () => {
  const { adapter, clock, seq, states } = rig(THREE);
  const done = seq.start();
  const a = adapter.last!;
  assert.equal(seq.pause(), true);
  assert.equal(a.paused, true, 'clip paused through the adapter');
  a.end(); // a platform "ended" while paused is held, not acted on
  assert.equal(seq.status, 'paused');
  assert.equal(seq.resume(), true);
  assert.equal(seq.status, 'waiting', 'the held end is honoured on resume');
  clock.advance(200);
  seq.pause();
  clock.advance(5_000);
  seq.resume();
  assert.deepEqual(clock.pendingDelays, [300], 'only the remaining 300 ms is re-armed');
  clock.advance(299);
  assert.deepEqual(adapter.sources, ['a.mp3']);
  clock.advance(1);
  assert.deepEqual(adapter.sources, ['a.mp3', 'b.mp3']);
  seq.pause(); assert.equal(adapter.last!.paused, true);
  seq.resume(); assert.equal(adapter.last!.paused, false);
  adapter.last!.end();
  assert.equal((await done).status, 'completed');
  assert.deepEqual(states, ['playing', 'paused', 'playing', 'waiting', 'paused', 'waiting', 'playing', 'paused', 'playing', 'completed']);
});

test('race 9b: pause is refused when the adapter cannot pause', () => {
  const { adapter, seq } = rig(THREE, { pause: false });
  assert.equal(seq.canPause, false);
  void seq.start();
  assert.equal(seq.pause(), false);
  assert.equal(seq.status, 'playing');
  assert.equal(adapter.last!.paused, false);
});

test('race 10: repeated cancel is a harmless no-op', async () => {
  const { adapter, seq, states } = rig(THREE);
  const done = seq.start();
  assert.equal(seq.cancel(), true);
  assert.equal(seq.cancel(), false);
  assert.equal(seq.cancel(), false);
  assert.equal(adapter.last!.stopCalls, 1, 'clip stopped once');
  assert.deepEqual(states, ['playing', 'cancelled']);
  assert.equal((await done).status, 'cancelled');
  // cancel before ever starting is also a no-op
  const fresh = rig(THREE);
  assert.equal(fresh.seq.cancel(), false);
  assert.equal(fresh.seq.status, 'idle');
});

test('race 11: starting while another sequence is active never overlaps (channel interrupt, and reject)', async () => {
  const adapter = new MockAdapter();
  const clock = new ManualScheduler();
  const channel = new AudioChannel();
  const rhyme = new AudioSequence(adapter, [clip('song.mp3')], { scheduler: clock, name: 'rhyme' });
  const quiz = new AudioSequence(adapter, [clip('moo.mp3')], { scheduler: clock, name: 'quiz' });
  const r1 = channel.play(rhyme);
  const song = adapter.last!;
  const r2 = channel.play(quiz);
  assert.equal(song.stopped, true, 'song stopped before the quiz starts');
  assert.equal(adapter.clips.filter((c) => c.audible).length, 1, 'only one clip audible');
  assert.equal(channel.active, quiz);
  song.end(); // stale
  adapter.last!.end();
  assert.equal((await r1).status, 'cancelled');
  assert.equal((await r2).status, 'completed');
  await flush();
  assert.equal(channel.active, null);
  // same instance started twice directly is a programming error
  void rhyme.start();
  assert.throws(() => rhyme.start(), (e: unknown) => e instanceof AudioFlowError && e.code === 'invalid-state');
  rhyme.cancel();
  // reject policy keeps the first one
  const strict = new AudioChannel({ policy: 'reject' });
  const a = new AudioSequence(adapter, [clip('a.mp3')], { scheduler: clock, name: 'a' });
  const b = new AudioSequence(adapter, [clip('b.mp3')], { scheduler: clock, name: 'b' });
  void strict.play(a);
  const rb = await strict.play(b);
  assert.equal(rb.status, 'failed');
  assert.equal(rb.error?.code, 'busy');
  assert.equal(b.status, 'idle', 'b never started');
  assert.equal(a.status, 'playing');
});

test('race 12: resume after completed or cancelled does nothing', async () => {
  const { adapter, seq } = rig([clip('a.mp3')]);
  const done = seq.start();
  adapter.last!.end();
  await done;
  assert.equal(seq.resume(), false);
  assert.equal(seq.pause(), false);
  assert.equal(seq.status, 'completed');
  void seq.start();
  seq.pause();
  seq.cancel();
  assert.equal(seq.resume(), false, 'resume after cancel (even from paused) does nothing');
  assert.equal(seq.status, 'cancelled');
  assert.equal(adapter.clips.length, 2);
  assert.equal(adapter.last!.paused, true, 'cancelled clip was not resumed');
});

test('a clip that ends synchronously inside play() still advances once', async () => {
  const clock = new ManualScheduler();
  let plays = 0;
  const seq = new AudioSequence<string>({
    capabilities: { pause: false },
    play: (_s, cb) => { plays++; cb.onStarted(); cb.onEnded(); cb.onEnded(); return { stop() {} }; },
  }, [clip('a'), clip('b')], { scheduler: clock });
  const r: SequenceResult = await seq.start();
  assert.equal(r.status, 'completed');
  assert.equal(plays, 2);
});

test('an adapter "cancelled" error ends the sequence cancelled, not failed', async () => {
  const { adapter, seq } = rig(THREE);
  const done = seq.start();
  adapter.last!.fail(new AudioFlowError('cancelled', 'replaced by other speech'));
  const r = await done;
  assert.equal(r.status, 'cancelled');
  assert.equal(seq.error?.code, 'cancelled');
});

test('channel.cancel() stops the active sequence (navigation) and is a no-op when idle', async () => {
  const adapter = new MockAdapter();
  const channel = new AudioChannel();
  const seq = new AudioSequence(adapter, THREE, { scheduler: new ManualScheduler() });
  const done = channel.play(seq);
  assert.equal(channel.cancel('navigate'), true);
  assert.equal(adapter.last!.stopped, true);
  assert.equal((await done).status, 'cancelled');
  assert.equal(channel.cancel(), false);
  assert.equal(channel.active, null);
});
