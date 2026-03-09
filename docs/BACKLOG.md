# Git Enhanced — Product Backlog

**Generato da:** AIRchetipo Backlog Skill
**Data:** 2026-03-02
**PRD sorgente:** docs/PRD.md
**Versione:** 1.0

---

## Riepilogo Backlog

| Epic | Titolo | Storie | Story Points | Scope |
|---|---|---|---|---|
| EP-001 | Foundation & Git Integration | 5 | 12 | MVP |
| EP-002 | Layout 3 Colonne & Monaco Editor | 6 | 13 | MVP |
| EP-003 | Smart Merge Engine | 5 | 14 | Growth |
| EP-004 | Minimap & Navigazione | 5 | 9 | Growth |
| EP-005 | Onboarding & Configurazione | 2 | 4 | Growth |
| EP-006 | CI/CD & Distribuzione | 3 | 7 | Vision |

**Storie totali:** 26
**Story points totali:** 59
**Storie MVP:** 11 (25pt)

---

## Note di Prioritizzazione

- Le storie di EP-001 e EP-002 sono tutte HIGH perché costituiscono il nucleo funzionale del v0.1.0 senza cui l'estensione non può essere usata: l'intercettazione del conflitto e il layout 3 colonne sono prerequisiti di tutto il resto.
- EP-001 è interamente bloccante per EP-002: il parsing corretto dei conflict markers deve esistere prima che il layout possa mostrare i contenuti nelle 3 colonne.
- EP-002 (layout + Monaco + chunk) deve essere completo prima che EP-003 (Smart Merge) abbia senso: la bacchetta magica ha bisogno della colonna centrale editabile per applicare le risoluzioni.
- EP-003 (Smart Merge, diff3 + Tree-sitter) è priorità Growth ma ad alta densità di valore: > 60% dei conflitti auto-risolti è un KPI esplicito del PRD e differenzia il tool dai competitor.
- EP-006 (CI/CD e pubblicazione Marketplace) è classificato Vision perché non impatta l'utente finale direttamente, ma è condizione necessaria per il lancio pubblico v1.0.0; la storia US-025 (pubblicazione automatica) è HIGH per garantire la ripetibilità dei rilasci.

---

## Epici & User Stories

---

### EP-001: Foundation & Git Integration

> Intercettare i merge conflict, parsare i dati, gestire il completamento e garantire la resilienza dell'estensione.
> **Scope:** MVP | **Storie:** 5 | **Story Points:** 12

---

#### US-001: Intercettazione automatica dei merge conflict

**Epic:** EP-001 | **Priority:** HIGH | **Story Points:** 3

**Story**
Come Marco (Senior Developer),
voglio che l'estensione intercetti automaticamente ogni merge conflict rilevato da VS Code,
in modo da non dover aprire manualmente il merge editor e mantenere il flusso di lavoro ininterrotto.

**Acceptance Criteria**
- [x] Quando VS Code rileva un file in stato di merge conflict, il merge editor custom viene aperto entro 500ms al posto dell'editor nativo
- [x] Se l'utente ha selezionato la modalità manuale nel wizard, l'editor nativo rimane il default e il merge editor custom è invocabile da Command Palette
- [x] L'intercettazione funziona su tutti i file contenenti conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)

