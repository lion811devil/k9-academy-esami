-- K9 Academy Esami — Release 1.51
-- Ruoli e permessi configurabili per Vice, Docente ed Esaminatore.
begin;

create table if not exists public.role_permissions(
  role text primary key check(role in('vice_admin','teacher','examiner')),
  permissions jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.role_permissions(role,permissions) values
('vice_admin','{
 "dashboard":true,"students_view":true,"assign_exam":true,"exam_management":true,
 "practice_evaluation":true,"assign_evaluator":true,"exam_history":true,"analytics":true,
 "documents_view":true,"generate_report":true,"generate_certificate":true,"verify_documents":true,
 "document_archive":true,"question_bank":false,"sessions_manage":true,"candidates_create":true,"users_create":true
}'::jsonb),
('teacher','{
 "dashboard":true,"students_view":true,"assign_exam":true,"exam_management":true,
 "practice_evaluation":true,"assign_evaluator":false,"exam_history":true,"analytics":false,
 "documents_view":true,"generate_report":true,"generate_certificate":false,"verify_documents":true,
 "document_archive":false,"question_bank":false,"sessions_manage":false,"candidates_create":false,"users_create":false
}'::jsonb),
('examiner','{
 "dashboard":false,"students_view":false,"assign_exam":false,"exam_management":true,
 "practice_evaluation":true,"assign_evaluator":false,"exam_history":false,"analytics":false,
 "documents_view":false,"generate_report":true,"generate_certificate":false,"verify_documents":false,
 "document_archive":false,"question_bank":false,"sessions_manage":false,"candidates_create":false,"users_create":false
}'::jsonb)
on conflict(role) do nothing;

alter table public.role_permissions enable row level security;

drop policy if exists role_permissions_super_all on public.role_permissions;
create policy role_permissions_super_all on public.role_permissions
for all to authenticated
using(public.current_role()='super_admin')
with check(public.current_role()='super_admin');

drop policy if exists role_permissions_own_read on public.role_permissions;
create policy role_permissions_own_read on public.role_permissions
for select to authenticated
using(role=public.current_role() or public.current_role()='super_admin');

grant select,insert,update,delete on public.role_permissions to authenticated;

create or replace function public.has_role_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
 select case
  when public.current_role()='super_admin' then true
  when public.current_role() in('vice_admin','teacher','examiner') then
    coalesce((
      select (rp.permissions ->> p_permission)::boolean
      from public.role_permissions rp
      where rp.role=public.current_role()
    ),false)
  else false
 end;
$$;

create or replace function public.get_my_role_permissions()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
 select case
  when public.current_role()='super_admin' then '{}'::jsonb
  else coalesce((select permissions from public.role_permissions where role=public.current_role()),'{}'::jsonb)
 end;
$$;

create or replace function public.get_all_role_permissions()
returns table(role text,permissions jsonb)
language plpgsql
security definer
set search_path=public
as $$
begin
 if public.current_role()<>'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 return query select rp.role,rp.permissions from public.role_permissions rp order by rp.role;
end;
$$;

create or replace function public.set_role_permissions(p_role text,p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare allowed_keys text[]:=array[
 'dashboard','students_view','assign_exam','exam_management','practice_evaluation','assign_evaluator',
 'exam_history','analytics','documents_view','generate_report','generate_certificate','verify_documents',
 'document_archive','question_bank','sessions_manage','candidates_create','users_create'
];
bad_key text;
begin
 if public.current_role()<>'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 if p_role not in('vice_admin','teacher','examiner') then raise exception 'Ruolo non configurabile'; end if;
 select key into bad_key from jsonb_object_keys(coalesce(p_permissions,'{}'::jsonb)) key where not(key=any(allowed_keys)) limit 1;
 if bad_key is not null then raise exception 'Permesso non valido: %',bad_key; end if;
 insert into public.role_permissions(role,permissions,updated_by,updated_at)
 values(p_role,coalesce(p_permissions,'{}'::jsonb),auth.uid(),now())
 on conflict(role) do update set permissions=excluded.permissions,updated_by=auth.uid(),updated_at=now();
end;
$$;

grant execute on function public.has_role_permission(text) to authenticated;
grant execute on function public.get_my_role_permissions() to authenticated;
grant execute on function public.get_all_role_permissions() to authenticated;
grant execute on function public.set_role_permissions(text,jsonb) to authenticated;

-- Assegnazione esami: ruolo + permesso.
create or replace function public.assign_exam(p_student_id uuid,p_discipline text,p_question_count integer,p_duration_minutes integer,p_pass_percentage integer,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
 if not public.has_role_permission('assign_exam') then raise exception 'Assegnazione esami non abilitata'; end if;
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
 if not public.has_role_permission('assign_evaluator') then raise exception 'Assegnazione valutatore non abilitata'; end if;
 if p_evaluator_id is not null and not exists(select 1 from public.profiles where id=p_evaluator_id and role in('examiner','teacher')) then raise exception 'Esaminatore non valido'; end if;
 update public.exam_assignments set evaluator_id=p_evaluator_id where id=p_assignment_id;
 if not found then raise exception 'Esame non disponibile'; end if;
end$$;

-- RLS: visibilità e operazioni sensibili seguono i permessi.
drop policy if exists sessions_staff_read on public.exam_sessions;
create policy sessions_staff_read on public.exam_sessions for select to authenticated
using(
 (public.has_role_permission('sessions_manage') or public.has_role_permission('candidates_create'))
 or exists(select 1 from public.session_candidates c where c.session_id=id and c.auth_user_id=auth.uid() and c.active)
);
drop policy if exists sessions_admin_all on public.exam_sessions;
create policy sessions_admin_all on public.exam_sessions for all to authenticated
using(public.has_role_permission('sessions_manage')) with check(public.has_role_permission('sessions_manage'));

drop policy if exists candidates_read on public.session_candidates;
create policy candidates_read on public.session_candidates for select to authenticated
using(public.has_role_permission('sessions_manage') or public.has_role_permission('candidates_create') or auth_user_id=auth.uid());
drop policy if exists candidates_admin_all on public.session_candidates;
create policy candidates_admin_all on public.session_candidates for all to authenticated
using(public.has_role_permission('sessions_manage') or public.has_role_permission('candidates_create'))
with check(public.has_role_permission('sessions_manage') or public.has_role_permission('candidates_create'));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using(
 id=auth.uid()
 or public.current_role()='super_admin'
 or public.has_role_permission('students_view')
 or public.has_role_permission('assign_exam')
 or public.has_role_permission('users_create')
 or public.has_role_permission('assign_evaluator')
);

drop policy if exists settings_read on public.exam_settings;
create policy settings_read on public.exam_settings for select to authenticated
using(public.current_role()='super_admin' or public.has_role_permission('assign_exam') or public.has_role_permission('sessions_manage'));

drop policy if exists bank_admin_read on public.question_bank;
create policy bank_admin_read on public.question_bank for select to authenticated
using(public.current_role()='super_admin' or public.has_role_permission('question_bank'));

drop policy if exists bank_admin_insert on public.question_bank;
create policy bank_admin_insert on public.question_bank for insert to authenticated
with check(public.current_role()='super_admin' or public.has_role_permission('question_bank'));
drop policy if exists bank_admin_update on public.question_bank;
create policy bank_admin_update on public.question_bank for update to authenticated
using(public.current_role()='super_admin' or public.has_role_permission('question_bank'))
with check(public.current_role()='super_admin' or public.has_role_permission('question_bank'));
drop policy if exists bank_admin_delete on public.question_bank;
create policy bank_admin_delete on public.question_bank for delete to authenticated
using(public.current_role()='super_admin' or public.has_role_permission('question_bank'));

drop policy if exists assignments_read on public.exam_assignments;
create policy assignments_read on public.exam_assignments for select to authenticated
using(
 student_id=auth.uid()
 or public.current_role()='super_admin'
 or (
   (public.has_role_permission('exam_management') or public.has_role_permission('exam_history') or public.has_role_permission('analytics') or public.has_role_permission('documents_view'))
   and (public.current_role()='vice_admin' or assigned_by=auth.uid() or evaluator_id=auth.uid())
 )
);

drop policy if exists questions_read on public.exam_questions;
create policy questions_read on public.exam_questions for select to authenticated
using(exists(
 select 1 from public.exam_assignments e
 where e.id=assignment_id and(
  e.student_id=auth.uid()
  or public.current_role()='super_admin'
  or (
    public.has_role_permission('exam_management')
    and (public.current_role()='vice_admin' or e.assigned_by=auth.uid() or e.evaluator_id=auth.uid())
  )
 )
));

drop policy if exists practical_staff on public.practical_evaluations;
create policy practical_staff on public.practical_evaluations for all to authenticated
using(
 public.current_role()='super_admin'
 or (
   public.has_role_permission('practice_evaluation')
   and exists(select 1 from public.exam_assignments e where e.id=assignment_id and (public.current_role()='vice_admin' or e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()))
 )
)
with check(
 public.current_role()='super_admin'
 or (
   public.has_role_permission('practice_evaluation')
   and exists(select 1 from public.exam_assignments e where e.id=assignment_id and (public.current_role()='vice_admin' or e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()))
 )
);

-- Registro documenti: accesso subordinato ai permessi documentali.
drop policy if exists exam_documents_select_authenticated on public.exam_documents;
create policy exam_documents_select_authenticated on public.exam_documents
for select to authenticated
using(
 student_id=auth.uid()
 or public.current_role()='super_admin'
 or (
   (public.has_role_permission('documents_view') or public.has_role_permission('document_archive') or public.has_role_permission('verify_documents'))
   and (public.current_role()='vice_admin' or issued_by=auth.uid())
 )
);

-- Funzioni registro/verifica/lista aggiornate con controllo permessi.
create or replace function public.verify_exam_document(p_document_code text)
returns table (
  document_code text,document_type text,document_group_code text,associated_document_code text,
  associated_document_registered boolean,student_name text,discipline text,organization_name text,
  final_status text,issued_at timestamptz,last_generated_at timestamptz,generation_count integer,status text
)
language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'super_admin' and not public.has_role_permission('verify_documents') then
   raise exception 'Verifica documenti non abilitata';
 end if;
 return query
 with requested as (
   select upper(trim(regexp_replace(p_document_code, '^N\.?\s*', '', 'i'))) as code
 )
 select d.document_code,d.document_type,d.document_group_code,
   coalesce(sibling.document_code,case when d.document_type='certificate' then 'VER-'||d.document_group_code else 'ATT-'||d.document_group_code end),
   (sibling.id is not null),d.student_name,d.discipline,d.organization_name,d.final_status,
   d.issued_at,d.last_generated_at,d.generation_count,d.status
 from public.exam_documents d cross join requested r
 left join public.exam_documents sibling on sibling.assignment_id=d.assignment_id and sibling.document_type<>d.document_type
 where d.document_code=r.code
   and (public.current_role()='super_admin' or public.current_role()='vice_admin' or d.issued_by=auth.uid() or d.student_id=auth.uid())
 limit 1;
end$$;

create or replace function public.list_exam_documents()
returns table (
 id uuid,assignment_id uuid,document_type text,document_code text,document_group_code text,
 student_id uuid,student_name text,discipline text,organization_name text,final_status text,
 issued_at timestamptz,last_generated_at timestamptz,generation_count integer,status text
)
language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'super_admin' and not public.has_role_permission('document_archive') then
   raise exception 'Archivio documenti non abilitato';
 end if;
 return query select d.id,d.assignment_id,d.document_type,d.document_code,d.document_group_code,d.student_id,d.student_name,
 d.discipline,d.organization_name,d.final_status,d.issued_at,d.last_generated_at,d.generation_count,d.status
 from public.exam_documents d
 where public.current_role() in('super_admin','vice_admin') or d.student_id=auth.uid() or d.issued_by=auth.uid()
 order by d.issued_at desc;
end$$;

grant execute on function public.verify_exam_document(text) to authenticated;
grant execute on function public.list_exam_documents() to authenticated;

commit;

select role,permissions from public.role_permissions order by role;
