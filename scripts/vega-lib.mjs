// Shared helpers for building Milo and syncing it into the Vega project.
// Pure functions where possible so they can be unit-tested (test/vega-sync.test.ts).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Find the bundled-asset path the Vega WebView loads, from the host App.tsx.
 * `uri: "file:///pkg/assets/index.html"` -> "index.html"
 * Returns null if App.tsx does not load a bundled asset (e.g. a remote URL).
 */
export function assetPathFromAppTsx(source) {
  const m = String(source).match(/uri\s*:\s*["'`]file:\/\/\/pkg\/assets\/([^"'`]+)["'`]/);
  if (!m) return null;
  const rel = m[1];
  if (rel.includes('..') || rel.startsWith('/')) return null; // never write outside assets/
  return rel;
}

/** Read the build stamp injected by scripts/build.mjs from a built index.html. */
export function readStamp(html) {
  const m = String(html).match(/<meta name="milo-build" content="([^"]*)"/);
  if (!m) return null;
  const [version, hash, builtAt] = m[1].split('|');
  return { version, hash, builtAt };
}

export function makeStamp({ version, js, css, builtAt = new Date().toISOString() }) {
  const hash = createHash('sha256').update(js).update('\0').update(css).digest('hex').slice(0, 8);
  return { version, hash, builtAt };
}

export const stampContent = (s) => `${s.version}|${s.hash}|${s.builtAt}`;

export const fileHash = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

/** Locate the Vega project: $VEGA_PROJECT, else a sibling ../MiloVega. */
export function findVegaProject(miloRoot, env = process.env) {
  const candidates = [env.VEGA_PROJECT, join(miloRoot, '..', 'MiloVega')].filter(Boolean);
  for (const c of candidates) {
    const p = resolve(c);
    if (existsSync(join(p, 'package.json')) && existsSync(join(p, 'src', 'App.tsx'))) return p;
  }
  return null;
}

/** Staged copies of the asset inside the last Vega build (one per architecture). */
export function stagedAssets(vegaRoot, rel) {
  const base = join(vegaRoot, 'build', 'private', 'vega');
  if (!existsSync(base)) return [];
  const out = [];
  for (const arch of readdirSync(base)) {
    for (const type of ['Release', 'Debug']) {
      const p = join(base, arch, type, 'assets', rel);
      if (existsSync(p)) out.push({ arch, type, path: p, mtime: statSync(p).mtimeMs });
    }
  }
  return out;
}

/** Built .vpkg files with their modification times. */
export function vpkgs(vegaRoot) {
  const base = join(vegaRoot, 'build');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((d) => /-(release|debug)$/i.test(d))
    .flatMap((d) => readdirSync(join(base, d)).filter((f) => f.endsWith('.vpkg')).map((f) => join(base, d, f)))
    .map((p) => ({ path: p, mtime: statSync(p).mtimeMs }));
}

/** All files under dir, as paths relative to dir (sorted, posix-style). */
export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === '.DS_Store') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}
