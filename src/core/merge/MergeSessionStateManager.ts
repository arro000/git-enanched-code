import * as vscode from 'vscode';

/**
 * Represents the resolution state of a single conflict within a file.
 */
export interface StatoRisoluzioneConflitto {
    /** 0-based index of the conflict in the file */
    indiceConflitto: number;
    /** Whether the conflict has been resolved */
    risolto: boolean;
    /** The resolved content for this conflict (null if not yet resolved) */
    contenutoRisolto: string | null;
    /** Which source was applied: 'head', 'merging', 'both', 'manual', or null if unresolved */
    sorgenteApplicata: 'head' | 'merging' | 'both' | 'manual' | null;
}

/**
 * Represents the full merge session state for a single file.
 */
export interface StatoSessioneMerge {
    /** The file path this state belongs to */
    percorsoFile: string;
    /** Hash of the original file content with conflict markers (for validation) */
    hashContenutoOriginale: string;
    /** Resolution state for each conflict */
    statiConflitti: StatoRisoluzioneConflitto[];
    /** The full content of the result column */
    contenutoColonnaCentrale: string | null;
    /** Timestamp of last update */
    ultimoAggiornamento: number;
}

const PREFISSO_CHIAVE_STATO = 'git-enhanced:mergeState:';

export class MergeSessionStateManager {
    constructor(private readonly workspaceState: vscode.Memento) {}

    /**
     * Generates a simple hash of the content for validation purposes.
     * Used to verify the file hasn't changed since the state was saved.
     */
    calcolaHashContenuto(contenuto: string): string {
        let hash = 0;
        for (let i = 0; i < contenuto.length; i++) {
            const carattere = contenuto.charCodeAt(i);
            hash = ((hash << 5) - hash) + carattere;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Saves the merge session state for a file.
     */
    async salvaStato(stato: StatoSessioneMerge): Promise<void> {
        const chiave = this.generaChiaveStato(stato.percorsoFile);
        const statoConTimestamp: StatoSessioneMerge = {
            ...stato,
            ultimoAggiornamento: Date.now(),
        };
        await this.workspaceState.update(chiave, statoConTimestamp);
    }

    /**
     * Retrieves the saved merge session state for a file.
     * Returns null if no state exists or if the file content has changed
     * (detected via hash mismatch).
     */
    async recuperaStato(
        percorsoFile: string,
        contenutoAttualeFile: string
    ): Promise<StatoSessioneMerge | null> {
        const chiave = this.generaChiaveStato(percorsoFile);
        const statoSalvato = this.workspaceState.get<StatoSessioneMerge>(chiave);

        if (!statoSalvato) {
            return null;
        }

        // Validate that the file content hasn't changed since the state was saved
        const hashAttuale = this.calcolaHashContenuto(contenutoAttualeFile);
        if (statoSalvato.hashContenutoOriginale !== hashAttuale) {
            // File has changed — invalidate the saved state
            await this.cancellaStato(percorsoFile);
            return null;
        }

        return statoSalvato;
    }

    /**
     * Removes the saved state for a file (e.g., after merge completion).
     */
    async cancellaStato(percorsoFile: string): Promise<void> {
        const chiave = this.generaChiaveStato(percorsoFile);
        await this.workspaceState.update(chiave, undefined);
    }

    /**
     * Creates an initial state for a new merge session.
     */
    creaStatoIniziale(
        percorsoFile: string,
        contenutoOriginale: string,
        numeroConflitti: number
    ): StatoSessioneMerge {
        const statiConflitti: StatoRisoluzioneConflitto[] = [];
        for (let i = 0; i < numeroConflitti; i++) {
            statiConflitti.push({
                indiceConflitto: i,
                risolto: false,
                contenutoRisolto: null,
                sorgenteApplicata: null,
            });
        }

        return {
            percorsoFile,
            hashContenutoOriginale: this.calcolaHashContenuto(contenutoOriginale),
            statiConflitti,
            contenutoColonnaCentrale: null,
            ultimoAggiornamento: Date.now(),
        };
    }

    /**
     * Returns the count of resolved conflicts from a state.
     */
    contaConflittiRisolti(stato: StatoSessioneMerge): number {
        return stato.statiConflitti.filter(s => s.risolto).length;
    }

    /**
     * Returns the count of unresolved conflicts from a state.
     */
    contaConflittiAperti(stato: StatoSessioneMerge): number {
        return stato.statiConflitti.filter(s => !s.risolto).length;
    }

    private generaChiaveStato(percorsoFile: string): string {
        return `${PREFISSO_CHIAVE_STATO}${percorsoFile}`;
    }
}
