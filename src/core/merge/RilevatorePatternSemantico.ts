import type * as Parser from 'web-tree-sitter';

/**
 * Risultato del rilevamento di un pattern semantico.
 */
export interface PatternSemanticoRilevato {
    patternRilevato: string;
    contenutoRisolto: string;
    scoreConfidenza: number;
}

/**
 * Servizio che analizza alberi AST per identificare pattern semanticamente
 * compatibili tra HEAD e MERGING, consentendo il merge automatico.
 *
 * Pattern supportati:
 * - Import indipendenti (confidenza 0.95)
 * - Funzioni/metodi aggiunti in scope diversi (confidenza 0.85)
 * - Proprietà oggetto/classe indipendenti (confidenza 0.80)
 */
export class RilevatorePatternSemantico {

    /**
     * Tenta di risolvere un conflitto analizzando i pattern semantici
     * negli alberi AST di HEAD e MERGING rispetto alla BASE.
     */
    tentaRisoluzione(
        astHead: Parser.Tree,
        astMerging: Parser.Tree,
        astBase: Parser.Tree | null,
        codiceHead: string,
        codiceMerging: string,
        codiceBase: string | null
    ): PatternSemanticoRilevato | null {
        // Prova i pattern in ordine di confidenza decrescente
        const risultato =
            this.risolviImportIndipendenti(astHead, astMerging, astBase, codiceHead, codiceMerging, codiceBase) ??
            this.risolviMetodiAggiunti(astHead, astMerging, astBase, codiceHead, codiceMerging, codiceBase) ??
            this.risolviProprietaIndipendenti(astHead, astMerging, astBase, codiceHead, codiceMerging, codiceBase);

        return risultato;
    }

    /**
     * Rileva import indipendenti aggiunti da entrambi i lati.
     * Confidenza: 0.95 (import sono dichiarazioni indipendenti per definizione)
     */
    private risolviImportIndipendenti(
        astHead: Parser.Tree,
        astMerging: Parser.Tree,
        astBase: Parser.Tree | null,
        codiceHead: string,
        codiceMerging: string,
        codiceBase: string | null
    ): PatternSemanticoRilevato | null {
        const importHead = this.estraiNodiPerTipo(astHead.rootNode, 'import_statement');
        const importMerging = this.estraiNodiPerTipo(astMerging.rootNode, 'import_statement');
        const importBase = astBase
            ? this.estraiNodiPerTipo(astBase.rootNode, 'import_statement')
            : [];

        const testiImportBase = new Set(importBase.map(n => n.text));
        const testiImportHead = new Set(importHead.map(n => n.text));
        const testiImportMerging = new Set(importMerging.map(n => n.text));

        // Import nuovi aggiunti da HEAD (non presenti nella base)
        const importNuoviHead = importHead.filter(n => !testiImportBase.has(n.text));
        // Import nuovi aggiunti da MERGING
        const importNuoviMerging = importMerging.filter(n => !testiImportBase.has(n.text));

        if (importNuoviHead.length === 0 && importNuoviMerging.length === 0) {
            return null;
        }

        // Verifica che non ci siano import identici aggiunti da entrambi (già gestiti)
        // e che non ci siano conflitti sugli stessi moduli
        const moduliHead = new Set(importNuoviHead.map(n => this.estraiModuloDaImport(n)));
        const moduliMerging = new Set(importNuoviMerging.map(n => this.estraiModuloDaImport(n)));

        // Se entrambi importano dallo stesso modulo con import diversi, è un conflitto reale
        for (const modulo of moduliHead) {
            if (moduliMerging.has(modulo)) {
                // Verifica se sono import diversi dallo stesso modulo
                const importHeadPerModulo = importNuoviHead.filter(n => this.estraiModuloDaImport(n) === modulo);
                const importMergingPerModulo = importNuoviMerging.filter(n => this.estraiModuloDaImport(n) === modulo);
                const testiH = importHeadPerModulo.map(n => n.text);
                const testiM = importMergingPerModulo.map(n => n.text);
                if (!testiH.every(t => testiM.includes(t)) || !testiM.every(t => testiH.includes(t))) {
                    return null; // Conflitto reale sullo stesso modulo
                }
            }
        }

        // Verifica che le modifiche siano SOLO import (nessuna altra modifica al codice)
        const nodiNonImportHead = this.estraiNodiTopLevel(astHead.rootNode)
            .filter(n => n.type !== 'import_statement');
        const nodiNonImportMerging = this.estraiNodiTopLevel(astMerging.rootNode)
            .filter(n => n.type !== 'import_statement');
        const nodiNonImportBase = astBase
            ? this.estraiNodiTopLevel(astBase.rootNode).filter(n => n.type !== 'import_statement')
            : [];

        const testiNonImportHead = nodiNonImportHead.map(n => n.text).join('\n');
        const testiNonImportMerging = nodiNonImportMerging.map(n => n.text).join('\n');
        const testiNonImportBase = nodiNonImportBase.map(n => n.text).join('\n');

        // Se il codice non-import differisce tra HEAD/MERGING e BASE, non possiamo risolvere solo gli import
        const headHaAltreCambiamenti = testiNonImportHead !== testiNonImportBase;
        const mergingHaAltreCambiamenti = testiNonImportMerging !== testiNonImportBase;

        if (headHaAltreCambiamenti && mergingHaAltreCambiamenti) {
            return null; // Entrambi hanno modifiche non-import, conflitto reale
        }

        // Costruisci il risultato: tutti gli import (base + nuovi HEAD + nuovi MERGING)
        const tuttiImport = new Set<string>();
        for (const testo of testiImportBase) tuttiImport.add(testo);
        for (const n of importNuoviHead) tuttiImport.add(n.text);
        for (const n of importNuoviMerging) tuttiImport.add(n.text);

        // Prendi la parte non-import dal lato che ha modificato, o dalla base
        const parteNonImport = headHaAltreCambiamenti
            ? testiNonImportHead
            : mergingHaAltreCambiamenti
                ? testiNonImportMerging
                : testiNonImportBase;

        const righeImport = Array.from(tuttiImport);
        const contenutoRisolto = parteNonImport
            ? righeImport.join('\n') + '\n' + parteNonImport
            : righeImport.join('\n');

        return {
            patternRilevato: 'import-indipendenti',
            contenutoRisolto,
            scoreConfidenza: 0.95,
        };
    }

