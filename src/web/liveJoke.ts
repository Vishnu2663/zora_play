// Fetches one fresh joke from the joke service. Returns null on ANY problem (offline, slow, error, odd reply), so the caller
// can simply tell a stored joke instead. Sends only the buddy's id.
import { LIVE_JOKE_TIMEOUT_MS, LIVE_JOKE_URL, parseLiveJoke, shouldTryLiveJoke, type LiveJoke } from '../core/liveJoke.ts';
import type { AvatarId } from '../core/avatars.ts';

export interface LiveJokeRequest { promise: Promise<LiveJoke | null>; cancel: () => void }

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Ask the service for a joke on every press while the TV is connected (see shouldTryLiveJoke). */
export function liveJokeReady(enabled: boolean): boolean {
  return shouldTryLiveJoke({ enabled, online: isOnline() && typeof fetch !== 'undefined' });
}

export function requestLiveJoke(buddy: AvatarId, timeoutMs = LIVE_JOKE_TIMEOUT_MS): LiveJokeRequest {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const cancel = () => { try { ctl?.abort(); } catch { /* already finished */ } };
  const timer = setTimeout(cancel, timeoutMs);
  const promise = fetch(`${LIVE_JOKE_URL}?buddy=${encodeURIComponent(buddy)}`, { signal: ctl?.signal, cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => parseLiveJoke(data))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  return { promise, cancel };
}
