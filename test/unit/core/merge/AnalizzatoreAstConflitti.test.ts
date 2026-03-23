import { describe, it, expect } from 'vitest';
import { AnalizzatoreAstConflitti } from '../../../../src/core/merge/AnalizzatoreAstConflitti';
import { ConflictBlock } from '../../../../src/core/git/ConflictParser';

function creaConflitto(overrides: Partial<ConflictBlock> & { head: string; merging: string }): ConflictBlock {
    return {
        index: 0,
        startLine: 0,
        endLine: 10,
        base: null,
        ...overrides,
    };
}

describe('AnalizzatoreAstConflitti', () => {
    const analizzatore = new AnalizzatoreAstConflitti();

    describe('analizzaConflitti', () => {
        it('ritorna non risolvibile per linguaggio non supportato', async () => {
            const conflitti = [
                creaConflitto({
                    head: 'x = 1',
                    base: 'x = 0',
                    merging: 'x = 2',
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'python');

            expect(risultato.conflittiAnalizzati).toHaveLength(1);
            expect(risultato.conflittiAnalizzati[0].risolvibileAutomaticamente).toBe(false);
            expect(risultato.numeroRisoltiAst).toBe(0);
        });

        it('risolve import indipendenti in TypeScript', async () => {
            const conflitti = [
                creaConflitto({
                    head: `import { a } from './a';\nimport { b } from './b';\n\nconst x = 1;`,
                    base: `import { a } from './a';\n\nconst x = 1;`,
                    merging: `import { a } from './a';\nimport { c } from './c';\n\nconst x = 1;`,
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(1);
            const risoluzione = risultato.conflittiAnalizzati[0];
            expect(risoluzione.risolvibileAutomaticamente).toBe(true);
            expect(risoluzione.resolvedContent).toContain("from './b'");
            expect(risoluzione.resolvedContent).toContain("from './c'");
            expect(risoluzione.scoreConfidenza).toBeGreaterThan(0);
            expect(risoluzione.patternRilevato).toBe('import-indipendenti');
        });

        it('non risolve conflitti reali (stessa variabile modificata)', async () => {
            const conflitti = [
                creaConflitto({
                    head: 'const x = 2;',
                    base: 'const x = 1;',
                    merging: 'const x = 3;',
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(1);
            expect(risultato.conflittiAnalizzati[0].risolvibileAutomaticamente).toBe(false);
        });

        it('gestisce array vuoto di conflitti', async () => {
            const risultato = await analizzatore.analizzaConflitti([], 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(0);
            expect(risultato.numeroRisoltiAst).toBe(0);
        });

        it('misura il tempo di esecuzione', async () => {
            const conflitti = [
                creaConflitto({
                    head: 'const a = 1;',
                    base: 'const a = 0;',
                    merging: 'const a = 2;',
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');
            expect(risultato.tempoEsecuzioneMs).toBeGreaterThanOrEqual(0);
        });

        it('risolve funzioni aggiunte da lati diversi', async () => {
            const conflitti = [
                creaConflitto({
                    head: `function esistente() { return 1; }\n\nfunction nuovaHead() { return 2; }`,
                    base: `function esistente() { return 1; }`,
                    merging: `function esistente() { return 1; }\n\nfunction nuovaMerging() { return 3; }`,
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            if (risultato.conflittiAnalizzati[0].risolvibileAutomaticamente) {
                expect(risultato.conflittiAnalizzati[0].patternRilevato).toBe('metodi-aggiunti');
                expect(risultato.conflittiAnalizzati[0].resolvedContent).toContain('nuovaHead');
                expect(risultato.conflittiAnalizzati[0].resolvedContent).toContain('nuovaMerging');
            }
        });

        it('gestisce conflitti senza base', async () => {
            const conflitti = [
                creaConflitto({
                    head: 'const x = 1;',
                    base: null,
                    merging: 'const x = 2;',
                }),
            ];

            const risultato = await analizzatore.analizzaConflitti(conflitti, 'typescript');

            expect(risultato.conflittiAnalizzati).toHaveLength(1);
            expect(risultato.conflittiAnalizzati[0].risolvibileAutomaticamente).toBe(false);
        });
    });
});
