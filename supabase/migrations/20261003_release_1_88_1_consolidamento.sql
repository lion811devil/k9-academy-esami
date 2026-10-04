-- K9 Academy Esami — Release 1.88.1 — migration canonica post-1.70.1
-- Consolida lo stato database 1.77–1.88 già presente in schema.sql.
-- Idempotenza: le sezioni originali usano IF EXISTS/IF NOT EXISTS/CREATE OR REPLACE dove previsto.

-- RELEASE 1.84 — BASELINE CANONICA 1.77 -> 1.83.2
-- Stato finale per nuove installazioni e disaster recovery.
-- ================================================================

begin;

-- Credenziali personali Corsista (1.77): un account può partecipare a più corsi.
create table if not exists public.student_credentials(
  student_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  login_email text not null,
  credential_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists student_credentials_username_unique on public.student_credentials(lower(username));
create unique index if not exists student_credentials_login_email_unique on public.student_credentials(login_email);
create unique index if not exists student_credentials_hash_unique on public.student_credentials(credential_hash);
alter table public.student_credentials enable row level security;
drop policy if exists student_credentials_staff_read on public.student_credentials;
create policy student_credentials_staff_read on public.student_credentials
for select to authenticated
using(public.current_role() in ('super_admin','vice_admin'));
revoke all on table public.student_credentials from anon;
grant select on table public.student_credentials to authenticated;

-- Multi-corso: elimina vincoli legacy che limitavano il Corsista a una sola sessione.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.session_candidates'::regclass
      and contype='u'
      and regexp_replace(pg_get_constraintdef(oid), '\\s+', ' ', 'g') ~* 'UNIQUE \\(auth_user_id\\)'
  loop
    execute format('alter table public.session_candidates drop constraint %I', c.conname);
  end loop;
end $$;
drop index if exists public.session_candidates_login_email_unique;
create index if not exists session_candidates_auth_user_id_idx on public.session_candidates(auth_user_id);
create index if not exists session_candidates_login_email_idx on public.session_candidates(login_email) where login_email is not null;

-- Motore casuale/anti-ripetizione 1.83.
create or replace function public.prepare_exam_questions(p_assignment_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  ex public.exam_assignments%rowtype;
  existing_count integer;
  inserted_count integer;
begin
  select * into ex from public.exam_assignments where id=p_assignment_id for update;
  if not found then raise exception 'Assegnazione non trovata'; end if;
  if ex.status<>'assigned' then raise exception 'La prova non è più preparabile'; end if;

  select count(*) into existing_count from public.exam_questions where assignment_id=ex.id;
  -- Una prova già composta non viene mai rimescolata: il Corsista riceve una composizione stabile.
  if existing_count>0 then
    if existing_count<>ex.question_count then raise exception 'Composizione prova incompleta'; end if;
    return existing_count;
  end if;

  if (select count(*) from public.question_bank where active and discipline=ex.discipline) < ex.question_count then
    raise exception 'Domande attive insufficienti per %', ex.discipline;
  end if;

  insert into public.exam_questions(assignment_id,position,question_id,option_order)
  with student_usage as (
    select eq.question_id, count(*)::integer as uses, max(coalesce(a.submitted_at,a.started_at,a.assigned_at)) as last_used
    from public.exam_questions eq
    join public.exam_assignments a on a.id=eq.assignment_id
    where a.student_id=ex.student_id and a.discipline=ex.discipline and a.id<>ex.id
    group by eq.question_id
  ), session_usage as (
    select eq.question_id, count(*)::integer as uses
    from public.exam_questions eq
    join public.exam_assignments a on a.id=eq.assignment_id
    where ex.session_id is not null and a.session_id=ex.session_id and a.id<>ex.id
    group by eq.question_id
  ), candidates as (
    select qb.id,qb.category,
           coalesce(su.uses,0) as student_uses,
           coalesce(cu.uses,0) as course_uses,
           su.last_used,
           row_number() over(partition by qb.category order by random()) as category_rank
    from public.question_bank qb
    left join student_usage su on su.question_id=qb.id
    left join session_usage cu on cu.question_id=qb.id
    where qb.active=true and qb.discipline=ex.discipline
  ), picked as (
    select id
    from candidates
    order by student_uses asc, course_uses asc, category_rank asc, last_used asc nulls first, random()
    limit ex.question_count
  ), shuffled as (
    select id,row_number() over(order by random())::integer as position from picked
  )
  select ex.id,s.position,s.id,
         array(select v::smallint from unnest(array[0,1,2,3]::smallint[]) as v order by random())::smallint[]
  from shuffled s;

  get diagnostics inserted_count = row_count;
  if inserted_count<>ex.question_count then raise exception 'Errore nella composizione casuale della prova'; end if;
  return inserted_count;
end $$;

revoke all on function public.prepare_exam_questions(uuid) from public, anon, authenticated;
grant execute on function public.prepare_exam_questions(uuid) to service_role;

create or replace function public.start_assigned_exam(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ex public.exam_assignments%rowtype;
begin
 select * into ex
 from public.exam_assignments
 where id=p_assignment_id
 for update;

 if not found or ex.student_id<>auth.uid() then
   raise exception 'Esame non disponibile';
 end if;

 if ex.status='assigned' then
   update public.exam_assignments
   set status='in_progress',
       started_at=now(),
       ends_at=now()+make_interval(mins=>duration_minutes)
   where id=ex.id
   returning * into ex;

   if (select count(*) from public.question_bank where active and discipline=ex.discipline) < ex.question_count then
     raise exception 'Domande attive insufficienti per %', ex.discipline;
   end if;

   -- Dalla 1.83 le nuove prove sono già composte alla creazione del corso.
   -- Questo fallback mantiene compatibili le assegnazioni legacy ancora prive di domande.
   if (select count(*) from public.exam_questions where assignment_id=ex.id)=0 then
     insert into public.exam_questions(assignment_id,position,question_id,option_order)
     with ranked as (
       select id,category,row_number() over(partition by category order by random()) as category_rank
       from public.question_bank
       where active=true and discipline=ex.discipline
     ), picked as (
       select id from ranked order by category_rank,random() limit ex.question_count
     ), shuffled as (
       select id,row_number() over(order by random())::integer as position from picked
     )
     select ex.id,s.position,s.id,
            array(select v::smallint from unnest(array[0,1,2,3]::smallint[]) as v order by random())::smallint[]
     from shuffled s;
   end if;

   if (select count(*) from public.exam_questions where assignment_id=ex.id) <> ex.question_count then
     raise exception 'Errore nella composizione della prova';
   end if;
 elsif ex.status<>'in_progress' then
   raise exception 'Esame non avviabile';
 end if;

 if now()>=ex.ends_at then
   perform public.finalize_exam(ex.id,true);
   raise exception 'Tempo scaduto';
 end if;

 return jsonb_build_object(
   'assignment_id',ex.id,
   'discipline',ex.discipline,
   'started_at',ex.started_at,
   'ends_at',ex.ends_at,
   'question_count',ex.question_count,
   'duration_minutes',ex.duration_minutes,
   'status',ex.status,
   'questions',(
     select jsonb_agg(jsonb_build_object(
       'position',eq.position,
       'question_id',qb.id,
       'code',qb.code,
       'category',qb.category,
       'question_text',qb.question_text,
       'options',jsonb_build_array(
         jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d) -> eq.option_order[1],
         jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d) -> eq.option_order[2],
         jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d) -> eq.option_order[3],
         jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d) -> eq.option_order[4]
       ),
       'selected_option',eq.selected_option,
       'is_correct',eq.is_correct
     ) order by eq.position)
     from public.exam_questions eq
     join public.question_bank qb on qb.id=eq.question_id
     where eq.assignment_id=ex.id
   )
 );
