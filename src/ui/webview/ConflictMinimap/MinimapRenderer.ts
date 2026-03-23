/**
 * Rendering e gestione della minimap laterale.
 * Mostra segmenti proporzionali con colori rosso/verde per conflitti aperti/risolti.
 */
import { statiConflitti, segmentiGlobali } from '../ConflictState';

/**
 * Disegna/aggiorna i segmenti nella minimap.
 * Prima chiamata: costruisce tutti i segmenti.
 * Chiamate successive: aggiorna solo il colore dei segmenti conflitto.
 */
export function renderMinimap(): void {
    const container = document.getElementById('minimapContainer');
    if (!container || !segmentiGlobali) { return; }
    const primaVolta = container.children.length === 0;
    if (!primaVolta) {
        // Aggiorna solo il colore dei segmenti di tipo conflitto
        const segmentiConflitto = container.querySelectorAll('[data-mm-conflict]');
        for (let j = 0; j < segmentiConflitto.length; j++) {
            const indice = parseInt(segmentiConflitto[j].getAttribute('data-mm-conflict')!, 10);
            const stato = statiConflitti[indice];
            (segmentiConflitto[j] as HTMLElement).style.background = (stato && stato.headGestito && stato.mergingGestito)
                ? 'rgba(78,201,176,0.6)'
                : 'rgba(241,76,76,0.7)';
        }
        return;
    }
    let totalLinee = 0;
    for (let i = 0; i < segmentiGlobali.length; i++) {
        const s = segmentiGlobali[i];
        totalLinee += s.tipo === 'comune'
            ? s.contenuto!.split('\n').length
            : Math.max(s.head ? s.head.split('\n').length : 1, s.merging ? s.merging.split('\n').length : 1);
    }
    if (totalLinee === 0) { return; }
    for (let i = 0; i < segmentiGlobali.length; i++) {
        const s = segmentiGlobali[i];
        const el = document.createElement('div');
        el.className = 'mm-seg';
        let linee: number;
        if (s.tipo === 'comune') {
            linee = s.contenuto!.split('\n').length;
            el.style.background = 'rgba(212,212,212,0.08)';
        } else {
            linee = Math.max(s.head ? s.head.split('\n').length : 1, s.merging ? s.merging.split('\n').length : 1);
            const stato = statiConflitti[s.indice!];
            el.style.background = (stato && stato.headGestito && stato.mergingGestito)
                ? 'rgba(78,201,176,0.6)'
                : 'rgba(241,76,76,0.7)';
            el.setAttribute('data-mm-conflict', String(s.indice));
        }
        el.style.flex = linee + ' 0 0px';
        el.setAttribute('data-mm-segment', String(i));
        container.appendChild(el);
    }
}

/** Inizializza il click handler sulla minimap per navigazione. */
export function inizializzaMinimapClick(): void {
    const container = document.getElementById('minimapContainer');
    if (!container) return;
    container.addEventListener('click', function (e) {
        const target = e.target as HTMLElement;
        if (!target || !target.hasAttribute('data-mm-segment')) return;

        const segIdx = parseInt(target.getAttribute('data-mm-segment')!, 10);
        if (isNaN(segIdx) || !segmentiGlobali || segIdx >= segmentiGlobali.length) return;

        const segmento = segmentiGlobali[segIdx];

        if (segmento.tipo === 'conflitto' && segmento.indice !== undefined) {
            let conflictEl: Element | null = document.querySelector('#columnResult [data-conflict-index="' + segmento.indice + '"]');
            if (!conflictEl) {
                conflictEl = document.querySelector('[data-conflict-index="' + segmento.indice + '"]');
            }
            if (conflictEl) {
                conflictEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                (conflictEl as HTMLElement).style.outline = '2px solid var(--result-teal)';
                setTimeout(function () { (conflictEl as HTMLElement).style.outline = ''; }, 1500);
            }
        } else {
            const resultColumn = document.getElementById('columnResult');
            if (resultColumn) {
                const fraction = segIdx / segmentiGlobali.length;
                const scrollTarget = resultColumn.scrollHeight * fraction;
                resultColumn.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            }
        }
    });
}
