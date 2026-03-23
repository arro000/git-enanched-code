/**
 * Rendering delle colonne laterali (HEAD e MERGING) e gestione
 * dell'applicazione/scarto dei chunk nel Monaco editor centrale.
 */
import { Segmento, ConflittoParseato } from '../tipiWebview';
import { segmentiGlobali, statiConflitti, inizializzaStatoConflitto, marcaConflittoComeAperto, marcaConflittoComeGestito } from '../ConflictState';
import { getMonacoInstance } from '../MonacoSetup';
import { inviaAggiornamentoStatoCorrente } from '../SessionStateSync';
import { riabilitaAutoResolvePerConflitto } from '../SuggestionBadge/AutoResolveHandler';

/** Costruisce i segmenti (comuni + conflitto) dalle righe del documento. */
export function buildSegmentsFromConflicts(righe: string[], conflitti: ConflittoParseato[]): Segmento[] {
    const segmenti: Segmento[] = [];
    let rigaCorrente = 0;
    for (let i = 0; i < conflitti.length; i++) {
        const conflitto = conflitti[i];
        if (rigaCorrente < conflitto.startLine) {
            segmenti.push({ tipo: 'comune', contenuto: righe.slice(rigaCorrente, conflitto.startLine).join('\n') });
        }
        segmenti.push({ tipo: 'conflitto', indice: conflitto.index, head: conflitto.head, base: conflitto.base, merging: conflitto.merging });
        rigaCorrente = conflitto.endLine + 1;
    }
    if (rigaCorrente < righe.length) {
        segmenti.push({ tipo: 'comune', contenuto: righe.slice(rigaCorrente).join('\n') });
    }
    return segmenti;
}

/** Costruisce il contenuto iniziale della colonna Result con placeholder per i conflitti. */
export function buildInitialResultContent(righe: string[], conflitti: ConflittoParseato[]): string {
    const resultLines: string[] = [];
    let rigaCorrente = 0;
    for (let i = 0; i < conflitti.length; i++) {
        const c = conflitti[i];
        for (let j = rigaCorrente; j < c.startLine; j++) { resultLines.push(righe[j]); }
        resultLines.push('// [Conflitto #' + (c.index + 1) + ' -- irrisolto]');
        rigaCorrente = c.endLine + 1;
    }
    for (let j = rigaCorrente; j < righe.length; j++) { resultLines.push(righe[j]); }
    return resultLines.join('\n');
}

function placeholderConflitto(indiceConflitto: number): string {
    return '// [Conflitto #' + (indiceConflitto + 1) + ' -- irrisolto]';
}

function ricostruisciContenutoResult(): string {
    if (!segmentiGlobali) {
        return '';
    }

    const resultLines: string[] = [];
    for (const segmento of segmentiGlobali) {
        if (segmento.tipo === 'comune') {
            resultLines.push(segmento.contenuto ?? '');
            continue;
        }

        const stato = statiConflitti[segmento.indice!];
        if (stato?.contenutoApplicato) {
            resultLines.push(stato.contenutoApplicato);
        } else {
            resultLines.push(placeholderConflitto(segmento.indice!));
        }
    }

    return resultLines.join('\n');
}

/** Applica il chunk HEAD nella colonna Result (con supporto accodamento). */
export function applicaChunkHead(indiceConflitto: number, contenutoHead: string): void {
    const editor = getMonacoInstance();
    if (!editor) return;
    const model = editor.getModel();
    const placeholder = placeholderConflitto(indiceConflitto);
    const matches = model.findMatches(placeholder, false, false, true, null, false);
    if (matches.length > 0) {
        editor.executeEdits('applica-chunk-head', [{ range: matches[0].range, text: contenutoHead }]);
        const righeInserite = contenutoHead.split('\n').length;
        const rigaInizio = matches[0].range.startLineNumber;
        statiConflitti[indiceConflitto].rigaFineApplicato = rigaInizio + righeInserite - 1;
        statiConflitti[indiceConflitto].contenutoApplicato = contenutoHead;
    } else if (statiConflitti[indiceConflitto].rigaFineApplicato) {
        const rigaFine = statiConflitti[indiceConflitto].rigaFineApplicato!;
        const colonnaFine = model.getLineMaxColumn(rigaFine);
        const ri = new monaco.Range(rigaFine, colonnaFine, rigaFine, colonnaFine);
        editor.executeEdits('accoda-chunk-head', [{ range: ri, text: '\n' + contenutoHead }]);
        const righeAccodate = contenutoHead.split('\n').length;
        statiConflitti[indiceConflitto].rigaFineApplicato = rigaFine + righeAccodate;
        statiConflitti[indiceConflitto].contenutoApplicato = statiConflitti[indiceConflitto].contenutoApplicato + '\n' + contenutoHead;
    }
    statiConflitti[indiceConflitto].headGestito = true;
    marcaConflittoComeGestito('head', indiceConflitto);
    inviaAggiornamentoStatoCorrente();
}

