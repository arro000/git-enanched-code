/** Pattern types that AstMerger can auto-resolve. */
export type AstPattern = 'imports' | 'functions';

/**
 * Base confidence scores for each auto-resolvable pattern type (0–1).
 *
 * - imports (0.90): Merging distinct import statements is deterministic — two imports
 *   from different modules/namespaces can always coexist without semantic conflict.
 * - functions (0.80): Merging distinct function declarations is safe when names
 *   don't overlap, but ordering may occasionally matter (e.g. hoisting edge cases).
 */
const PATTERN_BASE_CONFIDENCE: Record<AstPattern, number> = {
  imports: 0.90,
  functions: 0.80,
};

/**
 * Returns a confidence score (0–1) for an AST-based auto-resolution.
 * Higher values mean the resolution is more likely to be semantically correct.
 */
export function scoreConfidence(pattern: AstPattern): number {
  return PATTERN_BASE_CONFIDENCE[pattern];
}
