import { ConflictBlock } from '../git/ConflictParser';

/**
 * Risultato della risoluzione di un singolo ConflictBlock.
 */
export interface RisultatoRisoluzioneConflitto {
    indiceConflitto: number;
    risolvibileAutomaticamente: boolean;
    resolvedContent: string | null;
    motivoNonRisolto: 'base-assente' | 'sovrapposizione-modifiche' | null;
}

/**
 * Risultato complessivo dell'analisi diff3 su tutti i conflitti del file.
 */
export interface RisultatoAnalisiDiff3 {
    conflittiRisolti: RisultatoRisoluzioneConflitto[];
    numeroRisoltiAutomaticamente: number;
    numeroNonRisolvibili: number;
    tempoEsecuzioneMs: number;
}

/**
 * Elemento dell'edit script: descrive come una riga della base
 * è stata trattata da un lato (HEAD o MERGING).
 */
interface ElementoEditScript {
    tipo: 'mantenuta' | 'rimossa' | 'sostituita';
    /** Righe sostitutive (solo per tipo 'sostituita') */
    righeNuove?: string[];
}

/**
 * Inserzione di righe nuove in una posizione tra righe della base.
 */
interface Inserzione {
    /** Posizione nella base: le righe vengono inserite PRIMA di questo indice */
    posizione: number;
    righe: string[];
}

/**
 * Servizio puro per la risoluzione automatica dei conflitti tramite diff3.
 * Confronta HEAD e MERGING rispetto alla BASE per identificare
 * modifiche non sovrapposte che possono essere unite automaticamente.
 */
export class Diff3Resolver {

    /**
     * Risolve tutti i conflitti di un file tramite diff3.
     */
    risolviConflitti(conflitti: ConflictBlock[]): RisultatoAnalisiDiff3 {
        const inizioMs = performance.now();

        const conflittiRisolti = conflitti.map(conflitto =>
            this.risolviSingoloConflitto(conflitto)
        );

        const tempoEsecuzioneMs = performance.now() - inizioMs;

        return {
            conflittiRisolti,
            numeroRisoltiAutomaticamente: conflittiRisolti.filter(r => r.risolvibileAutomaticamente).length,
            numeroNonRisolvibili: conflittiRisolti.filter(r => !r.risolvibileAutomaticamente).length,
            tempoEsecuzioneMs,
        };
    }

    /**
     * Risolve un singolo conflitto tramite merge a tre vie.
     */
    risolviSingoloConflitto(conflitto: ConflictBlock): RisultatoRisoluzioneConflitto {
        if (conflitto.base === null) {
            return {
                indiceConflitto: conflitto.index,
                risolvibileAutomaticamente: false,
                resolvedContent: null,
                motivoNonRisolto: 'base-assente',
            };
        }

        const righeBase = this.splitInRighe(conflitto.base);
        const righeHead = this.splitInRighe(conflitto.head);
        const righeMerging = this.splitInRighe(conflitto.merging);

        // Calcola edit scripts: come HEAD e MERGING hanno modificato la base
        const editHead = this.calcolaEditScript(righeBase, righeHead);
        const editMerging = this.calcolaEditScript(righeBase, righeMerging);

        // Verifica sovrapposizioni
        if (this.hannoSovrapposizioni(editHead, editMerging)) {
            return {
                indiceConflitto: conflitto.index,
                risolvibileAutomaticamente: false,
                resolvedContent: null,
                motivoNonRisolto: 'sovrapposizione-modifiche',
            };
        }

        // Merge a tre vie
        const risultatoMerge = this.eseguiMergeTreVie(righeBase, editHead, editMerging);

        return {
            indiceConflitto: conflitto.index,
            risolvibileAutomaticamente: true,
            resolvedContent: risultatoMerge,
            motivoNonRisolto: null,
        };
    }

    private splitInRighe(testo: string): string[] {
        return testo === '' ? [] : testo.split('\n');
    }

