// tv-audio-flow: framework-agnostic, cancellation-safe audio sequencing.
// The core never touches a platform audio API; plug one in through an AudioAdapter
// (the HTMLAudioElement adapter lives in 'tv-audio-flow/web').
export { AudioSequence, type SequenceOptions } from './sequence.ts';
export { AudioChannel, type ChannelOptions, type OverlapPolicy } from './channel.ts';
export { AudioFlowError, isAudioFlowError, toAudioFlowError, type AudioFlowErrorCode, type AudioFlowErrorOptions } from './errors.ts';
export { TRANSITIONS, canTransition, isTerminal, type SequenceStatus, type TerminalStatus } from './state.ts';
export { defaultScheduler } from './scheduler.ts';
export { action, clip, delay } from './builders.ts';
export type {
  ActionStep, AdapterCapabilities, AudioAdapter, ClipCallbacks, ClipHandle, ClipStep, DelayStep, Scheduler,
  SequenceEventName, SequenceEvents, SequenceResult, Step, StepEvent,
} from './types.ts';
