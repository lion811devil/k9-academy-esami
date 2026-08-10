-- K9 Academy Esami — Release 1.61
-- Archiviazione sicura utenti: Vice, Docente, Esaminatore e Corsista.

begin;

alter table public.profiles
  add column if not exists archived_at timestamptz;

create index if not exists profiles_archived_at_idx on public.profiles(archived_at);

comment on column public.profiles.archived_at is
  'NULL = account attivo; valorizzato = account archiviato e accesso applicativo disabilitato.';

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select case when archived_at is null then role else null end
  from public.profiles
  where id=auth.uid()
$$;

create or replace function public.assign_exam(p_student_id uuid,p_discipline text,p_question_count integer,p_duration_minutes integer,p_pass_percentage integer,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
 if not public.has_role_permission('assign_exam') then raise exception 'Assegnazione esami non abilitata'; end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student' and archived_at is null) then raise exception 'Corsista non valido o archiviato'; end if;
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
 if not public.has_role_permission('assign_evaluator') then raise exception 'Assegnazione valutatore non abilitata'; end if;
 if p_evaluator_id is not null and not exists(select 1 from public.profiles where id=p_evaluator_id and role in('examiner','teacher') and archived_at is null) then raise exception 'Esaminatore non valido o archiviato'; end if;
 update public.exam_assignments set evaluator_id=p_evaluator_id where id=p_assignment_id;
 if not found then raise exception 'Esame non disponibile'; end if;
end$$;

create or replace function public.get_role_dashboard()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r text:=public.current_role();students_count integer:=0;open_count integer:=0;completed_count integer:=0;sessions_count integer:=0;
begin
 if r<>'super_admin' and not public.has_role_permission('dashboard') then raise exception 'Dashboard non abilitata'; end if;
 if r in('super_admin','vice_admin') then
   select count(*) into students_count from public.profiles where role='student' and archived_at is null;
   select count(*) into open_count from public.exam_assignments where status in('assigned','in_progress');
   select count(*) into completed_count from public.exam_assignments where status in('submitted','expired');
   select count(*) into sessions_count from public.exam_sessions where active=true;
 else
   select count(distinct e.student_id) into students_count from public.exam_assignments e join public.profiles p on p.id=e.student_id where p.archived_at is null and (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid());
   select count(*) into open_count from public.exam_assignments e where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and e.status in('assigned','in_progress');
   select count(*) into completed_count from public.exam_assignments e where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and e.status in('submitted','expired');
   select count(distinct e.session_id) into sessions_count from public.exam_assignments e join public.exam_sessions s on s.id=e.session_id where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and s.active=true;
 end if;
 return jsonb_build_object('students',students_count,'open_exams',open_count,'completed_exams',completed_count,'active_sessions',sessions_count);
end$$;

grant execute on function public.current_role() to authenticated;
grant execute on function public.assign_exam(uuid,text,integer,integer,integer,text) to authenticated;
grant execute on function public.set_exam_evaluator(uuid,uuid) to authenticated;
grant execute on function public.get_role_dashboard() to authenticated;

commit;
