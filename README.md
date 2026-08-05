# K9 Academy Esami — Release 1.0 completa

Repository unica per una nuova installazione su **GitHub Pages** e un nuovo progetto **Supabase**.
Non richiede nessun file o release precedente.

## Discipline e banca domande

- Dogsitter: 1.000 domande
- Mantrailing: 1.500 domande
- HRDD: 1.500 domande
- Detection: 1.000 domande

Totale: **5.000 domande**. Mantrailing e HRDD comprendono anche Protezione Civile e settore cinofilo operativo.

## Ruoli

- **Super Amministratore:** controllo completo, utenti, sessioni, impostazioni, ruoli, prove e banche.
- **Docente:** gestione degli esami teorici e delle pratiche assegnate.
- **Esaminatore:** compila esclusivamente le valutazioni pratiche assegnate.
- **Corsista:** accede con username comune della sessione e password personale; svolge solo l’esame assegnato.

## Funzioni principali

- nessuna registrazione libera dei Corsisti;
- username comune per sessione e password individuali;
- disciplina assegnata dal Super Amministratore;
- prova teorica configurabile, predefinita a 40 domande;
- timer persistente e consegna automatica;
- correzione automatica verde/rossa configurabile;
- banche separate per disciplina;
- valutazione pratica collegata alla disciplina;
- pannello Impostazioni globale per nome, logo, testi, colori, tema, densità, bordi e comportamento dell’app;
- Edge Function per creare in sicurezza sessioni e credenziali.

## Struttura

```text
index.html
404.html
README.md
.env.example
.gitignore
supabase/
  config.toml
  schema.sql
  seed.sql
  migrations/
    20260805190000_k9_academy_release_1_0.sql
  functions/
    manage-exam-access/
      index.ts
```

# Installazione da zero

## 1. Creare il progetto Supabase

Creare un nuovo progetto dedicato. Conservare la password del database.

## 2. Creare tutto il database

Nel Dashboard Supabase aprire **SQL Editor → New query**.
Copiare ed eseguire tutto il contenuto di:

```text
supabase/schema.sql
```

Questo è l’unico schema necessario. Non eseguire anche il file nella cartella `migrations` dal Dashboard: contiene lo stesso schema ed è destinato alla CLI.

## 3. Caricare le 5.000 domande

Aprire una nuova query ed eseguire:

```text
supabase/seed.sql
```

Verificare:

```sql
select discipline, count(*)
from public.question_bank
group by discipline
order by discipline;
```

Risultato previsto:

```text
detection    1000
dogsitter    1000
hrdd         1500
mantrailing  1500
```

## 4. Creare il primo Super Amministratore

In **Authentication → Users**, creare manualmente il proprio utente con email e password.
Poi eseguire:

```sql
update public.profiles
set role='super_admin', updated_at=now()
where email='LA_TUA_EMAIL';
```

## 5. Distribuire la Edge Function

Percorso:

```text
supabase/functions/manage-exam-access/index.ts
```

Con Supabase CLI:

```bash
supabase login
supabase link --project-ref IL_TUO_PROJECT_REF
supabase functions deploy manage-exam-access
```

La `SUPABASE_SERVICE_ROLE_KEY` resta nell’ambiente server Supabase. Non va mai inserita nell’HTML o su GitHub.

## 6. Pubblicare su GitHub Pages

Creare una nuova repository GitHub e caricare **il contenuto di questa cartella**, mantenendo `index.html` nella radice.
Attivare **Settings → Pages → Deploy from a branch → main / root**.

## 7. Collegare l’app

Aprire l’app pubblicata, premere **Configura Supabase** e inserire:

- Project URL
- anon key / publishable key

Non usare la `service_role key`.

## 8. Primo utilizzo

1. Accedere come Super Amministratore.
2. Aprire Impostazioni e personalizzare app, logo, colori e comportamento.
3. Creare una sessione d’esame.
4. Impostare username comune, disciplina, domande, timer e soglia.
5. Creare i Corsisti con password personali diverse.
6. Assegnare Docente ed eventuale Esaminatore.
7. Consegnare le credenziali ai Corsisti.

## Nota sul seed

`supabase/seed.sql` svuota e ricarica la banca domande. Eseguirlo una sola volta sulla nuova installazione, oppure soltanto dopo un backup se la banca è stata modificata.
