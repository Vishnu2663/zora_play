#!/usr/bin/env node
// Human review gate. Lists pending lines and lets the owner approve or reject them.
// Only lines that passed bedrock-check.mjs (guardrail + local rules) can be approved.
//
//   node scripts/review-lines.mjs --list
//   node scripts/review-lines.mjs --approve=ID,ID --reviewer=Name
//   node scripts/review-lines.mjs --reject=ID,ID  --reviewer=Name
//   node scripts/review-lines.mjs --reviewer=Name         (interactive: a = approve, r = reject, s = skip, q = quit)
import { createInterface } from 'node:readline/promises';
import { GENERATED_DIR, isEligible, isMain, listGeneratedFiles, parseArgs, readGenerated, writeJson } from './lib/bedrock-lib.mjs';

/** Set the decision on one line. Throws if the line may not be approved. Returns the line. */
export function decide(line, decision, reviewer, now = () => new Date()) {
  if (!['approved', 'rejected'].includes(decision)) throw new Error(`bad decision ${decision}`);
  if (typeof reviewer !== 'string' || !reviewer.trim()) throw new Error('A reviewer name is required (--reviewer=Name)');
  if (/^(your name|name|reviewer|owner)$/i.test(reviewer.trim())) throw new Error('Use your real name as reviewer, not a placeholder');
  reviewer = reviewer.trim();
  if (decision === 'approved' && !isEligible(line)) throw new Error(`Cannot approve ${line.id}: it has not passed the guardrail and local checks. Run scripts/bedrock-check.mjs.`);
  line.status = decision;
  line.review = { reviewer, date: now().toISOString() };
  return line;
}

export function loadAll(dir = GENERATED_DIR) {
  return listGeneratedFiles(dir).map((file) => ({ file, data: readGenerated(file) }));
}

const showLine = (l) => `${l.id}  [${l.kind}]  ${isEligible(l) ? 'eligible' : 'NOT ELIGIBLE'}\n    ${l.text}`;

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const all = loadAll();
  const pending = all.flatMap(({ data }) => data.lines.filter((l) => l.status === 'pending'));
  if (a.list) {
    console.log(pending.length ? pending.map(showLine).join('\n') : 'No pending lines.');
    console.log(`\n${pending.length} pending, ${pending.filter(isEligible).length} eligible.`);
    return;
  }
  const reviewer = a.reviewer || process.env.REVIEWER;
  const apply = (ids, decision) => {
    for (const id of String(ids).split(',').filter(Boolean)) {
      const hit = all.flatMap(({ data }) => data.lines).find((l) => l.id === id);
      if (!hit) throw new Error(`No line with id ${id}`);
      decide(hit, decision, reviewer);
      console.log(`${decision}: ${hit.text}`);
    }
  };
  if (a.approve || a.reject) {
    if (a.approve) apply(a.approve, 'approved');
    if (a.reject) apply(a.reject, 'rejected');
    for (const { file, data } of all) writeJson(file, data);
    return;
  }
  if (!reviewer) throw new Error('A reviewer name is required (--reviewer=Name)');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const l of pending) {
      console.log(`\n${showLine(l)}`);
      if (!isEligible(l)) { console.log('    (skipped: run scripts/bedrock-check.mjs first, or it failed a check)'); continue; }
      const ans = (await rl.question('    approve (a) / reject (r) / skip (s) / quit (q)? ')).trim().toLowerCase();
      if (ans === 'q') break;
      if (ans === 'a') decide(l, 'approved', reviewer);
      else if (ans === 'r') decide(l, 'rejected', reviewer);
    }
  } finally { rl.close(); }
  for (const { file, data } of all) writeJson(file, data);
  console.log('\nsaved. next: node scripts/import-approved.mjs');
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
