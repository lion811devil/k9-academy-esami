-- K9 Academy Esami — Release 1.61
-- Archiviazione reversibile delle sessioni d'esame.
-- Eseguire una sola volta nel SQL Editor Supabase.

alter table public.exam_sessions
  add column if not exists archived_at timestamptz;

create index if not exists exam_sessions_archived_at_idx
  on public.exam_sessions(archived_at);

comment on column public.exam_sessions.archived_at is
  'Data di archiviazione della sessione. NULL = sessione non archiviata.';
