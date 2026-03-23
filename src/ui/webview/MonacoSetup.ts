/**
 * Configurazione e creazione dell'editor Monaco nella colonna Result.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const require: any;

let monacoEditorInstance: any = null;

export function getMonacoInstance(): any {
    return monacoEditorInstance;
}

/** Configura l'AMD loader di Monaco con il base URI fornito. */
export function configuraMonacoLoader(monacoBaseUri: string): void {
    require.config({ paths: { 'vs': monacoBaseUri + '/vs' } });

    (window as any).MonacoEnvironment = {
        getWorkerUrl: function () {
            return URL.createObjectURL(new Blob(
                ['self.onmessage = function() {}'],
                { type: 'text/javascript' }
            ));
        }
    };
}

/** Crea l'editor Monaco nel container con il contenuto e linguaggio specificati. */
export function creaMonacoEditor(contenutoIniziale: string, linguaggioId: string): void {
    const isDarkTheme = document.body.classList.contains('vscode-dark') ||
                        document.body.classList.contains('vscode-high-contrast');
    monacoEditorInstance = monaco.editor.create(
        document.getElementById('monacoEditorContainer'),
        {
            value: contenutoIniziale,
            language: linguaggioId,
            theme: isDarkTheme ? 'vs-dark' : 'vs',
            readOnly: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            automaticLayout: true,
            wordWrap: 'off',
            renderWhitespace: 'selection',
            fontSize: 13,
            tabSize: 2,
            folding: true,
            glyphMargin: false,
            lineDecorationsWidth: 5,
        }
    );
}

/** Carica Monaco via AMD require e crea l'editor. */
export function inizializzaMonacoEditor(contenutoIniziale: string, linguaggioId: string): void {
    require(['vs/editor/editor.main'], function () {
        creaMonacoEditor(contenutoIniziale, linguaggioId);
    });
}