/** Scarta il chunk HEAD senza modificare il Monaco editor. */
export function scartaChunkHead(indiceConflitto: number): void {
    statiConflitti[indiceConflitto].headGestito = true;
    marcaConflittoComeGestito('head', indiceConflitto);
    inviaAggiornamentoStatoCorrente();
}

/** Applica il chunk MERGING nella colonna Result (con supporto accodamento). */
export function applicaChunkMerging(indiceConflitto: number, contenutoMerging: string): void {
    const editor = getMonacoInstance();
    if (!editor) return;
    const model = editor.getModel();
    const placeholder = placeholderConflitto(indiceConflitto);
    const matches = model.findMatches(placeholder, false, false, true, null, false);
    if (matches.length > 0) {
        editor.executeEdits('applica-chunk-merging', [{ range: matches[0].range, text: contenutoMerging }]);
        const righeInserite = contenutoMerging.split('\n').length;
        const rigaInizio = matches[0].range.startLineNumber;
        statiConflitti[indiceConflitto].rigaFineApplicato = rigaInizio + righeInserite - 1;
        statiConflitti[indiceConflitto].contenutoApplicato = contenutoMerging;
    } else if (statiConflitti[indiceConflitto].rigaFineApplicato) {
        const rigaFine = statiConflitti[indiceConflitto].rigaFineApplicato!;
        const colonnaFine = model.getLineMaxColumn(rigaFine);
        const ri = new monaco.Range(rigaFine, colonnaFine, rigaFine, colonnaFine);
        editor.executeEdits('accoda-chunk-merging', [{ range: ri, text: '\n' + contenutoMerging }]);
        const righeAccodate = contenutoMerging.split('\n').length;
        statiConflitti[indiceConflitto].rigaFineApplicato = rigaFine + righeAccodate;
        statiConflitti[indiceConflitto].contenutoApplicato = statiConflitti[indiceConflitto].contenutoApplicato + '\n' + contenutoMerging;
    }
    statiConflitti[indiceConflitto].mergingGestito = true;
    marcaConflittoComeGestito('merging', indiceConflitto);
    inviaAggiornamentoStatoCorrente();
}

/** Scarta il chunk MERGING senza modificare il Monaco editor. */
export function scartaChunkMerging(indiceConflitto: number): void {
    statiConflitti[indiceConflitto].mergingGestito = true;
    marcaConflittoComeGestito('merging', indiceConflitto);
    inviaAggiornamentoStatoCorrente();
}

export function resettaConflitto(indiceConflitto: number): void {
    const editor = getMonacoInstance();
    if (!editor) return;

    statiConflitti[indiceConflitto].headGestito = false;
    statiConflitti[indiceConflitto].mergingGestito = false;
    statiConflitti[indiceConflitto].contenutoApplicato = null;
    delete statiConflitti[indiceConflitto].rigaFineApplicato;

    editor.setValue(ricostruisciContenutoResult());
    marcaConflittoComeAperto('head', indiceConflitto);
    marcaConflittoComeAperto('merging', indiceConflitto);
    riabilitaAutoResolvePerConflitto(indiceConflitto);
    inviaAggiornamentoStatoCorrente();
}

