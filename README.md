# Git Enhanced

**A powerful 3-column merge editor for VS Code with smart, automatic conflict resolution.**

Git Enhanced replaces the default merge editor with a fully custom experience: three side-by-side Monaco Editor panes (yours · result · theirs), an intelligent auto-resolve engine, and a conflict minimap — so you can resolve merge conflicts faster and with more confidence.

---

## Features

### Three-Column Merge Editor
Open any file with Git conflict markers in a clean three-column layout:

| Left | Center | Right |
|------|--------|-------|
| **HEAD** (your changes) — read-only | **Result** — fully editable | **MERGING** (incoming) — read-only |

Syntax highlighting, code folding, and the full power of Monaco Editor are available in all three panes.

### Smart Auto-Resolution (two layers)

Git Enhanced automatically resolves conflicts that don't need human intervention:

- **Layer 1 — diff3 analysis**: detects non-overlapping changes between HEAD, BASE and MERGING and resolves them with full confidence.
- **Layer 2 — AST analysis**: uses [Tree-sitter](https://tree-sitter.github.io/) to parse the conflicting code and identify semantically compatible patterns (e.g. non-overlapping imports, methods added in different classes). Supported languages: TypeScript, JavaScript, C#, Java, Kotlin, Rust.

Each auto-resolved conflict is marked with its source (`diff3-auto` or `ast-auto`) and a confidence score.

### Conflict Minimap & Navigation
- A minimap on the right side shows all conflicts at a glance and lets you jump to any of them instantly.
- Keyboard shortcuts `F7` / `Shift+F7` navigate to the next/previous conflict without leaving the keyboard.

### Session State Persistence
Your progress is automatically saved. If you close and reopen the editor mid-merge, resolved conflicts are restored exactly where you left them.

### One-Click Merge Completion
When all conflicts are resolved, the **Complete Merge** command saves the file and runs `git add` — no terminal needed.

### Auto & Manual Activation Modes
- **Auto** (default): the merge editor opens automatically whenever a file with conflict markers is opened or focused.
- **Manual**: open the editor on demand via the Command Palette (`Git Enhanced: Open Merge Editor`).

### Onboarding Wizard
A three-step wizard walks new users through the extension on first launch.

### Graceful Fallback
If anything goes wrong, Git Enhanced automatically falls back to VS Code's native text editor so you never lose access to your files.

---

## Usage

### Auto mode (default)
Open any file that contains Git conflict markers — the merge editor launches automatically.

### Manual mode
1. Open a conflicted file in the text editor.
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **Git Enhanced: Open Merge Editor**.

### Complete a merge
Once all conflicts are resolved, run **Git Enhanced: Complete Merge** from the Command Palette (or use the button inside the editor). The file is saved and staged with `git add`.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `F7` | Navigate to next conflict |
| `Shift+F7` | Navigate to previous conflict |

---

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `gitEnhanced.activationMode` | `"auto"` \| `"manual"` | `"auto"` | Controls how the merge editor is opened when a conflict is detected. |

---

## Requirements

- VS Code **1.85.0** or later
- Git installed and available in `PATH`

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, architecture overview, and how to add Tree-sitter grammar support for new languages.

---

## License

[MIT](LICENSE)
