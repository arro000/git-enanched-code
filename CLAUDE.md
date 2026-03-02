# Git Enhanced — Claude Code Guidelines

## Project overview
VS Code extension that provides an advanced 3-column merge editor with smart conflict resolution.

## Project structure
```
src/          Source code only — no test files
test/
  unit/       Unit tests, mirroring src/ directory structure
  integration/Integration tests
out/          Compiled output (gitignored)
```

## Test conventions
- Tests live in `test/`, **never** colocated inside `src/`
- Mirror the `src/` path: `src/core/git/Foo.ts` → `test/unit/core/git/Foo.test.ts`
- Use relative paths from the test file back to `src/`: `../../../../src/core/git/Foo`
- Test runner: **Vitest** (`npm test`)
- `vitest.config.ts` includes `test/**/*.test.ts`

## Build
- `npm run build` — esbuild bundle → `out/extension.js`
- `npm run compile` — TypeScript type-check only (no emit)
- `npm run watch` — incremental build

## Key files
- `src/extension.ts` — extension entry point
- `src/core/git/ConflictDetector.ts` — conflict marker detection
- `src/ui/MergeEditorProvider.ts` — custom editor provider
- `src/config/ConfigManager.ts` — extension configuration
