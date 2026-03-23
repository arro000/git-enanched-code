/**
 * Dispatcher dei messaggi ricevuti dall'extension host via postMessage.
 */
import { VsCodeApi } from './tipiWebview';
import { impostaSegmentiGlobali, aggiornaContatoreBadge } from './ConflictState';
import { getMonacoInstance, inizializzaMonacoEditor } from './MonacoSetup';
import { buildSegmentsFromConflicts, buildInitialResultContent, renderColonneLaterali } from './ThreeColumnLayout/ColumnRenderer';
import { gestisciRisoluzioniPending } from './SuggestionBadge/AutoResolveHandler';

/** Inizializza il layout dal messaggio inizializzaLayout. */
function inizializzaLayout(dati: { righe: string[]; conflitti: any[] }, linguaggioId: string): void {
    const segmenti = buildSegmentsFromConflicts(dati.righe, dati.conflitti);
    impostaSegmentiGlobali(segmenti);
    renderColonneLaterali(segmenti);
    aggiornaContatoreBadge();

    const contenutoRisultato = buildInitialResultContent(dati.righe, dati.conflitti);
    inizializzaMonacoEditor(contenutoRisultato, linguaggioId);
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
                button.textContent = 'Merge Completed';
                button.disabled = true;
            }
        } else if (message.command === 'statoRipristinato') {
            const editor = getMonacoInstance();
            if (message.stato && message.stato.contenutoColonnaCentrale && editor) {
                editor.setValue(message.stato.contenutoColonnaCentrale);
            }
        } else if (message.command === 'risoluzioniPending') {
            gestisciRisoluzioniPending(message.risoluzioni, message.totaleConflitti);
        }
    });
}
