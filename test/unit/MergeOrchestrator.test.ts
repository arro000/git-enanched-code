import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MergeOrchestrator } from '../../src/core/git/MergeOrchestrator';
import { GitService } from '../../src/core/git/GitService';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fsPromises from 'fs/promises';

const CONFLICT_CONTENT = `function hello() {
<<<<<<< HEAD
  return 'hello from head';
=======
  return 'hello from merging';
>>>>>>> feature/test
}`;

describe('MergeOrchestrator', () => {
  let gitService: GitService;
  let orchestrator: MergeOrchestrator;

  beforeEach(() => {
    gitService = new GitService();
    vi.spyOn(gitService, 'stageFile').mockResolvedValue(undefined);
    orchestrator = new MergeOrchestrator(gitService);
    vi.mocked(fsPromises.readFile).mockResolvedValue(CONFLICT_CONTENT as never);
  });

  it('opens a session for a file with conflicts', async () => {
    const session = await orchestrator.openSession('/fake/file.ts');
    expect(session).not.toBeNull();
    expect(session!.chunks).toHaveLength(1);
    expect(session!.filePath).toBe('/fake/file.ts');
  });

  it('returns null for a file without conflicts', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('no conflicts here' as never);
    const session = await orchestrator.openSession('/fake/file.ts');
    expect(session).toBeNull();
  });

  it('throws on read error so the caller can log and fall back', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));
    await expect(orchestrator.openSession('/fake/missing.ts')).rejects.toThrow('ENOENT');
  });

  it('resolves a chunk', async () => {
    await orchestrator.openSession('/fake/file.ts');
    orchestrator.resolveChunk('/fake/file.ts', 1, ["  return 'resolved';"]); // startLine=1
    expect(orchestrator.getUnresolvedCount('/fake/file.ts')).toBe(0);
  });

  it('tracks unresolved count', async () => {
    await orchestrator.openSession('/fake/file.ts');
    expect(orchestrator.getUnresolvedCount('/fake/file.ts')).toBe(1);
  });

  it('returns unresolved count 0 for unknown file', () => {
    expect(orchestrator.getUnresolvedCount('/unknown.ts')).toBe(0);
  });

  it('completeMerge returns false with unresolved conflicts when not forced', async () => {
    await orchestrator.openSession('/fake/file.ts');
    const result = await orchestrator.completeMerge('/fake/file.ts', false);
    expect(result.success).toBe(false);
    expect(result.unresolvedCount).toBe(1);
  });

  it('completeMerge succeeds when all conflicts resolved', async () => {
    await orchestrator.openSession('/fake/file.ts');
    orchestrator.resolveChunk('/fake/file.ts', 1, ["  return 'resolved';"]);
    const result = await orchestrator.completeMerge('/fake/file.ts', false);
    expect(result.success).toBe(true);
    expect(gitService.stageFile).toHaveBeenCalledWith('/fake/file.ts');
  });

  it('completeMerge with force proceeds despite unresolved conflicts', async () => {
    await orchestrator.openSession('/fake/file.ts');
    const result = await orchestrator.completeMerge('/fake/file.ts', true);
    expect(result.success).toBe(true);
  });

  it('completeMerge includes error message on failure', async () => {
    await orchestrator.openSession('/fake/file.ts');
    orchestrator.resolveChunk('/fake/file.ts', 1, ["  return 'resolved';"]);
    vi.spyOn(gitService, 'stageFile').mockRejectedValueOnce(new Error('git not initialized'));
    const result = await orchestrator.completeMerge('/fake/file.ts', false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('git not initialized');
  });

  it('completeMerge restores original file if git add fails', async () => {
    await orchestrator.openSession('/fake/file.ts');
    orchestrator.resolveChunk('/fake/file.ts', 1, ["  return 'resolved';"]);
    vi.spyOn(gitService, 'stageFile').mockRejectedValueOnce(new Error('stage failed'));
    const writeFileMock = vi.mocked(fsPromises.writeFile);
    writeFileMock.mockClear();

    await orchestrator.completeMerge('/fake/file.ts', false);

    // First call: write resolved content; second call: restore original
    expect(writeFileMock).toHaveBeenCalledTimes(2);
    expect(writeFileMock.mock.calls[1][1]).toBe(CONFLICT_CONTENT);
  });

  it('completeMerge does not call git add if writeFile fails', async () => {
    await orchestrator.openSession('/fake/file.ts');
    orchestrator.resolveChunk('/fake/file.ts', 1, ["  return 'resolved';"]);
    vi.mocked(fsPromises.writeFile).mockRejectedValueOnce(new Error('disk full'));
    const stageFileSpy = vi.spyOn(gitService, 'stageFile');

    const result = await orchestrator.completeMerge('/fake/file.ts', false);

    expect(result.success).toBe(false);
    expect(result.error).toContain('disk full');
    expect(stageFileSpy).not.toHaveBeenCalled();
  });

  it('completeMerge success returns no error field', async () => {
    await orchestrator.openSession('/fake/file.ts');
    orchestrator.resolveChunk('/fake/file.ts', 1, ["  return 'resolved';"]);
    const result = await orchestrator.completeMerge('/fake/file.ts', false);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('unresolveChunk removes the chunk so conflict counts as unresolved again', async () => {
    await orchestrator.openSession('/fake/file.ts');
    orchestrator.resolveChunk('/fake/file.ts', 1, ["  return 'resolved';"]);
    expect(orchestrator.getUnresolvedCount('/fake/file.ts')).toBe(0);
    orchestrator.unresolveChunk('/fake/file.ts', 1);
    expect(orchestrator.getUnresolvedCount('/fake/file.ts')).toBe(1);
  });

  it('unresolveChunk throws for unknown file', async () => {
    expect(() => orchestrator.unresolveChunk('/unknown.ts', 0)).toThrow('No active merge session');
  });

  it('hasConflictMarkers delegates correctly', () => {
    expect(orchestrator.hasConflictMarkers(CONFLICT_CONTENT)).toBe(true);
    expect(orchestrator.hasConflictMarkers('no conflicts')).toBe(false);
  });
});
