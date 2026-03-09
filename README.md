# Git Enhanced - Advanced Merge Editor for VS Code

A professional 3-column merge editor for VS Code, bringing IntelliJ-quality conflict resolution to your editor.

## Features

- **3-Column Layout**: HEAD (your code) | RESULT (editable) | MERGING (incoming)
- **Monaco Editor** in the center column: syntax highlighting, IntelliSense
- **Chunk application**: `>>` and `<<` to apply chunks, `x` to discard
- **Smart Merge Engine**: diff3 + Tree-sitter AST auto-resolution (v0.2.0)
- **Visual Minimap**: color-coded conflict overview with click-to-jump
- **Keyboard Navigation**: F7 / Shift+F7 to jump between conflicts
- **Onboarding Wizard**: 3-screen setup guide, reopnable from Command Palette

## Installation

Search for "Git Enhanced" in the VS Code Extension Marketplace or install from [Open VSX Registry](https://open-vsx.org).

## Usage

1. When a merge conflict is detected, Git Enhanced opens automatically (configurable)
2. Use `>>` / `<<` to apply chunks from left/right columns to the result
3. Edit the center column directly with full Monaco editor support
4. Click "Complete Merge" when done — the file is saved and `git add` is run

## Commands

| Command | Description |
|---------|-------------|
| `Git Enhanced: Open Merge Editor` | Manually open the merge editor for the active file |
| `Git Enhanced: Open Onboarding` | Reopen the onboarding wizard |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `F7` | Jump to next conflict |
| `Shift+F7` | Jump to previous conflict |

## Development

```bash
npm install
npm run build      # production build
npm run watch      # development watch mode
npm run typecheck  # type checking
npm run test       # run unit tests
```

## License

MIT
