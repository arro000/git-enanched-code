import { escapaHtml } from './utils/EscaperHtml';

export interface ParametriHtmlMergeEditor {
    fileName: string;
    nonce: string;
    monacoBaseUri: string;
    cspSource: string;
    linguaggioId: string;
    jsUri: string;
    cssUri: string;
}

/**
 * Genera l'HTML shell del merge editor.
 * CSS e JS sono caricati come file bundlati esterni, non inline.
 */
export function costruisciHtmlMergeEditor(params: ParametriHtmlMergeEditor): string {
    const { fileName, nonce, monacoBaseUri, cspSource, linguaggioId, jsUri, cssUri } = params;
    const fileNameSanitizzato = escapaHtml(fileName);
    const baseNameSanitizzato = escapaHtml(fileName.split(/[\\/]/).pop() || fileName);
    const linguaggioIdSafe = linguaggioId.replace(/[^a-zA-Z0-9+#-]/g, '');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${cspSource} 'unsafe-eval'; style-src 'unsafe-inline' ${cspSource}; font-src ${cspSource}; worker-src blob:;">
    <title>Git Enhanced — Merge Editor</title>
    <link rel="stylesheet" href="${cssUri}">
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
    <script nonce="${nonce}">
        window.__MONACO_BASE_URI__ = '${monacoBaseUri}';
        window.__LINGUAGGIO_ID__ = '${linguaggioIdSafe}';
    </script>
    <script nonce="${nonce}" src="${monacoBaseUri}/vs/loader.js"></script>
    <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}
