// tv-audio-flow: framework-agnostic, cancellation-safe audio sequencing.
// The core never touches a platform audio API; plug one in through an AudioAdapter
// (the HTMLAudioElement adapter lives in 'tv-audio-flow/web').
export { AudioSequence } from "./sequence.js";
export { AudioChannel } from "./channel.js";
export { AudioFlowError, isAudioFlowError, toAudioFlowError } from "./errors.js";
export { TRANSITIONS, canTransition, isTerminal } from "./state.js";
export { defaultScheduler } from "./scheduler.js";
export { action, clip, delay } from "./builders.js";
//# sourceMappingURL=index.js.map