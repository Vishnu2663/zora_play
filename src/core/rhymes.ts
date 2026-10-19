// The Rhyme Room songs are the owner's own recorded songs (public/audio/rhymes/<id>.mp3, made with Suno), with karaoke
// lyric timings in <id>.json (scripts/prepare-songs.py). Keep the lyric text here in step with that script.
// This file also has a clock-injected note sequencer that supports play/pause/resume/restart/stop
// and live tempo changes ("sing faster!").

export interface RhymeLine { words: string[]; notes: [string, number][] } // [note, beats] per word
export interface Rhyme { id: string; title: string; bpm: number; color: string; mood: 'bouncy' | 'calm' | 'sleepy'; lines: RhymeLine[] }

/** A recorded song line: the audio is the real song, so every word gets one placeholder note for the offline sequencer. */
function S(text: string): RhymeLine {
  const words = text.split(' ');
  return { words, notes: words.map(() => ['C4', 1] as [string, number]) };
}

/** Rhyme Room playback sequence settings (milliseconds). */
export const RHYME_SEQUENCE_CONFIG = {
  introLine: "Let's sing some rhymes!",
  /** Pause after the intro sentence has finished, before the title is announced (500-800). */
  introPauseMs: 650,
  /** Pause after the title has finished, before the song starts (700-1000). */
  songPauseMs: 850,
};

export const RHYMES: Rhyme[] = [
  {
    id: 'lullaby', title: "Milo's Lullaby", bpm: 72, color: '#8E6CC9', mood: 'sleepy',
    lines: [
      S('Milo moves slowly, soft as a cloud,'),
      S('Sway to the music, gentle and proud.'),
      S('Reach up slowly, then lower your hands,'),
      S('Take a slow breath, now sway where you stand.'),
      S('Slow to the left, slow to the right,'),
      S('Float like a feather, light as a kite.'),
      S('Stretch up softly, then let arms fall,'),
      S('Milo says, You danced, great job, all!'),
    ],
  },
  {
    id: 'robot', title: "Milo's Robot Smiley", bpm: 120, color: '#2BB3A3', mood: 'bouncy',
    lines: [
      S("Beep-beep, Milo's robot crew,"),
      S('Robot arms are ready, how about you?'),
      S('Step-step forward, step-step back,'),
      S('Make your elbows click-clack-clack!'),
      S('Robot left, robot right,'),
      S('Robot arms reach up so high!'),
      S('Beep-beep, freeze in place,'),
      S("Milo's robot smiley face!"),
    ],
  },
  {
    id: 'march', title: 'March with Milo', bpm: 100, color: '#F28C38', mood: 'bouncy',
    lines: [
      S('March with Milo, one-two-three,'),
      S('Tap your knees along with me.'),
      S('Wave hello up to the sky,'),
      S('Little dragon marching by!'),
      S('Step-step, softly go,'),
      S('Tap-tap, nice and slow.'),
      S('Wave one hand, then wave the other,'),
      S('Milo dances with a friend!'),
      S('March in place, nice and slow.'),
      S('Tap your knees, then wave hello.'),
      S('Take one breath, smile and stay,'),
      S('Milo says, You danced today!'),
    ],
  },
  {
    id: 'feather', title: 'Float Like a Feather', bpm: 80, color: '#4FA3D9', mood: 'calm',
    lines: [
      S('Milo moves slowly, soft as a cloud,'),
      S('Sway to the music, gentle and proud.'),
      S('Reach up slowly, then lower your hands,'),
      S('Take a slow breath, now sway where you stand.'),
      S('Slow to the left, slow to the right,'),
      S('Float like a feather, light as a kite.'),
      S('Stretch up softly, then let arms fall,'),
      S('Milo says, You danced, great job, all!'),
    ],
  },
  {
    id: 'tap', title: "Milo's Dragon Tap", bpm: 112, color: '#E8608A', mood: 'bouncy',
    lines: [
      S("Milo's ready, here we go!"),
      S('Find a little space to show.'),
      S('Clap your hands and sway side to side,'),
      S("Milo's dancing by your side!"),
      S('Clap, clap, dragon tap,'),
      S('Sway, sway, wiggle and clap!'),
      S('Reach up high, then touch your toes,'),
      S("Milo's dance goes where it goes!"),
      S('Clap twice! Clap, clap!'),
      S('Sway twice! Left, right!'),
      S('Reach up! Reeeach!'),
      S('Freeze like Milo! Hold a pose!'),
      S('Clap, clap, dragon tap,'),
      S('Sway, sway, wiggle and clap!'),
      S('Reach up high, then touch your toes,'),
      S("Milo's dance goes where it goes!"),
    ],
  },
];

