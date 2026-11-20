# K9 Academy Esami 2.2.2 — aggiornamento correttivo unico

**Prerequisito:** repository K9 Academy Esami 2.2.1 esportata il 20 novembre 2026. Il SQL 2.2.1 risulta già eseguito su Supabase. Questa correzione non richiede nuove migrazioni SQL. Non eseguire `db push`, il vecchio `schema.sql` né script di reset sul database attivo.

## Aggiornamento correttivo unico 2.2.2 (20 novembre 2026)
- **La migrazione 2.2.1 e' GIA' stata eseguita in Supabase SQL Editor.** La copia esatta e' conservata in `docs/sql-applied/20261120_2_2_1_GIA_APPLICATO_NON_RIESEGUIRE.sql`, non in `supabase/migrations/` per evitare che un futuro `db push` la riesegua erroneamente.
- Questo aggiornamento della repository corregge interfaccia, test, protezione dei dati e gestione dei ruoli. **Non richiede altri comandi SQL**: la migrazione 2.2.1 già applicata include `k9_bank_version`, che blocca i duplicati normalizzati lato database con blocco transazionale. Il frontend ora esegue lo stesso controllo sull’intera disciplina, anziché sulle sole 50 righe visibili.
- Pubblicare la nuova `supabase/functions/manage-exam-access/index.ts` tramite la schermata Edge Functions o verificare il workflow GitHub Actions (richiede secrets configurati). Sostituire poi i file frontend. Non pubblicare la sola interfaccia con la vecchia funzione server.
- Per il frontend eseguire `python tools/build_frontend.py` e `python tests/check_frontend.py`; il workflow `.github/workflows/check-frontend.yml` esegue i test sui commit.
- **Non usare** `schema.sql`, script storici da 920 domande, reset di installazione o vecchie migrazioni sul database attivo. Nessun file di banca domande e' stato sostituito in questa correzione.
- I backup restano consigliati prima di ulteriori modifiche al server. I test locali non equivalgono a una verifica dei cinque ruoli su Supabase reale.

## Correzioni
- Risolto salvataggio di domande facili già presenti (non saranno estratte dagli esami). Controllo duplicati esteso a tutte le pagine della disciplina; `k9_bank_version`, già installata, continua a proteggere le scritture concorrenti.
- Modifica e Crea variante ora rendono visibile l’editor e lo focalizzano. Filtri rapidi coerenti; Mostra tutto appare soltanto per testi effettivamente troncati.
- Gestione ruoli: solo Super Amministratore può creare nuovi Super o Vice, anche se a un altro operatore è assegnato `users_create`. Archiviazione/ripristino utenti con compensazione dei dati parziali e controllo dello stato.
- Output HTML protetto per credenziali e note; password nascosta per impostazione predefinita; riepilogo meno ripetitivo. Archivio esami a schede sui telefoni.
- Test automatici e CI dedicati; snapshot esatto del SQL 2.2.1 archiviato solo come riferimento, fuori dalle migrazioni eseguibili.
- Esame unico finale per disciplina, estrazione casuale per famiglie di varianti e randomizzazione indipendente delle risposte; snapshot immutabile; tre correzioni automatiche mantenute. Esami con quesiti medi e difficili; quota indicativa del 40% difficili soltanto quando presenti nella banca. Nessuna riqualificazione automatica delle domande. Timer server, recupero, richieste concorrenti serializzate e blocco di una seconda sessione Auth. Il blocco riguarda sessioni Auth diverse, non tutte le schede dello stesso browser.
- Banca paginata lato server, CSV, esportazione, controllo anomalie, concetti, versioni, fonti e approvazione. Le vecchie domande non sono dichiarate approvate in automatico. La somministrazione mantiene le domande attive. Il riconoscimento automatico usa testo e alternative/categoria, non una verifica semantica o scientifica. Quattro opzioni per domanda; il vero/falso non è stato introdotto nel motore ufficiale.
- Login personale con Supabase Auth, credenziali legacy non più accettate, hash legacy sostituiti/rimossi; colonne compatibili conservate. Per eventuali account privi di username personale è creato un identificativo k9-... con UUID; recuperare username nel pannello corsisti e condividere/reimpostare password se necessario. Nessun account Auth eliminato dalla migrazione.
- Corso atomico; limiti su eliminazione/archiviazione, ruoli, RLS, idoneità, riapertura e revoca. Le prove con PDF già emessi non possono essere distrutte: conservarle e revocare i documenti.
- Verbale, report, attestato: PDF originale privato nel DB (max 10 MB), hash server, registro versioni, download, revoca e codice del documento verificabile nella pagina riservata. Non è una firma digitale qualificata né una verifica pubblica anonima. I PDF originali emessi prima dell'aggiornamento non sono recuperabili retroattivamente.
- Statistiche su errori iniziali/finali, categorie, alternative, frequenze e tempo medio trascorso dall'inizio alla prima risposta (non tempo effettivo dedicato a ogni singola domanda).
- CSS separato; sei sorgenti JS in src/js, bundle assets/js/app.js compilato per mantenere la compatibilità dei gestori HTML. Per future modifiche eseguire `python tools/build_frontend.py`, quindi `python tests/check_frontend.py`. Caricare sempre anche il bundle. Cache versionata e menu razionalizzato. Nessuna libreria QR: sui PDF resta il codice documento.

