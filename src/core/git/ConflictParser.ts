import * as vscode from 'vscode';

export interface ConflictBlock {
    index: number;
    startLine: number;
    endLine: number;
    head: string;
    base: string | null;
    merging: string;
}

type State = 'OUTSIDE' | 'IN_HEAD' | 'IN_BASE' | 'IN_MERGING';

export function parseConflicts(document: vscode.TextDocument): ConflictBlock[] {
    const text = document.getText();
    const lines = text.split('\n');
    const blocks: ConflictBlock[] = [];

    let state: State = 'OUTSIDE';
    let startLine = 0;
    let headLines: string[] = [];
    let baseLines: string[] = [];
    let mergingLines: string[] = [];
    let hasBase = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (state === 'OUTSIDE') {
            if (line.startsWith('<<<<<<<')) {
                state = 'IN_HEAD';
                startLine = i;
                headLines = [];
                baseLines = [];
                mergingLines = [];
                hasBase = false;
            }
        } else if (state === 'IN_HEAD') {
            if (line.startsWith('|||||||')) {
                state = 'IN_BASE';
                hasBase = true;
            } else if (line.startsWith('=======')) {
                state = 'IN_MERGING';
            } else if (line.startsWith('<<<<<<<')) {
                // Malformed: new start without closing previous
                state = 'IN_HEAD';
                startLine = i;
                headLines = [];
                baseLines = [];
                mergingLines = [];
                hasBase = false;
            } else {
                headLines.push(line);
            }
        } else if (state === 'IN_BASE') {
            if (line.startsWith('=======')) {
                state = 'IN_MERGING';
            } else if (line.startsWith('<<<<<<<')) {
                // Malformed: reset
                state = 'IN_HEAD';
                startLine = i;
                headLines = [];
                baseLines = [];
                mergingLines = [];
                hasBase = false;
            } else {
                baseLines.push(line);
            }
        } else if (state === 'IN_MERGING') {
            if (line.startsWith('>>>>>>>')) {
                blocks.push({
                    index: blocks.length,
                    startLine,
                    endLine: i,
                    head: headLines.join('\n'),
                    base: hasBase ? baseLines.join('\n') : null,
                    merging: mergingLines.join('\n'),
                });
                state = 'OUTSIDE';
            } else if (line.startsWith('<<<<<<<')) {
                // Malformed: reset
                state = 'IN_HEAD';
                startLine = i;
                headLines = [];
                baseLines = [];
                mergingLines = [];
                hasBase = false;
            } else {
                mergingLines.push(line);
            }
        }
    }

    // Unclosed block at end of file is ignored (malformed)
    return blocks;
}
