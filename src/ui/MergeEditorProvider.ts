import * as vscode from 'vscode';
import { MergeCompletionService } from '../core/git/MergeCompletionService';
import { FallbackService } from '../core/git/FallbackService';
import { MergeSessionStateManager } from '../core/merge/MergeSessionStateManager';
import { countConflicts } from '../core/git/ConflictDetector';
import { parseConflicts } from '../core/git/ConflictParser';

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

            // US-006: Parse conflicts and prepare data for 3-column layout
            const conflittiParsati = parseConflicts(document);
            const righeDocumento = document.getText().split('\n');

            const nonce = this.generaNonce();
            webviewPanel.webview.html = this.getMergeEditorHtml(document.fileName, nonce);

            // US-005: Try to restore previous merge session state
            const contenutoOriginale = document.getText();
            const statoEsistente = await this.stateManager.recuperaStato(
                document.uri.fsPath,
                contenutoOriginale
            );

            if (!statoEsistente) {
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
            let layoutGiaInviato = false;
            webviewPanel.webview.onDidReceiveMessage(async (messaggio) => {
                try {
                    if (messaggio.command === 'webviewPronta' && !layoutGiaInviato) {
                        layoutGiaInviato = true;
                        // US-006: Send conflict data to populate 3-column layout
                        webviewPanel.webview.postMessage({
                            command: 'inizializzaLayout',
                            righe: righeDocumento,
                            conflitti: conflittiParsati,
                        });
                        // US-005: Send restored state if available
                        if (statoEsistente) {
                            webviewPanel.webview.postMessage({
                                command: 'statoRipristinato',
                                stato: statoEsistente,
                            });
                        }
                    } else if (messaggio.command === 'completaMerge') {
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

    private getMergeEditorHtml(fileName: string, nonce: string): string {
        const fileNameSanitizzato = this.escapaHtml(fileName);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Git Enhanced — Merge Editor</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* Toolbar */
        .toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 12px;
            background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
            border-bottom: 1px solid var(--vscode-panel-border, #444);
            flex-shrink: 0;
        }
        .toolbar-file-name {
            font-size: 0.85em;
            opacity: 0.8;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .complete-merge-button {
            padding: 4px 14px;
            font-size: 0.85em;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            flex-shrink: 0;
        }
        .complete-merge-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .complete-merge-button:disabled {
            opacity: 0.5;
            cursor: default;
        }

        /* Column headers */
        .column-headers {
            display: grid;
            grid-template-columns: 1fr 1px 1fr 1px 1fr;
            flex-shrink: 0;
            border-bottom: 1px solid var(--vscode-panel-border, #444);
        }
        .column-header {
            padding: 5px 12px;
            font-size: 0.8em;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.7;
        }
        .column-header-result {
            background: var(--vscode-editor-background);
        }
        .header-separator {
            background: var(--vscode-panel-border, #444);
        }

        /* Columns container */
        .columns-container {
            display: grid;
            grid-template-columns: 1fr 1px 1fr 1px 1fr;
            flex: 1;
            overflow: hidden;
            min-height: 0;
        }
        .column {
            overflow-y: auto;
            overflow-x: auto;
        }
        .column-separator {
            background: var(--vscode-panel-border, #444);
            flex-shrink: 0;
        }

        /* Code content */
        .code-segment {
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            line-height: var(--vscode-editor-line-height, 1.5);
            white-space: pre;
            padding: 0 8px;
        }
        .conflict-segment {
            padding: 2px 8px;
            min-height: 1.5em;
        }
        .conflict-segment-head {
            background: var(--vscode-merge-currentContentBackground, rgba(40, 160, 40, 0.12));
            border-left: 3px solid var(--vscode-merge-currentHeaderBackground, rgba(40, 180, 40, 0.6));
        }
        .conflict-segment-merging {
            background: var(--vscode-merge-incomingContentBackground, rgba(40, 100, 200, 0.12));
            border-left: 3px solid var(--vscode-merge-incomingHeaderBackground, rgba(40, 120, 220, 0.6));
        }
        .conflict-segment-result {
            background: var(--vscode-editorWarning-background, rgba(200, 150, 40, 0.08));
            border-left: 3px solid var(--vscode-editorWarning-foreground, rgba(200, 150, 40, 0.5));
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .conflict-label {
            font-size: 0.8em;
            opacity: 0.45;
            font-style: italic;
            user-select: none;
        }

        /* Loading state */
        .loading-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            opacity: 0.5;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <span class="toolbar-file-name" title="${fileNameSanitizzato}">${fileNameSanitizzato}</span>
        <button class="complete-merge-button" id="completeMergeButton">Complete Merge</button>
    </div>
    <div class="column-headers">
        <div class="column-header">HEAD / Il tuo codice</div>
        <div class="header-separator"></div>
        <div class="column-header column-header-result">Result</div>
        <div class="header-separator"></div>
        <div class="column-header">MERGING / Codice in arrivo</div>
    </div>
    <div class="columns-container">
        <div class="column" id="columnHead">
            <div class="loading-indicator">Loading...</div>
        </div>
        <div class="column-separator"></div>
        <div class="column" id="columnResult">
            <div class="loading-indicator">Loading...</div>
        </div>
        <div class="column-separator"></div>
        <div class="column" id="columnMerging">
            <div class="loading-indicator">Loading...</div>
        </div>
    </div>
    <script nonce="${nonce}">
        (function() {
            var vscode = acquireVsCodeApi();

            function buildSegmentsFromConflicts(righe, conflitti) {
                var segmenti = [];
                var rigaCorrente = 0;

                for (var i = 0; i < conflitti.length; i++) {
                    var conflitto = conflitti[i];
                    if (rigaCorrente < conflitto.startLine) {
                        segmenti.push({
                            tipo: 'comune',
                            contenuto: righe.slice(rigaCorrente, conflitto.startLine).join('\\n')
                        });
                    }
                    segmenti.push({
                        tipo: 'conflitto',
                        indice: conflitto.index,
                        head: conflitto.head,
                        base: conflitto.base,
                        merging: conflitto.merging
                    });
                    rigaCorrente = conflitto.endLine + 1;
                }
                if (rigaCorrente < righe.length) {
                    segmenti.push({
                        tipo: 'comune',
                        contenuto: righe.slice(rigaCorrente).join('\\n')
                    });
                }
                return segmenti;
            }

            function renderColonna(contenitore, segmenti, tipoColonna) {
                contenitore.innerHTML = '';

                for (var i = 0; i < segmenti.length; i++) {
                    var segmento = segmenti[i];
                    var div = document.createElement('div');

                    if (segmento.tipo === 'comune') {
                        div.className = 'code-segment';
                        div.textContent = segmento.contenuto;
                    } else {
                        if (tipoColonna === 'head') {
                            div.className = 'code-segment conflict-segment conflict-segment-head';
                            div.textContent = segmento.head;
                        } else if (tipoColonna === 'merging') {
                            div.className = 'code-segment conflict-segment conflict-segment-merging';
                            div.textContent = segmento.merging;
                        } else {
                            div.className = 'code-segment conflict-segment conflict-segment-result';
                            var label = document.createElement('span');
                            label.className = 'conflict-label';
                            label.textContent = '[ conflitto #' + (segmento.indice + 1) + ' -- irrisolto ]';
                            div.appendChild(label);
                        }
                    }
                    contenitore.appendChild(div);
                }
            }

            function inizializzaLayout(dati) {
                var segmenti = buildSegmentsFromConflicts(dati.righe, dati.conflitti);
                renderColonna(document.getElementById('columnHead'), segmenti, 'head');
                renderColonna(document.getElementById('columnResult'), segmenti, 'result');
                renderColonna(document.getElementById('columnMerging'), segmenti, 'merging');
            }

            // Complete Merge button
            document.getElementById('completeMergeButton').addEventListener('click', function() {
                vscode.postMessage({ command: 'completaMerge' });
            });

            // Message handler
            window.addEventListener('message', function(event) {
                var message = event.data;
                if (message.command === 'inizializzaLayout') {
                    inizializzaLayout(message);
                } else if (message.command === 'mergeCompletato') {
                    var button = document.getElementById('completeMergeButton');
                    if (message.successo) {
                        button.textContent = 'Merge Completed';
                        button.disabled = true;
                    }
                } else if (message.command === 'statoRipristinato') {
                    // US-005: Handle state restoration (will be enhanced in future stories)
                }
            });

            // Signal webview is ready to receive data
            vscode.postMessage({ command: 'webviewPronta' });
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
