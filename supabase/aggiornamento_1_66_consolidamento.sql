-- K9 ACADEMY ESAMI — RELEASE 1.66 CONSOLIDAMENTO E HARDENING
-- Eseguire UNA SOLA VOLTA nel SQL Editor di Supabase.
-- Compatibile con database già aggiornati: usa IF NOT EXISTS / CREATE OR REPLACE.

begin;

-- 1) Consolida nel modello corrente le colonne usate dall'accesso Corsista.
alter table public.session_candidates
  add column if not exists login_email text,
  add column if not exists credential_hash text;

create unique index if not exists session_candidates_login_email_unique
  on public.session_candidates(login_email)
  where login_email is not null;

create unique index if not exists session_candidates_credential_hash_unique
  on public.session_candidates(credential_hash)
  where credential_hash is not null;

comment on column public.session_candidates.login_email is
  'Email tecnica stabile usata internamente per Supabase Auth; non mostrata al Corsista.';
comment on column public.session_candidates.credential_hash is
  'Hash credenziale usato dalla Edge Function per risolvere l’account Corsista.';

-- 2) Registro documenti: tre tipi ufficiali.
alter table public.exam_documents drop constraint if exists exam_documents_document_type_check;
alter table public.exam_documents
  add constraint exam_documents_document_type_check
  check(document_type in('report','certificate','candidate_report'));

-- 3) Report analitico: SOLO staff autorizzato.
-- Il Corsista non deve mai poter ottenere soluzioni/spiegazioni via RPC.
create or replace function public.get_exam_candidate_report(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ex public.exam_assignments%rowtype;
  v_role text:=public.current_role();
  v_student_name text;
  v_assigned_by_name text;
  v_evaluator_name text;
  pe public.practical_evaluations%rowtype;
begin
  select * into ex from public.exam_assignments where id=p_assignment_id;
  if not found then raise exception 'Esame non trovato'; end if;

  if v_role<>'super_admin' then
    if not public.has_role_permission('generate_report') then
      raise exception 'Generazione report completo non abilitata';
    end if;
    if v_role<>'vice_admin'
       and ex.assigned_by<>auth.uid()
       and coalesce(ex.evaluator_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid() then
      raise exception 'Esame non accessibile';
    end if;
  end if;

  -- Il report analitico è documentazione post-prova.
  if ex.status not in('submitted','expired') then
    raise exception 'Report completo disponibile solo dopo la conclusione della prova teorica';
  end if;

  select full_name into v_student_name from public.profiles where id=ex.student_id;
  select full_name into v_assigned_by_name from public.profiles where id=ex.assigned_by;
  if ex.evaluator_id is not null then
    select full_name into v_evaluator_name from public.profiles where id=ex.evaluator_id;
  end if;
  select * into pe from public.practical_evaluations where assignment_id=ex.id;

  return jsonb_build_object(
    'assignment_id',ex.id,
    'student_id',ex.student_id,
    'student_name',v_student_name,
    'discipline',ex.discipline,
    'assigned_by_name',v_assigned_by_name,
    'evaluator_name',v_evaluator_name,
    'assignment_notes',ex.notes,
    'assigned_at',ex.assigned_at,
    'started_at',ex.started_at,
    'submitted_at',ex.submitted_at,
    'ends_at',ex.ends_at,
    'status',ex.status,
    'question_count',ex.question_count,
    'answered_questions',ex.answered_questions,
    'correct_answers',ex.correct_answers,
    'score_percentage',ex.score_percentage,
    'pass_percentage',ex.pass_percentage,
    'passed',ex.passed,
    'practical_criteria',coalesce(pe.criteria,'[]'::jsonb),
    'professional_criteria',coalesce(pe.professional_criteria,'[]'::jsonb),
    'practical_score',pe.practical_score,
    'professional_score',pe.professional_score,
    'practical_outcome',pe.outcome,
    'practical_components',coalesce(pe.components,'[]'::jsonb),
    'practical_notes',pe.notes,
    'practical_completed_at',pe.completed_at,
    'questions',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position',eq.position,
          'code',coalesce(eq.question_snapshot->>'code',qb.code),
          'category',coalesce(eq.question_snapshot->>'category',qb.category),
          'difficulty',coalesce(eq.question_snapshot->>'difficulty',qb.difficulty),
          'question_text',coalesce(eq.question_snapshot->>'question_text',qb.question_text),
          'options',jsonb_build_array(
            coalesce(eq.question_snapshot->'options',jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d))->eq.option_order[1],
            coalesce(eq.question_snapshot->'options',jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d))->eq.option_order[2],
            coalesce(eq.question_snapshot->'options',jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d))->eq.option_order[3],
            coalesce(eq.question_snapshot->'options',jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d))->eq.option_order[4]
          ),
          'selected_option',eq.selected_option,
          'correct_option',
            array_position(
              eq.option_order,
              coalesce((eq.question_snapshot->>'correct_option')::smallint,qb.correct_option)
            )-1,
          'is_correct',eq.is_correct,
          'answered_at',eq.answered_at,
          'explanation',coalesce(eq.question_snapshot->>'explanation',qb.explanation)
        ) order by eq.position
      )
      from public.exam_questions eq
      left join public.question_bank qb on qb.id=eq.question_id
      where eq.assignment_id=ex.id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_exam_candidate_report(uuid) from public,anon;
