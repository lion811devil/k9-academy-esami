-- K9 Academy Esami — Release 1.63
-- Report completo Corsista / Esame
-- Conserva uno snapshot storico delle domande realmente somministrate.
begin;

alter table public.exam_questions
  add column if not exists question_snapshot jsonb;

update public.exam_questions eq
set question_snapshot=jsonb_build_object(
  'code',qb.code,
  'category',qb.category,
  'difficulty',qb.difficulty,
  'question_text',qb.question_text,
  'options',jsonb_build_array(qb.option_a,qb.option_b,qb.option_c,qb.option_d),
  'correct_option',qb.correct_option,
  'explanation',qb.explanation
)
from public.question_bank qb
where qb.id=eq.question_id
  and eq.question_snapshot is null;

create or replace function public.capture_exam_question_snapshot()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.question_snapshot is null then
    select jsonb_build_object(
      'code',q.code,
      'category',q.category,
      'difficulty',q.difficulty,
      'question_text',q.question_text,
      'options',jsonb_build_array(q.option_a,q.option_b,q.option_c,q.option_d),
      'correct_option',q.correct_option,
      'explanation',q.explanation
    )
    into new.question_snapshot
    from public.question_bank q
    where q.id=new.question_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_exam_question_snapshot on public.exam_questions;
create trigger trg_exam_question_snapshot
before insert or update of question_id on public.exam_questions
for each row execute function public.capture_exam_question_snapshot();

alter table public.exam_documents drop constraint if exists exam_documents_document_type_check;
alter table public.exam_documents
  add constraint exam_documents_document_type_check
  check(document_type in('report','certificate','candidate_report'));

drop index if exists exam_documents_assignment_type_uidx;
create unique index exam_documents_assignment_type_uidx
  on public.exam_documents(assignment_id,document_type);

create or replace function public.get_exam_candidate_report(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  ex public.exam_assignments%rowtype;
  v_role text;
  v_student_name text;
  v_assigned_by_name text;
  v_evaluator_name text;
  pe public.practical_evaluations%rowtype;
begin
  select * into ex from public.exam_assignments where id=p_assignment_id;
  if not found then raise exception 'Esame non trovato'; end if;

  select role into v_role from public.profiles where id=auth.uid();
  if auth.uid()<>ex.student_id and coalesce(v_role,'') not in('super_admin','vice_admin','teacher','examiner') then
    raise exception 'Permesso negato';
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
        )
        order by eq.position
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

-- Aggiorna la registrazione documenti per accettare anche il report analitico.
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
  select * into v_assignment from public.exam_assignments where id=p_assignment_id;
  if not found then raise exception 'Esame non trovato'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  if auth.uid()<>v_assignment.student_id
     and coalesce(v_role,'') not in('super_admin','vice_admin','teacher','examiner') then
    raise exception 'Permesso negato';
  end if;
  if p_document_type not in('report','certificate','candidate_report') then
    raise exception 'Tipo documento non valido';
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

commit;

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='exam_questions' and column_name='question_snapshot'
  ) as question_snapshot_ok,
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_exam_candidate_report'
  ) as candidate_report_rpc_ok,
  exists(
    select 1 from pg_constraint
    where conname='exam_documents_document_type_check'
  ) as document_type_ok;
