# Contributing

Thanks for helping. TV Audio Flow is small on purpose; changes should keep it that way.

## Setup

Requires Node 22.18 or newer (tests run TypeScript directly with Node's type stripping).

```sh
npm install
npm run check        # typecheck + tests + build + examples
```

## Ground rules

- **Core stays platform-free.** Nothing in `src/*.ts` may use the DOM, `Audio`, `window` or a UI
  framework (a test enforces this). Platform code goes in an adapter (`src/web/` or a new folder).
- **No runtime dependencies.**
- **Erasable TypeScript only** (no `enum`, no `namespace`, no constructor parameter properties),
  so Node can run the sources directly. `tsconfig.json` sets `erasableSyntaxOnly`.
- **Every behaviour change needs a deterministic test.** Use `MockAdapter` and `ManualScheduler`;
  do not use real timers or sleeps. Race conditions get their own test.
- **State changes go through the transition table** (`src/state.ts`). If you add a transition,
  document it in the README's state model section.
- Keep error codes stable; adding a code is a minor version, changing one is a major version.

## Pull requests

1. Fork, branch from `main`.
2. `npm run check` must pass.
3. Add a line under "Unreleased" in `CHANGELOG.md`.
4. Describe the user-visible behaviour and the test that covers it.

## Reporting bugs

Include the platform (browser / WebView version, device), the step list, the sequence of
events you saw (`sequence.on('state', ...)` output helps) and what you expected.
