import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dello stato globale persistente tra i test
const globalStateStore: Record<string, unknown> = {};

const mockWebviewOnDidReceiveMessage = vi.fn();
const mockWebviewPostMessage = vi.fn().mockResolvedValue(true);
const mockPanelOnDidDispose = vi.fn();
const mockPanelReveal = vi.fn();
const mockPanelDispose = vi.fn();
const mockConfigUpdate = vi.fn().mockResolvedValue(undefined);

function creaPannelloMock() {
    return {
        webview: {
            html: '',
            onDidReceiveMessage: mockWebviewOnDidReceiveMessage,
            postMessage: mockWebviewPostMessage,
            cspSource: 'https://mock.csp.source',
        },
        onDidDispose: mockPanelOnDidDispose,
        reveal: mockPanelReveal,
        dispose: mockPanelDispose,
    };
}

let pannelloCorrenteMock: ReturnType<typeof creaPannelloMock> | undefined;

vi.mock('vscode', () => ({
    window: {
        createWebviewPanel: vi.fn(() => {
            pannelloCorrenteMock = creaPannelloMock();
            return pannelloCorrenteMock;
        }),
    },
    workspace: {
        getConfiguration: vi.fn(() => ({
            update: mockConfigUpdate,
        })),
    },
    ViewColumn: {
        One: 1,
    },
    ConfigurationTarget: {
        Global: 1,
    },
    Uri: {
        joinPath: vi.fn(),
    },
}));

import * as vscode from 'vscode';
import { OnboardingWizardProvider } from '../../../src/ui/OnboardingWizardProvider';

const mockCreateWebviewPanel = vi.mocked(vscode.window.createWebviewPanel);

function creaContestoMock(): vscode.ExtensionContext {
    // Reset store per ogni creazione
    for (const chiave of Object.keys(globalStateStore)) {
        delete globalStateStore[chiave];
    }

    return {
        globalState: {
            get: vi.fn((chiave: string) => globalStateStore[chiave]),
            update: vi.fn((chiave: string, valore: unknown) => {
                globalStateStore[chiave] = valore;
                return Promise.resolve();
            }),
            keys: vi.fn(() => Object.keys(globalStateStore)),
            setKeysForSync: vi.fn(),
        },
        subscriptions: [],
        extensionUri: { fsPath: '/mock/extension' } as any,
    } as unknown as vscode.ExtensionContext;
}

// Helper: simula invio di un messaggio dal webview
function simulaMessaggioDalWebview(messaggio: { type: string; modalita?: string }): void {
    // Il primo argomento della prima chiamata a onDidReceiveMessage è il callback handler
    const handler = mockWebviewOnDidReceiveMessage.mock.calls[
        mockWebviewOnDidReceiveMessage.mock.calls.length - 1
    ][0];
    handler(messaggio);
}

// Helper: simula dispose del pannello
function simulaDisposePannello(): void {
    const disposeHandler = mockPanelOnDidDispose.mock.calls[
        mockPanelOnDidDispose.mock.calls.length - 1
    ][0];
    disposeHandler();
}

