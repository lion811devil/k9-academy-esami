-- K9 ACADEMY ESAMI — AGGIORNAMENTO RELEASE 2.0
-- Eseguire una sola volta nel SQL Editor di Supabase.

alter table public.session_candidates
  add column if not exists login_email text,
  add column if not exists credential_hash text;

create unique index if not exists session_candidates_login_email_unique
  on public.session_candidates(login_email)
  where login_email is not null;

create unique index if not exists session_candidates_credential_hash_unique
  on public.session_candidates(credential_hash)
  where credential_hash is not null;

comment on column public.session_candidates.login_email is
  'Email tecnica stabile usata internamente per Supabase Auth; non mostrata al Corsista.';

comment on column public.session_candidates.credential_hash is
  'Hash SHA-256 di username sessione e password personale, usato dalla Edge Function per risolvere l’account.';

-- I record creati prima della Release 2.0 non possono essere migrati automaticamente
-- perché la password originale non è disponibile. Per tali Corsisti usa il comando
-- "Cambia password" dal pannello Super Amministratore dopo aver distribuito la nuova funzione.

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='session_candidates'
      and column_name='login_email'
  ) as login_email_ready,
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='session_candidates'
      and column_name='credential_hash'
  ) as credential_hash_ready;
