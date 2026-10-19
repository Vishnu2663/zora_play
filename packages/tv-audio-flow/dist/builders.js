/** `clip('intro.mp3', 'intro')` → a clip step. */
export function clip(source, label) {
    return label === undefined ? { kind: 'clip', source } : { kind: 'clip', source, label };
}
/** `delay(600)` → a delay step. */
export function delay(ms, label) {
    return label === undefined ? { kind: 'delay', ms } : { kind: 'delay', ms, label };
}
/** `action(() => showButtons())` → an action step. */
export function action(run, label) {
    return label === undefined ? { kind: 'action', run } : { kind: 'action', run, label };
}
//# sourceMappingURL=builders.js.map