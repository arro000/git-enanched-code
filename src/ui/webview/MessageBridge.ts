/**
 * Dispatcher dei messaggi ricevuti dall'extension host via postMessage.
 */
import { VsCodeApi } from './tipiWebview';
import { impostaSegmentiGlobali, aggiornaContatoreBadge, statiConflitti, marcaConflittoComeGestito } from './ConflictState';
import { getMonacoInstance, inizializzaMonacoEditor, onMonacoReady } from './MonacoSetup';
import { buildSegmentsFromConflicts, buildInitialResultContent, renderColonneLaterali } from './ThreeColumnLayout/ColumnRenderer';
import { gestisciRisoluzioniPending } from './SuggestionBadge/AutoResolveHandler';

interface StatoSessioneRipristinato {
    contenutoColonnaCentrale: string | null;
    statiConflitti?: Array<{
        indiceConflitto: number;
        risolto: boolean;
        resolvedContent: string | null;
        sorgenteApplicata: 'head' | 'merging' | 'both' | 'manual' | 'diff3-auto' | 'ast-auto' | null;
    }>;
}

/** Inizializza il layout dal messaggio inizializzaLayout. */
function inizializzaLayout(dati: { righe: string[]; conflitti: any[] }, linguaggioId: string): void {
    const segmenti = buildSegmentsFromConflicts(dati.righe, dati.conflitti);
    impostaSegmentiGlobali(segmenti);
    renderColonneLaterali(segmenti);
    aggiornaContatoreBadge();

    const contenutoRisultato = buildInitialResultContent(dati.righe, dati.conflitti);
    inizializzaMonacoEditor(contenutoRisultato, linguaggioId);
}

function ripristinaStatoSessione(stato: StatoSessioneRipristinato): void {
    if (!stato) {
        return;
    }

    if (Array.isArray(stato.statiConflitti)) {
        for (const conflitto of stato.statiConflitti) {
            const statoWebview = statiConflitti[conflitto.indiceConflitto];
            if (!statoWebview || !conflitto.risolto) {
                continue;
            }

            statoWebview.headGestito = true;
            statoWebview.mergingGestito = true;
            statoWebview.contenutoApplicato = conflitto.resolvedContent;
            marcaConflittoComeGestito('head', conflitto.indiceConflitto);
            marcaConflittoComeGestito('merging', conflitto.indiceConflitto);

            if ((conflitto.sorgenteApplicata === 'diff3-auto' || conflitto.sorgenteApplicata === 'ast-auto') &&
                conflitto.resolvedContent) {
                window._risoluzioniDisponibili[conflitto.indiceConflitto] = {
                    indiceConflitto: conflitto.indiceConflitto,
                    resolvedContent: conflitto.resolvedContent,
                    sorgente: conflitto.sorgenteApplicata,
                    scoreConfidenza: conflitto.sorgenteApplicata === 'diff3-auto' ? 1 : 0.85,
                };
            }
        }
    }

    onMonacoReady(function (editor) {
        if (stato.contenutoColonnaCentrale) {
            editor.setValue(stato.contenutoColonnaCentrale);
        }
    });

    aggiornaContatoreBadge();
}

/** Inizializza il listener per i messaggi dall'extension host. */
export function inizializzaMessageListener(vscodeApi: VsCodeApi, linguaggioId: string): void {
    window.addEventListener('message', function (event) {
        const message = event.data;
        if (message.command === 'inizializzaLayout') {
            inizializzaLayout(message, linguaggioId);
        } else if (message.command === 'mergeCompletato') {
            const button = document.getElementById('completeMergeButton') as HTMLButtonElement;
            if (message.successo) {
                window._mergeCompletato = true;
                button.textContent = 'Merge Completed';
                button.disabled = true;
                const autoResolveButton = document.getElementById('btnBacchettaMagica') as HTMLButtonElement | null;
                if (autoResolveButton) {
                    autoResolveButton.disabled = true;
                }
                document.body.classList.add('merge-completed');
                window._risoluzioniPending = [];
                const editor = getMonacoInstance();
                if (editor) {
                    editor.updateOptions({ readOnly: true });
                }
            }
        } else if (message.command === 'statoRipristinato') {
            ripristinaStatoSessione(message.stato);
        } else if (message.command === 'risoluzioniPending') {
            gestisciRisoluzioniPending(message.risoluzioni, message.totaleConflitti);
        }
    });
}
