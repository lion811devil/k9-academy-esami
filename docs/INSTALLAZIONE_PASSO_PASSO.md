# K9 Academy Esami 2.2.2 — installazione unica correttiva

**Questa patch si applica alla repository `k9-academy-esami-main (1).zip` caricata il 20 novembre 2026.** Non applicarla a versioni precedenti senza confronto.

## Da fare

1. Non eseguire SQL: il database è già aggiornato alla 2.2.1. Il file `docs/sql-applied/20261120_2_2_1_GIA_APPLICATO_NON_RIESEGUIRE.sql` è **solo una copia storica** dell'aggiornamento già applicato: non eseguirlo e non spostarlo in `supabase/migrations`.
2. Carica i file della ZIP nelle stesse posizioni della repository. Non caricare il file ZIP dentro la repository: estrai i singoli file. Sono inclusi solo quelli modificati/aggiunti. **Non cancellare gli altri file.**
3. Importante: sostituisci `supabase/functions/manage-exam-access/index.ts` e pubblica nuovamente la funzione **manage-exam-access** su Supabase. Il commit GitHub può attivare il workflow, ma devi verificarne l'esito in GitHub Actions e verificare su Supabase la data del nuovo deploy. Se il workflow non è configurato, pubblica manualmente il codice nella scheda Edge Functions > Code > Deploy updates. Non creare un'altra funzione.
4. Carica i sei moduli JS modificati (`src/js/`) insieme al bundle `assets/js/app.js`. Non è necessario caricare nuovamente il modulo `src/js/02-exam.js`, che non è cambiato.
5. Sostituisci `assets/css/app.css` e infine `service-worker.js` e `index.html`. Il service worker ha una nuova versione di cache. Prova l'applicazione in incognito per evitare file vecchi.
6. Controlla GitHub Actions > `Check K9 frontend`. Su Codespaces, in alternativa, usa `python tests/check_frontend.py` per i test statici.
7. Esegui un collaudo con account di prova: apertura editor domanda, salvataggio di una domanda facile senza riclassificarla, duplicato oltre la prima pagina, creazione utente con ruoli diversi, archiviazione/ripristino, esame, 3 correzioni, PDF, archivio e navigazione smartphone.
8. Non eliminare ancora dati o migrazioni SQL. I 17 duplicati eliminabili dalla root di `supabase` sono elencati in `docs/FILE_DA_ELIMINARE_OPZIONALI.txt`, già presente nella repository. Eliminali solo dopo il collaudo.

## File coinvolti

Vedi `docs/ELENCO_FILE.txt` per la lista completa con i percorsi. Nella patch tutti i file sono collocati nella loro cartella definitiva, quindi non devi rinominarli.

## Limiti

- I test sono locali e con dati simulati. Non dimostrano il funzionamento end-to-end sul database live.
- La compensazione fra Supabase Auth e PostgreSQL non è un'unica transazione: gli errori di rollback vengono segnalati esplicitamente, ma serve un collaudo reale.
- Il controllo sul PDF garantisce che una prova pratica idonea abbia punteggi registrati, ma **non introduce una nuova soglia di professionalità**, che deve essere formalizzata nel regolamento del corso e, se vincolante, applicata anche alla RPC di emissione.
- Le banche domande non vengono modificate; serve ancora revisione didattica sulle dispense originali per certificare la qualità medio/difficile.
