import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
    window: {
        showWarningMessage: vi.fn(),
        showTextDocument: vi.fn(),
    },
    commands: {
        executeCommand: vi.fn(),
    },
}));

import * as vscode from 'vscode';
import { FallbackService } from '../../../../src/core/git/FallbackService';

const mockShowWarningMessage = vi.mocked(vscode.window.showWarningMessage);
const mockExecuteCommand = vi.mocked(vscode.commands.executeCommand);
const mockShowTextDocument = vi.mocked(vscode.window.showTextDocument);

function creaUriMock(percorso: string = '/workspace/project/src/file.ts') {
    return { fsPath: percorso, scheme: 'file' } as any;
}

describe('FallbackService', () => {
    let servizio: FallbackService;

    beforeEach(() => {
        vi.clearAllMocks();
        servizio = new FallbackService();
        mockExecuteCommand.mockResolvedValue(undefined);
        mockShowTextDocument.mockResolvedValue(undefined as any);
    });

    it('shows a warning message with the error reason', async () => {
        const errore = new Error('WebviewPanel creation failed');

        await servizio.attivaFallbackPerDocumento(creaUriMock(), errore);

        expect(mockShowWarningMessage).toHaveBeenCalledOnce();
        expect(mockShowWarningMessage.mock.calls[0][0]).toContain('WebviewPanel creation failed');
        expect(mockShowWarningMessage.mock.calls[0][0]).toContain('Fallback');
    });

    it('opens the file in the default VS Code editor', async () => {
        const uri = creaUriMock('/workspace/file.ts');

        await servizio.attivaFallbackPerDocumento(uri, new Error('test'));

        expect(mockExecuteCommand).toHaveBeenCalledWith('vscode.openWith', uri, 'default');
    });

    it('returns result indicating fallback was activated', async () => {
        const risultato = await servizio.attivaFallbackPerDocumento(
            creaUriMock(),
            new Error('some error')
        );

        expect(risultato.fallbackAttivato).toBe(true);
        expect(risultato.motivoErrore).toBe('some error');
    });

    it('handles non-Error objects as error reason', async () => {
        const risultato = await servizio.attivaFallbackPerDocumento(
            creaUriMock(),
            'string error message'
        );

        expect(risultato.motivoErrore).toBe('string error message');
        expect(mockShowWarningMessage.mock.calls[0][0]).toContain('string error message');
    });

    it('falls back to showTextDocument if default editor command fails', async () => {
        mockExecuteCommand.mockRejectedValue(new Error('command not found'));
        const uri = creaUriMock();

        await servizio.attivaFallbackPerDocumento(uri, new Error('test'));

        expect(mockShowTextDocument).toHaveBeenCalledWith(uri);
    });

    it('does not throw if all fallback mechanisms fail', async () => {
        mockExecuteCommand.mockRejectedValue(new Error('fail1'));
        mockShowTextDocument.mockRejectedValue(new Error('fail2'));

        const risultato = await servizio.attivaFallbackPerDocumento(
            creaUriMock(),
            new Error('original error')
        );

        expect(risultato.fallbackAttivato).toBe(true);
        expect(risultato.motivoErrore).toBe('original error');
    });

    it('does not modify the original file during fallback', async () => {
        const uri = creaUriMock();

        await servizio.attivaFallbackPerDocumento(uri, new Error('test'));

        // Verify only read-like operations were performed (no save or write commands)
        const chiamateComandi = mockExecuteCommand.mock.calls.map(c => c[0]);
        expect(chiamateComandi).not.toContain('workbench.action.files.save');
    });
});
