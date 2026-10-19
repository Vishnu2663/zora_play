// Zora Play's Band: an 8-step loop the child fills in. Pure pattern + scheduling
// logic; the audio layer plays the hits and the screen draws the playhead.
// The scheduler is clock-agnostic (seconds from any monotonic clock), so the
// audio layer feeds it AudioContext.currentTime and tests feed it a number.

export const BAND_STEPS = 8;

export const BAND_ROWS = [
  { id: 'kick', label: 'Drum' },
  { id: 'snare', label: 'Clap' },
  { id: 'bell', label: 'Bells' },
  { id: 'shaker', label: 'Shaker' },
] as const;
export type BandRowId = (typeof BAND_ROWS)[number]['id'];

/** rows x steps */
export type BandPattern = boolean[][];

export const emptyPattern = (): BandPattern => BAND_ROWS.map(() => Array<boolean>(BAND_STEPS).fill(false));

export function toggleCell(p: BandPattern, row: number, step: number): BandPattern {
  if (row < 0 || row >= BAND_ROWS.length || step < 0 || step >= BAND_STEPS) return p;
  return p.map((r, i) => (i === row ? r.map((v, j) => (j === step ? !v : v)) : r));
}

export const countNotes = (p: BandPattern): number => p.reduce((n, r) => n + r.filter(Boolean).length, 0);

/** Each step is an eighth note. Bpm values line up with Milo's dance speeds (see speedIndex). */
export const BAND_TEMPOS = [
  { id: 'slow', label: 'Slow', bpm: 90, speedIndex: 1 },
  { id: 'medium', label: 'Medium', bpm: 120, speedIndex: 2 },
  { id: 'fast', label: 'Fast', bpm: 168, speedIndex: 3 },
] as const;
export type BandTempoId = (typeof BAND_TEMPOS)[number]['id'];
export const DEFAULT_BAND_TEMPO = 1; // index into BAND_TEMPOS

/** Seconds per step at a tempo. */
export const stepSeconds = (bpm: number) => 30 / bpm;

/** Scale reward: this many full loops, each with at least this many notes. */
export const BAND_SCALE_NOTES = 6;
export const BAND_SCALE_LOOPS = 4;

/** Bell pitches by column (C major pentatonic, so any pattern sounds friendly). */
export const BELL_NOTES_HZ = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51] as const;

/** Instruments a child can play by pressing them. Each press plays the next note of INSTRUMENT_TUNE. */
export const INSTRUMENTS = [
  { id: 'piano', label: 'Piano', octave: 1 },
  { id: 'guitar', label: 'Guitar', octave: 0.5 },
  { id: 'xylo', label: 'Xylophone', octave: 2 },
  { id: 'trumpet', label: 'Trumpet', octave: 1 },
  { id: 'drum', label: 'Drum', octave: 0.5 },
  { id: 'flute', label: 'Flute', octave: 2 },
  { id: 'harp', label: 'Harp', octave: 1 },
  { id: 'maracas', label: 'Maracas', octave: 1 },
  { id: 'bells', label: 'Bells', octave: 2 },
  { id: 'tambourine', label: 'Tambourine', octave: 1 },
] as const;
export type InstrumentId = (typeof INSTRUMENTS)[number]['id'];

/** Up and down the C major pentatonic (C4 D4 E4 G4 A4 C5...): pressing again and again plays a little tune. */
export const INSTRUMENT_TUNE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 440.0, 392.0, 329.63, 293.66] as const;

/** Frequency of the n-th press on an instrument (wraps round the tune, shifted to the instrument's octave). */
export function instrumentNote(id: InstrumentId, press: number): number {
  const inst = INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
  const n = INSTRUMENT_TUNE.length;
  return INSTRUMENT_TUNE[((press % n) + n) % n] * inst.octave;
}

export interface BandHit {
  /** 0..BAND_STEPS-1 */
  step: number;
  /** Steps since start (keeps counting through loops). */
  absStep: number;
  /** Clock time (seconds) the step sounds. */
  at: number;
  rows: BandRowId[];
}

/** Lookahead scheduler: hands out each step once, shortly before it is due. */
export class BandScheduler {
  running = false;
  private anchor = 0; // clock time of the anchor
  private baseStep = 0; // step position (fractional) at the anchor
  private next = 0; // first step not yet handed out
  private bpm: number;

  constructor(bpm: number = BAND_TEMPOS[DEFAULT_BAND_TEMPO].bpm) { this.bpm = bpm; }

  private get stepSec() { return stepSeconds(this.bpm); }

  start(now: number) { this.running = true; this.anchor = now; this.baseStep = 0; this.next = 0; }
  stop() { this.running = false; }

  /** Change tempo without losing the place in the loop. */
  setBpm(now: number, bpm: number) {
    if (this.running) { this.baseStep = this.position(now); this.anchor = now; }
    this.bpm = bpm;
  }

  /** Fractional step position since start. */
  position(now: number): number { return this.baseStep + (now - this.anchor) / this.stepSec; }

  /** The column under the playhead, or -1 when stopped. */
  currentStep(now: number): number {
    return this.running ? Math.max(0, Math.floor(this.position(now))) % BAND_STEPS : -1;
  }

  /** Whole loops finished since start. */
  loopsDone(now: number): number { return this.running ? Math.floor(this.position(now) / BAND_STEPS) : 0; }

  private timeOf(abs: number) { return this.anchor + (abs - this.baseStep) * this.stepSec; }

  /**
   * Steps that fall before `now + lookahead` and were not handed out yet. The
   * pattern is read now, so edits made while playing are heard on the next pass.
   * Steps already more than `staleSec` late (tab was throttled) are skipped, never replayed in a burst.
   */
  due(now: number, lookahead: number, pattern: BandPattern, staleSec = 0.05): BandHit[] {
    if (!this.running) return [];
    const out: BandHit[] = [];
    while (this.timeOf(this.next) <= now + lookahead) {
      const abs = this.next++;
      const at = this.timeOf(abs);
      if (at < now - staleSec) continue;
      const step = abs % BAND_STEPS;
      out.push({ step, absStep: abs, at, rows: BAND_ROWS.filter((_, r) => pattern[r]?.[step]).map((r) => r.id) });
    }
    return out;
  }
}