end $$;



grant execute on function public.start_assigned_exam(uuid) to authenticated;

-- Hardening 1.82: exam_questions contiene snapshot e soluzioni; mai SELECT diretto dal client.
drop policy if exists questions_read on public.exam_questions;
revoke select on table public.exam_questions from authenticated;
revoke select on table public.exam_questions from anon;

commit;

-- Fine baseline 1.84.


-- Release 1.85 Fase 3 - Audit trail immutabile
-- K9 Academy 1.85 - FASE 3: Audit trail esame immutabile

create table if not exists public.exam_audit_events (
  id bigint generated always as identity primary key,
  assignment_id uuid,
  session_id uuid,
  event_type text not null,
  event_label text not null,
  actor_id uuid,
  actor_role text,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  event_hash text not null
);
create index if not exists exam_audit_assignment_idx on public.exam_audit_events(assignment_id,created_at,id);
create index if not exists exam_audit_session_idx on public.exam_audit_events(session_id,created_at,id);

create or replace function public.audit_event_hash()
returns trigger language plpgsql set search_path=public,extensions as $$
begin
  new.created_at := coalesce(new.created_at,clock_timestamp());
  new.event_hash := encode(digest(
    coalesce(new.assignment_id::text,'')||'|'||coalesce(new.session_id::text,'')||'|'||
    new.event_type||'|'||coalesce(new.actor_id::text,'')||'|'||new.created_at::text||'|'||new.event_data::text,
    'sha256'),'hex');
  return new;
