export class AudioFlowError extends Error {
    constructor(code, message, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'AudioFlowError';
        this.code = code;
        this.stepIndex = options.stepIndex;
        this.label = options.label;
    }
}
/** Structural check, so errors created by another copy of the library are still recognised. */
export function isAudioFlowError(value) {
    return value instanceof AudioFlowError
        || (typeof value === 'object' && value !== null && value.name === 'AudioFlowError'
            && typeof value.code === 'string');
}
/** Normalise anything an adapter reports into an AudioFlowError attached to a step. */
export function toAudioFlowError(value, stepIndex, label) {
    if (isAudioFlowError(value)) {
        if (value.stepIndex === stepIndex)
            return value;
        return new AudioFlowError(value.code, value.message, { cause: value.cause, stepIndex, label: value.label ?? label });
    }
    const message = value instanceof Error ? value.message : typeof value === 'string' ? value : 'unknown adapter error';
    return new AudioFlowError('adapter', message, { cause: value, stepIndex, label });
}
//# sourceMappingURL=errors.js.map