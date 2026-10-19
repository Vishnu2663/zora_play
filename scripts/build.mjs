// Bundles the TV UI into a single self-contained dist/index.html
// (JS + CSS inlined: no network, loads from file:// inside the Vega WebView).
// Every build is stamped (version | content hash | time) so you can confirm
// on the TV which build is running: Grown-ups screen, bottom of the privacy panel.
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeStamp, stampContent } from './vega-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Prefer the project's own esbuild; fall back to a globally installed one.
// The check actually runs esbuild, because a node_modules copied from another
// OS imports fine but fails on first use (wrong native binary).
const FALLBACK_PATHS = ['/opt/npm-tools/node_modules', '/home/claude/.npm-global/lib/node_modules'];
function usable(mod) {
  try { mod.transformSync('let a = 1', { loader: 'js' }); return true; } catch { return false; }
}
function loadEsbuild() {
  const tried = [];
  for (const id of ['esbuild', ...FALLBACK_PATHS.map((p) => join(p, 'esbuild'))]) {
    try {
      const mod = require(id);
      if (usable(mod)) return mod;
      tried.push(`${id} (installed for another platform)`);
    } catch { tried.push(`${id} (not found)`); }
  }
  throw new Error(`No working esbuild. Run "npm install" in milo/.\nTried: ${tried.join(', ')}`);
}
const esbuild = loadEsbuild();
const nodePaths = [join(root, 'node_modules'), ...FALLBACK_PATHS];
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const result = await esbuild.build({
  entryPoints: [join(root, 'src/web/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019', 'chrome80'],
  jsx: 'automatic',
  write: false,
  outdir: 'out',
  nodePaths,
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css' },
  logLevel: 'warning',
});

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
// Voice clip index (from scripts/gen-voice.py). Injected so the app knows which
// clips exist without fetching files (fetch on file:// is unverified in Vega).
const clipsPath = join(root, 'public/audio/voice/clips.json');
const clips = existsSync(clipsPath) ? JSON.parse(readFileSync(clipsPath, 'utf8')) : { voices: {} };
// Sung-rhyme lyric timings (from scripts/gen-rhymes.py), injected for the same reason.
const rhymeDir = join(root, 'public/audio/rhymes');
const rhymes = {};
if (existsSync(rhymeDir)) for (const f of readdirSync(rhymeDir)) if (f.endsWith('.json')) { const r = JSON.parse(readFileSync(join(rhymeDir, f), 'utf8')); rhymes[r.id] = r; }
const stamp = makeStamp({ version: pkg.version, js: js + JSON.stringify(clips) + JSON.stringify(rhymes), css });
const stampJs = `window.__MILO_BUILD__=${JSON.stringify(stamp)};window.__MILO_CLIPS__=window.__MILO_CLIPS__||${JSON.stringify(clips)};window.__ZORA_RHYMES__=${JSON.stringify(rhymes)};`;
const html = readFileSync(join(root, 'src/web/index.html'), 'utf8')
  .replace('<!--__META__-->', `<meta name="milo-build" content="${stampContent(stamp)}" />`)
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => stampJs + js.replace(/<\/script/gi, '<\\/script'));

// Fresh dist each time so removed assets don't linger, then copy public/ (audio etc.).
rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(join(root, 'dist'), { recursive: true });
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`built dist/index.html  (${(html.length / 1024).toFixed(0)} KB)  build ${stamp.version} · ${stamp.hash}`);
