import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode
const mockPostMessage = vi.fn();
const mockOnDidReceiveMessage = vi.fn();
const mockWorkspaceState = {
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockReturnValue([]),
    setKeysForSync: vi.fn(),
};
const mockContext = {
    workspaceState: mockWorkspaceState,
    subscriptions: [],
};

vi.mock('vscode', () => ({
    window: {
        showInformationMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        registerCustomEditorProvider: vi.fn(),
    },
    workspace: {
        getWorkspaceFolder: vi.fn(),
    },
    commands: {
        executeCommand: vi.fn(),
    },
    Uri: {
        file: (percorso: string) => ({ fsPath: percorso, scheme: 'file', toString: () => percorso }),
    },
}));

// Mock simple-git (required by MergeCompletionService)
vi.mock('simple-git', () => ({
    simpleGit: vi.fn(() => ({
        add: vi.fn(),
    })),
}));

// Mock ConflictDetector
vi.mock('../../../src/core/git/ConflictDetector', () => ({
    hasConflictMarkers: vi.fn().mockReturnValue(false),
    countConflicts: vi.fn().mockReturnValue(2),
}));

// Mock ConflictParser
vi.mock('../../../src/core/git/ConflictParser', () => ({
    parseConflicts: vi.fn().mockReturnValue([
        {
            index: 0,
            startLine: 2,
            endLine: 8,
            head: 'const x = 1;',
            base: null,
            merging: 'const x = 2;',
        },
        {
            index: 1,
            startLine: 12,
            endLine: 18,
            head: 'function foo() {}',
            base: 'function foo() { return; }',
            merging: 'function bar() {}',
        },
    ]),
}));

import { MergeEditorProvider } from '../../../src/ui/MergeEditorProvider';
import { MergeSessionStateManager } from '../../../src/core/merge/MergeSessionStateManager';
import * as vscode from 'vscode';

interface MockDocument {
    uri: { fsPath: string; scheme: string; toString: () => string };
    getText: () => string;
    fileName: string;
    save: ReturnType<typeof vi.fn>;
}

function creaMockDocument(contenuto?: string): MockDocument {
    const testo = contenuto || 'line 0\nline 1\n<<<<<<< HEAD\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> branch\nline 7\nline 8';
    return {
        uri: {
            fsPath: '/workspace/test-file.ts',
            scheme: 'file',
            toString: () => '/workspace/test-file.ts',
        },
        getText: () => testo,
        fileName: '/workspace/test-file.ts',
        save: vi.fn().mockResolvedValue(true),
    };
}

function creaMockWebviewPanel(): {
    webview: {
        html: string;
        options: Record<string, unknown>;
        postMessage: typeof mockPostMessage;
        onDidReceiveMessage: typeof mockOnDidReceiveMessage;
    };
    title: string;
} {
    return {
        webview: {
            html: '',
            options: {},
            postMessage: mockPostMessage,
            onDidReceiveMessage: mockOnDidReceiveMessage,
        },
        title: '',
    };
}

