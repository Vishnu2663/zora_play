// Generic, cancellation-safe step runner used by Animal Sounds and Alphabets
// (the Rhyme Room keeps its own dedicated sequence in rhymeSequence.ts).
// Every spoken step waits for the REAL end of the audio, every pause is a timer started only after the
// previous step finished, and a cancelled run can never start another step. The ordering/cancellation
// rules live in the tv-audio-flow engine; this file maps the app's step list onto it.
import { AudioSequence, type AudioChannel, type Step as FlowStep } from 'tv-audio-flow';
import { flowAdapter, flowScheduler, type FlowSource, type SpeakFn, type WaitFn } from './flowAdapter.ts';

export type { SpeakOutcome } from './flowAdapter.ts';

export type Step =
  | { type: 'speak'; text: string; label?: string }
  /** `ms` may be a function: it is read when the pause starts, so a live speed setting (Alphabets) applies at once. */
  | { type: 'wait'; ms: number | (() => number); label?: string }
  /** Play a recording. `start` must call onEnd when the audio really finished, onError if it cannot play. */
  | { type: 'sound'; start: (h: { onEnd: () => void; onError: (message: string) => void }) => void; stop?: () => void; label?: string }
  | { type: 'do'; fn: () => void; label?: string };

export interface StepDeps {
  speak: SpeakFn;
  wait: WaitFn;
  /** Shared no-overlap channel: starting a run cancels whatever else plays on it. */
  channel?: AudioChannel;
}

export type RunState = 'IDLE' | 'RUNNING' | 'DONE' | 'ERROR' | 'CANCELLED';

export interface StepHooks {
  onStep?(index: number, step: Step): void;
  onDone?(): void;
  onError?(message: string, index: number): void;
}

function toFlow(s: Step, wait: WaitFn): FlowStep<FlowSource> {
  switch (s.type) {
    case 'speak': return { kind: 'clip', source: { kind: 'speak', text: s.text }, label: s.label };
    case 'wait': {
      if (typeof s.ms === 'number') return { kind: 'delay', ms: s.ms, label: s.label };
      // A pause whose length is only known when it begins: a timed "recording" that reads the value at that moment.
      const ms = s.ms;
      let cancel: (() => void) | null = null;
      return { kind: 'clip', source: { kind: 'recording', start: (h) => { cancel = wait(Math.max(0, ms()), h.onEnd); }, stop: () => { cancel?.(); cancel = null; } }, label: s.label };
    }
    case 'sound': return { kind: 'clip', source: { kind: 'recording', start: s.start, stop: s.stop }, label: s.label };
    case 'do': return { kind: 'action', run: s.fn, label: s.label };
  }
}

export class StepSequence {
  state: RunState = 'IDLE';
  index = -1;
  private seq: AudioSequence<FlowSource> | null = null;
  private quiet = false;
  private readonly deps: StepDeps;
  private readonly hooks: StepHooks;
  constructor(deps: StepDeps, hooks: StepHooks = {}) { this.deps = deps; this.hooks = hooks; }

  /** Run `steps` from `from`. Starting again cancels whatever was running. */
  run(steps: Step[], from = 0) {
    this.cancel(false);
    const own = steps.slice(from);
    const seq = new AudioSequence<FlowSource>(flowAdapter(this.deps.speak), own.map((x) => toFlow(x, this.deps.wait)), { scheduler: flowScheduler(this.deps.wait), name: 'steps' });
    this.seq = seq;
    seq.on('step', ({ index }) => { this.index = from + index; this.hooks.onStep?.(from + index, own[index]); });
    seq.on('end', (r) => {
      if (this.seq !== seq) return;
      if (r.status === 'completed') { this.state = 'DONE'; this.hooks.onDone?.(); }
      else if (r.status === 'failed') { this.state = 'ERROR'; this.hooks.onError?.(r.error?.message ?? 'step failed', from + Math.max(0, r.stepIndex)); }
      else if (!this.quiet) this.state = 'CANCELLED';
    });
    this.state = 'RUNNING';
    if (this.deps.channel) void this.deps.channel.play(seq);
    else void seq.start();
  }

  /** Abort: pending speech, timers and any playing recording. Safe at any time. */
  cancel(report = true) {
    if (!this.seq) return;
    this.quiet = !report;
    this.seq.cancel(report ? 'cancelled' : 'restarted');
    this.quiet = false;
  }
}