**Tasks**
- [x] **TASK-001.1** — Scaffolding extension: creare `package.json` con `activationEvents`, `contributes.commands` e `contributes.configuration`; creare `tsconfig.json` e la struttura di cartelle `src/core/git/`, `src/ui/`, `src/config/`
- [x] **TASK-001.2** — Implementare `src/core/git/ConflictDetector.ts`: funzione `hasConflictMarkers(document: TextDocument): boolean` che verifica la presenza di `<<<<<<<`, `=======`, `>>>>>>>`
- [x] **TASK-001.3** — Implementare `src/config/ConfigManager.ts`: legge l'impostazione `gitEnhanced.activationMode` (`"auto"` | `"manual"`) da `vscode.workspace.getConfiguration`
- [x] **TASK-001.4** — Implementare `src/extension.ts`: registrare il listener `vscode.workspace.onDidOpenTextDocument`; in modalità `auto`, se `hasConflictMarkers` è true, eseguire il comando di apertura editor custom entro 500ms
- [x] **TASK-001.5** — Implementare `src/ui/MergeEditorProvider.ts`: stub `CustomEditorProvider` registrato come `git-enhanced.mergeEditor`; apre un `WebviewPanel` placeholder con il titolo "Git Enhanced — Merge Editor"
- [x] **TASK-001.6** — Registrare il comando `git-enhanced.openMergeEditor` nella Command Palette (modalità manuale): invoca `MergeEditorProvider` sul file attivo
- [x] **TASK-001.7** — Scrivere test unitari `test/unit/core/git/ConflictDetector.test.ts` con Vitest: file con 0, 1 e N conflitti, file senza markers, file binario

---

#### US-002: Parsing dei conflict markers in HEAD, BASE e MERGING

**Epic:** EP-001 | **Priority:** HIGH | **Story Points:** 2

**Story**
Come developer,
voglio che il file con conflict markers venga parsato correttamente nelle 3 componenti (HEAD, BASE, MERGING) per ogni conflitto rilevato nel file,
in modo che le colonne del merge editor mostrino i contenuti corretti e senza artefatti.

**Acceptance Criteria**
- [x] Per ogni conflitto nel file, HEAD, BASE e MERGING vengono estratti correttamente dai markers `<<<<<<<`, `=======`, `>>>>>>>`
- [x] Il parsing gestisce correttamente file con più conflitti simultanei (N ≥ 1)
- [x] Il file originale con conflict markers rimane intatto fino al completamento esplicito del merge

**Tasks**
- [x] **TASK-002.1** — Creare `src/core/git/ConflictParser.ts`: state machine `OUTSIDE → IN_HEAD → IN_BASE → IN_MERGING`, supporto formato standard (2-way) e diff3 (3-way con `|||||||`), blocchi malformati ignorati
- [x] **TASK-002.2** — Creare `test/unit/core/git/ConflictParser.test.ts`: 13 test (no conflitti, 1 standard, 1 diff3, N conflitti, line numbers, contenuti HEAD/BASE/MERGING, blocchi malformati, sezioni vuote)

---

#### US-003: Completamento merge con salvataggio e git add

**Epic:** EP-001 | **Priority:** HIGH | **Story Points:** 2

**Story**
Come Marco (Senior Developer),
voglio che al completamento della risoluzione il file venga salvato e `git add` venga eseguito automaticamente,
in modo da non dover uscire dall'editor per finalizzare l'operazione git.

**Acceptance Criteria**
- [x] Al click su "Complete Merge" senza conflitti aperti, il file viene salvato e `git add <filepath>` viene eseguito con successo
- [x] L'operazione di completamento è confermata all'utente con un messaggio di successo visibile
- [x] In caso di errore nell'esecuzione di `git add`, l'utente riceve un messaggio di errore chiaro senza perdita del contenuto risolto

**Tasks**
- [x] **TASK-003.1** — Creare `src/core/git/MergeCompletionService.ts`: verifica assenza conflict markers, salva il documento, esegue `git add` tramite `simple-git`
- [x] **TASK-003.2** — Registrare il comando `git-enhanced.completeMerge` in `package.json` e `extension.ts`
- [x] **TASK-003.3** — Aggiungere listener `onDidReceiveMessage` in `MergeEditorProvider.ts` per il messaggio `completaMerge` dal webview
- [x] **TASK-003.4** — Aggiungere pulsante "Complete Merge" nel webview HTML placeholder
- [x] **TASK-003.5** — Scrivere test unitari `test/unit/core/git/MergeCompletionService.test.ts` (7 test: conflitti presenti, workspace mancante, successo, errore save, errore git add, ordine operazioni, nessuna modifica con conflitti)

