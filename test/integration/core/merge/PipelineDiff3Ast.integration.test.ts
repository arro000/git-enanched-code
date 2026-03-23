import { describe, it, expect } from 'vitest';
import {
    creaConflittoDiff3Risolvibile,
    creaConflittoImportIndipendenti,
    creaConflittoFunzioniAggiunte,
    creaConflittoIrrisolto,
    creaConflittoSenzaBase,
    creaConflittoDiTest,
    CONFLITTI_SCENARIO_MISTO,
    CONFLITTI_SOLO_DIFF3,
    eseguiPipelineRisoluzione,
} from '../../helpers/conflittiDiTest';

describe('Pipeline Diff3 + AST Integration', () => {

    describe('scenari misti — Diff3 risolve alcuni, AST risolve i rimanenti', () => {

        it('conflitto 1 risolto da diff3, conflitto 2 risolto da AST (import indipendenti)', async () => {
            const conflitti = [
                creaConflittoDiff3Risolvibile(0),
                creaConflittoImportIndipendenti(1),
            ];

            const risultato = await eseguiPipelineRisoluzione(conflitti, 'typescript');

            // Diff3 risolve il primo (solo HEAD modifica)
            expect(risultato.risultatoDiff3.conflittiRisolti[0].risolvibileAutomaticamente).toBe(true);
            // Diff3 NON risolve il secondo (sovrapposizione)
            expect(risultato.risultatoDiff3.conflittiRisolti[1].risolvibileAutomaticamente).toBe(false);

            // AST risolve il secondo (import indipendenti)
            expect(risultato.risultatoAst).not.toBeNull();
            expect(risultato.risultatoAst!.numeroRisoltiAst).toBe(1);
            expect(risultato.risultatoAst!.conflittiAnalizzati[0].patternRilevato).toBe('import-indipendenti');

            // Totale: 2 su 2 risolti
            expect(risultato.conflittiRisoltiTotale).toBe(2);
            expect(risultato.conflittiIrrisoltiTotale).toBe(0);
        });

        it('conflitto 1 diff3, conflitto 2 irrisolto anche da AST', async () => {
            const conflitti = [
                creaConflittoDiff3Risolvibile(0),
                creaConflittoIrrisolto(1),
            ];

            const risultato = await eseguiPipelineRisoluzione(conflitti, 'typescript');

            expect(risultato.risultatoDiff3.numeroRisoltiAutomaticamente).toBe(1);
            expect(risultato.risultatoAst).not.toBeNull();
            expect(risultato.risultatoAst!.numeroRisoltiAst).toBe(0);

            expect(risultato.conflittiRisoltiTotale).toBe(1);
            expect(risultato.conflittiIrrisoltiTotale).toBe(1);
        });

        it('3 conflitti: 1 diff3-auto, 1 ast-auto, 1 irrisolto genuino', async () => {
            const risultato = await eseguiPipelineRisoluzione(CONFLITTI_SCENARIO_MISTO, 'typescript');

            expect(risultato.risultatoDiff3.numeroRisoltiAutomaticamente).toBe(1);
            expect(risultato.risultatoAst).not.toBeNull();
            expect(risultato.risultatoAst!.numeroRisoltiAst).toBe(1);

            expect(risultato.conflittiRisoltiTotale).toBe(2);
            expect(risultato.conflittiIrrisoltiTotale).toBe(1);
        });
    });

    describe('tutti risolti da Diff3 — AST non invocato', () => {

        it('2 conflitti entrambi risolvibili da diff3', async () => {
            const risultato = await eseguiPipelineRisoluzione(CONFLITTI_SOLO_DIFF3, 'typescript');

            expect(risultato.risultatoDiff3.numeroRisoltiAutomaticamente).toBe(2);
            expect(risultato.risultatoAst).toBeNull(); // Non invocato
            expect(risultato.conflittiRisoltiTotale).toBe(2);
            expect(risultato.conflittiIrrisoltiTotale).toBe(0);
        });

        it('array con sole modifiche non sovrapposte su righe diverse', async () => {
            const conflitti = [
                creaConflittoDiTest({
                    index: 0,
                    base: 'riga1\nriga2\nriga3',
                    head: 'riga1_mod\nriga2\nriga3',
                    merging: 'riga1\nriga2\nriga3_mod',
                }),
            ];

            const risultato = await eseguiPipelineRisoluzione(conflitti, 'typescript');

            expect(risultato.risultatoDiff3.numeroRisoltiAutomaticamente).toBe(1);
            expect(risultato.risultatoAst).toBeNull();
            expect(risultato.conflittiRisoltiTotale).toBe(1);

            // Verifica che il contenuto risolto contiene entrambe le modifiche
            const contenuto = risultato.risultatoDiff3.conflittiRisolti[0].contenutoRisolto!;
            expect(contenuto).toContain('riga1_mod');
            expect(contenuto).toContain('riga3_mod');
        });
    });

    describe('nessuno risolto da Diff3 — tutti passano ad AST', () => {

        it('tutti con base assente, AST analizza import indipendenti', async () => {
            const conflitti = [
                creaConflittoDiTest({
                    index: 0,
                    base: null,
                    head: `import { b } from './b';\n\nconst x = 1;`,
                    merging: `import { c } from './c';\n\nconst x = 1;`,
                }),
            ];

            const risultato = await eseguiPipelineRisoluzione(conflitti, 'typescript');

            // Diff3 non può risolvere senza base
            expect(risultato.risultatoDiff3.numeroRisoltiAutomaticamente).toBe(0);
            // AST prova comunque — ma senza base i pattern metodi/proprietà non funzionano
            // e per import serve base per stabilire cosa è nuovo
            expect(risultato.risultatoAst).not.toBeNull();
        });

        it('tutti con sovrapposizione, AST tenta pattern metodi-aggiunti', async () => {
            const conflitti = [creaConflittoFunzioniAggiunte(0)];

            const risultato = await eseguiPipelineRisoluzione(conflitti, 'typescript');

            // Diff3 non risolve (le righe sostituite sono diverse)
            expect(risultato.risultatoDiff3.numeroRisoltiAutomaticamente).toBe(0);
            // AST dovrebbe risolvere con pattern metodi-aggiunti
            expect(risultato.risultatoAst).not.toBeNull();
            expect(risultato.risultatoAst!.numeroRisoltiAst).toBe(1);
            expect(risultato.risultatoAst!.conflittiAnalizzati[0].patternRilevato).toBe('metodi-aggiunti');
        });
    });

    describe('conflitto genuino irrisolto da entrambi i layer', () => {

        it('stessa riga modificata da entrambi, nessun pattern AST applicabile', async () => {
            const conflitti = [creaConflittoIrrisolto(0)];

            const risultato = await eseguiPipelineRisoluzione(conflitti, 'typescript');

            expect(risultato.conflittiRisoltiTotale).toBe(0);
            expect(risultato.conflittiIrrisoltiTotale).toBe(1);
        });

        it('base assente + nessun pattern riconoscibile', async () => {
            const conflitti = [creaConflittoSenzaBase(0)];

            const risultato = await eseguiPipelineRisoluzione(conflitti, 'typescript');

            expect(risultato.risultatoDiff3.conflittiRisolti[0].motivoNonRisolto).toBe('base-assente');
            expect(risultato.conflittiRisoltiTotale).toBe(0);
            expect(risultato.conflittiIrrisoltiTotale).toBe(1);
        });
    });

    describe('coerenza dei risultati combinati', () => {

        it('indici dei conflitti sono preservati dopo il passaggio tra i due layer', async () => {
            const risultato = await eseguiPipelineRisoluzione(CONFLITTI_SCENARIO_MISTO, 'typescript');

            // Diff3: indice 0 preservato
            expect(risultato.risultatoDiff3.conflittiRisolti[0].indiceConflitto).toBe(0);
            expect(risultato.risultatoDiff3.conflittiRisolti[1].indiceConflitto).toBe(1);
            expect(risultato.risultatoDiff3.conflittiRisolti[2].indiceConflitto).toBe(2);

            // AST: gli indici originali del ConflictBlock sono preservati
            expect(risultato.risultatoAst).not.toBeNull();
            const indiciAst = risultato.risultatoAst!.conflittiAnalizzati.map(r => r.indiceConflitto);
            // I conflitti passati all'AST sono quelli con indice 1 e 2 (non risolti da Diff3)
            expect(indiciAst).toContain(1);
            expect(indiciAst).toContain(2);
        });

        it('il conteggio totale risolti = diff3-auto + ast-auto', async () => {
            const risultato = await eseguiPipelineRisoluzione(CONFLITTI_SCENARIO_MISTO, 'typescript');

            const risoltiDiff3 = risultato.risultatoDiff3.numeroRisoltiAutomaticamente;
            const risoltiAst = risultato.risultatoAst?.numeroRisoltiAst ?? 0;

            expect(risultato.conflittiRisoltiTotale).toBe(risoltiDiff3 + risoltiAst);
            expect(risultato.conflittiIrrisoltiTotale).toBe(
                CONFLITTI_SCENARIO_MISTO.length - risultato.conflittiRisoltiTotale
            );
        });

        it('nessun conflitto viene elaborato due volte', async () => {
            const risultato = await eseguiPipelineRisoluzione(CONFLITTI_SCENARIO_MISTO, 'typescript');

            // Gli indici risolti da Diff3
            const indiciRisoltiDiff3 = risultato.risultatoDiff3.conflittiRisolti
                .filter(r => r.risolvibileAutomaticamente)
                .map(r => r.indiceConflitto);

            // Gli indici analizzati dall'AST
            const indiciAnalizzatiAst = risultato.risultatoAst!.conflittiAnalizzati
                .map(r => r.indiceConflitto);

            // Nessuna intersezione
            for (const indice of indiciRisoltiDiff3) {
                expect(indiciAnalizzatiAst).not.toContain(indice);
            }
        });
    });

    describe('performance del pipeline combinato', () => {

        it('50 conflitti misti completati entro 5 secondi', async () => {
            const conflitti = [];
            for (let i = 0; i < 50; i++) {
                if (i % 3 === 0) {
                    conflitti.push(creaConflittoDiff3Risolvibile(i));
                } else if (i % 3 === 1) {
                    conflitti.push(creaConflittoImportIndipendenti(i));
                } else {
                    conflitti.push(creaConflittoIrrisolto(i));
                }
            }

            const inizio = performance.now();
            const risultato = await eseguiPipelineRisoluzione(conflitti, 'typescript');
            const durata = performance.now() - inizio;

            expect(durata).toBeLessThan(5000);
            expect(risultato.conflittiRisoltiTotale).toBeGreaterThan(0);
            expect(risultato.conflittiRisoltiTotale + risultato.conflittiIrrisoltiTotale).toBe(50);
        });
    });
});
