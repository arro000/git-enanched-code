import * as vscode from 'vscode';
import { simpleGit } from 'simple-git';
import { hasConflictMarkers } from './ConflictDetector';

export interface RisultatoCompletamentoMerge {
    successo: boolean;
    messaggioErrore?: string;
}

export class MergeCompletionService {
    /**
     * Completes the merge for the given document:
     * 1. Checks that no conflict markers remain
     * 2. Saves the document
     * 3. Runs `git add <filepath>`
     */
    async completaMerge(document: vscode.TextDocument): Promise<RisultatoCompletamentoMerge> {
        if (hasConflictMarkers(document)) {
            return {
                successo: false,
                messaggioErrore: 'Cannot complete merge: unresolved conflict markers remain in the file.',
            };
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return {
                successo: false,
                messaggioErrore: 'Cannot complete merge: file is not inside a workspace folder.',
            };
        }

        // Save the document first — ensures content is persisted before git add
        try {
            await document.save();
        } catch (errore) {
            const dettaglio = errore instanceof Error ? errore.message : String(errore);
            return {
                successo: false,
                messaggioErrore: `Failed to save file: ${dettaglio}. Your resolved content is still in the editor.`,
            };
        }

        // Stage the file with git add
        try {
            const git = simpleGit(workspaceFolder.uri.fsPath);
            await git.add(document.uri.fsPath);
        } catch (errore) {
            const dettaglio = errore instanceof Error ? errore.message : String(errore);
            return {
                successo: false,
                messaggioErrore: `File saved but git add failed: ${dettaglio}. The resolved content has been saved to disk.`,
            };
        }

        return { successo: true };
    }
}
