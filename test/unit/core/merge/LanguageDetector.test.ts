import { describe, it, expect } from 'vitest';
import {
    rilevaLinguaggioDaEstensione,
    linguaggioSupportatoDaTreeSitter,
} from '../../../../src/core/merge/LanguageDetector';

describe('LanguageDetector', () => {
    describe('rilevaLinguaggioDaEstensione', () => {
        it('rileva TypeScript da .ts', () => {
            expect(rilevaLinguaggioDaEstensione('file.ts')).toBe('typescript');
        });

        it('rileva TypeScript React da .tsx', () => {
            expect(rilevaLinguaggioDaEstensione('file.tsx')).toBe('typescriptreact');
        });

        it('rileva JavaScript da .js', () => {
            expect(rilevaLinguaggioDaEstensione('file.js')).toBe('javascript');
        });

        it('rileva JavaScript da .jsx', () => {
            expect(rilevaLinguaggioDaEstensione('file.jsx')).toBe('javascriptreact');
        });

        it('rileva C# da .cs', () => {
            expect(rilevaLinguaggioDaEstensione('file.cs')).toBe('csharp');
        });

        it('rileva Java da .java', () => {
            expect(rilevaLinguaggioDaEstensione('file.java')).toBe('java');
        });

        it('rileva Kotlin da .kt', () => {
            expect(rilevaLinguaggioDaEstensione('file.kt')).toBe('kotlin');
        });

        it('rileva Rust da .rs', () => {
            expect(rilevaLinguaggioDaEstensione('file.rs')).toBe('rust');
        });

        it('ritorna null per linguaggio non supportato', () => {
            expect(rilevaLinguaggioDaEstensione('file.py')).toBeNull();
        });

        it('rileva anche con percorso completo', () => {
            expect(rilevaLinguaggioDaEstensione('/path/to/file.ts')).toBe('typescript');
        });

        it('gestisce estensioni case-insensitive', () => {
            expect(rilevaLinguaggioDaEstensione('file.TS')).toBe('typescript');
        });
    });

    describe('linguaggioSupportatoDaTreeSitter', () => {
        it('conferma supporto per TypeScript', () => {
            expect(linguaggioSupportatoDaTreeSitter('typescript')).toBe(true);
        });

        it('conferma supporto per JavaScript', () => {
            expect(linguaggioSupportatoDaTreeSitter('javascript')).toBe(true);
        });

        it('conferma supporto per C#', () => {
            expect(linguaggioSupportatoDaTreeSitter('csharp')).toBe(true);
        });

        it('conferma supporto per Java', () => {
            expect(linguaggioSupportatoDaTreeSitter('java')).toBe(true);
        });

        it('conferma supporto per Rust', () => {
            expect(linguaggioSupportatoDaTreeSitter('rust')).toBe(true);
        });

        it('ritorna false per linguaggio non supportato', () => {
            expect(linguaggioSupportatoDaTreeSitter('python')).toBe(false);
        });

        it('ritorna false per Kotlin (WASM non disponibile)', () => {
            expect(linguaggioSupportatoDaTreeSitter('kotlin')).toBe(false);
        });
    });
});
