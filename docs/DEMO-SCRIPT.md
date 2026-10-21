# Demo video script (about 2 min 50 s, shot by shot)

Target: **about 2:50** (the limit is 3:00, so there is a safety margin), public on YouTube or Vimeo, English voice-over, no music except the app's own songs and voices.
Judges need not watch past 3:00, so the strongest material is first and every hackathon requirement is shown or said.

## What the rules need, and where this script covers it

| Requirement | Where |
|---|---|
| Shows the project working on a real Fire TV (or the Fire TV / Vega simulator) | 0:00-0:08 device proof, then the whole video is recorded from the stick |
| Primary track: Fire TV | 0:00 (said), whole demo |
| Open Source mini challenge: TV Audio Flow library | 1:44-2:03 |
| AWS Builder mini challenge: Amazon Bedrock | 2:03-2:28 |
| No third-party logos / trademarks, no copyrighted music | Do not show the Fire TV Home screen (see "Before you record"); only the app's own audio |
| Honest about AI help and sources | 2:46 end card + video description |
| Links to the repos | End card + video description |

## Before you record (do all of this first)

1. **Device:** the real Fire TV Stick, the latest build installed (`com.zoraplay.firetv`, version 0.4.1). On this 1 GB stick the buddies are the lightweight 2D versions; say so once (0:08). Do not claim Vega support.
2. **Keep the Fire TV Home screen out of the video.** It shows other companies' logos. Launch the app from your computer so the first frame is already Zora Play:
   `adb shell am start -n com.zoraplay.firetv/com.miloplay.tvbuddy.firetv.MainActivity`
3. **Device proof shot (0:00):** film the stick and the remote on the table with your phone (3 seconds), then show Settings > My Fire TV > About (model name). Check nothing personal (name, email, serial) is on screen first.
4. **Capture the picture and the sound together.** Best: an HDMI capture card on the Mac, recorded with QuickTime (File > New Movie Recording, pick the capture card as camera and microphone). Alternatives: film the TV with a phone on a tripod, or `adb shell screenrecord` (picture only, no sound; add voice-over later).
5. **Voice-over:** record it separately after the picture, listening to the app's own sound so you do not talk over the buddy's voice. Speak slowly. One take per scene is fine.
6. **Settings:** Volume at Medium, Wi-Fi connected until 2:28, TV notifications off, remote batteries fresh. Reset the app (Settings > hold OK > reset) so the shelf is empty and the first run looks clean.
7. **AWS and library clips (record on the Mac, before the TV part):**
   - Pre-run `npm run bedrock:generate` once so no live call can fail on camera, then record `npm run bedrock:check`, the safety report, `npm run bedrock:review` and the CloudWatch log.
   - **Blur the AWS account id** and any key or profile name. No credentials in the video.
   - Record `cd packages/tv-audio-flow && npm run check` (typecheck, tests, examples pass).
8. **Rehearse once**, with a stopwatch. Cut anything that goes past 2:50.

## The script

Narration is written to be read at a calm pace (about 130 words a minute). Press keys slowly so viewers can follow the focus ring.

### 0:00-0:08  Device proof and hook
- **Show:** phone shot of the stick and remote, then Settings > My Fire TV > About with the model name, then cut to the app launching.
- **Say:** "This is Zora Play, a TV buddy for children aged three to eight, on a real Fire TV Stick. No account, no ads, and it works offline."

### 0:08-0:20  Opening scene
- **Show:** the splash, then the opening: the four buddies with their names, then the Home screen with the buddy greeting.
- **Say:** "Four buddies: Zora, Mimi, Bruno and Teddy, each with its own look and voice. On this entry-level stick they are light 2D characters; stronger devices show them in 3D."

### 0:20-0:30  Home and My Buddy
- **Keys:** Left/Right/Down across the tiles (show the focus glow), OK on **My buddy**, pick **Mimi**, hear her introduce herself, pick **Zora** again, Back.
- **Say:** "Everything is driven by the remote. Pick a buddy and it introduces itself."

### 0:30-0:48  Dance Studio and Dance Maker
- **Keys:** Dance > **Wiggle**, **Faster** twice (the flames light and the music speeds up), **Stop** (instant), **Again**. Then **Dance Maker**: add **Wave**, **Jump**, **Turn Around**, **Hands Up**, press **Go!**.
- **Point out:** the step pictures are the selected buddy itself, and **Turn Around** is a real turn.
- **Say:** "Faster really speeds up the dance and the music, and stop is instant. In Dance Maker, children pick four moves and watch their own dance."