    /**
     * Rileva funzioni o metodi aggiunti da entrambi i lati in scope diversi.
     * Confidenza: 0.85
     */
    private risolviMetodiAggiunti(
        astHead: Parser.Tree,
        astMerging: Parser.Tree,
        astBase: Parser.Tree | null,
        codiceHead: string,
        codiceMerging: string,
        codiceBase: string | null
    ): PatternSemanticoRilevato | null {
        if (!astBase || !codiceBase) return null;

        const tipiDichiarazioneFunzione = [
            'function_declaration',
            'method_definition',
            'arrow_function',
            'function_expression',
        ];

        const funzioniBase = this.estraiDichiarazioniFunzione(astBase.rootNode, tipiDichiarazioneFunzione);
        const funzioniHead = this.estraiDichiarazioniFunzione(astHead.rootNode, tipiDichiarazioneFunzione);
        const funzioniMerging = this.estraiDichiarazioniFunzione(astMerging.rootNode, tipiDichiarazioneFunzione);

        const nomiFunzioniBase = new Set(funzioniBase.map(n => this.estraiNomeFunzione(n)));

        // Funzioni nuove aggiunte da HEAD
        const funzioniNuoveHead = funzioniHead.filter(n =>
            !nomiFunzioniBase.has(this.estraiNomeFunzione(n))
        );
        // Funzioni nuove aggiunte da MERGING
        const funzioniNuoveMerging = funzioniMerging.filter(n =>
            !nomiFunzioniBase.has(this.estraiNomeFunzione(n))
        );

        if (funzioniNuoveHead.length === 0 && funzioniNuoveMerging.length === 0) {
            return null;
        }

        // Verifica che non ci siano funzioni con lo stesso nome aggiunte da entrambi
        const nomiNuoviHead = new Set(funzioniNuoveHead.map(n => this.estraiNomeFunzione(n)));
        const nomiNuoviMerging = new Set(funzioniNuoveMerging.map(n => this.estraiNomeFunzione(n)));

        for (const nome of nomiNuoviHead) {
            if (nomiNuoviMerging.has(nome)) {
                return null; // Stesso nome di funzione da entrambi i lati
            }
        }

        // Verifica che le funzioni preesistenti non siano state modificate in modo diverso
        const funzioniEsistentiHead = funzioniHead.filter(n =>
            nomiFunzioniBase.has(this.estraiNomeFunzione(n))
        );
        const funzioniEsistentiMerging = funzioniMerging.filter(n =>
            nomiFunzioniBase.has(this.estraiNomeFunzione(n))
        );

        for (const funzBase of funzioniBase) {
            const nomeBase = this.estraiNomeFunzione(funzBase);
            const funzHead = funzioniEsistentiHead.find(n => this.estraiNomeFunzione(n) === nomeBase);
            const funzMerging = funzioniEsistentiMerging.find(n => this.estraiNomeFunzione(n) === nomeBase);

            if (funzHead && funzMerging) {
                const headModificata = funzHead.text !== funzBase.text;
                const mergingModificata = funzMerging.text !== funzBase.text;
                if (headModificata && mergingModificata) {
                    return null; // Entrambi modificano la stessa funzione
                }
            }
        }

        // Costruisci il risultato: prendi HEAD come base e aggiungi le funzioni nuove di MERGING
        const righeHead = codiceHead.split('\n');
        const blocchiNuoviMerging = funzioniNuoveMerging.map(n => n.text);

        const contenutoRisolto = righeHead.join('\n') +
            (blocchiNuoviMerging.length > 0 ? '\n\n' + blocchiNuoviMerging.join('\n\n') : '');

        return {
            patternRilevato: 'metodi-aggiunti',
            contenutoRisolto,
            scoreConfidenza: 0.85,
        };
    }