---

#### US-004: Fallback automatico all'editor nativo in caso di errore

**Epic:** EP-001 | **Priority:** HIGH | **Story Points:** 2

**Story**
Come developer,
voglio che se l'estensione fallisce per qualsiasi ragione venga attivato un fallback automatico all'editor nativo di VS Code,
in modo da non essere mai bloccato nel mio workflow anche quando Git Enhanced ha un problema.

**Acceptance Criteria**
- [x] Se l'estensione genera un errore non gestito durante l'apertura, VS Code apre automaticamente il suo editor nativo di merge
- [x] Il file originale con conflict markers non viene modificato in nessun caso durante un fallback
- [x] L'utente riceve una notifica che indica che il fallback è avvenuto e il motivo (se disponibile)

**Tasks**
- [x] **TASK-004.1** — Creare `src/core/git/FallbackService.ts`: apre il file nell'editor nativo con fallback a `showTextDocument`, notifica l'utente con il motivo
- [x] **TASK-004.2** — Integrare `FallbackService` in `extension.ts` (`handleFallback`) con passaggio della URI del documento
- [x] **TASK-004.3** — Wrappare `resolveCustomTextEditor` e `onDidReceiveMessage` in `MergeEditorProvider.ts` con try/catch + fallback
- [x] **TASK-004.4** — Aggiungere Content Security Policy nel webview HTML e sanitizzare il fileName (prevenzione XSS)
- [x] **TASK-004.5** — Scrivere test unitari `test/unit/core/git/FallbackService.test.ts` (7 test: warning message, apertura editor, risultato fallback, errori stringa, fallback secondario, nessuna eccezione, nessuna modifica file)

---

#### US-005: Persistenza dello stato di risoluzione parziale

**Epic:** EP-001 | **Priority:** MEDIUM | **Story Points:** 3

**Story**
Come developer,
voglio che se chiudo e riapro un file durante un merge in corso lo stato della risoluzione parziale venga ripristinato,
in modo da non perdere il lavoro già fatto quando interrompo e riprendo una sessione di merge.

**Acceptance Criteria**
- [x] Quando il file viene riaperto durante un merge in corso, le risoluzioni già applicate nella colonna centrale vengono ripristinate correttamente
- [x] I conflitti già risolti appaiono come risolti nella minimap e nel contatore
- [x] I conflitti ancora aperti vengono mostrati correttamente come irrisolti

**Tasks**
- [x] **TASK-005.1** — Creare `src/core/merge/MergeSessionStateManager.ts`: interfacce `StatoRisoluzioneConflitto` e `StatoSessioneMerge`, gestione salvataggio/recupero/cancellazione stato tramite `workspaceState`, validazione hash contenuto
- [x] **TASK-005.2** — Integrare `MergeSessionStateManager` in `MergeEditorProvider.ts`: recupero stato all'apertura, salvataggio iniziale, aggiornamento su messaggio `aggiornaStato`, cancellazione su merge completato
- [x] **TASK-005.3** — Validare `percorsoFile` nei messaggi `aggiornaStato` dal webview (prevenzione state poisoning)
- [x] **TASK-005.4** — Scrivere test unitari `test/unit/core/merge/MergeSessionStateManager.test.ts` (18 test: hash, stato iniziale, salvataggio/recupero, invalidazione, cancellazione, conteggio conflitti, 3 scenari AC)

---

### EP-002: Layout 3 Colonne & Monaco Editor

> Realizzare il layout visivo principale a 3 colonne con editing completo nella colonna centrale tramite Monaco Editor.
> **Scope:** MVP | **Storie:** 6 | **Story Points:** 13

---

#### US-006: Layout visivo a 3 colonne con label e separazione

**Epic:** EP-002 | **Priority:** HIGH | **Story Points:** 3

