// HtmlAudioAdapter against a fake HTMLAudioElement (Node has EventTarget, not <audio>).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioSequence, clip, delay } from '../src/index.ts';
import { HtmlAudioAdapter, mediaErrorCode, playRejectionError } from '../src/web/index.ts';
import { ManualScheduler } from '../src/testing/index.ts';

class FakeAudio extends EventTarget {
  src = '';
  preload = '';
  volume = 1;
  playbackRate = 1;
  duration = Number.NaN;
  error: { code: number } | null = null;
  paused = true;
  playCalls = 0;
  loads = 0;
  rejectWith: unknown = null;
  listeners = 0;
  override addEventListener(type: string, l: EventListenerOrEventListenerObject | null) { this.listeners++; super.addEventListener(type, l); }
  override removeEventListener(type: string, l: EventListenerOrEventListenerObject | null) { this.listeners--; super.removeEventListener(type, l); }
  play(): Promise<void> { this.playCalls++; this.paused = false; return this.rejectWith ? Promise.reject(this.rejectWith) : Promise.resolve(); }
  pause() { this.paused = true; }
  load() { this.loads++; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  fire(type: string) { this.dispatchEvent(new Event(type)); }
}

function setup(opts: { reject?: unknown } = {}) {
  const made: FakeAudio[] = [];
  const adapter = new HtmlAudioAdapter<string>({
    resolveUrl: (id) => `audio/${id}.mp3`,
    createElement: () => { const a = new FakeAudio(); a.rejectWith = opts.reject ?? null; made.push(a); return a as unknown as HTMLAudioElement; },
    volume: 0.5,
  });
  return { adapter, made };
}
const tick = () => new Promise<void>((r) => setImmediate(r));

test('web adapter: plays clips in order on real "ended" events and detaches listeners', async () => {
  const { adapter, made } = setup();
  const clock = new ManualScheduler();
  const seq = new AudioSequence(adapter, [clip('intro'), delay(300), clip('song')], { scheduler: clock });
  const done = seq.start();
  assert.equal(made.length, 1);
  assert.equal(made[0].src, 'audio/intro.mp3');
  assert.equal(made[0].volume, 0.5);
  assert.equal(made[0].listeners, 4);
  made[0].fire('playing');
  made[0].fire('ended');
  assert.equal(made[0].listeners, 0, 'listeners removed after end');
  made[0].fire('ended'); // duplicate platform event: element no longer observed
  clock.advance(300);
  assert.equal(made.length, 2);
  made[1].fire('ended');
  assert.equal((await done).status, 'completed');
});

test('web adapter: media errors map to typed codes and release the element', async () => {
  const cases: [number, string][] = [[2, 'missing'], [3, 'decode'], [4, 'unsupported'], [1, 'adapter']];
  for (const [code, expected] of cases) {
    const { adapter, made } = setup();
    const seq = new AudioSequence(adapter, [clip('x'), clip('never')], { scheduler: new ManualScheduler() });
    const done = seq.start();
    made[0].error = { code };
    made[0].fire('error');
    const r = await done;
    assert.equal(r.error?.code, expected, `media error ${code}`);
    assert.equal(made[0].listeners, 0);
    assert.equal(made[0].src, '', 'element released');
    assert.equal(made.length, 1, 'next clip never created');
  }
  assert.equal(mediaErrorCode(undefined), 'adapter');
});

test('web adapter: zero-duration file is a decode error', async () => {
  const { adapter, made } = setup();
  const done = new AudioSequence(adapter, [clip('empty')], { scheduler: new ManualScheduler() }).start();
  made[0].duration = 0;
  made[0].fire('loadedmetadata');
  assert.equal((await done).error?.code, 'decode');
});

test('web adapter: rejected play() maps to typed errors; AbortError is ignored', async () => {
  const blocked = setup({ reject: Object.assign(new Error('blocked'), { name: 'NotAllowedError' }) });
  const r1 = await new AudioSequence(blocked.adapter, [clip('a')], { scheduler: new ManualScheduler() }).start();
  assert.equal(r1.error?.code, 'adapter');
  assert.match(r1.error!.message, /autoplay/);
  const unsupported = setup({ reject: Object.assign(new Error('nope'), { name: 'NotSupportedError' }) });
  const r2 = await new AudioSequence(unsupported.adapter, [clip('a')], { scheduler: new ManualScheduler() }).start();
  assert.equal(r2.error?.code, 'unsupported');
  const aborted = setup({ reject: Object.assign(new Error('interrupted by pause'), { name: 'AbortError' }) });
  const seq = new AudioSequence(aborted.adapter, [clip('a')], { scheduler: new ManualScheduler() });
  void seq.start();
  await tick();
  assert.equal(seq.status, 'playing', 'AbortError is not a failure');
  assert.equal(playRejectionError({ name: 'AbortError' }, 'u'), null);
});

test('web adapter: cancel stops and releases the element; late events are ignored', async () => {
  const { adapter, made } = setup();
  const seq = new AudioSequence(adapter, [clip('a'), clip('b')], { scheduler: new ManualScheduler() });
  const done = seq.start();
  seq.cancel();
  assert.equal(made[0].paused, true);
  assert.equal(made[0].src, '');
  assert.equal(made[0].listeners, 0);
  made[0].fire('ended');
  assert.equal((await done).status, 'cancelled');
  assert.equal(made.length, 1);
});

test('web adapter: pause/resume go through the element', () => {
  const { adapter, made } = setup();
  const seq = new AudioSequence(adapter, [clip('a')], { scheduler: new ManualScheduler() });
  assert.equal(seq.canPause, true);
  void seq.start();
  seq.pause();
  assert.equal(made[0].paused, true);
  seq.resume();
  assert.equal(made[0].paused, false);
  assert.equal(made[0].playCalls, 2);
});

test('web adapter: a non-string source without resolveUrl is unsupported', async () => {
  const adapter = new HtmlAudioAdapter<{ id: number }>({ createElement: () => new FakeAudio() as unknown as HTMLAudioElement });
  const r = await new AudioSequence(adapter, [clip({ id: 1 })], { scheduler: new ManualScheduler() }).start();
  assert.equal(r.error?.code, 'unsupported');
});