describe('MergeEditorProvider — US-006: Layout 3 colonne', () => {
    let pannelloWebview: ReturnType<typeof creaMockWebviewPanel>;
    let documento: MockDocument;

    beforeEach(() => {
        vi.clearAllMocks();
        pannelloWebview = creaMockWebviewPanel();
        documento = creaMockDocument();
        mockWorkspaceState.get.mockReturnValue(undefined);
    });

    async function inizializzaEditor(): Promise<void> {
        const disposable = MergeEditorProvider.register(
            mockContext as unknown as vscode.ExtensionContext
        );
        // The register call returns a disposable, but we need the provider instance.
        // Instead, create provider via register and test through resolveCustomTextEditor
        const provider = new (MergeEditorProvider as unknown as {
            new (context: vscode.ExtensionContext): MergeEditorProvider;
        })(mockContext as unknown as vscode.ExtensionContext);

        await provider.resolveCustomTextEditor(
            documento as unknown as vscode.TextDocument,
            pannelloWebview as unknown as vscode.WebviewPanel,
            {} as vscode.CancellationToken
        );
    }

    describe('AC1: 3 colonne affiancate con label corrette', () => {
        it('the HTML contains the label "HEAD / Il tuo codice" for the left column', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('HEAD / Il tuo codice');
        });

        it('the HTML contains the label "Result" for the center column', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('>Result<');
        });

        it('the HTML contains the label "MERGING / Codice in arrivo" for the right column', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('MERGING / Codice in arrivo');
        });

        it('the HTML contains all three column containers', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="columnHead"');
            expect(html).toContain('id="columnResult"');
            expect(html).toContain('id="columnMerging"');
        });

        it('the HTML uses CSS grid with 3 equal columns and separators', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('grid-template-columns: 1fr 1px 1fr 1px 1fr');
        });

        it('the columns are visually separated with separator elements', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('column-separator');
            expect(html).toContain('header-separator');
        });
    });

    describe('AC2: colonne sinistra e destra in read-only', () => {
        it('the left and right columns do not contain editable elements (textarea, contenteditable)', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // The columns render code segments as plain divs with textContent (set by JS)
            // No textarea or contenteditable in the static HTML
            expect(html).not.toContain('contenteditable="true"');
            expect(html).not.toContain('<textarea');
        });

        it('the side columns use code-segment class for display-only rendering', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // The JS renders segments using div elements with code-segment class and textContent
            expect(html).toContain("div.className = 'code-segment'");
        });
    });

    describe('AC3: nessun overflow orizzontale su schermi >= 1280px', () => {
        it('the body has overflow hidden to prevent page-level horizontal scroll', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('overflow: hidden');
        });

        it('the columns container uses grid layout that fills available space', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('flex: 1');
            expect(html).toContain('min-height: 0');
        });

        it('the body uses flexbox column layout with 100vh height', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('height: 100vh');
            expect(html).toContain('flex-direction: column');
        });
    });

    describe('Invio dati dei conflitti alla webview', () => {
        it('sends conflict data when webview signals ready', async () => {
            await inizializzaEditor();

            // Get the message handler registered via onDidReceiveMessage
            expect(mockOnDidReceiveMessage).toHaveBeenCalledOnce();
            const gestoreMessaggi = mockOnDidReceiveMessage.mock.calls[0][0];

            // Simulate webview sending 'webviewPronta'
            await gestoreMessaggi({ command: 'webviewPronta' });

            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'inizializzaLayout',
                    righe: expect.any(Array),
                    conflitti: expect.any(Array),
                })
            );
        });

        it('sends conflict data with correct structure', async () => {
            await inizializzaEditor();
            const gestoreMessaggi = mockOnDidReceiveMessage.mock.calls[0][0];
            await gestoreMessaggi({ command: 'webviewPronta' });

            const chiamataInizializzazione = mockPostMessage.mock.calls.find(
                (call: unknown[]) => (call[0] as { command: string }).command === 'inizializzaLayout'
            );
            expect(chiamataInizializzazione).toBeDefined();

            const datiLayout = chiamataInizializzazione![0] as {
                command: string;
                righe: string[];
                conflitti: Array<{
                    index: number;
                    startLine: number;
                    endLine: number;
                    head: string;
                    merging: string;
                }>;
            };
            expect(datiLayout.conflitti).toHaveLength(2);
            expect(datiLayout.conflitti[0].head).toBe('const x = 1;');
            expect(datiLayout.conflitti[0].merging).toBe('const x = 2;');
            expect(datiLayout.conflitti[1].head).toBe('function foo() {}');
            expect(datiLayout.conflitti[1].merging).toBe('function bar() {}');
        });

        it('sends document lines as an array split by newline', async () => {
            await inizializzaEditor();
            const gestoreMessaggi = mockOnDidReceiveMessage.mock.calls[0][0];
            await gestoreMessaggi({ command: 'webviewPronta' });

            const chiamataInizializzazione = mockPostMessage.mock.calls.find(
                (call: unknown[]) => (call[0] as { command: string }).command === 'inizializzaLayout'
            );
            const datiLayout = chiamataInizializzazione![0] as { righe: string[] };
            expect(Array.isArray(datiLayout.righe)).toBe(true);
            expect(datiLayout.righe[0]).toBe('line 0');
        });
    });

    describe('Struttura HTML generale', () => {
        it('includes Content Security Policy with nonce', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('Content-Security-Policy');
            expect(html).toContain("script-src 'nonce-");
        });

        it('includes the sanitized file name in the toolbar', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('test-file.ts');
        });

        it('includes the Complete Merge button', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('completeMergeButton');
            expect(html).toContain('Complete Merge');
        });

        it('uses VS Code theme CSS variables for styling', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('--vscode-foreground');
            expect(html).toContain('--vscode-editor-background');
            expect(html).toContain('--vscode-button-background');
        });

        it('uses monospace font for code segments', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('--vscode-editor-font-family');
        });

        it('uses VS Code merge editor colors for conflict highlights', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('--vscode-merge-currentContentBackground');
            expect(html).toContain('--vscode-merge-incomingContentBackground');
        });
    });

    describe('Compatibilità con US-005 (persistenza stato)', () => {
        it('sends restored state after layout initialization if state exists', async () => {
            // Compute the correct hash for the document content so recuperaStato validates it
            const stateManager = new MergeSessionStateManager(mockWorkspaceState as unknown as vscode.Memento);
            const contenutoDocumento = documento.getText();
            const hashCorretto = stateManager.calcolaHashContenuto(contenutoDocumento);

            const statoSalvato = {
                percorsoFile: '/workspace/test-file.ts',
                hashContenutoOriginale: hashCorretto,
                statiConflitti: [],
                contenutoColonnaCentrale: 'restored content',
                ultimoAggiornamento: Date.now(),
            };
            mockWorkspaceState.get.mockReturnValue(statoSalvato);

            await inizializzaEditor();
            const gestoreMessaggi = mockOnDidReceiveMessage.mock.calls[0][0];
            await gestoreMessaggi({ command: 'webviewPronta' });

            const chiamatePostMessage = mockPostMessage.mock.calls.map(
                (call: unknown[]) => (call[0] as { command: string }).command
            );
            expect(chiamatePostMessage).toContain('inizializzaLayout');
            expect(chiamatePostMessage).toContain('statoRipristinato');

            // Layout initialization should come before state restoration
            const indiceLayout = chiamatePostMessage.indexOf('inizializzaLayout');
            const indiceStato = chiamatePostMessage.indexOf('statoRipristinato');
            expect(indiceLayout).toBeLessThan(indiceStato);
        });

        it('does not send restored state if no previous state exists', async () => {
            mockWorkspaceState.get.mockReturnValue(undefined);

            await inizializzaEditor();
            const gestoreMessaggi = mockOnDidReceiveMessage.mock.calls[0][0];
            await gestoreMessaggi({ command: 'webviewPronta' });

            const chiamatePostMessage = mockPostMessage.mock.calls.map(
                (call: unknown[]) => (call[0] as { command: string }).command
            );
            expect(chiamatePostMessage).toContain('inizializzaLayout');
            expect(chiamatePostMessage).not.toContain('statoRipristinato');
        });
    });
});
