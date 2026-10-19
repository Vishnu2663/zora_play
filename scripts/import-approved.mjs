#!/usr/bin/env node
// Writes src/core/generatedLines.ts from every APPROVED line in voice/generated/*.json.
// A line is imported only if status is "approved", the guardrail passed and the local rules still pass.
// responses.ts, talk.ts, games.ts and phrases.ts already read generatedLines.ts, so the phrase catalog includes every line.
//
//   node scripts/import-approved.mjs [--dry-run]
// Then: npm run voice:phrases && python scripts/gen-voice.py --model <piper model> --only-missing
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GENERATED_DIR, ROOT, checkLocal, isImportable, isMain, listGeneratedFiles, normalize, parseArgs, readGenerated } from './lib/bedrock-lib.mjs';

export const TARGET = join(ROOT, 'src', 'core', 'generatedLines.ts');

/** Collect importable lines into the five exported structures. Pure: no file writes. */
export function collect(files, animals = null) {
  const out = { jokes: [], riddles: [], facts: Object.create(null), replies: [], bedtime: [] };
  const seen = new Set();
  const skipped = [];
  for (const f of files) {
    for (const l of readGenerated(f).lines) {
      if (l.status !== 'approved') continue;
      const local = checkLocal(l.kind, { text: l.text, topic: l.topic, animal: l.animal });
      if (l.kind === 'animal-facts' && animals && !animals.includes(l.animal)) { skipped.push({ id: l.id, reason: `unknown animal ${l.animal}` }); continue; }
      if (!isImportable(l) || !local.ok) { skipped.push({ id: l.id, reason: local.ok ? 'not eligible' : local.reasons.join(',') }); continue; }
      const key = normalize(l.text);
      if (seen.has(key)) continue;
      seen.add(key);
      if (l.kind === 'jokes') out.jokes.push(l.text);
      else if (l.kind === 'riddles') out.riddles.push(l.text);
      else if (l.kind === 'animal-facts') (out.facts[l.animal] ??= []).push(l.text);
      else if (l.kind === 'talk-replies') out.replies.push(l.text);
      else if (l.kind === 'bedtime') out.bedtime.push(l.text);
    }
  }
  return { out, skipped };
}

const arr = (a) => (a.length ? `[\n${a.map((x) => `  ${JSON.stringify(x)},`).join('\n')}\n]` : '[]');

/** Source text of src/core/generatedLines.ts. */
export function render(o) {
  const facts = Object.keys(o.facts).sort();
  const factsSrc = facts.length ? `{\n${facts.map((k) => `  ${JSON.stringify(k)}: ${arr(o.facts[k]).replace(/\n/g, '\n  ')},`).join('\n')}\n}` : '{}';
  return `// AUTO-WRITTEN by scripts/import-approved.mjs. Do not edit by hand.
// Lines written by an AI model at build time, checked by a safety guardrail
// and local rules, then approved by a human. The app only reads this file: no AWS call at runtime.

/** Jokes: question ending in "?", then a short answer. */
export const JOKES_GENERATED: string[] = ${arr(o.jokes)};
/** Riddles: same shape as jokes. */
export const RIDDLES: string[] = ${arr(o.riddles)};
/** Extra animal facts, keyed by animal id (see ANIMALS in games.ts). */
export const ANIMAL_FACTS_GENERATED: Record<string, string[]> = ${factsSrc};
/** Extra Talk replies: 2-3 short sentences each, as one string. */
export const TALK_REPLIES_GENERATED: string[] = ${arr(o.replies)};
/** Calm lines for the wind-down screen. */
export const BEDTIME_LINES: string[] = ${arr(o.bedtime)};
`;
}

export async function main(argv = process.argv.slice(2), dir = GENERATED_DIR, target = TARGET, animals = null) {
  const a = parseArgs(argv);
  animals ??= (await import(pathToFileURL(join(ROOT, 'src', 'core', 'games.ts')).href)).ANIMALS;
  const { out, skipped } = collect(listGeneratedFiles(dir), [...animals]);
  const n = out.jokes.length + out.riddles.length + Object.values(out.facts).flat().length + out.replies.length + out.bedtime.length;
  for (const s of skipped) console.log(`skipped ${s.id}: ${s.reason}`);
  console.log(`${n} approved line(s): ${out.jokes.length} jokes, ${out.riddles.length} riddles, ${Object.values(out.facts).flat().length} animal facts, ${out.replies.length} talk replies, ${out.bedtime.length} bedtime`);
  if (a['dry-run']) { console.log('[dry run] nothing written'); return; }
  writeFileSync(target, render(out));
  console.log(`wrote ${target}\nnext: npm run voice:phrases && python scripts/gen-voice.py --model <piper model> --only-missing`);
}

if (isMain(import.meta.url)) {
  try { await main(); } catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
}
