/**
 * Every failure the library reports is an {@link AudioFlowError} with a stable `code`.
 *
 * | code            | meaning                                                                 |
 * |-----------------|-------------------------------------------------------------------------|
 * | `missing`       | the clip's file could not be found / fetched                            |
 * | `decode`        | the file was found but could not be decoded (corrupt, zero-length)      |
 * | `unsupported`   | the format or the source type is not supported by the adapter/platform  |
 * | `adapter`       | any other adapter/platform failure (autoplay blocked, thrown exception) |
 * | `cancelled`     | the clip was interrupted from outside the sequence (see README)         |
 * | `busy`          | an {@link AudioChannel} with policy `reject` already has an active run  |
 * | `invalid-state` | an API was used in a state that does not allow it (a programming error) |
 * | `invalid-step`  | a step definition is malformed (negative delay, missing source, ...)    |
 */
export type AudioFlowErrorCode =
  | 'missing'
  | 'decode'
  | 'unsupported'
  | 'adapter'
  | 'cancelled'
  | 'busy'
  | 'invalid-state'
  | 'invalid-step';

export interface AudioFlowErrorOptions {
  cause?: unknown;
  /** Index of the step that failed, when the error belongs to a step. */
  stepIndex?: number;
  /** Label of the step that failed, if it had one. */
  label?: string;
}

export class AudioFlowError extends Error {
  readonly code: AudioFlowErrorCode;
  readonly stepIndex: number | undefined;
  readonly label: string | undefined;

  constructor(code: AudioFlowErrorCode, message: string, options: AudioFlowErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AudioFlowError';
    this.code = code;
    this.stepIndex = options.stepIndex;
    this.label = options.label;
  }
}

/** Structural check, so errors created by another copy of the library are still recognised. */
export function isAudioFlowError(value: unknown): value is AudioFlowError {
  return value instanceof AudioFlowError
    || (typeof value === 'object' && value !== null && (value as { name?: unknown }).name === 'AudioFlowError'
      && typeof (value as { code?: unknown }).code === 'string');
}

/** Normalise anything an adapter reports into an AudioFlowError attached to a step. */
export function toAudioFlowError(value: unknown, stepIndex: number, label?: string): AudioFlowError {
  if (isAudioFlowError(value)) {
    if (value.stepIndex === stepIndex) return value;
    return new AudioFlowError(value.code, value.message, { cause: value.cause, stepIndex, label: value.label ?? label });
  }
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : 'unknown adapter error';
  return new AudioFlowError('adapter', message, { cause: value, stepIndex, label });
}
