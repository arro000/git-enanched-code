# Product Requirements Document
# Git Enhanced - Advanced Merge Editor for VS Code

**Version:** 1.0  
**Date:** 2026-02-23  
**Status:** Approved  
**License:** MIT  
**Distribution:** VS Code Marketplace + Open VSX Registry  

---

## Table of Contents

1. [Vision & Strategic Objectives](#1-vision--strategic-objectives)
2. [Business Model](#2-business-model)
3. [Target Users](#3-target-users)
4. [Success Criteria](#4-success-criteria)
5. [Product Scope](#5-product-scope)
6. [Project Classification](#6-project-classification)
7. [Technical Architecture](#7-technical-architecture)
8. [Functional Requirements](#8-functional-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Epic Breakdown & User Stories](#10-epic-breakdown--user-stories)
11. [Roadmap](#11-roadmap)

---

## 1. Vision & Strategic Objectives

### Vision Statement

Git Enhanced porta su VS Code la qualità del merge editor di IntelliJ IDEA - l'unica feature che ancora trattiene molti developer dal migrare completamente a VS Code come editor primario.

### Il Problema

Il merge editor nativo di VS Code è funzionalmente limitato rispetto agli standard che i developer professionisti si aspettano:

- Nessun layout a 3 colonne con colonna centrale editabile come risultato
- Nessuna risoluzione automatica intelligente basata su analisi sintattica
- Nessuna minimap visiva per orientarsi in file con conflitti multipli
- Navigazione tra conflitti limitata e poco ergonomica

Il risultato è che i developer aprono IntelliJ esclusivamente per gestire i merge, introducendo un context switch costoso che interrompe il flusso di lavoro.

### Obiettivi Strategici

1. **Eliminare il context switch** tra VS Code e IntelliJ durante le operazioni di merge
2. **Ridurre il tempo medio di risoluzione** di un conflitto complesso del 50% rispetto all'editor nativo
3. **Costruire una community** attorno a un tool open source di qualità professionale
4. **Stabilire uno standard** per il merge editing su editor basati su VS Code / Code OSS

---

## 2. Business Model

### Modello di Distribuzione

- **Open Source** sotto licenza MIT
- **Gratuito** per tutti gli utenti, senza limitazioni di feature
- Pubblicato su **VS Code Marketplace** (Microsoft) e **Open VSX Registry** (compatibile con Code OSS, VSCodium, e derivati)

### Rationale

Il modello open source / gratuito è la scelta strategicamente corretta per questa categoria di tool perché:

- Massimizza l'adoption rimuovendo qualsiasi barriera all'ingresso
- Favorisce contributi esterni dalla community (bug fix, nuove grammar Tree-sitter, traduzioni)
- Costruisce credibilità tecnica nel marketplace dove GitLens è il benchmark di riferimento
- Consente alle organizzazioni enterprise di adottare il tool senza procurement process

---

## 3. Target Users

### Profilo Primario: Developer in Team Piccoli

- **Dimensione team:** 2-10 persone
- **Workflow git:** Feature branches con Pull Request (GitHub / GitLab / Bitbucket)
- **Editor primario:** VS Code o derivati (VSCodium, Code OSS)
- **Frequenza conflitti:** ~10 conflitti a settimana per developer
- **Natura conflitti:** Prevalentemente complessi (logica di business, non semplici config file)
- **Linguaggi:** TypeScript, JavaScript (React/Angular/Vue), C#, Java, Kotlin, Rust

### Profilo Secondario: Developer Individuali

Developer freelance o open source contributor che gestiscono repository personali e vogliono un'esperienza di merge di qualità senza dover installare un IDE pesante.

### Anti-target

- Team enterprise con workflow git centralizzati e tool di merge dedicati (es. Beyond Compare, Araxis)
- Developer che usano già IntelliJ come editor primario e sono soddisfatti del suo merge editor
- Developer con flussi di lavoro git lineari (no branch, no merge)

### Personas

**Persona 1 - Marco, Senior Developer**
- 7 anni di esperienza, ha sempre usato IntelliJ ma il team è migrato a VS Code
- Frustrato dalla qualità del merge editor di VS Code, apre IntelliJ solo per i merge
- Vuole: layout 3 colonne, risoluzione automatica intelligente, nessun setup

**Persona 2 - Sara, Full Stack Developer**
- 3 anni di esperienza, usa VS Code nativamente, non ha mai usato IntelliJ
- Non sa cosa si perde, ma sente che i merge le portano via troppo tempo
- Vuole: tool che la guidi, wizard chiaro, shortcut ovvi

---

## 4. Success Criteria

### Metriche di Adozione (12 mesi dal lancio v1.0)

| Metrica | Target |
|---------|--------|
| Installazioni VS Code Marketplace | > 10.000 |
| Rating medio Marketplace | > 4.5 / 5 |
| Stelle GitHub | > 500 |
| Contributi esterni (PR merged) | > 20 |

### Metriche di Qualità

| Metrica | Target |
|---------|--------|
| Crash rate per sessione merge | < 0.1% |
| Tempo apertura editor dal conflitto | < 500ms |
| Conflitti auto-risolti da diff3+AST | > 60% del totale |
| Issue critiche aperte | 0 al lancio v1.0 |

### Definition of Done per v1.0

- Tutte le user story degli Epic 1-5 implementate e testate
- Copertura test core/merge e core/git > 70%
- Wizard onboarding completato e testato con beta tester
- Pubblicato su VS Code Marketplace e Open VSX Registry
- README con installazione, usage e screenshot
- CHANGELOG compilato per ogni versione

---

## 5. Product Scope

### MVP - v0.1.0 (In Scope)

- Layout a 3 colonne con Monaco Editor nella colonna centrale
- Parsing conflict markers e separazione HEAD/BASE/MERGING
- Applicazione chunk con `>>` (sinistra→centrale) e `<<` (destra→centrale)
- Scarto chunk con `x` su entrambe le colonne
- Accodamento chunk quan do entrambe le colonne contribuiscono allo stesso conflitto
- Pulsante "Complete Merge" con popup di conferma se conflitti residui
- Salvataggio file + `git add` al completamento
- Fallback automatico all'editor nativo in caso di errore
- Wizard onboarding (3 schermate, skippable, riapribile da Command Palette)

### v0.2.0 - Smart Merge (In Scope)

- Auto-resolve non-conflicting tramite diff3
- Analisi AST tramite Tree-sitter per 8 linguaggi
- Bacchetta magica: applicazione di tutte le risoluzioni automatiche con un click
- Tooltip bacchetta: "X conflitti risolvibili su Y totali" + confidenza

### v0.3.0 - Navigation & Polish (In Scope)

- Minimap laterale con highlight verde/grigio/rosso
- Contatore numerico conflitti attivi persistente
- Navigazione scroll/trackpad naturale
- Jump next/prev conflitto con F7/Shift+F7
- Click su minimap per jump diretto
- CI/CD GitHub Actions
- Pubblicazione Marketplace e Open VSX

### Fuori Scope (Decisione Esplicita)

- Pattern recognition basato su storico delle risoluzioni precedenti
- Agenti AI opzionali (infrastruttura rimossa, feature considerata per versioni future)
- Integrazione con PR review remota (GitHub/GitLab) - solo merge locale
- Supporto rebase interattivo avanzato (oltre il merge conflict resolution)
- Mobile / tablet
- Linguaggi non in lista (aggiungibili via community contribution)

---

## 6. Project Classification

| Dimensione | Valore |
|-----------|--------|
| Tipo | VS Code Extension |
| Distribuzione | Pubblica, Open Source |
| Licenza | MIT |
| Complessità | Media-Alta (WebviewPanel custom, Monaco embedded, Tree-sitter AST) |
| Dipendenze esterne critiche | VS Code API, simple-git, tree-sitter, Monaco Editor |
| Rischio tecnico principale | Monaco Editor embedded in WebviewPanel (fattibile ma non standard) |
| Piattaforme target | Windows 10+, macOS 12+, Linux Ubuntu 20.04+ |

---

## 7. Technical Architecture

### Pattern Architetturale

**Modular Extension Architecture** con separazione netta tra Extension Host (Node.js) e UI (WebviewPanel + React).

> Nota: Il `CustomTextEditorMerge` nativo di VS Code non è estendibile per un layout custom a 3 colonne. L'approccio WebviewPanel con React è necessario per avere controllo totale su layout, minimap, colori e badge. Monaco Editor viene embedded nel WebviewPanel per mantenere la qualità di editing nella colonna centrale.

### Stack Tecnologico

| Layer | Tecnologia | Versione | Rationale |
|-------|-----------|---------|-----------|
| Linguaggio | TypeScript | 5.4+ | Standard de-facto VS Code extension development |
| Runtime | Node.js | 20.x LTS | Extension Host environment |
| UI Framework | React | 18.2 | Gestione stato e componenti del WebviewPanel |
| Editor Centrale | Monaco Editor | latest | Stesso engine di VS Code: IntelliSense, syntax highlighting |
| Diff Engine | diff3 (via git) | nativo | Auto-resolve modifiche non sovrapposte |
| AST Parser | tree-sitter | 0.22.x | Analisi sintattica cross-linguaggio per smart merge |
| Git Integration | simple-git | 3.x | Wrapper Node.js per git CLI, cross-platform |
| Testing | Vitest + @vscode/test-electron | latest | Unit test + integration test con VS Code API |
| Build | esbuild | latest | Bundle veloce, tree-shaking, singolo output file |
| CI/CD | GitHub Actions | - | Test automatici su PR, publish automatico su tag |

### Grammar Tree-sitter Incluse

`tree-sitter-typescript`, `tree-sitter-javascript` (copre JSX/TSX, Vue template, Angular), `tree-sitter-c-sharp`, `tree-sitter-java`, `tree-sitter-kotlin`, `tree-sitter-rust`

### Struttura Directory

```
git-enhanced/
├── src/
│   ├── extension.ts                    # Entry point, activation events
│   ├── core/
│   │   ├── git/
│   │   │   ├── GitService.ts           # Wrapper simple-git
│   │   │   ├── ConflictParser.ts       # Parse conflict markers (<<<, ===, >>>)
│   │   │   └── MergeOrchestrator.ts    # Coordina il flusso merge end-to-end
│   │   └── merge/
│   │       ├── Diff3Resolver.ts        # Meccanismo 1: auto-resolve non-conflicting
│   │       ├── AstMerger.ts            # Meccanismo 2: analisi Tree-sitter
│   │       ├── ConfidenceScorer.ts     # Calcola confidenza per tooltip bacchetta
│   │       └── LanguageDetector.ts     # Rileva linguaggio dal file per AST
│   ├── ui/
│   │   ├── MergeEditorProvider.ts      # CustomEditorProvider VS Code
│   │   ├── webview/
│   │   │   ├── App.tsx                 # React root
│   │   │   ├── ThreeColumnLayout/      # Layout principale 3 colonne
│   │   │   ├── ConflictMinimap/        # Minimap laterale + contatore
│   │   │   ├── ConflictNavigator/      # F7/Shift+F7 + scroll handling
│   │   │   └── SuggestionBadge/        # Bacchetta magica + tooltip confidenza
│   │   └── commands/
│   │       └── RegisterCommands.ts     # Command palette entries
│   └── config/
│       └── ConfigManager.ts            # Settings estensione (apertura auto/manuale)
├── test/
│   ├── unit/
│   └── integration/
├── .github/
│   └── workflows/
│       ├── ci.yml                      # Test su ogni PR
│       └── publish.yml                 # Publish su tag v*
├── package.json                        # Manifest VS Code + contributes
├── esbuild.config.ts
├── CHANGELOG.md
└── README.md
```

### Decisioni Architetturali

**1. WebviewPanel obbligatorio per layout custom**
Il `TextEditorMerge` nativo non è estendibile. WebviewPanel con React dà controllo totale. Trade-off accettato: perdita IntelliSense nativa compensata da Monaco embedded.

**2. Monaco Editor embedded nel WebviewPanel**
Monaco è già disponibile via `@codeeditor/monaco-editor`. VS Code espone API per condividere il worker, contenendo il peso aggiuntivo nel bundle.

**3. diff3 come primo layer di risoluzione**
Git espone già `git merge-file` con algoritmo diff3. Intercettiamo prima che VS Code apra il suo editor, eseguiamo la risoluzione e presentiamo la colonna centrale già parzialmente popolata.

**4. Tree-sitter come secondo layer (AST)**
Parser universale con grammar stabili per tutti i linguaggi target. Usato da GitHub.com, Zed, Neovim. Binding Node.js disponibili. Un solo engine per tutti i linguaggi.

**5. Bundle unico con esbuild**
Tutto bundlato in un singolo `extension.js`. Target bundle size < 25MB (paragonabile a GitLens).

### Deployment & Distribution

```
Sviluppo → PR → GitHub Actions (test) → Merge main
                                              ↓
                                         Tag v*.*.*
                                              ↓
                              ┌───────────────┴──────────────┐
                              ↓                              ↓
                    VS Code Marketplace              Open VSX Registry
                    (vsce publish)                   (ovsx publish)
```

---

## 8. Functional Requirements

### RF-01 - Apertura Editor

L'estensione è attiva di default all'installazione e intercetta automaticamente ogni evento di merge conflict rilevato da VS Code. Al posto dell'editor nativo viene aperto il merge editor a 3 colonne.

Al primo avvio, un wizard di onboarding (RF-11) permette all'utente di configurare il comportamento: automatico (default) o manuale (solo quando invocato da Command Palette).

**Criterio di accettazione:** Dalla rilevazione del conflitto all'apertura del merge editor < 500ms.

---

### RF-02 - Layout 3 Colonne

Il merge editor presenta tre colonne affiancate:

| Colonna | Label | Modalità | Contenuto |
|---------|-------|----------|-----------|
| Sinistra | HEAD / Il tuo codice | Read-only | Stato del branch corrente |
| Centrale | Result | Editable (Monaco) | Risultato della risoluzione |
| Destra | MERGING / Codice in arrivo | Read-only | Stato del branch in ingresso |

Le colonne sinistra e destra sono read-only. La colonna centrale è pienamente editabile con Monaco Editor (syntax highlighting, IntelliSense).

---

### RF-03 - Auto-resolve con Bacchetta Magica

Il sistema analizza tutti i conflitti nel file tramite diff3 (primo layer) e Tree-sitter AST (secondo layer) e identifica quelli risolvibili automaticamente.

La **bacchetta magica** (icona wand) è il trigger unico per applicare tutte le risoluzioni automatiche disponibili in una sola azione. L'interazione esplicita dell'utente è obbligatoria - nessuna risoluzione automatica viene applicata senza il click sulla bacchetta.

---

### RF-04 - Smart Merge Engine

**Layer 1 - diff3:**
Identifica le modifiche non sovrapposte tra HEAD, BASE e MERGING. Le modifiche che non si sovrappongono vengono considerate auto-risolvibili con confidenza massima.

**Layer 2 - Tree-sitter AST:**
Per i conflitti rimanenti, analizza la struttura sintattica del codice in entrambe le versioni. Se le modifiche sono semanticamente compatibili (es. aggiunta di metodi in classi diverse, import non sovrapposti), propone una risoluzione con confidenza calcolata.

**Tooltip bacchetta magica:**
Mostra "X conflitti risolvibili su Y totali" con indicatore di confidenza. Il tooltip appare al hover sull'icona bacchetta.

---

### RF-05 - Accettazione Blocchi per Chunk

Ogni conflitto irrisolvibile automaticamente presenta i controlli di accettazione sulle colonne laterali:

- **Colonna sinistra:** `>>` applica l'intero chunk verso la centrale | `x` scarta
- **Colonna destra:** `<<` applica l'intero chunk verso la centrale | `x` scarta
- **Accodamento:** Se entrambe le colonne vengono applicate sullo stesso conflitto, il secondo chunk viene accodato al primo nella colonna centrale (non sostituito)
- **Editing libero:** La colonna centrale è sempre editabile con Monaco indipendentemente dai chunk applicati. Nessun separatore visivo viene aggiunto tra chunk accodati.

---

### RF-06 - Minimap Laterale

Barra laterale (lato destro dell'editor) con rappresentazione proporzionale del file:

| Colore | Significato |
|--------|-------------|
| Verde | Codice aggiunto / risolto |
| Grigio | Codice rimosso |
| Rosso | Conflitto ancora aperto / irrisolvibile automaticamente |

Contatore numerico dei conflitti ancora aperti visualizzato in modo persistente sopra o a fianco della minimap.

---

### RF-07 - Navigazione Conflitti

- **Scroll / trackpad:** Navigazione naturale nel documento (comportamento standard)
- **F7:** Salta al conflitto successivo (next conflict)
- **Shift+F7:** Salta al conflitto precedente (prev conflict)
- **Click su minimap:** Salta direttamente alla posizione corrispondente nel documento

---

### RF-08 - *(Eliminato)*

Pattern recognition basato su storico delle risoluzioni: rimosso dallo scope. Il sistema non impara dalle risoluzioni precedenti e non mantiene nessun database locale di pattern.

---

### RF-09 - *(Eliminato)*

Agenti opzionali: rimosso dallo scope MVP. L'estensione funziona interamente senza AI o servizi esterni. Feature considerata per versioni future come estensioni separate.

---

### RF-10 - Completamento Merge

- Il pulsante **"Complete Merge"** è sempre visibile nell'interfaccia
- L'estensione rileva automaticamente quando tutti i conflitti nel file sono stati risolti
- Se "Complete Merge" viene cliccato con conflitti ancora aperti → popup di conferma con messaggio "Ci sono ancora X conflitti irrisolti. Vuoi procedere comunque?" con opzioni Conferma / Annulla
- Se confermato, o se tutti i conflitti sono risolti → salvataggio del file + esecuzione di `git add <filepath>`

---

### RF-11 - Wizard Onboarding

Wizard a 3 schermate mostrato al primo avvio dell'estensione:

| Schermata | Contenuto |
|-----------|-----------|
| 1 - Benvenuto | Presentazione dell'estensione + spiegazione visiva del layout 3 colonne |
| 2 - Configurazione | Scelta comportamento apertura: Automatico (default) / Solo su invocazione manuale |
| 3 - Shortcut | Riepilogo dei shortcut principali (F7, Shift+F7, `>>`, `<<`, `x`) |

- Pulsante **Skip** sempre visibile per saltare il wizard
- Wizard riapribile in qualsiasi momento da Command Palette (`Git Enhanced: Open Onboarding`)
- Wizard completabile in < 2 minuti

---

## 9. Non-Functional Requirements

### RNF-01 - Performance

| Operazione | Limite |
|-----------|--------|
| Apertura editor dal rilevamento conflitto | < 500ms |
| Auto-resolve diff3 | < 200ms per file fino a 5.000 righe |
| Analisi AST Tree-sitter | < 1s per file fino a 5.000 righe |
| Nessun blocco Extension Host | Tutto async, nessuna operazione sincrona bloccante |

### RNF-02 - Compatibilità

| Dimensione | Requisito |
|-----------|-----------|
| VS Code versione minima | 1.85.0 (gennaio 2024) |
| Code OSS / VSCodium | Compatibile (nessuna API proprietaria Microsoft) |
| Windows | Windows 10+ |
| macOS | macOS 12 (Monterey)+ |
| Linux | Ubuntu 20.04+ e distribuzioni equivalenti |
| Git versione minima | 2.23.0 |

### RNF-03 - Linguaggi Supportati MVP

TypeScript, JavaScript (inclusi JSX, TSX, framework React/Angular/Vue), C#, Java, Kotlin, Rust.

Linguaggi aggiuntivi aggiungibili dalla community tramite contribuzione di grammar Tree-sitter.

### RNF-04 - Affidabilità

- **Fallback automatico:** Se l'estensione fallisce per qualsiasi ragione, VS Code apre l'editor nativo. Nessun blocco del workflow utente.
- **Integrità dati:** Il file originale con conflict markers rimane intatto fino al completamento esplicito del merge. Nessuna modifica distruttiva automatica.
- **Persistenza stato:** Se l'utente chiude e riapre il file durante un merge in corso, lo stato della risoluzione parziale viene ripristinato.

### RNF-05 - Usabilità

- Wizard onboarding completabile in < 2 minuti
- Shortcut principali documentati inline nell'editor (tooltip / help overlay)
- Accessibilità: supporto screen reader per navigazione tra conflitti (ARIA labels su elementi interattivi)
- Translations: supporto multilingua tramite i18n (iniziando dall'inglese)

### RNF-06 - Distribuzione e Bundle

| Dimensione | Requisito |
|-----------|-----------|
| Licenza | MIT |
| Bundle size | < 25MB |
| Pubblicazione | VS Code Marketplace + Open VSX Registry |
| CI/CD | GitHub Actions: test su ogni PR, publish automatico su tag `v*.*.*` |
| Versioning | Semantic Versioning (MAJOR.MINOR.PATCH) |

### RNF-07 - Manutenibilità

- Copertura test minima 70% per i moduli `core/merge` e `core/git`
- Documentazione API interna con JSDoc per tutte le classi e metodi pubblici
- CHANGELOG mantenuto e aggiornato per ogni release
- Contribuzione esterna facilitata: CONTRIBUTING.md con setup locale, architettura e guide per aggiungere grammar Tree-sitter

---

## 10. Epic Breakdown & User Stories

### EPIC-01 - Foundation & Git Integration

*Obiettivo: intercettare i merge conflicts, parsare i dati e gestire il completamento*

| ID | User Story | Requisiti |
|----|------------|-----------|
| US-01 | Come developer, quando eseguo un merge con conflitti, l'estensione intercetta l'evento e apre il merge editor al posto di quello nativo | RF-01 |
| US-02 | Come developer, voglio che il file con conflict markers venga parsato correttamente nelle 3 componenti (HEAD, BASE, MERGING) per ogni conflitto | RF-02 |
| US-03 | Come developer, al completamento della risoluzione voglio che il file venga salvato e `git add` venga eseguito automaticamente | RF-10 |
| US-04 | Come developer, se l'estensione fallisce voglio un fallback automatico all'editor nativo VS Code senza perdita di dati | RNF-04 |

---

### EPIC-02 - Three Column Layout & Monaco Editor

*Obiettivo: il layout visivo principale con editing funzionale*

| ID | User Story | Requisiti |
|----|------------|-----------|
| US-05 | Come developer, voglio vedere le 3 colonne (HEAD / RESULT / MERGING) chiaramente separate, labeled e dimensionate | RF-02 |
| US-06 | Come developer, voglio editare liberamente il testo nella colonna centrale con Monaco Editor (syntax highlighting, IntelliSense) | RF-05 |
| US-07 | Come developer, voglio applicare un chunk dalla colonna sinistra verso la centrale con `>>` e scartarlo con `x` | RF-05 |
| US-08 | Come developer, voglio applicare un chunk dalla colonna destra verso la centrale con `<<` e scartarlo con `x` | RF-05 |
| US-09 | Come developer, quando applico chunk da entrambe le colonne sullo stesso conflitto, il secondo si accoda al primo nella centrale senza separatori visivi | RF-05 |
| US-22 | Come developer, voglio che il pulsante "Complete Merge" mostri un popup di conferma con conteggio se ci sono ancora conflitti aperti | RF-10 |
| US-23 | Come nuovo utente, voglio poter saltare il wizard con un pulsante Skip sempre visibile | RF-11 |

---

### EPIC-03 - Smart Merge Engine

*Obiettivo: diff3 + AST per risoluzione automatica intelligente*

| ID | User Story | Requisiti |
|----|------------|-----------|
| US-10 | Come developer, voglio che le modifiche non sovrapposte vengano identificate e risolte da diff3 prima che interagisca con l'editor | RF-03, RF-04 |
| US-11 | Come developer, voglio che Tree-sitter analizzi i conflitti rimanenti e proponga risoluzioni semanticamente corrette | RF-04 |
| US-12 | Come developer, voglio cliccare la bacchetta magica per applicare tutte le risoluzioni automatiche disponibili in una sola azione | RF-03 |
| US-13 | Come developer, voglio che il tooltip della bacchetta mostri "X conflitti risolvibili su Y totali" con indicatore di confidenza | RF-04 |
| US-14 | Come developer, voglio che l'analisi AST supporti correttamente TypeScript, JavaScript (JSX/TSX/Vue/Angular), C#, Java, Kotlin e Rust | RNF-03 |

---

### EPIC-04 - Minimap & Navigation

*Obiettivo: orientamento visivo rapido e navigazione efficiente tra conflitti*

| ID | User Story | Requisiti |
|----|------------|-----------|
| US-15 | Come developer, voglio una minimap laterale con highlight verde/grigio/rosso per visualizzare lo stato di tutti i conflitti nel file | RF-06 |
| US-16 | Come developer, voglio un contatore numerico persistente dei conflitti ancora aperti visibile in tutto momento | RF-06 |
| US-17 | Come developer, voglio navigare tra i conflitti con scroll del mouse o trackpad in modo naturale | RF-07 |
| US-18 | Come developer, voglio saltare al conflitto successivo con F7 e al precedente con Shift+F7 | RF-07 |
| US-19 | Come developer, voglio cliccare su qualsiasi punto della minimap per saltare direttamente a quella posizione nel documento | RF-07 |

---

### EPIC-05 - Onboarding & Configuration

*Obiettivo: prima esperienza utente eccellente e configurabilità del comportamento*

| ID | User Story | Requisiti |
|----|------------|-----------|
| US-20 | Come nuovo utente, al primo avvio vedo un wizard di 3 schermate che spiega il layout e mi permette di scegliere il comportamento di apertura | RF-11 |
| US-21 | Come developer, voglio poter riaprire il wizard da Command Palette in qualsiasi momento tramite il comando `Git Enhanced: Open Onboarding` | RF-11 |

---

## 11. Roadmap

### v0.1.0 - MVP Core
**Durata stimata:** 6 settimane  
**Epic:** EPIC-01 completo, EPIC-02 completo  
**User Stories:** US-01, US-02, US-03, US-04, US-05, US-06, US-07, US-08, US-09, US-22, US-23

**Obiettivo:** Merge editor funzionante con layout 3 colonne, Monaco Editor nella centrale, applicazione e scarto chunk, completamento merge con `git add`. Primo milestone utilizzabile dai beta tester interni.

---

### v0.2.0 - Smart Merge
**Durata stimata:** +4 settimane dalla v0.1.0  
**Epic:** EPIC-03 completo  
**User Stories:** US-10, US-11, US-12, US-13, US-14

**Obiettivo:** diff3 auto-resolve + Tree-sitter AST per 8 linguaggi + bacchetta magica. Il merge diventa intelligente: la maggioranza dei conflitti non richiede interazione manuale.

---

### v0.3.0 - Navigation & Polish
**Durata stimata:** +3 settimane dalla v0.2.0  
**Epic:** EPIC-04 completo, EPIC-05 completo  
**User Stories:** US-15, US-16, US-17, US-18, US-19, US-20, US-21

**Obiettivo:** Minimap completa, navigazione ottimizzata, wizard onboarding, CI/CD GitHub Actions, prima pubblicazione su VS Code Marketplace e Open VSX Registry.

---

### v1.0.0 - Public Release
**Durata stimata:** +1 settimana dalla v0.3.0  
**Attività:**
- Bug fix post-beta (feedback beta tester interni)
- README completo con screenshot e GIF dimostrative
- CONTRIBUTING.md per contributor esterni
- Annuncio community (Reddit r/vscode, Hacker News, dev.to)
- Monitoraggio adoption e raccolta feedback iniziale

**Timeline totale stimata: ~14 settimane da kickoff a v1.0.0**

---

## Appendice - Decisioni Escluse

| Feature | Decisione | Motivazione |
|---------|-----------|-------------|
| Pattern recognition storico | Rimosso | Complessità non giustificata per MVP, nessun beneficio senza volume dati |
| Agenti AI opzionali | Rimosso (v-future) | L'estensione deve funzionare completamente offline e senza AI |
| Integrazione PR remota | Fuori scope | Solo merge locale nel MVP, integrazione remota è un prodotto diverso |
| Storage SQLite locale | Rimosso | Non necessario senza pattern recognition |
| Pannello lista conflitti | Non incluso | Minimap sufficiente, pannello aggiunge rumore visivo |
| Separatore chunk accodati | Non incluso | Testo continuo preferito, l'utente gestisce via Monaco |

---

*Documento generato nella sessione di Product Inception con il team AIRchetipo (Virgilio, Andrea, Costanza, Leonardo, Livia, Emanuele)*  
*Prossimo step: setup repository, scaffolding estensione VS Code, inizio EPIC-01*
