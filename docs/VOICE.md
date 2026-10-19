# Zora Play's voice: how it works and how to generate it

## Status

| Piece | State |
|---|---|
| Speech service (queue, priority, cancel, dedupe, pause/resume, states, ducking) | unit-tested; browser-tested with real `<audio>` playback in Chromium |
| Phrase catalog | 263 lines with stable ids; every `say()` in the UI and every brain reaction is covered (tests fail if one is not) |
| Clip generator (Piper + ffmpeg, verification, manifests) | runs on Windows, Mac and Linux; used for all clips |
| Voice clips | **263 of 263 voiced for each of the four buddies** (Zora, Mimi, Bruno, Teddy); `npm run voice:report` checks it |
| System `speechSynthesis` fallback | off by default; only usable after the in-app probe passes on the device |
| Fire OS WebView audio | not yet checked by ear on a Fire TV or the emulator; run Settings > Audio diagnostics on the device |

If a line has no clip the buddy shows its speech bubble silently, the line ends in state `failed`, and a dev-time console error is logged. Nothing pretends to be speech.

## Generate the clips

You need Python with `piper-tts`, `ffmpeg` and `ffprobe` on the PATH, and the voice model (both files).

```bash
pip3 install piper-tts                     # Piper TTS (MIT)
mkdir -p ~/piper-voices && cd ~/piper-voices
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/medium/en_US-ljspeech-medium.onnx.json

cd <this repository>
npm run voice:phrases                      # writes voice/phrases.json from every line in the app
python scripts/gen-voice.py --model ~/piper-voices/en_US-ljspeech-medium.onnx --piper piper --only-missing
npm run voice:report                       # expect: 263/263 lines voiced for every buddy
npm run build                              # copies public/audio into dist/audio
```

Notes:

- `--only-missing` keeps existing clips and records only new lines. Leave it off to re-record everything.
- On Windows set `PYTHONUTF8=1` so lines with a curly apostrophe are read correctly.
- `--piper piper` uses the Piper command line. `--piper lite` uses the in-process helper `scripts/piper_lite.py`, which also needs `espeak-ng` on the PATH.
- If `piper` is not on your PATH after installing, pass `--piper "python3 -m piper"`.

Why this voice: `en_US-ljspeech-medium` was trained **from scratch** on LJ Speech (public domain); the piper-voices repository is MIT. Lessac-derived voices were avoided (their dataset license restricts commercial use). Caveat recorded in `public/audio/MANIFEST.json`: Piper phonemizes with espeak-ng (GPL); its maintainer is unsure whether that affects generated audio.

## One voice, four buddies

All four buddies start from the same Piper voice. `voice/profiles.json` gives each a pitch and tempo (Zora is bright, Mimi light and quick, Bruno warm and lower, Teddy deep and slow), applied with ffmpeg. They are different voices in tone and speed, not different speakers.

Each clip is loudness-normalised, trimmed, encoded to 64 kbps mono MP3 and **rejected if shorter than 0.25 s or too quiet**. Rejected lines stay pending and the app reports them missing. Jokes are recorded a little slower so the words are easy to follow.

## How speech plays

1. `say(text)` (App.tsx) → `speech.speak(text)`.
2. `segment(text)` maps the text onto catalog phrases (whole line, or sentence by sentence).
3. All covered and every clip present for the current buddy → the clips play back to back through one `<audio>` element.
4. Otherwise, if a grown-up enabled "Device voice fallback" **and** the probe verified `speechSynthesis` on this device → system voice.
5. Otherwise → state `failed`, console error `[speech] no voice for "..."`, and the bubble alone.

Rules enforced by tests: a new line replaces the current one (rapid presses never overlap); identical lines within 600 ms are deduped (re-renders); leaving a screen or pressing Stop cancels speech; "Voice: Off" or "Sound: Off" skips speech. A multi-sentence reply (a joke, counting) is one utterance, so its clips can never play together, with an optional pause between sentences. While the buddy speaks, music, songs and sound effects are ducked so the words stay clear. The mouth moves only between the real `playing` and `ended` events: **approximate lip-sync, not phoneme-accurate.**

Why `<audio>` and not Web Audio for clips: in the Chromium probe, `fetch()` of bundled files from `file://` is blocked, so Web Audio cannot decode clips without it; `<audio>` plays MP3 from bundled files fine.

## Adding a line

Add it to `src/core/responses.ts` (or `UI_LINES` / `TEMPLATE_LINES` in `src/core/phrases.ts`, or `src/core/talk.ts` for the Talk section), then `npm test` (the catalog tests fail if a `say()` is not covered), then `npm run voice:phrases` and `python scripts/gen-voice.py --model ... --piper piper --only-missing`.

Lines written by Amazon Bedrock go through a review step first; see [aws-bedrock.md](aws-bedrock.md).

## The songs

The Rhyme Room songs, the dance songs and the music are separate recorded audio (see `LICENSES.md`), not generated by this voice pipeline.
