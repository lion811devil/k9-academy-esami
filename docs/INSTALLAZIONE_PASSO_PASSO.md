# AVVISO DETECTION — NON INSTALLARE 2.2.0
Le 100 domande medie/difficili Detection del CSV rappresentano 10 concetti: le prove con oltre 10 domande Detection vengono respinte per evitare ripetizioni concettuali. Le 50 etichette difficile NON corrispondono a una difficoltà didattica più alta verificata. Nessuna modifica automatica alle domande o alle impostazioni esistenti.

# K9 Academy Esami 2.2.1 — installazione passo per passo

**Questa versione è cumulativa:** parte dall’originale di novembre, senza richiedere la 2.0.1 o 2.1.0. Non installare le precedenti due patch.

## Ordine obbligatorio

1. Fermare gli esami. Sono stati verificati 0 esami in corso nel controllo del 19 novembre, ma ripetere il controllo prima del RUN.
2. In Supabase SQL Editor eseguire `supabase/verification/preflight_2_2_1.sql` e salvare la distribuzione per difficoltà e le impronte. I conteggi comunicati precedentemente erano: Detection 150, Dogsitter 750 (600 attive), HRDD 300, Mantrailing 1702. **Questi valori vanno ricontrollati.**
3. **Raccomandato:** esportare almeno la tabella `question_bank` (e, preferibilmente, un backup PostgreSQL completo). Hai scelto di non effettuare il backup, quindi un errore di installazione potrebbe richiedere un intervento manuale.
4. Aprire una nuova query, incollare SOLO il contenuto di `supabase/migrations/20261120093000_k9_v2_2_1.sql` ed eseguire una sola volta. La migrazione è transazionale. Se appare un errore, fermarsi e condividere il messaggio; non ripetere automaticamente il RUN.
5. Eseguire `supabase/verification/verify_2_2_1.sql`. Confrontare le impronte delle domande e i conteggi prima/dopo: non devono cambiare. Verificare numero domande MEDIE e DIFFICILI per disciplina.
6. Caricare i file nei rispettivi percorsi GitHub (solo quelli elencati in `docs/ELENCO_FILE.txt`). Il workflow deve distribuire la Edge Function `manage-exam-access`; verificare GitHub Actions e il log del deploy. Non caricare `schema.sql`, le vecchie migrazioni, la 2.0.1 o la 2.1.0.
7. Ricaricare l’app e svuotare la cache, se necessario. Verificare i cinque ruoli, il login dei due corsisti, i tre esami esistenti, creazione corso, prova e timer, spiegazioni, correzioni, PDF senza QR Code.
8. Controllare un esame per ciascuna disciplina e verificare che il report mostri soltanto domande classificate media/difficile, senza famiglie ripetute nello stesso esame.
9. Soltanto dopo il collaudo, valutare l’eliminazione delle copie SQL duplicate facoltative e di qualsiasi vecchio `assets/js/qr-vendor.js` o `licenses/QRCode.txt` se caricati.

## Difficoltà

La versione 2.2.1 esclude i quesiti **facili** dalle nuove prove. Il motore tenta una miscela di circa 40% **difficile** e 60% **medio**, solo se sufficientemente presenti e distinti; in caso contrario completa con l’altro livello. **Non inventa quesiti né assegna la difficoltà in automatico.** Per ottenere esami realmente difficili occorre revisionare e classificare le domande/alternative già presenti, confrontandole con le dispense.

## Limiti verificati

Nessuna operazione è stata eseguita sul Supabase attivo o sul GitHub reale. Il pacchetto è stato sottoposto a controlli statici locali; l’esecuzione SQL effettiva e il collaudo completo richiedono il progetto collegato.
