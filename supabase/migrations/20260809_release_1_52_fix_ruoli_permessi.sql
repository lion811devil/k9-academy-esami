-- K9 Academy Esami — Release 1.52
-- Correzione approfondita Ruoli e permessi.
begin;

-- Le dipendenze vengono normalizzate anche lato database.
create or replace function public.normalize_role_permissions(p_permissions jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare p jsonb:=coalesce(p_permissions,'{}'::jsonb);
begin
 if coalesce((p->>'practice_evaluation')::boolean,false) then p:=jsonb_set(p,'{exam_management}','true'::jsonb,true); end if;
 if coalesce((p->>'assign_evaluator')::boolean,false) then p:=jsonb_set(p,'{exam_management}','true'::jsonb,true); end if;
 if coalesce((p->>'verify_documents')::boolean,false) then p:=jsonb_set(p,'{documents_view}','true'::jsonb,true); end if;
 if coalesce((p->>'assign_exam')::boolean,false) then p:=jsonb_set(p,'{students_view}','true'::jsonb,true); end if;
 return p;
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
bad_key text; normalized jsonb;
begin
 if public.current_role()<>'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 if p_role not in('vice_admin','teacher','examiner') then raise exception 'Ruolo non configurabile'; end if;
 select key into bad_key from jsonb_object_keys(coalesce(p_permissions,'{}'::jsonb)) key where not(key=any(allowed_keys)) limit 1;
 if bad_key is not null then raise exception 'Permesso non valido: %',bad_key; end if;
 normalized:=public.normalize_role_permissions(p_permissions);
 insert into public.role_permissions(role,permissions,updated_by,updated_at)
 values(p_role,normalized,auth.uid(),now())
 on conflict(role) do update set permissions=excluded.permissions,updated_by=auth.uid(),updated_at=now();
end;
$$;

-- Normalizza le configurazioni già salvate.
update public.role_permissions set permissions=public.normalize_role_permissions(permissions),updated_at=now();

-- Dashboard coerente: una singola RPC controllata dal permesso dashboard.
create or replace function public.get_role_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare r text:=public.current_role();students_count integer:=0;open_count integer:=0;completed_count integer:=0;sessions_count integer:=0;
begin
 if r<>'super_admin' and not public.has_role_permission('dashboard') then raise exception 'Dashboard non abilitata'; end if;
 if r in('super_admin','vice_admin') then
   select count(*) into students_count from public.profiles where role='student';
   select count(*) into open_count from public.exam_assignments where status in('assigned','in_progress');
   select count(*) into completed_count from public.exam_assignments where status in('submitted','expired');
   select count(*) into sessions_count from public.exam_sessions where active=true;
 else
   select count(distinct e.student_id) into students_count from public.exam_assignments e where e.assigned_by=auth.uid() or e.evaluator_id=auth.uid();
   select count(*) into open_count from public.exam_assignments e where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and e.status in('assigned','in_progress');
   select count(*) into completed_count from public.exam_assignments e where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and e.status in('submitted','expired');
   select count(distinct e.session_id) into sessions_count from public.exam_assignments e join public.exam_sessions s on s.id=e.session_id where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and s.active=true;
 end if;
 return jsonb_build_object('students',students_count,'open_exams',open_count,'completed_exams',completed_count,'active_sessions',sessions_count);
end;
$$;
grant execute on function public.get_role_dashboard() to authenticated;

-- Registrazione documenti: applica generate_report / generate_certificate anche lato server.
create or replace function public.register_exam_document(
  p_assignment_id uuid,
  p_document_type text,
  p_document_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.exam_documents
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment public.exam_assignments%rowtype;
  v_student_name text;
  v_org text;
  v_final text;
  v_group text;
  v_code text;
  v_row public.exam_documents%rowtype;
  v_role text:=public.current_role();
  required_permission text;
begin
  select * into v_assignment from public.exam_assignments where id=p_assignment_id;
  if not found then raise exception 'Esame non trovato'; end if;
  if p_document_type not in ('report','certificate') then raise exception 'Tipo documento non valido'; end if;
  required_permission:=case when p_document_type='certificate' then 'generate_certificate' else 'generate_report' end;
  if v_role<>'super_admin' and not public.has_role_permission(required_permission) then raise exception 'Generazione documento non abilitata'; end if;
  if v_role<>'super_admin' and v_role<>'vice_admin' and v_assignment.assigned_by<>auth.uid() and coalesce(v_assignment.evaluator_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid() then raise exception 'Esame non accessibile'; end if;
  v_code:=upper(trim(regexp_replace(p_document_code,'^N\.?\s*','','i')));
  v_group:=regexp_replace(v_code,'^(ATT|VER)-','');
  if v_group is null or trim(v_group)='' then raise exception 'Codice documento non valido'; end if;
  select full_name into v_student_name from public.profiles where id=v_assignment.student_id;
  v_org:=nullif(p_metadata->>'organization_name','');v_final:=nullif(p_metadata->>'final_status','');
  insert into public.exam_documents(assignment_id,document_type,document_code,document_group_code,student_id,student_name,discipline,organization_name,final_status,metadata,issued_by)
  values(v_assignment.id,p_document_type,v_code,v_group,v_assignment.student_id,v_student_name,v_assignment.discipline,v_org,v_final,coalesce(p_metadata,'{}'::jsonb),auth.uid())
  on conflict(assignment_id,document_type) do update set document_code=excluded.document_code,document_group_code=excluded.document_group_code,student_name=excluded.student_name,discipline=excluded.discipline,organization_name=excluded.organization_name,final_status=excluded.final_status,metadata=excluded.metadata,last_generated_at=now(),generation_count=public.exam_documents.generation_count+1,issued_by=auth.uid(),status='valid'
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.register_exam_document(uuid,text,text,jsonb) to authenticated;

commit;

select role,permissions from public.role_permissions order by role;
