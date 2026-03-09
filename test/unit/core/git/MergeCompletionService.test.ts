import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode before importing the service
vi.mock('vscode', () => ({
    workspace: {
        getWorkspaceFolder: vi.fn(),
    },
}));

// Mock simple-git
const mockAdd = vi.fn();
vi.mock('simple-git', () => ({
    simpleGit: vi.fn(() => ({
        add: mockAdd,
    })),
}));

// Mock ConflictDetector
vi.mock('../../../../src/core/git/ConflictDetector', () => ({
    hasConflictMarkers: vi.fn(),
}));

import * as vscode from 'vscode';
import { MergeCompletionService } from '../../../../src/core/git/MergeCompletionService';
import { hasConflictMarkers } from '../../../../src/core/git/ConflictDetector';

const mockedHasConflictMarkers = vi.mocked(hasConflictMarkers);
const mockedGetWorkspaceFolder = vi.mocked(vscode.workspace.getWorkspaceFolder);

interface MockDocument {
    uri: { fsPath: string; scheme: string };
    save: ReturnType<typeof vi.fn>;
    getText: () => string;
    fileName: string;
}

function creaMockDocument(opzioni: {
    contenuto?: string;
    percorso?: string;
    saveFallisce?: boolean;
    erroreDelSave?: string;
} = {}): MockDocument {
    const {
        contenuto = 'resolved content',
        percorso = '/workspace/project/src/file.ts',
        saveFallisce = false,
        erroreDelSave = 'Permission denied',
    } = opzioni;

    const mockSave = saveFallisce
        ? vi.fn().mockRejectedValue(new Error(erroreDelSave))
        : vi.fn().mockResolvedValue(true);

    return {
        uri: { fsPath: percorso, scheme: 'file' },
        save: mockSave,
        getText: () => contenuto,
        fileName: percorso,
    };
}

describe('MergeCompletionService', () => {
    let servizio: MergeCompletionService;

    beforeEach(() => {
        vi.clearAllMocks();
        servizio = new MergeCompletionService();

        // Default: no conflict markers, workspace folder found, git add succeeds
        mockedHasConflictMarkers.mockReturnValue(false);
        mockedGetWorkspaceFolder.mockReturnValue({
            uri: { fsPath: '/workspace/project' },
            name: 'project',
            index: 0,
        } as unknown as vscode.WorkspaceFolder);
        mockAdd.mockResolvedValue(undefined);
    });

    it('returns error when conflict markers remain in the file', async () => {
        mockedHasConflictMarkers.mockReturnValue(true);
        const documento = creaMockDocument();

        const risultato = await servizio.completaMerge(documento as unknown as vscode.TextDocument);

        expect(risultato.successo).toBe(false);
        expect(risultato.messaggioErrore).toContain('unresolved conflict markers');
        expect(documento.save).not.toHaveBeenCalled();
        expect(mockAdd).not.toHaveBeenCalled();
    });

    it('returns error when file is not inside a workspace folder', async () => {
        mockedGetWorkspaceFolder.mockReturnValue(undefined);
        const documento = creaMockDocument();

        const risultato = await servizio.completaMerge(documento as unknown as vscode.TextDocument);

        expect(risultato.successo).toBe(false);
        expect(risultato.messaggioErrore).toContain('not inside a workspace folder');
        expect(documento.save).not.toHaveBeenCalled();
    });

    it('saves document and runs git add successfully', async () => {
        const documento = creaMockDocument();

        const risultato = await servizio.completaMerge(documento as unknown as vscode.TextDocument);

        expect(risultato.successo).toBe(true);
        expect(risultato.messaggioErrore).toBeUndefined();
        expect(documento.save).toHaveBeenCalledOnce();
        expect(mockAdd).toHaveBeenCalledWith(documento.uri.fsPath);
    });

    it('returns error when document.save() fails', async () => {
        const documento = creaMockDocument({
            saveFallisce: true,
            erroreDelSave: 'Disk full',
        });

        const risultato = await servizio.completaMerge(documento as unknown as vscode.TextDocument);

        expect(risultato.successo).toBe(false);
        expect(risultato.messaggioErrore).toContain('Failed to save file');
        expect(risultato.messaggioErrore).toContain('Disk full');
        expect(mockAdd).not.toHaveBeenCalled();
    });

    it('returns error when git add fails but file was already saved', async () => {
        mockAdd.mockRejectedValue(new Error('fatal: not a git repository'));
        const documento = creaMockDocument();

        const risultato = await servizio.completaMerge(documento as unknown as vscode.TextDocument);

        expect(risultato.successo).toBe(false);
        expect(risultato.messaggioErrore).toContain('git add failed');
        expect(risultato.messaggioErrore).toContain('not a git repository');
        expect(risultato.messaggioErrore).toContain('saved to disk');
        // Verify save was called BEFORE the git add failure
        expect(documento.save).toHaveBeenCalledOnce();
    });

    it('calls save before git add (order guarantee for AC3)', async () => {
        const ordineChiamate: string[] = [];
        const documento = creaMockDocument();
        documento.save = vi.fn().mockImplementation(async () => {
            ordineChiamate.push('save');
            return true;
        });
        mockAdd.mockImplementation(async () => {
            ordineChiamate.push('gitAdd');
        });

        await servizio.completaMerge(documento as unknown as vscode.TextDocument);

        expect(ordineChiamate).toEqual(['save', 'gitAdd']);
    });

    it('does not modify the document when conflicts are present', async () => {
        mockedHasConflictMarkers.mockReturnValue(true);
        const documento = creaMockDocument();

        await servizio.completaMerge(documento as unknown as vscode.TextDocument);

        expect(documento.save).not.toHaveBeenCalled();
        expect(mockAdd).not.toHaveBeenCalled();
    });
});
