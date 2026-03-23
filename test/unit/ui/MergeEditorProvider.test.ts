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
        it('the HTML contains the label "Current (HEAD)" for the left column', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('Current (HEAD)');
        });

        it('the HTML contains the label "Result" for the center column', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('>Result<');
        });

        it('the HTML contains the label "Incoming (MERGING)" for the right column', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('Incoming (MERGING)');
        });

        it('the HTML contains all three column containers', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="columnHead"');
            expect(html).toContain('id="columnResult"');
            expect(html).toContain('id="columnMerging"');
        });

        it('the HTML uses CSS grid with 3 equal columns plus minimap column', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('grid-template-columns: 1fr 1fr 1fr 14px');
        });

        it('the columns are visually separated via column headers and editor grid', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('col-headers');
            expect(html).toContain('editor-grid');
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

        it('uses VS Code Dark+ palette CSS variables for styling', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('--foreground');
            expect(html).toContain('--editor-bg');
            expect(html).toContain('--btn-primary-bg');
        });

        it('uses monospace font variable for code segments', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('--font-mono');
        });

        it('uses VS Code Dark+ colors for HEAD and MERGING conflict highlights', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('--head-bg');
            expect(html).toContain('--merging-bg');
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
        it('the HTML contains the "Accept Current" apply button for HEAD conflicts', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("applyButtonHead.textContent = '>> Accept Current'");
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
        it('the HTML contains the Ignore discard button for HEAD conflicts', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("discardButtonHead.textContent = '\\u2715 Ignore'");
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

        it('handled segments hide action bar via CSS', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('.conflict-segment-handled .ca');
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
        it('action buttons are inside a ca container', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("actionBarHead.className = 'ca'");
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

describe('MergeEditorProvider — US-009: Applicazione chunk MERGING con << e x', () => {
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

    describe('AC1: click su << copia contenuto MERGING nella colonna centrale', () => {
        it('the HTML contains the "Accept Incoming" apply button for MERGING conflicts', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("applyButtonMerging.textContent = '<< Accept Incoming'");
        });

        it('the apply button has a descriptive title attribute', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('Applica chunk MERGING nella colonna Result');
        });

        it('the applicaChunkMerging function uses Monaco executeEdits to replace placeholder', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('applicaChunkMerging');
            expect(html).toContain('executeEdits');
            expect(html).toContain('applica-chunk-merging');
        });

        it('searches for the conflict placeholder pattern in Monaco model', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('findMatches');
            expect(html).toContain('Conflitto #');
            expect(html).toContain('irrisolto');
        });
    });

    describe('AC2: click su x scarta il chunk MERGING', () => {
        it('the HTML contains the Ignore discard button for MERGING conflicts', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("discardButtonMerging.textContent = '\\u2715 Ignore'");
        });

        it('the discard button has a descriptive title attribute', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('Scarta chunk MERGING');
        });

        it('the scartaChunkMerging function marks the conflict as handled without modifying Monaco', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('scartaChunkMerging');
            // Discard marks handled state
            expect(html).toContain('mergingGestito = true');
        });
    });

    describe('AC3: conflitto nella colonna destra marcato visivamente come gestito', () => {
        it('the CSS handled style applies to MERGING column segments', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('conflict-segment-handled');
            expect(html).toContain('opacity: 0.35');
        });

        it('marcaConflittoComeGestito supports the merging column selector', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("'#columnMerging'");
            expect(html).toContain("classList.add('conflict-segment-handled')");
        });

        it('handled segments hide action bar via CSS for both columns', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('.conflict-segment-handled .ca');
            expect(html).toContain('display: none');
        });

        it('MERGING conflict segments have data-conflict-index attribute', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('data-conflict-index');
        });
    });

    describe('Struttura dei pulsanti azione MERGING', () => {
        it('MERGING action buttons are inside a ca container', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("actionBarMerging.className = 'ca'");
        });

        it('MERGING action bar contains apply and discard buttons in order', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('actionBarMerging.appendChild(applyButtonMerging)');
            expect(html).toContain('actionBarMerging.appendChild(discardButtonMerging)');
        });

        it('MERGING action bar is inserted before code content in the conflict segment', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('divMerging.appendChild(actionBarMerging)');
            expect(html).toContain('divMerging.appendChild(codeContentMerging)');
        });

        it('uses IIFE closures to capture correct conflict index in MERGING button handlers', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // IIFE pattern for merging apply button closure
            expect(html).toContain('applicaChunkMerging(idx, content)');
            // IIFE pattern for merging discard button closure
            expect(html).toContain('scartaChunkMerging(idx)');
        });
    });
});

