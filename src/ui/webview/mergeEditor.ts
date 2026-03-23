/**
 * Entry point per il bundle webview del merge editor.
 * Viene bundlato da esbuild come IIFE per il browser.
 *
 * I valori dinamici (monacoBaseUri, linguaggioId) vengono iniettati
 * dall'extension host come variabili globali window.__MONACO_BASE_URI__
 * e window.__LINGUAGGIO_ID__ in uno <script> inline nell'HTML.
 */
import './mergeEditor.css';

import { configuraMonacoLoader } from './MonacoSetup';
import { inizializzaMessageListener } from './MessageBridge';
import { inizializzaSincronizzazioneScroll } from './ScrollSync';
import { inizializzaModalConferma } from './MergeModal';
import { inizializzaMinimapClick } from './ConflictMinimap/MinimapRenderer';
import { inizializzaBacchettaMagica } from './SuggestionBadge/AutoResolveHandler';
import { navigaAlConflitto } from './ConflictNavigator/ConflictNavigator';
import { chiudiModalConferma } from './MergeModal';

const vscodeApi = acquireVsCodeApi();
const monacoBaseUri = window.__MONACO_BASE_URI__;
const linguaggioId = window.__LINGUAGGIO_ID__;

// Configura Monaco AMD loader
configuraMonacoLoader(monacoBaseUri);

// Inizializza tutti i sottosistemi
inizializzaMessageListener(vscodeApi, linguaggioId);
inizializzaSincronizzazioneScroll();
inizializzaModalConferma(vscodeApi);
inizializzaMinimapClick();
inizializzaBacchettaMagica(vscodeApi);

// Keyboard handler: Escape chiude modal, F7/Shift+F7 naviga conflitti
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { chiudiModalConferma(); }
    if (e.key === 'F7') {
        e.preventDefault();
        if (e.shiftKey) {
            navigaAlConflitto('precedente');
        } else {
            navigaAlConflitto('successivo');
        }
    }
});

// Segnala all'extension host che la webview e' pronta
vscodeApi.postMessage({ command: 'webviewPronta' });
