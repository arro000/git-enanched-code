import * as vscode from 'vscode';
import { hasConflictMarkers } from './core/git/ConflictDetector';
import { ConfigManager } from './config/ConfigManager';
import { MergeEditorProvider } from './ui/MergeEditorProvider';
import { MergeCompletionService } from './core/git/MergeCompletionService';
import { FallbackService } from './core/git/FallbackService';

const configManager = new ConfigManager();
const mergeCompletionService = new MergeCompletionService();
const fallbackService = new FallbackService();

export function activate(context: vscode.ExtensionContext): void {
    // Register the custom editor provider
    const editorProviderDisposable = MergeEditorProvider.register(context);
    context.subscriptions.push(editorProviderDisposable);

    // TASK-001.6 — Command: open merge editor manually from Command Palette
    const openMergeEditorCommand = vscode.commands.registerCommand(
        'git-enhanced.openMergeEditor',
        async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage(
                    'Git Enhanced: No active file to open in the merge editor.'
                );
                return;
            }
            await openMergeEditorForDocument(activeEditor.document);
        }
    );
    context.subscriptions.push(openMergeEditorCommand);

    // US-003 — Command: complete merge with save and git add
    const completeMergeCommand = vscode.commands.registerCommand(
        'git-enhanced.completeMerge',
        async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage(
                    'Git Enhanced: No active file to complete the merge.'
                );
                return;
            }
            const risultato = await mergeCompletionService.completaMerge(activeEditor.document);
            if (risultato.successo) {
                vscode.window.showInformationMessage(
                    `Git Enhanced: Merge completed successfully. File staged: ${activeEditor.document.fileName}`
                );
            } else {
                vscode.window.showErrorMessage(
                    `Git Enhanced: ${risultato.messaggioErrore}`
                );
            }
        }
    );
    context.subscriptions.push(completeMergeCommand);

    // TASK-001.4 — Listener: auto-open on conflict detection
    const onOpenListener = vscode.workspace.onDidOpenTextDocument(
        async (document) => {
            if (!configManager.isAutoMode()) {
                return;
            }
            if (document.uri.scheme !== 'file') {
                return;
            }
            if (hasConflictMarkers(document)) {
                // Open within 500ms — schedule asynchronously to avoid blocking
                setTimeout(async () => {
                    try {
                        await openMergeEditorForDocument(document);
                    } catch (err) {
                        handleFallback(err, document.uri);
                    }
                }, 0);
            }
        }
    );
    context.subscriptions.push(onOpenListener);

    // Handle already-open files at activation time
    for (const document of vscode.workspace.textDocuments) {
        if (
            configManager.isAutoMode() &&
            document.uri.scheme === 'file' &&
            hasConflictMarkers(document)
        ) {
            openMergeEditorForDocument(document).catch((err) => handleFallback(err, document.uri));
        }
    }
}

async function openMergeEditorForDocument(
    document: vscode.TextDocument
): Promise<void> {
    await vscode.commands.executeCommand(
        'vscode.openWith',
        document.uri,
        MergeEditorProvider.VIEW_TYPE
    );
}

function handleFallback(err: unknown, documentUri?: vscode.Uri): void {
    if (documentUri) {
        fallbackService.attivaFallbackPerDocumento(documentUri, err);
    } else {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showWarningMessage(
            `Git Enhanced: Failed to open merge editor (${message}). Falling back to default editor.`
        );
    }
}

export function deactivate(): void {
    // Nothing to clean up — disposables are managed via context.subscriptions
}
