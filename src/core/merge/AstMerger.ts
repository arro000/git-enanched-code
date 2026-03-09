import { ConflictChunk } from '../git/ConflictParser';
import { SupportedLanguage } from './LanguageDetector';
import { AstPattern, scoreConfidence } from './ConfidenceScorer';

export interface AstMergeCandidate {
  resolvedLines: string[];
  confidence: number;
  pattern: AstPattern;
}

export type AstResolvedChunks = Map<number, AstMergeCandidate>;

// ---------------------------------------------------------------------------
// Import line detection
// ---------------------------------------------------------------------------

/** Returns true if the line is an import/using/use statement for the language. */
function isImportLine(line: string, lang: SupportedLanguage): boolean {
  const trimmed = line.trimStart();
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return /^import\s/.test(trimmed);
    case 'csharp':
      return /^using\s+[\w.]+\s*;/.test(trimmed);
    case 'java':
      return /^import\s+[\w.*]+\s*;/.test(trimmed);
    case 'kotlin':
      return /^import\s+[\w.*]+/.test(trimmed);
    case 'rust':
      return /^use\s+[\w:*{}]+/.test(trimmed);
    default:
      return false;
  }
}

/**
 * Extracts the canonical module/namespace key from an import line.
 * Used to detect overlapping imports (same module imported by both sides).
 */