    /**
     * Rileva proprietà indipendenti aggiunte da entrambi i lati.
     * Confidenza: 0.80
     */
    private risolviProprietaIndipendenti(
        astHead: Parser.Tree,
        astMerging: Parser.Tree,
        astBase: Parser.Tree | null,
        codiceHead: string,
        codiceMerging: string,
        codiceBase: string | null
    ): PatternSemanticoRilevato | null {
        if (!astBase || !codiceBase) return null;

        const tipiProprieta = [
            'property_signature',
            'public_field_definition',
            'property_declaration',
            'pair',
        ];

        const proprietaBase = this.estraiNodiRicorsivi(astBase.rootNode, tipiProprieta);
        const proprietaHead = this.estraiNodiRicorsivi(astHead.rootNode, tipiProprieta);
        const proprietaMerging = this.estraiNodiRicorsivi(astMerging.rootNode, tipiProprieta);

        const testiProprietaBase = new Set(proprietaBase.map(n => n.text.trim()));

        const proprietaNuoveHead = proprietaHead.filter(n => !testiProprietaBase.has(n.text.trim()));
        const proprietaNuoveMerging = proprietaMerging.filter(n => !testiProprietaBase.has(n.text.trim()));

        if (proprietaNuoveHead.length === 0 && proprietaNuoveMerging.length === 0) {
            return null;
        }

        // Verifica nessuna proprietà con lo stesso nome da entrambi i lati
        const nomiHead = new Set(proprietaNuoveHead.map(n => this.estraiNomeProprieta(n)));
        const nomiMerging = new Set(proprietaNuoveMerging.map(n => this.estraiNomeProprieta(n)));

        for (const nome of nomiHead) {
            if (nomiMerging.has(nome)) {
                return null; // Stessa proprietà da entrambi
            }
        }

        // Costruisci risultato: prendi HEAD e aggiungi proprietà nuove di MERGING
        const righeHead = codiceHead.split('\n');
        const blocchiNuoviMerging = proprietaNuoveMerging.map(n => n.text);

        const contenutoRisolto = righeHead.join('\n') +
            (blocchiNuoviMerging.length > 0 ? '\n' + blocchiNuoviMerging.join('\n') : '');

        return {
            patternRilevato: 'proprieta-indipendenti',
            contenutoRisolto,
            scoreConfidenza: 0.80,
        };
    }

