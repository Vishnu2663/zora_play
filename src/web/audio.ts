// AudioService: sound effects and the dance loop are synthesized at runtime with the Web Audio API;
// sung rhymes and animal sounds are bundled recordings played through ClipPlayer (clips.ts).
// - Everything is local: works fully offline.
// - Speech is NOT synthesized here: see speech.ts (bundled voice clips).
// - Only one rhyme and one animal sound can play at a time; starting one stops the other.
// - If Web Audio is missing or blocked (unverified on the Vega WebView),
//   every call is a safe no-op and the UI's visual feedback carries on.
// Channels: music (rhymes / dance loop) and sfx. Music is ducked while Milo
// speaks (speech.ts), so dialogue stays intelligible over songs.

import { RHYMES } from '../core/rhymes.ts';
import { animalSoundPath, type AnimalId } from '../core/games.ts';
import { DEFAULT_AVATAR } from '../core/avatars.ts';
import { BAND_TEMPOS, BELL_NOTES_HZ, INSTRUMENTS, INSTRUMENT_TUNE, instrumentNote, BandScheduler, type BandPattern, type BandRowId, type InstrumentId } from '../core/band.ts';
import { ClipPlayer, cursorAt, lineAt, rhymeTimingFor, type RhymeTiming } from './clips.ts';

export type ThemeTrack = 'home' | 'alphabet';
const THEME_FILES: Record<ThemeTrack, string> = { home: 'audio/music/home-theme.mp3', alphabet: 'audio/music/alphabet-tune.mp3' };
/** Dance Studio music: the user's own song "Wiggle with Milo", one seamless loop (scripts/cut-dance-song.py). */
const DANCE_FILE = 'audio/music/dance-song.mp3';
/** Dance Maker music: the owner's song "Silly Face, Silly Toes", one seamless loop. */
const MAKER_FILE = 'audio/music/dance-maker.mp3';
export type PlaybackState = 'idle' | 'playing' | 'paused';
export type Volume = 'low' | 'medium' | 'high';
const VOL: Record<Volume, number> = { low: 0.25, medium: 0.5, high: 0.8 };

type Ctx = AudioContext;

export class AudioService {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null; // sound effects: ducked while someone speaks, so words stay clear
  private streamEl: HTMLAudioElement | null = null;
  private band: BandScheduler | null = null;
  private bandTimer: ReturnType<typeof setInterval> | null = null;
  private bandPattern: () => BandPattern = () => [];
  private bandOnAudioClock = false;
  private failed = false;
  enabled = true;
  volume: Volume = 'medium';

  /** Sung rhyme (vocals + backing in one file, so they cannot drift apart). */
  readonly rhymeClip = new ClipPlayer();
  readonly animalClip = new ClipPlayer();
  rhymeTiming: RhymeTiming | null = null;
  /** Set when a rhyme / animal file is missing or cannot be decoded; shown on screen, never replaced by a beep. */
  rhymeError: string | null = null;
  animalError: string | null = null;
  private ducked = false;
  private live: AudioScheduledSourceNode[] = [];

  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private loopNextAt = 0;
  private loopStep = 0;
  private loopTempo = 1;

