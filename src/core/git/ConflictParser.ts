export interface ConflictChunk {
  /** Zero-based line index where the conflict starts (<<<<<<< line) */
  startLine: number;
  /** Zero-based line index where the conflict ends (>>>>>>> line) */
  endLine: number;
  /** Lines from the HEAD (current branch) */
  headLines: string[];
  /** Lines from the BASE (common ancestor), present only in diff3 style */
  baseLines: string[] | null;
  /** Lines from MERGING (incoming branch) */
  mergingLines: string[];
  /** Label from the <<<<<<< marker (e.g. "HEAD" or branch name) */
  headLabel: string;
  /** Label from the >>>>>>> marker (e.g. branch name) */
  mergingLabel: string;
}

export interface ParsedConflicts {
  chunks: ConflictChunk[];
  /** Non-conflicting lines indexed by their position in the file */
  contextLines: string[];
}

const CONFLICT_START = /^<{7} (.+)$/m;
const CONFLICT_BASE = /^\|{7} (.*)$/;
const CONFLICT_SEP = /^={7}$/;
const CONFLICT_END = /^>{7} (.+)$/;

type ParseState = 'context' | 'head' | 'base' | 'merging';

/**
 * Parses git conflict markers in a file and returns structured conflict data.
 * Supports both standard (2-way) and diff3 (3-way) conflict markers.
 */
export function parseConflicts(content: string): ParsedConflicts {
  const lines = content.split('\n');
  const chunks: ConflictChunk[] = [];
  const contextLines: string[] = [];

  let state: ParseState = 'context';
  let currentChunk: Partial<ConflictChunk> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    switch (state) {
      case 'context': {
        const startMatch = line.match(CONFLICT_START);
        if (startMatch) {
          state = 'head';
          currentChunk = {
            startLine: i,
            headLines: [],
            baseLines: null,
            mergingLines: [],
            headLabel: startMatch[1],
          };
        } else {
          contextLines.push(line);
        }
        break;
      }

      case 'head': {
        if (CONFLICT_BASE.test(line)) {
          state = 'base';
          currentChunk!.baseLines = [];
        } else if (CONFLICT_SEP.test(line)) {
          state = 'merging';
        } else {
          currentChunk!.headLines!.push(line);
        }
        break;
      }

      case 'base': {
        if (CONFLICT_SEP.test(line)) {
          state = 'merging';
        } else {
          currentChunk!.baseLines!.push(line);
        }
        break;
      }

      case 'merging': {
        const endMatch = line.match(CONFLICT_END);
        if (endMatch) {
          state = 'context';
          currentChunk!.endLine = i;
          currentChunk!.mergingLabel = endMatch[1];
          chunks.push(currentChunk as ConflictChunk);
          currentChunk = null;
        } else {
          currentChunk!.mergingLines!.push(line);
        }
        break;
      }
    }
  }

  return { chunks, contextLines };
}

/**
 * Checks if a string contains git conflict markers.
 */
export function hasConflictMarkers(content: string): boolean {
  return CONFLICT_START.test(content);
}

/**
 * Reconstructs file content from resolved chunks and context.
 */
export function reconstructFile(
  originalLines: string[],
  resolvedChunks: Map<number, string[]>
): string {
  const result: string[] = [];
  const lines = originalLines;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const startMatch = line.match(CONFLICT_START);

    if (startMatch) {
      // Find end of conflict
      let endLine = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (CONFLICT_END.test(lines[j])) {
          endLine = j;
          break;
        }
      }

      const resolved = resolvedChunks.get(i);
      if (resolved !== undefined) {
        result.push(...resolved);
      } else {
        // Preserve original conflict markers for unresolved chunks (RNF-04)
        for (let j = i; j <= endLine; j++) {
          result.push(lines[j]);
        }
      }
      // Skip to after conflict end
      i = endLine + 1;
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}
