import { describe, it, expect } from 'vitest';
import { hasConflictMarkers, countConflicts } from '../../../../src/core/git/ConflictDetector';
import type * as vscode from 'vscode';

function makeDocument(content: string): vscode.TextDocument {
    return {
        getText: () => content,
    } as unknown as vscode.TextDocument;
}

const SINGLE_CONFLICT = `
some code before
<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> feature-branch
some code after
`.trim();

const TWO_CONFLICTS = `
<<<<<<< HEAD
const a = 1;
=======
const a = 2;
>>>>>>> branch-a
middle code
<<<<<<< HEAD
const b = 'hello';
=======
const b = 'world';
>>>>>>> branch-b
`.trim();

const THREE_CONFLICTS = `
<<<<<<< HEAD
line A1
=======
line A2
>>>>>>> branchA
---
<<<<<<< HEAD
line B1
=======
line B2
>>>>>>> branchB
---
<<<<<<< HEAD
line C1
=======
line C2
>>>>>>> branchC
`.trim();

const NO_CONFLICT = `
const x = 1;
const y = 2;
export { x, y };
`;

const PARTIAL_MARKERS_NO_END = `
<<<<<<< HEAD
const x = 1;
=======
const x = 2;
`;

const PARTIAL_MARKERS_NO_START = `
const x = 1;
=======
const x = 2;
>>>>>>> feature-branch
`;

const BINARY_LIKE = `\x00\x01\x02\x03binary content\xFF\xFE`;

describe('hasConflictMarkers', () => {
    it('returns true for a file with a single conflict', () => {
        expect(hasConflictMarkers(makeDocument(SINGLE_CONFLICT))).toBe(true);
    });

    it('returns true for a file with two conflicts', () => {
        expect(hasConflictMarkers(makeDocument(TWO_CONFLICTS))).toBe(true);
    });

    it('returns true for a file with three conflicts', () => {
        expect(hasConflictMarkers(makeDocument(THREE_CONFLICTS))).toBe(true);
    });

    it('returns false for a file with no conflict markers', () => {
        expect(hasConflictMarkers(makeDocument(NO_CONFLICT))).toBe(false);
    });

    it('returns false for an empty file', () => {
        expect(hasConflictMarkers(makeDocument(''))).toBe(false);
    });

    it('returns false when only start and separator markers are present (no end marker)', () => {
        expect(hasConflictMarkers(makeDocument(PARTIAL_MARKERS_NO_END))).toBe(false);
    });

    it('returns false when only separator and end markers are present (no start marker)', () => {
        expect(hasConflictMarkers(makeDocument(PARTIAL_MARKERS_NO_START))).toBe(false);
    });

    it('returns false for binary-like content without conflict markers', () => {
        expect(hasConflictMarkers(makeDocument(BINARY_LIKE))).toBe(false);
    });
});

describe('countConflicts', () => {
    it('returns 0 for a file with no conflicts', () => {
        expect(countConflicts(makeDocument(NO_CONFLICT))).toBe(0);
    });

    it('returns 0 for an empty file', () => {
        expect(countConflicts(makeDocument(''))).toBe(0);
    });

    it('returns 1 for a file with one conflict', () => {
        expect(countConflicts(makeDocument(SINGLE_CONFLICT))).toBe(1);
    });

    it('returns 2 for a file with two conflicts', () => {
        expect(countConflicts(makeDocument(TWO_CONFLICTS))).toBe(2);
    });

    it('returns 3 for a file with three conflicts', () => {
        expect(countConflicts(makeDocument(THREE_CONFLICTS))).toBe(3);
    });
});
