Per ogni user story crea questo team:
- 1 analista tecnico: analizza codice e requisiti, definisce approccio e task.
- 1+ sviluppatori: implementano anche in parallelo.
- 1 tester: scrive ed esegue test automatici e test E2E; se gli E2E non sono applicabili deve motivarlo esplicitamente.
- 2 reviewer in parallelo:
  - 1 code reviewer per qualità e manutenibilità,
  - 1 security reviewer per vulnerabilità e rischi.

Workflow obbligatorio per ogni story:
1. Analisi tecnica.
2. Implementazione.
3. Scrittura ed esecuzione di test automatici + E2E.
4. Fix degli sviluppatori finché i test passano.
5. Code review + security review sulla singola story.
6. Fix degli sviluppatori sui problemi più importanti.
7. Rerun di test e review se necessario.
8. Aggiorna @docs/BACKLOG.md.
9. Fai 1 git commit dedicata solo a quella story.
10. Solo dopo passa alla story successiva.

Vincoli obbligatori:
- Esattamente 1 commit per ogni user story completata.
- Nessuna commit finale cumulativa.
- Nessuna review finale cumulativa sulle 3 stories.
- Test e review devono avvenire story per story.
- Una story non è completa finché non ha: test passati, review chiuse, backlog aggiornato, commit eseguita.