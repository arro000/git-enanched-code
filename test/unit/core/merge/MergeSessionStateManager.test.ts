import { describe, it, expect, beforeEach } from 'vitest';
import {
    MergeSessionStateManager,
    StatoSessioneMerge,
} from '../../../../src/core/merge/MergeSessionStateManager';

/**
 * In-memory implementation of vscode.Memento for testing.
 */
class MementoInMemoria {
    private archivio = new Map<string, unknown>();

    get<T>(chiave: string): T | undefined;
    get<T>(chiave: string, valoreDefault: T): T;
    get<T>(chiave: string, valoreDefault?: T): T | undefined {
        if (this.archivio.has(chiave)) {
            return this.archivio.get(chiave) as T;
        }
        return valoreDefault;
    }

    async update(chiave: string, valore: unknown): Promise<void> {
        if (valore === undefined) {
            this.archivio.delete(chiave);
        } else {
            this.archivio.set(chiave, valore);
        }
    }

    keys(): readonly string[] {
        return Array.from(this.archivio.keys());
    }
}

const FILE_CON_CONFLITTI = `some code
<<<<<<< HEAD
const x = 1;
=======
const x = 2;
>>>>>>> feature
more code
<<<<<<< HEAD
const y = 'a';
=======
const y = 'b';
>>>>>>> feature
end`.trim();

const PERCORSO_FILE = '/workspace/project/src/file.ts';

