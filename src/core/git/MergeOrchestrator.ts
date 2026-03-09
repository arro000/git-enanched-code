import * as fs from 'fs/promises';
import { GitService } from './GitService';
import { parseConflicts, hasConflictMarkers, ConflictChunk } from './ConflictParser';

export interface MergeSession {
  filePath: string;
  originalContent: string;
  chunks: ConflictChunk[];
  /** Map from conflict startLine to resolved lines */
  resolvedChunks: Map<number, string[]>;
}

export class MergeOrchestrator {
  private activeSessions: Map<string, MergeSession> = new Map();

  constructor(private readonly gitService: GitService) {}

  /**
   * Opens a merge session for the given file.
   * Returns null if the file has no conflict markers.
   */
  async openSession(filePath: string): Promise<MergeSession | null> {
    const content = await fs.readFile(filePath, 'utf-8');

    if (!hasConflictMarkers(content)) {
      return null;
    }

    const { chunks } = parseConflicts(content);
    const session: MergeSession = {
      filePath,
      originalContent: content,
      chunks,
      resolvedChunks: new Map(),
    };

    this.activeSessions.set(filePath, session);
    return session;
  }

  /**
   * Resolves a conflict chunk with the given lines.
   */
  resolveChunk(filePath: string, startLine: number, resolvedLines: string[]): void {
    const session = this.activeSessions.get(filePath);
    if (!session) {
      throw new Error(`No active merge session for ${filePath}`);
    }
    session.resolvedChunks.set(startLine, resolvedLines);
  }

  /**
   * Removes a resolved chunk from the session, making the conflict open again.
   * Used when the user undoes an applied chunk via the discard button.
   */
  unresolveChunk(filePath: string, startLine: number): void {
    const session = this.activeSessions.get(filePath);
    if (!session) {
      throw new Error(`No active merge session for ${filePath}`);
    }
    session.resolvedChunks.delete(startLine);
  }

  /**
   * Returns the number of unresolved conflicts in the session.
   */
  getUnresolvedCount(filePath: string): number {
    const session = this.activeSessions.get(filePath);
    if (!session) return 0;
    return session.chunks.filter(
      (c) => !session.resolvedChunks.has(c.startLine)
    ).length;
  }

  /**
   * Completes the merge: saves the resolved file and runs `git add`.
   * Returns false if there are unresolved conflicts (caller decides to proceed or not).
   * The operation is atomic: if `git add` fails after the file is written, the original
   * file content is restored so no partial state is left on disk.
   */
  async completeMerge(
    filePath: string,
    forceWithUnresolved = false
  ): Promise<{ success: boolean; unresolvedCount: number; error?: string }> {
    const session = this.activeSessions.get(filePath);
    if (!session) {
      return { success: false, unresolvedCount: 0 };
    }

    const unresolvedCount = this.getUnresolvedCount(filePath);
    if (unresolvedCount > 0 && !forceWithUnresolved) {
      return { success: false, unresolvedCount };
    }

    try {
      const resolvedContent = this.buildResolvedContent(session);
      await fs.writeFile(filePath, resolvedContent, 'utf-8');

      try {
        await this.gitService.stageFile(filePath);
      } catch (stageError) {
        // Atomicity: restore the original conflict file so the user isn't left
        // with a saved-but-not-staged file that has no conflict markers.
        await fs.writeFile(filePath, session.originalContent, 'utf-8').catch(() => {});
        throw stageError;
      }

      this.activeSessions.delete(filePath);
      return { success: true, unresolvedCount: 0 };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[MergeOrchestrator] Failed to complete merge:', error);
      return { success: false, unresolvedCount, error: errorMessage };
    }
  }

  /**
   * Checks if a string contains conflict markers.
   * Exposed for use in the extension interceptor.
   */
  hasConflictMarkers(content: string): boolean {
    return hasConflictMarkers(content);
  }

  getSession(filePath: string): MergeSession | undefined {
    return this.activeSessions.get(filePath);
  }

  private buildResolvedContent(session: MergeSession): string {
    const lines = session.originalContent.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const chunk = session.chunks.find((c) => c.startLine === i);
      if (chunk) {
        const resolved = session.resolvedChunks.get(chunk.startLine);
        if (resolved !== undefined) {
          result.push(...resolved);
        } else {
          // Unresolved conflict: keep original markers
          for (let j = chunk.startLine; j <= chunk.endLine; j++) {
            result.push(lines[j]);
          }
        }
        i = chunk.endLine + 1;
      } else {
        result.push(lines[i]);
        i++;
      }
    }

    return result.join('\n');
  }
}
