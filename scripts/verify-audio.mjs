// Audio inventory check (npm run voice:report).
// 1. Every file under public/audio has a MANIFEST record, and every "ready" record has a real file.
// 2. Voice clip coverage per character against the phrase catalog.
// Exits non-zero on manifest violations. Missing clips are reported (pending), not an error.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listFiles } from './vega-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const audioDir = join(root, 'public/audio');
const { allPhrases } = await import(pathToFileURL(join(root, 'src/core/phrases.ts')).href);
let problems = 0;
const bad = (m) => { problems++; console.log(`FIX  ${m}`); };

// Collect records from every MANIFEST.json under public/audio.
const manifests = listFiles(audioDir).filter((f) => f.endsWith('MANIFEST.json'));
const records = new Map();
for (const m of manifests) {
  const base = dirname(m) === '.' ? '' : `${dirname(m)}/`;
  const data = JSON.parse(readFileSync(join(audioDir, m), 'utf8'));
  for (const r of data.files ?? []) {
    // root MANIFEST paths are relative to public/audio; per-voice ones too ("voice/milo/x.mp3")
    const path = r.path.startsWith(base) || base === '' ? r.path : `${base}${r.path}`;
    for (const k of ['title', 'creator', 'license', 'attribution', 'intendedUse', 'status']) if (!(k in r)) bad(`${m}: record ${r.path} lacks "${k}"`);
    records.set(path, r);
  }
}
const audioFiles = listFiles(audioDir).filter((f) => /\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(f));
for (const f of audioFiles) if (!records.has(f)) bad(`${f} has no MANIFEST record`);
for (const [p, r] of records) {
  if (r.status === 'ready') {
    if (!existsSync(join(audioDir, p))) bad(`${p} is marked ready but missing`);
    else if (statSync(join(audioDir, p)).size < 1000) bad(`${p} is under 1 KB (not a real recording)`);
  }
}
console.log(`Audio files: ${audioFiles.length}, manifest records: ${records.size}`);

// Voice coverage.
const phrases = allPhrases();
const clipsPath = join(audioDir, 'voice/clips.json');
const clips = existsSync(clipsPath) ? JSON.parse(readFileSync(clipsPath, 'utf8')) : { voices: {} };
const chars = Object.keys(clips.voices ?? {});
if (!chars.length) console.log(`Voice clips: none generated yet. All ${phrases.length} lines are PENDING (run scripts/gen-voice.py).`);
for (const c of chars) {
  const have = phrases.filter((p) => clips.voices[c][p.id] && existsSync(join(root, 'public', clips.voices[c][p.id].file)));
  const missing = phrases.filter((p) => !have.includes(p));
  console.log(`Voice "${c}": ${have.length}/${phrases.length} lines voiced${missing.length ? `, ${missing.length} PENDING` : ''}`);
  for (const p of missing.slice(0, 10)) console.log(`   pending ${p.id}  "${p.text}"`);
  if (missing.length > 10) console.log(`   ...and ${missing.length - 10} more`);
}
console.log(problems ? `\n${problems} manifest problem(s).` : '\nManifest OK.');
process.exit(problems ? 1 : 0);
