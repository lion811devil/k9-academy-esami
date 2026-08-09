-- K9 Academy Esami — Release 1.44
-- Registro documentale e verifica codici ATT/VER.
begin;

create table if not exists public.exam_documents (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.exam_assignments(id) on delete cascade,
  document_type text not null check (document_type in ('report','certificate')),
  document_code text not null unique,
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_name text,
  discipline text not null,
  organization_name text,
  final_status text,
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  last_generated_at timestamptz not null default now(),
  generation_count integer not null default 1 check (generation_count > 0),
  issued_by uuid references public.profiles(id),
  status text not null default 'valid' check (status in ('valid','revoked'))
);

create unique index if not exists exam_documents_assignment_type_uidx
  on public.exam_documents(assignment_id,document_type);

create index if not exists exam_documents_code_idx
  on public.exam_documents(document_code);

alter table public.exam_documents enable row level security;

drop policy if exists exam_documents_select_authenticated on public.exam_documents;
create policy exam_documents_select_authenticated
on public.exam_documents
for select
to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin','vice_admin','teacher','examiner')
  )
);

revoke all on public.exam_documents from anon;
grant select on public.exam_documents to authenticated;

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

  select full_name into v_student_name
  from public.profiles
  where id=v_assignment.student_id;

  v_org := nullif(p_metadata->>'organization_name','');
  v_final := nullif(p_metadata->>'final_status','');

  insert into public.exam_documents(
    assignment_id,document_type,document_code,student_id,student_name,
    discipline,organization_name,final_status,metadata,issued_by
  )
  values(
    v_assignment.id,p_document_type,upper(trim(p_document_code)),
    v_assignment.student_id,v_student_name,v_assignment.discipline,
    v_org,v_final,coalesce(p_metadata,'{}'::jsonb),auth.uid()
  )
  on conflict (assignment_id,document_type)
  do update set
    document_code=excluded.document_code,
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

create or replace function public.verify_exam_document(p_document_code text)
returns table (
  document_code text,
  document_type text,
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
  select
    d.document_code,
    d.document_type,
    d.student_name,
    d.discipline,
    d.organization_name,
    d.final_status,
    d.issued_at,
    d.last_generated_at,
    d.generation_count,
    d.status
  from public.exam_documents d
  where upper(d.document_code)=upper(trim(p_document_code))
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
  to_regclass('public.exam_documents') as registro_documenti,
  proname
from pg_proc
where proname in ('register_exam_document','verify_exam_document')
order by proname;