**Story**
Come Marco (Senior Developer),
voglio vedere le 3 colonne (HEAD / RESULT / MERGING) chiaramente separate, etichettate e dimensionate,
in modo da orientarmi immediatamente nel layout e capire il ruolo di ciascuna colonna senza leggere documentazione.

**Acceptance Criteria**
- [x] Le 3 colonne sono affiancate e visivamente distinte con label rispettivamente "HEAD / Il tuo codice", "Result" e "MERGING / Codice in arrivo"
- [x] Le colonne sinistra e destra sono in modalità read-only (nessun cursore di testo editabile da parte dell'utente)
- [x] Il layout non presenta overflow orizzontale indesiderato su schermi con larghezza ≥ 1280px

---

#### US-007: Editing libero con Monaco Editor nella colonna centrale

**Epic:** EP-002 | **Priority:** HIGH | **Story Points:** 3

**Story**
Come Sara (Full Stack Developer),
voglio editare liberamente il testo nella colonna centrale con Monaco Editor con syntax highlighting e IntelliSense attivi,
in modo da avere un'esperienza di editing di qualità professionale durante la risoluzione dei conflitti.

**Acceptance Criteria**
- [x] Monaco Editor è funzionale nella colonna centrale: syntax highlighting attivo, IntelliSense disponibile per i linguaggi supportati
- [x] Il cursore è posizionabile e il testo è editabile liberamente nell'intera colonna centrale, non solo nelle aree dei chunk applicati
- [x] Monaco Editor non introduce latenza percettibile durante la digitazione normale

---

#### US-008: Applicazione chunk da colonna sinistra con >> e x

**Epic:** EP-002 | **Priority:** HIGH | **Story Points:** 2

**Story**
Come developer,
voglio applicare un chunk dalla colonna sinistra verso la centrale con il pulsante `>>` e scartarlo con `x`,
in modo da includere o escludere le modifiche HEAD in modo semplice e diretto.

**Acceptance Criteria**
- [x] Il click su `>>` nella colonna sinistra copia il contenuto del chunk HEAD nella posizione corrispondente della colonna centrale
- [x] Il click su `x` nella colonna sinistra scarta il chunk HEAD (non viene incluso nella colonna centrale)
- [x] Dopo l'applicazione o lo scarto, il conflitto nella colonna sinistra viene marcato visivamente come gestito

---

#### US-009: Applicazione chunk da colonna destra con << e x

**Epic:** EP-002 | **Priority:** HIGH | **Story Points:** 2

**Story**
Come developer,
voglio applicare un chunk dalla colonna destra verso la centrale con il pulsante `<<` e scartarlo con `x`,
in modo da includere o escludere le modifiche MERGING in modo semplice e diretto.

**Acceptance Criteria**
- [x] Il click su `<<` nella colonna destra copia il contenuto del chunk MERGING nella posizione corrispondente della colonna centrale
- [x] Il click su `x` nella colonna destra scarta il chunk MERGING
- [x] Dopo l'applicazione o lo scarto, il conflitto nella colonna destra viene marcato visivamente come gestito

---

#### US-010: Accodamento chunk quando entrambe le colonne vengono applicate

**Epic:** EP-002 | **Priority:** HIGH | **Story Points:** 2

**Story**
Come developer,
quando applico chunk da entrambe le colonne sullo stesso conflitto voglio che il secondo chunk si accodi al primo nella colonna centrale senza separatori visivi aggiuntivi,
in modo da ottenere un risultato pulito che non richiede post-editing per rimuovere artefatti visivi.

**Acceptance Criteria**
- [x] Se `>>` e `<<` vengono applicati entrambi sullo stesso conflitto, i contenuti di entrambe le colonne appaiono in sequenza nella colonna centrale
- [x] Nessun separatore visivo o marker di testo viene inserito tra i due chunk accodati
- [x] L'ordine di accodamento riflette l'ordine dei click (il secondo click accoda dopo il primo)

---

#### US-011: Popup di conferma Complete Merge con conflitti ancora aperti

**Epic:** EP-002 | **Priority:** HIGH | **Story Points:** 1

**Story**
Come developer,
voglio che il pulsante "Complete Merge" mostri un popup di conferma con il conteggio dei conflitti residui se ne esistono ancora di aperti,
in modo da evitare di completare accidentalmente un merge lasciando conflitti irrisolti nel file.

**Acceptance Criteria**
- [ ] Se "Complete Merge" viene cliccato con almeno un conflitto aperto, appare un popup con il messaggio "Ci sono ancora X conflitti irrisolti. Vuoi procedere comunque?" e opzioni Conferma / Annulla
- [ ] Se non ci sono conflitti aperti, il merge viene completato direttamente senza popup
- [ ] Il click su Annulla chiude il popup e lascia l'editor esattamente nello stato precedente

---

### EP-003: Smart Merge Engine

> Implementare diff3 e Tree-sitter AST per la risoluzione automatica intelligente dei conflitti con bacchetta magica.
> **Scope:** Growth | **Storie:** 5 | **Story Points:** 14

---

#### US-012: Auto-resolve con diff3 (Layer 1)

**Epic:** EP-003 | **Priority:** HIGH | **Story Points:** 3

**Story**
Come Marco (Senior Developer),
voglio che le modifiche non sovrapposte vengano identificate e risolte automaticamente tramite diff3 prima che interagisca con l'editor,
in modo da trovare la colonna centrale già parzialmente popolata con le risoluzioni ovvie e concentrarmi solo sui conflitti genuinamente complessi.

**Acceptance Criteria**
- [ ] All'apertura dell'editor, diff3 analizza il file e identifica le modifiche non sovrapposte tra HEAD, BASE e MERGING
- [ ] Le modifiche non sovrapposte vengono pre-applicate nella colonna centrale con confidenza massima, senza intervento dell'utente
- [ ] L'analisi diff3 si completa entro 200ms per file fino a 5.000 righe

---

#### US-013: Analisi AST con Tree-sitter per conflitti residui (Layer 2)

**Epic:** EP-003 | **Priority:** HIGH | **Story Points:** 5

**Story**
Come Marco (Senior Developer),
voglio che Tree-sitter analizzi i conflitti rimanenti dopo diff3 e proponga risoluzioni semanticamente corrette,
in modo da risolvere automaticamente anche i conflitti che diff3 non riesce a gestire senza necessità di review manuale caso per caso.

**Acceptance Criteria**
- [ ] Tree-sitter analizza la struttura AST del codice nei conflitti non risolti da diff3
- [ ] Se le modifiche sono semanticamente compatibili (es. aggiunta di metodi in classi diverse, import non sovrapposti), viene proposta una risoluzione con score di confidenza calcolato
- [ ] L'analisi AST si completa entro 1s per file fino a 5.000 righe

---

#### US-014: Bacchetta magica — applicazione di tutte le risoluzioni automatiche

**Epic:** EP-003 | **Priority:** HIGH | **Story Points:** 2

**Story**
Come Sara (Full Stack Developer),
voglio cliccare la bacchetta magica per applicare tutte le risoluzioni automatiche disponibili in una sola azione,
in modo da risolvere rapidamente la maggioranza dei conflitti senza doverli gestire uno per uno.

**Acceptance Criteria**
- [ ] Il click sull'icona bacchetta magica applica nella colonna centrale tutte le risoluzioni identificate da diff3 e Tree-sitter
- [ ] Nessuna risoluzione automatica viene applicata prima del click esplicito sulla bacchetta
- [ ] L'azione è reversibile tramite Ctrl+Z (undo) nella colonna centrale Monaco Editor

---

#### US-015: Tooltip bacchetta magica con conteggio e indicatore di confidenza

**Epic:** EP-003 | **Priority:** MEDIUM | **Story Points:** 1

**Story**
Come developer,
voglio che il tooltip della bacchetta mostri "X conflitti risolvibili su Y totali" con un indicatore di confidenza,
in modo da sapere quanti conflitti verranno risolti automaticamente e con quale affidabilità prima di cliccare.

**Acceptance Criteria**
- [ ] Il tooltip appare all'hover sull'icona bacchetta magica
- [ ] Il tooltip mostra il conteggio nel formato "X risolvibili su Y totali"
- [ ] Il tooltip include un indicatore di confidenza (es. percentuale o livello testuale: alta / media / bassa)

---

#### US-016: Supporto grammar Tree-sitter per tutti i linguaggi target

**Epic:** EP-003 | **Priority:** HIGH | **Story Points:** 3

**Story**
Come developer,
voglio che l'analisi AST supporti correttamente TypeScript, JavaScript (JSX/TSX/Vue/Angular), C#, Java, Kotlin e Rust,
in modo da beneficiare dello smart merge nei linguaggi che uso quotidianamente senza installare plugin aggiuntivi.

**Acceptance Criteria**
- [ ] Tree-sitter carica correttamente le grammar per tutti e 6 i linguaggi target (TS, JS/JSX/TSX, C#, Java, Kotlin, Rust)
- [ ] `LanguageDetector` identifica il linguaggio corretto dal file prima di avviare l'analisi AST
- [ ] Per file in un linguaggio non supportato, l'analisi AST viene saltata silenziosamente e diff3 rimane l'unico layer attivo senza errori

---

### EP-004: Minimap & Navigazione

> Fornire orientamento visivo rapido tramite minimap e navigazione efficiente tra i conflitti con shortcut e click.
> **Scope:** Growth | **Storie:** 5 | **Story Points:** 9

---

#### US-017: Minimap laterale con highlight stato conflitti

**Epic:** EP-004 | **Priority:** HIGH | **Story Points:** 3

**Story**
Come developer,
voglio una minimap laterale con highlight verde/grigio/rosso per visualizzare lo stato di tutti i conflitti nel file,
in modo da avere sempre una visione d'insieme e capire immediatamente quanti conflitti restano e dove si trovano.

**Acceptance Criteria**
- [ ] La minimap mostra una rappresentazione proporzionale del file con highlight: verde (codice aggiunto/risolto), grigio (codice rimosso), rosso (conflitto ancora aperto)
- [ ] La minimap si aggiorna in tempo reale quando i chunk vengono applicati, scartati o risolti automaticamente
- [ ] La minimap è sempre visibile sul lato destro dell'editor indipendentemente dalla posizione di scroll del documento

---

#### US-018: Contatore numerico conflitti aperti persistente

**Epic:** EP-004 | **Priority:** HIGH | **Story Points:** 1

**Story**
Come developer,
voglio un contatore numerico persistente dei conflitti ancora aperti visibile in ogni momento,
in modo da monitorare il progresso della risoluzione senza dover scorrere il documento per stimare quanti ne restano.

**Acceptance Criteria**
- [ ] Il contatore mostra il numero esatto di conflitti ancora aperti
- [ ] Il contatore si aggiorna in tempo reale quando un conflitto viene risolto o scartato
- [ ] Il contatore è posizionato sopra o a fianco della minimap in posizione fissa (non scorribile con il documento)

---

#### US-019: Navigazione al conflitto successivo/precedente con F7/Shift+F7

**Epic:** EP-004 | **Priority:** HIGH | **Story Points:** 2

**Story**
Come Marco (Senior Developer),
voglio saltare al conflitto successivo con F7 e al precedente con Shift+F7,
in modo da navigare rapidamente tra i conflitti senza usare il mouse e mantenere il flusso da tastiera.

**Acceptance Criteria**
- [ ] F7 sposta il focus e lo scroll al conflitto successivo nel documento (ordine top-down)
- [ ] Shift+F7 sposta il focus e lo scroll al conflitto precedente
- [ ] Quando non ci sono altri conflitti nella direzione di navigazione, il cursore rimane sull'ultimo conflitto disponibile (nessun ciclo)

---

#### US-020: Click su minimap per navigazione diretta nel documento

**Epic:** EP-004 | **Priority:** MEDIUM | **Story Points:** 2

**Story**
Come developer,
voglio cliccare su qualsiasi punto della minimap per saltare direttamente a quella posizione nel documento,
in modo da raggiungere rapidamente qualsiasi conflitto senza dover scorrere manualmente file lunghi.

**Acceptance Criteria**
- [ ] Il click su un punto della minimap esegue lo scroll del documento alla posizione corrispondente nella colonna principale
- [ ] Il click su un'area rossa (conflitto aperto) porta direttamente a quel conflitto nella viewport principale
- [ ] Il cursore sulla minimap si trasforma in pointer per indicare che è interattiva

---

#### US-021: Navigazione scroll/trackpad naturale e sincronizzata

**Epic:** EP-004 | **Priority:** MEDIUM | **Story Points:** 1

**Story**
Come developer,
voglio navigare il documento con scroll del mouse o trackpad in modo naturale e sincronizzato tra le colonne,
in modo da non dover gestire tre scroll separati e mantenere l'allineamento visivo tra HEAD, RESULT e MERGING.

**Acceptance Criteria**
- [ ] Lo scroll del mouse o trackpad naviga il documento nelle colonne in modo lineare e senza lag percettibile
- [ ] Le 3 colonne si sincronizzano alla stessa posizione verticale durante lo scroll
- [ ] Non sono presenti comportamenti di snap o auto-scroll non richiesti durante la navigazione manuale

---

### EP-005: Onboarding & Configurazione

> Garantire una prima esperienza utente eccellente con un wizard guidato e la possibilità di configurare il comportamento dell'estensione.
> **Scope:** Growth | **Storie:** 2 | **Story Points:** 4

---

#### US-022: Wizard onboarding a 3 schermate al primo avvio

**Epic:** EP-005 | **Priority:** HIGH | **Story Points:** 3

**Story**
Come Sara (Full Stack Developer),
al primo avvio voglio vedere un wizard di 3 schermate che spiega il layout e mi permette di scegliere il comportamento di apertura,
in modo da capire rapidamente come usare Git Enhanced e configurarlo secondo le mie preferenze senza leggere documentazione esterna.

**Acceptance Criteria**
- [ ] Il wizard si apre automaticamente al primo avvio dell'estensione (rilevato tramite flag in storage)
- [ ] Le 3 schermate coprono: (1) presentazione + spiegazione visiva del layout 3 colonne, (2) scelta comportamento apertura automatico/manuale, (3) riepilogo shortcut principali (F7, Shift+F7, `>>`, `<<`, `x`)
- [ ] L'intero wizard è completabile in meno di 2 minuti

---

#### US-023: Skip wizard e riapertura da Command Palette

**Epic:** EP-005 | **Priority:** HIGH | **Story Points:** 1

**Story**
Come developer,
voglio poter saltare il wizard con un pulsante Skip sempre visibile e riaprirlo in qualsiasi momento tramite Command Palette,
in modo da non essere obbligato a seguire il wizard se non ne ho bisogno e poterlo consultare quando voglio.

**Acceptance Criteria**
- [ ] Il pulsante "Skip" è visibile in ogni schermata del wizard
- [ ] Il comando `Git Enhanced: Open Onboarding` è disponibile nella Command Palette
- [ ] L'esecuzione del comando riapre il wizard dalla schermata 1 indipendentemente dal fatto che sia già stato completato in precedenza

---

### EP-006: CI/CD & Distribuzione

> Automatizzare il testing su ogni PR, il rilascio su tag versione e predisporre la documentazione per contributor esterni.
> **Scope:** Vision | **Storie:** 3 | **Story Points:** 7

---

#### US-024: GitHub Actions per test automatici su ogni PR

**Epic:** EP-006 | **Priority:** MEDIUM | **Story Points:** 2

**Story**
Come maintainer del progetto,
voglio che i test vengano eseguiti automaticamente su ogni PR verso main tramite GitHub Actions,
in modo da garantire che nessuna modifica rompa la codebase prima del merge e da avere visibilità immediata sullo stato della test coverage.

**Acceptance Criteria**
- [ ] Un workflow `ci.yml` è configurato e si attiva su ogni PR verso il branch main
- [ ] Il workflow esegue i test unitari e di integrazione e riporta il risultato direttamente sul PR
- [ ] Il workflow verifica che la coverage minima del 70% sia rispettata per i moduli `core/merge` e `core/git`

---

#### US-025: Pubblicazione automatica su VS Code Marketplace e Open VSX

**Epic:** EP-006 | **Priority:** HIGH | **Story Points:** 3

**Story**
Come maintainer del progetto,
voglio che la pubblicazione su VS Code Marketplace e Open VSX Registry avvenga automaticamente al push di un tag versione,
in modo da rilasciare nuove versioni in modo affidabile e ripetibile senza operazioni manuali soggette a errore.

**Acceptance Criteria**
- [ ] Un workflow `publish.yml` si attiva al push di tag con pattern `v*.*.*`
- [ ] Il workflow pubblica l'estensione su VS Code Marketplace tramite `vsce publish`
- [ ] Il workflow pubblica l'estensione su Open VSX Registry tramite `ovsx publish`

---

#### US-026: CONTRIBUTING.md per contributor esterni

**Epic:** EP-006 | **Priority:** LOW | **Story Points:** 2

**Story**
Come contributor open source,
voglio trovare un CONTRIBUTING.md completo con setup locale, architettura e guida per aggiungere grammar Tree-sitter,
in modo da poter contribuire al progetto autonomamente senza dover chiedere aiuto ai maintainer.

**Acceptance Criteria**
- [ ] CONTRIBUTING.md include le istruzioni passo-passo per il setup locale dell'ambiente di sviluppo
- [ ] CONTRIBUTING.md include una descrizione dell'architettura dei moduli principali (`core/git`, `core/merge`, `ui/webview`)
- [ ] CONTRIBUTING.md include una guida per aggiungere una nuova grammar Tree-sitter con esempio concreto

---

## Assunzioni & Domande Aperte

> _Questa sezione raccoglie le assunzioni adottate durante la generazione del backlog e le domande ancora aperte per il team._

- **[ASSUNZIONE]** Le storie di EP-004 (Minimap & Navigazione) e EP-005 (Onboarding) sono classificate come Growth (v0.3.0) coerentemente con il roadmap del PRD, anche se il PRD le include nella Definition of Done per v1.0.0. Il team potrà promuoverle a MVP se ritenuto necessario.
- **[ASSUNZIONE]** US-005 (persistenza stato risoluzione parziale) è stata aggiunta come storia inferred da RNF-04 del PRD, che cita esplicitamente questo requisito. È classificata MEDIUM perché non blocca le storie core ma impatta significativamente l'esperienza utente.
- **[ASSUNZIONE]** Il comportamento di F7 all'ultimo conflitto (US-019) è stato impostato come "rimane sull'ultimo conflitto senza ciclo". Questo è il comportamento IntelliJ che il PRD cita come riferimento, ma il team potrebbe voler decidere diversamente.
- **[OPEN]** Il PRD non specifica se la sincronizzazione delle 3 colonne allo scroll (US-021) debba essere "locked" (le 3 colonne scrollano sempre insieme) o "independent" con una colonna "master" che guida le altre. Questa decisione ha impatto sull'implementazione del WebviewPanel.
- **[OPEN]** La modalità di persistenza dello stato (US-005) non è specificata nel PRD: VS Code `workspaceState`, file temporaneo locale, o altro meccanismo. Da definire in fase di design tecnico.

---

_Backlog generato via AIRchetipo — 2026-03-02_
_26 storie in 6 epici — 59 story points totali_
