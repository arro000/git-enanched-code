// eslint-disable-next-line @typescript-eslint/no-require-imports
const TreeSitterModule = require('web-tree-sitter');
import { ConflictBlock } from '../git/ConflictParser';
import { RilevatorePatternSemantico } from './RilevatorePatternSemantico';

/**
 * Risultato della risoluzione AST di un singolo conflitto.
 */
export interface RisultatoRisoluzioneAst {
    indiceConflitto: number;
    risolvibileAutomaticamente: boolean;
    contenutoRisolto: string | null;
    scoreConfidenza: number;
    patternRilevato: string | null;
}

/**
 * Risultato complessivo dell'analisi AST su tutti i conflitti.
 */
export interface RisultatoAnalisiAst {
    conflittiAnalizzati: RisultatoRisoluzioneAst[];
    numeroRisoltiAst: number;
    tempoEsecuzioneMs: number;
}

/**
 * Mappa dei linguaggi supportati ai nomi dei file grammar WASM.
 */
/**
 * Mappa dei linguaggi supportati ai pacchetti npm con i file grammar WASM.
 * Formato: linguaggioId -> { pacchetto, nomeFile }
 */
const LINGUAGGI_SUPPORTATI: Record<string, { pacchetto: string; nomeFile: string }> = {
    'typescript': { pacchetto: 'tree-sitter-typescript', nomeFile: 'tree-sitter-typescript.wasm' },
    'javascript': { pacchetto: 'tree-sitter-javascript', nomeFile: 'tree-sitter-javascript.wasm' },
    'typescriptreact': { pacchetto: 'tree-sitter-typescript', nomeFile: 'tree-sitter-typescript.wasm' },
    'javascriptreact': { pacchetto: 'tree-sitter-javascript', nomeFile: 'tree-sitter-javascript.wasm' },
    'csharp': { pacchetto: 'tree-sitter-c-sharp', nomeFile: 'tree-sitter-c_sharp.wasm' },
    'java': { pacchetto: 'tree-sitter-java', nomeFile: 'tree-sitter-java.wasm' },
    'rust': { pacchetto: 'tree-sitter-rust', nomeFile: 'tree-sitter-rust.wasm' },
};

/**
 * Servizio per l'analisi AST dei conflitti non risolti da diff3 (Layer 2).
 * Usa web-tree-sitter per parsare il codice e identificare pattern
 * semanticamente compatibili che possono essere uniti automaticamente.
 */
export class AnalizzatoreAstConflitti {
    private parser: Parser | null = null;
    private linguaggioCaricato: string | null = null;
    private inizializzato = false;
    private readonly rilevatore = new RilevatorePatternSemantico();

    /**
     * Analizza i conflitti non risolti da diff3 tramite AST.
     * @param conflitti ConflictBlock non risolti dal Layer 1
     * @param linguaggioId Identificativo del linguaggio VS Code (es. 'typescript')
     */
    async analizzaConflitti(
        conflitti: ConflictBlock[],
        linguaggioId: string
    ): Promise<RisultatoAnalisiAst> {
        const inizioMs = performance.now();

        // Verifica che il linguaggio sia supportato
        if (!LINGUAGGI_SUPPORTATI[linguaggioId]) {
            return {
                conflittiAnalizzati: conflitti.map(c => ({
                    indiceConflitto: c.index,
                    risolvibileAutomaticamente: false,
                    contenutoRisolto: null,
                    scoreConfidenza: 0,
                    patternRilevato: null,
                })),
                numeroRisoltiAst: 0,
                tempoEsecuzioneMs: performance.now() - inizioMs,
            };
        }

        // Inizializza parser se necessario
        await this.inizializzaParser(linguaggioId);

        if (!this.parser) {
            return {
                conflittiAnalizzati: [],
                numeroRisoltiAst: 0,
                tempoEsecuzioneMs: performance.now() - inizioMs,
            };
        }

        const conflittiAnalizzati = conflitti.map(conflitto =>
            this.analizzaSingoloConflitto(conflitto)
        );

        return {
            conflittiAnalizzati,
            numeroRisoltiAst: conflittiAnalizzati.filter(r => r.risolvibileAutomaticamente).length,
            tempoEsecuzioneMs: performance.now() - inizioMs,
        };
    }

