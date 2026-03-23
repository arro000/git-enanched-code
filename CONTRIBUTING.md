# Contributing a Git Enhanced

Grazie per il tuo interesse nel contribuire a **Git Enhanced**! Questa guida ti aiutera' a configurare l'ambiente di sviluppo, comprendere l'architettura del progetto e iniziare a contribuire.

---

## Sommario

1. [Setup locale](#setup-locale)
2. [Architettura del progetto](#architettura-del-progetto)
3. [Aggiungere una grammar Tree-sitter](#aggiungere-una-grammar-tree-sitter)
4. [Convenzioni del progetto](#convenzioni-del-progetto)
5. [Processo di contribuzione](#processo-di-contribuzione)

---

## Setup locale

### Prerequisiti

- **Node.js** 20.x LTS o superiore
- **Git** 2.23.0 o superiore
- **VS Code** 1.85.0 o superiore (per testare l'estensione)

### Passi per iniziare

1. **Clona il repository:**

   ```bash
   git clone https://github.com/signori-agenti/git-enhanced.git
   cd git-enhanced
   ```

2. **Installa le dipendenze:**

   ```bash
   npm install
   ```

3. **Compila il progetto (type-check senza emissione):**

   ```bash
   npm run compile
   ```

4. **Esegui il build (bundle con esbuild):**

   ```bash
   npm run build
   ```

   Questo produce `out/extension.js`, il bundle finale dell'estensione.

5. **Esegui i test:**

   ```bash
   npm test
   ```

   I test usano **Vitest**. Per eseguirli in watch mode durante lo sviluppo:

   ```bash
   npm run test:watch
   ```

   Per la coverage:

   ```bash
   npm run test:coverage
   ```

6. **Avvia in modalita' sviluppo:**

   ```bash
   npm run watch
   ```

   Poi premi `F5` in VS Code per lanciare l'Extension Development Host con l'estensione caricata.

7. **Pacchettizza l'estensione (opzionale):**

   ```bash
   npm run package
   ```

   Genera il file `.vsix` installabile manualmente.

---

## Architettura del progetto

Git Enhanced e' una estensione VS Code che fornisce un merge editor avanzato a 3 colonne con risoluzione intelligente dei conflitti. L'architettura segue un pattern modulare con separazione netta tra Extension Host (Node.js) e UI (WebviewPanel).

### Struttura delle directory

```
src/
  extension.ts                  # Entry point dell'estensione
  core/
    git/                        # Modulo Git Integration
      ConflictDetector.ts       # Rileva conflict markers nei documenti
      ConflictParser.ts         # Parsing dei markers in blocchi HEAD/BASE/MERGING
      FallbackService.ts        # Fallback automatico all'editor nativo
      MergeCompletionService.ts # Salvataggio file + git add al completamento
    merge/                      # Modulo Smart Merge Engine
      Diff3Resolver.ts          # Layer 1: risoluzione automatica diff3
      AnalizzatoreAstConflitti.ts # Layer 2: analisi AST con Tree-sitter
      LanguageDetector.ts       # Rileva il linguaggio dal file per AST
      RilevatorePatternSemantico.ts # Pattern semantici (import, metodi, ecc.)
      MergeSessionStateManager.ts   # Persistenza stato risoluzione parziale
  ui/
    MergeEditorProvider.ts      # CustomEditorProvider principale (WebviewPanel)
    OnboardingWizardProvider.ts # Wizard onboarding a 3 schermate
    commands/                   # Comandi registrati nella Command Palette
    webview/                    # Componenti React del WebviewPanel
  config/
    ConfigManager.ts            # Gestione configurazione estensione

test/
  unit/                         # Test unitari (specchio di src/)
  integration/                  # Test di integrazione
```

### Modulo `core/git` -- Git Integration

Gestisce l'interazione con Git e il parsing dei file in conflitto.

- **`ConflictDetector`** rileva la presenza di conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in un documento VS Code.
- **`ConflictParser`** implementa una state machine (`OUTSIDE -> IN_HEAD -> IN_BASE -> IN_MERGING`) per estrarre i blocchi `ConflictBlock` con i contenuti separati di HEAD, BASE e MERGING. Supporta sia il formato standard a 2 vie che il formato diff3 a 3 vie (con `|||||||`).
- **`MergeCompletionService`** gestisce il flusso di completamento: verifica l'assenza di conflict markers residui, salva il documento e esegue `git add` tramite `simple-git`.
- **`FallbackService`** garantisce che, in caso di errore dell'estensione, VS Code apra automaticamente il suo editor nativo senza perdita di dati.

### Modulo `core/merge` -- Smart Merge Engine

Implementa la risoluzione intelligente dei conflitti su due livelli.

- **`Diff3Resolver`** (Layer 1) analizza i conflitti usando l'algoritmo diff3: identifica le modifiche non sovrapposte tra HEAD, BASE e MERGING e le risolve automaticamente con confidenza massima. Produce `RisultatoAnalisiDiff3` con la lista dei conflitti risolti e non risolvibili.
- **`AnalizzatoreAstConflitti`** (Layer 2) usa `web-tree-sitter` per parsare il codice dei conflitti non risolti dal Layer 1. Carica la grammar WASM appropriata per il linguaggio e analizza la struttura sintattica per identificare pattern compatibili (es. import non sovrapposti, metodi aggiunti in classi diverse).
- **`LanguageDetector`** mappa le estensioni dei file ai linguaggi supportati e verifica la disponibilita' di grammar Tree-sitter.
- **`RilevatorePatternSemantico`** identifica i pattern AST specifici (import, metodi, proprieta') per determinare se le modifiche sono semanticamente compatibili.
- **`MergeSessionStateManager`** persiste lo stato della sessione di merge (conflitti risolti, risoluzioni parziali) tramite `workspaceState` di VS Code, con validazione tramite hash del contenuto.

### Modulo `ui` -- User Interface

Gestisce l'interfaccia utente tramite WebviewPanel.

- **`MergeEditorProvider`** e' il `CustomEditorProvider` registrato come `git-enhanced.mergeEditor`. Gestisce il WebviewPanel con il layout a 3 colonne (HEAD read-only | Result editabile con Monaco Editor | MERGING read-only), la minimap, la navigazione tra conflitti e la comunicazione bidirezionale con l'Extension Host.
- **`OnboardingWizardProvider`** gestisce il wizard di onboarding a 3 schermate mostrato al primo avvio.
- **`commands/`** contiene i comandi registrati nella Command Palette (`openMergeEditor`, `completeMerge`, `openOnboarding`, navigazione conflitti).
- **`webview/`** contiene i componenti React renderizzati nel WebviewPanel.

### Modulo `config`

- **`ConfigManager`** legge e gestisce le impostazioni dell'estensione (`gitEnhanced.activationMode`: `"auto"` | `"manual"`) tramite `vscode.workspace.getConfiguration`.

---

## Aggiungere una grammar Tree-sitter

Una delle contribuzioni piu' preziose e' l'aggiunta del supporto per nuovi linguaggi di programmazione. L'analisi AST (Layer 2 dello Smart Merge Engine) usa `web-tree-sitter` con grammar in formato WASM.

### Panoramica del flusso

Quando Git Enhanced analizza un conflitto:

1. `LanguageDetector.rilevaLinguaggioDaEstensione()` identifica il linguaggio dall'estensione del file
2. `LanguageDetector.linguaggioSupportatoDaTreeSitter()` verifica che esista una grammar
3. `AnalizzatoreAstConflitti` carica la grammar WASM e analizza il codice

Per aggiungere un nuovo linguaggio devi modificare entrambi i file.

### Esempio concreto: aggiungere il supporto per Go

#### Passo 1 -- Installare la dipendenza

```bash
npm install tree-sitter-go
```

#### Passo 2 -- Aggiornare `LanguageDetector.ts`

Apri `src/core/merge/LanguageDetector.ts` e aggiungi il linguaggio in due punti:

**a) Nella mappa `ESTENSIONE_A_LINGUAGGIO`**, aggiungi le estensioni dei file Go:

```typescript
const ESTENSIONE_A_LINGUAGGIO: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    // ... linguaggi esistenti ...
    '.rs': 'rust',
    '.go': 'go',          // <-- Aggiunta
};
```

**b) Nel set `LINGUAGGI_CON_GRAMMAR`**, aggiungi l'identificativo:

```typescript
const LINGUAGGI_CON_GRAMMAR: Set<string> = new Set([
    'typescript', 'typescriptreact',
    'javascript', 'javascriptreact',
    'csharp', 'java', 'rust',
    'go',                  // <-- Aggiunta
]);
```

#### Passo 3 -- Aggiornare `AnalizzatoreAstConflitti.ts`

Apri `src/core/merge/AnalizzatoreAstConflitti.ts` e aggiungi la voce nella mappa `LINGUAGGI_SUPPORTATI`:

```typescript
const LINGUAGGI_SUPPORTATI: Record<string, { pacchetto: string; nomeFile: string }> = {
    'typescript': { pacchetto: 'tree-sitter-typescript', nomeFile: 'tree-sitter-typescript.wasm' },
    // ... linguaggi esistenti ...
    'rust': { pacchetto: 'tree-sitter-rust', nomeFile: 'tree-sitter-rust.wasm' },
    'go': { pacchetto: 'tree-sitter-go', nomeFile: 'tree-sitter-go.wasm' },  // <-- Aggiunta
};
```

#### Passo 4 -- Aggiungere i test

Crea o aggiorna il file di test appropriato seguendo la struttura esistente. Verifica che:

- `rilevaLinguaggioDaEstensione('file.go')` restituisca `'go'`
- `linguaggioSupportatoDaTreeSitter('go')` restituisca `true`
- L'analisi AST funzioni correttamente su un conflitto in codice Go

#### Passo 5 -- Verificare

```bash
npm test
npm run compile
```

Assicurati che tutti i test passino e che non ci siano errori di tipo.

### Linguaggi attualmente supportati

| Linguaggio | Estensioni | ID linguaggio |
|---|---|---|
| TypeScript | `.ts`, `.tsx` | `typescript`, `typescriptreact` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | `javascript`, `javascriptreact` |
| C# | `.cs` | `csharp` |
| Java | `.java` | `java` |
| Kotlin | `.kt`, `.kts` | `kotlin` |
| Rust | `.rs` | `rust` |

---

## Convenzioni del progetto

- **Linguaggio:** TypeScript 5.4+
- **Build:** esbuild produce un singolo bundle `out/extension.js`
- **Test:** Vitest. I test vivono in `test/`, mai dentro `src/`. La struttura specchia `src/`: `src/core/git/Foo.ts` -> `test/unit/core/git/Foo.test.ts`
- **Nomi:** Preferisci nomi parlanti e chiari rispetto a nomi concisi. Variabili, classi e funzioni devono essere autoesplicative.
- **Import nei test:** Usa percorsi relativi dal file di test verso `src/`, ad esempio `../../../../src/core/git/Foo`

---

## Processo di contribuzione

1. **Forka** il repository e crea un branch dal branch `develop`
2. **Implementa** la modifica seguendo le convenzioni descritte sopra
3. **Scrivi i test** per la funzionalita' aggiunta o modificata
4. **Verifica** che tutti i test passino con `npm test`
5. **Verifica** che non ci siano errori di tipo con `npm run compile`
6. **Apri una Pull Request** verso il branch `main` con una descrizione chiara della modifica

### Checklist PR

- [ ] I test passano (`npm test`)
- [ ] Il type-check passa (`npm run compile`)
- [ ] I nuovi file seguono la struttura di directory del progetto
- [ ] I test sono nella directory `test/`, non in `src/`
- [ ] I nomi di variabili/classi/funzioni sono parlanti e chiari
