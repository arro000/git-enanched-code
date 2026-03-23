/**
 * Gestione del modal di conferma merge con conflitti irrisolti.
 */
import { VsCodeApi } from './tipiWebview';
import { contaConflittiAperti } from './ConflictState';
import { getMonacoInstance } from './MonacoSetup';

/** Mostra il modal se ci sono conflitti aperti, altrimenti invia completaMerge. */
export function gestisciCompletaMerge(vscodeApi: VsCodeApi): void {
    const numeroConflittiAperti = contaConflittiAperti();
    if (numeroConflittiAperti > 0) {
        const conteggioElemento = document.getElementById('modalConteggioConflitti');
        if (conteggioElemento) {
            conteggioElemento.textContent = numeroConflittiAperti.toString();
        }
        const overlay = document.getElementById('modalConfermaOverlay');
        if (overlay) {
            overlay.classList.add('visibile');
        }
    } else {
        const editor = getMonacoInstance();
        vscodeApi.postMessage({ command: 'completaMerge', resolvedContent: editor ? editor.getValue() : null });
    }
}

/** Chiude il modal di conferma rimuovendo la classe visibile. */
export function chiudiModalConferma(): void {
    const overlay = document.getElementById('modalConfermaOverlay');
    if (overlay) {
        overlay.classList.remove('visibile');
    }
}

/** Inizializza tutti gli event listener del modal di conferma. */
export function inizializzaModalConferma(vscodeApi: VsCodeApi): void {
    document.getElementById('completeMergeButton')!.addEventListener('click', function () {
        gestisciCompletaMerge(vscodeApi);
    });

    document.getElementById('modalConfermaButton')!.addEventListener('click', function () {
        chiudiModalConferma();
        const editor = getMonacoInstance();
        vscodeApi.postMessage({ command: 'completaMerge', resolvedContent: editor ? editor.getValue() : null });
    });

    document.getElementById('modalAnnullaButton')!.addEventListener('click', function () {
        chiudiModalConferma();
    });

    document.getElementById('modalConfermaOverlay')!.addEventListener('click', function (e) {
        if (e.target === this) { chiudiModalConferma(); }
    });
}
