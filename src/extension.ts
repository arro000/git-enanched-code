import * as vscode from 'vscode';
import { hasConflictMarkers } from './core/git/ConflictDetector';
import { ConfigManager } from './config/ConfigManager';
import { MergeEditorProvider } from './ui/MergeEditorProvider';

const configManager = new ConfigManager();

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
                        handleFallback(err);
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
            openMergeEditorForDocument(document).catch(handleFallback);
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

function handleFallback(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(
        `Git Enhanced: Failed to open merge editor (${message}). Falling back to default editor.`
    );
    // Fallback: VS Code will use its default editor since ours failed
}

export function deactivate(): void {
    // Nothing to clean up — disposables are managed via context.subscriptions
}
