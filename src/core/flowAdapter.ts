// Bridge between the app's audio services and the tv-audio-flow engine.
// The engine owns ordering, cancellation and stale-callback rules; this file only translates
// "speak a line" / "play a recording" into the engine's AudioAdapter contract.
import { AudioFlowError, type AudioAdapter, type AudioFlowErrorCode, type ClipCallbacks, type ClipHandle, type Scheduler } from 'tv-audio-flow';

export type SpeakOutcome = 'completed' | 'failed' | 'cancelled';

/** Speak a line; call `done` once with the actual outcome. Returns a canceller. */
export type SpeakFn = (text: string, done: (r: SpeakOutcome, reason?: string) => void) => () => void;
/** Timer; returns a canceller. */
export type WaitFn = (ms: number, cb: () => void) => () => void;
/** Start a recording. `onEnd` when it really finished, `onError` if it cannot play. */
export type StartRecording = (h: { onEnd: () => void; onError: (message: string) => void }) => void;

/** What a clip step plays in this app: a spoken line, or a recording (song, animal sound). */
export type FlowSource =
  | { kind: 'speak'; text: string }
  | { kind: 'recording'; start: StartRecording; stop?: () => void };

/** Map the app's clip error messages (ClipPlayer, speech) to typed codes. */
export function errorCodeFor(message: string): AudioFlowErrorCode {
  if (/media error 4|not supported/i.test(message)) return 'unsupported';
  if (/media error 3|zero duration|decode/i.test(message)) return 'decode';
  if (/media error 2|cannot load|no .*clip|not in phrase catalog/i.test(message)) return 'missing';
  return 'adapter';
}

export function flowAdapter(speak: SpeakFn): AudioAdapter<FlowSource> {
  return {
    capabilities: { pause: false },
    play(source: FlowSource, cb: ClipCallbacks): ClipHandle {
      if (source.kind === 'speak') {
        let settled = false;
        const text = source.text;
        const cancel = speak(text, (r, reason) => {
          if (settled) return;
          settled = true;
          if (r === 'completed') { cb.onEnded(); return; }
          if (r === 'cancelled') { cb.onError(new AudioFlowError('cancelled', `"${text}" was interrupted${reason ? `: ${reason}` : ''}`)); return; }
          const why = reason ?? 'no voice clip';
          cb.onError(new AudioFlowError(errorCodeFor(why), `Cannot speak "${text}": ${why}`));
        });
        // Only cut speech that is still ours: once this line ended, stopping must not silence a newer line.
        return { stop: () => { if (!settled) { settled = true; cancel(); } } };
      }
      let done = false;
      source.start({
        onEnd: () => { if (!done) { done = true; cb.onEnded(); } },
        onError: (m) => { if (!done) { done = true; cb.onError(new AudioFlowError(errorCodeFor(m), m)); } },
      });
      return { stop: () => { done = true; source.stop?.(); } };
    },
  };
}

/** The app's injectable timer as a tv-audio-flow scheduler. */
export function flowScheduler(wait: WaitFn): Scheduler {
  return { delay: (ms, cb) => wait(ms, cb), now: () => Date.now() };
}
