# TV Audio Flow

Cancellation-safe, strictly sequential audio sequencing for TV, kiosk and kids' web apps.

You describe a flow as a list of steps (*play this clip, wait 600 ms, play that clip, show the buttons*),
and TV Audio Flow plays it **in order, one step at a time, advancing only when the audio really finished**.
When the user presses Back, `cancel()` guarantees that nothing from that flow is heard again — no late
callback, no leftover timer, no second song.

```ts
import { AudioChannel, AudioSequence, clip, delay, action } from 'tv-audio-flow';
import { HtmlAudioAdapter } from 'tv-audio-flow/web';

const adapter = new HtmlAudioAdapter();            // one <audio> element per clip
const channel = new AudioChannel();                // at most one flow audible at a time

const intro = new AudioSequence(adapter, [
  clip('voice/lets-sing.mp3'),
  delay(600),
  clip('voice/twinkle-title.mp3'),
  delay(800),
  clip('songs/twinkle.mp3'),
  action(() => showReplayButton()),
]);

const result = await channel.play(intro);         // never rejects
if (result.status === 'failed') console.warn(result.error.code, result.error.message);

// On navigation:
channel.cancel('navigate');
```

---

## Contents

1. [Why](#1-why)
2. [Features](#2-features)
3. [Install](#3-install)
4. [Quick start](#4-quick-start)
5. [Steps](#5-steps)
6. [State model](#6-state-model)
7. [Cancellation guarantees](#7-cancellation-guarantees)
8. [Pause and resume](#8-pause-and-resume)
9. [Errors](#9-errors)
10. [No overlap: `AudioChannel`](#10-no-overlap-audiochannel)
11. [Adapters](#11-adapters)
12. [Testing your app](#12-testing-your-app)
13. [Examples](#13-examples)
14. [Platform support and limitations](#14-platform-support-and-limitations)
- [API reference](#api-reference)
- [Development, contributing, license, publishing](#development)

---

## 1. Why

TV and kids' apps chain short recordings: a greeting, a pause, a title, the song; an animal sound,
a pause, a question, then the answer buttons. The usual implementation — `setTimeout` with a guessed
duration, or nested `onended` handlers — breaks in exactly the situations a child creates on a remote:

- pressing Back during a pause, and the song starts anyway on the next screen;
- pressing Next quickly, and two clips play on top of each other;
- a late `ended` event from an old clip advancing the new flow;
- a missing file silently skipped (or replaced by a beep), so the flow looks broken.

TV Audio Flow puts the sequencing rules in one small, tested engine, and leaves the actual audio
API to an adapter.

## 2. Features

- **Strictly sequential**: a step starts only after the previous one *really* ended (adapter
  `onEnded`, timer fired). Duration is never guessed.
- **Configurable delays** between clips, measured from the real end of the previous clip.
- **Cancellation**: `cancel()` stops the current clip, clears timers, never starts later steps,
  releases adapter resources and ignores every stale or duplicate callback.
- **Pause / resume** only when the adapter supports it (`sequence.canPause`); a paused delay keeps
  its remaining time.
- **Typed errors** (`missing`, `decode`, `unsupported`, `adapter`, `cancelled`, ...).
- **Documented, validated state model**: `idle`, `playing`, `waiting`, `paused`, `completed`,
  `cancelled`, `failed`. Illegal transitions throw.
- **No-overlap policy** across sequences with `AudioChannel` (`interrupt` or `reject`).
- **Framework-agnostic** core: no DOM, no React, no timers you cannot inject.
- **Reference web adapter** (`HtmlAudioAdapter`) in its own entry point.
- **Test doubles** (`MockAdapter`, `ManualScheduler`) in `tv-audio-flow/testing`.
- ESM, TypeScript declarations, zero runtime dependencies.

## 3. Install

```sh
npm install tv-audio-flow
```

Not on npm yet? Use it from a local folder:

```sh
git clone <your fork> tv-audio-flow
cd tv-audio-flow && npm install          # also builds dist/ (prepare script)
cd ../your-app && npm install ../tv-audio-flow
```

Entry points:

| import                      | contents                                               |
|-----------------------------|--------------------------------------------------------|
| `tv-audio-flow`             | engine, channel, errors, state model, step builders    |
| `tv-audio-flow/web`         | `HtmlAudioAdapter` (HTMLAudioElement)                  |
| `tv-audio-flow/testing`     | `MockAdapter`, `MockClip`, `ManualScheduler`           |

The package ships ES2020 JavaScript modules. Bundle it (esbuild, Vite, webpack...) for older WebViews.

## 4. Quick start

```ts
import { AudioSequence, clip, delay, action } from 'tv-audio-flow';
import { HtmlAudioAdapter } from 'tv-audio-flow/web';

const adapter = new HtmlAudioAdapter<string>({ resolveUrl: (id) => `audio/${id}.mp3`, volume: 0.8 });

const question = new AudioSequence(adapter, [
  clip('cow-moo', 'sound'),
  delay(500, 'after-sound'),
  clip('which-animal', 'question'),
  action(() => setOptionsVisible(true), 'options'),
], { name: 'animal-question' });

question.on('state', ({ status }) => render(status));
question.on('error', (e) => showGrownUpError(`${e.code}: ${e.message}`));

const { status } = await question.start();       // 'completed' | 'cancelled' | 'failed'
```

Call `start()` on a user gesture (button press) the first time: browsers block audio until then.

## 5. Steps

| step                         | builder                 | finishes when                                  |
|------------------------------|-------------------------|-----------------------------------------------|
| `{ kind: 'clip', source }`   | `clip(source, label?)`  | the adapter calls `onEnded()`                  |
| `{ kind: 'delay', ms }`      | `delay(ms, label?)`     | the scheduler fires after `ms`                 |
| `{ kind: 'action', run }`    | `action(fn, label?)`    | `run()` returns (synchronous)                  |

- `source` is opaque to the engine: a URL, an id, an object — whatever your adapter understands.
- `label` is optional and shows up in events and errors.
- Steps are validated when the sequence is created (`invalid-step` for a negative delay, missing
  source, unknown kind...). A sequence's steps are frozen; build a new sequence for a different flow.

## 6. State model

```
            start()
  idle ───────────────► playing ◄──────► waiting
                          │  ▲             │  ▲
                 pause()  ▼  │ resume()    ▼  │
                          paused ◄─────────┘──┘
   playing / waiting / paused ──► completed | cancelled | failed   (terminal)
   terminal ── start() again ──► playing | waiting | ...
```

| status      | meaning                                                         |
|-------------|-----------------------------------------------------------------|
| `idle`      | created, never started                                          |
| `playing`   | a clip step is active                                           |
| `waiting`   | a delay step is counting down                                   |
| `paused`    | clip or delay frozen; `resume()` returns to playing / waiting   |
| `completed` | every step finished                                             |
| `cancelled` | `cancel()`, a channel interruption, or an adapter `cancelled`   |
| `failed`    | a step failed; `sequence.error` / `result.error` say why        |

The full table is exported as `TRANSITIONS` (and `canTransition(from, to)`). The engine checks
every change against it and throws `invalid-state` on an illegal one, so a bug cannot silently
put a sequence into an impossible state. A paused sequence cannot complete; a terminal one can
only be left with `start()`.

## 7. Cancellation guarantees

After `cancel()` returns (or a channel interrupts the sequence):

1. the current clip's handle has been `stop()`ped exactly once;
2. the pending delay timer has been cleared;
3. no later step (clip, delay or action) will ever start for that run;
4. every callback from that run — `onEnded`, `onError`, `onStarted`, timer — is ignored, even if it
   arrives after a new run of the same sequence started;
5. the promise returned by `start()` resolves with `{ status: 'cancelled' }`.

`cancel()` is idempotent (returns `false` when there is nothing to cancel) and safe from inside
listeners and actions. Duplicate `ended` events advance only once. `dispose()` cancels and removes
every listener; the sequence can no longer be started.

## 8. Pause and resume

`pause()` works only if the adapter declares `capabilities.pause === true` — check
`sequence.canPause` to decide whether to show a Pause button. Otherwise `pause()` returns `false`
and nothing changes.

- Pausing a clip calls the handle's `pause()`; resuming calls `resume()`.
- Pausing a delay stops its timer and keeps the remaining time; resuming waits only that remainder.
- An `ended` event that arrives while paused is held and honoured on `resume()`.
- `resume()` after `completed` / `cancelled` / `failed` returns `false` and does nothing.

## 9. Errors

Every failure is an `AudioFlowError` with a stable `code`, plus `stepIndex` and `label`:

| code            | when                                                                      |
|-----------------|---------------------------------------------------------------------------|
| `missing`       | the file could not be found or fetched                                    |
| `decode`        | the file was found but cannot be decoded (corrupt, zero duration)         |
| `unsupported`   | format/source not supported by the platform or adapter                    |
| `adapter`       | anything else from the adapter (autoplay blocked, exception, action threw) |
| `cancelled`     | the run was cancelled, or the adapter reported an outside interruption    |
| `busy`          | `AudioChannel` with policy `reject` already playing                       |
| `invalid-state` | API misuse: `start()` while active or after `dispose()`, illegal transition |
| `invalid-step`  | malformed step definition                                                 |

`start()` never rejects; failures arrive as `{ status: 'failed', error }`, the `error` event and
`sequence.error`. Only programming errors (`invalid-state`, `invalid-step`) are thrown
synchronously. A failed clip is stopped and nothing after it plays — the engine never substitutes
a placeholder sound. Errors thrown by your listeners are reported through `onListenerError`
(default `console.error`) and never break the flow.

## 10. No overlap: `AudioChannel`

A sequence never overlaps itself. To keep *different* sequences from overlapping, play them through
a shared channel:

```ts
const channel = new AudioChannel();               // policy: 'interrupt' (default)
channel.play(rhymeSequence);
channel.play(animalSequence);                     // rhyme is cancelled first, then animal starts
channel.cancel('navigate');                       // e.g. in your router
```

- `interrupt`: the active sequence is cancelled before the new one starts (last request wins).
- `reject`: the new sequence is not started and resolves `{ status: 'failed', error.code: 'busy' }`.

Use one channel per output you want exclusive (one for the whole app is usually right).

## 11. Adapters

An adapter turns a step `source` into sound:

```ts
interface AudioAdapter<S> {
  readonly capabilities: { readonly pause: boolean };
  play(source: S, callbacks: ClipCallbacks): ClipHandle;
}
interface ClipCallbacks { onStarted(): void; onEnded(): void; onError(error: unknown): void }
interface ClipHandle { stop(): void; pause?(): void; resume?(): void }
```

Rules for adapter authors:

- Call `onEnded()` only when the audio really finished. This is the only signal that advances a clip.
- Call `onError()` with an `AudioFlowError` for a precise code; anything else becomes `adapter`.
  Report an outside interruption (e.g. your speech engine replaced the line) as code `cancelled`.
- `stop()` must stop sound and release listeners, and be safe to call twice.
- You may throw from `play()` or call the callbacks synchronously; the engine handles both.
- You do not need to de-duplicate events; the engine ignores repeats and stale calls.

### `HtmlAudioAdapter` (`tv-audio-flow/web`)

One `HTMLAudioElement` per clip, created by `createElement` (default `new Audio()`).

- options: `resolveUrl(source) => url`, `createElement()`, `volume`, `playbackRate`.
- `MediaError` 2 → `missing`, 3 → `decode`, 4 → `unsupported`, other → `adapter`; a zero-duration
  file → `decode`.
- `play()` rejections: `NotAllowedError` → `adapter` (autoplay policy), `NotSupportedError` →
  `unsupported`; `AbortError` (play interrupted by pause/stop) is ignored.
- Listeners are removed and the element is released (`pause()`, remove `src`, `load()`) on end,
  error and stop.

Other adapters are easy to write: Web Audio buffers, a native media player bridge, a TTS engine.
`examples/console-adapter.ts` is a complete adapter in 20 lines.

## 12. Testing your app

```ts
import { AudioSequence, clip, delay } from 'tv-audio-flow';
import { MockAdapter, ManualScheduler } from 'tv-audio-flow/testing';

const adapter = new MockAdapter();                // records play() calls; you end clips
const clock = new ManualScheduler();              // time moves only when you say so
const seq = new AudioSequence(adapter, [clip('a'), delay(500), clip('b')], { scheduler: clock });

seq.start();
adapter.last.end();                               // 'a' really ended
clock.advance(500);                               // the delay elapsed
assert.deepEqual(adapter.sources, ['a', 'b']);
```

`MockClip` exposes `start()`, `end()`, `fail(error)`, `stopped`, `paused`, `stopCalls`. Its `end()`
is deliberately unguarded so you can send late and duplicate events. No sleeps are needed.

## 13. Examples

Runnable in Node (they use a small console adapter instead of real audio):

```sh
npm install
npm run build
npm run examples
```

- `examples/rhyme-playback.ts` — intro → pause → title → pause → song; then the same flow is
  cancelled mid-way by "navigation".
- `examples/animal-quiz.ts` — intro → sound → pause → question → show options; a skip-ahead that
  interrupts the playing round; a missing recording reported as `missing`.
- `examples/console-adapter.ts` — a minimal adapter you can copy.

## 14. Platform support and limitations

| environment                                  | status                                          |
|----------------------------------------------|--------------------------------------------------|
| Node ≥ 22.18 (tests, examples)               | tested                                           |
| Chromium-based browsers / Android WebView    | `HtmlAudioAdapter` unit-tested against a fake `<audio>` element only; no automated real-browser run yet |
| Amazon Vega OS WebView                        | **untested** — see below                          |
| React Native / Vega native audio              | no adapter yet (write one against `AudioAdapter`) |

Known limitations:

- Browsers report a 404 as `MediaError` 4 in most cases, so `HtmlAudioAdapter` cannot always tell
  `missing` from `unsupported`. Check file existence yourself if the difference matters.
- `capabilities.pause` is a per-adapter flag. If you need pause for delays only, use an adapter
  that declares pause.
- Delays are as precise as the host's timers (`setTimeout`); TV WebViews can be 10–50 ms late.
- `HtmlAudioAdapter` creates one element per clip; it does not preload the *next* clip.
- Actions are synchronous. For async work, end the sequence and start another one.
- Not tested on Vega OS: the core is plain ES2020 with no DOM use, so it should run in any JS
  runtime, but no Vega device or simulator run has been done.

---

## API reference

### `new AudioSequence<S>(adapter, steps, options?)`

| member                     | description                                                          |
|----------------------------|----------------------------------------------------------------------|
| `start(): Promise<SequenceResult>` | run from step 0; resolves on completion, cancel or failure; throws `invalid-state` if active/disposed |
| `cancel(reason?): boolean` | stop everything; `false` if nothing was running                      |
| `pause(): boolean`         | freeze clip/delay; `false` if unsupported or not playing/waiting     |
| `resume(): boolean`        | continue after pause; `false` otherwise                              |
| `dispose(): void`          | cancel + remove all listeners; no further `start()`                  |
| `on(event, fn): () => void`| subscribe; returns the unsubscribe function                          |
| `listenerCount(event?)`    | number of listeners                                                   |
| `status`, `stepIndex`, `currentStep`, `error`, `isActive`, `canPause`, `isDisposed`, `name`, `steps` | read-only state |

Options: `scheduler` (`{ delay(ms, cb): cancel; now(): number }`), `name`, `onListenerError`.

Events: `state` `{ status, previous }`, `step` `{ index, step }`, `stepend`, `clipstart`, `error`
(`AudioFlowError`), `end` (`SequenceResult`).

`SequenceResult`: `{ status: 'completed' | 'cancelled' | 'failed', error?: AudioFlowError, stepIndex }`.

### `new AudioChannel({ policy? })`

`play(sequence): Promise<SequenceResult>`, `cancel(reason?): boolean`, `active`, `policy`.

### Other exports

`clip`, `delay`, `action`, `AudioFlowError`, `isAudioFlowError`, `toAudioFlowError`, `TRANSITIONS`,
`canTransition`, `isTerminal`, `defaultScheduler`, and all types. From `/web`: `HtmlAudioAdapter`,
`mediaErrorCode`, `playRejectionError`. From `/testing`: `MockAdapter`, `MockClip`, `ManualScheduler`.

---

## Development

```sh
npm install          # dev deps: typescript, @types/node; builds dist/
npm run typecheck    # src + tests + examples
npm test             # node:test, Node >= 22.18 (runs the .ts files directly)
npm run build        # dist/ (ESM + .d.ts + source maps)
npm run examples
npm run check        # all of the above
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

## Publishing (manual)

Nothing here has been pushed or published. To publish it yourself:

```sh
# 1. GitHub
# (already a local git repo with one commit on main)
gh repo create <owner>/tv-audio-flow --public --source . --push
#    then add "repository", "homepage" and "bugs" fields to package.json

# 2. npm (check the name is free: npm view tv-audio-flow)
npm run check
npm pack --dry-run   # inspect the file list
npm login
npm publish --access public
```

## License

[MIT](LICENSE). No audio assets are included.
