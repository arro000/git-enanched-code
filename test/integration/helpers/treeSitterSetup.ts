// eslint-disable-next-line @typescript-eslint/no-require-imports
const TreeSitter = require('web-tree-sitter');
import * as path from 'path';

const MAPPA_LINGUAGGI: Record<string, { pacchetto: string; nomeFile: string }> = {
    'typescript': { pacchetto: 'tree-sitter-typescript', nomeFile: 'tree-sitter-typescript.wasm' },
    'javascript': { pacchetto: 'tree-sitter-javascript', nomeFile: 'tree-sitter-javascript.wasm' },
    'java': { pacchetto: 'tree-sitter-java', nomeFile: 'tree-sitter-java.wasm' },
    'csharp': { pacchetto: 'tree-sitter-c-sharp', nomeFile: 'tree-sitter-c_sharp.wasm' },
    'rust': { pacchetto: 'tree-sitter-rust', nomeFile: 'tree-sitter-rust.wasm' },
};

let inizializzato = false;

/**
 * Inizializza web-tree-sitter e crea un parser con la grammar del linguaggio specificato.
 */
export async function inizializzaParserPerLinguaggio(linguaggioId: string): Promise<any> {
    if (!inizializzato) {
        await TreeSitter.Parser.init();
        inizializzato = true;
    }

    const config = MAPPA_LINGUAGGI[linguaggioId];
    if (!config) {
        throw new Error(`Linguaggio non supportato per Tree-sitter: ${linguaggioId}`);
    }

    const parser = new TreeSitter.Parser();
    const percorsoWasm = path.join(
        path.dirname(require.resolve(`${config.pacchetto}/package.json`)),
        config.nomeFile
    );
    const linguaggio = await TreeSitter.Language.load(percorsoWasm);
    parser.setLanguage(linguaggio);
    return parser;
}

/**
 * Parsa il codice sorgente e restituisce l'albero AST.
 */
export function parsaCodice(parser: any, codice: string): any {
    return parser.parse(codice);
}
