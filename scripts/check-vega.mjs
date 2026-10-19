// Answers "is the .vpkg on my disk running my latest Milo code?"
// Compares dist/index.html  ->  MiloVega/assets/<path>  ->  staged assets in MiloVega/build
// and checks the .vpkg files are newer than the staged asset. Read-only.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetPathFromAppTsx, fileHash, findVegaProject, listFiles, readStamp, stagedAssets, vpkgs } from './vega-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist', 'index.html');
let ok = true;
const say = (good, msg) => { console.log(`${good ? 'OK  ' : 'FIX '} ${msg}`); if (!good) ok = false; };
const label = (p) => { const s = readStamp(readFileSync(p, 'utf8')); return s ? `${s.version} · ${s.hash}` : 'unstamped (built before stamping)'; };

if (!existsSync(dist)) { say(false, 'dist/index.html missing: run npm run build'); process.exit(1); }
console.log(`dist/index.html           ${label(dist)}`);

const vega = findVegaProject(root);
if (!vega) { say(false, 'Vega project not found (sibling ../MiloVega or $VEGA_PROJECT)'); process.exit(1); }
const rel = assetPathFromAppTsx(readFileSync(join(vega, 'src', 'App.tsx'), 'utf8'));
if (!rel) { say(false, 'MiloVega/src/App.tsx does not load file:///pkg/assets/...'); process.exit(1); }
const asset = join(vega, 'assets', rel);
console.log(`WebView loads             file:///pkg/assets/${rel}`);

if (!existsSync(asset)) say(false, `MiloVega/assets/${rel} missing: run npm run build:vega`);
else {
  console.log(`MiloVega/assets/${rel}   ${label(asset)}`);
  say(fileHash(asset) === fileHash(dist), fileHash(asset) === fileHash(dist)
    ? 'Vega asset matches dist'
    : 'Vega asset differs from dist: run npm run build:vega');
}

// Every bundled asset (audio etc.) must be in MiloVega/assets too.
const others = listFiles(join(root, 'dist')).filter((f) => f !== 'index.html');
const destDir = dirname(asset);
const missing = others.filter((f) => !existsSync(join(destDir, f)) || fileHash(join(destDir, f)) !== fileHash(join(root, 'dist', f)));
say(missing.length === 0, missing.length === 0 ? `${others.length} asset files match` : `${missing.length} asset files missing/different in MiloVega/assets (e.g. ${missing[0]}): run npm run build:vega`);

const staged = stagedAssets(vega, rel);
if (!staged.length) say(false, 'No Vega build found yet: run npm run build:release in MiloVega');
for (const s of staged) {
  say(existsSync(asset) && fileHash(s.path) === fileHash(asset), `${s.arch}/${s.type} build contains ${fileHash(s.path) === fileHash(asset) ? 'the current asset' : 'an OLD asset: rebuild MiloVega'}`);
}
const assetTime = existsSync(asset) ? statSync(asset).mtimeMs : 0;
for (const v of vpkgs(vega)) {
  const fresh = v.mtime >= assetTime;
  say(fresh, `${v.path.split('/build/')[1]} ${fresh ? 'is newer than the asset' : 'is OLDER than the asset: rebuild MiloVega'}`);
}
console.log(ok ? '\nAll in sync. The .vpkg runs this build.' : '\nOut of sync. Follow the FIX lines above.');
process.exit(ok ? 0 : 1);
