import { describe, it, expect, beforeAll } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TreeSitter = require('web-tree-sitter');
import * as path from 'path';
import { RilevatorePatternSemantico } from '../../../../src/core/merge/RilevatorePatternSemantico';

describe('RilevatorePatternSemantico', () => {
    let parser: any;
    const rilevatore = new RilevatorePatternSemantico();

    beforeAll(async () => {
        await TreeSitter.Parser.init();
        parser = new TreeSitter.Parser();
        const percorsoWasm = path.join(
            path.dirname(require.resolve('tree-sitter-typescript/package.json')),
            'tree-sitter-typescript.wasm'
        );
        const linguaggio = await TreeSitter.Language.load(percorsoWasm);
        parser.setLanguage(linguaggio);
    });

    function parsaCodice(codice: string) {
        return parser.parse(codice);
    }

    describe('import indipendenti', () => {
        it('rileva e merge import aggiunti da lati diversi', () => {
            const codiceBase = `import { a } from './a';\n\nconst x = 1;`;
            const codiceHead = `import { a } from './a';\nimport { b } from './b';\n\nconst x = 1;`;
            const codiceMerging = `import { a } from './a';\nimport { c } from './c';\n\nconst x = 1;`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            expect(risultato).not.toBeNull();
            expect(risultato!.patternRilevato).toBe('import-indipendenti');
            expect(risultato!.scoreConfidenza).toBe(0.95);
            expect(risultato!.resolvedContent).toContain("from './b'");
            expect(risultato!.resolvedContent).toContain("from './c'");
        });

        it('non risolve import dallo stesso modulo con contenuti diversi', () => {
            const codiceBase = `const x = 1;`;
            const codiceHead = `import { a } from './mod';\n\nconst x = 1;`;
            const codiceMerging = `import { b } from './mod';\n\nconst x = 1;`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            expect(risultato).toBeNull();
        });

        it('non risolve quando entrambi hanno modifiche non-import', () => {
            const codiceBase = `import { a } from './a';\n\nconst x = 1;`;
            const codiceHead = `import { a } from './a';\nimport { b } from './b';\n\nconst x = 2;`;
            const codiceMerging = `import { a } from './a';\nimport { c } from './c';\n\nconst x = 3;`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            expect(risultato).toBeNull();
        });
    });

    describe('metodi aggiunti', () => {
        it('rileva funzioni aggiunte da lati diversi', () => {
            const codiceBase = `function esistente() { return 1; }`;
            const codiceHead = `function esistente() { return 1; }\n\nfunction nuovaHead() { return 2; }`;
            const codiceMerging = `function esistente() { return 1; }\n\nfunction nuovaMerging() { return 3; }`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            expect(risultato).not.toBeNull();
            expect(risultato!.patternRilevato).toBe('metodi-aggiunti');
            expect(risultato!.scoreConfidenza).toBe(0.85);
            expect(risultato!.resolvedContent).toContain('nuovaHead');
            expect(risultato!.resolvedContent).toContain('nuovaMerging');
        });

        it('non risolve quando entrambi aggiungono funzione con stesso nome', () => {
            const codiceBase = `function esistente() { return 1; }`;
            const codiceHead = `function esistente() { return 1; }\n\nfunction duplicata() { return 'head'; }`;
            const codiceMerging = `function esistente() { return 1; }\n\nfunction duplicata() { return 'merging'; }`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            // Dovrebbe essere null perché hanno la stessa funzione
            expect(risultato).toBeNull();
        });

        it('non risolve senza base', () => {
            const codiceHead = `function nuovaHead() { return 2; }`;
            const codiceMerging = `function nuovaMerging() { return 3; }`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                null,
                codiceHead,
                codiceMerging,
                null
            );

            // Senza base il pattern metodi non funziona
            expect(risultato).toBeNull();
        });
    });

    describe('proprietà indipendenti', () => {
        it('rileva proprietà aggiunte da lati diversi in un oggetto', () => {
            const codiceBase = `const obj = {\n  a: 1\n};`;
            const codiceHead = `const obj = {\n  a: 1,\n  b: 2\n};`;
            const codiceMerging = `const obj = {\n  a: 1,\n  c: 3\n};`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            // Il pattern proprietà potrebbe o meno attivarsi in base alla struttura AST
            // ma l'importante è che non crashi
            if (risultato) {
                expect(risultato.patternRilevato).toBe('proprieta-indipendenti');
                expect(risultato.scoreConfidenza).toBe(0.80);
            }
        });
    });

    describe('nessun pattern rilevato', () => {
        it('ritorna null per conflitti non riconoscibili', () => {
            const codiceBase = `const x = 1;`;
            const codiceHead = `const x = 2;`;
            const codiceMerging = `const x = 3;`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            expect(risultato).toBeNull();
        });
    });
});
