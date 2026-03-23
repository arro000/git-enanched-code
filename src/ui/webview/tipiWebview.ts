/** Tipi condivisi per i moduli webview del merge editor. */

export interface Segmento {
    tipo: 'comune' | 'conflitto';
    contenuto?: string;
    indice?: number;
    head?: string;
    base?: string | null;
    merging?: string;
}

export interface StatoConflitto {
    headGestito: boolean;
    mergingGestito: boolean;
    contenutoApplicato: string | null;
    rigaFineApplicato?: number;
}

export interface ConflittoParseato {
    index: number;
    startLine: number;
    endLine: number;
    head: string;
    base: string | null;
    merging: string;
}

export interface RisoluzionePending {
    indiceConflitto: number;
    resolvedContent: string;
    sorgente?: 'diff3-auto' | 'ast-auto';
    scoreConfidenza?: number;
}

export interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
    interface Window {
        __MONACO_BASE_URI__: string;
        __LINGUAGGIO_ID__: string;
        _risoluzioniPending: RisoluzionePending[];
        _risoluzioniDisponibili: Record<number, RisoluzionePending>;
    }
    function acquireVsCodeApi(): VsCodeApi;
    const monaco: any;
}
