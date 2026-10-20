import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAND_ROWS, BAND_STEPS, BAND_TEMPOS, BandScheduler, INSTRUMENTS, INSTRUMENT_TUNE, countNotes, emptyPattern, instrumentNote,
  stepSeconds, toggleCell,
} from '../src/core/band.ts';

test('pattern: 4 rows x 8 steps, toggling is immutable and bounds-safe', () => {
  const p = emptyPattern();
  assert.equal(p.length, BAND_ROWS.length);
  assert.ok(p.every((r) => r.length === BAND_STEPS && r.every((v) => !v)));
  const q = toggleCell(p, 2, 5);
  assert.equal(q[2][5], true);
  assert.equal(p[2][5], false, 'original untouched');
  assert.equal(countNotes(q), 1);
  assert.equal(toggleCell(q, 2, 5)[2][5], false);
  assert.equal(toggleCell(q, 9, 0), q, 'out of range is ignored');
  assert.equal(toggleCell(q, 0, 8), q);
});

test('scheduler hands out each step once, on the beat, with the right rows', () => {
  let p = toggleCell(emptyPattern(), 0, 0); // kick on 1
  p = toggleCell(p, 1, 2); // clap on 3
  p = toggleCell(p, 3, 2); // shaker on 3
  const s = new BandScheduler(120); // step = 0.25 s
  assert.equal(stepSeconds(120), 0.25);
  s.start(10);
  const a = s.due(10, 0.3, p);
  assert.deepEqual(a.map((h) => h.step), [0, 1]);
  assert.deepEqual(a.map((h) => h.at), [10, 10.25]);
  assert.deepEqual(a[0].rows, ['kick']);
  const b = s.due(10.25, 0.3, p);
  assert.deepEqual(b.map((h) => h.step), [2]);
  assert.deepEqual(b[0].rows, ['snare', 'shaker']);
  assert.deepEqual(s.due(10.25, 0.3, p), [], 'nothing is handed out twice');
});

test('scheduler loops forever through 8 steps and reports the playhead', () => {
  const s = new BandScheduler(120);
  s.start(0);
  assert.equal(s.currentStep(0.01), 0);
  assert.equal(s.currentStep(0.26), 1);
  assert.equal(s.currentStep(1.99), 7);
  assert.equal(s.currentStep(2.01), 0, 'wraps after 2 s at 120 bpm');
  assert.equal(s.loopsDone(4.5), 2);
  const hits = s.due(0, 4.4, emptyPattern());
  assert.deepEqual(hits.map((h) => h.step), Array.from({ length: 18 }, (_, i) => i % 8));
  assert.equal(hits[17].absStep, 17);
});

test('editing the pattern while playing is heard on upcoming steps', () => {
  const s = new BandScheduler(120);
  s.start(0);
  for (let t = 0; t < 0.6; t += 0.05) s.due(t, 0.1, emptyPattern()); // polled like the audio pump does
  const edited = toggleCell(emptyPattern(), 0, 3);
  const step3 = s.due(0.7, 0.1, edited); // step 3 is due at 0.75
  assert.deepEqual(step3.map((h) => [h.step, h.rows.join()]), [[3, 'kick']]);
});

test('tempo change keeps the place in the loop', () => {
  const s = new BandScheduler(120);
  s.start(0);
  s.due(0, 0.1, emptyPattern());
  assert.equal(s.currentStep(0.6), 2);
  s.setBpm(0.6, 60); // half speed: 0.5 s per step
  assert.equal(s.currentStep(0.6), 2);
  assert.equal(s.currentStep(1.05), 3, 'step 3 started at 0.85 and lasts 0.5 s');
  assert.equal(s.currentStep(1.5), 4);
  assert.equal(BAND_TEMPOS.length, 3);
  assert.ok(BAND_TEMPOS[0].bpm < BAND_TEMPOS[1].bpm && BAND_TEMPOS[1].bpm < BAND_TEMPOS[2].bpm);
});