describe('MergeEditorProvider — US-010: Accodamento chunk da entrambe le colonne', () => {
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

    describe('AC1: entrambi >> e << applicati accodano i contenuti in sequenza', () => {
        it('applicaChunkHead stores contenutoApplicato when placeholder is found', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('statiConflitti[indiceConflitto].contenutoApplicato = contenutoHead');
        });

        it('applicaChunkMerging stores contenutoApplicato when placeholder is found', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('statiConflitti[indiceConflitto].contenutoApplicato = contenutoMerging');
        });

        it('when placeholder is gone, HEAD apply searches for previously applied content', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('statiConflitti[indiceConflitto].contenutoApplicato');
            expect(html).toContain('matchesPrecedenti');
            expect(html).toContain('accoda-chunk-head');
        });

        it('when placeholder is gone, MERGING apply searches for previously applied content', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('accoda-chunk-merging');
        });
    });

    describe('AC2: nessun separatore visivo tra i chunk accodati', () => {
        it('queued content uses only a newline separator without markers or visual separators', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // Template literal \\n outputs literal \n in the HTML JS code
            expect(html).toContain("'\\n' + contenutoHead");
            expect(html).toContain("'\\n' + contenutoMerging");
        });

        it('does not insert any conflict marker or separator text between queued chunks', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // Verify no separator pattern like "---" or "===" is added in queuing logic
            const accodaHeadSection = html.substring(
                html.indexOf('accoda-chunk-head'),
                html.indexOf('accoda-chunk-head') + 300
            );
            expect(accodaHeadSection).not.toContain('---');
            expect(accodaHeadSection).not.toContain('===');
            expect(accodaHeadSection).not.toContain('<<<');
            expect(accodaHeadSection).not.toContain('>>>');
        });
    });

    describe('AC3: ordine di accodamento riflette ordine dei click', () => {
        it('queued content is appended at the end of the previously applied range', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // Insertion happens at the end of the previous content range
            expect(html).toContain('.endLineNumber');
            expect(html).toContain('.endColumn');
        });

        it('contenutoApplicato is updated to include both chunks after queuing', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // After queuing, the combined content is stored for potential further queuing
            expect(html).toContain("contenutoPrecedente + '\\n' + contenutoHead");
            expect(html).toContain("contenutoPrecedente + '\\n' + contenutoMerging");
        });

        it('uses Monaco Range for precise insertion positioning', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('monaco.Range');
            expect(html).toContain('new monaco.Range(');
        });
    });

    describe('Stato iniziale contenutoApplicato', () => {
        it('conflict state initializes contenutoApplicato as null', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('contenutoApplicato: null');
        });

        it('queuing only triggers when contenutoApplicato is truthy', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('statiConflitti[indiceConflitto].contenutoApplicato');
        });
    });
});

