import * as path from 'path';

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'csharp'
  | 'java'
  | 'kotlin'
  | 'rust'
  | 'unknown';

const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.vue': 'javascript',
  '.cs': 'csharp',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.rs': 'rust',
};

/**
 * Maps VS Code languageId strings to SupportedLanguage.
 * Used as a higher-priority signal than file extension — VS Code's language
 * detection already accounts for edge cases (shebangs, embedded scripts, etc.)
 *
 * To add support for a new language, add an entry here AND in
 * EXTENSION_TO_LANGUAGE above, then implement the structural analysis rules
 * in AstMerger (isImportLine, extractImportKey, extractFunctionName).
 * See CONTRIBUTING.md for the full walkthrough.
 */
const VSCODE_LANGUAGE_ID_MAP: Record<string, SupportedLanguage> = {
  typescript: 'typescript',
  typescriptreact: 'typescript',   // .tsx files
  javascript: 'javascript',
  javascriptreact: 'javascript',   // .jsx files
  vue: 'javascript',               // Vue SFC — JS/TS template and script blocks
  csharp: 'csharp',
  java: 'java',
  kotlin: 'kotlin',
  rust: 'rust',
};

/**
 * Detects the programming language for AST-based merge analysis.
 *
 * Resolution order (highest priority first):
 * 1. VS Code `languageId` — most reliable; already accounts for embedded
 *    scripts, framework conventions, and user overrides.
 * 2. File extension — used when no languageId is provided (e.g. in tests).
 *
 * Returns 'unknown' for unsupported languages; the AstMerger will skip
 * structural analysis for those files and diff3-only resolution applies.
 *
 * @param filePath   Absolute path to the file (used for extension fallback)
 * @param languageId Optional VS Code languageId (document.languageId)
 */
export function detectLanguage(filePath: string, languageId?: string): SupportedLanguage {
  if (languageId) {
    const fromId = VSCODE_LANGUAGE_ID_MAP[languageId];
    if (fromId) return fromId;
  }
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? 'unknown';
}
