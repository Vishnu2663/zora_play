// Minimal shims for typechecking the UI layer (scripts/typecheck-ui.mjs).
declare module '*.css';
declare module 'react-dom/client' {
  export function createRoot(el: Element): { render(node: unknown): void };
}
