/**
 * Sincronizzazione dello scroll tra le 3 colonne del merge editor.
 */

/** Inizializza la sincronizzazione proporzionale dello scroll. */
export function inizializzaSincronizzazioneScroll(): void {
    const colHead = document.getElementById('columnHead');
    const colResult = document.getElementById('columnResult');
    const colMerging = document.getElementById('columnMerging');
    let scrolling = false;

    function sincronizzaScroll(sorgente: HTMLElement): void {
        if (scrolling) return;
        scrolling = true;
        const fraction = sorgente.scrollTop / (sorgente.scrollHeight - sorgente.clientHeight || 1);
        [colHead, colResult, colMerging].forEach(function (col) {
            if (col && col !== sorgente) {
                col.scrollTop = fraction * (col.scrollHeight - col.clientHeight);
            }
        });
        requestAnimationFrame(function () { scrolling = false; });
    }

    if (colHead) colHead.addEventListener('scroll', function () { sincronizzaScroll(colHead!); });
    if (colResult) colResult.addEventListener('scroll', function () { sincronizzaScroll(colResult!); });
    if (colMerging) colMerging.addEventListener('scroll', function () { sincronizzaScroll(colMerging!); });
}
