import * as vscode from 'vscode';

const CONFLICT_START = '<<<<<<<';
const CONFLICT_SEPARATOR = '=======';
const CONFLICT_END = '>>>>>>>';

export function hasConflictMarkers(document: vscode.TextDocument): boolean {
    const text = document.getText();
    return (
        text.includes(CONFLICT_START) &&
        text.includes(CONFLICT_SEPARATOR) &&
        text.includes(CONFLICT_END)
    );
}

export function countConflicts(document: vscode.TextDocument): number {
    const text = document.getText();
    const lines = text.split('\n');
    let count = 0;
    for (const line of lines) {
        if (line.startsWith(CONFLICT_START)) {
            count++;
        }
    }
    return count;
}
