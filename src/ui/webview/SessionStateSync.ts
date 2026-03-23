import { statiConflitti } from './ConflictState';
import { getMonacoInstance } from './MonacoSetup';
import { VsCodeApi } from './tipiWebview';

/**
 * Sincronizza con l'extension host lo stato corrente della sessione di merge.
 * Viene usato per ripristinare la colonna Result e i conflitti già gestiti.
 */
export function inviaAggiornamentoStato(vscodeApi: VsCodeApi): void {
    const editor = getMonacoInstance();
    if (!editor) return;

    vscodeApi.postMessage({
        command: 'aggiornaStato',
        contenutoColonnaCentrale: editor.getValue(),
        statiConflitti: Object.keys(statiConflitti).map((chiave) => {
            const indiceConflitto = Number(chiave);
            const stato = statiConflitti[indiceConflitto];
            return {
                indiceConflitto,
                headGestito: stato.headGestito,
                mergingGestito: stato.mergingGestito,
                contenutoApplicato: stato.contenutoApplicato,
            };
        }),
    });
}

export function inviaAggiornamentoStatoCorrente(): void {
    inviaAggiornamentoStato(acquireVsCodeApi());
}
