import { describe, it, expect } from 'vitest';
import { parseConflicts, hasConflictMarkers, reconstructFile } from '../../src/core/git/ConflictParser';

const SIMPLE_CONFLICT = `line 1
<<<<<<< HEAD
head change
=======
merging change
>>>>>>> feature/branch
line 3`;

const DIFF3_CONFLICT = `line 1
<<<<<<< HEAD
head change
||||||| base
original
=======
merging change
>>>>>>> feature/branch
line 3`;

const MULTI_CONFLICT = `start
<<<<<<< HEAD
first head
=======
first merging
>>>>>>> branch
middle
<<<<<<< HEAD
second head
=======
second merging
>>>>>>> branch
end`;

const NO_CONFLICT = `just normal
file content
no markers here`;

describe('hasConflictMarkers', () => {
  it('returns true for content with conflict markers', () => {
    expect(hasConflictMarkers(SIMPLE_CONFLICT)).toBe(true);
  });

  it('returns false for content without conflict markers', () => {
    expect(hasConflictMarkers(NO_CONFLICT)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasConflictMarkers('')).toBe(false);
  });
});

describe('parseConflicts', () => {
  it('parses a simple 2-way conflict', () => {
    const result = parseConflicts(SIMPLE_CONFLICT);
    expect(result.chunks).toHaveLength(1);
    const chunk = result.chunks[0];
    expect(chunk.headLines).toEqual(['head change']);
    expect(chunk.mergingLines).toEqual(['merging change']);
    expect(chunk.baseLines).toBeNull();
    expect(chunk.headLabel).toBe('HEAD');
    expect(chunk.mergingLabel).toBe('feature/branch');
    expect(chunk.startLine).toBe(1); // 0-indexed: "line 1" is 0, <<<< is 1
    expect(chunk.endLine).toBe(5); // >>>> line
  });

  it('parses a diff3 3-way conflict', () => {
    const result = parseConflicts(DIFF3_CONFLICT);
    expect(result.chunks).toHaveLength(1);
    const chunk = result.chunks[0];
    expect(chunk.headLines).toEqual(['head change']);
    expect(chunk.baseLines).toEqual(['original']);
    expect(chunk.mergingLines).toEqual(['merging change']);
  });

  it('parses multiple conflicts', () => {
    const result = parseConflicts(MULTI_CONFLICT);
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].headLines).toEqual(['first head']);
    expect(result.chunks[1].headLines).toEqual(['second head']);
  });

  it('returns empty chunks for content without conflicts', () => {
    const result = parseConflicts(NO_CONFLICT);
    expect(result.chunks).toHaveLength(0);
  });

  it('handles empty content', () => {
    const result = parseConflicts('');
    expect(result.chunks).toHaveLength(0);
  });

  it('handles multi-line conflicts', () => {
    const content = `before
<<<<<<< HEAD
line a
line b
=======
line x
line y
line z
>>>>>>> branch
after`;
    const result = parseConflicts(content);
    expect(result.chunks[0].headLines).toEqual(['line a', 'line b']);
    expect(result.chunks[0].mergingLines).toEqual(['line x', 'line y', 'line z']);
  });

  it('handles empty sides', () => {
    const content = `before
<<<<<<< HEAD
=======
incoming line
>>>>>>> branch
after`;
    const result = parseConflicts(content);
    expect(result.chunks[0].headLines).toEqual([]);
    expect(result.chunks[0].mergingLines).toEqual(['incoming line']);
  });
});

describe('reconstructFile', () => {
  it('replaces resolved conflicts with resolved lines', () => {
    const lines = SIMPLE_CONFLICT.split('\n');
    const resolved = new Map([[1, ['resolved line']]]);
    const result = reconstructFile(lines, resolved);
    expect(result).toBe('line 1\nresolved line\nline 3');
  });

  it('preserves original conflict markers for unresolved chunks', () => {
    const lines = SIMPLE_CONFLICT.split('\n');
    const result = reconstructFile(lines, new Map());
    expect(result).toBe(SIMPLE_CONFLICT);
  });

  it('preserves context lines outside conflicts unchanged', () => {
    const content = 'line 1\nline 2\nline 3';
    const lines = content.split('\n');
    const result = reconstructFile(lines, new Map());
    expect(result).toBe(content);
  });

  it('handles multiple conflicts with mixed resolved/unresolved', () => {
    const lines = MULTI_CONFLICT.split('\n');
    const firstChunk = parseConflicts(MULTI_CONFLICT).chunks[0];
    const resolved = new Map([[firstChunk.startLine, ['resolved first']]]);
    const result = reconstructFile(lines, resolved);
    expect(result).toContain('resolved first');
    expect(result).toContain('<<<<<<< HEAD'); // second conflict preserved
    expect(result).not.toContain('first head'); // first head replaced
  });
});