    /**
     * Estrae nodi di un certo tipo dal livello top dell'albero.
     */
    private estraiNodiPerTipo(nodoRadice: Parser.SyntaxNode, tipo: string): Parser.SyntaxNode[] {
        const risultato: Parser.SyntaxNode[] = [];
        for (let i = 0; i < nodoRadice.childCount; i++) {
            const figlio = nodoRadice.child(i);
            if (figlio && figlio.type === tipo) {
                risultato.push(figlio);
            }
        }
        return risultato;
    }

    /**
     * Estrae tutti i nodi top-level dell'albero (esclusi commenti e spazi).
     */
    private estraiNodiTopLevel(nodoRadice: Parser.SyntaxNode): Parser.SyntaxNode[] {
        const risultato: Parser.SyntaxNode[] = [];
        for (let i = 0; i < nodoRadice.childCount; i++) {
            const figlio = nodoRadice.child(i);
            if (figlio && figlio.type !== 'comment' && figlio.text.trim() !== '') {
                risultato.push(figlio);
            }
        }
        return risultato;
    }

    /**
     * Estrae dichiarazioni di funzione dall'albero (ricorsivamente).
     */
    private estraiDichiarazioniFunzione(
        nodoRadice: Parser.SyntaxNode,
        tipi: string[]
    ): Parser.SyntaxNode[] {
        const risultato: Parser.SyntaxNode[] = [];
        this.visitaRicorsiva(nodoRadice, (nodo) => {
            if (tipi.includes(nodo.type)) {
                risultato.push(nodo);
                return false; // Non scendere nei figli
            }
            return true;
        });
        return risultato;
    }

    /**
     * Estrae nodi ricorsivamente per tipo.
     */
    private estraiNodiRicorsivi(
        nodoRadice: Parser.SyntaxNode,
        tipi: string[]
    ): Parser.SyntaxNode[] {
        const risultato: Parser.SyntaxNode[] = [];
        this.visitaRicorsiva(nodoRadice, (nodo) => {
            if (tipi.includes(nodo.type)) {
                risultato.push(nodo);
            }
            return true;
        });
        return risultato;
    }

    /**
     * Visita ricorsiva dell'albero AST.
     */
    private visitaRicorsiva(
        nodo: Parser.SyntaxNode,
        callback: (nodo: Parser.SyntaxNode) => boolean
    ): void {
        const continua = callback(nodo);
        if (continua) {
            for (let i = 0; i < nodo.childCount; i++) {
                const figlio = nodo.child(i);
                if (figlio) {
                    this.visitaRicorsiva(figlio, callback);
                }
            }
        }
    }

    /**
     * Estrae il percorso del modulo da un nodo import_statement.
     */
    private estraiModuloDaImport(nodo: Parser.SyntaxNode): string {
        // Cerca il nodo 'string' figlio che contiene il percorso del modulo
        for (let i = 0; i < nodo.childCount; i++) {
            const figlio = nodo.child(i);
            if (figlio && figlio.type === 'string') {
                return figlio.text;
            }
        }
        return nodo.text;
    }

    /**
     * Estrae il nome da una dichiarazione di funzione.
     */
    private estraiNomeFunzione(nodo: Parser.SyntaxNode): string {
        // Cerca il nodo 'identifier' o 'property_identifier' figlio
        for (let i = 0; i < nodo.childCount; i++) {
            const figlio = nodo.child(i);
            if (figlio && (figlio.type === 'identifier' || figlio.type === 'property_identifier')) {
                return figlio.text;
            }
        }
        return nodo.text.substring(0, 50);
    }

    /**
     * Estrae il nome da un nodo proprietà.
     */
    private estraiNomeProprieta(nodo: Parser.SyntaxNode): string {
        for (let i = 0; i < nodo.childCount; i++) {
            const figlio = nodo.child(i);
            if (figlio && (figlio.type === 'property_identifier' || figlio.type === 'identifier')) {
                return figlio.text;
            }
        }
        return nodo.text.substring(0, 50);
    }
}
