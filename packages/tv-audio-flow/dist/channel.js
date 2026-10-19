import { AudioFlowError } from "./errors.js";
/**
 * At most one sequence audible per channel: the no-overlap policy for concurrent sequences.
 * Use one channel per "speaker" (e.g. one for the whole app, or one for music and one for voice).
 */
export class AudioChannel {
    constructor(options = {}) {
        this.current = null;
        this.policy = options.policy ?? 'interrupt';
    }
    /** The sequence currently running on this channel, if any. */
    get active() {
        const c = this.current;
        return c && c.isActive ? c : null;
    }
    /** Start `sequence` on this channel according to the overlap policy. Never rejects. */
    play(sequence) {
        const running = this.active;
        if (running && running !== sequence) {
            if (this.policy === 'reject') {
                return Promise.resolve({
                    status: 'failed',
                    error: new AudioFlowError('busy', `channel busy with "${running.name}"; "${sequence.name}" was not started`),
                    stepIndex: -1,
                });
            }
            running.cancel(`interrupted by "${sequence.name}"`);
        }
        else if (running) {
            running.cancel('restarted');
        }
        this.current = sequence;
        const done = sequence.start();
        void done.then(() => { if (this.current === sequence && !sequence.isActive)
            this.current = null; });
        return done;
    }
    /** Cancel whatever is playing on this channel. Returns true if something was cancelled. */
    cancel(reason = 'channel cancelled') {
        const running = this.active;
        this.current = null;
        return running ? running.cancel(reason) : false;
    }
}
//# sourceMappingURL=channel.js.map