import type { ActionStep, ClipStep, DelayStep } from './types.ts';

/** `clip('intro.mp3', 'intro')` → a clip step. */
export function clip<S>(source: S, label?: string): ClipStep<S> {
  return label === undefined ? { kind: 'clip', source } : { kind: 'clip', source, label };
}

/** `delay(600)` → a delay step. */
export function delay(ms: number, label?: string): DelayStep {
  return label === undefined ? { kind: 'delay', ms } : { kind: 'delay', ms, label };
}

/** `action(() => showButtons())` → an action step. */
export function action(run: () => void, label?: string): ActionStep {
  return label === undefined ? { kind: 'action', run } : { kind: 'action', run, label };
}
