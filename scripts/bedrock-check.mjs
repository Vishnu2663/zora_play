#!/usr/bin/env node
// Build-time only. Sends every generated line to the Bedrock ApplyGuardrail API and also runs the local rules.
// Writes voice/generated/safety-report.json and stamps each line's "safety" field.
//
//   node scripts/bedrock-check.mjs [--guardrail=ID:VERSION] [--region=R] [--source=OUTPUT|INPUT] [--recheck] [--dry-run]
import { join, relative } from 'node:path';
import { GENERATED_DIR, ROOT, textHash, checkLocal, checkWithGuardrail, createBedrockClient, explainAwsError, isEligible, isMain, listGeneratedFiles, parseArgs, readGenerated, splitGuardrail, writeJson } from './lib/bedrock-lib.mjs';

/** Check every line in the given files. `client` is injectable (tests use a fake). Returns the report. */
export async function checkFiles({ files, client, guardrail, source = 'OUTPUT', recheck = false, now = () => new Date(), backoff = {}, log = () => {} }) {
  const report = [];
  for (const f of files) {
    const j = readGenerated(f);
    for (const l of j.lines) {
      const local = checkLocal(l.kind ?? j.metadata?.kind, { text: l.text, topic: l.topic, animal: l.animal });
      let gr = l.safety?.guardrail;
      const same = gr && gr.id === guardrail.id && gr.version === guardrail.version && gr.textHash === textHash(l.text);
      if (recheck || !same) {
        try {
          const r = await checkWithGuardrail(client, guardrail, l.text, source, backoff);
          gr = { verdict: r.verdict, triggered: r.triggered, id: guardrail.id, version: guardrail.version, source, textHash: textHash(l.text), date: now().toISOString() };
        } catch (e) { throw new Error(explainAwsError(e, { region: '' })); }
      }
      l.safety = { local: { ok: local.ok, reasons: local.reasons }, guardrail: gr };
      // a line already approved but now failing is pulled back to pending so it cannot be imported
      if (l.status === 'approved' && !isEligible(l)) l.status = 'pending';
      report.push({ line: l.text, kind: l.kind, id: l.id, file: relative(ROOT, f), verdict: gr.verdict, triggered: gr.triggered, local: l.safety.local, eligible: isEligible(l), guardrail: `${gr.id}:${gr.version}`, date: gr.date });
      log(`${isEligible(l) ? 'PASS ' : 'FAIL '} ${l.text}`);
    }
    writeJson(f, j);
  }
  return report;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const a = parseArgs(argv);
  const gv = a.guardrail || (env.BEDROCK_GUARDRAIL_ID && `${env.BEDROCK_GUARDRAIL_ID}:${env.BEDROCK_GUARDRAIL_VERSION ?? ''}`);
  const guardrail = splitGuardrail(gv);
  if (!guardrail) throw new Error('No guardrail. Pass --guardrail=ID:VERSION or set BEDROCK_GUARDRAIL_ID and BEDROCK_GUARDRAIL_VERSION');
  const region = a.region || env.AWS_REGION || env.AWS_DEFAULT_REGION;
  const source = String(a.source ?? 'OUTPUT').toUpperCase();
  if (!['INPUT', 'OUTPUT'].includes(source)) throw new Error('--source must be INPUT or OUTPUT');
  const files = listGeneratedFiles(GENERATED_DIR);
  if (!files.length) throw new Error('No generated files in voice/generated/. Run bedrock-generate.mjs first.');
  if (a['dry-run']) { console.log(`[dry run] no AWS call. would check ${files.length} file(s) with guardrail ${gv}, source ${source}`); return; }
  if (!region) throw new Error('No region. Pass --region=<region> or set AWS_REGION');
  const client = await createBedrockClient(region);
  const lines = await checkFiles({ files, client, guardrail, source, recheck: !!a.recheck, log: (m) => console.log(m) });
  const report = { guardrail: `${guardrail.id}:${guardrail.version}`, region, source, date: new Date().toISOString(), total: lines.length, eligible: lines.filter((l) => l.eligible).length, blocked: lines.filter((l) => l.verdict !== 'pass').length, localFail: lines.filter((l) => !l.local.ok).length, lines };
  writeJson(join(GENERATED_DIR, 'safety-report.json'), report);
  console.log(`safety report: ${report.eligible}/${report.total} eligible, ${report.blocked} blocked by guardrail, ${report.localFail} failed local rules -> voice/generated/safety-report.json`);
  console.log('next: node scripts/review-lines.mjs');
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
