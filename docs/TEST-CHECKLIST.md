# Manual TV test checklist

Run on a **real Fire TV** and, if possible, an Android TV / Fire TV emulator. Tick each item; note the device and build at the top. The emulator has no WebGL, so it shows the flat buddy; a real Fire TV should show the 3D buddies.

Device: ______  Fire OS / Android version: ______  Build (Settings, bottom line): ______  Date: ______

## Startup
- [ ] The native splash shows, then the opening scene: four buddies (Zora, Mimi, Bruno, Teddy), each with its name centered below it
- [ ] The buddies appear together (no one pops in late) and the scene ends by itself or on any key
- [ ] The chosen buddy waves and says a welcome line; the Dance tile has the yellow focus ring
- [ ] Launch with Wi-Fi off: everything still works (offline startup)

## Navigation
- [ ] D-pad moves between all the Home tiles (Dance, Sing, Play, Alphabets, Band, Talk) and the small buttons (My buddy, What can I do?, Calm breaths, Settings) with no tile skipped
- [ ] Select opens the focused item
- [ ] Back from any screen returns to its parent (games → Play, Dance Maker → Dance Studio, others → Home)
- [ ] Focus returns to the tile you left from
- [ ] Back on Home shows "Press Back again to leave"; a second Back leaves the app

## My buddy
- [ ] Each of the four buddies can be chosen; the buddy introduces itself by name in its own voice
- [ ] The choice is remembered after closing and reopening the app
- [ ] The picker's pictures and the Home buddy look the same (same colours, same eyes)

## Dance
- [ ] Entering Dance Studio starts a dance with music
- [ ] Each style looks different (Robot is stepped, Silly squashes, Slow sways)
- [ ] + / − change the flames AND the visible animation speed AND the music tempo
- [ ] Stop freezes the buddy and silences the music immediately
- [ ] Again repeats the last style
- [ ] Back to Home stops the dance and the music

## Audio and voice
- [ ] The buddy's voice is clear and never plays two lines at once
- [ ] Music, songs and sound effects get quieter while the buddy speaks, then return
- [ ] Sound Off in Settings silences everything; Voice Off still shows the speech bubble; Volume changes loudness
- [ ] Settings > Audio diagnostics passes (or says clearly what failed)

## Sing (Rhyme Room)
- [ ] Each of the 5 songs plays with karaoke highlighting
- [ ] Pause / Resume / Restart / Stop work
- [ ] The remote's Play/Pause key pauses and resumes
- [ ] When a song ends the buddy cheers, and the next song starts about 2 seconds later
- [ ] Leaving the room stops the song

## Games
- [ ] Shape Match: wrong answer → gentle retry; two misses → hint glow; 5 rounds → finish screen + scale
- [ ] Zora Says: the buddy performs, then it's your turn; rounds 4–5 have two moves; "Show me again" replays
- [ ] Animal Sounds: a real recording plays each round; "Hear it again" works; clue text shows with sound off
- [ ] Dance Maker: 4 slots fill; Undo removes the last; Go performs them in a loop with the current slot highlighted
- [ ] "Play again" restarts; Back returns with focus restored

## Alphabets and Band
- [ ] Alphabets: letters appear one at a time with a picture, spoken to the end; the speed control changes the pace
- [ ] Band: each of the 10 instruments makes its own sound and the buddy reacts; Back leaves the screen and stops the sounds

## Talk
- [ ] Each of the 5 conversation starters is spoken in full, in order, with nothing overlapping
- [ ] "Can you count to five with me?" counts slowly and evenly
- [ ] "Tell me a joke": question, pause, answer, then a laugh (every part is voiced)
- [ ] Pressing a different button in the middle of a reply replaces it cleanly: no leftover follow-up, no joke answer over the new line
- [ ] Dance! → Faster! → Stop! → Again! behaves in context
- [ ] I'm sad → a supportive buddy with Calm breaths / Play buttons in the bubble; Back dismisses
- [ ] Go to sleep → the buddy sleeps; Dance! is refused; Wake up! wakes it
- [ ] Say hello, Surprise me!, What can you do? all respond

## Settings (grown-ups)
- [ ] A quick press shows "hold OK for 3 seconds"; holding 3 s opens Settings
- [ ] Gentle motion reduces movement noticeably
- [ ] Wind-down timer (set 15 min, or temporarily edit for testing): sky turns to night, Play is dimmed, the lullaby is suggested
- [ ] Reset session clears scales
- [ ] The developer console appears on Talk only when enabled and is clearly labelled

## Voice input
- [ ] No listening indicator appears anywhere (voice input is not supported in this build)
- [ ] Settings explains the limitation

## Robustness
- [ ] Mash buttons quickly during a game: no crash, no double scoring
- [ ] Press the Home button and return: audio stops while away, the app resumes cleanly
- [ ] Leave the app idle 10 minutes: the buddy returns to idle, no runaway audio
- [ ] Memory stays flat over a 15-minute session
