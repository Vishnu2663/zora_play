// Speech queue: decides WHAT is spoken and WHEN. Platform-free and clock-
// injected so overlap, cancellation and dedupe rules are unit-testable.
// The web layer supplies a Player (bundled clips, or system TTS only if the
// probe verified it) and a resolver (text -> clips).

export type SpeechState = 'queued' | 'speaking' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type Priority = 'replace' | 'queue';

export interface Clip { id: string; src: string; ms: number }
export type Speakable = { kind: 'clips'; clips: Clip[] } | { kind: 'tts'; text: string };

export interface Resolution { speakable: Speakable | null; reason?: string }

export interface PlayHandle { stop(): void; pause(): void; resume(): void }
export interface Player {
  /** Start playback; must call onStart once audio actually starts and onEnd exactly once. */
  play(item: Speakable, cb: { onStart: () => void; onEnd: (ok: boolean, error?: string) => void }): PlayHandle;
}

export interface Utterance {
  key: number;
  text: string;
  priority: Priority;
  state: SpeechState;
  reason?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface QueueOptions {
  now?: () => number;
  /** Ignore an identical line requested again within this window (React re-renders, double presses). */
  dedupeMs?: number;
  /** Max lines waiting behind the current one (older waiting lines are cancelled). */
  maxQueue?: number;
  /** Dev-time diagnostics (missing clips etc.). */
  log?: (level: 'warn' | 'error', msg: string) => void;
}

export class SpeechQueue {
  enabled = true;
  private player: Player;
  private resolve: (text: string) => Resolution;
  private now: () => number;
  private dedupeMs: number;
  private maxQueue: number;
  private log: NonNullable<QueueOptions['log']>;
  private seq = 0;
  private current: { u: Utterance; handle: PlayHandle | null; item: Speakable } | null = null;
  private waiting: { u: Utterance; item: Speakable }[] = [];
  private last: { text: string; at: number; u: Utterance } | null = null;
  private listeners = new Set<(u: Utterance) => void>();
  readonly history: Utterance[] = []; // bounded, for diagnostics/tests

  constructor(player: Player, resolve: (text: string) => Resolution, opts: QueueOptions = {}) {
    this.player = player;
    this.resolve = resolve;
    this.now = opts.now ?? (() => Date.now());
    this.dedupeMs = opts.dedupeMs ?? 600;
    this.maxQueue = opts.maxQueue ?? 2;
    this.log = opts.log ?? (() => {});
  }

  onChange(fn: (u: Utterance) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  get speaking(): boolean { return this.current?.u.state === 'speaking'; }
  get currentUtterance(): Utterance | null { return this.current?.u ?? null; }
  get queued(): number { return this.waiting.length; }

  private emit(u: Utterance) {
    this.history.push({ ...u });
    if (this.history.length > 50) this.history.shift();
    for (const l of this.listeners) l(u);
  }

  private finish(u: Utterance, state: SpeechState, reason?: string) {
    u.state = state;
    u.reason = reason;
    u.endedAt = this.now();
    this.emit(u);
  }

  speak(text: string, opts: { priority?: Priority; force?: boolean } = {}): Utterance {
    const priority = opts.priority ?? 'replace';
    const t = this.now();
    if (!opts.force && this.last && this.last.text === text && t - this.last.at < this.dedupeMs) return this.last.u;
    const u: Utterance = { key: ++this.seq, text, priority, state: 'queued' };
    this.last = { text, at: t, u };

    if (!this.enabled) { this.finish(u, 'skipped', 'voice off'); return u; }

    const r = this.resolve(text);
    if (!r.speakable) {
      // Never report success for a line we cannot actually voice.
      this.log('error', `[speech] no voice for "${text}": ${r.reason ?? 'unknown'}`);
      if (priority === 'replace') this.cancelAll('replaced');
      this.finish(u, 'failed', r.reason ?? 'no clip');
      return u;
    }

    if (priority === 'replace') this.cancelAll('replaced');
    this.emit(u);
    if (!this.current) this.start(u, r.speakable);
    else {
      this.waiting.push({ u, item: r.speakable });
      while (this.waiting.length > this.maxQueue) {
        const dropped = this.waiting.shift()!;
        this.finish(dropped.u, 'cancelled', 'queue full');
      }
    }
    return u;
  }

  private start(u: Utterance, item: Speakable) {
    const entry: { u: Utterance; handle: PlayHandle | null; item: Speakable } = { u, handle: null, item };
    this.current = entry;
    let ended = false;
    entry.handle = this.player.play(item, {
      onStart: () => {
        if (this.current !== entry || ended) return;
        u.state = 'speaking';
        u.startedAt = this.now();
        this.emit(u);
      },
      onEnd: (ok, error) => {
        if (ended) return;
        ended = true;
        if (this.current !== entry) return; // already cancelled
        this.current = null;
        if (ok) this.finish(u, 'completed');
        else { this.log('error', `[speech] playback failed for "${u.text}": ${error ?? 'unknown'}`); this.finish(u, 'failed', error ?? 'playback error'); }
        this.next();
      },
    });
  }

  private next() {
    const n = this.waiting.shift();
    if (n) this.start(n.u, n.item);
  }

  /** Stop current speech and drop everything queued (navigation, STOP, new replace line). */
  cancelAll(reason = 'cancelled') {
    for (const w of this.waiting) this.finish(w.u, 'cancelled', reason);
    this.waiting = [];
    if (this.current) {
      const c = this.current;
      this.current = null;
      c.handle?.stop();
      this.finish(c.u, 'cancelled', reason);
    }
  }

  pause() {
    if (this.current && this.current.u.state === 'speaking') {
      this.current.handle?.pause();
      this.current.u.state = 'paused';
      this.emit(this.current.u);
    }
  }

  resume() {
    if (this.current && this.current.u.state === 'paused') {
      this.current.handle?.resume();
      this.current.u.state = 'speaking';
      this.emit(this.current.u);
    }
  }
}
