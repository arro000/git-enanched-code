import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ConflictChunk, parseConflicts } from '../git/ConflictParser';

const execFileAsync = promisify(execFile);

const CONFLICT_START_RE = /^<{7}/;
const CONFLICT_END_RE = /^>{7}/;

/** Result of diff3 resolution: map from originalChunk startLine → resolved lines */
export type Diff3ResolvedChunks = Map<number, string[]>;

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Resolves non-overlapping conflict chunks using the diff3 algorithm.
 *
 * Two resolution strategies (applied in order):
 *  1. Chunk-level diff3: if diff3-style markers (baseLines) are available, resolve
 *     chunks where only one side changed relative to base. Fast, pure TS.
 *  2. File-level via `git merge-file -p`: uses the three clean file versions from
 *     git index stages to run the full diff3 algorithm. Resolves cases that the
 *     chunk-level strategy can't see (e.g. when baseLines aren't present in markers).
 */
export class Diff3Resolver {
  /**
   * Main entry point. Returns a map of startLine → resolvedLines for every chunk
   * that can be auto-resolved. Chunks that are genuine conflicts are omitted.
   *
   * @param chunks        Parsed conflict chunks from the conflict-marker file
   * @param oursContent   Clean HEAD version (git stage :2:) — optional
   * @param baseContent   Clean BASE version (git stage :1:) — optional
   * @param theirsContent Clean MERGING version (git stage :3:) — optional
   */
  async resolveChunks(
    chunks: ConflictChunk[],
    oursContent?: string,
    baseContent?: string,
    theirsContent?: string
  ): Promise<Diff3ResolvedChunks> {
    const resolved: Diff3ResolvedChunks = new Map();

    // Strategy 1: chunk-level diff3 (requires diff3-style conflict markers with baseLines)
    for (const chunk of chunks) {
      const resolution = this.resolveChunkLevel(chunk);
      if (resolution !== null) {
        resolved.set(chunk.startLine, resolution);
      }
    }

    if (resolved.size === chunks.length) {
      return resolved; // all resolved via fast path
    }

    // Strategy 2: git merge-file on clean file versions
    if (oursContent !== undefined && baseContent !== undefined && theirsContent !== undefined) {
      const unresolvedChunks = chunks.filter((c) => !resolved.has(c.startLine));
      if (unresolvedChunks.length > 0) {
        const gitResolved = await this.resolveWithMergeFile(
          unresolvedChunks,
          oursContent,
          baseContent,
          theirsContent
        );
        for (const [startLine, lines] of gitResolved) {
          resolved.set(startLine, lines);
        }
      }
    }

    return resolved;
  }

  /**
   * Chunk-level diff3 resolution.
   * Returns resolved lines when only one side changed relative to base, or both
   * sides made the same change. Returns null for genuine conflicts.
   * Requires chunk.baseLines to be non-null (diff3 marker style).
   */
  resolveChunkLevel(chunk: ConflictChunk): string[] | null {
    if (chunk.baseLines === null) return null;

    const headEqBase = arraysEqual(chunk.headLines, chunk.baseLines);
    const mergingEqBase = arraysEqual(chunk.mergingLines, chunk.baseLines);
    const headEqMerging = arraysEqual(chunk.headLines, chunk.mergingLines);

    if (headEqMerging) return [...chunk.headLines]; // both made same change
    if (headEqBase) return [...chunk.mergingLines]; // only MERGING changed
    if (mergingEqBase) return [...chunk.headLines]; // only HEAD changed
    return null; // genuine conflict
  }

