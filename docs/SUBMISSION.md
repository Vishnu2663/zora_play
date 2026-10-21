# Devpost submission draft: Zora Play

> Parts in [square brackets] need your own answer. Everything else is written from what is in this repository.

**Deadline:** Friday Oct 23, 2026, 12:00 pm PT.
**Primary track:** Fire TV (priority category: family entertainment).
**Mini challenge:** AWS Builder (Amazon Bedrock, Bedrock Guardrails, CloudWatch Logs).
Optional: Open Source mini challenge only if you add a separate open-source project or a contribution to a public repository; the main app alone does not count as "additional".

## Elevator pitch (under 200 characters)

Zora Play is a TV buddy for ages 3 to 8: pick Zora, Mimi, Bruno or Teddy, then dance, sing, play, make music and breathe calmly with the remote. Offline, ad-free, every line voiced and reviewed.

## About the project

**Inspiration.** TV time for young children is usually passive. We wanted a buddy that answers back: you tell it to dance and it dances, you say "faster" and it speeds up, you say you are sad and it slows down and offers to breathe with you. It also had to be safe to leave a small child alone with, so it never goes online and only says lines a grown-up has reviewed.

**What it does.** Four buddies (Zora the baby dragon, Mimi the kitten, Bruno the pup, Teddy the bear), each with its own look and voice. Dance Studio and Dance Maker, a Rhyme Room with five sung songs and karaoke highlighting, three games (Shape Match, Zora Says, Animal Sounds with 11 real recordings), Alphabets (26 letters), a Band with 10 instruments, a Talk section with conversation starters and 16 phrase buttons, Calm breaths, shiny-scale rewards, and a grown-ups Settings area with a wind-down timer. Everything is driven by the Fire TV remote.

**How we built it.** A platform-agnostic TypeScript core (intent parser, allowlist registry, session brain, character state machine, pure game engines, band sequencer) with 152 unit tests, and a React TV UI with our own D-pad focus navigation. The buddies are 3D models drawn with Three.js, with a flat fallback when a TV has no WebGL. Speech is recorded voice clips (263 lines for each of four buddies, generated offline with Piper); a small sequencing library keeps speech, songs and animal sounds from ever overlapping. The app is one self-contained web page that runs inside an Android WebView on Fire OS (`firetv/`, package `com.zoraplay.firetv`).

**How we used AWS.** The app on the TV never touches AWS. At build time we use Amazon Bedrock (Converse API, Amazon Nova Lite and Nova Pro) to write new jokes, riddles, animal facts, chat replies and bedtime lines as strict JSON. A Bedrock Guardrail checks the model's output and then every line again with `ApplyGuardrail`; our own local rules check length and words; a person approves or rejects each line. Of 45 generated lines, all 45 passed the guardrail, 28 were approved and 17 rejected by a human, and the 28 are in the app with voice. Bedrock model invocation logging writes every call to CloudWatch Logs. Details and evidence: `docs/aws-bedrock.md`.

**Challenges.** Honest voice: a Fire TV app cannot reliably receive microphone audio, so we built a clean `VoiceInputService` seam and shipped the Talk buttons instead of faking it. Making sound clear: one sound at a time, with music and effects ducked under speech. A weak-TV start-up: the opening scene's 3D pictures are drawn once and shipped as images so they appear at once. The guardrail's prompt-attack filter blocked our own generation prompts until we used `guardContent` (found through the invocation log).

**Accomplishments.** Every line the buddy says is voiced and reviewed. Works offline with no data stored. Contextual follow-ups ("faster", "again", "stop") feel natural. A real child-safety pipeline with a documented guardrail, a human gate and logs.

**What's next.** Real voice input once a supported API exists; more songs and buddies; on-device saving of scales with parental consent; Amazon Polly as an additional voice source.

**What we built during the hackathon window.** Zora Play was built entirely during the hackathon submission period; nothing in it existed before. Everything is new for this hackathon: the TypeScript core and React TV app, the four buddies and their voices, the 3D buddy models, the games, songs, Band and Alphabets, the Talk section, the Fire OS wrapper app, and the Amazon Bedrock content pipeline with its Guardrail, human review and CloudWatch logging.

