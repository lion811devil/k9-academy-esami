-- K9 Academy Esami — Release 1.61 — Audit integrità repository
-- Idempotente: può essere eseguito sul database live per riallineare i punti strutturali.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check(role in('student','teacher','examiner','vice_admin','super_admin'));

alter table public.practical_evaluations
  add column if not exists professional_criteria jsonb not null default '[]'::jsonb;

create table if not exists public.exam_documents (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.exam_assignments(id) on delete cascade,
  document_type text not null check (document_type in ('report','certificate')),
  document_code text not null unique,
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_name text, discipline text not null, organization_name text, final_status text,
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  last_generated_at timestamptz not null default now(),
  generation_count integer not null default 1 check (generation_count > 0),
  issued_by uuid references public.profiles(id),
  status text not null default 'valid' check (status in ('valid','revoked'))
);
create unique index if not exists exam_documents_assignment_type_uidx on public.exam_documents(assignment_id,document_type);
create index if not exists exam_documents_code_idx on public.exam_documents(document_code);
alter table public.exam_documents enable row level security;

alter table public.exam_sessions add column if not exists archived_at timestamptz;
create index if not exists exam_sessions_archived_at_idx on public.exam_sessions(archived_at);

create or replace view public.exam_session_overview with(security_invoker=true) as
select s.*,
       count(c.id)::integer candidate_count,
       count(c.id) filter(where c.active)::integer active_candidate_count
from public.exam_sessions s
left join public.session_candidates c on c.session_id=s.id
group by s.id;

grant select on public.exam_session_overview,public.exam_sessions,public.session_candidates to authenticated;
grant update(active,archived_at,updated_at) on public.exam_sessions to authenticated;

drop policy if exists sessions_admin_all on public.exam_sessions;
create policy sessions_admin_all on public.exam_sessions for all to authenticated
using(public.has_role_permission('sessions_manage'))
with check(public.has_role_permission('sessions_manage'));

commit;

select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='practical_evaluations' and column_name='professional_criteria') as professional_criteria_ok,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='exam_sessions' and column_name='archived_at') as session_archive_ok,
  to_regclass('public.exam_documents') is not null as exam_documents_ok;
