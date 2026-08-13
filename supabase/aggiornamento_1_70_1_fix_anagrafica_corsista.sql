-- K9 Academy Release 1.70.1 — FIX anagrafica corsista
-- Idempotente: può essere eseguito anche se il precedente script 1.70 si è fermato sulla VIEW.
-- Correzione: le nuove colonne della VIEW vengono aggiunte ALLA FINE,
-- senza cambiare nome/ordine delle colonne già esistenti.

begin;

alter table public.profiles
  add column if not exists fiscal_code text,
  add column if not exists birth_date date,
  add column if not exists birth_place text;

create unique index if not exists profiles_student_fiscal_code_uidx
on public.profiles (upper(fiscal_code))
where role='student'
  and fiscal_code is not null
  and btrim(fiscal_code)<>'';

create or replace view public.exam_overview
with (security_invoker=true) as
select
  e.*,
  s.full_name as student_name,
  s.email as student_email,
  a.full_name as assigned_by_name,
  ev.full_name as evaluator_name,
  ev.email as evaluator_email,
  p.criteria as practical_criteria,
  p.professional_criteria,
  p.practical_score,
  p.professional_score,
  p.outcome as practical_outcome,
  p.components as practical_components,
  p.notes as practical_notes,
  p.completed_at as practical_completed_at,
  -- Nuovi campi: DEVONO restare in coda per compatibilità con CREATE OR REPLACE VIEW
  s.fiscal_code as student_fiscal_code,
  s.birth_date as student_birth_date,
  s.birth_place as student_birth_place
from public.exam_assignments e
join public.profiles s on s.id=e.student_id
join public.profiles a on a.id=e.assigned_by
left join public.profiles ev on ev.id=e.evaluator_id
left join public.practical_evaluations p on p.assignment_id=e.id;

grant select on public.exam_overview to authenticated;

commit;

-- Verifica finale: deve restituire 3 righe.
select column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='profiles'
  and column_name in ('fiscal_code','birth_date','birth_place')
order by column_name;
