// Copies the built app into the Vega project, at exactly the path its WebView loads.
//
// Usage (from milo/):  npm run build:vega
//   - finds the Vega project: $VEGA_PROJECT, else the sibling ../MiloVega
//   - reads MiloVega/src/App.tsx to find `file:///pkg/assets/<path>`
//   - copies dist/index.html to MiloVega/assets/<path>
// It never edits App.tsx, manifest.toml or anything else in the Vega project.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetPathFromAppTsx, fileHash, findVegaProject, listFiles, readStamp } from './vega-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist', 'index.html');
if (!existsSync(dist)) { console.error('No dist/index.html. Run "npm run build" first.'); process.exit(1); }

const vega = findVegaProject(root);
if (!vega) {
  console.error('Could not find the Vega project. Put MiloVega next to milo/, or set VEGA_PROJECT=/path/to/MiloVega');
  process.exit(1);
}
const rel = assetPathFromAppTsx(readFileSync(join(vega, 'src', 'App.tsx'), 'utf8'));
if (!rel) {
  console.error(`${vega}/src/App.tsx does not load a file:///pkg/assets/... URI, so there is nothing to copy into.`);
  process.exit(1);
}
// Copy the whole dist tree (index.html + audio/...) next to the page the WebView loads.
// Only adds/overwrites files: never deletes anything else in MiloVega/assets (e.g. splash images).
const distDir = join(root, 'dist');
const destDir = join(vega, 'assets', dirname(rel));
const pageName = rel.split('/').pop();
let n = 0;
for (const f of listFiles(distDir)) {
  const target = f === 'index.html' ? join(destDir, pageName) : join(destDir, f);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(distDir, f), target);
  if (fileHash(join(distDir, f)) !== fileHash(target)) { console.error(`Copy verification failed: ${f}`); process.exit(1); }
  n++;
}
const dest = join(destDir, pageName);
const s = readStamp(readFileSync(dist, 'utf8'));
console.log(`synced build ${s?.version} · ${s?.hash}  ->  ${dest}  (+${n - 1} asset files)`);
console.log(`WebView loads: file:///pkg/assets/${rel}`);
console.log(`Next: cd ${vega} && npm run build:release   (then install/run on the Vega Virtual Device as before)`);
console.log('Then: npm run vega:check   (confirms the .vpkg contains this build)');
