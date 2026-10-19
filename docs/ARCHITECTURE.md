# Architecture

## Layers

| Layer | Where | Responsibility |
|---|---|---|
| Presentation | `src/web/App.tsx`, `screens.tsx`, `screensNew.tsx`, `icons.tsx`, `styles.css` | 1920×1080 stage scaled to the screen, speech bubble, particles, screens, focus visuals, the opening scene |
| Buddy drawing | `src/web/Milo3D.tsx`, `buddy3d.ts`, `snapshots.ts` (3D, Three.js); `src/web/Milo.tsx` (flat SVG fallback) | The four buddies (Zora, Mimi, Bruno, Teddy). 3D by default; the flat buddy when a TV has no WebGL or is too slow. `snapshots.ts` makes the small pictures (faces, move strips); the opening-scene strips are pre-drawn files in `public/intro/` |
| Input | `src/web/focus.ts`, `src/web/voice.ts`, Talk buttons | Remote keys → spatial navigation, Back, Play/Pause; voice seam |
| Intent engine | `src/core/normalize.ts`, `parser.ts`, `registry.ts`, `brain.ts` | Normalize → parse → allowlist → resolve with session context → Reaction |
| Character | `src/core/character.ts`, `avatars.ts` | State machine with safety caps; the buddy registry (names, taglines, skin colours) |
| Speech and audio | `src/core/speechQueue.ts`, `phrases.ts`, `src/web/speech.ts`, `audio.ts`, `clips.ts`, `audioFlow.ts`, `src/core/flowAdapter.ts`, `packages/tv-audio-flow` | Recorded voice clips through one queue; sung songs, animal recordings and music; synthesized effects and instruments; one-sound-at-a-time sequencing |
| Content and games | `src/core/games.ts`, `rhymes.ts`, `band.ts`, `alphabet.ts`, `talk.ts`, `responses.ts`, `generatedLines.ts` | Pure game logic, the band note scheduler (currently unused by the screen), the Talk replies, all the buddy's lines; injectable RNG and clock |
| Platform host | `firetv/` (Android WebView wrapper, package `com.zoraplay.tv`); optional `vega/App.tsx` | Loads the built page from bundled assets, maps Back and Play/Pause keys, pauses audio when the app leaves the screen |

No backend. Everything runs on the device and offline. The Fire OS app has no INTERNET permission. (The brain class keeps its original name, `MiloBrain`.)

## Request flow

1. A remote button calls `ctx.act({intent, params})`, or a Talk phrase button calls `ctx.hear(text)`.
2. `normalize()` lowercases, strips punctuation and fillers ("hey buddy, can you please…"), bounds length to 200 chars.
3. `parseCommand()` matches fixed word lists, tolerates one-letter mis-hearings on longer words (Damerau distance), handles priority (STOP and privacy first), and returns `CLARIFY` when two actions are asked at once.
4. `validate()` checks the intent and every parameter against the registry. Anything unregistered is rejected.
5. `MiloBrain.handle()` resolves context ("faster" while dancing vs. while singing vs. after a dance ended; "again" in a game restarts it), drives the character machine, and returns a `Reaction`.
6. The App applies effects in order: navigate, sfx, rhyme, tempo, stopAll, particles; then shows the line in the speech bubble and speaks it through the speech queue.

The Talk section's conversation starters skip the parser: each is a fixed set of lines (`src/core/talk.ts`) spoken as one utterance, with an optional follow-up action after the speech really ends.

## Character state machine

23 states: `IDLE, LISTENING, THINKING, SPEAKING, HAPPY, LAUGHING, DANCING, ROBOT_DANCE, SINGING, JUMPING, WAVING, CLAPPING, SPINNING, SIDESTEPPING, HANDSUP, POINTING, BOUNCING, SLEEPING, CELEBRATING, CONFUSED, SUPPORTIVE, BREATHING, STOPPING`.

- Entry: `enter(state, now, {durationMs, style, speedIndex})` bumps a `seq` so re-entering restarts the animation.
- Animation: `computePose()` in `Milo.tsx` maps state + time + speed to a pose each frame; both the flat and the 3D buddy draw from the same pose, so all four buddies share one set of animations.
- Exit: bounded states return to `returnTo` (usually IDLE) when `tick()` passes `until`.
- Cancellation: `ANY → STOPPING (400 ms) → IDLE`.
- Valid transitions: `SLEEPING` only allows HAPPY (wake), STOPPING, IDLE.
- Safety fallback: every non-IDLE state has a finite `maxMs` cap, so the buddy can never get stuck listening, speaking or dancing.

## Speech and audio

**Speech** is recorded voice clips (`public/audio/voice/<buddy>/*.mp3`, one set per buddy, indexed by `clips.json`). `speech.speak(text)` maps the text onto catalog phrases (`phrases.ts`) and `SpeechQueue` decides what plays and when:

- one line at a time: a new line replaces the current one, identical lines within 600 ms are deduped, leaving a screen cancels speech;
- the clips of one line play back to back through a single `<audio>` element, with an optional calm pause between sentences (used for counting and jokes);
- `speakAndWait` and `whenIdle` let sequences (the Rhyme Room intro, jokes, Talk follow-ups) wait for the real end of a line, never a guessed duration;
- if a clip is missing the bubble still shows and a dev error is logged; nothing is reported as spoken that was not.

**Music and sounds:** songs, the dance song, the home theme, the Alphabets tune and the 11 animal recordings are bundled audio files played through `ClipPlayer` or an `<audio>` element. Sound effects and the ten Band instruments are synthesized with Web Audio. While the buddy speaks, music, songs and effects are ducked so words stay clear.

**Sequencing:** the `tv-audio-flow` library runs steps in order, starts each only when the previous one really ended, lets only one sequence play on a shared channel, and cancels cleanly when a screen is left.

Rules: STOP silences everything; leaving a screen stops its audio; if Web Audio is missing, effect calls are no-ops and the visuals carry on; the Rhyme Room's karaoke follows the real playback position. See [VOICE.md](VOICE.md) for how the clips are made.

## Focus

Our own spatial navigation (nearest row first, then best-aligned) gives identical behaviour in the Fire OS WebView and in a desktop browser (and in a Vega WebView if one is used). Focus is remembered per screen and restored on Back. A choice pop-up traps focus until answered or dismissed with Back.

## Content pipeline

Extra jokes, riddles, animal facts, chat replies and bedtime lines are written at build time with Amazon Bedrock, checked by a Bedrock Guardrail and local rules, approved by a person, and imported as plain text. Nothing from AWS runs on the TV. See [aws-bedrock.md](aws-bedrock.md).

## Session data

In memory: current screen, character snapshot, last intent + params (never the text), current rhyme, game state, scales, settings. The only things kept on the device are local settings: the chosen buddy (`zora.avatar`), the 3D or flat choice (`zora.render`) and, if a grown-up enables it, the device-voice check result. Closing the app clears everything else.
