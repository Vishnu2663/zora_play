# Build & run workflow

## Folder layout

One repository holds everything:

```
src/            the app (TypeScript + React)             -> bundled into dist/index.html
public/         audio (voice clips, songs, animals), intro pictures -> copied into dist/
firetv/         Fire OS wrapper app (Android WebView)    -> package com.zoraplay.tv
scripts/        build, copy, voice and song generators, Bedrock pipeline, tests
vega/           reference WebView shell for the optional Vega OS path
```

## How the web app gets onto a Fire TV

1. `src/` is bundled by esbuild into **one self-contained file**, `dist/index.html` (JS and CSS inlined, no network), and `public/` is copied next to it (`dist/audio`, `dist/intro`).
2. `npm run build:firetv` copies `dist/` into `firetv/app/src/main/assets/` (and checks every file was copied correctly).
3. `firetv/` is a thin Android app: one `MainActivity` with a WebView that loads `file:///android_asset/index.html`. It has no INTERNET permission. It turns the Back key into `Escape` and Play/Pause into `MediaPlayPause` for the page, shows a native splash until the page has painted, and pauses audio when the app leaves the screen.
4. Gradle builds the APK; `adb install` puts it on a Fire TV or an emulator.

## After every change

```bash
npm test                          # unit tests (152)
npm run typecheck && npm run typecheck:ui
npm run build:firetv              # build dist/ and copy it into the Fire OS app
                                  # prints: synced build 0.1.0 · <hash>
cd firetv
./gradlew assembleDebug           # needs local.properties with sdk.dir (forward slashes on Windows)
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.zoraplay.tv/com.miloplay.tvbuddy.firetv.MainActivity
```

`bash scripts/firetv-run.sh <fire-tv-ip>` runs the same steps on a Mac or Linux machine and finds the TV on your Wi-Fi if you give no IP. A Fire TV needs ADB debugging on (Settings > My Fire TV > Developer Options). An Android TV emulator also works.

**Confirm on the TV:** open Settings (hold OK for 3 s). The bottom line says `Build 0.1.0 · <hash>`. It must match the hash `build:firetv` printed. If it shows an older hash, the old APK is still installed.

## Optional quick loop (no TV)

```bash
npm run build && npm run serve   # http://localhost:8080 — arrows/Enter/Esc = remote
```

Open the page with `?2d` to force the flat buddy, as a TV without WebGL would show.

## Re-making the generated assets

| Asset | When | Command |
|---|---|---|
| Voice clips | a line was added or changed | `npm run voice:phrases` then `python scripts/gen-voice.py --model ... --piper piper --only-missing` (see [VOICE.md](VOICE.md)) |
| Opening-scene pictures (`public/intro/*.png`) | the 3D buddies or their moves changed | `python scripts/export-intro.py` (steps are in the file header) |
| New AI-written lines | you want more jokes, facts and so on | the Bedrock pipeline in [aws-bedrock.md](aws-bedrock.md) |

## Optional: Vega OS

The same `dist/index.html` can be loaded by a Vega OS project made from the `vegaWebview` template. `npm run build:vega` copies it into a sibling `MiloVega` folder (set `VEGA_PROJECT=/path/to/MiloVega` if it is somewhere else), and `npm run vega:check` confirms the `.vpkg` contains the latest build. That path was set up earlier and **has not been run for this version**; the shipped target is Fire OS.

## What was verified where

| Check | Result | Where |
|---|---|---|
| Unit tests | 152 of 152 pass | this machine |
| Strict typecheck (core and UI) | pass | this machine |
| Web build | pass | this machine |
| Every screen, the Talk section, the 3D buddies, the intro | checked by hand | desktop Chromium with WebGL |
| `./gradlew assembleDebug`, install, launch, intro and home screen | pass | Android TV emulator `FireTV_API30` (no WebGL, so the flat buddy) |
| Bedrock pipeline (generate, guardrail check, logging) | works; details in [aws-bedrock.md](aws-bedrock.md) | real AWS account, `ap-south-1` |
| Remote-only end-to-end (`npm run e2e`) and tour (`npm run tour`) | scripts exist; not re-run for this version | — |
| Running on a physical Fire TV | **not run** | — |
| Running on the Vega Virtual Device | **not run** | — |

## Notes about the Fire OS wrapper

- The WebView has JavaScript and DOM storage on (the chosen buddy is saved in local storage) and `mediaPlaybackRequiresUserGesture` off, so the buddy can speak without an extra tap.
- `?perf=nomilo,nosky,noglow,noanim` can be added to the start URL to find what is slow on a weak TV stick.
- The Android resource and class names still carry the project's working name (`com.miloplay.tvbuddy.firetv`, `Theme.Milo`); the app name shown on the TV is "Zora Play".
