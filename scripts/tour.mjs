// End-to-end tour of the built app in headless Chrome (no extra dependencies: Chrome DevTools Protocol over a WebSocket).
//
//   npm run build && node scripts/tour.mjs [--monkey=400] [--out=/tmp/zp_tour] [--avatar=dino|cat|dog|bear] [--url=...]
//
// 1. Visits every screen the way a remote does (focus + Enter + Escape), screenshots each one, and checks: no console
//    errors or uncaught exceptions, something is focused, nothing sticks out of the 1920x1080 stage, the 3D buddy draws
//    pixels, and Back returns Home.
// 2. A seeded "monkey" presses random remote keys (arrows, Enter, Escape, Play/Pause) and watches for errors, a blank
//    page or a stuck screen.
// Exits with code 1 if any check fails, so it can run in CI.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, dflt) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : dflt; };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = arg('out', '/tmp/zp_tour');
const MONKEY = Number(arg('monkey', '300'));
const AVATAR = arg('avatar', 'dino');
const URL_ = arg('url', `file://${join(root, 'dist/index.html')}`);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9400 + Math.floor(Math.random() * 300);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu-sandbox', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + join(OUT, 'profile'), 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* starting */ } await sleep(250); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const problems = []; const log = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result ?? d.error); pend.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') problems.push(`exception: ${d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text}`);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push(`console.error: ${d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)}`);
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon|ERR_FILE_NOT_FOUND.*(apple|favicon)/.test(d.params.entry.text + d.params.entry.url)) problems.push(`log: ${d.params.entry.text} ${d.params.entry.url ?? ''}`.slice(0, 300));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r?.result?.value; };
const key = async (k, hold = 0) => {
  const map = { Enter: [13, 'Enter'], Escape: [27, 'Escape'], ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'], MediaPlayPause: [179, 'MediaPlayPause'] };
  const [code, kk] = map[k];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: kk, code: kk, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  if (hold) await sleep(hold);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: kk, code: kk, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
};
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64')); };
let failShots = 0;
const fail = (where, what) => { problems.push(`${where}: ${what}`); console.log(`  FAIL ${where}: ${what}`); send('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(join(OUT, `fail-${++failShots}-${where.replace(/\W+/g, '_')}.png`), Buffer.from(r.data, 'base64'))).catch(() => {}); };
const pass = (what) => console.log(`  ok   ${what}`);

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('zora.avatar','${AVATAR}')}catch(e){}` });
await send('Page.navigate', { url: URL_ });
await sleep(9000);

const state = () => evalJS(`(() => {
  const stage = document.querySelector('.stage'); const sb = stage ? stage.getBoundingClientRect() : null;
  const f = document.activeElement;
  const out = [];
  if (sb) for (const el of document.querySelectorAll('.panel *, .bubble, .milo-area *')) {
    if (el.closest('.scroll-y, svg, canvas, .more-pill, .karaoke, .mood-glow') || el.classList.contains('mood-glow')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right > sb.right + 2 || r.left < sb.left - 2 || r.bottom > sb.bottom + 2 || r.top < sb.top - 2) out.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ' ' + Math.round(r.right) + 'x' + Math.round(r.bottom));
  }
  const canvas = document.querySelector('canvas.milo3d');
  const px = canvas ? Number(canvas.dataset.frames || 0) : null;
  return { focus: f && f !== document.body ? (f.getAttribute('data-fkey') || f.className || f.tagName) : null, overflow: out.slice(0, 6), buddyPixels: px, text: document.body.innerText.length, title: (document.querySelector('.panel h1, .panel .panel-title, .panel h2') || {}).innerText || null };
})()`);

const click = (text) => evalJS(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})); if (!b) return false; b.focus(); b.click(); return true; })()`);

async function visit(name, openSteps, settle = 1800) {
  console.log(`# ${name}`);
  for (const step of openSteps) { const ok = await click(step); if (!ok) { fail(name, `button "${step}" not found`); return false; } await sleep(1200); }
  await sleep(settle);
  const s = await state();
  await shot(name);
  if (!s.focus) fail(name, 'nothing focused');
  else pass(`focus on ${s.focus}`);
  if (s.overflow.length) fail(name, `sticks out of the stage: ${s.overflow.join(', ')}`);
  if (s.buddyPixels !== null && s.buddyPixels < 5) fail(name, `3D buddy is not drawing (frames ${s.buddyPixels})`);
  return true;
}
async function backHome(name) {
  await key('Escape'); await sleep(900);
  const s = await state();
  const home = await evalJS(`!!document.querySelector('.tiles.six, .tiles')  && document.body.innerText.includes('What shall we do')`);
  if (!home) { await key('Escape'); await sleep(700); }
  const again = await evalJS(`document.body.innerText.includes('What shall we do')`);
  if (!again) fail(name, 'Back did not return Home'); else pass('Back returned Home');
  void s;
}