const SEMI: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
export function noteToFreq(note: string): number {
  const m = note.match(/^([A-G])(#|b)?(\d)$/);
  if (!m) throw new Error(`bad note ${note}`);
  const semis = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}

export interface NoteEvent { beat: number; beats: number; freq: number; line: number; word: number }

/** Flatten a rhyme into note events positioned in beats (1 beat rest between lines). */
export function timeline(r: Rhyme): { events: NoteEvent[]; totalBeats: number } {
  const events: NoteEvent[] = [];
  let beat = 0;
  r.lines.forEach((ln, li) => {
    ln.notes.forEach(([n, b], wi) => {
      events.push({ beat, beats: b, freq: noteToFreq(n), line: li, word: wi });
      beat += b;
    });
    beat += 1;
  });
  return { events, totalBeats: beat };
}

export type SeqStatus = 'stopped' | 'playing' | 'paused' | 'finished';

/**
 * Beat-based sequencer. Time is injected so it is deterministic in tests.
 * The audio layer asks `due()` for notes to schedule; the UI asks `cursor()`
 * for karaoke highlighting. Tempo changes keep the current position.
 */
export class Sequencer {
  status: SeqStatus = 'stopped';
  readonly events: NoteEvent[];
  readonly totalBeats: number;
  private baseBeat = 0; // beat position when the clock was last anchored
  private anchor = 0; // ms timestamp of the anchor
  private scheduledThrough = -1; // index of the last event handed out by due()
  tempo: number; // multiplier on the rhyme's bpm
  readonly rhyme: Rhyme;

  constructor(rhyme: Rhyme, tempo = 1) {
    this.rhyme = rhyme;
    const t = timeline(rhyme);
    this.events = t.events;
    this.totalBeats = t.totalBeats;
    this.tempo = tempo;
  }

  get bpm() { return this.rhyme.bpm * this.tempo; }
  msPerBeat() { return 60000 / this.bpm; }

  beatAt(now: number): number {
    if (this.status !== 'playing') return this.baseBeat;
    return this.baseBeat + (now - this.anchor) / this.msPerBeat();
  }

  play(now: number) { this.baseBeat = 0; this.anchor = now; this.scheduledThrough = -1; this.status = 'playing'; }
  restart(now: number) { this.play(now); }
  pause(now: number) {
    if (this.status !== 'playing') return;
    this.baseBeat = this.beatAt(now);
    this.status = 'paused';
  }
  resume(now: number) {
    if (this.status !== 'paused') return;
    this.anchor = now;
    this.status = 'playing';
  }
  stop() { this.status = 'stopped'; this.baseBeat = 0; this.scheduledThrough = -1; }

  setTempo(now: number, tempo: number) {
    this.baseBeat = this.beatAt(now);
    this.anchor = now;
    this.tempo = Math.max(0.4, Math.min(2.2, tempo));
  }

  /** Notes whose start falls before now + lookahead and that were not handed out yet. */
  due(now: number, lookaheadMs = 120): { ev: NoteEvent; atMs: number; durMs: number }[] {
    if (this.status !== 'playing') return [];
    const cur = this.beatAt(now);
    if (cur >= this.totalBeats) { this.status = 'finished'; return []; }
    const horizon = cur + lookaheadMs / this.msPerBeat();
    const out: { ev: NoteEvent; atMs: number; durMs: number }[] = [];
    for (let i = this.scheduledThrough + 1; i < this.events.length; i++) {
      const ev = this.events[i];
      if (ev.beat > horizon) break;
      this.scheduledThrough = i;
      if (ev.beat + ev.beats < cur) continue; // skipped (e.g. after resume far ahead) — never play stale notes
      out.push({ ev, atMs: now + Math.max(0, (ev.beat - cur) * this.msPerBeat()), durMs: ev.beats * this.msPerBeat() });
    }
    return out;
  }

  /** Which line/word should be highlighted right now. */
  cursor(now: number): { line: number; word: number } | null {
    const b = this.beatAt(now);
    let found: NoteEvent | null = null;
    for (const ev of this.events) { if (ev.beat <= b) found = ev; else break; }
    return found ? { line: found.line, word: found.word } : null;
  }

  progress(now: number) { return Math.min(1, this.beatAt(now) / this.totalBeats); }
}
