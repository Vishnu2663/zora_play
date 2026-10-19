// ClipPlayer: one HTMLAudioElement at a time for recorded clips (sung rhymes, animal sounds).
// - Starting a clip always stops the previous one on the same player (no overlap).
// - A missing / undecodable file is reported through onError (and console.error); it is never
//   replaced by a beep. The caller decides what to show.
// - Time comes from the element's currentTime, so anything driven by it (lyrics) stops when paused.

export type ClipStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface ClipHandlers { onEnd?: () => void; onError?: (message: string) => void; onStart?: () => void }

export interface RhymeWord { w: string; s: number; e: number }
export interface RhymeLineTiming { text: string; start: number; end: number; words: RhymeWord[] }
export interface RhymeTiming {
  id: string; title: string; audio: string; durationMs: number; vocals: string; lines: RhymeLineTiming[];
  /** Each avatar speaks at its own pace, so its word timings differ (scripts/gen-rhymes.py). */
  avatars?: Record<string, { durationMs: number; lines: RhymeLineTiming[] }>;
}

export class ClipPlayer {
  status: ClipStatus = 'idle';
  error: string | null = null;
  url: string | null = null;
  volume = 0.8;
  rate = 1;
  /** Set by a caller that wants to hear about load/play failures that happen after play() returned. */
  onFail: ((message: string) => void) | null = null;
  private el: HTMLAudioElement | null = null;
  private token = 0;

  play(url: string, h: ClipHandlers = {}) {
    this.stop();
    const token = ++this.token;
    this.url = url;
    this.error = null;
    this.status = 'loading';
    const fail = (msg: string) => {
      if (token !== this.token) return;
      this.status = 'error';
      this.error = msg;
      console.error(`[audio] ${msg}`);
      h.onError?.(msg);
      this.onFail?.(msg);
    };
    let el: HTMLAudioElement;
    try { el = new Audio(); } catch (e) { fail(`Audio unavailable: ${String(e)}`); return; }
    this.el = el;
    el.preload = 'auto';
    el.volume = this.volume;
    el.playbackRate = this.rate;
    el.addEventListener('error', () => fail(`cannot load ${url} (media error ${el.error?.code ?? '?'})`));
    el.addEventListener('loadedmetadata', () => {
      if (!(el.duration > 0)) fail(`${url} has zero duration`);
    });
    el.addEventListener('playing', () => {
      if (token !== this.token) return;
      this.status = 'playing';
      h.onStart?.();
    });
    el.addEventListener('ended', () => {
      if (token !== this.token) return;
      this.status = 'ended';
      h.onEnd?.();
    });
    el.src = url;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch((e: unknown) => fail(`play() rejected for ${url}: ${(e as Error)?.name ?? e}`));
  }

  pause() {
    if (this.status !== 'playing' && this.status !== 'loading') return;
    this.el?.pause();
    this.status = 'paused';
  }

  resume() {
    if (this.status !== 'paused' || !this.el) return;
    this.status = 'playing';
    this.el.play().catch((e: unknown) => { this.status = 'error'; this.error = `resume failed: ${String(e)}`; console.error(`[audio] ${this.error}`); });
  }

  /** Start again from the beginning. */
  restart() {
    if (!this.el || !this.url) return;
    try { this.el.currentTime = 0; } catch { /* not seekable yet */ }
    this.status = 'playing';
    this.el.play().catch((e: unknown) => { this.status = 'error'; this.error = `replay failed: ${String(e)}`; console.error(`[audio] ${this.error}`); });
  }

  stop() {
    this.token++;
    this.onFail = null;
    const el = this.el;
    this.el = null;
    if (el) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* already torn down */ } }
    this.status = 'idle';
    this.url = null;
  }

  setVolume(v: number) { this.volume = v; if (this.el) this.el.volume = v; }
  setRate(r: number) { this.rate = r; if (this.el) this.el.playbackRate = r; }
  get time() { return this.el ? this.el.currentTime : 0; }
  get duration() { return this.el && this.el.duration > 0 ? this.el.duration : 0; }
}

/** Which line/word of a rhyme is being sung at `t` seconds (null before the first word). Pure, for tests. */
export function cursorAt(timing: RhymeTiming, t: number): { line: number; word: number } | null {
  let found: { line: number; word: number } | null = null;
  for (let li = 0; li < timing.lines.length; li++) {
    const ws = timing.lines[li].words;
    for (let wi = 0; wi < ws.length; wi++) { if (ws[wi].s <= t) found = { line: li, word: wi }; else return found; }
  }
  return found;
}

/** Index of the lyric line that should be emphasised at time t. */
export function lineAt(timing: RhymeTiming, t: number): number {
  let idx = -1;
  timing.lines.forEach((l, i) => { if (l.start <= t) idx = i; });
  return idx;
}

export function rhymeTimingFor(id: string, avatar?: string): RhymeTiming | undefined {
  const all = (typeof window !== 'undefined' && (window as unknown as { __ZORA_RHYMES__?: Record<string, RhymeTiming> }).__ZORA_RHYMES__) || {};
  const t = all[id];
  const own = t && avatar ? t.avatars?.[avatar] : undefined;
  return own ? { ...t, durationMs: own.durationMs, lines: own.lines } : t;
}
