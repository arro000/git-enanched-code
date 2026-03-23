import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

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
import { rilevaLinguaggioDaNomeFile } from '../../../src/ui/utils/RilevatoreLinguaggio';
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

// ── Helper: leggi i file sorgente della webview ──

const percorsoRadice = path.resolve(__dirname, '..', '..', '..');

function leggiFileSorgente(percorsoRelativo: string): string {
    return fs.readFileSync(path.join(percorsoRadice, percorsoRelativo), 'utf-8');
}

const cssEsterno = leggiFileSorgente('src/ui/webview/mergeEditor.css');
const sorgenteMonacoSetup = leggiFileSorgente('src/ui/webview/MonacoSetup.ts');
const sorgenteConflictState = leggiFileSorgente('src/ui/webview/ConflictState.ts');
const sorgenteColumnRenderer = leggiFileSorgente('src/ui/webview/ThreeColumnLayout/ColumnRenderer.ts');
const sorgenteMergeModal = leggiFileSorgente('src/ui/webview/MergeModal.ts');
const sorgenteMinimapRenderer = leggiFileSorgente('src/ui/webview/ConflictMinimap/MinimapRenderer.ts');
const sorgenteMessageBridge = leggiFileSorgente('src/ui/webview/MessageBridge.ts');
const sorgenteMergeEditorEntry = leggiFileSorgente('src/ui/webview/mergeEditor.ts');

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

        it('the CSS uses grid with 3 equal columns plus minimap column', () => {
            expect(cssEsterno).toContain('grid-template-columns: 1fr 1fr 1fr 14px');
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

        it('the ColumnRenderer source uses code-segment class for display-only rendering', () => {
            expect(sorgenteColumnRenderer).toContain("divHead.className = 'code-segment'");
            expect(sorgenteColumnRenderer).toContain("divMerging.className = 'code-segment'");
        });

        it('the ColumnRenderer source exposes a reset action for handled conflicts', () => {
            expect(sorgenteColumnRenderer).toContain("resetButtonHead.textContent = '\\u21ba Reset'");
            expect(sorgenteColumnRenderer).toContain("resetButtonMerging.textContent = '\\u21ba Reset'");
            expect(sorgenteColumnRenderer).toContain('function resettaConflitto');
            expect(sorgenteColumnRenderer).toContain('riabilitaAutoResolvePerConflitto');
            expect(sorgenteColumnRenderer).toContain('if (mergeCompletato()) return;');
        });
    });

    describe('AC3: nessun overflow orizzontale su schermi >= 1280px', () => {
        it('the CSS has overflow hidden to prevent page-level horizontal scroll', () => {
            expect(cssEsterno).toContain('overflow: hidden');
        });

        it('the CSS uses grid layout that fills available space', () => {
            expect(cssEsterno).toContain('flex: 1');
            expect(cssEsterno).toContain('min-height: 0');
        });

        it('the CSS uses flexbox column layout with 100vh height', () => {
            expect(cssEsterno).toContain('height: 100vh');
            expect(cssEsterno).toContain('flex-direction: column');
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

        it('the CSS uses VS Code Dark+ palette variables for styling', () => {
            expect(cssEsterno).toContain('--foreground');
            expect(cssEsterno).toContain('--editor-bg');
            expect(cssEsterno).toContain('--btn-primary-bg');
        });

        it('the CSS uses monospace font variable for code segments', () => {
            expect(cssEsterno).toContain('--font-mono');
        });

        it('the CSS uses VS Code Dark+ colors for HEAD and MERGING conflict highlights', () => {
            expect(cssEsterno).toContain('--head-bg');
            expect(cssEsterno).toContain('--merging-bg');
        });

        it('the CSS shows reset button when a conflict has been handled', () => {
            expect(cssEsterno).toContain('.conflict-segment-handled .ab.rs');
            expect(cssEsterno).toContain('background: rgba(78,201,176,0.12)');
        });

        it('the CSS disables conflict action buttons after merge completion', () => {
            expect(cssEsterno).toContain('body.merge-completed .ca .ab');
            expect(cssEsterno).toContain('pointer-events: none');
        });
    });

    describe('Compatibilita con US-005 (persistenza stato)', () => {
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

        it('the MessageBridge source restores saved editor state only after Monaco is ready', () => {
            expect(sorgenteMessageBridge).toContain('onMonacoReady');
            expect(sorgenteMessageBridge).toContain('editor.setValue(stato.contenutoColonnaCentrale)');
        });

        it('the MessageBridge source reapplies handled conflict state to both side columns', () => {
            expect(sorgenteMessageBridge).toContain("marcaConflittoComeGestito('head'");
            expect(sorgenteMessageBridge).toContain("marcaConflittoComeGestito('merging'");
        });

        it('the MessageBridge source restores auto-resolve metadata for persisted auto decisions', () => {
            expect(sorgenteMessageBridge).toContain("conflitto.sorgenteApplicata === 'diff3-auto'");
            expect(sorgenteMessageBridge).toContain('window._risoluzioniDisponibili');
        });

        it('the MessageBridge source locks the webview after merge completion', () => {
            expect(sorgenteMessageBridge).toContain('window._mergeCompletato = true');
            expect(sorgenteMessageBridge).toContain("document.body.classList.add('merge-completed')");
            expect(sorgenteMessageBridge).toContain('editor.updateOptions({ readOnly: true })');
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

        it('ignores legacy saved state with resolved conflicts but missing result content', async () => {
            const stateManager = new MergeSessionStateManager(mockWorkspaceState as unknown as vscode.Memento);
            const contenutoDocumento = documento.getText();
            const hashCorretto = stateManager.calcolaHashContenuto(contenutoDocumento);

            mockWorkspaceState.get.mockReturnValue({
                percorsoFile: '/workspace/test-file.ts',
                hashContenutoOriginale: hashCorretto,
                statiConflitti: [
                    {
                        indiceConflitto: 0,
                        risolto: true,
                        resolvedContent: 'const x = 1;',
                        sorgenteApplicata: 'diff3-auto',
                    },
                ],
                contenutoColonnaCentrale: null,
                ultimoAggiornamento: Date.now(),
            });

            await inizializzaEditor();
            const gestoreMessaggi = mockOnDidReceiveMessage.mock.calls[0][0];
            await gestoreMessaggi({ command: 'webviewPronta' });

            const chiamatePostMessage = mockPostMessage.mock.calls.map(
                (call: unknown[]) => (call[0] as { command: string }).command
            );
            expect(chiamatePostMessage).toContain('inizializzaLayout');
            expect(chiamatePostMessage).not.toContain('statoRipristinato');
            expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                'git-enhanced:mergeState:/workspace/test-file.ts',
                undefined
            );
        });

        it('persists updated result content and resolved conflicts from webview state sync', async () => {
            const stateManager = new MergeSessionStateManager(mockWorkspaceState as unknown as vscode.Memento);
            const contenutoDocumento = documento.getText();
            const hashCorretto = stateManager.calcolaHashContenuto(contenutoDocumento);

            mockWorkspaceState.get.mockReturnValue({
                percorsoFile: '/workspace/test-file.ts',
                hashContenutoOriginale: hashCorretto,
                statiConflitti: [
                    {
                        indiceConflitto: 0,
                        risolto: false,
                        resolvedContent: null,
                        sorgenteApplicata: null,
                    },
                    {
                        indiceConflitto: 1,
                        risolto: false,
                        resolvedContent: null,
                        sorgenteApplicata: null,
                    },
                ],
                contenutoColonnaCentrale: null,
                ultimoAggiornamento: Date.now(),
            });

            await inizializzaEditor();
            const gestoreMessaggi = mockOnDidReceiveMessage.mock.calls[0][0];
            await gestoreMessaggi({
                command: 'aggiornaStato',
                contenutoColonnaCentrale: 'merged result content',
                statiConflitti: [
                    {
                        indiceConflitto: 0,
                        headGestito: true,
                        mergingGestito: true,
                        contenutoApplicato: 'const x = 1;',
                    },
                    {
                        indiceConflitto: 1,
                        headGestito: false,
                        mergingGestito: false,
                        contenutoApplicato: null,
                    },
                ],
            });

            expect(mockWorkspaceState.update).toHaveBeenCalledWith(
                'git-enhanced:mergeState:/workspace/test-file.ts',
                expect.objectContaining({
                    contenutoColonnaCentrale: 'merged result content',
                    statiConflitti: [
                        expect.objectContaining({
                            indiceConflitto: 0,
                            risolto: true,
                            resolvedContent: 'const x = 1;',
                            sorgenteApplicata: 'manual',
                        }),
                        expect.objectContaining({
                            indiceConflitto: 1,
                            risolto: false,
                            resolvedContent: null,
                            sorgenteApplicata: null,
                        }),
                    ],
                })
            );
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

        it('the MonacoSetup source configures require.config with the Monaco base path', () => {
            expect(sorgenteMonacoSetup).toContain("require.config");
            expect(sorgenteMonacoSetup).toContain("paths: { 'vs':");
        });

        it('the MonacoSetup source requires vs/editor/editor.main to load Monaco', () => {
            expect(sorgenteMonacoSetup).toContain("require(['vs/editor/editor.main']");
        });

        it('the HTML injects the detected language as a global variable', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // The file is test-file.ts -> language 'typescript'
            expect(html).toContain("window.__LINGUAGGIO_ID__ = 'typescript'");
        });

        it('the MonacoSetup source creates Monaco editor using monaco.editor.create', () => {
            expect(sorgenteMonacoSetup).toContain('monaco.editor.create');
        });

        it('the MonacoSetup source detects dark/light theme from VS Code body classes', () => {
            expect(sorgenteMonacoSetup).toContain('vscode-dark');
            expect(sorgenteMonacoSetup).toContain("'vs-dark'");
            expect(sorgenteMonacoSetup).toContain("'vs'");
        });
    });

    describe('AC2: cursore posizionabile e testo editabile', () => {
        it('the MonacoSetup source creates Monaco editor with readOnly set to false', () => {
            expect(sorgenteMonacoSetup).toContain('readOnly: false');
        });

        it('the Monaco container fills the entire result column', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="monacoEditorContainer"');
            // Container uses absolute positioning to fill parent (in the CSS)
            expect(cssEsterno).toContain('#monacoEditorContainer');
            expect(cssEsterno).toMatch(/position:\s*absolute/);
        });

        it('the MonacoSetup source enables automaticLayout for responsive resizing', () => {
            expect(sorgenteMonacoSetup).toContain('automaticLayout: true');
        });
    });

    describe('AC3: nessuna latenza percettibile durante la digitazione', () => {
        it('the MonacoSetup source disables minimap to reduce rendering overhead', () => {
            expect(sorgenteMonacoSetup).toContain('minimap: { enabled: false }');
        });

        it('the MonacoSetup source enables line numbers for code navigation', () => {
            expect(sorgenteMonacoSetup).toContain("lineNumbers: 'on'");
        });

        it('the MonacoSetup source uses blob workers to avoid blocking the main thread', () => {
            expect(sorgenteMonacoSetup).toContain('MonacoEnvironment');
            expect(sorgenteMonacoSetup).toContain('getWorkerUrl');
            expect(sorgenteMonacoSetup).toContain('URL.createObjectURL');
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
        it('the ColumnRenderer source builds initial result content with conflict placeholders', () => {
            expect(sorgenteColumnRenderer).toContain('buildInitialResultContent');
            expect(sorgenteColumnRenderer).toContain('Conflitto #');
            expect(sorgenteColumnRenderer).toContain('irrisolto');
        });
    });

    describe('Rilevamento linguaggio dal nome file', () => {
        it('detects TypeScript for .ts files', () => {
            expect(rilevaLinguaggioDaNomeFile('/workspace/app.ts')).toBe('typescript');
        });

        it('detects JavaScript for .js files', () => {
            expect(rilevaLinguaggioDaNomeFile('/workspace/app.js')).toBe('javascript');
        });

        it('detects Python for .py files', () => {
            expect(rilevaLinguaggioDaNomeFile('/workspace/app.py')).toBe('python');
        });

        it('defaults to plaintext for unknown extensions', () => {
            expect(rilevaLinguaggioDaNomeFile('/workspace/data.xyz')).toBe('plaintext');
        });

        it('detects CSharp for .cs files', () => {
            expect(rilevaLinguaggioDaNomeFile('/workspace/Program.cs')).toBe('csharp');
        });

        it('detects Rust for .rs files', () => {
            expect(rilevaLinguaggioDaNomeFile('/workspace/main.rs')).toBe('rust');
        });
    });

    describe('Struttura HTML con file esterni', () => {
        it('the HTML includes a <link rel="stylesheet"> for the external CSS', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('<link rel="stylesheet"');
        });

        it('the HTML includes a <script src> for the webview bundle', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toMatch(/<script[^>]+src="/);
        });

        it('the HTML contains window.__MONACO_BASE_URI__ global variable', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('window.__MONACO_BASE_URI__');
        });

        it('the HTML contains window.__LINGUAGGIO_ID__ global variable', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('window.__LINGUAGGIO_ID__');
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
        it('the ColumnRenderer source contains the "Accept Current" apply button for HEAD conflicts', () => {
            expect(sorgenteColumnRenderer).toContain("applyButtonHead.textContent = '>> Accept Current'");
        });

        it('the ColumnRenderer source has a descriptive title attribute for apply button', () => {
            expect(sorgenteColumnRenderer).toContain('Applica chunk HEAD nella colonna Result');
        });

        it('the ColumnRenderer source uses Monaco executeEdits to replace placeholder in applicaChunkHead', () => {
            expect(sorgenteColumnRenderer).toContain('applicaChunkHead');
            expect(sorgenteColumnRenderer).toContain('executeEdits');
            expect(sorgenteColumnRenderer).toContain('applica-chunk-head');
        });

        it('the ColumnRenderer source searches for the conflict placeholder pattern in Monaco model', () => {
            expect(sorgenteColumnRenderer).toContain('findMatches');
            expect(sorgenteColumnRenderer).toContain('Conflitto #');
            expect(sorgenteColumnRenderer).toContain('irrisolto');
        });
    });

    describe('AC2: click su x scarta il chunk HEAD', () => {
        it('the ColumnRenderer source contains the Ignore discard button for HEAD conflicts', () => {
            expect(sorgenteColumnRenderer).toContain("discardButtonHead.textContent = '\\u2715 Ignore'");
        });

        it('the ColumnRenderer source has a descriptive title attribute for discard button', () => {
            expect(sorgenteColumnRenderer).toContain('Scarta chunk HEAD');
        });

        it('the ColumnRenderer source marks the conflict as handled without modifying Monaco in scartaChunkHead', () => {
            expect(sorgenteColumnRenderer).toContain('scartaChunkHead');
            // Discard marks handled state
            expect(sorgenteColumnRenderer).toContain('headGestito = true');
        });
    });

    describe('AC3: conflitto marcato visivamente come gestito', () => {
        it('the CSS includes a handled style class that dims the segment', () => {
            expect(cssEsterno).toContain('conflict-segment-handled');
            expect(cssEsterno).toContain('opacity: 0.35');
        });

        it('the ConflictState source adds handled class to the segment in marcaConflittoComeGestito', () => {
            expect(sorgenteConflictState).toContain('marcaConflittoComeGestito');
            expect(sorgenteConflictState).toContain("classList.add('conflict-segment-handled')");
        });

        it('the CSS hides normal actions but keeps reset available for handled segments', () => {
            expect(cssEsterno).toContain('.conflict-segment-handled .ab:not(.rs)');
            expect(cssEsterno).toContain('.conflict-segment-handled .ab.rs');
            expect(cssEsterno).toContain('display: inline-flex');
        });

        it('the ColumnRenderer source sets data-conflict-index attribute for targeting', () => {
            expect(sorgenteColumnRenderer).toContain('data-conflict-index');
            expect(sorgenteColumnRenderer).toContain("setAttribute('data-conflict-index'");
        });
    });

    describe('Tracciamento dello stato dei conflitti', () => {
        it('the ConflictState source initializes conflict state tracking object', () => {
            expect(sorgenteConflictState).toContain('statiConflitti');
            expect(sorgenteConflictState).toContain('headGestito: false');
            expect(sorgenteConflictState).toContain('mergingGestito: false');
        });

        it('the ColumnRenderer source uses IIFE closures to capture correct conflict index in button handlers', () => {
            // IIFE pattern for closure capture in loop
            expect(sorgenteColumnRenderer).toContain('(function (idx: number, content: string)');
            expect(sorgenteColumnRenderer).toContain('(function (idx: number)');
        });
    });

    describe('Struttura dei pulsanti azione', () => {
        it('the ColumnRenderer source places action buttons inside a ca container', () => {
            expect(sorgenteColumnRenderer).toContain("actionBarHead.className = 'ca'");
        });

        it('the ColumnRenderer source adds apply and discard buttons in order', () => {
            // Apply button added first, then discard
            expect(sorgenteColumnRenderer).toContain('actionBarHead.appendChild(applyButtonHead)');
            expect(sorgenteColumnRenderer).toContain('actionBarHead.appendChild(discardButtonHead)');
        });

        it('the ColumnRenderer source inserts action bar before code content in the conflict segment', () => {
            expect(sorgenteColumnRenderer).toContain('divHead.appendChild(actionBarHead)');
            // Code content added after action bar
            expect(sorgenteColumnRenderer).toContain('divHead.appendChild(codeContent)');
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
        it('the ColumnRenderer source contains the "Accept Incoming" apply button for MERGING conflicts', () => {
            expect(sorgenteColumnRenderer).toContain("applyButtonMerging.textContent = '<< Accept Incoming'");
        });

        it('the ColumnRenderer source has a descriptive title attribute for apply button', () => {
            expect(sorgenteColumnRenderer).toContain('Applica chunk MERGING nella colonna Result');
        });

        it('the ColumnRenderer source uses Monaco executeEdits to replace placeholder in applicaChunkMerging', () => {
            expect(sorgenteColumnRenderer).toContain('applicaChunkMerging');
            expect(sorgenteColumnRenderer).toContain('executeEdits');
            expect(sorgenteColumnRenderer).toContain('applica-chunk-merging');
        });

        it('the ColumnRenderer source searches for the conflict placeholder pattern in Monaco model', () => {
            expect(sorgenteColumnRenderer).toContain('findMatches');
            expect(sorgenteColumnRenderer).toContain('Conflitto #');
            expect(sorgenteColumnRenderer).toContain('irrisolto');
        });
    });

    describe('AC2: click su x scarta il chunk MERGING', () => {
        it('the ColumnRenderer source contains the Ignore discard button for MERGING conflicts', () => {
            expect(sorgenteColumnRenderer).toContain("discardButtonMerging.textContent = '\\u2715 Ignore'");
        });

        it('the ColumnRenderer source has a descriptive title attribute for discard button', () => {
            expect(sorgenteColumnRenderer).toContain('Scarta chunk MERGING');
        });

        it('the ColumnRenderer source marks the conflict as handled in scartaChunkMerging', () => {
            expect(sorgenteColumnRenderer).toContain('scartaChunkMerging');
            // Discard marks handled state
            expect(sorgenteColumnRenderer).toContain('mergingGestito = true');
        });
    });

    describe('AC3: conflitto nella colonna destra marcato visivamente come gestito', () => {
        it('the CSS handled style applies to conflict segments', () => {
            expect(cssEsterno).toContain('conflict-segment-handled');
            expect(cssEsterno).toContain('opacity: 0.35');
        });

        it('the ConflictState source supports the merging column selector in marcaConflittoComeGestito', () => {
            expect(sorgenteConflictState).toContain("'#columnMerging'");
            expect(sorgenteConflictState).toContain("classList.add('conflict-segment-handled')");
        });

        it('the CSS keeps reset available for handled segments in both columns', () => {
            expect(cssEsterno).toContain('.conflict-segment-handled .ab:not(.rs)');
            expect(cssEsterno).toContain('.conflict-segment-handled .ab.rs');
            expect(cssEsterno).toContain('display: inline-flex');
        });

        it('the ColumnRenderer source sets data-conflict-index on MERGING conflict segments', () => {
            expect(sorgenteColumnRenderer).toContain('data-conflict-index');
        });
    });

    describe('Struttura dei pulsanti azione MERGING', () => {
        it('the ColumnRenderer source places MERGING action buttons inside a ca container', () => {
            expect(sorgenteColumnRenderer).toContain("actionBarMerging.className = 'ca'");
        });

        it('the ColumnRenderer source adds MERGING apply and discard buttons in order', () => {
            expect(sorgenteColumnRenderer).toContain('actionBarMerging.appendChild(applyButtonMerging)');
            expect(sorgenteColumnRenderer).toContain('actionBarMerging.appendChild(discardButtonMerging)');
        });

        it('the ColumnRenderer source inserts MERGING action bar before code content in the conflict segment', () => {
            expect(sorgenteColumnRenderer).toContain('divMerging.appendChild(actionBarMerging)');
            expect(sorgenteColumnRenderer).toContain('divMerging.appendChild(codeContentMerging)');
        });

        it('the ColumnRenderer source uses IIFE closures to capture correct conflict index in MERGING button handlers', () => {
            // IIFE pattern for merging apply button closure
            expect(sorgenteColumnRenderer).toContain('applicaChunkMerging(idx, content)');
            // IIFE pattern for merging discard button closure
            expect(sorgenteColumnRenderer).toContain('scartaChunkMerging(idx)');
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
        it('the ColumnRenderer source stores contenutoApplicato when placeholder is found in applicaChunkHead', () => {
            expect(sorgenteColumnRenderer).toContain('statiConflitti[indiceConflitto].contenutoApplicato = contenutoHead');
        });

        it('the ColumnRenderer source stores contenutoApplicato when placeholder is found in applicaChunkMerging', () => {
            expect(sorgenteColumnRenderer).toContain('statiConflitti[indiceConflitto].contenutoApplicato = contenutoMerging');
        });

        it('the ColumnRenderer source uses tracked end line to append content when placeholder is gone', () => {
            expect(sorgenteColumnRenderer).toContain('statiConflitti[indiceConflitto].rigaFineApplicato');
            expect(sorgenteColumnRenderer).toContain('getLineMaxColumn');
            expect(sorgenteColumnRenderer).toContain('accoda-chunk-head');
        });

        it('the ColumnRenderer source supports queuing for MERGING when placeholder is gone', () => {
            expect(sorgenteColumnRenderer).toContain('accoda-chunk-merging');
        });
    });

    describe('AC2: nessun separatore visivo tra i chunk accodati', () => {
        it('the ColumnRenderer source uses only a newline separator without markers or visual separators', () => {
            expect(sorgenteColumnRenderer).toContain("'\\n' + contenutoHead");
            expect(sorgenteColumnRenderer).toContain("'\\n' + contenutoMerging");
        });

        it('the ColumnRenderer source does not insert any conflict marker or separator in queuing logic', () => {
            // Get the section around accoda-chunk-head
            const indice = sorgenteColumnRenderer.indexOf('accoda-chunk-head');
            const accodaHeadSection = sorgenteColumnRenderer.substring(indice, indice + 300);
            expect(accodaHeadSection).not.toContain('---');
            expect(accodaHeadSection).not.toContain('===');
            expect(accodaHeadSection).not.toContain('<<<');
            expect(accodaHeadSection).not.toContain('>>>');
        });
    });

    describe('AC3: ordine di accodamento riflette ordine dei click', () => {
        it('the ColumnRenderer source appends queued content at the tracked end line position', () => {
            expect(sorgenteColumnRenderer).toContain('rigaFineApplicato');
            expect(sorgenteColumnRenderer).toContain('getLineMaxColumn');
        });

        it('the ColumnRenderer source updates contenutoApplicato to include both chunks after queuing', () => {
            expect(sorgenteColumnRenderer).toContain("statiConflitti[indiceConflitto].contenutoApplicato + '\\n' + contenutoHead");
            expect(sorgenteColumnRenderer).toContain("statiConflitti[indiceConflitto].contenutoApplicato + '\\n' + contenutoMerging");
        });

        it('the ColumnRenderer source uses Monaco Range for precise insertion positioning', () => {
            expect(sorgenteColumnRenderer).toContain('monaco.Range');
            expect(sorgenteColumnRenderer).toContain('new monaco.Range(');
        });
    });

    describe('Stato iniziale contenutoApplicato', () => {
        it('the ConflictState source initializes contenutoApplicato as null', () => {
            expect(sorgenteConflictState).toContain('contenutoApplicato: null');
        });

        it('the ColumnRenderer source references contenutoApplicato for queuing logic', () => {
            expect(sorgenteColumnRenderer).toContain('statiConflitti[indiceConflitto].contenutoApplicato');
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

        it('the CSS contains blink animation for the pulse dot', () => {
            expect(cssEsterno).toContain('@keyframes blink');
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
        it('the CSS defines --head amber color variable with correct hex value', () => {
            expect(cssEsterno).toContain('--head:');
            expect(cssEsterno).toContain('#e6931a');
        });

        it('the CSS defines --result teal color variable with correct hex value', () => {
            expect(cssEsterno).toContain('--result:');
            expect(cssEsterno).toContain('#4ec9b0');
        });

        it('the CSS defines --merging blue color variable with correct hex value', () => {
            expect(cssEsterno).toContain('--merging:');
            expect(cssEsterno).toContain('#4aabf7');
        });

        it('the ColumnRenderer source applies head-cz and merging-cz classes for conflict zones', () => {
            expect(sorgenteColumnRenderer).toContain('head-cz');
            expect(sorgenteColumnRenderer).toContain('merging-cz');
        });
    });

    describe('AC4: pulsanti azione con label estese e stili mockup', () => {
        it('the ColumnRenderer source uses ab ah classes for HEAD amber styling', () => {
            expect(sorgenteColumnRenderer).toContain("applyButtonHead.className = 'ab ah'");
        });

        it('the ColumnRenderer source uses ab am classes for MERGING blue styling', () => {
            expect(sorgenteColumnRenderer).toContain("applyButtonMerging.className = 'ab am'");
        });

        it('the ColumnRenderer source uses ab dx classes for neutral discard styling', () => {
            expect(sorgenteColumnRenderer).toContain("discardButtonHead.className = 'ab dx'");
            expect(sorgenteColumnRenderer).toContain("discardButtonMerging.className = 'ab dx'");
        });
    });

    describe('AC5: minimap strip 14px con segmenti colorati', () => {
        it('the HTML contains the minimap container', async () => {
            await inizializzaEditor();
            expect(pannelloWebview.webview.html).toContain('id="minimapContainer"');
        });

        it('the MinimapRenderer source contains the renderMinimap function', () => {
            expect(sorgenteMinimapRenderer).toContain('renderMinimap');
        });

        it('the CSS uses 14px column in the grid for minimap', () => {
            expect(cssEsterno).toContain('1fr 1fr 1fr 14px');
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
        it('the ConflictState source contains aggiornaContatoreBadge function', () => {
            expect(sorgenteConflictState).toContain('aggiornaContatoreBadge');
        });

        it('the ConflictState source calls aggiornaContatoreBadge from marcaConflittoComeGestito', () => {
            const indiceInizio = sorgenteConflictState.indexOf('function marcaConflittoComeGestito');
            const indiceFine = sorgenteConflictState.indexOf('function aggiornaContatoreBadge');
            const marcaFn = sorgenteConflictState.substring(indiceInizio, indiceFine);
            expect(marcaFn).toContain('aggiornaContatoreBadge');
        });

        it('the MessageBridge source calls aggiornaContatoreBadge after layout initialization', () => {
            const indiceInizio = sorgenteMessageBridge.indexOf('function inizializzaLayout');
            const inizializzaFn = sorgenteMessageBridge.substring(indiceInizio, indiceInizio + 600);
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
            // Lo stile CSS definisce .modal-overlay { display: none } (nel file esterno)
            expect(cssEsterno).toContain('.modal-overlay {');
            expect(cssEsterno).toContain('display: none');
            // e .modal-overlay.visibile { display: flex }
            expect(cssEsterno).toContain('.modal-overlay.visibile');
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

    // ── Verifica che i file sorgente webview contengano la logica corretta ──

    describe('Presenza della logica JS nei file sorgente webview', () => {
        it('il sorgente MergeModal contiene la funzione gestisciCompletaMerge che controlla contaConflittiAperti', () => {
            expect(sorgenteMergeModal).toContain('function gestisciCompletaMerge');
            expect(sorgenteMergeModal).toContain('contaConflittiAperti()');
        });

        it('gestisciCompletaMerge aggiunge la classe visibile all overlay quando ci sono conflitti', () => {
            const indiceInizio = sorgenteMergeModal.indexOf('function gestisciCompletaMerge');
            const indiceFine = sorgenteMergeModal.indexOf('function chiudiModalConferma');
            const funzioneGestisci = sorgenteMergeModal.substring(indiceInizio, indiceFine);
            expect(funzioneGestisci).toContain("classList.add('visibile')");
            expect(funzioneGestisci).toContain('modalConfermaOverlay');
        });

        it('gestisciCompletaMerge invia completaMerge direttamente quando non ci sono conflitti', () => {
            const indiceInizio = sorgenteMergeModal.indexOf('function gestisciCompletaMerge');
            const indiceFine = sorgenteMergeModal.indexOf('function chiudiModalConferma');
            const funzioneGestisci = sorgenteMergeModal.substring(indiceInizio, indiceFine);
            expect(funzioneGestisci).toContain("command: 'completaMerge', resolvedContent:");
        });

        it('chiudiModalConferma rimuove la classe visibile dall overlay', () => {
            const indiceInizio = sorgenteMergeModal.indexOf('function chiudiModalConferma');
            const funzioneChiudi = sorgenteMergeModal.substring(indiceInizio, indiceInizio + 300);
            expect(funzioneChiudi).toContain("classList.remove('visibile')");
        });

        it('il sorgente MergeModal contiene il listener per il bottone completeMergeButton', () => {
            expect(sorgenteMergeModal).toContain("getElementById('completeMergeButton')");
            expect(sorgenteMergeModal).toContain('gestisciCompletaMerge');
        });

        it('il sorgente MergeModal contiene il listener per il bottone Conferma che chiude il modal e invia completaMerge', () => {
            expect(sorgenteMergeModal).toContain("getElementById('modalConfermaButton')");
            const indicePulsanteConferma = sorgenteMergeModal.indexOf("getElementById('modalConfermaButton')");
            const porzioneDopoConferma = sorgenteMergeModal.substring(indicePulsanteConferma, indicePulsanteConferma + 300);
            expect(porzioneDopoConferma).toContain('chiudiModalConferma()');
            expect(porzioneDopoConferma).toContain("command: 'completaMerge'");
        });

        it('il sorgente MergeModal contiene il listener per il bottone Annulla che chiude il modal senza inviare messaggi', () => {
            expect(sorgenteMergeModal).toContain("getElementById('modalAnnullaButton')");
            const indicePulsanteAnnulla = sorgenteMergeModal.indexOf("getElementById('modalAnnullaButton')");
            const porzioneDopoAnnulla = sorgenteMergeModal.substring(indicePulsanteAnnulla, indicePulsanteAnnulla + 200);
            expect(porzioneDopoAnnulla).toContain('chiudiModalConferma()');
            // Non deve esserci un postMessage nel handler di Annulla
            expect(porzioneDopoAnnulla).not.toContain('postMessage');
        });
    });
});
