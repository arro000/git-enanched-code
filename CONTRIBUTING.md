# Contributing to Git Enhanced

Thank you for your interest in contributing! This document covers setup, architecture overview, and the most common contribution type: **adding support for a new programming language**.

---

## Local Setup

```bash
git clone https://github.com/your-org/git-enhanced.git
cd git-enhanced
npm install
npm run build        # esbuild bundle
npm run test         # Vitest unit tests
npm run typecheck    # TypeScript compiler check
```

Open the project in VS Code and press **F5** to launch an Extension Development Host.

---

## Running Tests

```bash
npm run test              # unit tests (Vitest)
npm run test:coverage     # with coverage report
npm run typecheck         # tsc --noEmit
npm run lint              # ESLint
```

Unit tests live in `test/unit/`. Integration tests (requiring VS Code) live in `test/integration/`.

---

## Adding Support for a New Language

Git Enhanced uses **structural pattern analysis** (regex-based) that mirrors what a full Tree-sitter AST would expose for the merge patterns we care about: import blocks and top-level function/method declarations. The implementation is designed so a true tree-sitter backend can replace any language's analysis transparently in the future.

Adding a new language requires changes in three files:

### 1. `src/core/merge/LanguageDetector.ts`

Add the file extensions and (if VS Code uses a specific `languageId`) the VS Code language ID.

```ts
// In EXTENSION_TO_LANGUAGE:
'.ex': 'elixir',
'.exs': 'elixir',

// In VSCODE_LANGUAGE_ID_MAP:
elixir: 'elixir',
```

Also extend the `SupportedLanguage` union type:

```ts
export type SupportedLanguage =
  | 'typescript'
  // ... existing languages ...
  | 'elixir'        // <-- add here
  | 'unknown';
```

### 2. `src/core/merge/AstMerger.ts`

Implement three functions for the new language in the existing switch statements:

**`isImportLine(line, lang)`** — return `true` if the line is an import/use/require statement.

```ts
case 'elixir':
  return /^import\s+\w+/.test(trimmed) || /^alias\s+\w+/.test(trimmed);
```

**`extractImportKey(line, lang)`** — return a canonical string (module path) to detect duplicate imports.

```ts
case 'elixir': {
  const m = trimmed.match(/^(?:import|alias)\s+([\w.]+)/);
  return m ? m[1] : null;
}
```

**`extractFunctionName(line, lang)`** — return the function name if the line is a top-level function declaration, or `null` otherwise.

```ts
case 'elixir': {
  const m = trimmed.match(/^def\s+(\w+)/);
  return m ? m[1] : null;
}
```

### 3. `test/unit/AstMerger.test.ts`

Add a `describe` block for the new language covering at minimum:

- Import merging: distinct modules → auto-resolved
- Import merging: same module on both sides → returns `null` (not safe)
- Function addition: non-overlapping function names → auto-resolved
- `'unknown'` language → returns `null`

See existing test blocks for TypeScript/Java as reference patterns.

---

## Supported Languages (v1.0)

| Language | Extensions | VS Code languageId(s) |
|----------|-----------|----------------------|
| TypeScript | `.ts`, `.tsx` | `typescript`, `typescriptreact` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs`, `.vue` | `javascript`, `javascriptreact`, `vue` |
| C# | `.cs` | `csharp` |
| Java | `.java` | `java` |
| Kotlin | `.kt`, `.kts` | `kotlin` |
| Rust | `.rs` | `rust` |

For unsupported languages the AST analysis is skipped and only diff3 resolution applies (no degradation in correctness, just fewer auto-resolutions).

---

## Code Style

- TypeScript strict mode is enabled — no `any` casts without justification
- Prefer `const`; avoid mutation where possible
- All async operations that run before `openSession` returns must follow the **graceful fallback pattern**: wrap in `try/catch {}` so the editor always opens (RNF-04)
- Do not add comments where the logic is self-evident

---

## Pull Request Checklist

- [ ] Tests added / updated for all changed behaviour
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run test` passes
- [ ] `npm run lint` passes
- [ ] CHANGELOG.md updated under `[Unreleased]`