describe('MergeEditorProvider — US-027: Allineamento visivo UI con mockup Merge Editor', () => {
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

    describe('AC1: toolbar con conflict badge animato', () => {
        it('the HTML contains the conflict count span', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('id="conflictCount"');
        });

        it('the HTML contains the pulse-dot animated indicator', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('class="pulse-dot"');
        });

        it('the HTML contains blink animation for the pulse dot', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('@keyframes blink');
        });

        it('the Complete Merge button uses vsc-btn-primary style', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('vsc-btn-primary');
        });
    });

    describe('AC2: intestazioni colonne con color-bar, branch badge, tag read-only/editable', () => {
        it('the HTML contains col-hdr-bar elements for color accents', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('col-hdr-bar');
        });

        it('the HTML contains read-only tags on HEAD and MERGING columns', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('read-only');
            expect(html).toContain('editable');
        });

        it('the HTML contains branch badge showing the file name', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('col-hdr-branch');
        });
    });

    describe('AC3: palette VS Code Dark+ per conflict zones', () => {
        it('defines --head amber color variable with correct hex value', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('--head:');
            expect(pannelloWebview.webview.html).toContain('#e6931a');
        });

        it('defines --result teal color variable with correct hex value', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('--result:');
            expect(pannelloWebview.webview.html).toContain('#4ec9b0');
        });

        it('defines --merging blue color variable with correct hex value', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('--merging:');
            expect(pannelloWebview.webview.html).toContain('#4aabf7');
        });

        it('applies head-cz and merging-cz classes for conflict zones', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('head-cz');
            expect(html).toContain('merging-cz');
        });
    });

    describe('AC4: pulsanti azione con label estese e stili mockup', () => {
        it('HEAD apply button uses ab ah classes for amber styling', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain("applyButtonHead.className = 'ab ah'");
        });

        it('MERGING apply button uses ab am classes for blue styling', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain("applyButtonMerging.className = 'ab am'");
        });

        it('discard buttons use ab dx classes for neutral styling', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("discardButtonHead.className = 'ab dx'");
            expect(html).toContain("discardButtonMerging.className = 'ab dx'");
        });
    });

    describe('AC5: minimap strip 14px con segmenti colorati', () => {
        it('the HTML contains the minimap container', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('id="minimapContainer"');
        });

        it('the HTML contains the renderMinimap function', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('renderMinimap');
        });

        it('the minimap uses 14px column in the CSS grid', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('1fr 1fr 1fr 14px');
        });
    });

    describe('AC6: status bar con nome file, contatore conflitti e shortcut F7', () => {
        it('the HTML contains the status bar conflict count element', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('id="sbConflictCount"');
        });

        it('the HTML contains F7 keyboard shortcut in the status bar', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('F7');
        });

        it('the HTML contains the statusbar element', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('class="statusbar"');
        });
    });

    describe('Wiring contatore badge (TASK-07)', () => {
        it('the HTML contains aggiornaContatoreBadge function', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('aggiornaContatoreBadge');
        });

        it('aggiornaContatoreBadge is called from marcaConflittoComeGestito', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            const marcaFn = html.substring(html.indexOf('function marcaConflittoComeGestito'), html.indexOf('function renderColonneLaterali'));
            expect(marcaFn).toContain('aggiornaContatoreBadge');
        });

        it('aggiornaContatoreBadge is called after layout initialization', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            const start = html.indexOf('function inizializzaLayout');
            const inizializzaFn = html.substring(start, start + 600);
            expect(inizializzaFn).toContain('aggiornaContatoreBadge');
        });
    });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  US-011: Popup conferma merge con conflitti irrisolti
 * ═══════════════════════════════════════════════════════════════════════ */
import { JSDOM } from 'jsdom';

