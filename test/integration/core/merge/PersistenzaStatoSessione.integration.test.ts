import { describe, it, expect, beforeEach } from 'vitest';
import {
    MergeSessionStateManager,
    StatoSessioneMerge,
} from '../../../../src/core/merge/MergeSessionStateManager';
import { MementoInMemoria } from '../../helpers/conflittiDiTest';

const PERCORSO_FILE_A = '/workspace/progetto/src/fileA.ts';
const PERCORSO_FILE_B = '/workspace/progetto/src/fileB.ts';
const CONTENUTO_ORIGINALE = `riga1
<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> feature
riga finale`;

describe('Persistenza stato sessione — integrazione con pipeline di risoluzione', () => {
    let gestore: MergeSessionStateManager;
    let memento: MementoInMemoria;

    beforeEach(() => {
        memento = new MementoInMemoria();
        gestore = new MergeSessionStateManager(memento as any);
    });

    describe('ciclo completo: creazione → aggiornamento con risoluzioni → recupero → validazione', () => {

        it('crea stato iniziale, applica risoluzione diff3-auto, salva e recupera correttamente', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 3);

            // Simula risoluzione diff3-auto del primo conflitto
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].contenutoRisolto = 'const x = 42;';
            stato.statiConflitti[0].sorgenteApplicata = 'diff3-auto';

            await gestore.salvaStato(stato);

            const recuperato = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);

            expect(recuperato).not.toBeNull();
            expect(recuperato!.statiConflitti[0].risolto).toBe(true);
            expect(recuperato!.statiConflitti[0].contenutoRisolto).toBe('const x = 42;');
            expect(recuperato!.statiConflitti[0].sorgenteApplicata).toBe('diff3-auto');
            expect(recuperato!.statiConflitti[1].risolto).toBe(false);
            expect(recuperato!.statiConflitti[2].risolto).toBe(false);
        });

        it('crea stato, applica risoluzione ast-auto con scoreConfidenza, salva e recupera', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 2);

            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].contenutoRisolto = 'import { a } from "./a";\nimport { b } from "./b";';
            stato.statiConflitti[0].sorgenteApplicata = 'ast-auto';

            await gestore.salvaStato(stato);

            const recuperato = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);

            expect(recuperato).not.toBeNull();
            expect(recuperato!.statiConflitti[0].sorgenteApplicata).toBe('ast-auto');
            expect(recuperato!.statiConflitti[0].contenutoRisolto).toContain('import');
        });

        it('crea stato, applica risoluzione manuale, salva e recupera', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 1);

            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].contenutoRisolto = 'codice scritto manualmente dall utente';
            stato.statiConflitti[0].sorgenteApplicata = 'manual';

            await gestore.salvaStato(stato);

            const recuperato = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);

            expect(recuperato).not.toBeNull();
            expect(recuperato!.statiConflitti[0].sorgenteApplicata).toBe('manual');
            expect(recuperato!.statiConflitti[0].contenutoRisolto).toBe('codice scritto manualmente dall utente');
        });
    });

    describe('stato con sorgenti di risoluzione miste', () => {

        it('3 conflitti: 1 diff3 + 1 ast + 1 manual — tutti preservati dopo save/restore', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 3);

            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].contenutoRisolto = 'risolto da diff3';
            stato.statiConflitti[0].sorgenteApplicata = 'diff3-auto';

            stato.statiConflitti[1].risolto = true;
            stato.statiConflitti[1].contenutoRisolto = 'risolto da ast';
            stato.statiConflitti[1].sorgenteApplicata = 'ast-auto';

            stato.statiConflitti[2].risolto = true;
            stato.statiConflitti[2].contenutoRisolto = 'risolto manualmente';
            stato.statiConflitti[2].sorgenteApplicata = 'manual';

            await gestore.salvaStato(stato);

            const recuperato = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);

            expect(recuperato).not.toBeNull();
            expect(recuperato!.statiConflitti[0].sorgenteApplicata).toBe('diff3-auto');
            expect(recuperato!.statiConflitti[1].sorgenteApplicata).toBe('ast-auto');
            expect(recuperato!.statiConflitti[2].sorgenteApplicata).toBe('manual');
            expect(gestore.contaConflittiRisolti(recuperato!)).toBe(3);
            expect(gestore.contaConflittiAperti(recuperato!)).toBe(0);
        });

        it('aggiornamento incrementale: prima diff3, poi ast, poi manual — stato finale corretto', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 3);

            // Step 1: Diff3 risolve il primo
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].sorgenteApplicata = 'diff3-auto';
            stato.statiConflitti[0].contenutoRisolto = 'diff3 result';
            await gestore.salvaStato(stato);

            // Step 2: AST risolve il secondo
            stato.statiConflitti[1].risolto = true;
            stato.statiConflitti[1].sorgenteApplicata = 'ast-auto';
            stato.statiConflitti[1].contenutoRisolto = 'ast result';
            await gestore.salvaStato(stato);

            // Step 3: Utente risolve il terzo manualmente
            stato.statiConflitti[2].risolto = true;
            stato.statiConflitti[2].sorgenteApplicata = 'manual';
            stato.statiConflitti[2].contenutoRisolto = 'manual result';
            stato.contenutoColonnaCentrale = 'contenuto completo della colonna centrale';
            await gestore.salvaStato(stato);

            const recuperato = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);

            expect(recuperato).not.toBeNull();
            expect(gestore.contaConflittiRisolti(recuperato!)).toBe(3);
            expect(recuperato!.contenutoColonnaCentrale).toBe('contenuto completo della colonna centrale');
        });

        it('contenutoColonnaCentrale aggiornato insieme agli stati dei conflitti', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 2);
            expect(stato.contenutoColonnaCentrale).toBeNull();

            stato.contenutoColonnaCentrale = 'contenuto iniziale colonna centrale';
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].sorgenteApplicata = 'head';
            stato.statiConflitti[0].contenutoRisolto = 'const x = 1;';
            await gestore.salvaStato(stato);

            const recuperato = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);
            expect(recuperato!.contenutoColonnaCentrale).toBe('contenuto iniziale colonna centrale');
        });
    });

    describe('invalidazione per hash mismatch', () => {

        it('contenuto file modificato esternamente invalida lo stato salvato', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 2);
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].sorgenteApplicata = 'diff3-auto';
            stato.statiConflitti[0].contenutoRisolto = 'risolto';
            await gestore.salvaStato(stato);

            // Il file viene modificato esternamente
            const contenutoModificato = CONTENUTO_ORIGINALE + '\n// commento aggiunto';
            const recuperato = await gestore.recuperaStato(PERCORSO_FILE_A, contenutoModificato);

            expect(recuperato).toBeNull();
        });

        it('stato invalidato viene cancellato dal memento — successive letture ritornano null', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 1);
            await gestore.salvaStato(stato);

            // Prima lettura con contenuto diverso: invalida e cancella
            const contenutoModificato = 'contenuto completamente diverso';
            await gestore.recuperaStato(PERCORSO_FILE_A, contenutoModificato);

            // Seconda lettura con contenuto originale: lo stato è già stato cancellato
            const secondaLettura = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);
            expect(secondaLettura).toBeNull();
        });

        it('modifica minima (un carattere) è sufficiente a invalidare', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 1);
            await gestore.salvaStato(stato);

            // Aggiungi un solo carattere
            const contenutoMinimamenteModificato = CONTENUTO_ORIGINALE + ' ';
            const recuperato = await gestore.recuperaStato(PERCORSO_FILE_A, contenutoMinimamenteModificato);

            expect(recuperato).toBeNull();
        });
    });

    describe('gestione di più file contemporaneamente', () => {

        it('stati di 2 file diversi sono indipendenti', async () => {
            const statoA = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 2);
            statoA.statiConflitti[0].risolto = true;
            statoA.statiConflitti[0].sorgenteApplicata = 'diff3-auto';
            statoA.statiConflitti[0].contenutoRisolto = 'risolto A';

            const contenutoB = 'contenuto diverso del file B';
            const statoB = gestore.creaStatoIniziale(PERCORSO_FILE_B, contenutoB, 3);
            statoB.statiConflitti[1].risolto = true;
            statoB.statiConflitti[1].sorgenteApplicata = 'ast-auto';
            statoB.statiConflitti[1].contenutoRisolto = 'risolto B';

            await gestore.salvaStato(statoA);
            await gestore.salvaStato(statoB);

            const recuperatoA = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);
            const recuperatoB = await gestore.recuperaStato(PERCORSO_FILE_B, contenutoB);

            expect(recuperatoA).not.toBeNull();
            expect(recuperatoB).not.toBeNull();
            expect(gestore.contaConflittiRisolti(recuperatoA!)).toBe(1);
            expect(gestore.contaConflittiRisolti(recuperatoB!)).toBe(1);
            expect(recuperatoA!.statiConflitti[0].sorgenteApplicata).toBe('diff3-auto');
            expect(recuperatoB!.statiConflitti[1].sorgenteApplicata).toBe('ast-auto');
        });

        it('cancellazione dello stato di un file non tocca gli altri', async () => {
            const statoA = gestore.creaStatoIniziale(PERCORSO_FILE_A, CONTENUTO_ORIGINALE, 1);
            const contenutoB = 'contenuto file B';
            const statoB = gestore.creaStatoIniziale(PERCORSO_FILE_B, contenutoB, 1);

            await gestore.salvaStato(statoA);
            await gestore.salvaStato(statoB);

            // Cancella solo lo stato del file A
            await gestore.cancellaStato(PERCORSO_FILE_A);

            const recuperatoA = await gestore.recuperaStato(PERCORSO_FILE_A, CONTENUTO_ORIGINALE);
            const recuperatoB = await gestore.recuperaStato(PERCORSO_FILE_B, contenutoB);

            expect(recuperatoA).toBeNull();
            expect(recuperatoB).not.toBeNull();
        });
    });
});