    /**
     * Analizza un singolo conflitto tramite AST.
     */
    private analizzaSingoloConflitto(conflitto: ConflictBlock): RisultatoRisoluzioneAst {
        if (!this.parser) {
            return this.creaRisultatoNonRisolvibile(conflitto.index);
        }

        try {
            const astHead = this.parser.parse(conflitto.head);
            const astMerging = this.parser.parse(conflitto.merging);
            const astBase = conflitto.base !== null
                ? this.parser.parse(conflitto.base)
                : null;

            const risultatoPattern = this.rilevatore.tentaRisoluzione(
                astHead,
                astMerging,
                astBase,
                conflitto.head,
                conflitto.merging,
                conflitto.base
            );

            // Libera la memoria degli alberi AST
            astHead.delete();
            astMerging.delete();
            if (astBase) astBase.delete();

            if (risultatoPattern) {
                return {
                    indiceConflitto: conflitto.index,
                    risolvibileAutomaticamente: true,
                    contenutoRisolto: risultatoPattern.contenutoRisolto,
                    scoreConfidenza: risultatoPattern.scoreConfidenza,
                    patternRilevato: risultatoPattern.patternRilevato,
                };
            }

            return this.creaRisultatoNonRisolvibile(conflitto.index);
        } catch {
            // Se il parsing fallisce, il conflitto resta irrisolto
            return this.creaRisultatoNonRisolvibile(conflitto.index);
        }
    }

    /**
     * Inizializza il parser Tree-sitter con la grammar del linguaggio specificato.
     */
    private async inizializzaParser(linguaggioId: string): Promise<void> {
        // Se già inizializzato con lo stesso linguaggio, skip
        if (this.inizializzato && this.linguaggioCaricato === linguaggioId) {
            return;
        }

        try {
            if (!this.inizializzato) {
                const path = require('path');
                const fs = require('fs');
                // Cerca web-tree-sitter.wasm: prima in __dirname (bundle out/),
                // poi in node_modules (per esecuzione diretta nei test)
                const percorsoInBundle = path.join(__dirname, 'web-tree-sitter.wasm');
                const percorsoInNodeModules = path.join(
                    path.dirname(require.resolve('web-tree-sitter')),
                    'web-tree-sitter.wasm'
                );
                const cartellaWasm = fs.existsSync(percorsoInBundle)
                    ? __dirname
                    : path.dirname(percorsoInNodeModules);
                await TreeSitterModule.Parser.init({
                    locateFile: (nomeFile: string) => path.join(cartellaWasm, nomeFile),
                });
                this.parser = new TreeSitterModule.Parser();
                this.inizializzato = true;
            }

            const configLinguaggio = LINGUAGGI_SUPPORTATI[linguaggioId];
            if (!configLinguaggio || !this.parser) return;

            // Carica la grammar WASM: prima da __dirname (bundle out/),
            // poi dal pacchetto npm del linguaggio
            const path = require('path');
            const fs = require('fs');
            const percorsoInBundle = path.join(__dirname, configLinguaggio.nomeFile);
            let percorsoWasm: string;
            if (fs.existsSync(percorsoInBundle)) {
                percorsoWasm = percorsoInBundle;
            } else {
                // Fallback: cerca nella root del pacchetto npm risalendo da require.resolve
                let cartella = path.dirname(require.resolve(configLinguaggio.pacchetto));
                while (cartella !== path.dirname(cartella)) {
                    if (fs.existsSync(path.join(cartella, configLinguaggio.nomeFile))) break;
                    cartella = path.dirname(cartella);
                }
                percorsoWasm = path.join(cartella, configLinguaggio.nomeFile);
            }
            const linguaggio = await TreeSitterModule.Language.load(percorsoWasm);
            this.parser.setLanguage(linguaggio);
            this.linguaggioCaricato = linguaggioId;
        } catch {
            // Se il caricamento fallisce, il parser resta null
            this.parser = null;
        }
    }

    private creaRisultatoNonRisolvibile(indiceConflitto: number): RisultatoRisoluzioneAst {
        return {
            indiceConflitto,
            risolvibileAutomaticamente: false,
            contenutoRisolto: null,
            scoreConfidenza: 0,
            patternRilevato: null,
        };
    }
}
