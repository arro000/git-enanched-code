import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CoperturaSoglieValidazione — Configurazione coverage in vitest.config.ts', () => {
    const percorsoConfigVitest = resolve(__dirname, '../../../vitest.config.ts');
    const contenutoConfig = readFileSync(percorsoConfigVitest, 'utf-8');

    it('deve specificare v8 come provider di coverage', () => {
        expect(contenutoConfig).toContain("provider: 'v8'");
    });

    it('deve includere soglie di coverage per src/core/merge/**', () => {
        expect(contenutoConfig).toContain("'src/core/merge/**'");
    });

    it('deve includere soglie di coverage per src/core/git/**', () => {
        expect(contenutoConfig).toContain("'src/core/git/**'");
    });

    it('deve richiedere almeno il 70% di coverage su lines per core/merge', () => {
        // Verifica che nella sezione core/merge ci sia lines: 70
        const sezioneMerge = contenutoConfig.slice(
            contenutoConfig.indexOf("'src/core/merge/**'"),
            contenutoConfig.indexOf('},', contenutoConfig.indexOf("'src/core/merge/**'")) + 2
        );
        expect(sezioneMerge).toContain('lines: 70');
    });

    it('deve richiedere almeno il 70% di coverage su functions per core/merge', () => {
        const sezioneMerge = contenutoConfig.slice(
            contenutoConfig.indexOf("'src/core/merge/**'"),
            contenutoConfig.indexOf('},', contenutoConfig.indexOf("'src/core/merge/**'")) + 2
        );
        expect(sezioneMerge).toContain('functions: 70');
    });

    it('deve richiedere almeno il 70% di coverage su branches per core/merge', () => {
        const sezioneMerge = contenutoConfig.slice(
            contenutoConfig.indexOf("'src/core/merge/**'"),
            contenutoConfig.indexOf('},', contenutoConfig.indexOf("'src/core/merge/**'")) + 2
        );
        expect(sezioneMerge).toContain('branches: 70');
    });

    it('deve richiedere almeno il 70% di coverage su statements per core/merge', () => {
        const sezioneMerge = contenutoConfig.slice(
            contenutoConfig.indexOf("'src/core/merge/**'"),
            contenutoConfig.indexOf('},', contenutoConfig.indexOf("'src/core/merge/**'")) + 2
        );
        expect(sezioneMerge).toContain('statements: 70');
    });

    it('deve richiedere almeno il 70% di coverage su lines per core/git', () => {
        const sezioneGit = contenutoConfig.slice(
            contenutoConfig.indexOf("'src/core/git/**'"),
            contenutoConfig.indexOf('},', contenutoConfig.indexOf("'src/core/git/**'")) + 2
        );
        expect(sezioneGit).toContain('lines: 70');
    });

    it('deve richiedere almeno il 70% di coverage su functions per core/git', () => {
        const sezioneGit = contenutoConfig.slice(
            contenutoConfig.indexOf("'src/core/git/**'"),
            contenutoConfig.indexOf('},', contenutoConfig.indexOf("'src/core/git/**'")) + 2
        );
        expect(sezioneGit).toContain('functions: 70');
    });

    it('deve includere reporter text e lcov', () => {
        expect(contenutoConfig).toContain("'text'");
        expect(contenutoConfig).toContain("'lcov'");
    });
});
