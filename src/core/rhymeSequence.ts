// Rhyme Room playback sequence:
//   INTRO_DIALOGUE -> INTRO_PAUSE -> TITLE_DIALOGUE -> SONG_PAUSE -> SINGING -> COMPLETED
// Each dialogue stage waits for the REAL end of the spoken audio (never a guessed duration), each pause is
// configurable, and the song starts exactly once, only after the title and the final pause.
// Ordering, cancellation and stale-callback rules come from the tv-audio-flow engine (AudioSequence);
// a late callback from a cancelled sequence can never start audio.
import { AudioSequence, clip, delay, type AudioChannel } from 'tv-audio-flow';
import { flowAdapter, flowScheduler, type FlowSource, type SpeakFn, type WaitFn } from './flowAdapter.ts';

export type SeqState = 'IDLE' | 'INTRO_DIALOGUE' | 'INTRO_PAUSE' | 'TITLE_DIALOGUE' | 'SONG_PAUSE' | 'SINGING' | 'COMPLETED' | 'ERROR' | 'CANCELLED';
export type SpeakResult = 'completed' | 'failed' | 'cancelled';

export interface SequenceDeps {
  /** Speak a line; call `done` once with the actual outcome. Returns a canceller. */
  speak: SpeakFn;
  /** Timer; returns a canceller. */
  wait: WaitFn;
  /** Start the song. `onEnd` when it finishes, `onError` if the audio cannot play. */
  startSong(h: { onEnd: () => void; onError: (message: string) => void }): void;
  stopSong(): void;
  /** Shared no-overlap channel: starting this sequence cancels whatever else plays on it. */
  channel?: AudioChannel;
}

export interface SequenceConfig { introLine: string; introPauseMs: number; songPauseMs: number }

export interface SequenceHooks {
  onState?(s: SeqState): void;
  onError?(message: string): void;
}

export class RhymeSequence {
  state: SeqState = 'IDLE';
  songStarts = 0;
  private quiet = false;
  private readonly seq: AudioSequence<FlowSource>;
  private readonly deps: SequenceDeps;
  private readonly hooks: SequenceHooks;

  constructor(deps: SequenceDeps, cfg: SequenceConfig, rhyme: { id: string; title: string }, hooks: SequenceHooks = {}) {
    this.deps = deps; this.hooks = hooks;
    const song: FlowSource = {
      kind: 'recording',
      start: (h) => { this.songStarts++; deps.startSong(h); },
      stop: () => deps.stopSong(),
    };
    this.seq = new AudioSequence<FlowSource>(flowAdapter(deps.speak), [
      clip({ kind: 'speak', text: cfg.introLine }, 'INTRO_DIALOGUE'),
      delay(cfg.introPauseMs, 'INTRO_PAUSE'),
      clip({ kind: 'speak', text: rhyme.title }, 'TITLE_DIALOGUE'),
      delay(cfg.songPauseMs, 'SONG_PAUSE'),
      clip(song, 'SINGING'),
    ], { scheduler: flowScheduler(deps.wait), name: `rhyme:${rhyme.id}` });
    this.seq.on('step', ({ step }) => this.set(step.label as SeqState));
    this.seq.on('end', (r) => {
      if (r.status === 'completed') this.set('COMPLETED');
      else if (r.status === 'failed') { this.set('ERROR'); this.hooks.onError?.(r.error?.message ?? 'rhyme failed'); }
      else if (!this.quiet) this.set('CANCELLED');
    });
  }

  private set(s: SeqState) { this.state = s; this.hooks.onState?.(s); }

  start() {
    this.cancel(false);
    this.songStarts = 0;
    if (this.deps.channel) void this.deps.channel.play(this.seq);
    else void this.seq.start();
  }

  /** Abort everything: pending dialogue, pending timers and the song. Safe to call any time. */
  cancel(report = true) {
    this.quiet = !report;
    this.seq.cancel(report ? 'cancelled' : 'restarted');
    this.quiet = false;
  }
}
