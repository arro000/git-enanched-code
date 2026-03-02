import { describe, it, expect } from 'vitest';
import { parseConflicts } from '../../../../src/core/git/ConflictParser';
import type * as vscode from 'vscode';

function makeDocument(content: string): vscode.TextDocument {
    return {
        getText: () => content,
    } as unknown as vscode.TextDocument;
}

describe('parseConflicts', () => {
    it('returns [] for a file with no conflicts', () => {
        const doc = makeDocument('const x = 1;\nconst y = 2;\n');
        expect(parseConflicts(doc)).toEqual([]);
    });

    it('returns [] for an empty file', () => {
        expect(parseConflicts(makeDocument(''))).toEqual([]);
    });

    it('parses a single standard conflict (2-way)', () => {
        const content = [
            'some code',
            '<<<<<<< HEAD',
            'const x = 1;',
            '=======',
            'const x = 2;',
            '>>>>>>> feature-branch',
            'more code',
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks).toHaveLength(1);
        expect(blocks[0].index).toBe(0);
        expect(blocks[0].startLine).toBe(1);
        expect(blocks[0].endLine).toBe(5);
        expect(blocks[0].head).toBe('const x = 1;');
        expect(blocks[0].base).toBeNull();
        expect(blocks[0].merging).toBe('const x = 2;');
    });

    it('parses a single diff3 conflict (3-way) with base section', () => {
        const content = [
            '<<<<<<< HEAD',
            'const x = 1;',
            '||||||| base',
            'const x = 0;',
            '=======',
            'const x = 2;',
            '>>>>>>> feature-branch',
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks).toHaveLength(1);
        expect(blocks[0].index).toBe(0);
        expect(blocks[0].startLine).toBe(0);
        expect(blocks[0].endLine).toBe(6);
        expect(blocks[0].head).toBe('const x = 1;');
        expect(blocks[0].base).toBe('const x = 0;');
        expect(blocks[0].merging).toBe('const x = 2;');
    });

    it('parses multiple conflicts in order', () => {
        const content = [
            '<<<<<<< HEAD',
            'const a = 1;',
            '=======',
            'const a = 2;',
            '>>>>>>> branch-a',
            'middle code',
            '<<<<<<< HEAD',
            'const b = "hello";',
            '=======',
            'const b = "world";',
            '>>>>>>> branch-b',
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks).toHaveLength(2);
        expect(blocks[0].index).toBe(0);
        expect(blocks[1].index).toBe(1);
    });

    it('assigns correct startLine and endLine for each block', () => {
        const content = [
            '<<<<<<< HEAD',      // line 0
            'const a = 1;',      // line 1
            '=======',           // line 2
            'const a = 2;',      // line 3
            '>>>>>>> branch-a',  // line 4
            'middle',            // line 5
            '<<<<<<< HEAD',      // line 6
            'const b = 1;',      // line 7
            '=======',           // line 8
            'const b = 2;',      // line 9
            '>>>>>>> branch-b',  // line 10
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks[0].startLine).toBe(0);
        expect(blocks[0].endLine).toBe(4);
        expect(blocks[1].startLine).toBe(6);
        expect(blocks[1].endLine).toBe(10);
    });

    it('captures correct HEAD content (excluding markers)', () => {
        const content = [
            '<<<<<<< HEAD',
            'line1',
            'line2',
            '=======',
            'other',
            '>>>>>>> branch',
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks[0].head).toBe('line1\nline2');
    });

    it('captures correct MERGING content (excluding markers)', () => {
        const content = [
            '<<<<<<< HEAD',
            'original',
            '=======',
            'lineA',
            'lineB',
            '>>>>>>> branch',
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks[0].merging).toBe('lineA\nlineB');
    });

    it('captures correct BASE content in diff3 format', () => {
        const content = [
            '<<<<<<< HEAD',
            'head-content',
            '||||||| base',
            'base-line1',
            'base-line2',
            '=======',
            'merging-content',
            '>>>>>>> branch',
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks[0].base).toBe('base-line1\nbase-line2');
    });

    it('ignores malformed block with no closing marker', () => {
        const content = [
            '<<<<<<< HEAD',
            'const x = 1;',
            '=======',
            'const x = 2;',
        ].join('\n');

        expect(parseConflicts(makeDocument(content))).toEqual([]);
    });

    it('ignores malformed block with no separator', () => {
        const content = [
            '<<<<<<< HEAD',
            'const x = 1;',
            '>>>>>>> branch',
        ].join('\n');

        // No ======= so it stays in IN_HEAD and hits >>>>>>>  which is treated as content
        // The block never closes properly — result is empty
        const blocks = parseConflicts(makeDocument(content));
        expect(blocks).toHaveLength(0);
    });

    it('handles empty HEAD section', () => {
        const content = [
            '<<<<<<< HEAD',
            '=======',
            'const x = 2;',
            '>>>>>>> branch',
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks).toHaveLength(1);
        expect(blocks[0].head).toBe('');
        expect(blocks[0].merging).toBe('const x = 2;');
    });

    it('handles empty MERGING section', () => {
        const content = [
            '<<<<<<< HEAD',
            'const x = 1;',
            '=======',
            '>>>>>>> branch',
        ].join('\n');

        const blocks = parseConflicts(makeDocument(content));
        expect(blocks).toHaveLength(1);
        expect(blocks[0].head).toBe('const x = 1;');
        expect(blocks[0].merging).toBe('');
    });
});
