import * as fs from 'fs/promises';
import { GitService } from './GitService';
import { parseConflicts, hasConflictMarkers, ConflictChunk } from './ConflictParser';
import { Diff3Resolver } from '../merge/Diff3Resolver';
import { AstMerger, AstMergeCandidate } from '../merge/AstMerger';
import { detectLanguage } from '../merge/LanguageDetector';

export interface MergeSession {
  filePath: string;
  originalContent: string;
  chunks: ConflictChunk[];
  /** Map from conflict startLine to resolved lines (auto-applied: diff3). */
  resolvedChunks: Map<number, string[]>;
  /**
   * AST-based resolution candidates (not yet applied to resolvedChunks).
   * Applied in bulk when the user clicks the wand (US-12).
   */
  astResolutions: Map<number, AstMergeCandidate>;
}

export class MergeOrchestrator {
  private activeSessions: Map<string, MergeSession> = new Map();
  private readonly diff3Resolver = new Diff3Resolver();
  private readonly astMerger = new AstMerger();

  constructor(private readonly gitService: GitService) {}

  /**
   * Opens a merge session for the given file.
   * Returns null if the file has no conflict markers.
   *
   * @param filePath   Absolute path to the conflict file
   * @param languageId Optional VS Code languageId (document.languageId).
   *                   When provided, used as the primary signal for AST language
   *                   detection; falls back to file extension otherwise.
   */
  async openSession(filePath: string, languageId?: string): Promise<MergeSession | null> {
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
      astResolutions: new Map(),
    };

    // Pre-resolve non-conflicting chunks via diff3 (RF-03, RF-04).
    // Errors are swallowed so the editor always opens (RNF-04).
    await this.applyDiff3PreResolution(session);

    // Analyse remaining chunks for AST-compatible resolutions (RF-04, US-11).
    // Results stored in session.astResolutions; applied on wand click (US-12).
    await this.applyAstAnalysis(session, languageId);

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

  /**
   * Applies all pending AST resolution candidates to resolvedChunks.
   * Called when the user clicks the wand button (US-12).
   */
  applyWandResolutions(filePath: string): void {
    const session = this.activeSessions.get(filePath);
    if (!session) return;
    for (const [startLine, candidate] of session.astResolutions) {
      if (!session.resolvedChunks.has(startLine)) {
        session.resolvedChunks.set(startLine, candidate.resolvedLines);
      }
    }
    session.astResolutions.clear();
  }

  /**
   * Runs diff3 auto-resolution and populates session.resolvedChunks for all
   * chunks that can be resolved without user interaction.
   * Never throws — failures are silently ignored so the editor opens anyway.
   */
  private async applyDiff3PreResolution(session: MergeSession): Promise<void> {
    try {
      let oursContent: string | undefined;
      let baseContent: string | undefined;
      let theirsContent: string | undefined;

      if (this.gitService.isInitialized()) {
        try {
          [oursContent, baseContent, theirsContent] = await Promise.all([
            this.gitService.getFileAtStage(session.filePath, 2),
            this.gitService.getFileAtStage(session.filePath, 1),
            this.gitService.getFileAtStage(session.filePath, 3),
          ]);
        } catch {
          // Git stages not available (e.g. file not in merge state) — use chunk-level only
        }
      }

      const resolvedChunks = await this.diff3Resolver.resolveChunks(
        session.chunks,
        oursContent,
        baseContent,
        theirsContent
      );

      for (const [startLine, lines] of resolvedChunks) {
        session.resolvedChunks.set(startLine, lines);
      }
    } catch {
      // Non-blocking: if diff3 resolution fails entirely, open editor with empty center column
    }
  }

  /**
   * Runs AST-based analysis on the chunks still unresolved after diff3.
   * Results are stored in session.astResolutions (not applied automatically).
   * Never throws — failures are silently ignored so the editor always opens (RNF-04).
   */
  private async applyAstAnalysis(session: MergeSession, languageId?: string): Promise<void> {
    try {
      const unresolvedChunks = session.chunks.filter(
        (c) => !session.resolvedChunks.has(c.startLine)
      );
      if (unresolvedChunks.length === 0) return;

      const language = detectLanguage(session.filePath, languageId);
      const candidates = await this.astMerger.analyzeChunks(unresolvedChunks, language);

      for (const [startLine, candidate] of candidates) {
        session.astResolutions.set(startLine, candidate);
      }
    } catch {
      // Non-blocking: AST analysis failure never prevents the editor from opening.
    }
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
