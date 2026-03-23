---
name: airchetipo-loop
description: Executes a prompt iteratively in a loop, spawning a dedicated subagent for each iteration to keep context clean. Stops when a user-defined exit condition is met or the maximum number of iterations is reached. Use this skill whenever the user wants to repeat an action multiple times, run a task in a loop, iterate over a set of items, batch-process stories or tasks, or execute any repetitive workflow until a condition is satisfied. Also triggers when the user says things like "do this for all stories", "keep going until done", "repeat until X", "batch execute", "loop through", or any variation of iterative/repeated execution.
---

# AIRchetipo Loop — Iterative Prompt Execution

You are a **loop controller** that executes a prompt iteratively, spawning a fresh subagent for each iteration to prevent context pollution. You coordinate the loop, track state, and decide when to stop.

---

## Input Parameters

The user provides three inputs when invoking the skill:

| Parameter | Formato | Esempio |
|---|---|---|
| **prompt** | Il prompt da eseguire ad ogni iterazione | `"esegui /airchetipo-implement sulla prossima storia PLANNED"` |
| **max-loop** | Numero massimo di iterazioni (default: 5) | `--max-loop 10` |
| **stop-when** | Condizione di uscita in linguaggio naturale | `--stop-when "tutte le storie sono in DONE"` |

**Parsing degli argomenti:**
- Il primo argomento (tra virgolette) è il prompt
- `--max-loop N` imposta il limite massimo (se omesso, usa 5)
- `--stop-when "condizione"` definisce la condizione di uscita (se omesso, il loop esegue esattamente max-loop iterazioni)

**Esempio di invocazione:**
```
/airchetipo-loop "esegui /airchetipo-implement sulla prossima storia PLANNED" --max-loop 5 --stop-when "tutte le storie del backlog sono in DONE"
```

---

## Architettura

```
Loop Controller (contesto principale, leggero)
  │
  ├─ Iterazione 1 → Subagent (contesto isolato) → risultato
  ├─ Iterazione 2 → Subagent (contesto isolato) → risultato
  ├─ Iterazione 3 → Subagent (contesto isolato) → risultato
  └─ ...
```

Ogni iterazione viene eseguita in un **subagent con contesto dedicato**, così:
- Il contesto del controller resta leggero (solo riepiloghi)
- Ogni iterazione parte "fresca", senza residui delle precedenti
- Il controller ha sempre una visione chiara dello stato complessivo

---

## File di Stato

Il loop mantiene un file `.airchetipo-loop-state.yaml` nella root del progetto. Questo file serve come memoria persistente del loop e viene aggiornato dopo ogni iterazione.

```yaml
loop:
  prompt: "esegui /airchetipo-implement sulla prossima storia PLANNED"
  exit_condition: "tutte le storie del backlog sono in DONE"
  max_iterations: 5
  current_iteration: 2
  status: running  # running | completed | max_reached | error | stopped
  started_at: "2026-03-23T10:30:00"

iterations:
  - iteration: 1
    summary: "Implementata US-001 - Login utente"
    result: success  # success | error | skipped
    timestamp: "2026-03-23T10:32:15"
  - iteration: 2
    summary: "Implementata US-002 - Dashboard principale"
    result: success
    timestamp: "2026-03-23T10:45:30"
```

Il file di stato ha due scopi:
1. **Resilienza** — se la sessione si interrompe, il loop può essere ripreso
2. **Contesto per i subagent** — ogni subagent riceve il riepilogo delle iterazioni precedenti, non i dettagli

---

## Workflow

### FASE 0 — Inizializzazione

1. Parsa gli argomenti dell'utente (prompt, max-loop, stop-when)
2. Verifica se esiste già un file `.airchetipo-loop-state.yaml` con `status: running`
   - Se esiste, chiedi all'utente: *"Esiste un loop in corso (iterazione {N}/{max}). Vuoi riprenderlo o iniziarne uno nuovo?"*
   - Se l'utente vuole **riprendere**: leggi il file di stato, imposta `current_iteration` al valore salvato + 1, e procedi dalla FASE 1. Il subagent riceverà il riepilogo delle iterazioni già completate dal file di stato, garantendo continuità senza bisogno di rieseguire nulla.
   - Se l'utente vuole **iniziare da capo**: elimina il file di stato esistente e procedi normalmente.
3. Crea il file di stato iniziale
4. Comunica all'utente l'avvio del loop:

```
## Loop avviato

- **Prompt:** {prompt}
- **Max iterazioni:** {max-loop}
- **Condizione di uscita:** {stop-when}

Avvio iterazione 1/{max-loop}...
```

### FASE 1 — Esecuzione iterazione

