// Speech service: every say() in the app goes through here.
//
// Voice sources, in order:
//   1. Bundled clips generated offline by scripts/gen-voice.py (Piper,
//      en_US-ljspeech-medium) and listed in window.__MILO_CLIPS__.
//   2. System speechSynthesis — ONLY if the audio probe verified it works on
//      this device AND a grown-up enabled it in settings. Off by default.
// If neither can voice a line, the bubble still shows, a dev error is logged,
// and the utterance ends 'failed'. Nothing is ever reported as spoken that wasn't.
//
// Mouth movement follows real playback events (start -> end): approximate
// lip-sync, not phoneme-accurate.

import { segment } from '../core/phrases.ts';
import { SpeechQueue, type Clip, type Player, type Resolution, type Speakable, type Utterance } from '../core/speechQueue.ts';

interface ClipIndex { voices?: Record<string, Record<string, { file: string; ms: number; text: string }>> }

const clipIndex = (): ClipIndex =>
  ((typeof window !== 'undefined' && (window as unknown as { __MILO_CLIPS__?: ClipIndex }).__MILO_CLIPS__) || { voices: {} });

const TTS_VERIFIED_KEY = 'milo.ttsVerified';

export function readTtsVerified(): boolean {
  try { return window.localStorage.getItem(TTS_VERIFIED_KEY) === '1'; } catch { return false; }
}
export function writeTtsVerified(ok: boolean) {
  try { window.localStorage.setItem(TTS_VERIFIED_KEY, ok ? '1' : '0'); } catch { /* storage unavailable */ }
}

class WebPlayer implements Player {
  volume = 0.9;
  rate = 1; // speech speed (clips: playbackRate; tts: rate)
  gapMs = 0; // calm pause between the sentences of one line (used for jokes)

  play(item: Speakable, cb: { onStart: () => void; onEnd: (ok: boolean, error?: string) => void }) {
    return item.kind === 'clips' ? this.playClips(item.clips, cb) : this.playTts(item.text, cb);
  }

  private playClips(clips: Clip[], cb: { onStart: () => void; onEnd: (ok: boolean, error?: string) => void }) {
    const el = new Audio();
    let i = 0;
    let stopped = false;
    let started = false;
    let gap: ReturnType<typeof setTimeout> | null = null; // pause between sentences
    let gapPending = false; // paused while waiting for the gap: resume must carry on with the next clip, not replay the last
    const fail = (msg: string) => { if (!stopped) { stopped = true; cb.onEnd(false, msg); } };
    const playNext = () => {
      if (stopped) return;
      if (i >= clips.length) { stopped = true; cb.onEnd(true); return; }
      el.src = clips[i++].src;
      el.volume = this.volume;
      el.playbackRate = this.rate;
      el.play().catch((e) => fail(`play() rejected: ${e?.name ?? e}`));
    };
    el.addEventListener('playing', () => { if (!started && !stopped) { started = true; cb.onStart(); } });
    el.addEventListener('ended', () => {
      if (this.gapMs > 0 && i < clips.length) gap = setTimeout(() => { gap = null; playNext(); }, this.gapMs);
      else playNext();
    });
    el.addEventListener('error', () => fail(`media error ${el.error?.code ?? '?'} on ${el.src.split('/').pop()}`));
    playNext();
    return {
      stop: () => { stopped = true; if (gap) clearTimeout(gap); gap = null; el.pause(); el.removeAttribute('src'); el.load(); },
      pause: () => { if (gap) { clearTimeout(gap); gap = null; gapPending = true; } el.pause(); },
      resume: () => { if (gapPending || el.ended) { gapPending = false; playNext(); } else el.play().catch(() => {}); },
    };
  }

  private playTts(text: string, cb: { onStart: () => void; onEnd: (ok: boolean, error?: string) => void }) {
    const ss = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = this.rate;
    u.volume = this.volume;
    let done = false;
    u.onstart = () => cb.onStart();
    u.onend = () => { if (!done) { done = true; cb.onEnd(true); } };
    u.onerror = (e) => { if (!done) { done = true; cb.onEnd(false, `tts ${(e as SpeechSynthesisErrorEvent).error}`); } };
    ss.cancel();
    ss.speak(u);
    return {
      stop: () => { done = true; ss.cancel(); },
      pause: () => ss.pause(),
      resume: () => ss.resume(),
    };
  }
}

