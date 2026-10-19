# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-16

### Added

- `AudioSequence`: strictly sequential clip / delay / action steps driven by an `AudioAdapter`;
  advances only on real completion signals.
- Cancellation that stops the current clip, clears timers, never starts later steps and ignores
  stale and duplicate callbacks.
- Pause / resume gated on `adapter.capabilities.pause`; paused delays keep their remaining time.
- Validated state model (`idle`, `playing`, `waiting`, `paused`, `completed`, `cancelled`,
  `failed`) exported as `TRANSITIONS`.
- Typed `AudioFlowError` codes: `missing`, `decode`, `unsupported`, `adapter`, `cancelled`,
  `busy`, `invalid-state`, `invalid-step`.
- `AudioChannel` no-overlap policy (`interrupt` / `reject`).
- `tv-audio-flow/web`: `HtmlAudioAdapter` reference adapter.
- `tv-audio-flow/testing`: `MockAdapter`, `MockClip`, `ManualScheduler`.
- Examples: rhyme playback, animal-sound quiz.