end$$;
drop trigger if exists trg_exam_audit_hash on public.exam_audit_events;
create trigger trg_exam_audit_hash before insert on public.exam_audit_events
for each row execute function public.audit_event_hash();

create or replace function public.block_exam_audit_mutation()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Registro audit immutabile: modifica/eliminazione non consentita'; end$$;
drop trigger if exists trg_exam_audit_immutable on public.exam_audit_events;
create trigger trg_exam_audit_immutable before update or delete on public.exam_audit_events
for each row execute function public.block_exam_audit_mutation();

create or replace function public.write_exam_audit(
 p_assignment_id uuid,p_session_id uuid,p_type text,p_label text,p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id=auth.uid();
  insert into public.exam_audit_events(assignment_id,session_id,event_type,event_label,actor_id,actor_role,event_data,event_hash)
  values(p_assignment_id,p_session_id,p_type,p_label,auth.uid(),v_role,coalesce(p_data,'{}'::jsonb),'pending');
end$$;

create or replace function public.audit_exam_assignment_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  perform public.write_exam_audit(new.id,null,'exam_assigned','Esame assegnato',jsonb_build_object('discipline',new.discipline,'question_count',new.question_count,'duration_minutes',new.duration_minutes,'pass_percentage',new.pass_percentage,'student_id',new.student_id));
 else
  if new.evaluator_id is distinct from old.evaluator_id then perform public.write_exam_audit(new.id,null,'evaluator_changed','Esaminatore aggiornato',jsonb_build_object('from',old.evaluator_id,'to',new.evaluator_id)); end if;
  if new.status is distinct from old.status then perform public.write_exam_audit(new.id,null,'status_changed','Stato esame aggiornato',jsonb_build_object('from',old.status,'to',new.status,'started_at',new.started_at,'submitted_at',new.submitted_at)); end if;
  if new.correct_answers is distinct from old.correct_answers or new.score_percentage is distinct from old.score_percentage or new.passed is distinct from old.passed then
   perform public.write_exam_audit(new.id,null,'theory_result','Risultato teorico consolidato',jsonb_build_object('correct_answers',new.correct_answers,'answered_questions',new.answered_questions,'score_percentage',new.score_percentage,'passed',new.passed));
  end if;
 end if; return new;
end$$;
drop trigger if exists trg_audit_exam_assignments on public.exam_assignments;
create trigger trg_audit_exam_assignments after insert or update on public.exam_assignments for each row execute function public.audit_exam_assignment_changes();

create or replace function public.audit_exam_question_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  perform public.write_exam_audit(new.assignment_id,null,'question_prepared','Domanda inserita nella prova',jsonb_build_object('position',new.position,'question_id',new.question_id));
 elsif new.selected_option is distinct from old.selected_option and new.selected_option is not null then
  perform public.write_exam_audit(new.assignment_id,null,'answer_recorded','Risposta registrata',jsonb_build_object('position',new.position,'question_id',new.question_id,'selected_option',new.selected_option,'is_correct',new.is_correct));
 end if; return new;
end$$;
drop trigger if exists trg_audit_exam_questions on public.exam_questions;
create trigger trg_audit_exam_questions after insert or update on public.exam_questions for each row execute function public.audit_exam_question_changes();

create or replace function public.audit_correction_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  perform public.write_exam_audit(new.assignment_id,null,'retry_recorded','Ripetizione/correzione registrata',jsonb_build_object('position',new.position,'question_id',new.question_id,'original_option',new.original_option,'intended_option',new.intended_option,'status',new.status));
 elsif new.status is distinct from old.status then
  perform public.write_exam_audit(new.assignment_id,null,'retry_reviewed','Correzione revisionata',jsonb_build_object('position',new.position,'from',old.status,'to',new.status,'reviewed_by',new.reviewed_by));
 end if; return new;
end$$;
drop trigger if exists trg_audit_corrections on public.answer_correction_reports;
create trigger trg_audit_corrections after insert or update on public.answer_correction_reports for each row execute function public.audit_correction_changes();

create or replace function public.audit_practical_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.write_exam_audit(new.assignment_id,null,case when tg_op='INSERT' then 'practice_saved' else 'practice_updated' end,
   case when tg_op='INSERT' then 'Valutazione pratica registrata' else 'Valutazione pratica aggiornata' end,
   jsonb_build_object('practical_score',new.practical_score,'professional_score',new.professional_score,'outcome',new.outcome,'components',new.components,'completed_at',new.completed_at));
 return new;
end$$;
drop trigger if exists trg_audit_practical on public.practical_evaluations;
create trigger trg_audit_practical after insert or update on public.practical_evaluations for each row execute function public.audit_practical_changes();

create or replace function public.audit_document_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.write_exam_audit(new.assignment_id,null,case when tg_op='INSERT' then 'document_created' else 'document_regenerated' end,
   case when tg_op='INSERT' then 'Documento generato' else 'Documento rigenerato' end,
   jsonb_build_object('document_type',new.document_type,'document_code',new.document_code,'generation_count',new.generation_count,'status',new.status));
 return new;
end$$;
drop trigger if exists trg_audit_documents on public.exam_documents;
create trigger trg_audit_documents after insert or update on public.exam_documents for each row execute function public.audit_document_changes();

create or replace function public.audit_session_insert()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.write_exam_audit(null,new.id,'course_created','Corso preparato',jsonb_build_object('title',new.title,'common_username',new.common_username,'discipline',new.discipline,'question_count',new.question_count,'duration_minutes',new.duration_minutes,'pass_percentage',new.pass_percentage)); return new;
end$$;
drop trigger if exists trg_audit_sessions on public.exam_sessions;
create trigger trg_audit_sessions after insert on public.exam_sessions for each row execute function public.audit_session_insert();

alter table public.exam_audit_events enable row level security;
drop policy if exists audit_staff_read on public.exam_audit_events;
create policy audit_staff_read on public.exam_audit_events for select to authenticated
using(public.current_role() in('teacher','examiner','vice_admin','super_admin'));
revoke all on public.exam_audit_events from anon,authenticated;
grant select on public.exam_audit_events to authenticated;
revoke all on function public.write_exam_audit(uuid,uuid,text,text,jsonb) from public,anon,authenticated;

create or replace function public.get_exam_audit_timeline(p_assignment_id uuid)
returns table(id bigint,event_type text,event_label text,actor_id uuid,actor_name text,actor_role text,event_data jsonb,created_at timestamptz,event_hash text)
language plpgsql security definer set search_path=public as $$
begin
 if public.current_role() not in('teacher','examiner','vice_admin','super_admin') then raise exception 'Non autorizzato'; end if;
 if not exists(select 1 from public.exam_assignments ea where ea.id=p_assignment_id) then raise exception 'Esame non disponibile'; end if;
 return query select a.id,a.event_type,a.event_label,a.actor_id,p.full_name,a.actor_role,a.event_data,a.created_at,a.event_hash
 from public.exam_audit_events a left join public.profiles p on p.id=a.actor_id
 where a.assignment_id=p_assignment_id order by a.created_at,a.id;
end$$;
revoke all on function public.get_exam_audit_timeline(uuid) from public,anon;
grant execute on function public.get_exam_audit_timeline(uuid) to authenticated;

-- Snapshot iniziale degli esami già presenti: non ricostruisce retroattivamente eventi mai registrati,
-- ma fissa uno stato di partenza verificabile dal momento dell'installazione 1.85.
insert into public.exam_audit_events(assignment_id,event_type,event_label,actor_role,event_data,event_hash)
select e.id,'audit_baseline','Stato iniziale acquisito alla attivazione audit','system',
 jsonb_build_object('status',e.status,'discipline',e.discipline,'question_count',e.question_count,'started_at',e.started_at,'submitted_at',e.submitted_at,'correct_answers',e.correct_answers,'answered_questions',e.answered_questions,'score_percentage',e.score_percentage,'passed',e.passed),
 'pending'
from public.exam_assignments e
where not exists(select 1 from public.exam_audit_events a where a.assignment_id=e.id);



-- ================================================================
-- RELEASE 1.86 — FASE 4: FASCICOLO FINALE E TRACCIABILITA PDF
-- ================================================================

-- K9 Academy — Release 1.86 — Fase 4
-- Fascicolo finale esame + tracciabilità immutabile dei PDF prodotti.
-- Eseguire UNA volta su Supabase SQL Editor prima di caricare index.html 1.86.

begin;

create table if not exists public.exam_document_generations (
  id bigint generated always as identity primary key,
  exam_document_id uuid not null references public.exam_documents(id) on delete restrict,
  assignment_id uuid not null references public.exam_assignments(id) on delete restrict,
  document_type text not null check (document_type in ('report','certificate','candidate_report')),
  document_code text not null,
  generation_number integer not null check (generation_number > 0),
  file_name text not null,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_size_bytes bigint not null check (file_size_bytes > 0),
  generated_at timestamptz not null default clock_timestamp(),
  generated_by uuid references public.profiles(id),
  metadata jsonb not null default '{}'::jsonb,
  record_hash text not null,
  unique(exam_document_id,generation_number)
);

create index if not exists exam_document_generations_assignment_idx
  on public.exam_document_generations(assignment_id,generated_at,id);
create index if not exists exam_document_generations_document_idx
  on public.exam_document_generations(exam_document_id,generation_number);

create or replace function public.exam_document_generation_hash()
returns trigger
language plpgsql
set search_path=public,extensions
as $$
begin
  new.generated_at:=coalesce(new.generated_at,clock_timestamp());
  new.file_sha256:=lower(trim(new.file_sha256));
  new.record_hash:=encode(digest(
    new.exam_document_id::text||'|'||
    new.assignment_id::text||'|'||
    new.document_type||'|'||
    new.document_code||'|'||
    new.generation_number::text||'|'||
    new.file_name||'|'||
    new.file_sha256||'|'||
    new.file_size_bytes::text||'|'||
    new.generated_at::text||'|'||
    coalesce(new.generated_by::text,'')||'|'||
    new.metadata::text,
    'sha256'
  ),'hex');
  return new;
end;
$$;

drop trigger if exists trg_exam_document_generation_hash on public.exam_document_generations;
create trigger trg_exam_document_generation_hash
before insert on public.exam_document_generations
for each row execute function public.exam_document_generation_hash();

create or replace function public.block_exam_document_generation_mutation()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  raise exception 'Cronologia PDF immutabile: modifica/eliminazione non consentita';
end;
$$;

drop trigger if exists trg_exam_document_generation_immutable on public.exam_document_generations;
create trigger trg_exam_document_generation_immutable
before update or delete on public.exam_document_generations
for each row execute function public.block_exam_document_generation_mutation();

alter table public.exam_document_generations enable row level security;
revoke all on public.exam_document_generations from anon,authenticated;

create or replace function public.register_exam_document_traced(
  p_assignment_id uuid,
  p_document_type text,
  p_document_code text,
  p_metadata jsonb,
  p_file_name text,
  p_file_sha256 text,
  p_file_size_bytes bigint
)
returns public.exam_documents
language plpgsql
security definer
set search_path=public
as $$
declare
  v_document public.exam_documents%rowtype;
  v_sha text:=lower(trim(coalesce(p_file_sha256,'')));
  v_file text:=trim(coalesce(p_file_name,''));
  v_size bigint:=coalesce(p_file_size_bytes,0);
begin
  if v_file='' then raise exception 'Nome file PDF non valido'; end if;
  if v_sha !~ '^[0-9a-f]{64}$' then raise exception 'Impronta SHA-256 PDF non valida'; end if;
  if v_size<=0 then raise exception 'Dimensione PDF non valida'; end if;

  select * into v_document
  from public.register_exam_document(
    p_assignment_id,
    p_document_type,
    p_document_code,
    coalesce(p_metadata,'{}'::jsonb)
  );

  insert into public.exam_document_generations(
    exam_document_id,assignment_id,document_type,document_code,generation_number,
    file_name,file_sha256,file_size_bytes,generated_by,metadata,record_hash
  )
  values(
    v_document.id,v_document.assignment_id,v_document.document_type,v_document.document_code,
    v_document.generation_count,v_file,v_sha,v_size,auth.uid(),
    coalesce(p_metadata,'{}'::jsonb),'pending'
  );

  perform public.write_exam_audit(
    v_document.assignment_id,null,'pdf_traced','PDF registrato nel fascicolo',
    jsonb_build_object(
      'document_type',v_document.document_type,
      'document_code',v_document.document_code,
      'generation_count',v_document.generation_count,
      'file_name',v_file,
      'file_size_bytes',v_size,
      'file_sha256',v_sha
    )
  );

  return v_document;
end;
$$;

revoke all on function public.register_exam_document_traced(uuid,text,text,jsonb,text,text,bigint)
  from public,anon;
grant execute on function public.register_exam_document_traced(uuid,text,text,jsonb,text,text,bigint)
  to authenticated;

create or replace function public.list_exam_documents_v2()
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
  status text,
  latest_file_name text,
  latest_file_sha256 text,
  latest_file_size_bytes bigint,
  latest_generated_at timestamptz,
  generation_history jsonb
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if public.current_role()<>'super_admin'
     and not public.has_role_permission('document_archive') then
    raise exception 'Archivio documenti non abilitato';
  end if;

  return query
  select
    d.id,d.assignment_id,d.document_type,d.document_code,d.document_group_code,
    d.student_id,d.student_name,d.discipline,d.organization_name,d.final_status,
    d.issued_at,d.last_generated_at,d.generation_count,d.status,
    lg.file_name,lg.file_sha256,lg.file_size_bytes,lg.generated_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'generation_number',g.generation_number,
          'file_name',g.file_name,
          'file_sha256',g.file_sha256,
          'file_size_bytes',g.file_size_bytes,
          'generated_at',g.generated_at,
          'generated_by',g.generated_by
        )
        order by g.generation_number desc
      )
      from public.exam_document_generations g
      where g.exam_document_id=d.id
    ),'[]'::jsonb)
  from public.exam_documents d
  left join lateral (
    select g.file_name,g.file_sha256,g.file_size_bytes,g.generated_at
    from public.exam_document_generations g
    where g.exam_document_id=d.id
    order by g.generation_number desc
    limit 1
  ) lg on true
  where public.current_role() in('super_admin','vice_admin')
     or d.student_id=auth.uid()
     or d.issued_by=auth.uid()
  order by d.issued_at desc;
