import { describe, it, expect } from 'vitest';
import { Diff3Resolver } from '../../../../src/core/merge/Diff3Resolver';
import { ConflictBlock } from '../../../../src/core/git/ConflictParser';

function creaConflitto(
    overrides: Partial<ConflictBlock> & { head: string; merging: string }
): ConflictBlock {
    return {
        index: 0,
        startLine: 0,
        endLine: 10,
        base: null,
        ...overrides,
    };
}

describe('Diff3Resolver', () => {
    const resolver = new Diff3Resolver();

    describe('risolviSingoloConflitto', () => {
        it('ritorna non risolvibile quando base è null (conflitto 2-way)', () => {
            const conflitto = creaConflitto({
                head: 'const x = 1;',
                base: null,
                merging: 'const x = 2;',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(false);
            expect(risultato.motivoNonRisolto).toBe('base-assente');
            expect(risultato.contenutoRisolto).toBeNull();
        });

        it('risolve quando solo HEAD modifica (MERGING identico a BASE)', () => {
            const conflitto = creaConflitto({
                head: 'const x = 42;',
                base: 'const x = 1;',
                merging: 'const x = 1;',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(true);
            expect(risultato.contenutoRisolto).toBe('const x = 42;');
            expect(risultato.motivoNonRisolto).toBeNull();
        });

        it('risolve quando solo MERGING modifica (HEAD identico a BASE)', () => {
            const conflitto = creaConflitto({
                head: 'const x = 1;',
                base: 'const x = 1;',
                merging: 'const x = 99;',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(true);
            expect(risultato.contenutoRisolto).toBe('const x = 99;');
        });

        it('risolve modifiche non sovrapposte su righe diverse', () => {
            const conflitto = creaConflitto({
                head: 'riga1-head\nriga2\nriga3',
                base: 'riga1\nriga2\nriga3',
                merging: 'riga1\nriga2\nriga3-merging',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(true);
            expect(risultato.contenutoRisolto).toBe('riga1-head\nriga2\nriga3-merging');
        });

        it('non risolve quando entrambi modificano la stessa riga', () => {
            const conflitto = creaConflitto({
                head: 'const x = 1;',
                base: 'const x = 0;',
                merging: 'const x = 2;',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(false);
            expect(risultato.motivoNonRisolto).toBe('sovrapposizione-modifiche');
        });

        it('risolve aggiunte non sovrapposte in posizioni diverse', () => {
            const conflitto = creaConflitto({
                head: 'nuova-head\nriga1\nriga2',
                base: 'riga1\nriga2',
                merging: 'riga1\nriga2\nnuova-merging',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(true);
            expect(risultato.contenutoRisolto).toContain('nuova-head');
            expect(risultato.contenutoRisolto).toContain('nuova-merging');
            expect(risultato.contenutoRisolto).toContain('riga1');
            expect(risultato.contenutoRisolto).toContain('riga2');
        });

        it('risolve rimozioni non sovrapposte', () => {
            const conflitto = creaConflitto({
                head: 'riga2\nriga3',
                base: 'riga1\nriga2\nriga3\nriga4',
                merging: 'riga1\nriga2\nriga3',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(true);
            expect(risultato.contenutoRisolto).toBe('riga2\nriga3');
        });

        it('non risolve quando un lato rimuove e l altro modifica la stessa riga', () => {
            const conflitto = creaConflitto({
                head: 'riga2',
                base: 'riga1\nriga2',
                merging: 'riga1-modificata\nriga2',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(false);
            expect(risultato.motivoNonRisolto).toBe('sovrapposizione-modifiche');
        });

        it('risolve quando tutte le sezioni sono vuote', () => {
            const conflitto = creaConflitto({
                head: '',
                base: '',
                merging: '',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(true);
            expect(risultato.contenutoRisolto).toBe('');
        });

        it('risolve quando HEAD e MERGING e BASE sono identici', () => {
            const conflitto = creaConflitto({
                head: 'const x = 1;\nconst y = 2;',
                base: 'const x = 1;\nconst y = 2;',
                merging: 'const x = 1;\nconst y = 2;',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);

            expect(risultato.risolvibileAutomaticamente).toBe(true);
            expect(risultato.contenutoRisolto).toBe('const x = 1;\nconst y = 2;');
        });

        it('preserva l indice del conflitto nel risultato', () => {
            const conflitto = creaConflitto({
                index: 5,
                head: 'x',
                base: null,
                merging: 'y',
            });

            const risultato = resolver.risolviSingoloConflitto(conflitto);
            expect(risultato.indiceConflitto).toBe(5);
        });
    });

    describe('risolviConflitti', () => {
        it('risolve array vuoto di conflitti', () => {
            const risultato = resolver.risolviConflitti([]);

            expect(risultato.conflittiRisolti).toHaveLength(0);
            expect(risultato.numeroRisoltiAutomaticamente).toBe(0);
            expect(risultato.numeroNonRisolvibili).toBe(0);
            expect(risultato.tempoEsecuzioneMs).toBeGreaterThanOrEqual(0);
        });

        it('conta correttamente risolvibili e non risolvibili', () => {
            const conflitti: ConflictBlock[] = [
                creaConflitto({
                    index: 0,
                    head: 'const a = 1;',
                    base: 'const a = 0;',
                    merging: 'const a = 0;',
                }),
                creaConflitto({
                    index: 1,
                    head: 'const b = 1;',
                    base: null,
                    merging: 'const b = 2;',
                }),
                creaConflitto({
                    index: 2,
                    head: 'const c = 1;',
                    base: 'const c = 0;',
                    merging: 'const c = 2;',
                }),
            ];

            const risultato = resolver.risolviConflitti(conflitti);

            expect(risultato.conflittiRisolti).toHaveLength(3);
            expect(risultato.numeroRisoltiAutomaticamente).toBe(1);
            expect(risultato.numeroNonRisolvibili).toBe(2);
        });

        it('risolve indipendentemente ogni blocco in un array misto', () => {
            const conflitti: ConflictBlock[] = [
                creaConflitto({
                    index: 0,
                    head: 'a-head\nb',
                    base: 'a\nb',
                    merging: 'a\nb-merging',
                }),
                creaConflitto({
                    index: 1,
                    head: 'x',
                    base: 'y',
                    merging: 'z',
                }),
            ];

            const risultato = resolver.risolviConflitti(conflitti);

            expect(risultato.conflittiRisolti[0].risolvibileAutomaticamente).toBe(true);
            expect(risultato.conflittiRisolti[0].contenutoRisolto).toBe('a-head\nb-merging');
            expect(risultato.conflittiRisolti[1].risolvibileAutomaticamente).toBe(false);
        });

        it('misura il tempo di esecuzione', () => {
            const conflitti: ConflictBlock[] = [
                creaConflitto({
                    head: 'a',
                    base: 'b',
                    merging: 'b',
                }),
            ];

            const risultato = resolver.risolviConflitti(conflitti);
            expect(risultato.tempoEsecuzioneMs).toBeGreaterThanOrEqual(0);
        });

        it('completa entro 200ms per conflitti con ~500 righe per lato', () => {
            const righeBase = Array.from({ length: 500 }, (_, i) => `riga-base-${i}`);
            const righeHead = [...righeBase];
            const righeMerging = [...righeBase];

            // HEAD modifica le prime 10 righe
            for (let i = 0; i < 10; i++) {
                righeHead[i] = `riga-head-modificata-${i}`;
            }
            // MERGING modifica le ultime 10 righe
            for (let i = 490; i < 500; i++) {
                righeMerging[i] = `riga-merging-modificata-${i}`;
            }

            const conflitto = creaConflitto({
                head: righeHead.join('\n'),
                base: righeBase.join('\n'),
                merging: righeMerging.join('\n'),
            });

            const risultato = resolver.risolviConflitti([conflitto]);

            expect(risultato.tempoEsecuzioneMs).toBeLessThan(200);
            expect(risultato.conflittiRisolti[0].risolvibileAutomaticamente).toBe(true);
        });
    });
});
