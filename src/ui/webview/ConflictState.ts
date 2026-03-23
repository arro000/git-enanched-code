/**
 * Stato condiviso dei conflitti nella webview del merge editor.
 * Tutti i moduli che necessitano dello stato conflitti importano da qui.
 */
import { Segmento, StatoConflitto } from './tipiWebview';

/** Mappa indice conflitto → stato corrente */
export const statiConflitti: Record<number, StatoConflitto> = {};

/** Segmenti globali costruiti dal parsing dei conflitti */
export let segmentiGlobali: Segmento[] | null = null;

export function impostaSegmentiGlobali(segmenti: Segmento[]): void {
    segmentiGlobali = segmenti;
}

export function inizializzaStatoConflitto(indice: number): void {
    if (!statiConflitti[indice]) {
        statiConflitti[indice] = { headGestito: false, mergingGestito: false, contenutoApplicato: null };
    }
}

/** Conta i conflitti dove almeno un lato non e' ancora gestito. */
export function contaConflittiAperti(): number {
    let count = 0;
    for (const k in statiConflitti) {
        if (!statiConflitti[k].headGestito || !statiConflitti[k].mergingGestito) {
            count++;
        }
    }
    return count;
}

/** Segna un lato del conflitto come gestito e aggiorna la UI. */
export function marcaConflittoComeGestito(colonna: 'head' | 'merging', indiceConflitto: number): void {
    const selectorColumn = colonna === 'head' ? '#columnHead' : '#columnMerging';
    const segmentDiv = document.querySelector(selectorColumn + ' [data-conflict-index="' + indiceConflitto + '"]');
    if (segmentDiv) {
        segmentDiv.classList.add('conflict-segment-handled');
        const handledLabel = document.createElement('div');
        handledLabel.className = 'handled-label';
        handledLabel.textContent = 'gestito';
        const actionBar = segmentDiv.querySelector('.ca');
        if (actionBar) { actionBar.replaceWith(handledLabel); }
    }
    aggiornaContatoreBadge();
}

/** Aggiorna badge toolbar, contatore status bar e ridisegna minimap. */
export function aggiornaContatoreBadge(): void {
    // Importo renderMinimap lazily per evitare dipendenza circolare
    const { renderMinimap } = require('./ConflictMinimap/MinimapRenderer');

    const nonInizializzato = Object.keys(statiConflitti).length === 0;
    const aperti = nonInizializzato ? null : contaConflittiAperti();
    const el = document.getElementById('conflictCount');
    if (el) { el.textContent = aperti === null ? '\u2014' : aperti.toString(); }
    const sbEl = document.getElementById('sbConflictCount');
    if (sbEl) { sbEl.textContent = aperti === null ? '\u2014 merge conflicts' : aperti + ' merge conflicts'; }
    renderMinimap();
}