end;
$$;

revoke all on function public.list_exam_documents_v2() from public,anon;
grant execute on function public.list_exam_documents_v2() to authenticated;

commit;

select
  to_regclass('public.exam_document_generations') is not null as pdf_history_table_ok,
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='register_exam_document_traced'
  ) as register_traced_rpc_ok,
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='list_exam_documents_v2'
  ) as document_archive_v2_rpc_ok,
  exists(
    select 1 from pg_trigger
    where tgname='trg_exam_document_generation_immutable' and not tgisinternal
  ) as immutable_pdf_history_ok;
-- K9 Academy — Release 1.88 — Fase 6
-- Hardening finale dei privilegi RPC SECURITY DEFINER.
-- Non modifica dati di corsisti, corsi, esami, valutazioni o documenti.
begin;

-- Rimuove l'esecuzione implicita PUBLIC/anon dalle RPC richiamabili dall'app.
revoke all on function public.assign_exam(uuid,text,integer,integer,integer,text) from public,anon;
revoke all on function public.get_my_assigned_exam() from public,anon;
revoke all on function public.start_assigned_exam(uuid) from public,anon;
revoke all on function public.answer_exam_question(uuid,integer,integer) from public,anon;
revoke all on function public.finalize_exam(uuid,boolean) from public,anon;
revoke all on function public.set_exam_evaluator(uuid,uuid) from public,anon;
revoke all on function public.retry_exam_question(uuid,integer,integer) from public,anon;
revoke all on function public.register_exam_document(uuid,text,text,jsonb) from public,anon;
revoke all on function public.register_exam_document_traced(uuid,text,text,jsonb,text,text,bigint) from public,anon;
revoke all on function public.verify_exam_document(text) from public,anon;
revoke all on function public.list_exam_documents() from public,anon;
revoke all on function public.list_exam_documents_v2() from public,anon;
revoke all on function public.get_exam_candidate_report(uuid) from public,anon;
revoke all on function public.get_exam_audit_timeline(uuid) from public,anon;
revoke all on function public.get_my_role_permissions() from public,anon;
revoke all on function public.get_all_role_permissions() from public,anon;
revoke all on function public.set_role_permissions(text,jsonb) from public,anon;
revoke all on function public.get_role_dashboard() from public,anon;
revoke all on function public.set_profile_photo_path(uuid,text) from public,anon;

