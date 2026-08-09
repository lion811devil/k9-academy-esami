-- K9 Academy Esami — Release 1.45
-- Associazione formale Attestato ↔ Verbale per singolo candidato/esame.
begin;

alter table public.exam_documents
  add column if not exists document_group_code text;

update public.exam_documents
set document_group_code = regexp_replace(upper(trim(document_code)), '^(ATT|VER)-', '')
where document_group_code is null or trim(document_group_code)='';

alter table public.exam_documents
  alter column document_group_code set not null;

create index if not exists exam_documents_group_code_idx
  on public.exam_documents(document_group_code);

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
  v_role text;
begin
  select * into v_assignment
  from public.exam_assignments
  where id=p_assignment_id;

  if not found then
    raise exception 'Esame non trovato';
  end if;

  select role into v_role from public.profiles where id=auth.uid();

  if auth.uid() <> v_assignment.student_id
     and coalesce(v_role,'') not in ('super_admin','vice_admin','teacher','examiner') then
    raise exception 'Permesso negato';
  end if;

  if p_document_type not in ('report','certificate') then
    raise exception 'Tipo documento non valido';
  end if;

  v_code := upper(trim(regexp_replace(p_document_code, '^N\.?\s*', '', 'i')));
  v_group := regexp_replace(v_code, '^(ATT|VER)-', '');

  if v_group is null or trim(v_group)='' then
    raise exception 'Codice documento non valido';
  end if;

  select full_name into v_student_name
  from public.profiles
  where id=v_assignment.student_id;

  v_org := nullif(p_metadata->>'organization_name','');
  v_final := nullif(p_metadata->>'final_status','');

  insert into public.exam_documents(
    assignment_id,document_type,document_code,document_group_code,
    student_id,student_name,discipline,organization_name,final_status,metadata,issued_by
  )
  values(
    v_assignment.id,p_document_type,v_code,v_group,
    v_assignment.student_id,v_student_name,v_assignment.discipline,
    v_org,v_final,coalesce(p_metadata,'{}'::jsonb),auth.uid()
  )
  on conflict (assignment_id,document_type)
  do update set
    document_code=excluded.document_code,
    document_group_code=excluded.document_group_code,
    student_name=excluded.student_name,
    discipline=excluded.discipline,
    organization_name=excluded.organization_name,
    final_status=excluded.final_status,
    metadata=excluded.metadata,
    last_generated_at=now(),
    generation_count=public.exam_documents.generation_count+1,
    issued_by=auth.uid(),
    status='valid'
  returning * into v_row;

  return v_row;
end;
$$;

drop function if exists public.verify_exam_document(text);

create function public.verify_exam_document(p_document_code text)
returns table (
  document_code text,
  document_type text,
  document_group_code text,
  associated_document_code text,
  associated_document_registered boolean,
  student_name text,
  discipline text,
  organization_name text,
  final_status text,
  issued_at timestamptz,
  last_generated_at timestamptz,
  generation_count integer,
  status text
)
language sql
security definer
set search_path=public
as $$
  with requested as (
    select upper(trim(regexp_replace(p_document_code, '^N\.?\s*', '', 'i'))) as code
  )
  select
    d.document_code,
    d.document_type,
    d.document_group_code,
    coalesce(
      sibling.document_code,
      case
        when d.document_type='certificate' then 'VER-'||d.document_group_code
        else 'ATT-'||d.document_group_code
      end
    ) as associated_document_code,
    (sibling.id is not null) as associated_document_registered,
    d.student_name,
    d.discipline,
    d.organization_name,
    d.final_status,
    d.issued_at,
    d.last_generated_at,
    d.generation_count,
    d.status
  from public.exam_documents d
  cross join requested r
  left join public.exam_documents sibling
    on sibling.assignment_id=d.assignment_id
   and sibling.document_type<>d.document_type
  where d.document_code=r.code
    and (
      d.student_id=auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.role in ('super_admin','vice_admin','teacher','examiner')
      )
    )
  limit 1;
$$;

revoke all on function public.register_exam_document(uuid,text,text,jsonb) from public,anon;
grant execute on function public.register_exam_document(uuid,text,text,jsonb) to authenticated;

revoke all on function public.verify_exam_document(text) from public,anon;
grant execute on function public.verify_exam_document(text) to authenticated;

commit;

select
  document_code,
  document_group_code,
  document_type,
  assignment_id
from public.exam_documents
order by issued_at desc
limit 20;
