// Reference adapter for browsers and WebViews: one HTMLAudioElement per clip.
// Kept out of the core so the engine stays platform-free.
import { AudioFlowError } from "../errors.js";
/** MediaError.code → AudioFlowError code. Browsers report a 404 as code 4 (unsupported), see README. */
export function mediaErrorCode(code) {
    switch (code) {
        case 2: return 'missing'; // MEDIA_ERR_NETWORK
        case 3: return 'decode'; // MEDIA_ERR_DECODE
        case 4: return 'unsupported'; // MEDIA_ERR_SRC_NOT_SUPPORTED (also 404 / wrong MIME in most browsers)
        default: return 'adapter'; // 1 MEDIA_ERR_ABORTED or unknown
    }
}
/** A rejected `play()` promise → AudioFlowError, or null when it must be ignored (AbortError). */
export function playRejectionError(err, url) {
    const name = err?.name;
    if (name === 'AbortError')
        return null; // play() interrupted by pause()/src change: not a failure
    if (name === 'NotSupportedError')
        return new AudioFlowError('unsupported', `cannot play ${url}: format or source not supported`, { cause: err });
    if (name === 'NotAllowedError')
        return new AudioFlowError('adapter', `play() blocked for ${url} (autoplay policy: needs a user gesture first)`, { cause: err });
    return new AudioFlowError('adapter', `play() rejected for ${url}: ${name ?? String(err)}`, { cause: err });
}
function release(el) {
    try {
        el.pause();
        el.removeAttribute('src');
        el.load();
    }
    catch { /* element already gone */ }
}
export class HtmlAudioAdapter {
    constructor(options = {}) {
        this.capabilities = { pause: true };
        this.resolveUrl = options.resolveUrl ?? ((s) => {
            if (typeof s !== 'string')
                throw new AudioFlowError('unsupported', 'HtmlAudioAdapter: source is not a URL string; pass resolveUrl');
            return s;
        });
        this.createElement = options.createElement ?? (() => new Audio());
        this.volume = options.volume ?? 1;
        this.playbackRate = options.playbackRate ?? 1;
    }
    play(source, cb) {
        const url = this.resolveUrl(source);
        const el = this.createElement();
        let done = false;
        let started = false;
        const detach = () => {
            el.removeEventListener('playing', onPlaying);
            el.removeEventListener('ended', onEnded);
            el.removeEventListener('error', onError);
            el.removeEventListener('loadedmetadata', onMeta);
        };
        const finish = (err) => {
            if (done)
                return;
            done = true;
            detach();
            if (err) {
                release(el);
                cb.onError(err);
            }
            else
                cb.onEnded();
        };
        const onPlaying = () => { if (!done && !started) {
            started = true;
            cb.onStarted();
        } };
        const onEnded = () => finish();
        const onError = () => {
            const code = el.error?.code;
            finish(new AudioFlowError(mediaErrorCode(code), `cannot load ${url} (media error ${code ?? '?'})`));
        };
        const onMeta = () => { if (el.duration === 0)
            finish(new AudioFlowError('decode', `${url} has zero duration`)); };
        el.addEventListener('playing', onPlaying);
        el.addEventListener('ended', onEnded);
        el.addEventListener('error', onError);
        el.addEventListener('loadedmetadata', onMeta);
        el.preload = 'auto';
        el.volume = this.volume;
        el.playbackRate = this.playbackRate;
        el.src = url;
        const playAndWatch = () => {
            let p;
            try {
                p = el.play();
            }
            catch (e) {
                const err = playRejectionError(e, url);
                if (err)
                    finish(err);
                return;
            }
            if (p && typeof p.catch === 'function')
                p.catch((e) => { const err = playRejectionError(e, url); if (err)
                    finish(err); });
        };
        playAndWatch();
        return {
            stop: () => { if (!done) {
                done = true;
                detach();
            } release(el); },
            pause: () => { if (!done)
                el.pause(); },
            resume: () => { if (!done)
                playAndWatch(); },
        };
    }
}
//# sourceMappingURL=index.js.map