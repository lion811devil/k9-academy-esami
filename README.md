# K9 Academy Esami — Repository corrente

PWA per gestione esami K9 Academy con backend Supabase.

## Banca domande attualmente presente nel progetto Supabase

- Dogsitter: 150
- Mantrailing: 920
- HRDD: 300
- Detection: 150
- Totale: 1.520

La banca MANTRAILING è stata aggiornata con i contenuti del corso e delle componenti.
La colonna database `difficulty` resta solo per compatibilità tecnica legacy: l'app non la usa né la mostra.

## File applicazione

- `index.html` — applicazione
- `manifest.json` — configurazione PWA
- `service-worker.js` — cache PWA
- `icons/` — icone installazione
- `404.html` — fallback GitHub Pages

## Supabase

La cartella `supabase/` contiene schema, Edge Function e storico tecnico.
Non eseguire file SQL di vecchie release sul database corrente senza una verifica preventiva.

### Aggiornamento MANTRAILING già eseguito

Il database corrente deve restituire:

```sql
select discipline, count(*) as totale
from public.question_bank
group by discipline
order by discipline;
```

Risultato atteso:

```text
detection    150
dogsitter    150
hrdd         250
mantrailing  920
```

## Nota importante

Il vecchio seed da 800 domande e l'aggiornamento 1.22 non appartengono più alla configurazione corrente e non devono essere eseguiti.


## Release 1.88.1 — Consolidamento tecnico
- Allineamento versioni interfaccia e Service Worker.
- Refresh automatico documentato correttamente a 60 secondi.
- Banca HRDD documentata a 300 domande (totale 1.520).
- Aggiunta migration canonica 1.71–1.88 per nuove installazioni e disaster recovery.
- Nessuna modifica al motore esami o ai dati applicativi.