function extractImportKey(line: string, lang: SupportedLanguage): string | null {
  const trimmed = line.trim();
  switch (lang) {
    case 'typescript':
    case 'javascript': {
      // import X from 'path'  |  import { X } from 'path'  |  import * as X from 'path'
      const fromMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
      if (fromMatch) return fromMatch[1];
      // import 'path'  (side-effect import)
      const bareMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
      return bareMatch ? bareMatch[1] : null;
    }
    case 'csharp': {
      const m = trimmed.match(/^using\s+([\w.]+)\s*;/);
      return m ? m[1] : null;
    }
    case 'java': {
      const m = trimmed.match(/^import\s+([\w.*]+)\s*;/);
      return m ? m[1] : null;
    }
    case 'kotlin': {
      const m = trimmed.match(/^import\s+([\w.*]+)/);
      return m ? m[1] : null;
    }
    case 'rust': {
      const m = trimmed.match(/^use\s+([\w:*{}]+)/);
      return m ? m[1] : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Function declaration detection
// ---------------------------------------------------------------------------

/**
 * Extracts the function/method name from a declaration line, or null if the
 * line is not a top-level function declaration.
 */
function extractFunctionName(line: string, lang: SupportedLanguage): string | null {
  const trimmed = line.trimStart();
  switch (lang) {
    case 'typescript':
    case 'javascript': {
      // Standard function declaration: (export) (default) (async) function name(
      const fnDecl = trimmed.match(
        /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*[(<]/
      );
      if (fnDecl) return fnDecl[1];
      // Const/let arrow or function expression: (export) const name = (async) (
      const constFn = trimmed.match(
        /^(?:export\s+)?(?:const|let)\s+(\w+)[\s:]*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/
      );
      if (constFn) return constFn[1];
      const constFn2 = trimmed.match(
        /^(?:export\s+)?(?:const|let)\s+(\w+)[\s:=\w<>|&[\]]+\s*=\s*(?:async\s+)?function/
      );
      if (constFn2) return constFn2[1];
      return null;
    }
    case 'csharp': {
      // Access modifier? Return type? MethodName(
      const m = trimmed.match(
        /^(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed|extern)\s+)+[\w<>[\],?\s]+\s+(\w+)\s*\(/
      );
      return m ? m[1] : null;
    }
    case 'java': {
      const m = trimmed.match(
        /^(?:(?:public|private|protected|static|final|abstract|synchronized|native|default)\s+)+[\w<>[\],?\s]+\s+(\w+)\s*\(/
      );
      return m ? m[1] : null;
    }
    case 'kotlin': {
      const m = trimmed.match(
        /^(?:(?:override|private|public|protected|internal|open|abstract|suspend|inline|tailrec)\s+)*fun\s+(\w+)/
      );
      return m ? m[1] : null;
    }
    case 'rust': {
      const m = trimmed.match(/^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+(\w+)/);
      return m ? m[1] : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Block structure analysis
// ---------------------------------------------------------------------------

type StructureType = 'imports' | 'functions' | 'none';

interface BlockStructure {
  type: StructureType;
  /** Canonical identifiers (module paths for imports, function names for functions). */
  keys: string[];
}

/**
 * Analyses a set of lines to determine their structural type.
 *
 * - 'imports':   every non-blank line is an import/using/use statement
 * - 'functions': the first non-blank line is a function/method declaration
 * - 'none':      pattern not recognised or block is empty
 */
function analyzeBlock(lines: string[], lang: SupportedLanguage): BlockStructure {
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  if (nonEmpty.length === 0) return { type: 'none', keys: [] };

  // --- Try imports ---
  const importKeys: string[] = [];
  let allImports = true;
  for (const line of nonEmpty) {
    if (!isImportLine(line, lang)) {
      allImports = false;
      break;
    }
    const key = extractImportKey(line, lang);
    if (key !== null) importKeys.push(key);
  }
  if (allImports && importKeys.length > 0) {
    return { type: 'imports', keys: importKeys };
  }

  // --- Try functions ---
  // We only need the first non-blank line to carry a function declaration;
  // the rest of the block is assumed to be the function body.
  const firstFnName = extractFunctionName(nonEmpty[0], lang);
  if (firstFnName !== null) {
    // Collect all top-level function names in the block (there may be multiple adjacent definitions).
    const fnNames: string[] = [firstFnName];
    // Scan further lines at indent-0 for additional declarations.
    for (let i = 1; i < nonEmpty.length; i++) {
      const name = extractFunctionName(nonEmpty[i], lang);
      if (name !== null && nonEmpty[i].match(/^\S/)) {
        // Only accept zero-indented declarations as additional top-level functions.
        fnNames.push(name);
      }
    }
    return { type: 'functions', keys: fnNames };
  }

  return { type: 'none', keys: [] };
}

// ---------------------------------------------------------------------------
// Merge strategies
// ---------------------------------------------------------------------------

function mergeImports(
  headLines: string[],
  mergingLines: string[],
  lang: SupportedLanguage
): string[] {
  // Combine, deduplicate, and sort alphabetically (standard import convention).
  const seen = new Set<string>();
  const combined: string[] = [];
  for (const line of [...headLines, ...mergingLines]) {
    if (line.trim() === '') continue;
    const key = extractImportKey(line, lang) ?? line.trim();
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(line);
    }
  }
  return combined.sort((a, b) => a.trim().localeCompare(b.trim()));
}

function mergeFunctions(headLines: string[], mergingLines: string[]): string[] {
  // Preserve HEAD lines first, then MERGING lines with an empty-line separator.
  const result: string[] = [...headLines];
  if (result.length > 0 && mergingLines.length > 0) {
    result.push('');
  }
  result.push(...mergingLines);
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyses conflict chunks that diff3 could not resolve and proposes
 * AST-compatible auto-resolutions (imports block merge, function additions).
 *
 * Uses structural pattern detection (regex-based) targeting the same semantic
 * patterns that tree-sitter would expose: import statements and top-level
 * function/method declarations.  The interface is designed so this analysis
 * layer can be transparently replaced with a tree-sitter backed implementation
 * when grammar bundling is available.
 */
export class AstMerger {
  /**
   * Analyses all provided chunks and returns candidates for auto-resolution.
   * Runs asynchronously so it does not block the Extension Host.
   * Per-chunk errors are silently ignored (RNF-04 graceful fallback).
   *
   * @param chunks   Conflict chunks still unresolved after diff3
   * @param language Language detected from the file path
   */
  async analyzeChunks(
    chunks: ConflictChunk[],
    language: SupportedLanguage
  ): Promise<AstResolvedChunks> {
    const results: AstResolvedChunks = new Map();

    for (const chunk of chunks) {
      try {
        const candidate = this.analyzeChunk(chunk, language);
        if (candidate !== null) {
          results.set(chunk.startLine, candidate);
        }
      } catch {
        // Per-chunk AST errors never crash the analysis (RNF-04).
      }
    }

    return results;
  }

  /**
   * Analyses a single conflict chunk for semantic compatibility.
   * Returns a candidate resolution or null if auto-resolution is not safe.
   */
  analyzeChunk(chunk: ConflictChunk, language: SupportedLanguage): AstMergeCandidate | null {
    if (language === 'unknown') return null;

    const headStructure = analyzeBlock(chunk.headLines, language);
    const mergingStructure = analyzeBlock(chunk.mergingLines, language);

    if (headStructure.type === 'none' || mergingStructure.type === 'none') return null;
    if (headStructure.type !== mergingStructure.type) return null;

    // Detect identifier overlap — if any key appears on both sides the merge is not safe.
    const headKeys = new Set(headStructure.keys);
    const hasOverlap = mergingStructure.keys.some((k) => headKeys.has(k));
    if (hasOverlap) return null;

    const pattern = headStructure.type as AstPattern;
    const confidence = scoreConfidence(pattern);

    let resolvedLines: string[];
    if (pattern === 'imports') {
      resolvedLines = mergeImports(chunk.headLines, chunk.mergingLines, language);
    } else {
      resolvedLines = mergeFunctions(chunk.headLines, chunk.mergingLines);
    }

    return { resolvedLines, confidence, pattern };
  }
}