**How we used AI tools.** We built Zora Play with AI help and say so openly. Kiro helped with the initial planning, folder structure and set-up, and Claude Code (on a paid plan, after Kiro's session limit was reached) then did the code, tests, debugging and documentation; ChatGPT helped with the song lyrics and rhymes, prompt writing and architecture ideas; Suno made the songs and music (the Rhyme Room songs and the dance songs); Amazon Nova (through Amazon Bedrock) wrote the buddy's extra lines. The owner directed the work, reviewed the code, edited the lyrics, and approved every AI-written line the buddy says. No code was copied from an earlier project.

**Built with:** Claude Code, Kiro, TypeScript, React, Three.js, Web Audio, esbuild, Android WebView (Fire OS), Gradle, Amazon Bedrock (Nova Lite, Nova Pro, Guardrails), Amazon CloudWatch Logs, Piper TTS, ffmpeg, Node test runner, Playwright.

## Testing instructions (for judges)

1. `npm install`, `npm test` (152 tests, no AWS needed).
2. `npm run build && npm run serve`, then open http://localhost:8080 and use arrows, Enter and Esc.
3. Fire OS: follow "Put it on Fire TV (Fire OS)" in the README (`npm run build:firetv`, `./gradlew assembleDebug`, `adb install`, launch `com.zoraplay.firetv/com.miloplay.tvbuddy.firetv.MainActivity`). An Android TV emulator also works.
4. AWS pipeline: see `docs/aws-bedrock.md` and `.env.example`. Judges do not need AWS to run the app: the approved lines are already in the repository.

## Product feedback (required, per tool)

### Fire OS / Android WebView (Fire TV)
- Used for: running the web app on Fire TV as a WebView app (`firetv/`), tested on an Android TV emulator (`FireTV_API30`).
- What worked: minSdk 22 covers Fire OS 5 and newer; bundling the whole app as assets and loading `file:///android_asset/index.html` works offline with no server.
- What needs work: the Android TV emulator has no WebGL, so 3D could not be checked there; we needed a flat fallback and had to learn it from a screenshot. A Fire TV simulator image with GPU support would help.
- Onboarding: no Fire-specific SDK was needed, because a WebView app can reuse the web build as it is. The slow part was tooling: finding the real launch activity name, pointing Gradle at the SDK, and learning that the emulator has no WebGL.
- Would build again: yes. Packaging a web app as a Fire OS WebView app is quick, works offline with no server, and runs on Fire OS 5 and newer.

### Android SDK, Gradle and adb
- Used for: building the APK and installing it on an emulator or a TV.
- What worked: `./gradlew assembleDebug` and `adb install -r` were reliable once `local.properties` pointed at the SDK.
- What needs work: `local.properties` written with backslashes on Windows made Gradle fail with a vague `Invalid file path`; forward slashes fixed it. Finding the launch activity name needed `cmd package resolve-activity`.

### AWS: Amazon Bedrock, Guardrails and CloudWatch Logs
- Used for: build-time generation and safety checking of the buddy's extra lines (see "How we used AWS").
- What worked: one Converse API across Nova Lite and Nova Pro; Guardrails as an independent safety layer (it blocked every unsafe test line and allowed every safe one); invocation logging made a hard-to-see problem easy to diagnose (an input token count of 0 plus `guardrail_intervened`).
- What needs work: the prompt-attack filter scans the whole user message by default, so it flagged our own instructions and blocked whole batches; the fix is `guardContent`, but nothing points you to it. A blocked call returns as a normal response, not an error. `ApplyGuardrail` calls do not appear in the invocation log. `apac.` model ids run in other regions than the one you call. Reading the log group needs extra `logs:` permissions.
- Onboarding: with credentials, model access and a guardrail in place, the first Converse call and the first `ApplyGuardrail` call worked straight away. The time went into understanding why the guardrail blocked our own prompts, which the invocation log and `trace=enabled` made clear.
- Would build again: yes. One API for several models, an independent safety layer, and a call log made a build-time content pipeline for a children's app both safe and easy to check.

### Kiro
- Used for: the start of the project: initial planning and project set-up. The owner designed the folder structure and added the first few functions with Kiro. When Kiro's session limit was reached, the owner moved the work to Claude Code, which did the rest of the building, testing and debugging (see the Claude Code entry).
- What worked: it built the starting point properly: a clean, well-organised project and folder structure, plus the first few working features, so the later work had a solid base to build on.
- What needs work: the session limit meant the work could not stay in Kiro, and moving to another tool meant carrying the plan across by hand.
- Onboarding: easy to start. The in-app tour of the application was enough to get going, and the tools were easy to find and use.
- Would build again: yes, for planning and project set-up. It was easy to start and built a clean structure, and we plan to use it again for the Kiroween hackathon.

### Claude Code (AI coding assistant)
- Used for: building, testing and debugging Zora Play by giving it plain-language tasks and checking its work. Typical requests were "find the bugs in the Talk section, fix them, test it and repeat", "make the intro avatars look like the in-app ones", "align the avatars and their names and check why they load slowly", "build it in the emulator", "check that AWS Bedrock works and that it writes logs", "test the AWS Builder pipeline several times", and "check the project against the hackathon requirements".
- How we worked: ask for a fix, make it prove the fix (run the tests, measure in the browser, take screenshots on the emulator, call real AWS), then repeat. The most useful habit was asking it to measure, not guess.
- Problems it helped solve:
  - **Talk section, overlapping and silent sounds.** It measured how many audio elements played at once in the browser and found never more than one, but found that 34 lines (every joke, the bedtime lines, animal facts and four Talk replies) had no voice clip at all, so they were silent. It regenerated the clips with Piper (after fixing a Windows encoding crash and a missing `espeak-ng`), and fixed stale follow-ups, a leftover pause setting, a replayed clip on resume, and sound effects that played over the voice. Result: 263 of 263 lines voiced for all four buddies and 152 of 152 tests passing.
  - **Intro buddies looked different from the app.** From screenshots it found squinting eyes, blur, and a flat drawing flashing in before the 3D picture. On the emulator it found that four buddies on screen all turned orange, because their SVG gradient ids clashed; it made the ids unique.
  - **Slow loading and misaligned names.** It timed the load in the browser, found the 3D pictures were drawn live at start-up, and replaced them with pre-drawn images. It also found the names sat about 115 px off because of a nested container.
  - **Emulator and build problems.** It found the app's launch activity name in our own script was wrong, fixed a Gradle `local.properties` path error, and installed and launched the APK on the Fire TV emulator.
  - **AWS Bedrock.** It tested the guardrail with safe and unsafe lines, then traced why jokes and talk replies were blocked 5 of 5 times: the High prompt-attack filter was flagging our own instruction text. The fix (`guardContent`) was confirmed in the CloudWatch invocation logs the owner pulled.
- What worked: it verifies instead of assuming, can drive a real browser, the emulator and the AWS CLI, and keeps long jobs running in the background. Writing documentation and the hackathon checklist from the real state of the repository saved a lot of time.
- What needs work: it makes mistakes and sometimes reports success too early. It once said all tests passed when one was failing (a re-run caught it), and one edit silently did not apply until the build hash showed no change. A long voice job ran past the command time limit and had to be moved to the background. We also had to keep telling it to confirm results with a test or a measurement before trusting them.
- Onboarding: when Kiro's session limit was reached, the owner moved to Claude Code and took a paid plan, which gave far more working time. It was useful from the first request: it read the existing project and worked from plain-language tasks, with no setup beyond opening the folder.
- Would build again: yes, as long as every claim is checked with a test, a measurement or a screenshot, which is how we used it here.

### ChatGPT (lyrics, prompts and architecture)
- Used for: the song lyrics and rhymes, writing and improving prompts (including the prompts for the AI coding tools and for Amazon Bedrock), and architecture ideas. The owner edited the lyrics and made the decisions.
- What worked: it gave good, usable prompts, and it was a strong tool for prompt writing and refinement (for the AI coding tools and for Bedrock). The owner uses it frequently, so it was quick and familiar to work with.

### Suno (songs and music)
- Used for: creating the music in the app: the five Rhyme Room songs (lyrics written with ChatGPT and edited by the owner) and the Dance Studio and Dance Maker songs.
- What worked: a finished, original, child-friendly song with sung vocals from a set of lyrics, in minutes, as an ordinary mp3 with the lyrics stored in the file's tag. That let one person ship five sung songs and two dance tracks that fit the buddy's cheerful style. The songs are used as one file each, with vocals and backing together, so they cannot drift apart.
- What needs work: there are no word timings, so we had to make our own for the karaoke highlighting: speech recognition (`faster-whisper`) finds the sung words and `scripts/prepare-songs.py` aligns them with the lyrics, placing any missed words between their neighbours. A song is not made to loop, so we cut the dance songs into one seamless loop with `scripts/cut-dance-song.py` (it finds the song's own beat, about 108 bpm, and crossfades the end into the start). The licence is easy to misread: under Suno's terms the user is generally a licensee of the output, not its owner, so we use the songs with a paid plan's commercial rights and do not offer them for reuse under the project's MIT license (see `LICENSES.md`).
- Onboarding: the files drop in as plain mp3, so connecting them to the app was straightforward; the extra work was timing, looping and reading the licence terms (above).
- Would build again: yes, for original songs in a children's app, as long as the licence terms are checked first and the word timing and looping are planned for.

### Piper TTS and ffmpeg (voice clips)
- Used for: generating the buddies' voice clips offline.
- What worked: `en_US-ljspeech-medium` is clear and its dataset is public domain; ffmpeg pitch and tempo profiles give four distinct buddies from one voice.
- What needs work: the `piper_lite.py` helper in this repo crashed on Windows reading the model's JSON (needed an explicit UTF-8); the espeak-ng phonemizer is GPL, which is noted in `public/audio/MANIFEST.json`.

### Other tools and libraries used
- **Three.js** (3D buddies): built the four buddies as 3D models with a flat fallback; good for a TV app, but there is no WebGL in the Android TV emulator, so 3D can only be checked in a desktop browser or on a real device.
- **React and TypeScript** (TV UI and core logic) and **esbuild** (bundles the whole app into one `index.html`): fast builds and a single self-contained file that the WebView loads from bundled assets.
- **Wikimedia Commons** (11 real animal recordings, public domain or CC0): sources and licenses are listed per file in `public/audio/MANIFEST.json`; four animals (cow, duck, pig, monkey) were left out because no suitable open recording was found.
- **Node test runner and Playwright** (152 unit tests; remote-key end-to-end and tour scripts): the unit tests run in about a second.
- **Android Studio SDK, Gradle and adb** and the **Android TV emulator**: see the Android entry above.

## Friction log (optional bonus, up to 10%)

| When | What happened | Impact | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|
| AWS generation | Guardrail prompt-attack filter (High) blocked our own instruction prompts, 5 of 5 attempts for jokes and chat replies | Empty batches, no error | High | Mark a small `guardContent` block so only that is checked on input | Document `guardContent` for build-time prompts, or let the filter be limited to user-supplied text |
| AWS logging | `ApplyGuardrail` checks are missing from the model invocation log | No cloud record of the safety checks | Medium | Keep our own `safety-report.json` | Log guardrail calls too |
| AWS logging | The IAM user that made the calls could not read the log group | Could not verify logging from the CLI | Low | Read it in the console | Say which `logs:` actions are needed in the logging setup page |
| AWS models | `apac.` model ids run in other regions than the one called | Data residency surprise | Low | Read `inferenceRegion` in the log | Show the serving region in the console model list |
| Windows tooling | Git Bash rewrites `/aws/...` arguments into a Windows path | AWS CLI log commands failed | Low | `MSYS_NO_PATHCONV=1` | Mention it in the CLI docs for Windows |
| Android build | Backslashes in `local.properties` gave `Invalid file path` in Gradle | Build failed | Low | Use forward slashes | Print which property is bad |
| Fire TV testing | The Android TV emulator has no WebGL | 3D buddies could not be checked | Medium | Flat fallback buddy | A Fire TV emulator image with GPU support |
| Voice tooling | `piper_lite.py` crashed on Windows (JSON read as cp1252) | Voice generation stopped | Low | Read the file as UTF-8 | Always pass an encoding when reading JSON |

## Checklist

- [ ] GitHub repo (this folder is not a git repository yet): public with the MIT license visible, or private and shared with `testing@devpost.com` and the Amazon reviewers listed on the hackathon page (each person must accept the invitation within 7 days)
- [ ] Demo video under 3 minutes, public on YouTube or Vimeo, in English, recorded on a real Fire TV or a Fire TV/Vega simulator (lead with the best material; no copyrighted music)
- [ ] Screenshots from the device or emulator
- [ ] Text description (above); the "built during the window" paragraph is already filled in
- [ ] Product feedback for every tool (Fire OS, Android SDK, AWS, Kiro, Claude Code, ChatGPT, Suno, Piper), with the bracketed answers filled in
- [ ] Tracks and mini challenges selected: Fire TV, AWS Builder
- [ ] Optional: feature requests and the friction log (up to 10% bonus)
- [ ] Redact the AWS account id in any log screenshot
