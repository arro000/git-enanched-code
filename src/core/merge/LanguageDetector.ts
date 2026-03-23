/**
 * Mappa estensioni di file ai linguaggi supportati da Tree-sitter.
 * Usato per identificare il linguaggio corretto prima dell'analisi AST.
 */
const ESTENSIONE_A_LINGUAGGIO: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.cs': 'csharp',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.rs': 'rust',
};

/**
 * Lista dei linguaggi per i quali Tree-sitter ha grammar disponibili.
 */
const LINGUAGGI_CON_GRAMMAR: Set<string> = new Set([
    'typescript', 'typescriptreact',
    'javascript', 'javascriptreact',
    'csharp', 'java', 'rust',
]);

/**
 * Rileva il linguaggio del file dall'estensione.
 * @returns L'identificativo del linguaggio (es. 'typescript') o null se non supportato
 */
export function rilevaLinguaggioDaEstensione(nomeFile: string): string | null {
    const estensione = nomeFile.substring(nomeFile.lastIndexOf('.')).toLowerCase();
    return ESTENSIONE_A_LINGUAGGIO[estensione] ?? null;
}

/**
 * Verifica se un linguaggio ha una grammar Tree-sitter disponibile.
 */
export function linguaggioSupportatoDaTreeSitter(linguaggioId: string): boolean {
    return LINGUAGGI_CON_GRAMMAR.has(linguaggioId);
}
