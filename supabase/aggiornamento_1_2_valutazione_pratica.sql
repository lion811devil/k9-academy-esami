-- K9 ACADEMY ESAMI — RELEASE 1.2
-- Aggiornamento valutazione pratica per disciplina.
-- Eseguire una sola volta nel SQL Editor di Supabase.

alter table public.practical_evaluations
  add column if not exists professional_criteria jsonb not null default '[]'::jsonb;

drop view if exists public.exam_overview;

create view public.exam_overview
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
  p.notes as practical_notes,
  p.completed_at as practical_completed_at
from public.exam_assignments e
join public.profiles s on s.id=e.student_id
join public.profiles a on a.id=e.assigned_by
left join public.profiles ev on ev.id=e.evaluator_id
left join public.practical_evaluations p on p.assignment_id=e.id;

grant select on public.exam_overview to authenticated;
grant select, insert, update on public.practical_evaluations to authenticated;

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='practical_evaluations'
      and column_name='professional_criteria'
  ) as professional_criteria_ready;
