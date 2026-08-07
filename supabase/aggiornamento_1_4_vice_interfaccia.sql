-- K9 ACADEMY ESAMI — RELEASE 1.4
-- Vice Amministratore e permessi selettivi.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
check(role in('student','teacher','examiner','vice_admin','super_admin'));

create or replace function public.assign_exam(p_student_id uuid,p_discipline text,p_question_count integer,p_duration_minutes integer,p_pass_percentage integer,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$declare new_id uuid;
begin
 if public.current_role() not in('teacher','vice_admin','super_admin') then raise exception 'Non autorizzato'; end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student') then raise exception 'Corsista non valido'; end if;
 if p_discipline not in('dogsitter','mantrailing','hrdd','detection') then raise exception 'Disciplina non valida'; end if;
 if exists(select 1 from public.exam_assignments where student_id=p_student_id and status in('assigned','in_progress')) then raise exception 'Il corsista ha già un esame aperto'; end if;
 if (select count(*) from public.question_bank where active and discipline=p_discipline) < p_question_count then raise exception 'Domande attive insufficienti per la disciplina selezionata'; end if;
 insert into public.exam_assignments(student_id,assigned_by,discipline,question_count,duration_minutes,pass_percentage,notes)
 values(p_student_id,auth.uid(),p_discipline,p_question_count,p_duration_minutes,p_pass_percentage,p_notes) returning id into new_id;
 return new_id;
end$$;

create or replace function public.set_exam_evaluator(p_assignment_id uuid,p_evaluator_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.current_role() not in('vice_admin','super_admin') then raise exception 'Funzione riservata all’amministrazione'; end if;
 if p_evaluator_id is not null and not exists(select 1 from public.profiles where id=p_evaluator_id and role in('examiner','teacher')) then raise exception 'Esaminatore non valido'; end if;
 update public.exam_assignments set evaluator_id=p_evaluator_id where id=p_assignment_id;
 if not found then raise exception 'Esame non disponibile'; end if;
end$$;

drop policy if exists sessions_staff_read on public.exam_sessions;
create policy sessions_staff_read on public.exam_sessions for select to authenticated
using(public.current_role() in('teacher','examiner','vice_admin','super_admin') or exists(select 1 from public.session_candidates c where c.session_id=id and c.auth_user_id=auth.uid() and c.active));
drop policy if exists sessions_admin_all on public.exam_sessions;
create policy sessions_admin_all on public.exam_sessions for all to authenticated
using(public.current_role() in('vice_admin','super_admin')) with check(public.current_role() in('vice_admin','super_admin'));

drop policy if exists candidates_read on public.session_candidates;
create policy candidates_read on public.session_candidates for select to authenticated
using(public.current_role() in('teacher','examiner','vice_admin','super_admin') or auth_user_id=auth.uid());
drop policy if exists candidates_admin_all on public.session_candidates;
create policy candidates_admin_all on public.session_candidates for all to authenticated
using(public.current_role() in('vice_admin','super_admin')) with check(public.current_role() in('vice_admin','super_admin'));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using(id=auth.uid() or public.current_role() in('teacher','examiner','vice_admin','super_admin'));

drop policy if exists settings_read on public.exam_settings;
create policy settings_read on public.exam_settings for select to authenticated
using(public.current_role() in('teacher','vice_admin','super_admin'));

drop policy if exists assignments_read on public.exam_assignments;
create policy assignments_read on public.exam_assignments for select to authenticated
using(student_id=auth.uid() or public.current_role() in('vice_admin','super_admin') or assigned_by=auth.uid() or evaluator_id=auth.uid());

drop policy if exists questions_read on public.exam_questions;
create policy questions_read on public.exam_questions for select to authenticated
using(exists(select 1 from public.exam_assignments e where e.id=assignment_id and(e.student_id=auth.uid() or public.current_role() in('vice_admin','super_admin') or e.assigned_by=auth.uid() or e.evaluator_id=auth.uid())));

drop policy if exists practical_staff on public.practical_evaluations;
create policy practical_staff on public.practical_evaluations for all to authenticated
using(public.current_role() in('vice_admin','super_admin') or exists(select 1 from public.exam_assignments e where e.id=assignment_id and(e.assigned_by=auth.uid() or e.evaluator_id=auth.uid())))
with check(public.current_role() in('vice_admin','super_admin') or exists(select 1 from public.exam_assignments e where e.id=assignment_id and(e.assigned_by=auth.uid() or e.evaluator_id=auth.uid())));

commit;

select exists(select 1 from pg_constraint where conname='profiles_role_check') as role_constraint_ready;
