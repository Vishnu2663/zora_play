import { AudioFlowError } from './errors.ts';
import type { AudioSequence } from './sequence.ts';
import type { SequenceResult } from './types.ts';

/**
 * What an {@link AudioChannel} does when a sequence is played while another one is active:
 * - `interrupt` (default): cancel the active one, then start the new one. Last request wins.
 * - `reject`: leave the active one alone; the new one resolves `failed` with code `busy` and never starts.
 */
export type OverlapPolicy = 'interrupt' | 'reject';

export interface ChannelOptions {
  policy?: OverlapPolicy;
}

/**
 * At most one sequence audible per channel: the no-overlap policy for concurrent sequences.
 * Use one channel per "speaker" (e.g. one for the whole app, or one for music and one for voice).
 */
export class AudioChannel {
  readonly policy: OverlapPolicy;
  private current: AudioSequence<never> | null = null;

  constructor(options: ChannelOptions = {}) {
    this.policy = options.policy ?? 'interrupt';
  }

  /** The sequence currently running on this channel, if any. */
  get active(): AudioSequence<unknown> | null {
    const c = this.current as AudioSequence<unknown> | null;
    return c && c.isActive ? c : null;
  }

  /** Start `sequence` on this channel according to the overlap policy. Never rejects. */
  play<S>(sequence: AudioSequence<S>): Promise<SequenceResult> {
    const running = this.active;
    if (running && running !== (sequence as AudioSequence<unknown>)) {
      if (this.policy === 'reject') {
        return Promise.resolve({
          status: 'failed',
          error: new AudioFlowError('busy', `channel busy with "${running.name}"; "${sequence.name}" was not started`),
          stepIndex: -1,
        });
      }
      running.cancel(`interrupted by "${sequence.name}"`);
    } else if (running) {
      running.cancel('restarted');
    }
    this.current = sequence as unknown as AudioSequence<never>;
    const done = sequence.start();
    void done.then(() => { if (this.current === (sequence as unknown as AudioSequence<never>) && !sequence.isActive) this.current = null; });
    return done;
  }

  /** Cancel whatever is playing on this channel. Returns true if something was cancelled. */
  cancel(reason = 'channel cancelled'): boolean {
    const running = this.active;
    this.current = null;
    return running ? running.cancel(reason) : false;
  }
}
