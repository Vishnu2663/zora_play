# Dependency & content license inventory

## Runtime (bundled into dist/index.html)
| Package | Version | License |
|---|---|---|
| react | ^19.2 | MIT |
| react-dom | ^19.2 | MIT |
| scheduler (via react-dom) | - | MIT |
| tv-audio-flow (audio sequencing, vendored in `packages/tv-audio-flow`) | 0.1.0 | MIT (this project) |

## Build / test only (not shipped)
| Tool | License |
|---|---|
| esbuild | MIT |
| typescript | Apache-2.0 |
| Node.js test runner | MIT (Node.js) |
| Playwright (e2e) | Apache-2.0 |
| @aws-sdk/client-bedrock-runtime (content pipeline, devDependency, never bundled) | Apache-2.0 |

## Vega host shell (installed in the Vega project, not this repo)
| Package | License |
|---|---|
| @amazon-devices/webview, Vega SDK | Amazon terms — see the Vega SDK license |

## Content
- **Characters, artwork, icons, the buddies, logo and banner:** original to this project (MIT).
- **Dialogue, jokes and the buddies' voices:** all lines are written for this project. The voice clips are generated offline with Piper (MIT) and the `en_US-ljspeech-medium` model (LJ Speech, public domain), then pitch-shifted per buddy with ffmpeg. See `public/audio/voice/*/MANIFEST.json`.
- **AI-written lines (optional, `src/core/generatedLines.ts`):** jokes, riddles, animal facts, chat replies and bedtime lines written by an AI model through Amazon Bedrock at build time, checked by a Bedrock Guardrail and local rules, and reviewed and approved by the project owner before they were added. Each line's model, region, date and prompt version are kept in `voice/generated/*.json`.
- **Rhyme Room songs and dance music** (`public/audio/rhymes/*.mp3`, `public/audio/music/dance-*.mp3`): generated with **Suno** by the project owner on a **paid Suno plan** (commercial-use rights under Suno's terms; Suno's terms say the user is generally a licensee rather than the owner of the output). The lyrics were written with **ChatGPT** and edited by the owner. These files are not offered for reuse under the project's MIT license.
- **Home theme and Alphabets tune:** synthesised by `scripts/gen-theme.py` and `scripts/gen-alphabet-tune.py` (no samples).
- **Animal sounds:** third-party recordings with their licenses listed per file in `public/audio/MANIFEST.json`.
- **Sound effects:** synthesised at runtime.
