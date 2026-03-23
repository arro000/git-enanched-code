import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Test strutturale per il workflow Publish GitHub Actions.
 * Verifica che il file .github/workflows/publish.yml contenga
 * i trigger, i job e gli step necessari per la pubblicazione
 * automatica su VS Code Marketplace e Open VSX Registry.
 *
 * Nota: si usa parsing testuale del YAML per evitare dipendenze aggiuntive.
 */
describe('WorkflowPublishValidazione — Struttura del workflow Publish', () => {
    const percorsoWorkflow = resolve(__dirname, '../../../.github/workflows/publish.yml');
    let contenutoWorkflow: string;

    beforeAll(() => {
        expect(existsSync(percorsoWorkflow)).toBe(true);
        contenutoWorkflow = readFileSync(percorsoWorkflow, 'utf-8');
    });

    describe('Trigger', () => {
        it('deve attivarsi su push di tag con pattern v*.*.*', () => {
            expect(contenutoWorkflow).toContain('push:');
            expect(contenutoWorkflow).toContain('tags:');
            expect(contenutoWorkflow).toContain('v*.*.*');
        });

        it('non deve attivarsi su pull_request', () => {
            expect(contenutoWorkflow).not.toContain('pull_request:');
        });
    });

    describe('Job configuration', () => {
        it('deve avere un job di pubblicazione', () => {
            expect(contenutoWorkflow).toContain('jobs:');
            expect(contenutoWorkflow).toContain('publish:');
        });

        it('deve eseguire su ubuntu-latest', () => {
            expect(contenutoWorkflow).toContain('ubuntu-latest');
        });

        it('deve usare Node.js 20.x', () => {
            expect(contenutoWorkflow).toContain('20.x');
        });
    });

    describe('Step di validazione (pipeline di guardia)', () => {
        it('deve includere checkout del repository', () => {
            expect(contenutoWorkflow).toContain('actions/checkout@v4');
        });

        it('deve includere setup di Node.js', () => {
            expect(contenutoWorkflow).toContain('actions/setup-node@v4');
        });

        it('deve installare dipendenze con npm ci', () => {
            expect(contenutoWorkflow).toContain('npm ci');
        });

        it('deve eseguire il type-check TypeScript', () => {
            expect(contenutoWorkflow).toContain('npm run compile');
        });

        it('deve eseguire i test prima della pubblicazione', () => {
            expect(contenutoWorkflow).toContain('npm test');
        });

        it('deve eseguire il build prima del packaging', () => {
            expect(contenutoWorkflow).toContain('npm run build');
        });

        it('deve creare il pacchetto .vsix', () => {
            expect(contenutoWorkflow).toContain('vsce package');
        });
    });

    describe('Step di pubblicazione', () => {
        it('deve pubblicare su VS Code Marketplace tramite vsce publish', () => {
            expect(contenutoWorkflow).toContain('vsce publish');
        });

        it('deve pubblicare su Open VSX Registry tramite ovsx publish', () => {
            expect(contenutoWorkflow).toContain('ovsx publish');
        });

        it('deve referenziare il segreto VSCE_PAT per il Marketplace', () => {
            expect(contenutoWorkflow).toContain('secrets.VSCE_PAT');
        });

        it('deve referenziare il segreto OVSX_PAT per Open VSX', () => {
            expect(contenutoWorkflow).toContain('secrets.OVSX_PAT');
        });
    });

    describe('Sicurezza e best practice', () => {
        it('deve specificare permissions restrittive', () => {
            expect(contenutoWorkflow).toContain('permissions:');
            expect(contenutoWorkflow).toContain('contents: read');
        });

        it('la pubblicazione vsce deve avvenire dopo il packaging', () => {
            const indicePacchetto = contenutoWorkflow.indexOf('vsce package');
            const indicePubblicazioneVsce = contenutoWorkflow.indexOf('vsce publish');
            expect(indicePacchetto).toBeLessThan(indicePubblicazioneVsce);
        });

        it('la pubblicazione ovsx deve avvenire dopo il packaging', () => {
            const indicePacchetto = contenutoWorkflow.indexOf('vsce package');
            const indicePubblicazioneOvsx = contenutoWorkflow.indexOf('ovsx publish');
            expect(indicePacchetto).toBeLessThan(indicePubblicazioneOvsx);
        });
    });

    describe('Documentazione segreti', () => {
        it('deve documentare il segreto VSCE_PAT nei commenti', () => {
            // Verifica che il file contenga istruzioni su come generare il token
            expect(contenutoWorkflow).toContain('VSCE_PAT');
            expect(contenutoWorkflow).toContain('REQUIRED SECRETS');
        });

        it('deve documentare il segreto OVSX_PAT nei commenti', () => {
            expect(contenutoWorkflow).toContain('OVSX_PAT');
            expect(contenutoWorkflow).toContain('open-vsx.org');
        });
    });
});