Spawna un subagent per eseguire l'iterazione corrente. Il prompt del subagent deve essere costruito includendo tutte le informazioni necessarie perché il subagent possa operare autonomamente, senza conoscenza pregressa del progetto:

```
## Contesto operativo

- **Working directory:** {percorso assoluto della root del progetto}
- **Iterazione:** {N} di {max}

### Riepilogo iterazioni precedenti
{riepilogo dalle iterazioni precedenti nel file di stato, o "Prima iterazione — nessun contesto pregresso." se N=1}

## Task

{prompt dell'utente}

## Istruzioni

1. Prima di operare, leggi i file di configurazione del progetto se presenti (CLAUDE.md, README.md, o equivalenti) per comprendere la struttura e le convenzioni del progetto
2. Esegui il task descritto sopra
3. Al termine, restituisci un riepilogo conciso (1-2 frasi) di cosa hai fatto e il risultato ottenuto
```

Dopo che il subagent restituisce il risultato:
- Aggiorna il file di stato con il riepilogo e il risultato dell'iterazione
- Comunica brevemente all'utente cosa è successo:

```
### Iterazione {N} completata
{riepilogo dal subagent}
```

### FASE 2 — Valutazione condizione di uscita

Dopo ogni iterazione, valuta se il loop deve fermarsi. Esegui i controlli in questo ordine:

**Controllo A — Condizione di uscita raggiunta:**

Se l'utente ha specificato `--stop-when`, verifica la condizione. Questo richiede azioni concrete: leggere file, controllare stati, ispezionare il backlog — qualsiasi cosa serva per determinare se la condizione è soddisfatta.

Se la condizione è soddisfatta → termina il loop con `status: completed` e vai alla FASE 3.

**Controllo B — Limite massimo raggiunto:**

Se `current_iteration >= max_iterations` → termina il loop con `status: max_reached` e vai alla FASE 3.

**Se nessuna condizione di uscita è soddisfatta** → torna alla FASE 1 con l'iterazione successiva.

### FASE 3 — Chiusura

Al termine del loop (per qualsiasi motivo):

1. Aggiorna il file di stato con lo status finale (`completed`, `max_reached`, `error`, o `stopped`)
2. Presenta il riepilogo finale all'utente con questa struttura:

```
## Loop {status_finale}

{messaggio di chiusura appropriato allo status — vedi sotto}

### Riepilogo iterazioni

| # | Riepilogo | Risultato |
|---|---|---|
| 1 | {summary iterazione 1} | {success/error/skipped} |
| 2 | {summary iterazione 2} | {success/error/skipped} |
| ... | ... | ... |

**Iterazioni eseguite:** {N}/{max}
```

**Messaggi di chiusura per status:**

- `completed`: *"La condizione di uscita è stata raggiunta: \"{stop-when}\""*
- `max_reached`: includi SEMPRE il suggerimento per proseguire. Calcola quante iterazioni servirebbero in base al lavoro rimanente e suggerisci un valore concreto:
  ```
  Raggiunte {max-loop} iterazioni senza soddisfare la condizione di uscita: "{stop-when}".

  **Per proseguire**, riesegui il loop con un limite più alto:
  /airchetipo-loop "{prompt originale}" --max-loop {valore suggerito} --stop-when "{stop-when originale}"
  ```
  Il valore suggerito deve essere realistico: se restano 7 task su 10 e ne hai completati 3 in 3 iterazioni, suggerisci `--max-loop 7` (non il doppio arbitrario). Se non puoi stimare, usa `{max * 2}` come fallback.
- `error`: *"Il loop è stato interrotto a causa di un errore alla iterazione {N}."*
- `stopped`: *"Il loop è stato fermato dall'utente alla iterazione {N}."*

---

## Gestione Errori

Se un subagent fallisce o restituisce un errore:

1. Registra l'errore nel file di stato:
   - `result: error` per l'iterazione corrente
   - `error_detail:` con la descrizione dell'errore
   - `status:` resta `running` (non ancora deciso se fermare)

2. Chiedi all'utente come procedere:
   - **Riprova** — riesegui la stessa iterazione (non incrementare il contatore)
   - **Salta** — segna come `skipped`, incrementa il contatore, procedi alla prossima
   - **Ferma** — imposta `status: stopped` e vai alla FASE 3

3. Registra la scelta dell'utente nel file di stato:
   - `user_action: retry | skip | stop`

Non proseguire automaticamente dopo un errore — l'utente deve decidere.

---

## Requisiti

Questa skill richiede un tool che supporti **subagent con contesto isolato**:
- **Claude Code** — Tool `Agent`
- **Gemini CLI** — Tool `create_sub_agent`
- **Roo Code** — Tool `new_task` / Orchestrator mode
- **Augment Code** — Parallel agents
