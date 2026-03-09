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
            // US-007: Configure webview with Monaco Editor resource access
            const monacoBasePath = vscode.Uri.joinPath(
                this.context.extensionUri,
                'node_modules',
                'monaco-editor',
                'min'
            );
            webviewPanel.webview.options = {
                enableScripts: true,
                localResourceRoots: [monacoBasePath],
            };

            // US-006: Parse conflicts and prepare data for 3-column layout
            const conflittiParsati = parseConflicts(document);
            const righeDocumento = document.getText().split('\n');

            // US-007: Prepare Monaco Editor configuration
            const monacoBaseUri = webviewPanel.webview.asWebviewUri(monacoBasePath).toString();
            const cspSource = webviewPanel.webview.cspSource;
            const linguaggioId = this.detectLanguageIdFromFileName(document.fileName);

            const nonce = this.generaNonce();
            webviewPanel.webview.html = this.getMergeEditorHtml(
                document.fileName, nonce, monacoBaseUri, cspSource, linguaggioId
            );

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

    private getMergeEditorHtml(
        fileName: string,
        nonce: string,
        monacoBaseUri: string,
        cspSource: string,
        linguaggioId: string
    ): string {
        const fileNameSanitizzato = this.escapaHtml(fileName);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${cspSource} 'unsafe-eval'; style-src 'unsafe-inline' ${cspSource}; font-src ${cspSource}; worker-src blob:;">
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
        .column-result {
            position: relative;
            overflow: hidden;
        }
        .column-separator {
            background: var(--vscode-panel-border, #444);
            flex-shrink: 0;
        }

        /* Monaco Editor container */
        #monacoEditorContainer {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
        }

        /* Code content for side columns */
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

        /* Conflict action buttons (US-008) */
        .conflict-action-bar {
            display: flex;
            gap: 4px;
            padding: 2px 4px 4px 4px;
        }
        .conflict-action-button {
            padding: 1px 8px;
            font-size: 0.75em;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid var(--vscode-panel-border, #555);
            border-radius: 3px;
            background: var(--vscode-button-secondaryBackground, #333);
            color: var(--vscode-button-secondaryForeground, #ccc);
            line-height: 1.4;
        }
        .conflict-action-button:hover:not(:disabled) {
            background: var(--vscode-button-secondaryHoverBackground, #444);
        }
        .conflict-action-button:disabled {
            opacity: 0.3;
            cursor: default;
        }
        .conflict-segment-handled {
            opacity: 0.35;
            position: relative;
        }
        .conflict-segment-handled .conflict-action-button {
            display: none;
        }
        .handled-label {
            font-size: 0.7em;
            opacity: 0.6;
            font-style: italic;
            padding: 2px 4px;
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
        <div class="column column-result" id="columnResult">
            <div id="monacoEditorContainer"></div>
        </div>
        <div class="column-separator"></div>
        <div class="column" id="columnMerging">
            <div class="loading-indicator">Loading...</div>
        </div>
    </div>
    <script nonce="${nonce}" src="${monacoBaseUri}/vs/loader.js"></script>
    <script nonce="${nonce}">
        (function() {
            var vscode = acquireVsCodeApi();
            var monacoEditorInstance = null;
            var linguaggioId = '${linguaggioId}';
            var statiConflitti = {};  // { index: { headGestito: bool, mergingGestito: bool, contenutoApplicato: string|null } }
            var segmentiGlobali = null;  // stored for re-rendering

            // US-007: Configure Monaco AMD loader
            require.config({ paths: { 'vs': '${monacoBaseUri}/vs' }});

            // Use blob workers to avoid CSP issues with data: URLs
            window.MonacoEnvironment = {
                getWorkerUrl: function() {
                    return URL.createObjectURL(new Blob(
                        ['self.onmessage = function() {}'],
                        { type: 'text/javascript' }
                    ));
                }
            };

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

            function buildInitialResultContent(righe, conflitti) {
                var resultLines = [];
                var rigaCorrente = 0;
                for (var i = 0; i < conflitti.length; i++) {
                    var c = conflitti[i];
                    for (var j = rigaCorrente; j < c.startLine; j++) {
                        resultLines.push(righe[j]);
                    }
                    resultLines.push('// [Conflitto #' + (c.index + 1) + ' -- irrisolto]');
                    rigaCorrente = c.endLine + 1;
                }
                for (var j = rigaCorrente; j < righe.length; j++) {
                    resultLines.push(righe[j]);
                }
                return resultLines.join('\\n');
            }

            // US-008: Apply HEAD chunk content to the result column via Monaco
            // US-010: Supports queuing — if MERGING was already applied, appends after it
            function applicaChunkHead(indiceConflitto, contenutoHead) {
                if (!monacoEditorInstance) return;
                var model = monacoEditorInstance.getModel();
                var placeholder = '// [Conflitto #' + (indiceConflitto + 1) + ' -- irrisolto]';
                var matches = model.findMatches(placeholder, false, false, true, null, false);

                if (matches.length > 0) {
                    var range = matches[0].range;
                    monacoEditorInstance.executeEdits('applica-chunk-head', [{
                        range: range,
                        text: contenutoHead
                    }]);
                    statiConflitti[indiceConflitto].contenutoApplicato = contenutoHead;
                } else if (statiConflitti[indiceConflitto].contenutoApplicato) {
                    // US-010: Placeholder already replaced — queue after previously applied content
                    var contenutoPrecedente = statiConflitti[indiceConflitto].contenutoApplicato;
                    var matchesPrecedenti = model.findMatches(contenutoPrecedente, false, false, true, null, false);
                    if (matchesPrecedenti.length > 0) {
                        var rangePrecedente = matchesPrecedenti[0].range;
                        var fineRiga = rangePrecedente.endLineNumber;
                        var fineColonna = rangePrecedente.endColumn;
                        var rangeInserimento = new monaco.Range(fineRiga, fineColonna, fineRiga, fineColonna);
                        monacoEditorInstance.executeEdits('accoda-chunk-head', [{
                            range: rangeInserimento,
                            text: '\\n' + contenutoHead
                        }]);
                        statiConflitti[indiceConflitto].contenutoApplicato = contenutoPrecedente + '\\n' + contenutoHead;
                    }
                }

                statiConflitti[indiceConflitto].headGestito = true;
                marcaConflittoComeGestito('head', indiceConflitto);
            }

            // US-008: Discard HEAD chunk (mark as handled without modifying result)
            function scartaChunkHead(indiceConflitto) {
                statiConflitti[indiceConflitto].headGestito = true;
                marcaConflittoComeGestito('head', indiceConflitto);
            }

            // US-009: Apply MERGING chunk content to the result column via Monaco
            // US-010: Supports queuing — if HEAD was already applied, appends after it
            function applicaChunkMerging(indiceConflitto, contenutoMerging) {
                if (!monacoEditorInstance) return;
                var model = monacoEditorInstance.getModel();
                var placeholder = '// [Conflitto #' + (indiceConflitto + 1) + ' -- irrisolto]';
                var matches = model.findMatches(placeholder, false, false, true, null, false);

                if (matches.length > 0) {
                    var range = matches[0].range;
                    monacoEditorInstance.executeEdits('applica-chunk-merging', [{
                        range: range,
                        text: contenutoMerging
                    }]);
                    statiConflitti[indiceConflitto].contenutoApplicato = contenutoMerging;
                } else if (statiConflitti[indiceConflitto].contenutoApplicato) {
                    // US-010: Placeholder already replaced — queue after previously applied content
                    var contenutoPrecedente = statiConflitti[indiceConflitto].contenutoApplicato;
                    var matchesPrecedenti = model.findMatches(contenutoPrecedente, false, false, true, null, false);
                    if (matchesPrecedenti.length > 0) {
                        var rangePrecedente = matchesPrecedenti[0].range;
                        var fineRiga = rangePrecedente.endLineNumber;
                        var fineColonna = rangePrecedente.endColumn;
                        var rangeInserimento = new monaco.Range(fineRiga, fineColonna, fineRiga, fineColonna);
                        monacoEditorInstance.executeEdits('accoda-chunk-merging', [{
                            range: rangeInserimento,
                            text: '\\n' + contenutoMerging
                        }]);
                        statiConflitti[indiceConflitto].contenutoApplicato = contenutoPrecedente + '\\n' + contenutoMerging;
                    }
                }

                statiConflitti[indiceConflitto].mergingGestito = true;
                marcaConflittoComeGestito('merging', indiceConflitto);
            }

            // US-009: Discard MERGING chunk (mark as handled without modifying result)
            function scartaChunkMerging(indiceConflitto) {
                statiConflitti[indiceConflitto].mergingGestito = true;
                marcaConflittoComeGestito('merging', indiceConflitto);
            }

            // Mark a conflict segment as visually handled in the specified column
            function marcaConflittoComeGestito(colonna, indiceConflitto) {
                var selectorColumn = colonna === 'head' ? '#columnHead' : '#columnMerging';
                var segmentDiv = document.querySelector(
                    selectorColumn + ' [data-conflict-index="' + indiceConflitto + '"]'
                );
                if (segmentDiv) {
                    segmentDiv.classList.add('conflict-segment-handled');
                    // Add handled label
                    var handledLabel = document.createElement('div');
                    handledLabel.className = 'handled-label';
                    handledLabel.textContent = statiConflitti[indiceConflitto].headGestito && colonna === 'head'
                        ? (function() {
                            // Check if it was applied or discarded by looking at action bar presence
                            return 'gestito';
                          })()
                        : 'gestito';
                    var actionBar = segmentDiv.querySelector('.conflict-action-bar');
                    if (actionBar) {
                        actionBar.replaceWith(handledLabel);
                    }
                }
            }

            function renderColonneLaterali(segmenti) {
                var columnHead = document.getElementById('columnHead');
                var columnMerging = document.getElementById('columnMerging');
                columnHead.innerHTML = '';
                columnMerging.innerHTML = '';

                for (var i = 0; i < segmenti.length; i++) {
                    var segmento = segmenti[i];

                    // HEAD column
                    var divHead = document.createElement('div');
                    if (segmento.tipo === 'comune') {
                        divHead.className = 'code-segment';
                        divHead.textContent = segmento.contenuto;
                    } else {
                        divHead.className = 'code-segment conflict-segment conflict-segment-head';
                        divHead.setAttribute('data-conflict-index', segmento.indice);

                        // US-008: Action buttons for HEAD chunks
                        var actionBarHead = document.createElement('div');
                        actionBarHead.className = 'conflict-action-bar';

                        var applyButtonHead = document.createElement('button');
                        applyButtonHead.className = 'conflict-action-button';
                        applyButtonHead.textContent = '>>';
                        applyButtonHead.title = 'Applica chunk HEAD nella colonna Result';
                        (function(idx, content) {
                            applyButtonHead.addEventListener('click', function() {
                                applicaChunkHead(idx, content);
                            });
                        })(segmento.indice, segmento.head);

                        var discardButtonHead = document.createElement('button');
                        discardButtonHead.className = 'conflict-action-button';
                        discardButtonHead.textContent = 'x';
                        discardButtonHead.title = 'Scarta chunk HEAD';
                        (function(idx) {
                            discardButtonHead.addEventListener('click', function() {
                                scartaChunkHead(idx);
                            });
                        })(segmento.indice);

                        actionBarHead.appendChild(applyButtonHead);
                        actionBarHead.appendChild(discardButtonHead);
                        divHead.appendChild(actionBarHead);

                        // Code content below buttons
                        var codeContent = document.createElement('div');
                        codeContent.textContent = segmento.head;
                        divHead.appendChild(codeContent);

                        // Initialize conflict state
                        if (!statiConflitti[segmento.indice]) {
                            statiConflitti[segmento.indice] = { headGestito: false, mergingGestito: false, contenutoApplicato: null };
                        }
                    }
                    columnHead.appendChild(divHead);

                    // MERGING column
                    var divMerging = document.createElement('div');
                    if (segmento.tipo === 'comune') {
                        divMerging.className = 'code-segment';
                        divMerging.textContent = segmento.contenuto;
                    } else {
                        divMerging.className = 'code-segment conflict-segment conflict-segment-merging';
                        divMerging.setAttribute('data-conflict-index', segmento.indice);

                        // US-009: Action buttons for MERGING chunks
                        var actionBarMerging = document.createElement('div');
                        actionBarMerging.className = 'conflict-action-bar';

                        var applyButtonMerging = document.createElement('button');
                        applyButtonMerging.className = 'conflict-action-button';
                        applyButtonMerging.textContent = '<<';
                        applyButtonMerging.title = 'Applica chunk MERGING nella colonna Result';
                        (function(idx, content) {
                            applyButtonMerging.addEventListener('click', function() {
                                applicaChunkMerging(idx, content);
                            });
                        })(segmento.indice, segmento.merging);

                        var discardButtonMerging = document.createElement('button');
                        discardButtonMerging.className = 'conflict-action-button';
                        discardButtonMerging.textContent = 'x';
                        discardButtonMerging.title = 'Scarta chunk MERGING';
                        (function(idx) {
                            discardButtonMerging.addEventListener('click', function() {
                                scartaChunkMerging(idx);
                            });
                        })(segmento.indice);

                        actionBarMerging.appendChild(applyButtonMerging);
                        actionBarMerging.appendChild(discardButtonMerging);
                        divMerging.appendChild(actionBarMerging);

                        // Code content below buttons
                        var codeContentMerging = document.createElement('div');
                        codeContentMerging.textContent = segmento.merging;
                        divMerging.appendChild(codeContentMerging);

                        // Initialize conflict state (shared with HEAD)
                        if (!statiConflitti[segmento.indice]) {
                            statiConflitti[segmento.indice] = { headGestito: false, mergingGestito: false, contenutoApplicato: null };
                        }
                    }
                    columnMerging.appendChild(divMerging);
                }
            }

            function creaMonacoEditor(contenutoIniziale) {
                var isDarkTheme = document.body.classList.contains('vscode-dark') ||
                                  document.body.classList.contains('vscode-high-contrast');
                var monacoTheme = isDarkTheme ? 'vs-dark' : 'vs';

                monacoEditorInstance = monaco.editor.create(
                    document.getElementById('monacoEditorContainer'),
                    {
                        value: contenutoIniziale,
                        language: linguaggioId,
                        theme: monacoTheme,
                        readOnly: false,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        automaticLayout: true,
                        wordWrap: 'off',
                        renderWhitespace: 'selection',
                        fontSize: 13,
                        tabSize: 2,
                        folding: true,
                        glyphMargin: false,
                        lineDecorationsWidth: 5,
                    }
                );
            }

            function inizializzaLayout(dati) {
                var segmenti = buildSegmentsFromConflicts(dati.righe, dati.conflitti);
                segmentiGlobali = segmenti;
                renderColonneLaterali(segmenti);

                // US-007: Initialize Monaco Editor in the result column
                var contenutoRisultato = buildInitialResultContent(dati.righe, dati.conflitti);
                require(['vs/editor/editor.main'], function() {
                    creaMonacoEditor(contenutoRisultato);
                });
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
                    // US-005: Restore result column content from saved state
                    if (message.stato && message.stato.contenutoColonnaCentrale && monacoEditorInstance) {
                        monacoEditorInstance.setValue(message.stato.contenutoColonnaCentrale);
                    }
                }
            });

            // Signal webview is ready to receive data
            vscode.postMessage({ command: 'webviewPronta' });
        })();
    </script>
</body>
</html>`;
    }

    private detectLanguageIdFromFileName(fileName: string): string {
        const estensioneFile = fileName.split('.').pop()?.toLowerCase() || '';
        const mappaLinguaggi: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript',
            'jsx': 'javascript',
            'mjs': 'javascript',
            'cjs': 'javascript',
            'py': 'python',
            'java': 'java',
            'cs': 'csharp',
            'kt': 'kotlin',
            'kts': 'kotlin',
            'rs': 'rust',
            'go': 'go',
            'json': 'json',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'less': 'less',
            'md': 'markdown',
            'yaml': 'yaml',
            'yml': 'yaml',
            'xml': 'xml',
            'sql': 'sql',
            'sh': 'shell',
            'bash': 'shell',
            'vue': 'html',
            'rb': 'ruby',
            'php': 'php',
            'c': 'c',
            'cpp': 'cpp',
            'h': 'c',
            'hpp': 'cpp',
            'swift': 'swift',
            'r': 'r',
        };
        return mappaLinguaggi[estensioneFile] || 'plaintext';
    }

    public openForDocument(document: vscode.TextDocument): void {
        vscode.commands.executeCommand(
            'vscode.openWith',
            document.uri,
            MergeEditorProvider.VIEW_TYPE
        );
    }
}
