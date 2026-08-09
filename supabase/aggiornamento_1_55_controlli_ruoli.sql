-- K9 Academy Esami — Release 1.55
-- Correzione RLS per schede esame con ruoli dinamici.
begin;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
for select to authenticated
using(
  id=auth.uid()
  or public.current_role()='super_admin'
  or public.has_role_permission('students_view')
  or public.has_role_permission('assign_exam')
  or public.has_role_permission('users_create')
  or public.has_role_permission('assign_evaluator')
  or (
    (
      public.has_role_permission('exam_management')
      or public.has_role_permission('exam_history')
      or public.has_role_permission('analytics')
      or public.has_role_permission('documents_view')
      or public.has_role_permission('practice_evaluation')
    )
    and exists(
      select 1
      from public.exam_assignments e
      where
        (e.student_id=profiles.id or e.assigned_by=profiles.id or e.evaluator_id=profiles.id)
        and (
          public.current_role()='vice_admin'
          or e.assigned_by=auth.uid()
          or e.evaluator_id=auth.uid()
        )
    )
  )
);

commit;

select policyname,tablename
from pg_policies
where schemaname='public' and tablename='profiles'
order by policyname;