    /**
     * Calcola un edit script che descrive come `righeModificate` differiscono da `righeBase`.
     * Restituisce:
     * - modifichePerRiga: per ogni riga della base, come è stata trattata
     * - inserzioni: righe nuove inserite tra le righe della base
     */
    private calcolaEditScript(
        righeBase: string[],
        righeModificate: string[]
    ): { modifichePerRiga: ElementoEditScript[]; inserzioni: Inserzione[] } {
        const lcs = this.calcolaLCS(righeBase, righeModificate);
        const allineamento = this.ricostruisciAllineamento(righeBase, righeModificate, lcs);

        const modifichePerRiga: ElementoEditScript[] = righeBase.map(() => ({
            tipo: 'mantenuta' as const,
        }));
        const inserzioni: Inserzione[] = [];

        // Traccia: per ogni riga della base, se è nella LCS (mantenuta) o no (rimossa)
        // Per ogni riga modificata non nella LCS, è un'inserzione
        let idxBase = 0;
        let idxMod = 0;
        let idxAllineamento = 0;

        while (idxBase < righeBase.length || idxMod < righeModificate.length) {
            if (idxAllineamento < allineamento.length &&
                allineamento[idxAllineamento].indiceBase === idxBase &&
                allineamento[idxAllineamento].indiceMod === idxMod) {
                // Questa riga è nella LCS — mantenuta
                modifichePerRiga[idxBase] = { tipo: 'mantenuta' };
                idxBase++;
                idxMod++;
                idxAllineamento++;
            } else if (idxBase < righeBase.length &&
                       (idxAllineamento >= allineamento.length ||
                        allineamento[idxAllineamento].indiceBase > idxBase)) {
                // Riga della base non nella LCS — rimossa/sostituita
                // Raccoglie righe della base consecutive rimosse
                const inizioRimosse = idxBase;
                while (idxBase < righeBase.length &&
                       (idxAllineamento >= allineamento.length ||
                        allineamento[idxAllineamento].indiceBase > idxBase)) {
                    idxBase++;
                }
                // Raccoglie righe modificate consecutive inserite (fino alla prossima LCS match)
                const righeNuove: string[] = [];
                while (idxMod < righeModificate.length &&
                       (idxAllineamento >= allineamento.length ||
                        allineamento[idxAllineamento].indiceMod > idxMod)) {
                    righeNuove.push(righeModificate[idxMod]);
                    idxMod++;
                }
                // Segna le righe della base come sostituite (o rimosse se nessuna nuova riga)
                for (let k = inizioRimosse; k < idxBase; k++) {
                    if (righeNuove.length > 0 && k === inizioRimosse) {
                        modifichePerRiga[k] = { tipo: 'sostituita', righeNuove };
                    } else {
                        modifichePerRiga[k] = { tipo: 'rimossa' };
                    }
                }
            } else {
                // Righe modificate non nella LCS e nessuna riga base da consumare — inserzione pura
                const righeInserite: string[] = [];
                while (idxMod < righeModificate.length &&
                       (idxAllineamento >= allineamento.length ||
                        allineamento[idxAllineamento].indiceMod > idxMod)) {
                    righeInserite.push(righeModificate[idxMod]);
                    idxMod++;
                }
                if (righeInserite.length > 0) {
                    inserzioni.push({ posizione: idxBase, righe: righeInserite });
                }
            }
        }

        return { modifichePerRiga, inserzioni };
    }