  /** Must be called from a user gesture (key press) because of autoplay rules. */
  unlock() {
    this.resumeTheme(); // a blocked autoplay of the theme starts at the first key press
    this.resumeDance();
    if (this.ctx || this.failed) { void this.ctx?.resume?.(); if (this.streamEl?.paused) void this.streamEl.play().catch(() => {}); return; }
    try {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) { this.failed = true; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = VOL[this.volume];
      this.connectOutput(this.ctx, this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.9;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
    } catch (err) {
      this.failed = true;
      console.warn('[audio] unavailable, continuing silently', err);
    }
  }

  /**
   * Fire OS / Android TV WebViews can leave AudioContext.destination silent while audio played through an
   * <audio> element is heard (seen on a Fire Stick with the Band feature). So the master bus goes through a
   * MediaStream into an <audio> element, falling back to the normal destination if that fails.
   */
  private connectOutput(c: AudioContext, node: AudioNode) {
    try {
      const dest = c.createMediaStreamDestination();
      const el = new Audio();
      el.srcObject = dest.stream;
      el.volume = 1;
      node.connect(dest);
      this.streamEl = el;
      void el.play().catch(() => { try { node.disconnect(dest); } catch { /* ignore */ } node.connect(c.destination); });
      return;
    } catch { /* fall through to the direct output */ }
    node.connect(c.destination);
  }

  get available() { return !!this.ctx && !this.failed; }
  private get on() { return this.enabled && this.available; }

  setVolume(v: Volume) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(VOL[v], this.ctx.currentTime, 0.05);
    this.applyClipVolume();
  }
  private applyClipVolume() {
    const v = Math.min(1, VOL[this.volume] * 1.6) * (this.ducked ? 0.35 : 1);
    this.rhymeClip.setVolume(v);
    this.animalClip.setVolume(Math.min(1, VOL[this.volume] * 1.6));
    if (this.danceEl) this.danceEl.volume = Math.min(1, VOL[this.volume] * 1.05) * (this.ducked ? 0.25 : 1);
    if (this.themeEl) this.themeEl.volume = Math.min(1, VOL[this.volume] * (this.themeTrack === 'alphabet' ? 0.6 : 0.95)) * (this.ducked ? 0.22 : 1);
  }

  /* ---------------- Home theme music (looping) ---------------- */

  private themeEl: HTMLAudioElement | null = null;
  private themeWanted = false;
  /** Set if the theme file is missing or cannot be decoded (logged, never replaced by another sound). */
  themeError: string | null = null;

  private themeTrack: ThemeTrack = 'home';

  /**
   * Looping background music: the energetic Home theme, or the gentle Alphabets tune. One player only; asking for
   * the other track swaps the file. Quieter while someone is speaking (duck).
   */
  startTheme(track: ThemeTrack = 'home') {
    this.themeWanted = true;
    this.themeTrack = track;
    if (!this.enabled) return;
    const src = THEME_FILES[track];
    if (!this.themeEl) {
      try {
        const el = new Audio();
        el.loop = true;
        el.preload = 'auto';
        el.addEventListener('error', () => { this.themeError = `cannot load ${el.getAttribute('src') ?? 'music'} (media error ${el.error?.code ?? '?'})`; console.error(`[audio] ${this.themeError}`); });
        this.themeEl = el;
      } catch (e) { this.themeError = `Audio unavailable: ${String(e)}`; console.error(`[audio] ${this.themeError}`); return; }
    }
    const el = this.themeEl;
    if (el.getAttribute('src') !== src) { el.src = src; el.currentTime = 0; }
    el.playbackRate = this.themeRate;
    this.applyClipVolume();
    const asked = track;
    void el.play().then(() => {
      // A play() that was blocked and then released later must not outlive a screen change.
      if (!this.themeWanted || this.themeTrack !== asked) { try { el.pause(); } catch { /* ignore */ } }
    }).catch(() => { /* autoplay blocked: resumeTheme() retries on the first key press */ });
  }

  /** Called every clock tick: if the music playing is not the one the current screen wants, stop or switch it. */
  enforceTheme(want: ThemeTrack | null) {
    if (!this.themeEl || this.themeEl.paused) return;
    if (!want) { this.stopTheme(); return; }
    if (want !== this.themeTrack) this.startTheme(want);
  }

  private themeRate = 1;
  /** Tempo of the background tune (the Alphabets speed control). */
  setThemeRate(r: number) { this.themeRate = Math.max(0.5, Math.min(2, r)); if (this.themeEl) this.themeEl.playbackRate = this.themeRate; }

  private resumeTheme() {
    const el = this.themeEl;
    if (this.themeWanted && this.enabled && el?.paused) void el.play().then(() => { if (!this.themeWanted) { try { el.pause(); } catch { /* ignore */ } } }).catch(() => {});
  }

