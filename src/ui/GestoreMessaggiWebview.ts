import * as vscode from 'vscode';
import { MergeCompletionService } from '../core/git/MergeCompletionService';
import { FallbackService } from '../core/git/FallbackService';
import { MergeSessionStateManager } from '../core/merge/MergeSessionStateManager';

interface DatiPreparati {
    statoEsistente: Awaited<ReturnType<MergeSessionStateManager['recuperaStato']>>;
    risoluzionePending: Array<{ indiceConflitto: number; resolvedContent: string; sorgente: string; scoreConfidenza: number }>;
}

/**
 * Gestisce i messaggi ricevuti dalla webview del merge editor.
 * Responsabilita' unica: dispatch dei comandi dal webview all'extension host.
 */
export class GestoreMessaggiWebview {
    private layoutGiaInviato = false;

    constructor(
        private readonly mergeCompletionService: MergeCompletionService,
        private readonly fallbackService: FallbackService,
        private readonly stateManager: MergeSessionStateManager,
    ) {}

    /**
     * Registra il listener dei messaggi sulla webview.
     * Deve essere chiamato PRIMA di impostare l'HTML per evitare race condition.
     */
    registraListener(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument,
        righeDocumento: string[],
        conflittiParsati: unknown[],
        preparazioneDatiPromise: Promise<DatiPreparati>,
    ): void {
        webviewPanel.webview.onDidReceiveMessage(async (messaggio) => {
            const { statoEsistente, risoluzionePending } = await preparazioneDatiPromise;
            try {
                if (messaggio.command === 'webviewPronta' && !this.layoutGiaInviato) {
                    this.layoutGiaInviato = true;
                    this.gestisciWebviewPronta(
                        webviewPanel, righeDocumento, conflittiParsati,
                        risoluzionePending, statoEsistente
                    );
                } else if (messaggio.command === 'completaMerge') {
                    await this.gestisciCompletaMerge(webviewPanel, document, messaggio);
                } else if (messaggio.command === 'applicaBacchettaMagica') {
                    await this.gestisciBacchettaMagica(document, messaggio);
                } else if (messaggio.command === 'aggiornaStato') {
                    await this.gestisciAggiornaStato(document, messaggio);
                }
            } catch (errore) {
                await this.fallbackService.attivaFallbackPerDocumento(document.uri, errore);
            }
        });
    }

    private gestisciWebviewPronta(
        webviewPanel: vscode.WebviewPanel,
        righeDocumento: string[],
        conflittiParsati: unknown[],
        risoluzionePending: DatiPreparati['risoluzionePending'],
        statoEsistente: DatiPreparati['statoEsistente'],
    ): void {
        webviewPanel.webview.postMessage({
            command: 'inizializzaLayout',
            righe: righeDocumento,
            conflitti: conflittiParsati,
        });
        if (risoluzionePending.length > 0) {
            webviewPanel.webview.postMessage({
                command: 'risoluzioniPending',
                risoluzioni: risoluzionePending,
                conteggio: risoluzionePending.length,
                totaleConflitti: conflittiParsati.length,
            });
        }
        if (statoEsistente) {
            webviewPanel.webview.postMessage({
                command: 'statoRipristinato',
                stato: statoEsistente,
            });
        }
    }

    private async gestisciCompletaMerge(
        webviewPanel: vscode.WebviewPanel,
        document: vscode.TextDocument,
        messaggio: { resolvedContent?: string },
    ): Promise<void> {
        if (messaggio.resolvedContent != null) {
            const editApplicata = new vscode.WorkspaceEdit();
            const tuttoIlDocumento = new vscode.Range(
                document.lineAt(0).range.start,
                document.lineAt(document.lineCount - 1).range.end
            );
            editApplicata.replace(document.uri, tuttoIlDocumento, messaggio.resolvedContent);
            await vscode.workspace.applyEdit(editApplicata);
        }
        const risultato = await this.mergeCompletionService.completaMerge(document);
        if (risultato.successo) {
            await this.stateManager.cancellaStato(document.uri.fsPath);
            vscode.window.showInformationMessage(
                `Git Enhanced: Merge completed successfully. File staged: ${document.fileName}`
            );
            webviewPanel.webview.postMessage({ command: 'mergeCompletato', successo: true });
        } else {
            vscode.window.showErrorMessage(`Git Enhanced: ${risultato.messaggioErrore}`);
            webviewPanel.webview.postMessage({
                command: 'mergeCompletato',
                successo: false,
                messaggioErrore: risultato.messaggioErrore,
            });
        }
    }

    private async gestisciBacchettaMagica(
        document: vscode.TextDocument,
        messaggio: { risoluzioni?: Array<{ indiceConflitto: number; resolvedContent: string; sorgente?: string }> },
    ): Promise<void> {
        if (messaggio.risoluzioni && Array.isArray(messaggio.risoluzioni)) {
            const statoCorrente = await this.stateManager.recuperaStato(
                document.uri.fsPath, document.getText()
            );
            if (statoCorrente) {
                for (const ris of messaggio.risoluzioni) {
                    const statoConflitto = statoCorrente.statiConflitti[ris.indiceConflitto];
                    if (statoConflitto && !statoConflitto.risolto) {
                        statoConflitto.risolto = true;
                        statoConflitto.resolvedContent = ris.resolvedContent;
                        statoConflitto.sorgenteApplicata = ris.sorgente ?? 'diff3-auto';
                    }
                }
                await this.stateManager.salvaStato(statoCorrente);
            }
        }
    }

    private async gestisciAggiornaStato(
        document: vscode.TextDocument,
        messaggio: { stato?: { percorsoFile: string } },
    ): Promise<void> {
        if (messaggio.stato && messaggio.stato.percorsoFile === document.uri.fsPath) {
            await this.stateManager.salvaStato(messaggio.stato as any);
        }
    }
}