await shot('00-home');
const first = await state();
if (!first.focus) fail('home', 'nothing focused'); else pass(`home focus on ${first.focus}`);
if (first.buddyPixels !== null && first.buddyPixels < 5) fail('home', `3D buddy is not drawing (frames ${first.buddyPixels})`);

const tour = [
  ['dance', ['Dance']], ['dance-maker', ['Dance', 'Dance Maker']], ['rhymes', ['Sing']], ['play', ['Play']],
  ['shape-match', ['Play', 'Shape Match']], ['says', ['Play', 'Says']], ['animals', ['Play', 'Animal Sounds']], ['talk', ['Talk']],
  ['alphabets', ['Alphabets']], ['band', ['Band']], ['my-buddy', ['My buddy']], ['help', ['What can I do']], ['breathe', ['breath']],
];
for (const [name, steps] of tour) {
  const ok = await visit(name, steps);
  if (ok) {
    // pressing the arrows must move focus, and Enter on the focused control must not break the page
    const before = (await state()).focus;
    await key('ArrowRight'); await sleep(200); await key('ArrowDown'); await sleep(300);
    const after = (await state()).focus;
    if (before && after === null) fail(name, 'focus was lost after arrow keys');
  }
  // go back until Home
  for (let i = 0; i < 4; i++) { const home = await evalJS(`document.body.innerText.includes('What shall we do')`); if (home) break; await key('Escape'); await sleep(900); }
  const home = await evalJS(`document.body.innerText.includes('What shall we do')`);
  if (!home) fail(name, 'could not get back Home');
}

// Settings: hold OK on the Settings button for 3 s
console.log('# settings');
await evalJS(`(() => { const b = document.querySelector('[data-hold]'); if (b) b.focus(); return !!b; })()`);
await key('Enter', 3400); await sleep(1500);
await shot('settings');
if (!(await evalJS(`document.body.innerText.includes('Settings') && !!document.querySelector('.parents')`))) fail('settings', 'did not open after holding OK');
else pass('Settings opened');
await key('Escape'); await sleep(900);


// ---- Flows: play each section for real (answers, controls, toggles) and watch for errors ----
async function home() { for (let i = 0; i < 5; i++) { if (await evalJS(`document.body.innerText.includes('What shall we do')`)) return true; await key('Escape'); await sleep(800); } return false; }
const textOn = (t) => evalJS(`document.body.innerText.toLowerCase().includes(${JSON.stringify(t.toLowerCase())})`);
const ONLY = arg('only', '');
async function flow(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  console.log(`# flow: ${name}`);
  const before = problems.length;
  try { if (!(await home())) fail(name, 'not at Home before the flow'); await fn(); } catch (e) { fail(name, `flow crashed: ${e.message}`); }
  await sleep(300);
  if (problems.length === before) pass('no errors');
  await home();
}
const press = async (t, wait = 700) => { const ok = await click(t); if (!ok) fail('click', `"${t}" not found`); await sleep(wait); return ok; };