export class SpeechService {
  readonly player = new WebPlayer();
  readonly queue: SpeechQueue;
  character = 'dino';
  allowSystemTts = false; // grown-up setting; also requires readTtsVerified()

  constructor() {
    this.queue = new SpeechQueue(this.player, (t) => this.resolve(t), {
      now: () => performance.now(),
      log: (level, msg) => (level === 'error' ? console.error(msg) : console.warn(msg)),
    });
  }

  /** text -> clips for the current character (all sentences must be covered). */
  resolve(text: string): Resolution {
    const { phrases, missing } = segment(text);
    const voice = clipIndex().voices?.[this.character] ?? {};
    const noClip = phrases.filter((p) => !voice[p.id]);
    if (!missing.length && !noClip.length) {
      return { speakable: { kind: 'clips', clips: phrases.map((p) => ({ id: p.id, src: voice[p.id].file, ms: voice[p.id].ms })) } };
    }
    if (this.allowSystemTts && readTtsVerified() && typeof window.speechSynthesis !== 'undefined') {
      return { speakable: { kind: 'tts', text: phrases.length ? phrases.map((p) => p.speak).join(' ') : text } };
    }
    const why = [
      missing.length ? `not in phrase catalog: ${missing.map((m) => `"${m}"`).join(', ')}` : '',
      noClip.length ? `no ${this.character} clip for: ${noClip.map((p) => p.id).join(', ')}` : '',
    ].filter(Boolean).join('; ');
    return { speakable: null, reason: why };
  }

  speak(text: string, priority: 'replace' | 'queue' = 'replace'): Utterance { return this.queue.speak(text, { priority }); }

  /**
   * Speak one line and report how it really ended: 'completed' only when the audio finished,
   * 'failed' for a missing clip / playback error / voice off, 'cancelled' if something else replaced it.
   */
  speakAndWait(text: string, done: (r: 'completed' | 'failed' | 'cancelled', reason?: string) => void): () => void {
    let finished = false;
    let off: () => void = () => {};
    const end = (r: 'completed' | 'failed' | 'cancelled', reason?: string) => { if (finished) return; finished = true; off(); done(r, reason); };
    const u = this.queue.speak(text, { priority: 'replace', force: true });
    const check = (x: { key: number; state: string; reason?: string }) => {
      if (x.key !== u.key) return;
      if (x.state === 'completed') end('completed');
      else if (x.state === 'failed' || x.state === 'skipped') end('failed', x.reason);
      else if (x.state === 'cancelled') end('cancelled', x.reason);
    };
    if (['completed', 'failed', 'skipped', 'cancelled'].includes(u.state)) { setTimeout(() => check(u), 0); } else off = this.queue.onChange(check);
    return () => { finished = true; off(); this.queue.cancelAll('sequence cancelled'); };
  }

  /**
   * Run `cb` once nothing is being spoken (so a song or animal sound never overlaps dialogue).
   * `maxMs` is a safety net. Returns a function that cancels the wait.
   */
  whenIdle(cb: () => void, maxMs = 7000, startGraceMs = 0): () => void {
    let done = false;
    let off: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => { if (done) return; done = true; off(); if (timer) clearTimeout(timer); cb(); };
    // startGraceMs: a line just queued may not have begun playing yet, so give it time to start before calling it idle
    const arm = () => {
      if (done) return;
      if (!this.queue.speaking) { setTimeout(fire, 0); return; }
      off = this.queue.onChange(() => { if (!this.queue.speaking) setTimeout(fire, 80); });
      timer = setTimeout(fire, maxMs);
    };
    if (startGraceMs > 0) { timer = setTimeout(() => { timer = null; arm(); }, startGraceMs); } else arm();
    return () => { done = true; off(); if (timer) clearTimeout(timer); };
  }
  cancel(reason?: string) { this.queue.cancelAll(reason); }
  set enabled(v: boolean) { this.queue.enabled = v; if (!v) this.queue.cancelAll('voice off'); }
  get enabled() { return this.queue.enabled; }

  /** For diagnostics: which catalog phrases have a clip for a character. */
  coverage(character = this.character, ids: string[]): { have: string[]; missing: string[] } {
    const voice = clipIndex().voices?.[character] ?? {};
    return { have: ids.filter((id) => voice[id]), missing: ids.filter((id) => !voice[id]) };
  }
}

export const speech = new SpeechService();