test('late steps (throttled tab) are skipped, not replayed in a burst', () => {
  const s = new BandScheduler(120);
  s.start(0);
  const hits = s.due(30, 0.1, emptyPattern());
  assert.ok(hits.length <= 2, `got ${hits.length}`);
  assert.ok(hits.every((h) => h.at >= 29.9));
  s.stop();
  assert.deepEqual(s.due(31, 1, emptyPattern()), []);
  assert.equal(s.currentStep(31), -1);
});

/* ---- integration with the app (Zora Play) ---- */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { segment } from '../src/core/phrases.ts';
import { AudioService } from '../src/web/audio.ts';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

test('band is a separate section: Home tile, route, back goes home, screen registered', () => {
  assert.match(src('src/web/screens.tsx'), /fkey="home-band"[\s\S]*ctx\.go\('band'\)/);
  const app = src('src/web/App.tsx');
  assert.match(app, /band: 'home'/); assert.match(app, /band: Band/);
  assert.match(src('src/core/types.ts'), /\| 'band'/);
  assert.match(app, /&& !audio\.bandPlaying/, 'the dance beat does not play on top of the band');
});

test('band spoken line is in the catalog and recorded for every avatar', () => {
  const seg = segment('Press an instrument to play it!');
  assert.deepEqual(seg.missing, []);
  const V = JSON.parse(src('public/audio/voice/clips.json')).voices as Record<string, Record<string, unknown>>;
  for (const a of ['dino', 'cat', 'dog', 'bear']) for (const p of seg.phrases) assert.ok(V[a][p.id], `${a} voice`);
});

test('AudioService band: plays on a silent clock without Web Audio, tracks the playhead, stops cleanly', async () => {
  const a = new AudioService();
  let p = toggleCell(emptyPattern(), 0, 0);
  p = toggleCell(p, 2, 4);
  assert.equal(a.bandStep(), -1);
  a.startBand(() => p, 2);
  assert.equal(a.bandPlaying, true);
  await new Promise((r) => setTimeout(r, 120));
  const s1 = a.bandStep();
  assert.ok(s1 >= 0 && s1 < BAND_STEPS);
  a.setBandTempo(0);
  assert.equal(a.bandPlaying, true, 'tempo change keeps playing');
  a.stopAll();
  assert.equal(a.bandPlaying, false); assert.equal(a.bandStep(), -1);
});

