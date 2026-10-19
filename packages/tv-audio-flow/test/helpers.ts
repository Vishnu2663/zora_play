import { AudioSequence, type SequenceOptions, type SequenceStatus, type Step } from '../src/index.ts';
import { ManualScheduler, MockAdapter, type MockAdapterOptions } from '../src/testing/index.ts';

/** A sequence wired to a MockAdapter + ManualScheduler, recording every status change. */
export function rig(steps: Step<string>[], adapterOptions: MockAdapterOptions<string> = {}, options: SequenceOptions = {}) {
  const adapter = new MockAdapter<string>(adapterOptions);
  const clock = new ManualScheduler();
  const seq = new AudioSequence(adapter, steps, { scheduler: clock, name: 'test', ...options });
  const states: SequenceStatus[] = [];
  seq.on('state', ({ status }) => states.push(status));
  return { adapter, clock, seq, states };
}

/** Lets pending promise callbacks run (results of start() resolve in a microtask). */
export const flush = () => new Promise<void>((r) => setImmediate(r));
