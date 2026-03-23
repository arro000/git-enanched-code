import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Test strutturale per il file CONTRIBUTING.md.
 * Verifica che il file esista nella root del progetto e contenga
 * le tre sezioni obbligatorie: setup locale, architettura moduli
 * e guida per aggiungere grammar Tree-sitter.
 */
describe('ContributingValidazione — Struttura del CONTRIBUTING.md', () => {
    const percorsoContributing = resolve(__dirname, '../../../CONTRIBUTING.md');
    let contenutoContributing: string;

    beforeAll(() => {
        expect(existsSync(percorsoContributing)).toBe(true);
        contenutoContributing = readFileSync(percorsoContributing, 'utf-8');
    });

    it('deve esistere e non essere vuoto', () => {
        expect(contenutoContributing.length).toBeGreaterThan(0);
    });

    describe('Sezione setup locale', () => {
        it('deve contenere la sezione setup locale', () => {
            expect(contenutoContributing).toContain('## Setup locale');
        });

        it('deve includere i prerequisiti Node.js e Git', () => {
            expect(contenutoContributing).toContain('Node.js');
            expect(contenutoContributing).toContain('Git');
        });

        it('deve includere i comandi npm principali', () => {
            expect(contenutoContributing).toContain('npm install');
            expect(contenutoContributing).toContain('npm test');
            expect(contenutoContributing).toContain('npm run build');
            expect(contenutoContributing).toContain('npm run compile');
        });

        it('deve spiegare come avviare in modalita sviluppo', () => {
            expect(contenutoContributing).toContain('npm run watch');
        });
    });

    describe('Sezione architettura moduli', () => {
        it('deve contenere la sezione architettura', () => {
            expect(contenutoContributing).toContain('## Architettura del progetto');
        });

        it('deve documentare il modulo core/git', () => {
            expect(contenutoContributing).toContain('core/git');
            expect(contenutoContributing).toContain('ConflictDetector');
            expect(contenutoContributing).toContain('ConflictParser');
            expect(contenutoContributing).toContain('MergeCompletionService');
            expect(contenutoContributing).toContain('FallbackService');
        });

        it('deve documentare il modulo core/merge', () => {
            expect(contenutoContributing).toContain('core/merge');
            expect(contenutoContributing).toContain('Diff3Resolver');
            expect(contenutoContributing).toContain('AnalizzatoreAstConflitti');
            expect(contenutoContributing).toContain('LanguageDetector');
        });

        it('deve documentare il modulo ui', () => {
            expect(contenutoContributing).toContain('MergeEditorProvider');
            expect(contenutoContributing).toContain('OnboardingWizardProvider');
            expect(contenutoContributing).toContain('webview');
        });

        it('deve documentare il modulo config', () => {
            expect(contenutoContributing).toContain('ConfigManager');
        });
    });

    describe('Sezione guida Tree-sitter', () => {
        it('deve contenere la sezione guida Tree-sitter', () => {
            expect(contenutoContributing).toContain('## Aggiungere una grammar Tree-sitter');
        });

        it('deve includere un esempio concreto di linguaggio', () => {
            // L'esempio usa Go come linguaggio dimostrativo
            expect(contenutoContributing).toMatch(/[Ee]sempio/);
            expect(contenutoContributing).toContain('tree-sitter-go');
        });

        it('deve spiegare le modifiche a LanguageDetector.ts', () => {
            expect(contenutoContributing).toContain('LanguageDetector.ts');
            expect(contenutoContributing).toContain('ESTENSIONE_A_LINGUAGGIO');
            expect(contenutoContributing).toContain('LINGUAGGI_CON_GRAMMAR');
        });

        it('deve spiegare le modifiche a AnalizzatoreAstConflitti.ts', () => {
            expect(contenutoContributing).toContain('AnalizzatoreAstConflitti.ts');
            expect(contenutoContributing).toContain('LINGUAGGI_SUPPORTATI');
        });

        it('deve includere la tabella dei linguaggi supportati', () => {
            expect(contenutoContributing).toContain('TypeScript');
            expect(contenutoContributing).toContain('JavaScript');
            expect(contenutoContributing).toContain('C#');
            expect(contenutoContributing).toContain('Java');
            expect(contenutoContributing).toContain('Kotlin');
            expect(contenutoContributing).toContain('Rust');
        });
    });
});