describe('OnboardingWizardProvider', () => {
    let contesto: vscode.ExtensionContext;
    let provider: OnboardingWizardProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        pannelloCorrenteMock = undefined;
        contesto = creaContestoMock();
        provider = new OnboardingWizardProvider(contesto);
    });

    // ── TASK-05: Test unitari ──

    describe('deveAprireWizardAlPrimoAvvio', () => {
        it('restituisce true quando il flag onboarding non esiste in globalState', () => {
            expect(provider.deveAprireWizardAlPrimoAvvio()).toBe(true);
        });

        it('restituisce false quando il flag onboarding e\' gia\' stato impostato a true', async () => {
            await provider.segnaWizardCompletato();

            // Ricreo il provider con lo stesso contesto per verificare persistenza
            const nuovoProvider = new OnboardingWizardProvider(contesto);
            expect(nuovoProvider.deveAprireWizardAlPrimoAvvio()).toBe(false);
        });
    });

    describe('apriWizard — creazione pannello', () => {
        it('crea un nuovo WebviewPanel alla prima chiamata', () => {
            provider.apriWizard();

            expect(mockCreateWebviewPanel).toHaveBeenCalledOnce();
            expect(mockCreateWebviewPanel).toHaveBeenCalledWith(
                'git-enhanced.onboarding',
                'Get Started — Git Enhanced',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                })
            );
        });

        it('chiama reveal() sul pannello esistente invece di crearne un nuovo', () => {
            provider.apriWizard();
            provider.apriWizard();

            expect(mockCreateWebviewPanel).toHaveBeenCalledOnce();
            expect(mockPanelReveal).toHaveBeenCalledOnce();
        });

        it('imposta il contenuto HTML nel webview con CSP e nonce', () => {
            provider.apriWizard();

            expect(pannelloCorrenteMock!.webview.html).toContain('Content-Security-Policy');
            expect(pannelloCorrenteMock!.webview.html).toContain('nonce-');
            expect(pannelloCorrenteMock!.webview.html).toContain('Get Started');
        });
    });

    describe('gestione messaggi dal webview', () => {
        it('salva modalita attivazione auto nella configurazione globale', async () => {
            provider.apriWizard();
            simulaMessaggioDalWebview({ type: 'salvaModalitaAttivazione', modalita: 'auto' });

            // Attendiamo che il handler async completi
            await vi.waitFor(() => {
                expect(mockConfigUpdate).toHaveBeenCalledWith(
                    'activationMode',
                    'auto',
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        it('salva modalita attivazione manual nella configurazione globale', async () => {
            provider.apriWizard();
            simulaMessaggioDalWebview({ type: 'salvaModalitaAttivazione', modalita: 'manual' });

            await vi.waitFor(() => {
                expect(mockConfigUpdate).toHaveBeenCalledWith(
                    'activationMode',
                    'manual',
                    vscode.ConfigurationTarget.Global
                );
            });
        });

        it('imposta il flag onboardingCompletato a true quando il wizard viene completato', async () => {
            provider.apriWizard();
            simulaMessaggioDalWebview({ type: 'wizardCompletato' });

            await vi.waitFor(() => {
                expect(contesto.globalState.update).toHaveBeenCalledWith(
                    'git-enhanced.onboardingCompletato',
                    true
                );
            });
        });

        it('imposta il flag onboardingCompletato a true quando il wizard viene skippato', async () => {
            provider.apriWizard();
            simulaMessaggioDalWebview({ type: 'wizardSkippato' });

            await vi.waitFor(() => {
                expect(contesto.globalState.update).toHaveBeenCalledWith(
                    'git-enhanced.onboardingCompletato',
                    true
                );
            });
        });

        it('ignora messaggi con tipo sconosciuto senza errori ne side-effect', () => {
            provider.apriWizard();

            // Non deve lanciare eccezioni
            expect(() => {
                simulaMessaggioDalWebview({ type: 'tipoInesistente' });
            }).not.toThrow();

            expect(mockConfigUpdate).not.toHaveBeenCalled();
            expect(contesto.globalState.update).not.toHaveBeenCalled();
        });
    });

    describe('dispose e riapertura', () => {
        it('dopo dispose del pannello, una nuova chiamata a apriWizard crea un nuovo pannello', () => {
            provider.apriWizard();
            expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);

            // Simula la chiusura del pannello
            simulaDisposePannello();

            // Riapertura: deve creare un nuovo pannello
            provider.apriWizard();
            expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(2);
        });
    });

    // ── TASK-06: Test flusso integrato ──

    describe('flusso integrato wizard + extension', () => {
        it('primo avvio apre wizard, completamento impedisce riapertura automatica al secondo avvio', async () => {
            // Primo avvio: il wizard deve aprirsi automaticamente
            expect(provider.deveAprireWizardAlPrimoAvvio()).toBe(true);
            provider.apriWizard();
            expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);

            // Scelta modalita e completamento
            simulaMessaggioDalWebview({ type: 'salvaModalitaAttivazione', modalita: 'auto' });
            simulaMessaggioDalWebview({ type: 'wizardCompletato' });

            await vi.waitFor(() => {
                expect(contesto.globalState.update).toHaveBeenCalledWith(
                    'git-enhanced.onboardingCompletato',
                    true
                );
            });

            // Secondo avvio: il wizard non deve aprirsi automaticamente
            const nuovoProvider = new OnboardingWizardProvider(contesto);
            expect(nuovoProvider.deveAprireWizardAlPrimoAvvio()).toBe(false);
        });

        it('il comando openOnboarding riapre il wizard indipendentemente dal flag di completamento', async () => {
            // Completa il wizard
            await provider.segnaWizardCompletato();
            expect(provider.deveAprireWizardAlPrimoAvvio()).toBe(false);

            // Il comando apre comunque il wizard (apriWizard non controlla il flag)
            provider.apriWizard();
            expect(mockCreateWebviewPanel).toHaveBeenCalledOnce();
            expect(pannelloCorrenteMock!.webview.html).toContain('Step 1 of 3');
        });
    });

    // ── US-023: Skip wizard e riapertura da Command Palette ──

    describe('US-023: Skip wizard e riapertura da Command Palette', () => {
        it('il pulsante Skip e\' presente nell\'HTML generato del wizard', () => {
            provider.apriWizard();

            const html = pannelloCorrenteMock!.webview.html;
            expect(html).toContain('skipWizard()');
            expect(html).toContain('Skip setup');
        });

        it('apriWizard invia il messaggio resetAllaSchermataIniziale quando il pannello e\' gia\' aperto', () => {
            // Prima apertura: crea il pannello
            provider.apriWizard();
            expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1);
            expect(mockWebviewPostMessage).not.toHaveBeenCalled();

            // Seconda apertura: reveal + reset
            provider.apriWizard();
            expect(mockCreateWebviewPanel).toHaveBeenCalledTimes(1); // non crea un nuovo pannello
            expect(mockPanelReveal).toHaveBeenCalledOnce();
            expect(mockWebviewPostMessage).toHaveBeenCalledWith({
                type: 'resetAllaSchermataIniziale',
            });
        });

        it('il comando riapre il wizard dalla schermata 1 anche dopo il completamento', async () => {
            // Completa il wizard
            await provider.segnaWizardCompletato();
            expect(provider.deveAprireWizardAlPrimoAvvio()).toBe(false);

            // Riapertura: apriWizard non controlla il flag di completamento
            provider.apriWizard();
            expect(mockCreateWebviewPanel).toHaveBeenCalledOnce();

            // L'HTML contiene la schermata 1 attiva di default
            const html = pannelloCorrenteMock!.webview.html;
            expect(html).toContain('id="step1"');
            expect(html).toContain('step-panel active');
        });

        it('il messaggio wizardSkippato segna il wizard come completato e chiude il pannello', async () => {
            provider.apriWizard();
            simulaMessaggioDalWebview({ type: 'wizardSkippato' });

            await vi.waitFor(() => {
                expect(contesto.globalState.update).toHaveBeenCalledWith(
                    'git-enhanced.onboardingCompletato',
                    true
                );
                expect(mockPanelDispose).toHaveBeenCalled();
            });
        });

        it('l\'HTML del webview contiene il listener per il messaggio resetAllaSchermataIniziale', () => {
            provider.apriWizard();

            const html = pannelloCorrenteMock!.webview.html;
            expect(html).toContain('resetAllaSchermataIniziale');
            expect(html).toContain('window.addEventListener');
        });
    });
});
