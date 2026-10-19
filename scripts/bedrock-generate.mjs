#!/usr/bin/env node
// Build-time only. Asks Amazon Bedrock (Converse API) for new kid-friendly lines and saves them as "pending".
// Never bundled into dist/. Credentials come from the standard AWS chain (env vars or AWS_PROFILE).
//
//   node scripts/bedrock-generate.mjs --kind=jokes --count=20 [--model=ID] [--region=R] [--guardrail=ID:VERSION]
//                                     [--out=voice/generated/jokes.json] [--dry-run]
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { KINDS, PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } from './bedrock-prompts.mjs';
import { GENERATED_DIR, ROOT, createBedrockClient, isMain, parseArgs, generateLines, loadExisting, readGenerated, splitGuardrail, writeJson } from './lib/bedrock-lib.mjs';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const a = parseArgs(argv);
  const kind = a.kind;
  if (!KINDS.includes(kind)) throw new Error(`--kind is required. One of: ${KINDS.join(', ')}`);
  const count = Number(a.count ?? 20);
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('--count must be a whole number from 1 to 200');
  const model = a.model || env.BEDROCK_MODEL_ID;
  const region = a.region || env.AWS_REGION || env.AWS_DEFAULT_REGION;
  const gv = a.guardrail || (env.BEDROCK_GUARDRAIL_ID && `${env.BEDROCK_GUARDRAIL_ID}:${env.BEDROCK_GUARDRAIL_VERSION ?? ''}`);
  const guardrail = gv ? splitGuardrail(gv) : null;
  if (gv && !guardrail) throw new Error('Guardrail must look like ID:VERSION (for example abc123xyz:1)');
  if (a.out === true) throw new Error('--out needs a value: --out=voice/generated/<kind>.json');
  const out = resolve(ROOT, a.out || join('voice', 'generated', `${kind}.json`));
  const existing = await loadExisting(ROOT, GENERATED_DIR);

  if (a['dry-run']) {
    console.log(`[dry run] no AWS call. kind=${kind} count=${count} model=${model ?? '(unset)'} region=${region ?? '(unset)'} guardrail=${gv ?? '(none)'} out=${out}`);
    console.log(`prompt version ${PROMPT_VERSION}\n\n--- system ---\n${SYSTEM_PROMPT}\n\n--- user ---\n${buildUserPrompt(kind, count, { animals: existing.animals, avoid: existing.samples[kind] })}`);
    return;
  }
  if (!model) throw new Error('No model. Pass --model=<modelId> or set BEDROCK_MODEL_ID');
  if (!region) throw new Error('No region. Pass --region=<region> or set AWS_REGION');

  const client = await createBedrockClient(region);
  const { lines, stats } = await generateLines(client, { kind, count, model, region, guardrail, seen: existing.seen, sample: existing.samples[kind], animals: existing.animals, log: (m) => console.log(m) });

  const prev = existsSync(out) ? readGenerated(out) : { lines: [] };
  const file = {
    metadata: { kind, model, region, date: new Date().toISOString(), promptVersion: PROMPT_VERSION, systemPrompt: SYSTEM_PROMPT, guardrail: gv ?? null, note: 'Written by an AI model. Lines are pending until a human approves them.' },
    lines: [...prev.lines, ...lines],
  };
  writeJson(out, file);
  console.log(`wrote ${lines.length} new pending line(s) to ${out} (${file.lines.length} total). stats: ${JSON.stringify(stats)}`);
  if (lines.length < count) console.log(`warning: asked for ${count}, got ${lines.length}. Run again for more.`);
  console.log('next: node scripts/bedrock-check.mjs');
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