  stopTheme() {
    this.themeWanted = false;
    const el = this.themeEl;
    if (!el) return;
    try { el.pause(); el.currentTime = 0; } catch { /* not seekable yet */ }
    this.themeRate = 1; el.playbackRate = 1;
  }
  get themePlaying() { return !!this.themeEl && !this.themeEl.paused; }
  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) { this.silenceLive(); this.rhymeClip.pause(); this.stopAnimal(); try { this.themeEl?.pause(); this.danceEl?.pause(); } catch { /* ignore */ } }
    else { this.resumeTheme(); this.resumeDance(); }
  }

  getPlaybackState(): PlaybackState {
    const st = this.rhymeClip.status;
    return st === 'playing' || st === 'loading' ? 'playing' : st === 'paused' ? 'paused' : 'idle';
  }

  /* ---------------- low-level voices ---------------- */

  private tone(o: { freq: number; to?: number; at?: number; dur: number; type?: OscillatorType; gain?: number; attack?: number; bus?: AudioNode; vibrato?: number; filter?: number }) {
    if (!this.on || !this.ctx) return;
    try {
      const c = this.ctx;
      const t0 = Math.max(c.currentTime, o.at ?? c.currentTime);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = o.type ?? 'sine';
      osc.frequency.setValueAtTime(o.freq, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
      let head: AudioNode = osc;
      if (o.filter) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = o.filter;
        osc.connect(f);
        head = f;
      }
      if (o.vibrato) {
        const lfo = c.createOscillator();
        const lg = c.createGain();
        lfo.frequency.value = 6;
        lg.gain.value = o.vibrato;
        lfo.connect(lg).connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t0 + o.dur + 0.05);
      }
      const peak = o.gain ?? 0.3;
      const atk = o.attack ?? 0.01;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      head.connect(g).connect(o.bus ?? this.sfxBus ?? this.master!);
      osc.start(t0);
      osc.stop(t0 + o.dur + 0.05);
      this.track(osc);
    } catch (err) { console.warn('[audio] tone failed', err); }
  }

  private noise(o: { at?: number; dur: number; gain?: number; freq?: number; q?: number; sweepTo?: number; bus?: AudioNode }) {
    if (!this.on || !this.ctx) return;
    try {
      const c = this.ctx;
      const t0 = Math.max(c.currentTime, o.at ?? c.currentTime);
      const len = Math.max(1, Math.floor(c.sampleRate * o.dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(o.freq ?? 1500, t0);
      if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.dur);
      f.Q.value = o.q ?? 1;
      const g = c.createGain();
      g.gain.setValueAtTime(o.gain ?? 0.4, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      src.connect(f).connect(g).connect(o.bus ?? this.sfxBus ?? this.master!);
      src.start(t0);
      this.track(src);
    } catch (err) { console.warn('[audio] noise failed', err); }
  }

  private track(n: AudioScheduledSourceNode) {
    this.live.push(n);
    n.onended = () => { this.live = this.live.filter((x) => x !== n); };
    if (this.live.length > 64) this.live.shift(); // bounded
  }

  private silenceLive() {
    for (const n of this.live) { try { n.stop(); } catch { /* already stopped */ } }
    this.live = [];
  }

  /* ---------------- sound effects ---------------- */

  playSound(name: string) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'boing': this.tone({ freq: 180, to: 620, dur: 0.35, type: 'sine', gain: 0.35 }); break;
      case 'chime':
        this.tone({ freq: 880, dur: 0.5, type: 'triangle', gain: 0.18 });
        this.tone({ freq: 1320, at: t + 0.09, dur: 0.6, type: 'triangle', gain: 0.14 });
        break;
      case 'clap':
        [0, 0.28, 0.56].forEach((d) => this.noise({ at: t + d, dur: 0.09, freq: 1800, q: 0.8, gain: 0.5 }));
        break;
      case 'whoosh': this.noise({ dur: 0.6, freq: 400, sweepTo: 3000, q: 2, gain: 0.35 }); break;
      case 'giggle': [0, 1, 2, 3, 4].forEach((i) => this.tone({ freq: 700 + i * 90, at: t + i * 0.09, dur: 0.08, type: 'triangle', gain: 0.18 })); break;
      case 'pop': this.tone({ freq: 500, to: 900, dur: 0.08, type: 'sine', gain: 0.25 }); break;
      case 'select': this.tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.12 }); break;
      case 'move': this.tone({ freq: 520, dur: 0.04, type: 'sine', gain: 0.05 }); break;
      case 'correct':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, at: t + i * 0.08, dur: 0.25, type: 'triangle', gain: 0.18 }));
        break;
      case 'retry': this.tone({ freq: 392, to: 330, dur: 0.3, type: 'sine', gain: 0.18 }); break;
      case 'fanfare':
        [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, at: t + i * 0.12, dur: 0.3, type: 'triangle', gain: 0.2 }));
        break;
      case 'yawn': this.tone({ freq: 500, to: 220, dur: 1.1, type: 'sine', gain: 0.18, attack: 0.2, vibrato: 8 }); break;
      case 'breathIn': this.noise({ dur: 2.8, freq: 600, sweepTo: 1400, q: 0.7, gain: 0.06 }); break;
      case 'breathOut': this.noise({ dur: 3.6, freq: 1200, sweepTo: 300, q: 0.7, gain: 0.08 }); break;
      case 'beat': break; // the dance loop handles music
      default: break; // unknown names are ignored (allowlist)
    }
  }

  /**
   * Plays the animal's real recording. Missing or undecodable file => animalError is set and logged;
   * nothing else is played in its place. Stops any previous animal sound first.
   */
  playAnimal(a: AnimalId, h: { onEnd?: () => void; onError?: (m: string) => void } = {}) {
    this.stopAnimal();
    this.animalError = null;
    if (!this.enabled) { h.onEnd?.(); return; }
    this.applyClipVolume();
    this.animalClip.play(animalSoundPath(a), { onEnd: h.onEnd, onError: (m) => { this.animalError = m; h.onError?.(m); } });
  }
  stopAnimal() { this.animalClip.stop(); this.animalError = null; }

  /* ---------------- ducking ---------------- */

  /** Lower music while Milo speaks (intentional overlap), restore afterwards. */
  duck(on: boolean) {
    this.ducked = on;
    this.applyClipVolume();
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.3 : 0.9, this.ctx.currentTime, 0.08);
    this.sfxBus?.gain.setTargetAtTime(on ? 0.3 : 1, this.ctx.currentTime, 0.05);
  }

  /* ---------------- rhymes ---------------- */

  playRhyme(id: string, tempo: number, onEnd: () => void, avatar: string = DEFAULT_AVATAR) {
    this.stopRhyme();
    this.stopAnimal();
    this.stopBand();
    this.stopLoop();
    this.rhymeError = null;
    if (!RHYMES.find((x) => x.id === id)) return; // allowlist: only bundled rhymes
    const timing = rhymeTimingFor(id, avatar);
    if (!timing) {
      this.rhymeError = `No lyric timing for rhyme "${id}" (public/audio/rhymes/${id}.json). Run scripts/gen-rhymes.py.`;
      console.error(`[audio] ${this.rhymeError}`);
      return;
    }
    this.rhymeTiming = timing;
    this.applyClipVolume();
    this.rhymeClip.setRate(Math.max(0.8, Math.min(1.25, tempo)));
    this.rhymeClip.play(timing.audio.replace('{avatar}', avatar), { // each avatar sings in its own voice
      onEnd: () => { this.rhymeTiming = timing; onEnd(); },
      onError: (m) => { this.rhymeError = m; },
    });
  }

  /** Lyric cursor from the real playback position (frozen while paused). */
  rhymeCursor(): { line: number; word: number } | null {
    return this.rhymeTiming ? cursorAt(this.rhymeTiming, this.rhymeClip.time) : null;
  }
  rhymeLine(): number { return this.rhymeTiming ? lineAt(this.rhymeTiming, this.rhymeClip.time) : -1; }
  rhymeProgress(): number {
    const d = this.rhymeClip.duration || (this.rhymeTiming ? this.rhymeTiming.durationMs / 1000 : 0);
    return d > 0 ? Math.min(1, this.rhymeClip.time / d) : 0;
  }

  pause() { this.rhymeClip.pause(); this.silenceLive(); }
  resume() { this.unlock(); this.rhymeClip.resume(); }
  restart() { this.rhymeClip.restart(); }
  setTempo(t: number) {
    this.rhymeClip.setRate(Math.max(0.8, Math.min(1.25, t)));
    this.loopTempo = t;
    if (this.danceEl) this.danceEl.playbackRate = this.danceRate();
  }

  stopRhyme() {
    this.rhymeClip.stop();
    this.rhymeTiming = null;
  }

  /* ---------------- dance music loop ---------------- */

  private danceEl: HTMLAudioElement | null = null;
  private danceWanted = false;
  private danceStyle = '';
  /** Set if a dance loop file cannot be played; the built-in synthesized beat takes over (and the problem is logged). */
  danceError: string | null = null;

  private danceRate() { return Math.max(0.78, Math.min(1.35, this.loopTempo)); }

  /** Dance music: the whole song, looping, the same for every dance style; a missing file falls back to the synth beat. */
  startLoop(tempo: number, style: string) {
    this.loopTempo = tempo;
    if (!this.enabled) return;
    const src = style === 'maker' ? MAKER_FILE : DANCE_FILE;
    if (this.danceError) { this.startSynthLoop(tempo, style); return; }
    this.danceWanted = true;
    this.danceStyle = style;
    if (!this.danceEl) {
      try {
        const el = new Audio();
        el.loop = true;
        el.preload = 'auto';
        el.addEventListener('error', () => {
          this.danceError = `cannot load ${el.getAttribute('src') ?? 'dance music'} (media error ${el.error?.code ?? '?'})`;
          console.error(`[audio] ${this.danceError}`);
          if (this.danceWanted) this.startSynthLoop(this.loopTempo, this.danceStyle);
        });
        this.danceEl = el;
      } catch (e) { this.danceError = `Audio unavailable: ${String(e)}`; console.error(`[audio] ${this.danceError}`); this.startSynthLoop(tempo, style); return; }
    }
    const el = this.danceEl;
    if (el.getAttribute('src') !== src) { el.src = src; el.currentTime = 0; }
    el.playbackRate = this.danceRate();
    this.applyClipVolume();
    if (!el.paused) return;
    const asked = style;
    void el.play().then(() => { if (!this.danceWanted || this.danceStyle !== asked) { try { el.pause(); } catch { /* ignore */ } } }).catch(() => { /* blocked until the first key press: unlock() retries */ });
  }

  private resumeDance() {
    const el = this.danceEl;
    if (this.danceWanted && this.enabled && el?.paused) void el.play().then(() => { if (!this.danceWanted) { try { el.pause(); } catch { /* ignore */ } } }).catch(() => {});
  }

  /** The built-in synthesized beat: only used when a dance loop file is missing. */
  private startSynthLoop(tempo: number, style: string) {
    this.loopTempo = tempo;
    if (this.loopTimer || !this.on || !this.ctx) return;
    this.loopStep = 0;
    this.loopNextAt = this.ctx.currentTime + 0.05;
    const bass = style === 'robot' ? [110, 110, 165, 110, 131, 131, 98, 123] : [131, 131, 196, 175, 165, 165, 147, 196];
    this.loopTimer = setInterval(() => {
      if (!this.ctx || !this.on) return;
      const stepDur = 60 / (118 * this.loopTempo) / 2; // eighth notes
      while (this.loopNextAt < this.ctx.currentTime + 0.15) {
        const s = this.loopStep % 8;
        const at = this.loopNextAt;
        if (s % 4 === 0) this.tone({ freq: 120, to: 45, at, dur: 0.18, type: 'sine', gain: 0.45, bus: this.musicBus! });
        if (s % 4 === 2) this.noise({ at, dur: 0.07, freq: 2200, q: 0.6, gain: 0.18, bus: this.musicBus! });
        this.noise({ at, dur: 0.03, freq: 8000, q: 1, gain: 0.05, bus: this.musicBus! });
        this.tone({ freq: bass[s], at, dur: stepDur * 0.9, type: style === 'robot' ? 'square' : 'triangle', gain: 0.12, filter: 900, bus: this.musicBus! });
        this.loopNextAt += stepDur;
        this.loopStep++;
      }
    }, 40);
  }

  stopLoop() {
    this.danceWanted = false;
    const el = this.danceEl;
    if (el) { try { el.pause(); el.currentTime = 0; } catch { /* not seekable yet */ } }
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
  }

  get looping() { return this.danceWanted || !!this.loopTimer; }
  get loopStyle() { return this.danceStyle; }

  /* ---------------- the Band (8-step music maker) ---------------- */

  // Steps are placed a little ahead on the audio clock (AudioContext.currentTime); the 25 ms timer only
  // wakes the scheduler, so the beat does not drift. With no audio context the scheduler falls back to
  // performance.now(), so the playhead and the dance still run silently.
  private bandNow(): number {
    return this.bandOnAudioClock && this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /** Start the loop. `getPattern` is read on every pass, so edits are heard straight away. */
  startBand(getPattern: () => BandPattern, tempoIndex: number) {
    this.stopBand();
    this.stopLoop();
    this.bandOnAudioClock = !!this.ctx && this.ctx.state === 'running';
    this.bandPattern = getPattern;
    this.band = new BandScheduler(BAND_TEMPOS[tempoIndex].bpm);
    this.band.start(this.bandNow() + 0.08);
    this.bandTimer = setInterval(() => this.pumpBand(), 25);
  }

  private pumpBand() {
    const b = this.band;
    if (!b) return;
    const now = this.bandNow();
    for (const hit of b.due(now, 0.12, this.bandPattern())) {
      const at = this.bandOnAudioClock || !this.ctx ? hit.at : this.ctx.currentTime + (hit.at - now);
      for (const row of hit.rows) this.bandHit(row, hit.step, at);
    }
  }

  private bandHit(row: BandRowId, step: number, at: number) {
    const bus = this.musicBus ?? undefined;
    switch (row) {
      case 'kick': this.tone({ freq: 150, to: 45, at, dur: 0.22, type: 'sine', gain: 0.55, bus }); break;
      case 'snare':
        this.noise({ at, dur: 0.14, freq: 1900, q: 0.7, gain: 0.45, bus });
        this.tone({ freq: 220, to: 140, at, dur: 0.08, type: 'triangle', gain: 0.18, bus });
        break;
      case 'bell':
        this.tone({ freq: BELL_NOTES_HZ[step], at, dur: 0.9, type: 'sine', gain: 0.22, attack: 0.005, bus });
        this.tone({ freq: BELL_NOTES_HZ[step] * 2.01, at, dur: 0.45, type: 'sine', gain: 0.06, attack: 0.005, bus });
        break;
      case 'shaker': this.noise({ at, dur: 0.05, freq: 7500, q: 1.2, gain: 0.14, bus }); break;
    }
  }

  /** One note on a pressable instrument, straight away (also while the band loop plays). */
  /** Starts loading the band's notes when the Band screen opens, so the first press is instant. */
  warmBand() {
    for (const inst of INSTRUMENTS) {
      const keys = inst.id === 'maracas' || inst.id === 'tambourine' ? [0] : [...new Set(INSTRUMENT_TUNE.map((_, i) => Math.round(instrumentNote(inst.id, i))))];
      for (const hz of keys) {
        const key = `${inst.id}-${hz}`;
        if (this.bandPool.has(key)) continue;
        try { const el = new Audio(`audio/band/${key}.mp3`); el.preload = 'auto'; el.load(); this.bandPool.set(key, [el]); } catch { /* ignore */ }
      }
    }
  }
  private bandPool = new Map<string, HTMLAudioElement[]>();
  /**
   * Band notes are small bundled recordings (scripts/make-instruments.mjs) played through <audio> elements, which every
   * TV WebView supports. (Live Web Audio synthesis stayed silent in the Vega WebView.) Falls back to the synthesized
   * version only if a file cannot be played and Web Audio does work.
   */
  playInstrument(id: InstrumentId, freq: number) {
    if (!this.enabled) return;
    const key = `${id}-${id === 'maracas' || id === 'tambourine' ? 0 : Math.round(freq)}`;
    let pool = this.bandPool.get(key);
    if (!pool) { pool = []; this.bandPool.set(key, pool); }
    let el = pool.find((e) => e.paused || e.ended);
    if (!el && pool.length < 3) {
      try { el = new Audio(`audio/band/${key}.mp3`); el.preload = 'auto'; pool.push(el); } catch { el = undefined; }
    }
    if (el) {
      try {
        el.volume = Math.min(1, VOL[this.volume] * 1.25) * (this.ducked ? 0.5 : 1);
        el.currentTime = 0;
        void el.play().catch(() => this.synthInstrument(id, freq));
        return;
      } catch { /* fall through to the synthesized note */ }
    }
    this.synthInstrument(id, freq);
  }

  private synthInstrument(id: InstrumentId, freq: number) {
    if (!this.on || !this.ctx) return;
    const bus = this.musicBus ?? undefined;
    switch (id) {
      case 'piano': // hammer: bright attack, warm body, fast-fading overtones
        this.tone({ freq, dur: 1.4, type: 'triangle', gain: 0.3, attack: 0.004, filter: 2600, bus });
        this.tone({ freq: freq * 2, dur: 0.6, type: 'sine', gain: 0.09, attack: 0.004, bus });
        this.tone({ freq: freq * 3, dur: 0.25, type: 'sine', gain: 0.04, attack: 0.003, bus });
        break;
      case 'guitar': this.pluck(freq, 1.6, 0.5, bus); break;
      case 'xylo': // wooden bar: short, with the bar's typical 4x overtone and a tiny mallet click
        this.tone({ freq, dur: 0.7, type: 'sine', gain: 0.32, attack: 0.002, bus });
        this.tone({ freq: freq * 3.93, dur: 0.12, type: 'sine', gain: 0.08, attack: 0.001, bus });
        this.noise({ dur: 0.02, freq: 3500, q: 2, gain: 0.08, bus });
        break;
      case 'trumpet': // brassy: buzzy wave through a closing filter, a small scoop up and a little vibrato
        this.tone({ freq: freq * 0.97, to: freq, dur: 0.06, type: 'sawtooth', gain: 0.1, attack: 0.02, filter: 1400, bus });
        this.tone({ freq, dur: 0.75, type: 'sawtooth', gain: 0.17, attack: 0.04, filter: 2200, vibrato: freq * 0.012, bus });
        this.tone({ freq: freq * 2, dur: 0.6, type: 'square', gain: 0.025, attack: 0.05, filter: 3000, bus });
        break;
      case 'drum': // skin drum: a pitch that falls fast (higher notes = smaller drum) plus the stick's click
        this.tone({ freq: freq * 0.9, to: freq * 0.42, dur: 0.38, type: 'sine', gain: 0.55, attack: 0.002, bus });
        this.tone({ freq: freq * 1.8, to: freq * 0.9, dur: 0.12, type: 'triangle', gain: 0.15, attack: 0.001, bus });
        this.noise({ dur: 0.05, freq: 1800, q: 0.8, gain: 0.22, bus });
        break;
      case 'flute': // breathy: soft sine with a slow breath-in, vibrato and a little air noise
        this.tone({ freq, dur: 0.95, type: 'sine', gain: 0.24, attack: 0.09, vibrato: freq * 0.007, bus });
        this.tone({ freq: freq * 2, dur: 0.6, type: 'sine', gain: 0.035, attack: 0.1, bus });
        this.noise({ dur: 0.55, freq: freq * 2.2, q: 4, gain: 0.04, bus });
        break;
      case 'harp': // plucked string with a soft shimmer
        this.pluck(freq, 2.0, 0.42, bus);
        this.tone({ freq: freq * 2, dur: 1.1, type: 'sine', gain: 0.04, attack: 0.004, bus });
        break;
      case 'maracas': { // two quick shakes
        const t = this.ctx.currentTime;
        this.noise({ at: t, dur: 0.07, freq: 6500, q: 1.1, gain: 0.24, bus });
        this.noise({ at: t + 0.1, dur: 0.09, freq: 7200, q: 1.1, gain: 0.2, bus });
        break;
      }
      case 'bells': // glass bell: bright strike with inharmonic partials
        this.tone({ freq, dur: 1.8, type: 'sine', gain: 0.2, attack: 0.002, bus });
        this.tone({ freq: freq * 2.76, dur: 0.7, type: 'sine', gain: 0.07, attack: 0.002, bus });
        this.tone({ freq: freq * 5.4, dur: 0.25, type: 'sine', gain: 0.035, attack: 0.001, bus });
        break;
      case 'tambourine': { // jingles: a burst of high noise, a second softer burst and the skin's thump
        const t = this.ctx.currentTime;
        this.noise({ at: t, dur: 0.14, freq: 8200, q: 0.8, gain: 0.26, bus });
        this.noise({ at: t + 0.03, dur: 0.1, freq: 5200, q: 3, gain: 0.12, bus });
        this.tone({ freq: 320, to: 200, dur: 0.06, type: 'triangle', gain: 0.07, attack: 0.002, bus });
        break;
      }
    }
  }

  private plucks = new Map<number, AudioBuffer>();
  /** Karplus-Strong string, rendered once per pitch and replayed from a buffer. */
  private pluck(freq: number, dur: number, gain: number, bus?: AudioNode) {
    if (!this.ctx) return;
    try {
      const c = this.ctx;
      const key = Math.round(freq * 10);
      let buf = this.plucks.get(key);
      if (!buf) {
        const sr = c.sampleRate, len = Math.floor(sr * dur), N = Math.max(2, Math.round(sr / freq));
        buf = c.createBuffer(1, len, sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < N && i < len; i++) d[i] = Math.random() * 2 - 1;
        for (let i = N; i < len; i++) d[i] = 0.497 * (d[i - N] + d[i - N + 1]); // averaging = the string losing its brightness
        for (let i = 0; i < Math.min(N, len); i++) d[i] *= i / N; // soften the pick
        this.plucks.set(key, buf);
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(bus ?? this.master!);
      src.start();
      this.track(src);
    } catch (err) { console.warn('[audio] pluck failed', err); }
  }

  setBandTempo(tempoIndex: number) { this.band?.setBpm(this.bandNow(), BAND_TEMPOS[tempoIndex].bpm); }
  /** Column under the playhead (0..7), or -1 when the band is stopped. */
  bandStep(): number { return this.band ? this.band.currentStep(this.bandNow()) : -1; }
  /** Whole loops played since Play. */
  bandLoops(): number { return this.band ? this.band.loopsDone(this.bandNow()) : 0; }
  get bandPlaying() { return !!this.band?.running; }

  stopBand() {
    if (this.bandTimer) clearInterval(this.bandTimer);
    this.bandTimer = null;
    this.band?.stop();
    this.band = null;
  }

  /** STOP: everything, immediately. */
  stopAll() {
    this.stopTheme();
    this.stopRhyme();
    this.stopAnimal();
    this.stopBand();
    this.stopLoop();
    this.silenceLive();
  }
}

export const audio = new AudioService();
