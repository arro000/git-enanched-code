import { ConflictBlock } from '../../../src/core/git/ConflictParser';
import { Diff3Resolver, RisultatoAnalisiDiff3 } from '../../../src/core/merge/Diff3Resolver';
import { AnalizzatoreAstConflitti, RisultatoAnalisiAst } from '../../../src/core/merge/AnalizzatoreAstConflitti';

// ---------------------------------------------------------------------------
// Factory base
// ---------------------------------------------------------------------------

/**
 * Crea un ConflictBlock con valori di default ragionevoli, sovrascrivibili.
 */
export function creaConflittoDiTest(
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

// ---------------------------------------------------------------------------
// Factory per pattern specifici
// ---------------------------------------------------------------------------

/**
 * Conflitto risolvibile da Diff3: solo HEAD modifica, MERGING = BASE.
 */
export function creaConflittoDiff3Risolvibile(indice: number): ConflictBlock {
    return creaConflittoDiTest({
        index: indice,
        base: 'const valore = 1;',
        head: 'const valore = 42;',
        merging: 'const valore = 1;',
    });
}

/**
 * Conflitto con import indipendenti da HEAD e MERGING (risolvibile da AST).
 */
export function creaConflittoImportIndipendenti(indice: number): ConflictBlock {
    return creaConflittoDiTest({
        index: indice,
        base: `import { a } from './a';\n\nconst x = 1;`,
        head: `import { a } from './a';\nimport { b } from './b';\n\nconst x = 1;`,
        merging: `import { a } from './a';\nimport { c } from './c';\n\nconst x = 1;`,
    });
}

/**
 * Conflitto con funzioni aggiunte da lati diversi (risolvibile da AST).
 */
export function creaConflittoFunzioniAggiunte(indice: number): ConflictBlock {
    return creaConflittoDiTest({
        index: indice,
        base: `function esistente() { return 1; }`,
        head: `function esistente() { return 1; }\n\nfunction nuovaHead() { return 2; }`,
        merging: `function esistente() { return 1; }\n\nfunction nuovaMerging() { return 3; }`,
    });
}

/**
 * Conflitto con proprietà indipendenti aggiunte (potenzialmente risolvibile da AST).
 */
export function creaConflittoProprietaIndipendenti(indice: number): ConflictBlock {
    return creaConflittoDiTest({
        index: indice,
        base: `const obj = {\n  a: 1\n};`,
        head: `const obj = {\n  a: 1,\n  b: 2\n};`,
        merging: `const obj = {\n  a: 1,\n  c: 3\n};`,
    });
}

/**
 * Conflitto genuinamente irrisolto: stessa riga modificata da entrambi.
 */
export function creaConflittoIrrisolto(indice: number): ConflictBlock {
    return creaConflittoDiTest({
        index: indice,
        base: 'const x = 1;',
        head: 'const x = 2;',
        merging: 'const x = 3;',
    });
}

/**
 * Conflitto irrisolto senza base (2-way).
 */
export function creaConflittoSenzaBase(indice: number): ConflictBlock {
    return creaConflittoDiTest({
        index: indice,
        base: null,
        head: 'const x = 2;',
        merging: 'const x = 3;',
    });
}

// ---------------------------------------------------------------------------
// Fixture pre-costruite
// ---------------------------------------------------------------------------

/** 1 diff3-risolvibile, 1 import AST, 1 irrisolto genuino */
export const CONFLITTI_SCENARIO_MISTO: ConflictBlock[] = [
    creaConflittoDiff3Risolvibile(0),
    creaConflittoImportIndipendenti(1),
    creaConflittoIrrisolto(2),
];

/** Tutti risolvibili da Diff3 */
export const CONFLITTI_SOLO_DIFF3: ConflictBlock[] = [
    creaConflittoDiff3Risolvibile(0),
    creaConflittoDiTest({
        index: 1,
        base: 'let y = "hello";',
        head: 'let y = "hello";',
        merging: 'let y = "world";',
    }),
];

/** Tutti con base null ma con pattern AST (import indipendenti) */
export const CONFLITTI_SOLO_AST: ConflictBlock[] = [
    creaConflittoImportIndipendenti(0),
    creaConflittoFunzioniAggiunte(1),
];

// ---------------------------------------------------------------------------
// Pipeline di risoluzione
// ---------------------------------------------------------------------------

export interface RisultatoPipeline {
    risultatoDiff3: RisultatoAnalisiDiff3;
    risultatoAst: RisultatoAnalisiAst | null;
    conflittiRisoltiTotale: number;
    conflittiIrrisoltiTotale: number;
}

/**
 * Esegue la pipeline completa Layer 1 (Diff3) → Layer 2 (AST).
 * Simula la logica reale dell'editor: prima Diff3, poi AST sugli irrisolti.
 */
export async function eseguiPipelineRisoluzione(
    conflitti: ConflictBlock[],
    linguaggioId: string
): Promise<RisultatoPipeline> {
    const diff3 = new Diff3Resolver();
    const risultatoDiff3 = diff3.risolviConflitti(conflitti);

    // Filtra i conflitti non risolti da Diff3
    const conflittiIrrisoltiDiff3 = conflitti.filter((_c, i) =>
        !risultatoDiff3.conflittiRisolti[i].risolvibileAutomaticamente
    );

    let risultatoAst: RisultatoAnalisiAst | null = null;
    let risoltiAst = 0;

    if (conflittiIrrisoltiDiff3.length > 0) {
        const analizzatoreAst = new AnalizzatoreAstConflitti();
        risultatoAst = await analizzatoreAst.analizzaConflitti(conflittiIrrisoltiDiff3, linguaggioId);
        risoltiAst = risultatoAst.numeroRisoltiAst;
    }

    return {
        risultatoDiff3,
        risultatoAst,
        conflittiRisoltiTotale: risultatoDiff3.numeroRisoltiAutomaticamente + risoltiAst,
        conflittiIrrisoltiTotale: conflitti.length - risultatoDiff3.numeroRisoltiAutomaticamente - risoltiAst,
    };
}

// ---------------------------------------------------------------------------
// MementoInMemoria (estratto da test unit MergeSessionStateManager)
// ---------------------------------------------------------------------------

/**
 * Implementazione in-memory di vscode.Memento per i test.
 */
export class MementoInMemoria {
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