describe('MergeSessionStateManager', () => {
    let gestore: MergeSessionStateManager;
    let memento: MementoInMemoria;

    beforeEach(() => {
        memento = new MementoInMemoria();
        gestore = new MergeSessionStateManager(memento as any);
    });

    describe('calcolaHashContenuto', () => {
        it('returns consistent hash for the same content', () => {
            const hash1 = gestore.calcolaHashContenuto('hello world');
            const hash2 = gestore.calcolaHashContenuto('hello world');
            expect(hash1).toBe(hash2);
        });

        it('returns different hash for different content', () => {
            const hash1 = gestore.calcolaHashContenuto('hello');
            const hash2 = gestore.calcolaHashContenuto('world');
            expect(hash1).not.toBe(hash2);
        });

        it('handles empty string', () => {
            const hash = gestore.calcolaHashContenuto('');
            expect(hash).toBe('0');
        });
    });

    describe('creaStatoIniziale', () => {
        it('creates state with correct number of unresolved conflicts', () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);

            expect(stato.percorsoFile).toBe(PERCORSO_FILE);
            expect(stato.statiConflitti).toHaveLength(2);
            expect(stato.statiConflitti[0].risolto).toBe(false);
            expect(stato.statiConflitti[1].risolto).toBe(false);
            expect(stato.contenutoColonnaCentrale).toBeNull();
        });

        it('sets correct indices for each conflict', () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 3);

            expect(stato.statiConflitti[0].indiceConflitto).toBe(0);
            expect(stato.statiConflitti[1].indiceConflitto).toBe(1);
            expect(stato.statiConflitti[2].indiceConflitto).toBe(2);
        });

        it('stores content hash for validation', () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);
            const hashAtteso = gestore.calcolaHashContenuto(FILE_CON_CONFLITTI);

            expect(stato.hashContenutoOriginale).toBe(hashAtteso);
        });
    });

    describe('salvaStato / recuperaStato', () => {
        it('saves and retrieves state correctly', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].resolvedContent = 'const x = 1;';
            stato.statiConflitti[0].sorgenteApplicata = 'head';

            await gestore.salvaStato(stato);
            const statoRecuperato = await gestore.recuperaStato(PERCORSO_FILE, FILE_CON_CONFLITTI);

            expect(statoRecuperato).not.toBeNull();
            expect(statoRecuperato!.statiConflitti[0].risolto).toBe(true);
            expect(statoRecuperato!.statiConflitti[0].resolvedContent).toBe('const x = 1;');
            expect(statoRecuperato!.statiConflitti[0].sorgenteApplicata).toBe('head');
            expect(statoRecuperato!.statiConflitti[1].risolto).toBe(false);
        });

        it('returns null when no state exists', async () => {
            const stato = await gestore.recuperaStato('/nonexistent/path', FILE_CON_CONFLITTI);
            expect(stato).toBeNull();
        });

        it('returns null and clears state when file content has changed', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);
            await gestore.salvaStato(stato);

            const contenutoModificato = FILE_CON_CONFLITTI + '\n// new line added';
            const statoRecuperato = await gestore.recuperaStato(PERCORSO_FILE, contenutoModificato);

            expect(statoRecuperato).toBeNull();
            // Verify the stale state was cleaned up
            const secondoTentativo = await gestore.recuperaStato(PERCORSO_FILE, FILE_CON_CONFLITTI);
            expect(secondoTentativo).toBeNull();
        });

        it('updates timestamp on save', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 1);
            const timestampPrima = stato.ultimoAggiornamento;

            // Small delay to ensure different timestamp
            await new Promise(resolve => setTimeout(resolve, 10));
            await gestore.salvaStato(stato);

            const statoRecuperato = await gestore.recuperaStato(PERCORSO_FILE, FILE_CON_CONFLITTI);
            expect(statoRecuperato!.ultimoAggiornamento).toBeGreaterThanOrEqual(timestampPrima);
        });
    });

    describe('cancellaStato', () => {
        it('removes the saved state for a file', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);
            await gestore.salvaStato(stato);

            await gestore.cancellaStato(PERCORSO_FILE);
            const statoRecuperato = await gestore.recuperaStato(PERCORSO_FILE, FILE_CON_CONFLITTI);

            expect(statoRecuperato).toBeNull();
        });

        it('does not throw when cancelling non-existent state', async () => {
            await expect(
                gestore.cancellaStato('/nonexistent/path')
            ).resolves.toBeUndefined();
        });
    });

    describe('contaConflittiRisolti / contaConflittiAperti', () => {
        it('counts all conflicts as open when none are resolved', () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 3);

            expect(gestore.contaConflittiRisolti(stato)).toBe(0);
            expect(gestore.contaConflittiAperti(stato)).toBe(3);
        });

        it('counts correctly with partial resolution', () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 3);
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[2].risolto = true;

            expect(gestore.contaConflittiRisolti(stato)).toBe(2);
            expect(gestore.contaConflittiAperti(stato)).toBe(1);
        });

        it('counts all conflicts as resolved when all are done', () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[1].risolto = true;

            expect(gestore.contaConflittiRisolti(stato)).toBe(2);
            expect(gestore.contaConflittiAperti(stato)).toBe(0);
        });
    });

    describe('persistence of partial resolution (AC scenarios)', () => {
        it('AC1: restores already-applied resolutions when file is reopened', async () => {
            // Simulate: user resolves first conflict, closes and reopens
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].resolvedContent = 'const x = 1;';
            stato.statiConflitti[0].sorgenteApplicata = 'head';
            stato.contenutoColonnaCentrale = 'some code\nconst x = 1;\nmore code\n';

            await gestore.salvaStato(stato);

            // Simulate reopening — file content is the same (still has markers)
            const statoRipristinato = await gestore.recuperaStato(PERCORSO_FILE, FILE_CON_CONFLITTI);

            expect(statoRipristinato).not.toBeNull();
            expect(statoRipristinato!.statiConflitti[0].risolto).toBe(true);
            expect(statoRipristinato!.statiConflitti[0].resolvedContent).toBe('const x = 1;');
            expect(statoRipristinato!.contenutoColonnaCentrale).toBe('some code\nconst x = 1;\nmore code\n');
        });

        it('AC2: resolved conflicts appear as resolved in the restored state', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);
            stato.statiConflitti[0].risolto = true;
            stato.statiConflitti[0].sorgenteApplicata = 'merging';

            await gestore.salvaStato(stato);
            const statoRipristinato = await gestore.recuperaStato(PERCORSO_FILE, FILE_CON_CONFLITTI);

            expect(gestore.contaConflittiRisolti(statoRipristinato!)).toBe(1);
            expect(gestore.contaConflittiAperti(statoRipristinato!)).toBe(1);
        });

        it('AC3: unresolved conflicts appear as unresolved in the restored state', async () => {
            const stato = gestore.creaStatoIniziale(PERCORSO_FILE, FILE_CON_CONFLITTI, 2);
            // Only resolve the second conflict
            stato.statiConflitti[1].risolto = true;

            await gestore.salvaStato(stato);
            const statoRipristinato = await gestore.recuperaStato(PERCORSO_FILE, FILE_CON_CONFLITTI);

            expect(statoRipristinato!.statiConflitti[0].risolto).toBe(false);
            expect(statoRipristinato!.statiConflitti[0].resolvedContent).toBeNull();
            expect(statoRipristinato!.statiConflitti[1].risolto).toBe(true);
        });
    });
});