/** Renderizza le colonne laterali HEAD e MERGING con segmenti e bottoni azione. */
export function renderColonneLaterali(segmenti: Segmento[]): void {
    const columnHead = document.getElementById('columnHead')!;
    const columnMerging = document.getElementById('columnMerging')!;
    columnHead.innerHTML = '';
    columnMerging.innerHTML = '';

    for (let i = 0; i < segmenti.length; i++) {
        const segmento = segmenti[i];

        // HEAD column
        const divHead = document.createElement('div');
        if (segmento.tipo === 'comune') {
            divHead.className = 'code-segment';
            divHead.textContent = segmento.contenuto!;
        } else {
            divHead.className = 'cz head-cz';
            divHead.setAttribute('data-conflict-index', String(segmento.indice));

            const actionBarHead = document.createElement('div');
            actionBarHead.className = 'ca';

            const applyButtonHead = document.createElement('button');
            applyButtonHead.className = 'ab ah';
            applyButtonHead.textContent = '>> Accept Current';
            applyButtonHead.title = 'Applica chunk HEAD nella colonna Result';
            (function (idx: number, content: string) {
                applyButtonHead.addEventListener('click', function () { applicaChunkHead(idx, content); });
            })(segmento.indice!, segmento.head!);

            const discardButtonHead = document.createElement('button');
            discardButtonHead.className = 'ab dx';
            discardButtonHead.textContent = '\u2715 Ignore';
            discardButtonHead.title = 'Scarta chunk HEAD';
            (function (idx: number) {
                discardButtonHead.addEventListener('click', function () { scartaChunkHead(idx); });
            })(segmento.indice!);

            const resetButtonHead = document.createElement('button');
            resetButtonHead.className = 'ab rs';
            resetButtonHead.textContent = '\u21ba Reset';
            resetButtonHead.title = 'Ripristina il conflitto e riapre entrambe le colonne';
            (function (idx: number) {
                resetButtonHead.addEventListener('click', function () { resettaConflitto(idx); });
            })(segmento.indice!);

            actionBarHead.appendChild(applyButtonHead);
            actionBarHead.appendChild(discardButtonHead);
            actionBarHead.appendChild(resetButtonHead);
            divHead.appendChild(actionBarHead);

            const codeContent = document.createElement('div');
            codeContent.className = 'code-segment';
            codeContent.textContent = segmento.head!;
            divHead.appendChild(codeContent);

            inizializzaStatoConflitto(segmento.indice!);
        }
        columnHead.appendChild(divHead);

        // MERGING column
        const divMerging = document.createElement('div');
        if (segmento.tipo === 'comune') {
            divMerging.className = 'code-segment';
            divMerging.textContent = segmento.contenuto!;
        } else {
            divMerging.className = 'cz merging-cz';
            divMerging.setAttribute('data-conflict-index', String(segmento.indice));

            const actionBarMerging = document.createElement('div');
            actionBarMerging.className = 'ca';

            const applyButtonMerging = document.createElement('button');
            applyButtonMerging.className = 'ab am';
            applyButtonMerging.textContent = '<< Accept Incoming';
            applyButtonMerging.title = 'Applica chunk MERGING nella colonna Result';
            (function (idx: number, content: string) {
                applyButtonMerging.addEventListener('click', function () { applicaChunkMerging(idx, content); });
            })(segmento.indice!, segmento.merging!);

            const discardButtonMerging = document.createElement('button');
            discardButtonMerging.className = 'ab dx';
            discardButtonMerging.textContent = '\u2715 Ignore';
            discardButtonMerging.title = 'Scarta chunk MERGING';
            (function (idx: number) {
                discardButtonMerging.addEventListener('click', function () { scartaChunkMerging(idx); });
            })(segmento.indice!);

            const resetButtonMerging = document.createElement('button');
            resetButtonMerging.className = 'ab rs';
            resetButtonMerging.textContent = '\u21ba Reset';
            resetButtonMerging.title = 'Ripristina il conflitto e riapre entrambe le colonne';
            (function (idx: number) {
                resetButtonMerging.addEventListener('click', function () { resettaConflitto(idx); });
            })(segmento.indice!);

            actionBarMerging.appendChild(applyButtonMerging);
            actionBarMerging.appendChild(discardButtonMerging);
            actionBarMerging.appendChild(resetButtonMerging);
            divMerging.appendChild(actionBarMerging);

            const codeContentMerging = document.createElement('div');
            codeContentMerging.className = 'code-segment';
            codeContentMerging.textContent = segmento.merging!;
            divMerging.appendChild(codeContentMerging);

            inizializzaStatoConflitto(segmento.indice!);
        }
        columnMerging.appendChild(divMerging);
    }
}
