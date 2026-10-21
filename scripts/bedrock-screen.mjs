#!/usr/bin/env node
// Build-time only. Safety-screens generated lines in ANY file (for example a scratch file) with our local rules and the
// Bedrock Guardrail, without touching voice/generated/ or any approval state. Prints one PASS/FAIL line per line.
//
//   node scripts/bedrock-screen.mjs <file.json> [more files...] [--guardrail=ID:VERSION] [--region=R]
//   (guardrail and region fall back to BEDROCK_GUARDRAIL_ID / BEDROCK_GUARDRAIL_VERSION and AWS_REGION)
import { checkLocal, checkWithGuardrail, createBedrockClient, isMain, parseArgs, readGenerated, splitGuardrail } from './lib/bedrock-lib.mjs';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const files = argv.filter((x) => !x.startsWith('--'));
  const a = parseArgs(argv);
  if (!files.length) throw new Error('Pass at least one generated JSON file');
  const gv = a.guardrail || (env.BEDROCK_GUARDRAIL_ID && `${env.BEDROCK_GUARDRAIL_ID}:${env.BEDROCK_GUARDRAIL_VERSION ?? ''}`);
  const guardrail = splitGuardrail(gv);
  if (!guardrail) throw new Error('No guardrail. Pass --guardrail=ID:VERSION or set BEDROCK_GUARDRAIL_ID and BEDROCK_GUARDRAIL_VERSION');
  const region = a.region || env.AWS_REGION || env.AWS_DEFAULT_REGION;
  if (!region) throw new Error('No region. Pass --region=<region> or set AWS_REGION');
  const client = await createBedrockClient(region);
  let total = 0, passed = 0;
  for (const f of files) {
    const j = readGenerated(f);
    for (const l of j.lines) {
      const local = checkLocal(l.kind ?? j.metadata?.kind, { text: l.text, topic: l.topic, animal: l.animal });
      const r = await checkWithGuardrail(client, guardrail, l.text, 'OUTPUT', {});
      const ok = local.ok && r.verdict === 'pass';
      total++; if (ok) passed++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${l.text}${local.ok ? '' : `  [local: ${local.reasons}]`}${r.verdict === 'pass' ? '' : `  [guardrail: ${r.triggered}]`}`);
    }
  }
  console.log(`\n${passed}/${total} passed local rules and the guardrail`);
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