test('starting a rhyme or the Band stops the other; leaving a screen stops the band (go() calls stopAll)', () => {
  const audio = src('src/web/audio.ts');
  assert.match(audio, /startBand\([\s\S]*?this\.stopBand\(\);[\s\S]*?this\.stopLoop\(\)/);
  assert.match(audio, /stopAll\(\) \{[\s\S]*?this\.stopBand\(\)/);
  assert.match(src('src/web/App.tsx'), /speech\.cancel\('navigate'\);[\s\S]*?audio\.stopAll\(\)/);
});

test('Fire OS note: master output goes through a MediaStream <audio> element with a direct fallback', () => {
  const audio = src('src/web/audio.ts');
  assert.match(audio, /createMediaStreamDestination/);
  assert.match(audio, /node\.connect\(c\.destination\)/);
});

test('instruments: ten of them, each press plays the next note of the tune and wraps round', () => {
  assert.equal(INSTRUMENTS.length, 10);
  assert.equal(new Set(INSTRUMENTS.map((i) => i.id)).size, 10);
  const n = INSTRUMENT_TUNE.length;
  assert.equal(instrumentNote('piano', 0), INSTRUMENT_TUNE[0]);
  assert.equal(instrumentNote('piano', 3), INSTRUMENT_TUNE[3]);
  assert.equal(instrumentNote('piano', n), INSTRUMENT_TUNE[0], 'wraps');
  assert.equal(instrumentNote('xylo', 1), INSTRUMENT_TUNE[1] * 2, 'xylophone an octave up');
  assert.equal(instrumentNote('guitar', 2), INSTRUMENT_TUNE[2] / 2, 'guitar an octave down');
});

test('band screen: instruments only (no step grid), three columns, every instrument has art and a sound', () => {
  const band = src('src/web/Band.tsx'); const art = src('src/web/instrumentArt.tsx'); const css = src('src/web/styles.css'); const audio = src('src/web/audio.ts');
  assert.ok(!/BAND_ROWS|toggleCell|Fill in the squares/.test(band), 'the fill-in-squares grid is gone');
  assert.match(css, /\.band-inst \{ grid-template-columns: repeat\(3, 1fr\)/);
  for (const i of INSTRUMENTS) {
    assert.match(art, new RegExp(`\\b${i.id}: <g>`), `${i.id} has a picture`);
    assert.match(audio, new RegExp(`case '${i.id}'`), `${i.id} has a sound`);
  }
});

test('dance maker: action figures animate on hover/focus and the speed row is laid out in a grid', () => {
  const css = src('src/web/styles.css'); const icons = src('src/web/icons.tsx'); const screens = src('src/web/screens.tsx');
  assert.match(icons, /className="f-armR"/);
  for (const m of ['wave', 'jump', 'sidestep', 'turn', 'handsup', 'bounce']) assert.match(css, new RegExp(`\\.move-btn:hover \\.demo-${m}`), `${m} animates on hover`);
  assert.match(css, /\.move-btn:focus \.demo-wave/, 'and on remote focus');
  assert.match(css, /\.maker-controls \{ display: grid/);
  assert.match(screens, /className="row maker-controls"/);
});

test('home theme: looping music file exists, is licensed in the manifest and is started for Home only', () => {
  const f = join(root, 'public/audio/music/home-theme.mp3');
  assert.ok(readFileSync(f).length > 50_000, 'real audio file');
  const man = JSON.parse(src('public/audio/MANIFEST.json')).files as { path: string; license: string; status: string }[];
  const rec = man.find((m) => m.path === 'music/home-theme.mp3');
  assert.ok(rec && /CC0/.test(rec.license) && rec.status === 'ready');
  const audio = src('src/web/audio.ts'); const app = src('src/web/App.tsx');
  assert.match(audio, /el\.loop = true/); assert.match(audio, /audio\/music\/home-theme\.mp3/);
  assert.match(audio, /stopAll\(\) \{\s*this\.stopTheme\(\)/, 'Stop/leaving stops the theme');
  assert.match(audio, /this\.ducked \? 0\.22 : 1/, 'quieter while someone speaks');
  assert.match(app, /if \(sc === 'home'\) return welcomeDoneRef\.current \? 'home' : null;/, 'Home theme only after the welcome line ended');
  assert.match(app, /if \(sc === 'alphabets'\) return 'alphabet';\s*return null;/, 'Alphabets has its own tune; every other section has no background track');
  assert.match(app, /audio\.enforceTheme\(desiredTrack\(\)\)/, 'checked on every clock tick');
  assert.match(app, /speech\.whenIdle\(\(\) => setWelcomeDone\(true\), 7000, 1200\)/, 'music waits for the spoken welcome to finish');
});

test('home theme: starts, ducks and stops through AudioService', async () => {
  const made: { src: string; loop: boolean; paused: boolean; volume: number; currentTime: number }[] = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    src = ''; loop = false; paused = true; volume = 1; currentTime = 0; preload = ''; error = null;
    constructor() { made.push(this); }
    playbackRate = 1; getAttribute() { return this.src; }
    addEventListener() {} play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } load() {} removeAttribute() {}
  };
  const a = new AudioService();
  a.startTheme();
  assert.equal(made.length, 1); assert.equal(made[0].loop, true); assert.match(made[0].src, /home-theme\.mp3$/); assert.equal(a.themePlaying, true);
  const loud = made[0].volume;
  a.duck(true); assert.ok(made[0].volume < loud, 'ducked while the buddy speaks');
  a.duck(false); assert.equal(made[0].volume, loud);
  a.startTheme(); assert.equal(made.length, 1, 'one player only (no duplicate music)');
  a.stopTheme(); assert.equal(a.themePlaying, false);
  a.setEnabled(false); a.startTheme(); assert.equal(a.themePlaying, false, 'sound off => no music');
});

test('alphabets: own tune, speed levels change pause/voice/tune rate, bigger Home tile', () => {
  const screens = src('src/web/screensNew.tsx'); const css = src('src/web/styles.css');
  assert.match(screens, /speech\.player\.rate = sp\.rate/); assert.match(screens, /setThemeRate\(sp\.rate\)/); assert.match(screens, /fkey="abc-slower"/); assert.match(screens, /fkey="abc-faster"/);
  assert.match(css, /\.tiles\.six > :nth-child\(4\) \{ grid-column: span 6/, 'Alphabets tile is the big one');
  assert.ok(readFileSync(join(root, 'public/audio/music/alphabet-tune.mp3')).length > 50_000);
  const man = JSON.parse(src('public/audio/MANIFEST.json')).files as { path: string; license: string }[];
  assert.ok(man.some((m) => m.path === 'music/alphabet-tune.mp3' && /CC0/.test(m.license)));
  assert.match(css, /@keyframes panel3d/); assert.match(css, /@keyframes tile3d/); assert.match(css, /\.btn:hover, \.btn:focus \{ transform: scale\(1\.05\)/);
});

test('logo: animated party (balloons + confetti popper) replaces the balloon emoji dot', () => {
  const app = src('src/web/App.tsx'); const icons = src('src/web/icons.tsx'); const css = src('src/web/styles.css');
  assert.match(app, /<div className="logo"><PartyBalloons \/>/); assert.ok(!/logo-dot" \/>Zora/.test(app));
  assert.match(icons, /export function PartyBalloons/); assert.match(css, /@keyframes pb-float/); assert.match(css, /@keyframes cf-pop/);
  assert.match(css, /\.reduced \.pb/, 'stills in gentle-motion mode');
  assert.match(css, /\.maker-panel \.maker-controls \{ gap: 34px/);
});

test('background music: a late (blocked, then released) play() never outlives a section change, and only one track plays', async () => {
  const made: { src: string; paused: boolean; resolve?: () => void; getAttribute(n: string): string }[] = [];
  (globalThis as unknown as { Audio: unknown }).Audio = class {
    src = ''; loop = false; paused = true; volume = 1; currentTime = 0; preload = ''; playbackRate = 1; error = null; resolve?: () => void;
    constructor() { made.push(this as never); }
    getAttribute() { return this.src; } addEventListener() {}
    play() { this.paused = false; return new Promise<void>((res) => { this.resolve = res; }); } // resolves only when the test says
    pause() { this.paused = true; } load() {} removeAttribute() {}
  };
  const a = new AudioService();
  a.startTheme('home');                       // autoplay "pending" (e.g. blocked until a key press)
  a.stopTheme();                              // the child opens a section
  made[0].resolve?.();                        // the browser releases the old play() afterwards
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(made[0].paused, true, 'the late play() is paused again at once');
  assert.equal(a.themePlaying, false);
  // enforcement: Home theme playing, but the screen is now Dance => stopped
  a.startTheme('home'); made[0].resolve?.(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(a.themePlaying, true);
  a.enforceTheme(null);
  assert.equal(a.themePlaying, false, 'no section except Home/Alphabets keeps a background track');
  // switching Home -> Alphabets swaps the file on the same single player
  a.startTheme('home'); a.enforceTheme('alphabet');
  assert.equal(made.length, 1, 'one player only');
  assert.match(made[0].src, /alphabet-tune\.mp3$/);
});

test('every section other than Home and Alphabets asks for no background track', () => {
  const app = src('src/web/App.tsx');
  const fn = app.slice(app.indexOf('const desiredTrack'), app.indexOf('const syncMusic'));
  for (const s of ['dance', 'rhymes', 'play', 'band', 'talk', 'animal', 'maker', 'avatar']) assert.ok(!fn.includes(`'${s}'`), `${s} must not get the Home theme`);
});

test('dance studio: one song loops for every dance style, only while Dance Studio is open', () => {
  const man = JSON.parse(src('public/audio/MANIFEST.json')).files as { path: string }[];
  const audio = src('src/web/audio.ts'); const app = src('src/web/App.tsx');
  assert.ok(readFileSync(join(root, 'public/audio/music/dance-song.mp3')).length > 400_000, 'the whole-song loop exists');
  assert.ok(man.some((m) => m.path === 'music/dance-song.mp3'), 'listed in the manifest');
  assert.match(audio, /const DANCE_FILE = 'audio\/music\/dance-song\.mp3'/); assert.match(audio, /el\.loop = true/);
  assert.match(audio, /startSynthLoop/, 'a missing file falls back to the built-in beat');
  assert.match(app, /sc === 'dance' \|\|/, 'plays while Dance Studio is open');
  assert.doesNotMatch(app, /loopStyle/, 'no per-style restart: the song just keeps going');
});

test('dance maker: its own song starts with the dance, follows the dance speed, stops on Stop or leaving', () => {
  const audio = src('src/web/audio.ts'); const app = src('src/web/App.tsx'); const screens = src('src/web/screens.tsx');
  assert.ok(readFileSync(join(root, 'public/audio/music/dance-maker.mp3')).length > 400_000);
  assert.match(audio, /MAKER_FILE = 'audio\/music\/dance-maker\.mp3'/);
  assert.match(app, /sc === 'maker' && musicHold\.current/, 'only while the maker dance is playing');
  assert.match(app, /sc === 'maker' \? 'maker' : snap\.style/);
  assert.match(screens, /ctx\.musicTempo\.current = SPEED_STEPS\[speedI\]/, 'tempo follows the maker speed');
  assert.match(screens, /ctx\.musicHold\.current = false; ctx\.musicTempo\.current = null/, 'Stop / leaving releases the music');
});

test('3D buddy: one model for the stage and the small pictures, driven by the same pose; flat buddy is the fallback', () => {
  const m3 = src('src/web/Milo3D.tsx'); const b3 = src('src/web/buddy3d.ts'); const snap = src('src/web/snapshots.ts'); const milo = src('src/web/Milo.tsx'); const icons = src('src/web/icons.tsx');
  assert.match(b3, /export function createBuddy\(avatar: AvatarId\)/);
  assert.match(m3, /computePose\(s\.state, t, m\.speed, s\.style, red, now - bs\.current, true\)/, 'same state machine and poses');
  assert.match(m3, /Math\.exp\(-dt \* 20\)/, 'poses glide: eased towards the target every frame');
  assert.match(m3, /const fail = useCallback/, 'one stable failure callback, so the 3D scene is not rebuilt on every app update');
  assert.match(m3, /return <Milo \{\.\.\.props\} \/>/, 'flat SVG buddy when 3D is not available');
  assert.match(m3, /webglcontextlost/); assert.match(m3, /too slow/, 'a slow device falls back for good');
  assert.match(milo, /if \(threeD\) p\.yaw = turn \* TAU/, 'spin is a real turn in 3D');
  assert.match(icons, /export function AvatarFace\(/); assert.match(icons, /useMoveStrip/); assert.match(snap, /createBuddy\(avatar\)/);
  assert.match(src('src/web/App.tsx'), /<Buddy avatar=\{avatar\}/);
  assert.equal(webglCheckedOnce(m3), true, 'the WebGL test context is opened only once');
});
function webglCheckedOnce(code: string): boolean { return /if \(webglChecked !== null\) return webglChecked;/.test(code); }