grant execute on function public.get_exam_candidate_report(uuid) to authenticated;

-- 4) Registrazione documenti: ripristina permessi e relazione staff/esame.
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

  if p_document_type not in('report','certificate','candidate_report') then
    raise exception 'Tipo documento non valido';
  end if;

  required_permission:=case
    when p_document_type='certificate' then 'generate_certificate'
    else 'generate_report'
  end;

  if v_role<>'super_admin' and not public.has_role_permission(required_permission) then
    raise exception 'Generazione documento non abilitata';
  end if;

  if v_role<>'super_admin'
     and v_role<>'vice_admin'
     and v_assignment.assigned_by<>auth.uid()
     and coalesce(v_assignment.evaluator_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid() then
    raise exception 'Esame non accessibile';
  end if;

  if p_document_type='candidate_report' and v_assignment.status not in('submitted','expired') then
    raise exception 'Report completo disponibile solo dopo la conclusione della prova teorica';
  end if;

  v_code:=upper(trim(regexp_replace(p_document_code,'^N\.?\s*','','i')));
  v_group:=regexp_replace(v_code,'^(ATT|VER|RPT)-','');
  if v_group is null or trim(v_group)='' then raise exception 'Codice documento non valido'; end if;

  select full_name into v_student_name from public.profiles where id=v_assignment.student_id;
  v_org:=nullif(p_metadata->>'organization_name','');
  v_final:=nullif(p_metadata->>'final_status','');

  insert into public.exam_documents(
    assignment_id,document_type,document_code,document_group_code,
    student_id,student_name,discipline,organization_name,final_status,metadata,issued_by
  ) values(
    v_assignment.id,p_document_type,v_code,v_group,
    v_assignment.student_id,v_student_name,v_assignment.discipline,
    v_org,v_final,coalesce(p_metadata,'{}'::jsonb),auth.uid()
  )
  on conflict(assignment_id,document_type)
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

revoke all on function public.register_exam_document(uuid,text,text,jsonb) from public,anon;
grant execute on function public.register_exam_document(uuid,text,text,jsonb) to authenticated;

-- 5) Finalizzazione esame: Corsista può consegnare SOLO il proprio esame;
-- staff deve avere exam_management ed essere collegato alla prova (vice può operare globalmente).
create or replace function public.finalize_exam(p_assignment_id uuid,p_expired boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ex public.exam_assignments%rowtype;
  c integer;
  a integer;
  pct numeric(5,2);
  v_role text:=public.current_role();
begin
  select * into ex from public.exam_assignments where id=p_assignment_id for update;
  if not found then raise exception 'Esame non disponibile'; end if;

  if ex.student_id<>auth.uid() then
    if v_role<>'super_admin' then
      if not public.has_role_permission('exam_management') then
        raise exception 'Gestione esame non abilitata';
      end if;
      if v_role<>'vice_admin'
         and ex.assigned_by<>auth.uid()
         and coalesce(ex.evaluator_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid() then
        raise exception 'Esame non accessibile';
      end if;
    end if;
  end if;

  if ex.status<>'in_progress' then
    return jsonb_build_object('status',ex.status,'score_percentage',ex.score_percentage,'passed',ex.passed);
  end if;

  select count(*) filter(where is_correct=true),count(*) filter(where selected_option is not null)
  into c,a from public.exam_questions where assignment_id=p_assignment_id;

  pct:=round(c::numeric/greatest(ex.question_count,1)*100,2);

  update public.exam_assignments
  set status=case when p_expired or now()>=ends_at then 'expired' else 'submitted' end,
      submitted_at=now(),correct_answers=c,answered_questions=a,
      score_percentage=pct,passed=(pct>=pass_percentage)
  where id=p_assignment_id
  returning * into ex;

  return jsonb_build_object(
    'status',ex.status,'discipline',ex.discipline,'correct_answers',c,
    'answered_questions',a,'question_count',ex.question_count,
    'score_percentage',pct,'passed',ex.passed
  );
end;
$$;

revoke all on function public.finalize_exam(uuid,boolean) from public,anon;
grant execute on function public.finalize_exam(uuid,boolean) to authenticated;

-- 6) Verifica documenti: niente sibling ambiguo con tre documenti.
-- Per compatibilità con il frontend mantiene un singolo associated_document_code,
-- scegliendo in modo deterministico ATT <-> VER e RPT -> VER.
create or replace function public.verify_exam_document(p_document_code text)
returns table (
  document_code text,document_type text,document_group_code text,associated_document_code text,
  associated_document_registered boolean,student_name text,discipline text,organization_name text,
  final_status text,issued_at timestamptz,last_generated_at timestamptz,generation_count integer,status text
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if public.current_role()<>'super_admin' and not public.has_role_permission('verify_documents') then
    raise exception 'Verifica documenti non abilitata';
  end if;

  return query
  with requested as (
    select upper(trim(regexp_replace(p_document_code,'^N\.?\s*','','i'))) as code
  )
  select
    d.document_code,d.document_type,d.document_group_code,
    coalesce(
      sibling.document_code,
      case
        when d.document_type='certificate' then 'VER-'||d.document_group_code
        when d.document_type='report' then 'ATT-'||d.document_group_code
        else 'VER-'||d.document_group_code
      end
    ),
    sibling.id is not null,
    d.student_name,d.discipline,d.organization_name,d.final_status,
    d.issued_at,d.last_generated_at,d.generation_count,d.status
  from public.exam_documents d
  cross join requested r
  left join lateral (
    select s.id,s.document_code
    from public.exam_documents s
    where s.assignment_id=d.assignment_id
      and s.document_type=case
        when d.document_type='certificate' then 'report'
        when d.document_type='report' then 'certificate'
        else 'report'
      end
    order by s.issued_at desc
    limit 1
  ) sibling on true
  where d.document_code=r.code
    and (
      public.current_role()='super_admin'
      or public.current_role()='vice_admin'
      or d.issued_by=auth.uid()
      or d.student_id=auth.uid()
    )
  limit 1;
end;
$$;

revoke all on function public.verify_exam_document(text) from public,anon;
grant execute on function public.verify_exam_document(text) to authenticated;

commit;

-- Verifiche finali: devono risultare true / valori coerenti.
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='session_candidates' and column_name='login_email') as login_email_ok,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='session_candidates' and column_name='credential_hash') as credential_hash_ok,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_exam_candidate_report') as report_rpc_ok,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='register_exam_document') as register_document_rpc_ok,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='finalize_exam') as finalize_exam_rpc_ok;
