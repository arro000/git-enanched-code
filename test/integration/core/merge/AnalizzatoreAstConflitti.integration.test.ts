import { describe, it, expect } from 'vitest';
import { AnalizzatoreAstConflitti } from '../../../../src/core/merge/AnalizzatoreAstConflitti';
import {
    creaConflittoDiTest,
    creaConflittoImportIndipendenti,
    creaConflittoFunzioniAggiunte,
    creaConflittoIrrisolto,
} from '../../helpers/conflittiDiTest';

describe('AnalizzatoreAstConflitti — edge case di integrazione', () => {

    describe('inizializzazione parser fallita', () => {

        it('ritorna non-risolvibile se caricamento linguaggio fallisce (linguaggio inesistente nella mappa)', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [creaConflittoImportIndipendenti(0)];

            // 'kotlin' non è presente in LINGUAGGI_SUPPORTATI dell'analizzatore
            const risultato = await analizzatore.analizzaConflitti(conflitti, 'kotlin');

            expect(risultato.numeroRisoltiAst).toBe(0);
            expect(risultato.conflittiAnalizzati).toHaveLength(1);
            expect(risultato.conflittiAnalizzati[0].risolvibileAutomaticamente).toBe(false);
        });

        it('gestisce errore Parser.init() senza crash per linguaggio completamente sconosciuto', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [creaConflittoImportIndipendenti(0)];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'brainfuck');

            expect(risultato.numeroRisoltiAst).toBe(0);
            expect(risultato.conflittiAnalizzati).toHaveLength(1);
        });
    });

    describe('conflitti multipli in singola chiamata', () => {

        it('analizza correttamente 3 conflitti diversi nella stessa invocazione', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [
                creaConflittoImportIndipendenti(0),
                creaConflittoFunzioniAggiunte(1),
                creaConflittoIrrisolto(2),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(3);
            // Import indipendenti
            expect(risultato.conflittiAnalizzati[0].risolvibileAutomaticamente).toBe(true);
            expect(risultato.conflittiAnalizzati[0].patternRilevato).toBe('import-indipendenti');
            // Funzioni aggiunte
            expect(risultato.conflittiAnalizzati[1].risolvibileAutomaticamente).toBe(true);
            expect(risultato.conflittiAnalizzati[1].patternRilevato).toBe('metodi-aggiunti');
            // Irrisolto
            expect(risultato.conflittiAnalizzati[2].risolvibileAutomaticamente).toBe(false);
        });

        it('conflitti indipendenti: uno con import, uno con funzioni, uno irrisolto — conteggio corretto', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [
                creaConflittoImportIndipendenti(0),
                creaConflittoFunzioniAggiunte(1),
                creaConflittoIrrisolto(2),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.numeroRisoltiAst).toBe(2);
            expect(risultato.conflittiAnalizzati.filter(r => !r.risolvibileAutomaticamente)).toHaveLength(1);
        });

        it('5 conflitti tutti non risolvibili — nessun crash', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = Array.from({ length: 5 }, (_, i) => creaConflittoIrrisolto(i));

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(5);
            expect(risultato.numeroRisoltiAst).toBe(0);
        });
    });

    describe('supporto multi-linguaggio', () => {

        it('risolve import indipendenti in JavaScript (.js)', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [creaConflittoImportIndipendenti(0)];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'javascript');

            expect(risultato.numeroRisoltiAst).toBe(1);
            expect(risultato.conflittiAnalizzati[0].patternRilevato).toBe('import-indipendenti');
        });

        it('linguaggio non supportato (python) ritorna tutto non risolvibile', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [creaConflittoImportIndipendenti(0)];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'python');

            expect(risultato.numeroRisoltiAst).toBe(0);
            expect(risultato.conflittiAnalizzati[0].risolvibileAutomaticamente).toBe(false);
        });
    });

    describe('caching del parser — riuso istanza', () => {

        it('seconda chiamata con stesso linguaggio non re-inizializza il parser', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [creaConflittoImportIndipendenti(0)];

            // Prima chiamata: inizializza parser TypeScript
            const r1 = await analizzatore.analizzaConflitti(conflitti, 'typescript');
            expect(r1.numeroRisoltiAst).toBe(1);

            // Seconda chiamata: stessa istanza, stesso linguaggio
            const r2 = await analizzatore.analizzaConflitti(conflitti, 'typescript');
            expect(r2.numeroRisoltiAst).toBe(1);

            // Entrambe producono lo stesso risultato
            expect(r2.conflittiAnalizzati[0].patternRilevato).toBe(r1.conflittiAnalizzati[0].patternRilevato);
        });

        it('cambio linguaggio tra due chiamate carica la grammar corretta', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflittiImport = [creaConflittoImportIndipendenti(0)];

            // Prima chiamata con TypeScript
            const r1 = await analizzatore.analizzaConflitti(conflittiImport, 'typescript');
            expect(r1.numeroRisoltiAst).toBe(1);

            // Seconda chiamata con JavaScript (cambia grammar)
            const r2 = await analizzatore.analizzaConflitti(conflittiImport, 'javascript');
            expect(r2.numeroRisoltiAst).toBe(1);
        });
    });

    describe('robustezza con input degeneri', () => {

        it('codice con errori di sintassi non causa crash ma ritorna non risolvibile', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [
                creaConflittoDiTest({
                    index: 0,
                    base: 'function {{{ broken >>>',
                    head: 'function ((( invalid <<<',
                    merging: 'const x = ;; !!',
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(1);
            // Non dovrebbe crashare, al massimo non risolvibile
            expect(risultato.conflittiAnalizzati[0].risolvibileAutomaticamente).toBe(false);
        });

        it('stringhe vuote come head/merging/base non causano errore', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [
                creaConflittoDiTest({
                    index: 0,
                    base: '',
                    head: '',
                    merging: '',
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(1);
            // Non deve crashare
        });

        it('conflitto con base null gestito correttamente a livello AST', async () => {
            const analizzatore = new AnalizzatoreAstConflitti();
            const conflitti = [
                creaConflittoDiTest({
                    index: 0,
                    base: null,
                    head: `import { x } from './x';`,
                    merging: `import { y } from './y';`,
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(1);
            // Con base null, il pattern import non ha baseline per determinare cosa è nuovo
        });
    });
});
