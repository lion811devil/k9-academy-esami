# Audit banca Detection (CSV fornito dal docente, 20 novembre 2026)

**Risultato:** 100 domande medio/difficili, 10 concetti. Le 50 classificate difficili non mostrano un incremento verificabile di complessità rispetto alle medie: varia prevalentemente il contesto introduttivo.

Ogni gruppo ha 10 formulazioni (5 medie, 5 difficili), le stesse 4 alternative, la stessa soluzione testuale e la stessa spiegazione. I testi delle domande sono 100 distinti, ma ciò non significa che rappresentino 100 conoscenze differenti.

| Concetto / categoria | Medie | Difficili | Famiglie distinte |
|---|---:|---:|---:|
| Contaminazione | 5 | 5 | 1 |
| Debriefing | 5 | 5 | 1 |
| Discriminazione | 5 | 5 | 1 |
| Falsi positivi | 5 | 5 | 1 |
| Fondamenti Detection | 5 | 5 | 1 |
| Generalizzazione | 5 | 5 | 1 |
| Imprinting | 5 | 5 | 1 |
| Premio | 5 | 5 | 1 |
| Segnalazione | 5 | 5 | 1 |
| Strategia | 5 | 5 | 1 |

**Decisioni implementate nel pacchetto 2.2.1**

- Conservare tutte le 100 domande, senza modificare le risposte corrette e senza cancellare o rinominare gli identificativi.
- Nella composizione non usare più di una variante per famiglia: limite attuale Detection = 10 quesiti per esame.
- Nuovo messaggio diagnostico quando una prova richiede più concetti di quelli disponibili.
- Selezionare prima le famiglie e poi il livello della variante, per ottenere una composizione circa 60% media / 40% difficile (soltanto in senso **nominale** finché la banca non viene revisionata).
- **Non vengono inventate nuove domande difficili**. Una revisione didattica effettiva richiede le dispense Detection e la verifica della risposta corretta; le 50 difficili non sono state validate come tali.
- L'impostazione del numero di quesiti già esistente in Supabase non viene modificata automaticamente. Per nuove prove Detection impostare temporaneamente **10** oppure ampliare la banca prima di usare un numero superiore.

**Validazione:** nessun errore nell'indice di risposta corretta (0–3), nessuna alternativa vuota; le 100 domande contengono una soluzione coerentemente selezionata per ciascun concetto. Non è una certificazione scientifica rispetto alle dispense originali.