  /**
   * File-level diff3 via `git merge-file -p`.
   * Writes temp files, runs git merge-file, then extracts per-chunk resolutions
   * by walking the ours content and the merged output in parallel.
   */
  private async resolveWithMergeFile(
    chunks: ConflictChunk[],
    oursContent: string,
    baseContent: string,
    theirsContent: string
  ): Promise<Diff3ResolvedChunks> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-enhanced-'));
    try {
      const oursFile = path.join(tmpDir, 'ours.tmp');
      const baseFile = path.join(tmpDir, 'base.tmp');
      const theirsFile = path.join(tmpDir, 'theirs.tmp');

      await Promise.all([
        fs.writeFile(oursFile, oursContent, 'utf-8'),
        fs.writeFile(baseFile, baseContent, 'utf-8'),
        fs.writeFile(theirsFile, theirsContent, 'utf-8'),
      ]);

      let mergedContent: string;
      try {
        // git merge-file exits 0 when no conflicts, positive N when N conflicts remain
        const { stdout } = await execFileAsync(
          'git',
          ['merge-file', '-p', oursFile, baseFile, theirsFile],
          { timeout: 200, maxBuffer: 10 * 1024 * 1024 }
        );
        mergedContent = stdout;
      } catch (err: unknown) {
        const execErr = err as { killed?: boolean; code?: number; stdout?: string };
        if (execErr.killed === true) {
          throw new Error('git merge-file timed out (> 200ms)');
        }
        // Positive exit code: conflicts remain but stdout contains the merged result
        if (typeof execErr.code === 'number' && execErr.code > 0 && execErr.stdout !== undefined) {
          mergedContent = execErr.stdout;
        } else {
          throw err;
        }
      }

      return this.extractResolutionsFromMergedContent(chunks, oursContent, mergedContent);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {/* ignore cleanup errors */});
    }
  }

  /**
   * Compares the merged output (from git merge-file) to the ours content (clean HEAD)
   * to determine which conflict chunks were auto-resolved.
   *
   * Algorithm: walk oursLines and mergedLines in parallel using the headLines of each
   * chunk as a sync point. When a chunk's position in merged has a conflict marker,
   * the chunk is still a genuine conflict. Otherwise the lines at that position are
   * the resolved content.
   */
  private extractResolutionsFromMergedContent(
    originalChunks: ConflictChunk[],
    oursContent: string,
    mergedContent: string
  ): Diff3ResolvedChunks {
    const oursLines = oursContent.split('\n');
    const mergedLines = mergedContent.split('\n');

    // Find the position of each chunk's headLines in oursContent.
    // This maps originalChunk.startLine → line index in oursLines.
    const oursPositions = this.findChunkPositionsInOurs(originalChunks, oursLines);

    const resolved: Diff3ResolvedChunks = new Map();
    let mI = 0; // cursor in mergedLines
    let prevOursEnd = 0; // where we left off in oursLines

    for (const chunk of originalChunks) {
      const oursStart = oursPositions.get(chunk.startLine);
      if (oursStart === undefined) {
        continue; // couldn't locate chunk in ours content (e.g. empty headLines)
      }

      // Context lines between previous chunk end and this chunk start
      // are identical in both ours and merged — advance merged cursor by the same count.
      const contextCount = oursStart - prevOursEnd;
      mI += contextCount;

      if (mI >= mergedLines.length) break;

      if (CONFLICT_START_RE.test(mergedLines[mI])) {
        // Chunk is still a genuine conflict in merged output — skip it
        while (mI < mergedLines.length && !CONFLICT_END_RE.test(mergedLines[mI])) {
          mI++;
        }
        if (mI < mergedLines.length) mI++; // skip >>>>>>> line
      } else {
        // Chunk was auto-resolved — collect resolved lines
        const resolvedLines: string[] = [];
        // Terminator: the first context line that follows the chunk's headLines in ours.
        // When this line reappears in merged, we've consumed all the resolved content.
        const terminator = oursLines[oursStart + chunk.headLines.length];

        while (mI < mergedLines.length) {
          if (CONFLICT_START_RE.test(mergedLines[mI])) break;
          if (terminator !== undefined && mergedLines[mI] === terminator) break;
          resolvedLines.push(mergedLines[mI]);
          mI++;
        }

        resolved.set(chunk.startLine, resolvedLines);
      }

      prevOursEnd = oursStart + chunk.headLines.length;
    }

    return resolved;
  }

  /**
   * Finds the line index in oursLines where each chunk's headLines content begins.
   * Searches sequentially so multiple identical headLines blocks are matched in order.
   */
  private findChunkPositionsInOurs(
    chunks: ConflictChunk[],
    oursLines: string[]
  ): Map<number, number> {
    const positions = new Map<number, number>();
    let searchFrom = 0;

    for (const chunk of chunks) {
      if (chunk.headLines.length === 0) {
        // Deleted-in-HEAD chunk: no content to find in ours
        continue;
      }

      const firstLine = chunk.headLines[0];
      for (let i = searchFrom; i < oursLines.length; i++) {
        if (oursLines[i] !== firstLine) continue;

        // Verify all subsequent headLines match
        let matches = true;
        for (let j = 1; j < chunk.headLines.length; j++) {
          if (oursLines[i + j] !== chunk.headLines[j]) {
            matches = false;
            break;
          }
        }

        if (matches) {
          positions.set(chunk.startLine, i);
          searchFrom = i + chunk.headLines.length;
          break;
        }
      }
    }

    return positions;
  }
}

// Re-export parseConflicts so tests can use it without importing from ConflictParser
export { parseConflicts };
