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
    extensionUri: { fsPath: '/mock-extension', scheme: 'file', toString: () => 'file:///mock-extension' },
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
        joinPath: (...parti: unknown[]) => ({
            fsPath: (parti as { fsPath?: string }[]).map(p => (typeof p === 'string' ? p : (p as { fsPath?: string }).fsPath || '')).join('/'),
            scheme: 'file',
            toString: () => 'file:///mock-monaco-path',
        }),
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
        asWebviewUri: (uri: unknown) => { toString: () => string };
        cspSource: string;
    };
    title: string;
} {
    return {
        webview: {
            html: '',
            options: {},
            postMessage: mockPostMessage,
            onDidReceiveMessage: mockOnDidReceiveMessage,
            asWebviewUri: () => ({ toString: () => 'https://file+.vscode-resource.vscode-cdn.net/mock-monaco' }),
            cspSource: 'https://file+.vscode-resource.vscode-cdn.net',
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
            expect(html).toContain("divHead.className = 'code-segment'");
            expect(html).toContain("divMerging.className = 'code-segment'");
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

describe('MergeEditorProvider — US-007: Monaco Editor nella colonna centrale', () => {
    let pannelloWebview: ReturnType<typeof creaMockWebviewPanel>;
    let documento: MockDocument;

    beforeEach(() => {
        vi.clearAllMocks();
        pannelloWebview = creaMockWebviewPanel();
        documento = creaMockDocument();
        mockWorkspaceState.get.mockReturnValue(undefined);
    });

    async function inizializzaEditor(): Promise<void> {
        const provider = new (MergeEditorProvider as unknown as {
            new (context: vscode.ExtensionContext): MergeEditorProvider;
        })(mockContext as unknown as vscode.ExtensionContext);

        await provider.resolveCustomTextEditor(
            documento as unknown as vscode.TextDocument,
            pannelloWebview as unknown as vscode.WebviewPanel,
            {} as vscode.CancellationToken
        );
    }

    describe('AC1: Monaco Editor funzionale con syntax highlighting', () => {
        it('loads Monaco AMD loader from the extension resources', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('vs/loader.js');
            expect(html).toContain('vscode-resource');
        });

        it('configures require.config with the Monaco base path', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("require.config");
            expect(html).toContain("paths: { 'vs':");
        });

        it('requires vs/editor/editor.main to load Monaco', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("require(['vs/editor/editor.main']");
        });

        it('creates Monaco editor with the detected language', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // The file is test-file.ts → language 'typescript'
            expect(html).toContain("var linguaggioId = 'typescript'");
        });

        it('creates Monaco editor using monaco.editor.create', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('monaco.editor.create');
        });

        it('detects dark/light theme from VS Code body classes', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('vscode-dark');
            expect(html).toContain("'vs-dark'");
            expect(html).toContain("'vs'");
        });
    });

    describe('AC2: cursore posizionabile e testo editabile', () => {
        it('creates Monaco editor with readOnly set to false', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('readOnly: false');
        });

        it('the Monaco container fills the entire result column', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="monacoEditorContainer"');
            // Container uses absolute positioning to fill parent
            expect(html).toContain('#monacoEditorContainer');
            expect(html).toMatch(/position:\s*absolute/);
        });

        it('enables automaticLayout for responsive resizing', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('automaticLayout: true');
        });
    });

    describe('AC3: nessuna latenza percettibile durante la digitazione', () => {
        it('disables minimap to reduce rendering overhead', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('minimap: { enabled: false }');
        });

        it('enables line numbers for code navigation', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("lineNumbers: 'on'");
        });

        it('uses blob workers to avoid blocking the main thread', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('MonacoEnvironment');
            expect(html).toContain('getWorkerUrl');
            expect(html).toContain('URL.createObjectURL');
        });
    });

    describe('CSP per Monaco Editor', () => {
        it('includes cspSource in script-src to allow loading Monaco files', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('vscode-resource.vscode-cdn.net');
            expect(html).toContain("script-src 'nonce-");
        });

        it('includes unsafe-eval for Monaco AMD require system', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("'unsafe-eval'");
        });

        it('includes font-src for Monaco codicons', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('font-src');
        });

        it('includes worker-src blob: for Monaco web workers', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('worker-src blob:');
        });
    });

    describe('Configurazione webview per risorse Monaco', () => {
        it('sets localResourceRoots to include Monaco editor directory', async () => {
            await inizializzaEditor();
            const opzioni = pannelloWebview.webview.options as {
                enableScripts?: boolean;
                localResourceRoots?: unknown[];
            };
            expect(opzioni.enableScripts).toBe(true);
            expect(opzioni.localResourceRoots).toBeDefined();
            expect(opzioni.localResourceRoots!.length).toBeGreaterThan(0);
        });
    });

    describe('Contenuto iniziale del result column', () => {
        it('builds initial result content with conflict placeholders', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // The JS function builds initial content with placeholders for conflicts
            expect(html).toContain('buildInitialResultContent');
            expect(html).toContain('Conflitto #');
            expect(html).toContain('irrisolto');
        });
    });

    describe('Rilevamento linguaggio dal nome file', () => {
        it('detects TypeScript for .ts files', async () => {
            documento = creaMockDocument();
            documento.fileName = '/workspace/app.ts';
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain("linguaggioId = 'typescript'");
        });

        it('detects JavaScript for .js files', async () => {
            documento = creaMockDocument();
            documento.fileName = '/workspace/app.js';
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain("linguaggioId = 'javascript'");
        });

        it('detects Python for .py files', async () => {
            documento = creaMockDocument();
            documento.fileName = '/workspace/app.py';
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain("linguaggioId = 'python'");
        });

        it('defaults to plaintext for unknown extensions', async () => {
            documento = creaMockDocument();
            documento.fileName = '/workspace/data.xyz';
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain("linguaggioId = 'plaintext'");
        });

        it('detects CSharp for .cs files', async () => {
            documento = creaMockDocument();
            documento.fileName = '/workspace/Program.cs';
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain("linguaggioId = 'csharp'");
        });

        it('detects Rust for .rs files', async () => {
            documento = creaMockDocument();
            documento.fileName = '/workspace/main.rs';
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain("linguaggioId = 'rust'");
        });
    });
});