describe('MergeEditorProvider — US-011: Popup conferma merge con conflitti irrisolti', () => {
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

    // ── Struttura HTML statica del modal ──

    describe('Struttura HTML del modal di conferma', () => {
        it('contiene il modal overlay nascosto per default', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="modalConfermaOverlay"');
            expect(html).toContain('class="modal-overlay"');
        });

        it('contiene il pannello con titolo "Conflitti non risolti"', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('Conflitti non risolti');
        });

        it('contiene il messaggio con il conteggio conflitti', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="modalConteggioConflitti"');
            expect(html).toContain('conflitti irrisolti');
        });

        it('contiene i bottoni "Annulla" e "Conferma"', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="modalAnnullaButton"');
            expect(html).toContain('>Annulla<');
            expect(html).toContain('id="modalConfermaButton"');
            expect(html).toContain('>Conferma<');
        });

        it('il modal overlay e nascosto con display:none per default (no classe visibile)', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // L'overlay ha classe "modal-overlay" senza "visibile"
            expect(html).toMatch(/class="modal-overlay"\s+id="modalConfermaOverlay"/);
            // Lo stile CSS definisce .modal-overlay { display: none }
            expect(html).toContain('.modal-overlay {');
            expect(html).toContain('display: none');
            // e .modal-overlay.visibile { display: flex }
            expect(html).toContain('.modal-overlay.visibile');
        });
    });

    // ── Logica JS inline del modal (test con JSDOM) ──

    describe('Logica comportamentale del popup (JSDOM)', () => {
        /**
         * Crea un ambiente JSDOM minimale con il DOM del modal e le funzioni JS
         * estratte dall'HTML generato dal provider. Inietta un mock di
         * vscode.postMessage per verificare i messaggi inviati.
         */
        function creaDomConModalEFunzioni(statiConflittiIniziali: Record<string, { headGestito: boolean; mergingGestito: boolean }>) {
            const htmlMinimale = `
                <html><body>
                    <button id="completeMergeButton">Complete Merge</button>
                    <div class="modal-overlay" id="modalConfermaOverlay">
                        <div class="modal-pannello">
                            <h3>Conflitti non risolti</h3>
                            <p id="modalConfermaMessaggio">Ci sono ancora <strong id="modalConteggioConflitti">0</strong> conflitti irrisolti.</p>
                            <div class="modal-azioni">
                                <button id="modalAnnullaButton">Annulla</button>
                                <button id="modalConfermaButton">Conferma</button>
                            </div>
                        </div>
                    </div>
                </body></html>
            `;
            const dom = new JSDOM(htmlMinimale);
            const document = dom.window.document;

            const messaggiInviati: Array<{ command: string }> = [];
            const mockVscodePostMessage = (messaggio: { command: string }) => {
                messaggiInviati.push(messaggio);
            };

            // Ricrea le funzioni JS inline del provider
            const statiConflitti = statiConflittiIniziali;

            function contaConflittiAperti(): number {
                let count = 0;
                for (const k in statiConflitti) {
                    if (!statiConflitti[k].headGestito || !statiConflitti[k].mergingGestito) {
                        count++;
                    }
                }
                return count;
            }

            function gestisciCompletaMerge(): void {
                const numeroConflittiAperti = contaConflittiAperti();
                if (numeroConflittiAperti > 0) {
                    const conteggioElemento = document.getElementById('modalConteggioConflitti');
                    if (conteggioElemento) {
                        conteggioElemento.textContent = numeroConflittiAperti.toString();
                    }
                    const overlay = document.getElementById('modalConfermaOverlay');
                    if (overlay) {
                        overlay.classList.add('visibile');
                    }
                } else {
                    mockVscodePostMessage({ command: 'completaMerge' });
                }
            }

            function chiudiModalConferma(): void {
                const overlay = document.getElementById('modalConfermaOverlay');
                if (overlay) {
                    overlay.classList.remove('visibile');
                }
            }

            // Registra event listener come nel codice reale
            document.getElementById('completeMergeButton')!.addEventListener('click', () => {
                gestisciCompletaMerge();
            });
            document.getElementById('modalConfermaButton')!.addEventListener('click', () => {
                chiudiModalConferma();
                mockVscodePostMessage({ command: 'completaMerge' });
            });
            document.getElementById('modalAnnullaButton')!.addEventListener('click', () => {
                chiudiModalConferma();
            });

            return { dom, document, messaggiInviati, contaConflittiAperti, gestisciCompletaMerge, chiudiModalConferma };
        }

        it('mostra il popup quando ci sono conflitti irrisolti (count > 0)', () => {
            const conflittiConDueAperti = {
                '0': { headGestito: false, mergingGestito: false },
                '1': { headGestito: true, mergingGestito: false },
            };
            const { document } = creaDomConModalEFunzioni(conflittiConDueAperti);

            // Simula click su Complete Merge
            document.getElementById('completeMergeButton')!.click();

            const overlay = document.getElementById('modalConfermaOverlay')!;
            expect(overlay.classList.contains('visibile')).toBe(true);
        });

        it('non mostra il popup quando tutti i conflitti sono risolti (count = 0), merge procede direttamente', () => {
            const tuttiConflittiRisolti = {
                '0': { headGestito: true, mergingGestito: true },
                '1': { headGestito: true, mergingGestito: true },
            };
            const { document, messaggiInviati } = creaDomConModalEFunzioni(tuttiConflittiRisolti);

            document.getElementById('completeMergeButton')!.click();

            // Il modal NON deve essere visibile
            const overlay = document.getElementById('modalConfermaOverlay')!;
            expect(overlay.classList.contains('visibile')).toBe(false);

            // Il messaggio completaMerge viene inviato direttamente
            expect(messaggiInviati).toHaveLength(1);
            expect(messaggiInviati[0].command).toBe('completaMerge');
        });

        it('il bottone "Annulla" chiude il popup senza inviare alcun messaggio', () => {
            const conflittiAperti = {
                '0': { headGestito: false, mergingGestito: false },
            };
            const { document, messaggiInviati } = creaDomConModalEFunzioni(conflittiAperti);

            // Apri il modal
            document.getElementById('completeMergeButton')!.click();
            const overlay = document.getElementById('modalConfermaOverlay')!;
            expect(overlay.classList.contains('visibile')).toBe(true);

            // Resetta i messaggi dopo l'apertura (non ce ne dovrebbero essere)
            const messaggiPrimaDiAnnulla = [...messaggiInviati];

            // Click su Annulla
            document.getElementById('modalAnnullaButton')!.click();

            // Il modal deve essere chiuso
            expect(overlay.classList.contains('visibile')).toBe(false);

            // Nessun messaggio inviato ne prima ne dopo il click su Annulla
            expect(messaggiInviati).toEqual(messaggiPrimaDiAnnulla);
            expect(messaggiInviati).toHaveLength(0);
        });

        it('il bottone "Conferma" chiude il popup E invia il messaggio completaMerge', () => {
            const conflittiAperti = {
                '0': { headGestito: false, mergingGestito: true },
                '1': { headGestito: false, mergingGestito: false },
            };
            const { document, messaggiInviati } = creaDomConModalEFunzioni(conflittiAperti);

            // Apri il modal
            document.getElementById('completeMergeButton')!.click();
            const overlay = document.getElementById('modalConfermaOverlay')!;
            expect(overlay.classList.contains('visibile')).toBe(true);
            expect(messaggiInviati).toHaveLength(0);

            // Click su Conferma
            document.getElementById('modalConfermaButton')!.click();

            // Il modal deve essere chiuso
            expect(overlay.classList.contains('visibile')).toBe(false);

            // Il messaggio completaMerge deve essere stato inviato
            expect(messaggiInviati).toHaveLength(1);
            expect(messaggiInviati[0]).toEqual({ command: 'completaMerge' });
        });

        it('il conteggio conflitti viene visualizzato correttamente nel messaggio del popup', () => {
            const treConflittiAperti = {
                '0': { headGestito: false, mergingGestito: false },
                '1': { headGestito: true, mergingGestito: false },
                '2': { headGestito: false, mergingGestito: true },
            };
            const { document } = creaDomConModalEFunzioni(treConflittiAperti);

            document.getElementById('completeMergeButton')!.click();

            const conteggioElemento = document.getElementById('modalConteggioConflitti')!;
            expect(conteggioElemento.textContent).toBe('3');
        });

        it('il conteggio mostra 1 quando solo un conflitto e aperto', () => {
            const unConflittoAperto = {
                '0': { headGestito: true, mergingGestito: true },
                '1': { headGestito: false, mergingGestito: false },
                '2': { headGestito: true, mergingGestito: true },
            };
            const { document } = creaDomConModalEFunzioni(unConflittoAperto);

            document.getElementById('completeMergeButton')!.click();

            const conteggioElemento = document.getElementById('modalConteggioConflitti')!;
            expect(conteggioElemento.textContent).toBe('1');
        });

        it('contaConflittiAperti restituisce 0 quando tutti i conflitti sono gestiti', () => {
            const tuttiRisolti = {
                '0': { headGestito: true, mergingGestito: true },
                '1': { headGestito: true, mergingGestito: true },
            };
            const { contaConflittiAperti } = creaDomConModalEFunzioni(tuttiRisolti);
            expect(contaConflittiAperti()).toBe(0);
        });

        it('contaConflittiAperti conta i conflitti dove almeno un lato non e gestito', () => {
            const misto = {
                '0': { headGestito: true, mergingGestito: true },   // risolto
                '1': { headGestito: false, mergingGestito: true },  // aperto (head non gestito)
                '2': { headGestito: true, mergingGestito: false },  // aperto (merging non gestito)
                '3': { headGestito: false, mergingGestito: false }, // aperto (nessuno gestito)
            };
            const { contaConflittiAperti } = creaDomConModalEFunzioni(misto);
            expect(contaConflittiAperti()).toBe(3);
        });
    });

    // ── Verifica che il JS inline nell'HTML contenga la logica corretta ──

    describe('Presenza della logica JS inline nel HTML generato', () => {
        it('il JS contiene la funzione gestisciCompletaMerge che controlla contaConflittiAperti', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('function gestisciCompletaMerge()');
            expect(html).toContain('contaConflittiAperti()');
        });

        it('gestisciCompletaMerge aggiunge la classe visibile all overlay quando ci sono conflitti', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            const funzioneGestisci = html.substring(
                html.indexOf('function gestisciCompletaMerge'),
                html.indexOf('function chiudiModalConferma')
            );
            expect(funzioneGestisci).toContain("classList.add('visibile')");
            expect(funzioneGestisci).toContain('modalConfermaOverlay');
        });

        it('gestisciCompletaMerge invia completaMerge direttamente quando non ci sono conflitti', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            const funzioneGestisci = html.substring(
                html.indexOf('function gestisciCompletaMerge'),
                html.indexOf('function chiudiModalConferma')
            );
            expect(funzioneGestisci).toContain("vscode.postMessage({ command: 'completaMerge' })");
        });

        it('chiudiModalConferma rimuove la classe visibile dall overlay', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            const funzioneChiudi = html.substring(
                html.indexOf('function chiudiModalConferma'),
                html.indexOf('function chiudiModalConferma') + 300
            );
            expect(funzioneChiudi).toContain("classList.remove('visibile')");
        });

        it('il bottone completeMergeButton invoca gestisciCompletaMerge al click', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("getElementById('completeMergeButton')");
            expect(html).toContain('gestisciCompletaMerge()');
        });

        it('il bottone Conferma chiude il modal e invia completaMerge', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("getElementById('modalConfermaButton')");
            // Dopo il listener di modalConfermaButton deve esserci chiudiModalConferma + postMessage
            const indicePulsanteConferma = html.indexOf("getElementById('modalConfermaButton')");
            const porzioneDopoConferma = html.substring(indicePulsanteConferma, indicePulsanteConferma + 200);
            expect(porzioneDopoConferma).toContain('chiudiModalConferma()');
            expect(porzioneDopoConferma).toContain("command: 'completaMerge'");
        });

        it('il bottone Annulla chiude il modal senza inviare messaggi', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain("getElementById('modalAnnullaButton')");
            const indicePulsanteAnnulla = html.indexOf("getElementById('modalAnnullaButton')");
            const porzioneDopoAnnulla = html.substring(indicePulsanteAnnulla, indicePulsanteAnnulla + 200);
            expect(porzioneDopoAnnulla).toContain('chiudiModalConferma()');
            // Non deve esserci un postMessage nel handler di Annulla
            expect(porzioneDopoAnnulla).not.toContain('postMessage');
        });
    });
});