    /**
     * Calcola la tabella LCS tra due array di stringhe.
     */
    private calcolaLCS(righeA: string[], righeB: string[]): number[][] {
        const m = righeA.length;
        const n = righeB.length;
        const tabella: number[][] = Array.from({ length: m + 1 }, () =>
            new Array(n + 1).fill(0)
        );

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (righeA[i - 1] === righeB[j - 1]) {
                    tabella[i][j] = tabella[i - 1][j - 1] + 1;
                } else {
                    tabella[i][j] = Math.max(tabella[i - 1][j], tabella[i][j - 1]);
                }
            }
        }

        return tabella;
    }

    /**
     * Ricostruisce l'allineamento LCS: coppie (indiceBase, indiceMod) delle righe in comune.
     */
    private ricostruisciAllineamento(
        righeBase: string[],
        righeModificate: string[],
        tabella: number[][]
    ): Array<{ indiceBase: number; indiceMod: number }> {
        const risultato: Array<{ indiceBase: number; indiceMod: number }> = [];
        let i = righeBase.length;
        let j = righeModificate.length;

        while (i > 0 && j > 0) {
            if (righeBase[i - 1] === righeModificate[j - 1]) {
                risultato.push({ indiceBase: i - 1, indiceMod: j - 1 });
                i--;
                j--;
            } else if (tabella[i - 1][j] >= tabella[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }

        risultato.reverse();
        return risultato;
    }

    /**
     * Verifica se i due edit script hanno modifiche sovrapposte.
     */
    private hannoSovrapposizioni(
        editHead: { modifichePerRiga: ElementoEditScript[]; inserzioni: Inserzione[] },
        editMerging: { modifichePerRiga: ElementoEditScript[]; inserzioni: Inserzione[] }
    ): boolean {
        // Controlla righe della base modificate da entrambi
        for (let i = 0; i < editHead.modifichePerRiga.length; i++) {
            const modHead = editHead.modifichePerRiga[i];
            const modMerging = editMerging.modifichePerRiga[i];
            if (modHead.tipo !== 'mantenuta' && modMerging.tipo !== 'mantenuta') {
                // Entrambi i lati modificano la stessa riga — è conflitto
                // TRANNE se entrambi fanno la stessa operazione (es. entrambi rimuovono)
                if (modHead.tipo === 'rimossa' && modMerging.tipo === 'rimossa') {
                    continue; // Stessa rimozione, non è conflitto
                }
                if (modHead.tipo === 'sostituita' && modMerging.tipo === 'sostituita' &&
                    this.arrayUguali(modHead.righeNuove!, modMerging.righeNuove!)) {
                    continue; // Stessa sostituzione, non è conflitto
                }
                return true;
            }
        }

        // Controlla inserzioni nella stessa posizione da entrambi
        const inserzioniHeadMappa = new Map<number, string[]>();
        for (const ins of editHead.inserzioni) {
            inserzioniHeadMappa.set(ins.posizione, ins.righe);
        }
        for (const ins of editMerging.inserzioni) {
            const insHead = inserzioniHeadMappa.get(ins.posizione);
            if (insHead) {
                // Entrambi inseriscono nella stessa posizione — conflitto
                // TRANNE se inseriscono le stesse righe
                if (!this.arrayUguali(insHead, ins.righe)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Esegue il merge a tre vie combinando le modifiche non sovrapposte.
     */
    private eseguiMergeTreVie(
        righeBase: string[],
        editHead: { modifichePerRiga: ElementoEditScript[]; inserzioni: Inserzione[] },
        editMerging: { modifichePerRiga: ElementoEditScript[]; inserzioni: Inserzione[] }
    ): string {
        const risultato: string[] = [];

        // Indicizza inserzioni per posizione
        const inserzioniHeadMappa = new Map<number, string[]>();
        for (const ins of editHead.inserzioni) {
            inserzioniHeadMappa.set(ins.posizione, ins.righe);
        }
        const inserzioniMergingMappa = new Map<number, string[]>();
        for (const ins of editMerging.inserzioni) {
            inserzioniMergingMappa.set(ins.posizione, ins.righe);
        }

        // Inserzioni prima della prima riga
        this.aggiungiInserzioniNonDuplicate(risultato, 0, inserzioniHeadMappa, inserzioniMergingMappa);

        for (let i = 0; i < righeBase.length; i++) {
            const modHead = editHead.modifichePerRiga[i];
            const modMerging = editMerging.modifichePerRiga[i];

            if (modHead.tipo === 'sostituita') {
                risultato.push(...modHead.righeNuove!);
            } else if (modMerging.tipo === 'sostituita') {
                risultato.push(...modMerging.righeNuove!);
            } else if (modHead.tipo === 'rimossa' || modMerging.tipo === 'rimossa') {
                // Non includere la riga (rimossa da HEAD e/o MERGING)
            } else {
                // Entrambi mantengono — prendi dalla base
                risultato.push(righeBase[i]);
            }

            // Inserzioni dopo questa riga
            this.aggiungiInserzioniNonDuplicate(risultato, i + 1, inserzioniHeadMappa, inserzioniMergingMappa);
        }

        return risultato.join('\n');
    }

    /**
     * Aggiunge inserzioni di HEAD e MERGING evitando duplicati
     * quando entrambi i lati inseriscono le stesse righe nella stessa posizione.
     */
    private aggiungiInserzioniNonDuplicate(
        risultato: string[],
        posizione: number,
        inserzioniHead: Map<number, string[]>,
        inserzioniMerging: Map<number, string[]>
    ): void {
        const insHead = inserzioniHead.get(posizione);
        const insMerging = inserzioniMerging.get(posizione);

        if (insHead) {
            risultato.push(...insHead);
        }
        // Se MERGING ha le stesse inserzioni di HEAD, non duplicarle
        if (insMerging && !(insHead && this.arrayUguali(insHead, insMerging))) {
            risultato.push(...insMerging);
        }
    }

    /**
     * Confronta due array di stringhe per uguaglianza.
     */
    private arrayUguali(a: string[], b: string[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }
}
