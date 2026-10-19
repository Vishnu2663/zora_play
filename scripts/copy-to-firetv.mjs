// Copies the built app (dist/: index.html + audio/) into the Fire OS wrapper's assets.
// The Android app loads file:///android_asset/index.html. Usage: npm run build:firetv
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileHash, listFiles, readStamp } from './vega-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const assets = join(root, 'firetv', 'app', 'src', 'main', 'assets');
if (!existsSync(join(dist, 'index.html'))) { console.error('No dist/index.html. Run "npm run build" first.'); process.exit(1); }
rmSync(assets, { recursive: true, force: true }); // assets/ is fully generated (gitignored)
let n = 0;
for (const f of listFiles(dist)) {
  const target = join(assets, f);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(dist, f), target);
  if (fileHash(join(dist, f)) !== fileHash(target)) { console.error(`Copy verification failed: ${f}`); process.exit(1); }
  n++;
}
const s = readStamp(readFileSync(join(dist, 'index.html'), 'utf8'));
console.log(`synced build ${s?.version} · ${s?.hash} -> firetv/app/src/main/assets (${n} files)`);
