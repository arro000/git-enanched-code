import * as vscode from 'vscode';
import { MergeCompletionService } from '../core/git/MergeCompletionService';
import { FallbackService } from '../core/git/FallbackService';
import { MergeSessionStateManager } from '../core/merge/MergeSessionStateManager';
import { countConflicts } from '../core/git/ConflictDetector';
import { parseConflicts } from '../core/git/ConflictParser';
import { Diff3Resolver, RisultatoAnalisiDiff3 } from '../core/merge/Diff3Resolver';
import { AnalizzatoreAstConflitti } from '../core/merge/AnalizzatoreAstConflitti';

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
    private readonly diff3Resolver = new Diff3Resolver();
    private readonly analizzatoreAst = new AnalizzatoreAstConflitti();
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

            // US-012/US-014: Auto-resolve con diff3 e AST
            let risultatoDiff3: RisultatoAnalisiDiff3 | null = null;
            let risoluzionePending: Array<{ indiceConflitto: number; contenutoRisolto: string; sorgente: string; scoreConfidenza: number }> = [];

            if (!statoEsistente) {
                // Create initial state for a new merge session
                const numeroConflitti = countConflicts(document);
                const statoIniziale = this.stateManager.creaStatoIniziale(
                    document.uri.fsPath,
                    contenutoOriginale,
                    numeroConflitti
                );

                // US-012: Layer 1 — diff3 auto-resolve (compute but don't apply yet)
                risultatoDiff3 = this.diff3Resolver.risolviConflitti(conflittiParsati);

                // US-013: Layer 2 — AST analysis per conflitti residui
                const conflittiNonRisolti = conflittiParsati.filter((_, indice) => {
                    const ris = risultatoDiff3!.conflittiRisolti[indice];
                    return ris && !ris.risolvibileAutomaticamente &&
                           ris.motivoNonRisolto === 'sovrapposizione-modifiche';
                });

                let risultatoAst: Awaited<ReturnType<AnalizzatoreAstConflitti['analizzaConflitti']>> | null = null;
                if (conflittiNonRisolti.length > 0) {
                    try {
                        risultatoAst = await this.analizzatoreAst.analizzaConflitti(
                            conflittiNonRisolti,
                            linguaggioId
                        );
                    } catch {
                        // AST analysis failure is non-fatal
                    }
                }

                // US-014: Collect all pending resolutions (NOT applied until magic wand click)

                for (const ris of risultatoDiff3.conflittiRisolti) {
                    if (ris.risolvibileAutomaticamente && ris.contenutoRisolto !== null) {
                        risoluzionePending.push({
                            indiceConflitto: ris.indiceConflitto,
                            contenutoRisolto: ris.contenutoRisolto,
                            sorgente: 'diff3-auto',
                            scoreConfidenza: 1.0, // diff3 has maximum confidence
                        });
                    }
                }

                if (risultatoAst) {
                    for (const ris of risultatoAst.conflittiAnalizzati) {
                        if (ris.risolvibileAutomaticamente && ris.contenutoRisolto !== null) {
                            risoluzionePending.push({
                                indiceConflitto: ris.indiceConflitto,
                                contenutoRisolto: ris.contenutoRisolto,
                                sorgente: 'ast-auto',
                                scoreConfidenza: ris.scoreConfidenza,
                            });
                        }
                    }
                }

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
                        // US-014/US-015: Send pending resolutions with confidence info
                        if (risoluzionePending.length > 0) {
                            const totaleConflitti = conflittiParsati.length;
                            webviewPanel.webview.postMessage({
                                command: 'risoluzioniPending',
                                risoluzioni: risoluzionePending,
                                conteggio: risoluzionePending.length,
                                totaleConflitti,
                            });
                        }
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
                    } else if (messaggio.command === 'applicaBacchettaMagica') {
                        // US-014: Apply all pending auto-resolutions
                        if (messaggio.risoluzioni && Array.isArray(messaggio.risoluzioni)) {
                            const statoCorrente = await this.stateManager.recuperaStato(
                                document.uri.fsPath, document.getText()
                            );
                            if (statoCorrente) {
                                for (const ris of messaggio.risoluzioni) {
                                    const statoConflitto = statoCorrente.statiConflitti[ris.indiceConflitto];
                                    if (statoConflitto && !statoConflitto.risolto) {
                                        statoConflitto.risolto = true;
                                        statoConflitto.contenutoRisolto = ris.contenutoRisolto;
                                        statoConflitto.sorgenteApplicata = ris.sorgente ?? 'diff3-auto';
                                    }
                                }
                                await this.stateManager.salvaStato(statoCorrente);
                            }
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
        const baseNameSanitizzato = this.escapaHtml(fileName.split(/[\\/]/).pop() || fileName);
        const linguaggioIdSafe = linguaggioId.replace(/[^a-zA-Z0-9+#-]/g, '');
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${cspSource} 'unsafe-eval'; style-src 'unsafe-inline' ${cspSource}; font-src ${cspSource}; worker-src blob:;">
    <title>Git Enhanced — Merge Editor</title>
    <style>
        :root {
            --editor-bg:        #1e1e1e;
            --sidebar-bg:       #252526;
            --panel-border:     rgba(128,128,128,0.35);
            --border:           #3c3c3c;
            --border-light:     #454545;
            --foreground:       #d4d4d4;
            --foreground-dim:   #cccccc;
            --foreground-muted: #858585;
            --foreground-faint: #3c3c3c;
            --statusbar-bg:     #007acc;
            --statusbar-fg:     #ffffff;
            --btn-primary-bg:   #0e639c;
            --btn-primary-hover:#1177bb;
            --head:             #e6931a;
            --head-bg:          rgba(230,147,26,0.15);
            --head-border:      rgba(230,147,26,0.5);
            --head-dim:         rgba(230,147,26,0.6);
            --result:           #4ec9b0;
            --result-bg:        rgba(78,201,176,0.1);
            --result-border:    rgba(78,201,176,0.4);
            --result-dim:       rgba(78,201,176,0.6);
            --merging:          #4aabf7;
            --merging-bg:       rgba(74,171,247,0.15);
            --merging-border:   rgba(74,171,247,0.5);
            --merging-dim:      rgba(74,171,247,0.6);
            --conflict-red:     #f14c4c;
            --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            --font-mono: Consolas, 'Courier New', monospace;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: var(--editor-bg);
            color: var(--foreground);
            font-family: var(--font-ui);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-size: 13px;
        }

        /* ── Merge toolbar ── */
        .merge-toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: var(--sidebar-bg);
            border-bottom: 1px solid var(--panel-border);
            flex-shrink: 0;
        }
        .merge-toolbar-title {
            font-size: 11px;
            font-weight: 600;
            color: var(--foreground-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .merge-sep { width: 1px; height: 16px; background: var(--border-light); flex-shrink: 0; margin: 0 4px; }
        .spacer { flex: 1; }
        .conflict-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--foreground-muted);
        }
        .conflict-count { color: var(--conflict-red); font-weight: 600; }
        .pulse-dot {
            width: 6px; height: 6px;
            border-radius: 50%;
            background: var(--conflict-red);
            animation: blink 2s ease-in-out infinite;
            flex-shrink: 0;
        }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .vsc-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px;
            font-size: 12px;
            border-radius: 2px;
            cursor: pointer;
            border: 1px solid transparent;
            line-height: 1.4;
            white-space: nowrap;
        }
        .vsc-btn-primary { background: var(--btn-primary-bg); color: #fff; }
        .vsc-btn-primary:hover { background: var(--btn-primary-hover); }
        .vsc-btn-primary:disabled { opacity: 0.5; cursor: default; }
        .vsc-btn-secondary { background: transparent; color: var(--foreground-dim); border-color: var(--border-light); }
        .vsc-btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.06); }
        .vsc-btn-secondary:disabled { opacity: 0.5; cursor: default; }

        /* ── Column headers ── */
        .col-headers {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 14px;
            background: var(--sidebar-bg);
            border-bottom: 1px solid var(--panel-border);
            flex-shrink: 0;
        }
        .col-hdr {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 5px 12px;
            border-right: 1px solid var(--panel-border);
        }
        .col-hdr-bar { width: 2px; height: 14px; border-radius: 1px; flex-shrink: 0; }
        .col-hdr.head .col-hdr-bar    { background: var(--head); }
        .col-hdr.result .col-hdr-bar  { background: var(--result); }
        .col-hdr.merging .col-hdr-bar { background: var(--merging); }
        .col-hdr-name { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .col-hdr.head .col-hdr-name    { color: var(--head); }
        .col-hdr.result .col-hdr-name  { color: var(--result); }
        .col-hdr.merging .col-hdr-name { color: var(--merging); }
        .col-hdr-branch {
            font-size: 10.5px;
            color: var(--foreground-muted);
            padding: 1px 5px;
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--border);
            border-radius: 2px;
        }
        .col-hdr-tag { margin-left: auto; font-size: 10px; color: var(--foreground-faint); }

        /* ── Editor grid ── */
        .editor-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 14px;
            flex: 1;
            overflow: hidden;
            min-height: 0;
        }
        .col {
            overflow-y: auto;
            overflow-x: auto;
            border-right: 1px solid var(--panel-border);
            background: var(--editor-bg);
        }
        .column-result { position: relative; overflow: hidden; }
        #monacoEditorContainer { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }

        /* ── Code segments ── */
        .code-segment {
            font-family: var(--font-mono);
            font-size: 13px;
            line-height: 1.5;
            white-space: pre;
            padding: 0 8px;
        }

        /* ── Conflict zones ── */
        .cz.head-cz    { background: var(--head-bg);    border-left: 3px solid var(--head-border); }
        .cz.merging-cz { background: var(--merging-bg); border-left: 3px solid var(--merging-border); }

        /* ── Conflict action bar ── */
        .ca {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid var(--panel-border);
        }
        .ab {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 1px 7px;
            border-radius: 2px;
            font-size: 11px;
            cursor: pointer;
            border: 1px solid transparent;
            line-height: 1.4;
        }
        .ab.ah { color: var(--head);    border-color: rgba(230,147,26,0.4); background: rgba(230,147,26,0.08); }
        .ab.ah:hover { background: rgba(230,147,26,0.18); }
        .ab.am { color: var(--merging); border-color: rgba(74,171,247,0.4);  background: rgba(74,171,247,0.08); }
        .ab.am:hover { background: rgba(74,171,247,0.18); }
        .ab.dx { color: var(--foreground-muted); border-color: var(--border); background: transparent; }
        .ab.dx:hover { background: rgba(255,255,255,0.06); color: var(--foreground-dim); }

        /* ── Handled state ── */
        .conflict-segment-handled { opacity: 0.35; }
        .conflict-segment-handled .ca { display: none; }
        .handled-label { font-size: 0.7em; opacity: 0.6; font-style: italic; padding: 2px 8px; }

        /* ── Loading ── */
        .loading-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            opacity: 0.5;
            font-size: 0.9em;
        }

        /* ── Minimap ── */
        .minimap {
            background: var(--editor-bg);
            border-left: 1px solid var(--panel-border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .mm-seg { width: 100%; flex-shrink: 0; }

        /* ── Status bar ── */
        .statusbar {
            display: flex;
            align-items: center;
            height: 22px;
            background: var(--statusbar-bg);
            font-size: 12px;
            color: var(--statusbar-fg);
            flex-shrink: 0;
            user-select: none;
        }
        .sb-item { display: flex; align-items: center; gap: 4px; padding: 0 10px; height: 100%; cursor: pointer; }
        .sb-item:hover { background: rgba(255,255,255,0.12); }
        .sb-item.sb-warn { background: #cc6633; }
        .sb-item.sb-warn:hover { background: #d97540; }
        .sb-spacer { flex: 1; }

        /* ── Modal overlay conferma merge ── */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 9999;
            align-items: center;
            justify-content: center;
        }
        .modal-overlay.visibile {
            display: flex;
        }
        .modal-pannello {
            background: var(--sidebar-bg);
            border: 1px solid var(--border-light);
            border-radius: 6px;
            padding: 24px;
            max-width: 440px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }
        .modal-pannello h3 {
            font-size: 14px;
            font-weight: 600;
            color: var(--foreground);
            margin-bottom: 12px;
        }
        .modal-pannello p {
            font-size: 13px;
            color: var(--foreground-dim);
            line-height: 1.5;
            margin-bottom: 20px;
        }
        .modal-azioni {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
        .kbd { padding: 0 4px; background: rgba(255,255,255,0.15); border-radius: 2px; font-size: 10.5px; }
    </style>
</head>
<body>
    <div class="merge-toolbar">
        <span class="merge-toolbar-title">Git Enhanced — Merge Editor</span>
        <div class="merge-sep"></div>
        <div class="conflict-badge">
            <span class="pulse-dot"></span>
            <span class="conflict-count" id="conflictCount">—</span>
            <span>conflicts remaining</span>
        </div>
        <div class="spacer"></div>
        <button class="vsc-btn vsc-btn-secondary" id="btnBacchettaMagica" disabled title="">&#10022; Auto-resolve</button>
        <button class="vsc-btn vsc-btn-primary" id="completeMergeButton">&#10003; Complete Merge</button>
    </div>
    <div class="col-headers">
        <div class="col-hdr head">
            <div class="col-hdr-bar"></div>
            <span class="col-hdr-name">Current (HEAD)</span>
            <span class="col-hdr-branch">${baseNameSanitizzato}</span>
            <span class="col-hdr-tag">read-only</span>
        </div>
        <div class="col-hdr result">
            <div class="col-hdr-bar"></div>
            <span class="col-hdr-name">Result</span>
            <span class="col-hdr-tag">editable</span>
        </div>
        <div class="col-hdr merging">
            <div class="col-hdr-bar"></div>
            <span class="col-hdr-name">Incoming (MERGING)</span>
            <span class="col-hdr-branch">${baseNameSanitizzato}</span>
            <span class="col-hdr-tag">read-only</span>
        </div>
        <div></div>
    </div>
    <div class="editor-grid">
        <div class="col" id="columnHead">
            <div class="loading-indicator">Loading...</div>
        </div>
        <div class="col column-result" id="columnResult">
            <div id="monacoEditorContainer"></div>
        </div>
        <div class="col" id="columnMerging">
            <div class="loading-indicator">Loading...</div>
        </div>
        <div class="minimap" id="minimapContainer"></div>
    </div>
    <div class="statusbar">
        <div class="sb-item sb-warn"><span>&#9889;</span><span>Git Enhanced</span></div>
        <div class="sb-item"><span>&#8859;</span><span title="${fileNameSanitizzato}">${baseNameSanitizzato}</span></div>
        <div class="sb-item"><span>&#9888;</span><span id="sbConflictCount">— merge conflicts</span></div>
        <div class="sb-spacer"></div>
        <div class="sb-item"><span class="kbd">F7</span><span>next</span><span class="kbd">Shift+F7</span><span>prev</span></div>
    </div>
    <!-- US-011: Modal conferma merge con conflitti aperti -->
    <div class="modal-overlay" id="modalConfermaOverlay">
        <div class="modal-pannello">
            <h3>Conflitti non risolti</h3>
            <p id="modalConfermaMessaggio">Ci sono ancora <strong id="modalConteggioConflitti">0</strong> conflitti irrisolti. Vuoi procedere comunque?</p>
            <div class="modal-azioni">
                <button class="vsc-btn vsc-btn-secondary" id="modalAnnullaButton">Annulla</button>
                <button class="vsc-btn vsc-btn-primary" id="modalConfermaButton">Conferma</button>
            </div>
        </div>
    </div>
    <script nonce="${nonce}" src="${monacoBaseUri}/vs/loader.js"></script>
    <script nonce="${nonce}">
        (function() {
            var vscode = acquireVsCodeApi();
            var monacoEditorInstance = null;
            var linguaggioId = '${linguaggioIdSafe}';
            var statiConflitti = {};
            var segmentiGlobali = null;

            // US-007: Configure Monaco AMD loader
            require.config({ paths: { 'vs': '${monacoBaseUri}/vs' }});

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
                        segmenti.push({ tipo: 'comune', contenuto: righe.slice(rigaCorrente, conflitto.startLine).join('\\n') });
                    }
                    segmenti.push({ tipo: 'conflitto', indice: conflitto.index, head: conflitto.head, base: conflitto.base, merging: conflitto.merging });
                    rigaCorrente = conflitto.endLine + 1;
                }
                if (rigaCorrente < righe.length) {
                    segmenti.push({ tipo: 'comune', contenuto: righe.slice(rigaCorrente).join('\\n') });
                }
                return segmenti;
            }

            function buildInitialResultContent(righe, conflitti) {
                var resultLines = [];
                var rigaCorrente = 0;
                for (var i = 0; i < conflitti.length; i++) {
                    var c = conflitti[i];
                    for (var j = rigaCorrente; j < c.startLine; j++) { resultLines.push(righe[j]); }
                    resultLines.push('// [Conflitto #' + (c.index + 1) + ' -- irrisolto]');
                    rigaCorrente = c.endLine + 1;
                }
                for (var j = rigaCorrente; j < righe.length; j++) { resultLines.push(righe[j]); }
                return resultLines.join('\\n');
            }

            // US-008: Apply HEAD chunk — US-010: queuing support
            function applicaChunkHead(indiceConflitto, contenutoHead) {
                if (!monacoEditorInstance) return;
                var model = monacoEditorInstance.getModel();
                var placeholder = '// [Conflitto #' + (indiceConflitto + 1) + ' -- irrisolto]';
                var matches = model.findMatches(placeholder, false, false, true, null, false);
                if (matches.length > 0) {
                    monacoEditorInstance.executeEdits('applica-chunk-head', [{ range: matches[0].range, text: contenutoHead }]);
                    statiConflitti[indiceConflitto].contenutoApplicato = contenutoHead;
                } else if (statiConflitti[indiceConflitto].contenutoApplicato) {
                    var contenutoPrecedente = statiConflitti[indiceConflitto].contenutoApplicato;
                    var matchesPrecedenti = model.findMatches(contenutoPrecedente, false, false, true, null, false);
                    if (matchesPrecedenti.length > 0) {
                        var rp = matchesPrecedenti[0].range;
                        var ri = new monaco.Range(rp.endLineNumber, rp.endColumn, rp.endLineNumber, rp.endColumn);
                        monacoEditorInstance.executeEdits('accoda-chunk-head', [{ range: ri, text: '\\n' + contenutoHead }]);
                        statiConflitti[indiceConflitto].contenutoApplicato = contenutoPrecedente + '\\n' + contenutoHead;
                    }
                }
                statiConflitti[indiceConflitto].headGestito = true;
                marcaConflittoComeGestito('head', indiceConflitto);
            }

            // US-008: Discard HEAD chunk
            function scartaChunkHead(indiceConflitto) {
                statiConflitti[indiceConflitto].headGestito = true;
                marcaConflittoComeGestito('head', indiceConflitto);
            }

            // US-009: Apply MERGING chunk — US-010: queuing support
            function applicaChunkMerging(indiceConflitto, contenutoMerging) {
                if (!monacoEditorInstance) return;
                var model = monacoEditorInstance.getModel();
                var placeholder = '// [Conflitto #' + (indiceConflitto + 1) + ' -- irrisolto]';
                var matches = model.findMatches(placeholder, false, false, true, null, false);
                if (matches.length > 0) {
                    monacoEditorInstance.executeEdits('applica-chunk-merging', [{ range: matches[0].range, text: contenutoMerging }]);
                    statiConflitti[indiceConflitto].contenutoApplicato = contenutoMerging;
                } else if (statiConflitti[indiceConflitto].contenutoApplicato) {
                    var contenutoPrecedente = statiConflitti[indiceConflitto].contenutoApplicato;
                    var matchesPrecedenti = model.findMatches(contenutoPrecedente, false, false, true, null, false);
                    if (matchesPrecedenti.length > 0) {
                        var rp = matchesPrecedenti[0].range;
                        var ri = new monaco.Range(rp.endLineNumber, rp.endColumn, rp.endLineNumber, rp.endColumn);
                        monacoEditorInstance.executeEdits('accoda-chunk-merging', [{ range: ri, text: '\\n' + contenutoMerging }]);
                        statiConflitti[indiceConflitto].contenutoApplicato = contenutoPrecedente + '\\n' + contenutoMerging;
                    }
                }
                statiConflitti[indiceConflitto].mergingGestito = true;
                marcaConflittoComeGestito('merging', indiceConflitto);
            }

            // US-009: Discard MERGING chunk
            function scartaChunkMerging(indiceConflitto) {
                statiConflitti[indiceConflitto].mergingGestito = true;
                marcaConflittoComeGestito('merging', indiceConflitto);
            }

            // US-027: Count conflicts where not both sides are handled
            function contaConflittiAperti() {
                var count = 0;
                for (var k in statiConflitti) {
                    if (!statiConflitti[k].headGestito || !statiConflitti[k].mergingGestito) {
                        count++;
                    }
                }
                return count;
            }

            // US-027: Aggiorna badge toolbar e contatore status bar, ridisegna minimap
            function aggiornaContatoreBadge() {
                var nonInizializzato = Object.keys(statiConflitti).length === 0;
                var aperti = nonInizializzato ? null : contaConflittiAperti();
                var el = document.getElementById('conflictCount');
                if (el) { el.textContent = aperti === null ? '\u2014' : aperti.toString(); }
                var sbEl = document.getElementById('sbConflictCount');
                if (sbEl) { sbEl.textContent = aperti === null ? '\u2014 merge conflicts' : aperti + ' merge conflicts'; }
                renderMinimap();
            }

            // US-027: Disegna segmenti proporzionali nella minimap.
            // Prima chiamata: costruisce tutti i segmenti.
            // Chiamate successive: aggiorna solo il colore dei segmenti conflitto.
            function renderMinimap() {
                var container = document.getElementById('minimapContainer');
                if (!container || !segmentiGlobali) { return; }
                var primaVolta = container.children.length === 0;
                if (!primaVolta) {
                    // Aggiorna solo il colore dei segmenti di tipo conflitto
                    var segmentiConflitto = container.querySelectorAll('[data-mm-conflict]');
                    for (var j = 0; j < segmentiConflitto.length; j++) {
                        var indice = parseInt(segmentiConflitto[j].getAttribute('data-mm-conflict'), 10);
                        var stato = statiConflitti[indice];
                        segmentiConflitto[j].style.background = (stato && stato.headGestito && stato.mergingGestito)
                            ? 'rgba(78,201,176,0.6)'
                            : 'rgba(241,76,76,0.7)';
                    }
                    return;
                }
                var totalLinee = 0;
                for (var i = 0; i < segmentiGlobali.length; i++) {
                    var s = segmentiGlobali[i];
                    totalLinee += s.tipo === 'comune'
                        ? s.contenuto.split('\\n').length
                        : Math.max(s.head ? s.head.split('\\n').length : 1, s.merging ? s.merging.split('\\n').length : 1);
                }
                if (totalLinee === 0) { return; }
                for (var i = 0; i < segmentiGlobali.length; i++) {
                    var s = segmentiGlobali[i];
                    var el = document.createElement('div');
                    el.className = 'mm-seg';
                    var linee;
                    if (s.tipo === 'comune') {
                        linee = s.contenuto.split('\\n').length;
                        el.style.background = 'rgba(212,212,212,0.08)';
                    } else {
                        linee = Math.max(s.head ? s.head.split('\\n').length : 1, s.merging ? s.merging.split('\\n').length : 1);
                        var stato = statiConflitti[s.indice];
                        el.style.background = (stato && stato.headGestito && stato.mergingGestito)
                            ? 'rgba(78,201,176,0.6)'
                            : 'rgba(241,76,76,0.7)';
                        el.setAttribute('data-mm-conflict', s.indice);
                    }
                    el.style.flex = linee + ' 0 0px';
                    container.appendChild(el);
                }
            }

            // Mark a conflict segment as visually handled; update counter
            function marcaConflittoComeGestito(colonna, indiceConflitto) {
                var selectorColumn = colonna === 'head' ? '#columnHead' : '#columnMerging';
                var segmentDiv = document.querySelector(selectorColumn + ' [data-conflict-index="' + indiceConflitto + '"]');
                if (segmentDiv) {
                    segmentDiv.classList.add('conflict-segment-handled');
                    var handledLabel = document.createElement('div');
                    handledLabel.className = 'handled-label';
                    handledLabel.textContent = 'gestito';
                    var actionBar = segmentDiv.querySelector('.ca');
                    if (actionBar) { actionBar.replaceWith(handledLabel); }
                }
                aggiornaContatoreBadge();
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
                        divHead.className = 'cz head-cz';
                        divHead.setAttribute('data-conflict-index', segmento.indice);

                        var actionBarHead = document.createElement('div');
                        actionBarHead.className = 'ca';

                        var applyButtonHead = document.createElement('button');
                        applyButtonHead.className = 'ab ah';
                        applyButtonHead.textContent = '>> Accept Current';
                        applyButtonHead.title = 'Applica chunk HEAD nella colonna Result';
                        (function(idx, content) {
                            applyButtonHead.addEventListener('click', function() { applicaChunkHead(idx, content); });
                        })(segmento.indice, segmento.head);

                        var discardButtonHead = document.createElement('button');
                        discardButtonHead.className = 'ab dx';
                        discardButtonHead.textContent = '\\u2715 Ignore';
                        discardButtonHead.title = 'Scarta chunk HEAD';
                        (function(idx) {
                            discardButtonHead.addEventListener('click', function() { scartaChunkHead(idx); });
                        })(segmento.indice);

                        actionBarHead.appendChild(applyButtonHead);
                        actionBarHead.appendChild(discardButtonHead);
                        divHead.appendChild(actionBarHead);

                        var codeContent = document.createElement('div');
                        codeContent.className = 'code-segment';
                        codeContent.textContent = segmento.head;
                        divHead.appendChild(codeContent);

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
                        divMerging.className = 'cz merging-cz';
                        divMerging.setAttribute('data-conflict-index', segmento.indice);

                        var actionBarMerging = document.createElement('div');
                        actionBarMerging.className = 'ca';

                        var applyButtonMerging = document.createElement('button');
                        applyButtonMerging.className = 'ab am';
                        applyButtonMerging.textContent = '<< Accept Incoming';
                        applyButtonMerging.title = 'Applica chunk MERGING nella colonna Result';
                        (function(idx, content) {
                            applyButtonMerging.addEventListener('click', function() { applicaChunkMerging(idx, content); });
                        })(segmento.indice, segmento.merging);

                        var discardButtonMerging = document.createElement('button');
                        discardButtonMerging.className = 'ab dx';
                        discardButtonMerging.textContent = '\\u2715 Ignore';
                        discardButtonMerging.title = 'Scarta chunk MERGING';
                        (function(idx) {
                            discardButtonMerging.addEventListener('click', function() { scartaChunkMerging(idx); });
                        })(segmento.indice);

                        actionBarMerging.appendChild(applyButtonMerging);
                        actionBarMerging.appendChild(discardButtonMerging);
                        divMerging.appendChild(actionBarMerging);

                        var codeContentMerging = document.createElement('div');
                        codeContentMerging.className = 'code-segment';
                        codeContentMerging.textContent = segmento.merging;
                        divMerging.appendChild(codeContentMerging);

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
                monacoEditorInstance = monaco.editor.create(
                    document.getElementById('monacoEditorContainer'),
                    {
                        value: contenutoIniziale,
                        language: linguaggioId,
                        theme: isDarkTheme ? 'vs-dark' : 'vs',
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
                aggiornaContatoreBadge();

                // US-007: Initialize Monaco Editor in the result column
                var contenutoRisultato = buildInitialResultContent(dati.righe, dati.conflitti);
                require(['vs/editor/editor.main'], function() {
                    creaMonacoEditor(contenutoRisultato);
                });
            }

            // US-011: Gestione click "Complete Merge" con conferma se ci sono conflitti aperti
            function gestisciCompletaMerge() {
                var numeroConflittiAperti = contaConflittiAperti();
                if (numeroConflittiAperti > 0) {
                    var conteggioElemento = document.getElementById('modalConteggioConflitti');
                    if (conteggioElemento) {
                        conteggioElemento.textContent = numeroConflittiAperti.toString();
                    }
                    var overlay = document.getElementById('modalConfermaOverlay');
                    if (overlay) {
                        overlay.classList.add('visibile');
                    }
                } else {
                    vscode.postMessage({ command: 'completaMerge' });
                }
            }

            function chiudiModalConferma() {
                var overlay = document.getElementById('modalConfermaOverlay');
                if (overlay) {
                    overlay.classList.remove('visibile');
                }
            }

            document.getElementById('completeMergeButton').addEventListener('click', function() {
                gestisciCompletaMerge();
            });

            // US-011: "Conferma" chiude il modal e invia completaMerge
            document.getElementById('modalConfermaButton').addEventListener('click', function() {
                chiudiModalConferma();
                vscode.postMessage({ command: 'completaMerge' });
            });

            // US-011: "Annulla" chiude il modal senza effetti collaterali
            document.getElementById('modalAnnullaButton').addEventListener('click', function() {
                chiudiModalConferma();
            });

            // US-011: Chiusura modal con Escape
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') { chiudiModalConferma(); }
            });

            // US-011: Chiusura modal con click sull'overlay esterno
            document.getElementById('modalConfermaOverlay').addEventListener('click', function(e) {
                if (e.target === this) { chiudiModalConferma(); }
            });

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
                } else if (message.command === 'risoluzioniPending') {
                    // US-014: Store pending resolutions and enable magic wand button
                    window._risoluzioniPending = message.risoluzioni || [];
                    var btnBacchetta = document.getElementById('btnBacchettaMagica');
                    if (btnBacchetta && window._risoluzioniPending.length > 0) {
                        btnBacchetta.disabled = false;
                        btnBacchetta.textContent = '\\u2726 Auto-resolve (' + window._risoluzioniPending.length + ')';

                        // US-015: Tooltip con conteggio e indicatore di confidenza
                        var risolvibili = window._risoluzioniPending.length;
                        var totale = message.totaleConflitti || risolvibili;
                        var sommaConfidenza = 0;
                        window._risoluzioniPending.forEach(function(r) {
                            sommaConfidenza += (r.scoreConfidenza || 0);
                        });
                        var confidenzaMedia = risolvibili > 0 ? sommaConfidenza / risolvibili : 0;
                        var livelloConfidenza = confidenzaMedia >= 0.8 ? 'alta' : confidenzaMedia >= 0.5 ? 'media' : 'bassa';
                        btnBacchetta.title = risolvibili + ' risolvibili su ' + totale + ' totali — confidenza: ' + livelloConfidenza + ' (' + Math.round(confidenzaMedia * 100) + '%)';
                    }
                }
            });

            // US-014: Magic wand button click handler
            var btnBacchetta = document.getElementById('btnBacchettaMagica');
            if (btnBacchetta) {
                btnBacchetta.addEventListener('click', function() {
                    if (!window._risoluzioniPending || window._risoluzioniPending.length === 0) return;

                    // Apply each pending resolution to the result column in Monaco Editor
                    // This makes the action undoable via Ctrl+Z
                    var risoluzioni = window._risoluzioniPending;

                    // Notify backend to update state
                    vscode.postMessage({
                        command: 'applicaBacchettaMagica',
                        risoluzioni: risoluzioni
                    });

                    // Apply in webview (update conflict zone visuals)
                    risoluzioni.forEach(function(ris) {
                        // Mark conflict as resolved in the UI
                        var conflictZone = document.querySelector('[data-conflict-index="' + ris.indiceConflitto + '"]');
                        if (conflictZone) {
                            conflictZone.classList.add('resolved');
                            conflictZone.classList.remove('pending');
                        }
                    });

                    // Update conflict counter
                    var pendingCount = document.querySelectorAll('.conflict-zone:not(.resolved)').length;
                    var badge = document.querySelector('.conflict-badge-count');
                    if (badge) {
                        badge.textContent = pendingCount + ' conflicts remaining';
                    }

                    // Disable the button after use
                    btnBacchetta.disabled = true;
                    btnBacchetta.textContent = '\\u2726 Auto-resolve (done)';
                    window._risoluzioniPending = [];
                });
            }

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
