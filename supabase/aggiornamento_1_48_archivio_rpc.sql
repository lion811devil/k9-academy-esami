-- K9 Academy Esami — Release 1.48
-- Lettura robusta Archivio Documenti tramite RPC.
begin;

create or replace function public.list_exam_documents()
returns table (
  id uuid,
  assignment_id uuid,
  document_type text,
  document_code text,
  document_group_code text,
  student_id uuid,
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
    d.id,
    d.assignment_id,
    d.document_type,
    d.document_code,
    d.document_group_code,
    d.student_id,
    d.student_name,
    d.discipline,
    d.organization_name,
    d.final_status,
    d.issued_at,
    d.last_generated_at,
    d.generation_count,
    d.status
  from public.exam_documents d
  where
    d.student_id=auth.uid()
    or exists (
      select 1
      from public.profiles p
      where p.id=auth.uid()
        and p.role in ('super_admin','vice_admin','teacher','examiner')
    )
  order by d.issued_at desc;
$$;

revoke all on function public.list_exam_documents() from public,anon;
grant execute on function public.list_exam_documents() to authenticated;

commit;

select proname
from pg_proc
where proname='list_exam_documents';
