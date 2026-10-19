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
export declare class AudioChannel {
    readonly policy: OverlapPolicy;
    private current;
    constructor(options?: ChannelOptions);
    /** The sequence currently running on this channel, if any. */
    get active(): AudioSequence<unknown> | null;
    /** Start `sequence` on this channel according to the overlap policy. Never rejects. */
    play<S>(sequence: AudioSequence<S>): Promise<SequenceResult>;
    /** Cancel whatever is playing on this channel. Returns true if something was cancelled. */
    cancel(reason?: string): boolean;
}
//# sourceMappingURL=channel.d.ts.map