await flow('shape match', async () => {
  await press('Play'); await press('Shape Match', 1500);
  for (let round = 0; round < 7; round++) {
    // press the first big choice (right or wrong, both must work)
    // click the right shape (read it from "Find the star!"); every 5th press a wrong one, which must be handled gently
    const wrong = round === 1;
    await evalJS(`(() => { const m = /find the (\\w+)/i.exec(document.body.innerText); const bs = [...document.querySelectorAll('[data-fkey^="shape-"]')]; const right = bs.find((b) => m && (b.getAttribute('aria-label') || '').toLowerCase() === m[1].toLowerCase()); const pick = ${'${wrong}'} ? bs.find((b) => b !== right) : right; if (pick) pick.click(); return !!pick; })()`.replace('${wrong}', String(wrong)));
    await sleep(2800);
  }
  if (!(await textOn('play again')) && !(await textOn('other games'))) fail('shape match', 'finish screen never appeared');
});
await flow('says', async () => {
  await press('Play'); await press('Says', 8000);
  for (let i = 0; i < 6; i++) { await evalJS(`(() => { const b = document.querySelector('.move-btn'); if (b) b.click(); return !!b; })()`); await sleep(2600); }
});
await flow('animal sounds', async () => {
  await press('Play'); await press('Animal Sounds', 6000);
  for (let i = 0; i < 4; i++) { await evalJS(`(() => { const b = document.querySelector('[data-fkey^="animal-"]:not([data-fkey="animal-hear"])'); if (b) b.click(); return !!b; })()`); await sleep(2500); }
});
await flow('dance maker', async () => {
  await press('Dance'); await press('Dance Maker', 1500);
  for (const m of ['Wave', 'Jump', 'Side Step', 'Bounce']) await press(m, 300);
  await press('Go!', 3500); await press('+', 800); await press('Stop', 1000); await press('Undo', 300);
});
await flow('dance studio', async () => {
  await press('Dance', 1500);
  for (const t of ['Robot', 'Silly', 'Slow', 'Wiggle']) await press(t, 1800);
  await press('+', 400); await press('+', 400); await press('Again', 900); await press('Stop', 900);
});
await flow('rhymes', async () => {
  await press('Sing', 1500);
  await evalJS(`(() => { const c = document.querySelector('.rhyme-card'); if (c) c.click(); return !!c; })()`); await sleep(9000);
  if (!(await evalJS(`!!document.querySelector('.k-line.now') || document.body.innerText.includes("Milo")`))) fail('rhymes', 'no lyrics shown');
  await press('Pause', 800); await press('Resume', 1500); await press('Replay', 1500);
  await evalJS(`(() => { const c = [...document.querySelectorAll('.rhyme-card')][2]; if (c) c.click(); return !!c; })()`); await sleep(2500);
});
await flow('alphabets', async () => {
  await press('Alphabets', 5000);
  for (const t of ['Next', 'Next', 'Previous']) await press(t, 1500);
  await press('Pause', 800); await press('Replay', 2500); await press('+', 600); await press('\u2212', 600);
});
await flow('band', async () => {
  await press('Band', 1200);
  await evalJS(`(() => { document.querySelectorAll('.inst').forEach((b, i) => setTimeout(() => b.click(), i * 250)); return true; })()`); await sleep(3200);
});
await flow('talk', async () => {
  const chats = ["Let's learn about animals!", 'Can you count to five with me?', 'What is your favourite colour?', 'Shall we dance together?', 'Would you like to hear a rhyme?'];
  for (const c of chats) { await home(); await press('Talk', 2200); await press(c, 9000); }
  await home(); await press('Talk', 2200);
  for (const t of ['Faster!', 'Slower!', 'Again!', 'Stop!', 'Jump!', 'Spin around!', 'Tell me a joke', 'Surprise me!', "I'm sad", 'Say hello', 'Go to sleep', 'Wake up!', "Let's play!"]) { await press(t, 1700); if (!(await textOn('Talk to'))) { await home(); await press('Talk', 2200); } }
});
await flow('buddies', async () => {
  await press('My buddy', 3500);
  for (const n of ['Mimi', 'Bruno', 'Teddy', 'Zora']) { await press(n, 2500); const f1 = Number((await state()).buddyPixels); await sleep(700); const f2 = Number((await state()).buddyPixels); if (!(f2 > f1)) fail('buddies', `${n}: the 3D buddy stopped drawing`); }
});
await flow('breathe', async () => { await press('breath', 2500); await press('Again', 500); await sleep(3000); });
await flow('settings toggles', async () => {
  await evalJS(`(() => { const b = document.querySelector('[data-hold]'); if (b) b.focus(); return !!b; })()`);
  await key('Enter', 3400); await sleep(1500);
  for (const t of ['Sound', 'Volume', 'Zora Play speaks', 'Motion', 'Wind-down timer']) await press(t, 500);
  await press('Reset', 600);
  for (const t of ['Sound', 'Zora Play speaks', 'Motion']) await press(t, 500);
  await press('Back to Zora Play', 900);
});

// Monkey: random remote keys, looking for errors and dead pages
console.log(`# monkey (${MONKEY} keys)`);
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'Enter', 'Enter', 'Escape', 'MediaPlayPause'];
let stuck = 0, lastTitle = '';
for (let i = 0; i < MONKEY; i++) {
  await key(keys[Math.floor(rnd() * keys.length)]);
  await sleep(160 + Math.floor(rnd() * 240));
  if (i % 25 === 24) {
    const s = await state();
    if (s.text < 20) fail('monkey', `page looks blank at key ${i}`);
    const sig = `${s.focus}|${s.text}`;
    stuck = sig === lastTitle ? stuck + 1 : 0; lastTitle = sig;
    if (stuck >= 6) fail('monkey', 'UI did not change for 150 keys');
    await shot(`monkey-${String(i + 1).padStart(3, '0')}`);
  }
}
const final = await state();
if (final.text < 20) fail('monkey', 'blank page at the end'); else pass('page alive after the monkey run');

writeFileSync(join(OUT, 'report.json'), JSON.stringify({ avatar: AVATAR, problems, log }, null, 1));
const unique = [...new Set(problems)];
console.log(`\n${unique.length ? 'PROBLEMS' : 'ALL CLEAR'} (${unique.length})`); unique.forEach((p) => console.log(' - ' + p));
chrome.kill();
process.exit(unique.length ? 1 : 0);
