# Zora Play: feature notes (assets, licences, limitations, commands)

## What exists
- **Rhyme Room**: 5 sung songs, two-column grid (`src/web/screens.tsx`, `rhymeArt.tsx`), sequence in `src/core/rhymeSequence.ts` (intro line, pause, song title, pause, song). The songs and their titles are recorded audio and are kept as they are.
- **Animal Sounds**: `src/core/animalSteps.ts` + `src/web/screensNew.tsx`. Order per question: intro (first question only) -> pause -> real recording -> pause -> "Who makes this noise?" -> options.
- **Dance Maker**: moves wave, jump, side step, turn around, hands up, bounce (clapping removed). Character states SIDESTEPPING, HANDSUP, BOUNCING are in `Milo.tsx`.
- **Buddies (avatars)**: `src/core/avatars.ts` registry (Zora the dino, Mimi the cat, Bruno the dog, Teddy the bear), each with its own name, tagline, skin colours and voice. One shared pose rig drives both the flat buddy (`Milo.tsx`) and the 3D buddy (`buddy3d.ts`). The choice is saved in `localStorage` key `zora.avatar` (invalid or blocked storage falls back to Zora).
- **Alphabets**: `src/core/alphabet.ts` (26 entries), art in `src/web/alphabetArt.tsx`, generic runner `src/core/stepSequence.ts`.
- **Band**: ten pressable instruments with synthesized sounds (`src/web/audio.ts`, `src/web/Band.tsx`). The earlier 8-step grid with Play, tempo and Clear controls was removed on request; its scheduler stays in `src/core/band.ts` (and its tests) for later.
- **Talk**: `src/core/talk.ts` (five conversation starters, each one voiced utterance) plus 16 phrase buttons that go through the parser.

## Animal recordings (all from Wikimedia Commons; licence = Public domain or CC0; sources in `public/audio/MANIFEST.json`)
dog (Dog.ogg), cat (Meow of a Siamese cat - freemaster2.wav), sheep (Sheep bleat.ogg), goat (Herd of goats bleating.ogg),
horse (Wiehern.ogg), rooster (Medium rooster crowing.ogg), hen (Hen announcing shes lain an egg.ogg),
frog (Grasfrosch Paarungsrufe.OGG), lion (Lion raring-sound1TamilNadu178.ogg), elephant (Elephant voice - trumpeting.ogg),
owl (Steinkauz.OGG). **11 of the 15 originally wanted.**
**Missing (no PD/CC0 real recording found): cow, duck, pig, monkey.** They are not in the game and are NOT replaced by other sounds.
The clips were chosen by file title/description and checked for duration/loudness only; nobody has listened to all of them yet.

## Voices and songs
- Dialogue: Piper `en_US-ljspeech-medium` (public-domain LJ Speech). The four buddies each get their own pitch and tempo profile (`voice/profiles.json`), so each speaks in its own voice. See [VOICE.md](VOICE.md).
- Songs and dance music: recorded audio made with Suno by the project owner (see `LICENSES.md`); the Rhyme Room songs have word timing files (`public/audio/rhymes/*.json`) for the karaoke highlighting. The home theme and Alphabets tune are synthesised by `scripts/gen-theme.py` and `scripts/gen-alphabet-tune.py`.
- Regenerate dialogue: `python scripts/gen-voice.py --model <model.onnx> --piper piper --only-missing` (use `--piper "<python> scripts/piper-shim.py"` if the piper-tts wheel is broken on macOS arm64).

## Not done / not verified
- No run on a physical Fire TV (only the Android TV emulator). The Vega simulator was never used for this version.
- Four animals missing (above). Some animal recordings have not been listened to.
- Real voice input is not available (see the README).

## Commands
```
npm test && npm run typecheck && npm run typecheck:ui
npm run build                 # dist/index.html
npm run build:firetv          # build and copy into the Fire OS app
cd firetv && ./gradlew assembleDebug     # Fire OS APK
# optional Vega OS path (not run for this version): npm run build:vega, then build the MiloVega project
```
