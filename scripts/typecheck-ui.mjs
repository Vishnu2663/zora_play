// Typechecks src/web (React UI) in addition to the core.
// Uses @types/react from milo/node_modules if present, else from the sibling
// MiloVega project (which already depends on @types/react 19). Types only;
// nothing from MiloVega is bundled.
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findVegaProject } from './vega-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [join(root, 'node_modules/@types/react')];
const vega = findVegaProject(root);
if (vega) candidates.push(join(vega, 'node_modules/@types/react'));
const reactTypes = candidates.find((p) => existsSync(join(p, 'index.d.ts')));
if (!reactTypes) { console.error('No @types/react found. Run: npm i -D @types/react'); process.exit(1); }

const cfg = {
  extends: join(root, 'tsconfig.json'),
  compilerOptions: {
    jsx: 'react-jsx', lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: [], noUnusedLocals: false,
    paths: { react: [join(reactTypes, 'index.d.ts')], 'react/jsx-runtime': [join(reactTypes, 'jsx-runtime.d.ts')] },
  },
  include: [join(root, 'src/**/*.ts'), join(root, 'src/**/*.tsx'), join(root, 'types/*.d.ts')],
};
const dir = mkdtempSync(join(tmpdir(), 'milo-tsc-'));
writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(cfg));
const tsc = existsSync(join(root, 'node_modules/.bin/tsc')) ? join(root, 'node_modules/.bin/tsc') : 'tsc';
try {
  execFileSync(tsc, ['-p', join(dir, 'tsconfig.json')], { stdio: 'inherit' });
  console.log(`UI typecheck OK (react types: ${reactTypes})`);
} catch { process.exit(1); }
