/**
 * Navigazione tra conflitti irrisolti con F7/Shift+F7.
 */
import { statiConflitti } from '../ConflictState';

let indiceConflittoCorrente = -1;

/** Naviga al prossimo o precedente conflitto irrisolto. */
export function navigaAlConflitto(direzione: 'successivo' | 'precedente'): void {
    const conflictZones = document.querySelectorAll('[data-conflict-index]');
    if (conflictZones.length === 0) return;

    // Build list of unresolved conflict indices
    const indiciAperti: number[] = [];
    for (let i = 0; i < conflictZones.length; i++) {
        const indice = parseInt(conflictZones[i].getAttribute('data-conflict-index')!, 10);
        const stato = statiConflitti[indice];
        if (!stato || !(stato.headGestito && stato.mergingGestito)) {
            indiciAperti.push(indice);
        }
    }
    if (indiciAperti.length === 0) return;

    let nuovoIndice: number | undefined;
    if (direzione === 'successivo') {
        nuovoIndice = indiciAperti.find(function (idx) { return idx > indiceConflittoCorrente; });
        if (nuovoIndice === undefined) nuovoIndice = indiciAperti[indiciAperti.length - 1];
    } else {
        for (let j = indiciAperti.length - 1; j >= 0; j--) {
            if (indiciAperti[j] < indiceConflittoCorrente) {
                nuovoIndice = indiciAperti[j];
                break;
            }
        }
        if (nuovoIndice === undefined) nuovoIndice = indiciAperti[0];
    }

    indiceConflittoCorrente = nuovoIndice;

    let target: Element | null = document.querySelector('#columnResult [data-conflict-index="' + nuovoIndice + '"]');
    if (!target) {
        target = document.querySelector('[data-conflict-index="' + nuovoIndice + '"]');
    }
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (target as HTMLElement).style.outline = '2px solid var(--result-teal)';
        setTimeout(function () { (target as HTMLElement).style.outline = ''; }, 1500);
    }
}
