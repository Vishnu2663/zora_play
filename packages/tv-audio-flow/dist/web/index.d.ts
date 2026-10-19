import { AudioFlowError, type AudioFlowErrorCode } from '../errors.ts';
import type { AudioAdapter, ClipCallbacks, ClipHandle } from '../types.ts';
export interface HtmlAudioAdapterOptions<S> {
    /** Turn a step source into a URL. Default: the source itself (it must be a string). */
    resolveUrl?: (source: S) => string;
    /** Element factory. Default `new Audio()`. Inject a fake in tests. */
    createElement?: () => HTMLAudioElement;
    /** 0..1, applied to each new element. Default 1. */
    volume?: number;
    /** Applied to each new element. Default 1. */
    playbackRate?: number;
}
/** MediaError.code → AudioFlowError code. Browsers report a 404 as code 4 (unsupported), see README. */
export declare function mediaErrorCode(code: number | undefined): AudioFlowErrorCode;
/** A rejected `play()` promise → AudioFlowError, or null when it must be ignored (AbortError). */
export declare function playRejectionError(err: unknown, url: string): AudioFlowError | null;
export declare class HtmlAudioAdapter<S = string> implements AudioAdapter<S> {
    readonly capabilities: {
        readonly pause: true;
    };
    volume: number;
    playbackRate: number;
    private readonly resolveUrl;
    private readonly createElement;
    constructor(options?: HtmlAudioAdapterOptions<S>);
    play(source: S, cb: ClipCallbacks): ClipHandle;
}
//# sourceMappingURL=index.d.ts.map