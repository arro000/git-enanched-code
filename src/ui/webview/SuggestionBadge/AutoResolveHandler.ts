/**
 * Gestione della bacchetta magica per auto-risoluzione conflitti.
 * Applica le risoluzioni pending al Monaco editor e aggiorna lo stato.
 */
import { RisoluzionePending, VsCodeApi } from '../tipiWebview';
import { statiConflitti, marcaConflittoComeGestito, aggiornaContatoreBadge } from '../ConflictState';
import { getMonacoInstance } from '../MonacoSetup';

/** Gestisce il messaggio risoluzioniPending: abilita bottone e imposta tooltip. */
export function gestisciRisoluzioniPending(risoluzioni: RisoluzionePending[], totaleConflitti: number): void {
    window._risoluzioniPending = risoluzioni || [];
    const btnBacchetta = document.getElementById('btnBacchettaMagica') as HTMLButtonElement | null;
    if (btnBacchetta && window._risoluzioniPending.length > 0) {
        btnBacchetta.disabled = false;
        btnBacchetta.textContent = '\u2726 Auto-resolve (' + window._risoluzioniPending.length + ')';

        const risolvibili = window._risoluzioniPending.length;
        const totale = totaleConflitti || risolvibili;
        let sommaConfidenza = 0;
        window._risoluzioniPending.forEach(function (r) {
            sommaConfidenza += (r.scoreConfidenza || 0);
        });
        const confidenzaMedia = risolvibili > 0 ? sommaConfidenza / risolvibili : 0;
        const livelloConfidenza = confidenzaMedia >= 0.8 ? 'alta' : confidenzaMedia >= 0.5 ? 'media' : 'bassa';
        btnBacchetta.title = risolvibili + ' risolvibili su ' + totale + ' totali — confidenza: ' + livelloConfidenza + ' (' + Math.round(confidenzaMedia * 100) + '%)';
    }
}

/** Inizializza il click handler sul bottone bacchetta magica. */
export function inizializzaBacchettaMagica(vscodeApi: VsCodeApi): void {
    const btnBacchetta = document.getElementById('btnBacchettaMagica') as HTMLButtonElement | null;
    if (!btnBacchetta) return;
    btnBacchetta.addEventListener('click', function () {
        if (!window._risoluzioniPending || window._risoluzioniPending.length === 0) return;
        const editor = getMonacoInstance();
        if (!editor) return;

        const risoluzioni = window._risoluzioniPending;
        const model = editor.getModel();

        vscodeApi.postMessage({
            command: 'applicaBacchettaMagica',
            risoluzioni: risoluzioni
        });

        risoluzioni.forEach(function (ris) {
            const placeholder = '// [Conflitto #' + (ris.indiceConflitto + 1) + ' -- irrisolto]';
            const matches = model.findMatches(placeholder, false, false, true, null, false);
            if (matches.length > 0) {
                editor.executeEdits('bacchetta-magica', [{ range: matches[0].range, text: ris.resolvedContent }]);
                const righeInserite = ris.resolvedContent.split('\n').length;
                const rigaInizio = matches[0].range.startLineNumber;
                statiConflitti[ris.indiceConflitto].rigaFineApplicato = rigaInizio + righeInserite - 1;
                statiConflitti[ris.indiceConflitto].contenutoApplicato = ris.resolvedContent;
            }

            statiConflitti[ris.indiceConflitto].headGestito = true;
            statiConflitti[ris.indiceConflitto].mergingGestito = true;
            marcaConflittoComeGestito('head', ris.indiceConflitto);
            marcaConflittoComeGestito('merging', ris.indiceConflitto);
        });

        aggiornaContatoreBadge();

        btnBacchetta.disabled = true;
        btnBacchetta.textContent = '\u2726 Auto-resolve (done)';
        window._risoluzioniPending = [];
    });
}
