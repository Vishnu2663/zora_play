// Writes voice/phrases.json: every line Milo can say (id, display text, spoken text).
// Input for scripts/gen-voice.py. Run: npm run voice:phrases
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { allPhrases } = await import(pathToFileURL(join(root, 'src/core/phrases.ts')).href);
const phrases = allPhrases().map(({ id, text, speak, source }) => ({ id, text, speak, source }));
mkdirSync(join(root, 'voice'), { recursive: true });
writeFileSync(join(root, 'voice/phrases.json'), JSON.stringify({ count: phrases.length, phrases }, null, 2) + '\n');
console.log(`wrote voice/phrases.json (${phrases.length} lines)`);
