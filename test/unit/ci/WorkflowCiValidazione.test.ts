import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Test strutturale per il workflow CI GitHub Actions.
 * Verifica che il file .github/workflows/ci.yml contenga
 * i trigger, i job e gli step necessari per il CI automatico.
 *
 * Nota: si usa parsing testuale del YAML per evitare dipendenze aggiuntive.
 */
describe('WorkflowCiValidazione — Struttura del workflow CI', () => {
    const percorsoWorkflow = resolve(__dirname, '../../../.github/workflows/ci.yml');
    let contenutoWorkflow: string;

    beforeAll(() => {
        expect(existsSync(percorsoWorkflow)).toBe(true);
        contenutoWorkflow = readFileSync(percorsoWorkflow, 'utf-8');
    });

    describe('Trigger', () => {
        it('deve attivarsi su pull_request verso main', () => {
            expect(contenutoWorkflow).toContain('pull_request:');
            // Verifica che il branch main sia tra i target
            const sezionePullRequest = contenutoWorkflow.slice(
                contenutoWorkflow.indexOf('pull_request:'),
                contenutoWorkflow.indexOf('\n\n', contenutoWorkflow.indexOf('pull_request:'))
            );
            expect(sezionePullRequest).toContain('main');
        });

        it('deve attivarsi su push verso main', () => {
            expect(contenutoWorkflow).toContain('push:');
            const sezionePush = contenutoWorkflow.slice(
                contenutoWorkflow.indexOf('push:'),
                contenutoWorkflow.indexOf('pull_request:')
            );
            expect(sezionePush).toContain('main');
        });
    });

    describe('Job configuration', () => {
        it('deve avere un job di test', () => {
            expect(contenutoWorkflow).toContain('jobs:');
            expect(contenutoWorkflow).toContain('test:');
        });

        it('deve eseguire su ubuntu-latest', () => {
            expect(contenutoWorkflow).toContain('ubuntu-latest');
        });

        it('deve usare Node.js 20.x', () => {
            expect(contenutoWorkflow).toContain('20.x');
        });
    });

    describe('Step necessari', () => {
        it('deve includere checkout del repository', () => {
            expect(contenutoWorkflow).toContain('actions/checkout@v4');
        });

        it('deve includere setup di Node.js', () => {
            expect(contenutoWorkflow).toContain('actions/setup-node@v4');
        });

        it('deve configurare cache npm', () => {
            expect(contenutoWorkflow).toContain('cache: npm');
        });

        it('deve installare dipendenze con npm ci', () => {
            expect(contenutoWorkflow).toContain('npm ci');
        });

        it('deve eseguire il type-check TypeScript', () => {
            expect(contenutoWorkflow).toContain('npm run compile');
        });

        it('deve eseguire i test con coverage', () => {
            expect(contenutoWorkflow).toContain('npm run test:coverage');
        });
    });

    describe('Sicurezza e best practice', () => {
        it('deve specificare permissions restrittive', () => {
            expect(contenutoWorkflow).toContain('permissions:');
            expect(contenutoWorkflow).toContain('contents: read');
        });

        it('deve includere upload degli artefatti di coverage', () => {
            expect(contenutoWorkflow).toContain('actions/upload-artifact@v4');
            expect(contenutoWorkflow).toContain('coverage');
        });
    });
});