describe('MergeEditorProvider — US-008: Applicazione chunk HEAD con >> e x', () => {
    let pannelloWebview: ReturnType<typeof creaMockWebviewPanel>;
    let documento: MockDocument;

    beforeEach(() => {
        vi.clearAllMocks();
        pannelloWebview = creaMockWebviewPanel();
        documento = creaMockDocument();
        mockWorkspaceState.get.mockReturnValue(undefined);
    });

    async function inizializzaEditor(): Promise<void> {
        const provider = new (MergeEditorProvider as unknown as {
            new (context: vscode.ExtensionContext): MergeEditorProvider;
        })(mockContext as unknown as vscode.ExtensionContext);

        await provider.resolveCustomTextEditor(
            documento as unknown as vscode.TextDocument,
            pannelloWebview as unknown as vscode.WebviewPanel,
            {} as vscode.CancellationToken
        );
    }

    describe('AC1: click su >> copia contenuto HEAD nella colonna centrale', () => {
        it('the HTML contains the >> apply button for HEAD conflicts', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("applyButtonHead.textContent = '>>'");
        });

        it('the apply button has a descriptive title attribute', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('Applica chunk HEAD nella colonna Result');
        });

        it('the applicaChunkHead function uses Monaco executeEdits to replace placeholder', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('applicaChunkHead');
            expect(html).toContain('executeEdits');
            expect(html).toContain('applica-chunk-head');
        });

        it('searches for the conflict placeholder pattern in Monaco model', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('findMatches');
            expect(html).toContain('Conflitto #');
            expect(html).toContain('irrisolto');
        });
    });

    describe('AC2: click su x scarta il chunk HEAD', () => {
        it('the HTML contains the x discard button for HEAD conflicts', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("discardButtonHead.textContent = 'x'");
        });

        it('the discard button has a descriptive title attribute', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('Scarta chunk HEAD');
        });

        it('the scartaChunkHead function marks the conflict as handled without modifying Monaco', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('scartaChunkHead');
            // Discard marks handled state
            expect(html).toContain('headGestito = true');
        });
    });

    describe('AC3: conflitto marcato visivamente come gestito', () => {
        it('the CSS includes a handled style class that dims the segment', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('conflict-segment-handled');
            expect(html).toContain('opacity: 0.35');
        });

        it('the marcaConflittoComeGestito function adds handled class to the segment', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('marcaConflittoComeGestito');
            expect(html).toContain("classList.add('conflict-segment-handled')");
        });

        it('handled segments hide action buttons via CSS', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('.conflict-segment-handled .conflict-action-button');
            expect(html).toContain('display: none');
        });

        it('each conflict segment has a data-conflict-index attribute for targeting', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('data-conflict-index');
            expect(html).toContain("setAttribute('data-conflict-index'");
        });
    });

    describe('Tracciamento dello stato dei conflitti', () => {
        it('initializes conflict state tracking object', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('statiConflitti');
            expect(html).toContain('headGestito: false');
            expect(html).toContain('mergingGestito: false');
        });

        it('uses IIFE closures to capture correct conflict index in button handlers', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // IIFE pattern for closure capture in loop
            expect(html).toContain('(function(idx, content)');
            expect(html).toContain('(function(idx)');
        });
    });

    describe('Struttura dei pulsanti azione', () => {
        it('action buttons are inside a conflict-action-bar container', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('conflict-action-bar');
            expect(html).toContain("actionBarHead.className = 'conflict-action-bar'");
        });

        it('action bar contains apply and discard buttons in order', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // Apply button added first, then discard
            expect(html).toContain('actionBarHead.appendChild(applyButtonHead)');
            expect(html).toContain('actionBarHead.appendChild(discardButtonHead)');
        });

        it('action bar is inserted before code content in the conflict segment', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('divHead.appendChild(actionBarHead)');
            // Code content added after action bar
            expect(html).toContain('divHead.appendChild(codeContent)');
        });
    });
});