-- L'app autenticata conserva esclusivamente le RPC necessarie.
grant execute on function public.assign_exam(uuid,text,integer,integer,integer,text) to authenticated;
grant execute on function public.get_my_assigned_exam() to authenticated;
grant execute on function public.start_assigned_exam(uuid) to authenticated;
grant execute on function public.answer_exam_question(uuid,integer,integer) to authenticated;
grant execute on function public.finalize_exam(uuid,boolean) to authenticated;
grant execute on function public.set_exam_evaluator(uuid,uuid) to authenticated;
grant execute on function public.retry_exam_question(uuid,integer,integer) to authenticated;
grant execute on function public.register_exam_document(uuid,text,text,jsonb) to authenticated;
grant execute on function public.register_exam_document_traced(uuid,text,text,jsonb,text,text,bigint) to authenticated;
grant execute on function public.verify_exam_document(text) to authenticated;
grant execute on function public.list_exam_documents() to authenticated;
grant execute on function public.list_exam_documents_v2() to authenticated;
grant execute on function public.get_exam_candidate_report(uuid) to authenticated;
grant execute on function public.get_exam_audit_timeline(uuid) to authenticated;
grant execute on function public.get_my_role_permissions() to authenticated;
grant execute on function public.get_all_role_permissions() to authenticated;
grant execute on function public.set_role_permissions(text,jsonb) to authenticated;
grant execute on function public.get_role_dashboard() to authenticated;
grant execute on function public.set_profile_photo_path(uuid,text) to authenticated;