## Collaudo obbligatorio prima dell'uso reale
- [ ] Preflight e verifica SQL: confrontare impronte, conteggi e permessi; verificare le 4 discipline.
- [ ] Accesso personale di un corsista esistente e di uno nuovo, cambio password, login dei cinque ruoli e permessi.
- [ ] Creazione corso singolo/collettivo, nuova assegnazione a corsista già idoneo, esame per ciascuna disciplina; controllare numero quesiti, varianti e quattro alternative.
- [ ] Risposte, tre correzioni, timer, disconnessione, refresh, nuovo login concorrente, rilascio sessione da amministratore, consegna/scadenza.
- [ ] Valutazione pratica/professionale e componenti Mantrailing; chiusura, riapertura, blocco attestato non idoneo.
- [ ] Generazione e visualizzazione dei tre PDF; verifica hash, download byte-identico, revoca e riemissione.
- [ ] Banca 50 righe/pagina, filtri, CSV, export, modifica e cronologia, audit, statistiche e prova permessi corsista.
- [ ] Eliminazione di prova senza documenti, archiviazione corso, eliminazione controllata corsista; verificare assenza di accesso a dati di altri corsisti.

## Limiti
Non è stata eseguita la migrazione sul database reale né un collaudo end-to-end con Supabase Auth. Controlli locali: sintassi JS/TS, ID HTML, CSV, escaping, famiglia, bundle e difficoltà medio/difficile. Il collaudo end-to-end su Supabase deve ancora essere eseguito. Il pacchetto è un candidato di aggiornamento, non una release convalidata in produzione. La banca Mantrailing 1702 e Detection 150 non sono incluse integralmente nella repository originale; la revisione scientifica di tutte le discipline richiede le banche attive e le dispense. Esportare dopo collaudo e verificare le fonti; non marcare automaticamente come approvate. Non cancellare le migrazioni storiche uniche né eseguirle sulla produzione. Conservare il backup per un eventuale ripristino coordinato di database, Auth, Edge e frontend.

## Difficoltà media / difficile
Le domande già presenti non vengono modificate né eliminate. Le domande facili (se presenti) restano consultabili, ma non sono estratte in nuovi esami. La selezione cerca circa il 40% di quesiti **difficili** solo quando la banca ne offre abbastanza; altrimenti integra con quesiti **medi**, senza dichiarare falsamente che siano difficili. Il contenuto e la difficoltà delle risposte richiedono verifica didattica sulle dispense. Prima dell’installazione controllare la distribuzione con `supabase/verification/preflight_2_2_1.sql`.

## Detection: limite didattico verificato con il CSV (20/11/2026)
100 quesiti attivi medio/difficili = 10 famiglie di varianti (5 medie e 5 difficili per ciascun concetto). Le prove Detection non possono contenere più di 10 concetti distinti con questa banca: le richieste oltre il limite sono fermate con un errore esplicativo. Il numero impostato in `exam_settings` non viene cambiato automaticamente. Per prove da 40 domande servono **almeno 40 concetti autonomi**, non 40 formulazioni alternative degli stessi 10. Vedi `docs/DETECTION_AUDIT_E_CORREZIONE.md`.

Le domande definite difficili sono difficili **solo in etichetta**: la maggiore complessità non è supportata dal contenuto del CSV. Nessuna risposta corretta viene riscritta automaticamente.
