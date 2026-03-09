import * as vscode from 'vscode';
import { MergeCompletionService } from '../core/git/MergeCompletionService';
import { FallbackService } from '../core/git/FallbackService';
import { MergeSessionStateManager } from '../core/merge/MergeSessionStateManager';
import { countConflicts } from '../core/git/ConflictDetector';

export class MergeEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly VIEW_TYPE = 'git-enhanced.mergeEditor';

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new MergeEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(
            MergeEditorProvider.VIEW_TYPE,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        );
    }

    private readonly mergeCompletionService = new MergeCompletionService();
    private readonly fallbackService = new FallbackService();
    private readonly stateManager: MergeSessionStateManager;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.stateManager = new MergeSessionStateManager(context.workspaceState);
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        try {
            webviewPanel.title = 'Git Enhanced — Merge Editor';
            webviewPanel.webview.options = {
                enableScripts: true,
            };

            const nonce = this.generaNonce();
            webviewPanel.webview.html = this.getPlaceholderHtml(document.fileName, nonce);

            // US-005: Try to restore previous merge session state
            const contenutoOriginale = document.getText();
            const statoEsistente = await this.stateManager.recuperaStato(
                document.uri.fsPath,
                contenutoOriginale
            );

            if (statoEsistente) {
                // Send restored state to webview
                webviewPanel.webview.postMessage({
                    command: 'statoRipristinato',
                    stato: statoEsistente,
                });
            } else {
                // Create initial state for a new merge session
                const numeroConflitti = countConflicts(document);
                const statoIniziale = this.stateManager.creaStatoIniziale(
                    document.uri.fsPath,
                    contenutoOriginale,
                    numeroConflitti
                );
                await this.stateManager.salvaStato(statoIniziale);
            }

            // Listen for messages from the webview
            webviewPanel.webview.onDidReceiveMessage(async (messaggio) => {
                try {
                    if (messaggio.command === 'completaMerge') {
                        const risultato = await this.mergeCompletionService.completaMerge(document);
                        if (risultato.successo) {
                            // US-005: Clear saved state after successful merge completion
                            await this.stateManager.cancellaStato(document.uri.fsPath);
                            vscode.window.showInformationMessage(
                                `Git Enhanced: Merge completed successfully. File staged: ${document.fileName}`
                            );
                            webviewPanel.webview.postMessage({
                                command: 'mergeCompletato',
                                successo: true,
                            });
                        } else {
                            vscode.window.showErrorMessage(
                                `Git Enhanced: ${risultato.messaggioErrore}`
                            );
                            webviewPanel.webview.postMessage({
                                command: 'mergeCompletato',
                                successo: false,
                                messaggioErrore: risultato.messaggioErrore,
                            });
                        }
                    } else if (messaggio.command === 'aggiornaStato') {
                        // US-005: Save partial resolution state from webview
                        // Validate that the state belongs to this document
                        if (messaggio.stato && messaggio.stato.percorsoFile === document.uri.fsPath) {
                            await this.stateManager.salvaStato(messaggio.stato);
                        }
                    }
                } catch (errore) {
                    // US-004: fallback on unhandled errors during message processing
                    await this.fallbackService.attivaFallbackPerDocumento(document.uri, errore);
                }
            });
        } catch (errore) {
            // US-004: fallback on unhandled errors during editor setup
            await this.fallbackService.attivaFallbackPerDocumento(document.uri, errore);
            throw errore; // Re-throw so VS Code knows the custom editor failed
        }
    }

    private escapaHtml(testo: string): string {
        return testo
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private generaNonce(): string {
        const caratteri = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let nonce = '';
        for (let i = 0; i < 32; i++) {
            nonce += caratteri.charAt(Math.floor(Math.random() * caratteri.length));
        }
        return nonce;
    }

    private getPlaceholderHtml(fileName: string, nonce: string): string {
        const fileNameSanitizzato = this.escapaHtml(fileName);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Git Enhanced — Merge Editor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
        }
        .placeholder {
            text-align: center;
            opacity: 0.6;
        }
        .placeholder h2 {
            font-size: 1.4em;
            margin-bottom: 0.5em;
        }
        .placeholder p {
            font-size: 0.9em;
        }
        .complete-merge-button {
            margin-top: 1.5em;
            padding: 8px 20px;
            font-size: 0.95em;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
        }
        .complete-merge-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="placeholder">
        <h2>Git Enhanced — Merge Editor</h2>
        <p>${fileNameSanitizzato}</p>
        <p>3-column merge editor coming soon.</p>
    </div>
    <button class="complete-merge-button" id="completeMergeButton">Complete Merge</button>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            document.getElementById('completeMergeButton').addEventListener('click', function() {
                vscode.postMessage({ command: 'completaMerge' });
            });
            window.addEventListener('message', function(event) {
                var message = event.data;
                if (message.command === 'mergeCompletato') {
                    var button = document.getElementById('completeMergeButton');
                    if (message.successo) {
                        button.textContent = 'Merge Completed';
                        button.disabled = true;
                    }
                }
            });
        })();
    </script>
</body>
</html>`;
    }

    public openForDocument(document: vscode.TextDocument): void {
        vscode.commands.executeCommand(
            'vscode.openWith',
            document.uri,
            MergeEditorProvider.VIEW_TYPE
        );
    }
}