-- La composizione preventiva delle domande resta esclusiva del backend service_role.
revoke all on function public.prepare_exam_questions(uuid) from public,anon,authenticated;
grant execute on function public.prepare_exam_questions(uuid) to service_role;

-- Le funzioni interne/trigger SECURITY DEFINER non devono essere invocabili da client.
revoke all on function public.write_exam_audit(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.audit_event_hash() from public,anon,authenticated;
revoke all on function public.block_exam_audit_mutation() from public,anon,authenticated;
revoke all on function public.audit_exam_assignment_changes() from public,anon,authenticated;
revoke all on function public.audit_exam_question_changes() from public,anon,authenticated;
revoke all on function public.audit_correction_changes() from public,anon,authenticated;
revoke all on function public.audit_practical_changes() from public,anon,authenticated;
revoke all on function public.audit_document_changes() from public,anon,authenticated;
revoke all on function public.audit_session_insert() from public,anon,authenticated;
revoke all on function public.exam_document_generation_hash() from public,anon,authenticated;
revoke all on function public.block_exam_document_generation_mutation() from public,anon,authenticated;

commit;

select
  not has_function_privilege('anon','public.start_assigned_exam(uuid)','EXECUTE') as anon_start_exam_blocked,
  not has_function_privilege('anon','public.answer_exam_question(uuid,integer,integer)','EXECUTE') as anon_answer_blocked,
  has_function_privilege('authenticated','public.start_assigned_exam(uuid)','EXECUTE') as auth_start_exam_ok,
  has_function_privilege('authenticated','public.answer_exam_question(uuid,integer,integer)','EXECUTE') as auth_answer_ok,
  not has_function_privilege('authenticated','public.prepare_exam_questions(uuid)','EXECUTE') as client_prepare_blocked,
  has_function_privilege('service_role','public.prepare_exam_questions(uuid)','EXECUTE') as service_prepare_ok,
  not has_function_privilege('authenticated','public.write_exam_audit(uuid,uuid,text,text,jsonb)','EXECUTE') as audit_writer_internal_only,
  not has_function_privilege('authenticated','public.block_exam_document_generation_mutation()','EXECUTE') as pdf_guard_internal_only;
