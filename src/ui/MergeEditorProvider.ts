import * as vscode from 'vscode';
import { MergeCompletionService } from '../core/git/MergeCompletionService';
import { FallbackService } from '../core/git/FallbackService';
import { MergeSessionStateManager } from '../core/merge/MergeSessionStateManager';
import { countConflicts } from '../core/git/ConflictDetector';
import { parseConflicts } from '../core/git/ConflictParser';
import { Diff3Resolver } from '../core/merge/Diff3Resolver';
import { AnalizzatoreAstConflitti } from '../core/merge/AnalizzatoreAstConflitti';
import { generaNonce } from './utils/GeneratoreNonce';
import { rilevaLinguaggioDaNomeFile } from './utils/RilevatoreLinguaggio';
import { costruisciHtmlMergeEditor } from './MergeEditorHtmlBuilder';
import { GestoreMessaggiWebview } from './GestoreMessaggiWebview';

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
            const webviewBundlePath = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview');
            webviewPanel.webview.options = {
                enableScripts: true,
                localResourceRoots: [monacoBasePath, webviewBundlePath],
            };

            // US-006: Parse conflicts and prepare data for 3-column layout
            const conflittiParsati = parseConflicts(document);
            const righeDocumento = document.getText().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

            // US-007: Prepare Monaco Editor configuration
            const monacoBaseUri = webviewPanel.webview.asWebviewUri(monacoBasePath).toString();
            const cspSource = webviewPanel.webview.cspSource;
            const linguaggioId = rilevaLinguaggioDaNomeFile(document.fileName);
            const nonce = generaNonce();

            // URI dei file bundlati della webview
            const jsUri = webviewPanel.webview.asWebviewUri(
                vscode.Uri.joinPath(webviewBundlePath, 'mergeEditor.js')
            ).toString();
            const cssUri = webviewPanel.webview.asWebviewUri(
                vscode.Uri.joinPath(webviewBundlePath, 'mergeEditor.css')
            ).toString();

            // US-012/US-014: Start async computation of state + auto-resolve
            const contenutoOriginale = document.getText();
            const preparazioneDatiPromise = this.preparaDatiAutoResolve(
                document, conflittiParsati, contenutoOriginale, linguaggioId
            );

            // Register message listener BEFORE setting HTML to avoid race condition
            const gestoreMessaggi = new GestoreMessaggiWebview(
                this.mergeCompletionService, this.fallbackService, this.stateManager
            );
            gestoreMessaggi.registraListener(
                webviewPanel, document, righeDocumento, conflittiParsati, preparazioneDatiPromise
            );

            // Set webview HTML AFTER registering message listener
            webviewPanel.webview.html = costruisciHtmlMergeEditor({
                fileName: document.fileName,
                nonce,
                monacoBaseUri,
                cspSource,
                linguaggioId,
                jsUri,
                cssUri,
            });
        } catch (errore) {
            // US-004: fallback on unhandled errors during editor setup
            await this.fallbackService.attivaFallbackPerDocumento(document.uri, errore);
            throw errore;
        }
    }

    /**
     * Prepares session state and auto-resolve data asynchronously.
     * Launched eagerly so results are ready when the webview sends 'webviewPronta'.
     */
    private async preparaDatiAutoResolve(
        document: vscode.TextDocument,
        conflittiParsati: ReturnType<typeof parseConflicts>,
        contenutoOriginale: string,
        linguaggioId: string
    ): Promise<{
        statoEsistente: Awaited<ReturnType<MergeSessionStateManager['recuperaStato']>>;
        risoluzionePending: Array<{ indiceConflitto: number; resolvedContent: string; sorgente: string; scoreConfidenza: number }>;
    }> {
        const statoEsistente = await this.stateManager.recuperaStato(
            document.uri.fsPath,
            contenutoOriginale
        );

        if (!statoEsistente) {
            const numeroConflitti = countConflicts(document);
            const statoIniziale = this.stateManager.creaStatoIniziale(
                document.uri.fsPath,
                contenutoOriginale,
                numeroConflitti
            );
            await this.stateManager.salvaStato(statoIniziale);
        }

        const indiciGiaRisolti = new Set(
            (statoEsistente?.statiConflitti ?? [])
                .filter(s => s.risolto)
                .map(s => s.indiceConflitto)
        );

        const risoluzionePending: Array<{ indiceConflitto: number; resolvedContent: string; sorgente: string; scoreConfidenza: number }> = [];

        // US-012: Layer 1 — diff3 auto-resolve
        const risultatoDiff3 = this.diff3Resolver.risolviConflitti(conflittiParsati);

        // US-013: Layer 2 — AST analysis per conflitti residui
        const conflittiNonRisolti = conflittiParsati.filter((_, indice) => {
            const ris = risultatoDiff3.conflittiRisolti[indice];
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

        for (const ris of risultatoDiff3.conflittiRisolti) {
            if (ris.risolvibileAutomaticamente && ris.resolvedContent !== null &&
                !indiciGiaRisolti.has(ris.indiceConflitto)) {
                risoluzionePending.push({
                    indiceConflitto: ris.indiceConflitto,
                    resolvedContent: ris.resolvedContent,
                    sorgente: 'diff3-auto',
                    scoreConfidenza: 1.0,
                });
            }
        }

        if (risultatoAst) {
            for (const ris of risultatoAst.conflittiAnalizzati) {
                if (ris.risolvibileAutomaticamente && ris.resolvedContent !== null &&
                    !indiciGiaRisolti.has(ris.indiceConflitto)) {
                    risoluzionePending.push({
                        indiceConflitto: ris.indiceConflitto,
                        resolvedContent: ris.resolvedContent,
                        sorgente: 'ast-auto',
                        scoreConfidenza: ris.scoreConfidenza,
                    });
                }
            }
        }

        return { statoEsistente, risoluzionePending };
    }

    public openForDocument(document: vscode.TextDocument): void {
        vscode.commands.executeCommand(
            'vscode.openWith',
            document.uri,
            MergeEditorProvider.VIEW_TYPE
        );
    }
}
