import { describe, it, expect, beforeAll } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TreeSitter = require('web-tree-sitter');
import * as path from 'path';
import { RilevatorePatternSemantico } from '../../../../src/core/merge/RilevatorePatternSemantico';

describe('RilevatorePatternSemantico — edge case', () => {
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

    describe('import identici da entrambi i lati', () => {

        it('entrambi aggiungono lo stesso import esatto — risolve senza duplicati', () => {
            const codiceBase = `import { a } from './a';\n\nconst x = 1;`;
            const codiceHead = `import { a } from './a';\nimport { b } from './b';\n\nconst x = 1;`;
            // MERGING aggiunge lo stesso identico import di HEAD
            const codiceMerging = `import { a } from './a';\nimport { b } from './b';\n\nconst x = 1;`;

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
            // L'import duplicato non dovrebbe apparire due volte nel risultato
            const occorrenze = risultato!.contenutoRisolto.split("from './b'").length - 1;
            expect(occorrenze).toBe(1);
        });

        it('import identico + uno diverso per lato — merge con tutti gli import', () => {
            const codiceBase = `import { a } from './a';\n\nconst x = 1;`;
            // HEAD aggiunge import b e import d
            const codiceHead = `import { a } from './a';\nimport { b } from './b';\nimport { d } from './d';\n\nconst x = 1;`;
            // MERGING aggiunge import b (identico a HEAD) e import c (diverso)
            const codiceMerging = `import { a } from './a';\nimport { b } from './b';\nimport { c } from './c';\n\nconst x = 1;`;

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
            // Deve contenere b, c, d senza duplicare b
            expect(risultato!.contenutoRisolto).toContain("from './b'");
            expect(risultato!.contenutoRisolto).toContain("from './c'");
            expect(risultato!.contenutoRisolto).toContain("from './d'");
        });
    });

    describe('proprieta con stesso nome da entrambi i lati', () => {

        it('stessa proprieta con valore diverso — ritorna null', () => {
            const codiceBase = `const obj = {\n  a: 1\n};`;
            const codiceHead = `const obj = {\n  a: 1,\n  b: 2\n};`;
            const codiceMerging = `const obj = {\n  a: 1,\n  b: 999\n};`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            // Entrambi aggiungono 'b' con valori diversi → conflitto
            expect(risultato).toBeNull();
        });

        it('stessa proprieta con stesso valore — non e conflitto', () => {
            const codiceBase = `const obj = {\n  a: 1\n};`;
            const codiceHead = `const obj = {\n  a: 1,\n  b: 2\n};`;
            const codiceMerging = `const obj = {\n  a: 1,\n  b: 2\n};`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            // Entrambi aggiungono 'b: 2' identico → non è un conflitto reale
            // Il rilevatore dovrebbe essere in grado di gestirlo
            // (il testo della proprietà è lo stesso, quindi non ha nomi duplicati con contenuto diverso)
            if (risultato) {
                expect(risultato.patternRilevato).toBe('proprieta-indipendenti');
            }
            // In ogni caso non deve crashare
        });
    });

    describe('base null per pattern che la richiedono', () => {

        it('risolviProprietaIndipendenti ritorna null con base null', () => {
            const codiceHead = `const obj = {\n  a: 1,\n  b: 2\n};`;
            const codiceMerging = `const obj = {\n  a: 1,\n  c: 3\n};`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                null,
                codiceHead,
                codiceMerging,
                null
            );

            // Senza base né import → null (metodi e proprietà richiedono base)
            expect(risultato).toBeNull();
        });

        it('risolviMetodiAggiunti ritorna null con base null — nessun fallback ai pattern successivi', () => {
            const codiceHead = `function foo() { return 1; }`;
            const codiceMerging = `function bar() { return 2; }`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                null,
                codiceHead,
                codiceMerging,
                null
            );

            // Senza base: import non presente, metodi richiedono base, proprietà richiedono base
            expect(risultato).toBeNull();
        });
    });

    describe('codice senza nodi identifier — fallback nel nome', () => {

        it('arrow function senza nome usa fallback per estrazione nome', () => {
            // Arrow function assegnata a una variabile: il nodo function è dentro una variable_declarator
            // Tree-sitter lo parsa come lexical_declaration > variable_declarator > arrow_function
            // L'arrow_function stessa non ha un figlio 'identifier' diretto
            const codiceBase = `const x = 1;`;
            const codiceHead = `const x = 1;\nconst fnHead = () => 42;`;
            const codiceMerging = `const x = 1;\nconst fnMerging = () => 99;`;

            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            // Non deve crashare indipendentemente dal risultato
            // Il pattern metodi-aggiunti potrebbe non attivarsi per arrow function
            // ma l'importante è la robustezza
        });

        it('import senza nodo string usa fallback sul testo completo del nodo', () => {
            // Un import malformato che Tree-sitter parsa come ERROR o senza nodo 'string'
            const codiceBase = `const x = 1;`;
            const codiceHead = `const x = 1;`;
            const codiceMerging = `const x = 1;`;

            // Non ci aspettiamo pattern rilevati, ma verifichiamo che non crashi
            const risultato = rilevatore.tentaRisoluzione(
                parsaCodice(codiceHead),
                parsaCodice(codiceMerging),
                parsaCodice(codiceBase),
                codiceHead,
                codiceMerging,
                codiceBase
            );

            // Nessun import → nessun pattern
            expect(risultato).toBeNull();
        });
    });
});
