// Writes voice/rhymes.json (lyrics + notes + beat timeline) for scripts/gen-rhymes.py. Run: node scripts/export-rhymes.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { RHYMES } = await import(pathToFileURL(join(root, 'src/core/rhymes.ts')).href);
mkdirSync(join(root, 'voice'), { recursive: true });
writeFileSync(join(root, 'voice/rhymes.json'), JSON.stringify({ rhymes: RHYMES }, null, 1) + '\n');
console.log(`wrote voice/rhymes.json (${RHYMES.length} rhymes)`);
