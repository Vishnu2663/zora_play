// A tiny adapter for running the examples in Node: it "plays" a clip by logging it and
// reporting the end after the clip's simulated duration. In a browser you would use
// HtmlAudioAdapter from 'tv-audio-flow/web' instead; the sequences stay the same.
import { AudioFlowError, type AudioAdapter, type ClipCallbacks, type ClipHandle } from 'tv-audio-flow';

export class ConsoleAdapter implements AudioAdapter<string> {
  readonly capabilities = { pause: false } as const;
  private readonly durations: Record<string, number>;
  private readonly t0 = Date.now();

  constructor(durations: Record<string, number>) { this.durations = durations; }

  log(msg: string): void { console.log(`${String(Date.now() - this.t0).padStart(5)} ms  ${msg}`); }

  play(source: string, cb: ClipCallbacks): ClipHandle {
    const ms = this.durations[source];
    if (ms === undefined) throw new AudioFlowError('missing', `no such clip: ${source}`);
    this.log(`> play  ${source}`);
    cb.onStarted();
    const timer = setTimeout(() => { this.log(`  ended ${source}`); cb.onEnded(); }, ms);
    return { stop: () => { clearTimeout(timer); this.log(`x stop  ${source}`); } };
  }
}