### 0:48-1:08  Rhyme Room (the star feature)
- **Keys:** Sing > **Dragon Tap** (or March). Let the intro line and title play, then the song.
- **Show:** the karaoke lyrics highlight word by word; the buddy claps on "clap", reaches on "reach up", sways on "sway", and every few lines does its own special move: **Zora flies a loop** (for the others: Mimi somersaults, Bruno chases his tail, Teddy gives a bear hug).
- **Say:** "In the Rhyme Room, songs play with word highlighting, and the buddy acts out the lyrics: clapping, reaching, swaying. Every few lines it does its own special move. Zora flies a loop."

### 1:08-1:20  Band
- **Keys:** Band > press **Piano**, **Drum**, **Guitar**, **Trumpet**, **Maracas** one after another.
- **Show:** each instrument plays its own sound and the buddy plays it its own way (hands on the keys, drumming, strumming, blowing, shaking).
- **Say:** "In the Band, every instrument has its own sound, and its own way of being played."

### 1:20-1:32  Talk
- **Keys:** Talk > **Tell me a joke** (question, pause, answer, laugh), then **I'm sad**.
- **Show:** the buddy turns kind and offers calm breaths.
- **Say:** "Talk uses fixed, reviewed, voiced lines: an easy joke, and a gentle answer when a child is sad."

### 1:32-1:44  Play, alphabets, calm
- **Keys:** Play > **Zora Says** (when it says "spin", the buddy turns on the spot), then **Animal Sounds** (real recordings), win once so a shiny scale lands on the shelf. Two-second cut-aways: **Alphabets** (a letter with the song) and **Calm breaths**.
- **Say:** "Games are short and forgiving, and winning earns a shiny scale. There is also an alphabet tune and calm breathing."

### 1:44-2:03  Open Source mini challenge: TV Audio Flow
- **Show (Mac):** the library folder `packages/tv-audio-flow` on GitHub: the MIT LICENSE, README, tests, examples; then the terminal: `npm run check` ending with all tests passing.
- **Show (TV):** start a rhyme in the Rhyme Room, press **Back**: the song, the voice and the animation stop at once.
- **Say:** "For the Open Source challenge we published TV Audio Flow, an MIT library for TV apps. Only one sound sequence plays at a time, and Back cancels it instantly. It has tests, examples and a README, and it drives the Rhyme Room."

### 2:03-2:28  AWS Builder mini challenge: Amazon Bedrock
- **Show (Mac):** `npm run bedrock:generate` output (pending lines), then `npm run bedrock:check`: the guardrail blocks an unsafe test line and passes a safe one; the safety report; `npm run bedrock:review` where a person approves a line; the CloudWatch invocation log (account id blurred); the approved line in `src/core/generatedLines.ts`.
- **Show (TV):** the buddy says an approved line.
- **Say:** "For AWS Builder, Amazon Bedrock writes new lines at build time only. A Bedrock Guardrail checks every line, a person approves each one, and CloudWatch logs every call. Forty-five lines were generated, twenty-eight approved. The TV never calls AWS."

### 2:28-2:46  Privacy, offline, goodbye
- **Keys:** hold **OK** on Settings for 3 seconds: the grown-ups panel (sound, volume, speech, motion, wind-down timer). Optionally show Network settings with Wi-Fi off for 2 seconds, then the app still running. Press **Back** twice on Home: "Bye bye! See you soon!" (wait until the sentence finishes).
- **Say:** "No account, no ads, nothing saved, and no internet needed. Zora Play: talk, play, dance, learn."

### 2:46-2:50  End card (text only, 4 seconds)
- Zora Play · Fire TV · repos: `github.com/Vishnu2663/zora_play_final` and the TV Audio Flow repo link.
- Small print: "Songs made with Suno (paid plan), lyrics written with ChatGPT. Built with AI assistance. Amazon Bedrock used at build time only."

## Video description (paste into YouTube / Vimeo)

Zora Play is an offline, ad-free buddy for children aged 3 to 8 on Amazon Fire TV (Fire OS web app). Tested on a Fire TV Stick (Fire OS 7).
Mini challenges: Open Source (TV Audio Flow, MIT) and AWS Builder (Amazon Bedrock, build time only; nothing from AWS runs on the TV).
App repo: https://github.com/Vishnu2663/zora_play_final
TV Audio Flow repo: [add the public library link]
Honest notes: songs were made with Suno on a paid plan and the lyrics were written with ChatGPT; the project was built with AI coding assistance; the audio in the video is the app's own songs and voices.

## Checklist after recording

- Length is about 2:50 and under 3:00 (check the exported file, not the timeline).
- The app is visible on the Fire TV from 0:08 to 1:44 and again at 2:28.
- No Netflix / Prime / YouTube or other logos anywhere; no other music; no AWS account id, key or profile name; no personal data on screen.
- Every feature shown actually worked on the device you recorded.
- Video is **public** (or unlisted, if the form allows it), the link opens in a private window, and the repo links are in the description.
- Captions are on, so judges can follow without sound.
