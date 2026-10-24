# K9 Academy Esami — Repository corrente

PWA per la gestione degli esami K9 Academy con backend Supabase.

## Stato banca domande (risultato Supabase comunicato il 24/10/2026)

| Disciplina | Totale | Attive |
|---|---:|---:|
| Detection | 150 | 150 |
| Dogsitter | 750 | 600 |
| HRDD | 300 | 300 |
| Mantrailing | 920 | 920 |
| **Totale** | **2.120** | **1.970** |

I numeri descrivono l'ultimo riscontro comunicato, non una verifica live eseguita da questa repository.

## Struttura

- `index.html`: interfaccia applicativa e banca domande.
- `manifest.json`, `service-worker.js`, `icons/`: PWA.
- `supabase/functions/manage-exam-access/`: funzione server per accessi e amministrazione.
- `supabase/migrations/`: storico migrazioni, **non da rieseguire** indiscriminatamente.
- `supabase/aggiornamento_1_25_mantrailing_920_definitive.sql`: copia canonica dello script Mantrailing già applicato con successo al database. **Non rieseguirlo** senza verifica.

## Sicurezza e rilascio

La chiave pubblicabile di Supabase nel client non sostituisce le policy RLS.
La Edge Function usa credenziali legacy SHA-256 per la compatibilità con corsisti esistenti: è necessaria una migrazione coordinata a un meccanismo password più robusto. L'endpoint pubblico richiede inoltre una protezione anti-abuso lato infrastruttura/server, non ancora implementata in questa release.

Il workflow GitHub distribuisce la Edge Function, **non** applica automaticamente le migrazioni SQL né pubblica necessariamente l'interfaccia.

Le correzioni all'interfaccia riguardano escape HTML e prevenzione dei duplicati nell'import CSV; non cambiano la banca Mantrailing già presente su Supabase.
