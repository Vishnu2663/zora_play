import type { ActionStep, ClipStep, DelayStep } from './types.ts';
/** `clip('intro.mp3', 'intro')` → a clip step. */
export declare function clip<S>(source: S, label?: string): ClipStep<S>;
/** `delay(600)` → a delay step. */
export declare function delay(ms: number, label?: string): DelayStep;
/** `action(() => showButtons())` → an action step. */
export declare function action(run: () => void, label?: string): ActionStep;
//# sourceMappingURL=builders.d.ts.map