-- K9 Academy Esami - Correzione sicurezza esami / 2026-11-02
-- BASATO SULLE DEFINIZIONI RPC ESPORTATE DAL DATABASE (CSV fornite dall'utente).
-- Non cambia question_bank, i 1.702 quesiti Mantrailing, Dogsitter o le prove già composte.
-- Eseguire una sola volta nel SQL Editor di Supabase dopo un backup.
-- Tutte le funzioni sono sostituite nella stessa transazione.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.exam_assignments') IS NULL
     OR to_regclass('public.exam_questions') IS NULL
     OR to_regclass('public.question_bank') IS NULL
  THEN
    RAISE EXCEPTION 'Schema K9 Academy non compatibile: tabella richiesta assente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='prepare_exam_questions') THEN
    RAISE EXCEPTION 'Funzione preparazione esame non presente';
  END IF;
END $guard$;

-- finalize_exam
CREATE OR REPLACE FUNCTION public.finalize_exam(p_assignment_id uuid, p_expired boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    return jsonb_build_object(
      'status',ex.status,'discipline',ex.discipline,
      'correct_answers',ex.correct_answers,
      'answered_questions',ex.answered_questions,
      'question_count',ex.question_count,
      'score_percentage',ex.score_percentage,'passed',ex.passed
    );
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
$function$;

-- get_exam_candidate_report
CREATE OR REPLACE FUNCTION public.get_exam_candidate_report(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ex public.exam_assignments%rowtype;
  v_role text;
  v_student_name text;
  v_student_fiscal_code text;
  v_student_birth_date date;
  v_student_birth_place text;
  v_assigned_by_name text;
  v_evaluator_name text;
  pe public.practical_evaluations%rowtype;
  v_retry_used integer:=0;
  v_initial_errors integer:=0;
begin
  select * into ex from public.exam_assignments where id=p_assignment_id;
  if not found then raise exception 'Esame non trovato'; end if;

  -- Non divulgare mai soluzioni e spiegazioni prima della chiusura.
  -- La verifica avviene lato database, indipendentemente dall'interfaccia.
  if ex.status not in ('submitted','expired') then
    raise exception 'Report disponibile solo dopo la conclusione della prova';
  end if;

  select role into v_role from public.profiles where id=auth.uid() and archived_at is null;
  if auth.uid()=ex.student_id then
    null; -- Il corsista puo consultare il proprio report concluso.
  elsif v_role='super_admin' then
    null;
  elsif v_role in ('vice_admin','teacher','examiner')
        and (v_role='vice_admin' or ex.assigned_by=auth.uid() or ex.evaluator_id=auth.uid())
        and (
          public.has_role_permission('exam_management')
          or public.has_role_permission('exam_history')
          or public.has_role_permission('documents_view')
          or public.has_role_permission('analytics')
        ) then
    null;
  else
    raise exception 'Permesso negato';
  end if;

  select full_name,fiscal_code,birth_date,birth_place
    into v_student_name,v_student_fiscal_code,v_student_birth_date,v_student_birth_place
  from public.profiles where id=ex.student_id;
  select full_name into v_assigned_by_name from public.profiles where id=ex.assigned_by;
  if ex.evaluator_id is not null then
    select full_name into v_evaluator_name from public.profiles where id=ex.evaluator_id;
  end if;
  select * into pe from public.practical_evaluations where assignment_id=ex.id;

  select count(*) into v_retry_used
  from public.answer_correction_reports r
  where r.assignment_id=ex.id and r.status='accepted';

  -- Una domanda conta una sola volta come errore iniziale: se è rimasta errata oppure
  -- se esiste una ripetizione accettata che dimostra che il primo tentativo era errato.
  select count(*) into v_initial_errors
  from public.exam_questions eq
  where eq.assignment_id=ex.id
    and eq.selected_option is not null
    and (
      coalesce(eq.is_correct,false)=false
      or exists(
        select 1 from public.answer_correction_reports r
        where r.assignment_id=eq.assignment_id
          and r.position=eq.position
          and r.status='accepted'
      )
    );

  return jsonb_build_object(
    'assignment_id',ex.id,
    'student_id',ex.student_id,
    'student_name',v_student_name,
    'student_fiscal_code',v_student_fiscal_code,
    'student_birth_date',v_student_birth_date,
    'student_birth_place',v_student_birth_place,
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
    'initial_error_count',v_initial_errors,
    'retry_used',v_retry_used,
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
          'correct_option',array_position(eq.option_order,coalesce((eq.question_snapshot->>'correct_option')::smallint,qb.correct_option))-1,
          'is_correct',eq.is_correct,
          'answered_at',eq.answered_at,
          'explanation',coalesce(eq.question_snapshot->>'explanation',qb.explanation),
          'correction',(
            select jsonb_build_object(
              'original_option',r.original_option,
              'retry_option',r.intended_option,
              'status',r.status,
              'reported_at',r.reported_at,
              'reviewed_at',r.reviewed_at
            )
            from public.answer_correction_reports r
            where r.assignment_id=eq.assignment_id
              and r.position=eq.position
              and r.status='accepted'
            order by r.reported_at desc
            limit 1
          )
        ) order by eq.position
      )
      from public.exam_questions eq
      left join public.question_bank qb on qb.id=eq.question_id
      where eq.assignment_id=ex.id
    ),'[]'::jsonb)
  );
end;
$function$;

-- prepare_exam_questions
CREATE OR REPLACE FUNCTION public.prepare_exam_questions(p_assignment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select eq.question_id, count(*)::integer as uses,
           max(coalesce(a.submitted_at,a.started_at,a.assigned_at)) as last_used
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
    select qb.id, qb.category,
           coalesce(su.uses,0) as student_uses,
           coalesce(cu.uses,0) as course_uses,
           su.last_used,
           case when ex.discipline='mantrailing'
             then regexp_replace(lower(btrim(qb.question_text)), '[[:space:]]+', ' ', 'g')
             else qb.id::text end as stem_key,
           case when ex.discipline='mantrailing'
             then coalesce(qb.category,'') || ':' || md5(array_to_string(
               array(select regexp_replace(lower(btrim(o)), '[[:space:]]+', ' ', 'g')
                     from unnest(array[qb.option_a,qb.option_b,qb.option_c,qb.option_d]) as t(o)
                     order by 1), chr(31)))
             else qb.id::text end as choices_key
    from public.question_bank qb
    left join student_usage su on su.question_id=qb.id
    left join session_usage cu on cu.question_id=qb.id
    where qb.active=true and qb.discipline=ex.discipline
  ), unique_stem as (
    select c.*, row_number() over (
      partition by c.stem_key
      order by c.student_uses, c.course_uses, c.last_used nulls first, random()
    ) as stem_rank
    from candidates c
  ), unique_choices as (
    select c.*, row_number() over (
      partition by c.choices_key
      order by c.student_uses, c.course_uses, c.last_used nulls first, random()
    ) as choice_rank
    from unique_stem c where c.stem_rank=1
  ), ranked as (
    select c.*, row_number() over(partition by c.category order by random()) as category_rank
    from unique_choices c where c.choice_rank=1
  ), picked as (
    select id from ranked
    order by student_uses, course_uses, category_rank, last_used nulls first, random()
    limit ex.question_count
  ), shuffled as (
    select id,row_number() over(order by random())::integer as position from picked
  )
  select ex.id,s.position,s.id,
         array(select v::smallint from unnest(array[0,1,2,3]::smallint[]) as v order by random())::smallint[]
  from shuffled s;

  get diagnostics inserted_count = row_count;
  if inserted_count<>ex.question_count then
    raise exception 'Domande distinte insufficienti per comporre la prova (% su %)',inserted_count,ex.question_count;
  end if;
  return inserted_count;
end $function$;

-- start_assigned_exam
CREATE OR REPLACE FUNCTION public.start_assigned_exam(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   -- Anche per assegnazioni legacy, usa l'unico selettore anti-duplicati.
   if not exists (select 1 from public.exam_questions where assignment_id=ex.id) then
     perform public.prepare_exam_questions(ex.id);
   end if;
   update public.exam_assignments
   set status='in_progress',
       started_at=now(),
       ends_at=now()+make_interval(mins=>duration_minutes)
   where id=ex.id
   returning * into ex;

   if (select count(*) from public.question_bank where active and discipline=ex.discipline) < ex.question_count then
     raise exception 'Domande attive insufficienti per %', ex.discipline;
   end if;

   if (select count(*) from public.exam_questions where assignment_id=ex.id) <> ex.question_count then
     raise exception 'Errore nella composizione della prova';
   end if;
 elsif ex.status<>'in_progress' then
   raise exception 'Esame non avviabile';
 end if;

 if now()>=ex.ends_at then
   return public.finalize_exam(ex.id,true);
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
end $function$;

-- answer_exam_question
CREATE OR REPLACE FUNCTION public.answer_exam_question(p_assignment_id uuid, p_position integer, p_selected_option integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 ex public.exam_assignments%rowtype;
 eq public.exam_questions%rowtype;
 q public.question_bank%rowtype;
 original_selected smallint;
 ok boolean;
begin
 if p_selected_option not between 0 and 3 then raise exception 'Risposta non valida'; end if;
 select * into ex from public.exam_assignments where id=p_assignment_id for update;
 if not found or ex.student_id<>auth.uid() then raise exception 'Esame non disponibile'; end if;
 if ex.status<>'in_progress' then raise exception 'Esame chiuso'; end if;
 if now()>=ex.ends_at then return public.finalize_exam(ex.id,true); end if;
 select * into eq from public.exam_questions where assignment_id=p_assignment_id and position=p_position for update;
 if not found then raise exception 'Domanda non disponibile'; end if;
 if eq.selected_option is not null then raise exception 'Risposta già registrata'; end if;
 select * into q from public.question_bank where id=eq.question_id;
 original_selected:=eq.option_order[p_selected_option+1];
 ok:=(original_selected=q.correct_option);
 update public.exam_questions set selected_option=p_selected_option,is_correct=ok,answered_at=now()
 where assignment_id=p_assignment_id and position=p_position;
 update public.exam_assignments
 set answered_questions=(select count(*) from public.exam_questions where assignment_id=p_assignment_id and selected_option is not null),
     correct_answers=(select count(*) from public.exam_questions where assignment_id=p_assignment_id and is_correct=true)
 where id=p_assignment_id;
 -- Durante la prova restituiamo solo l'esito della scelta, mai soluzione o spiegazione.
 return jsonb_build_object('is_correct',ok);
end $function$;

-- retry_exam_question
CREATE OR REPLACE FUNCTION public.retry_exam_question(p_assignment_id uuid, p_position integer, p_selected_option integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 ex public.exam_assignments%rowtype;
 eq public.exam_questions%rowtype;
 q public.question_bank%rowtype;
 original_displayed smallint;
 original_selected smallint;
 retried_selected smallint;
 ok boolean;
 used_count integer;
begin
 if p_selected_option not between 0 and 3 then
   raise exception 'Risposta non valida';
 end if;

 select * into ex
 from public.exam_assignments
 where id=p_assignment_id
 for update;

 if not found or ex.student_id<>auth.uid() then
   raise exception 'Esame non disponibile';
 end if;
 if ex.status<>'in_progress' then
   raise exception 'Esame chiuso';
 end if;
 if now()>=ex.ends_at then
   return public.finalize_exam(ex.id,true);
 end if;

 select * into eq
 from public.exam_questions
 where assignment_id=p_assignment_id
   and position=p_position
 for update;

 if not found then
   raise exception 'Domanda non disponibile';
 end if;
 if eq.selected_option is null then
   raise exception 'Prima risposta non ancora registrata';
 end if;
 if coalesce(eq.is_correct,false)=true then
   raise exception 'La risposta è già corretta';
 end if;
 if p_selected_option=eq.selected_option then
   raise exception 'Seleziona una risposta diversa da quella errata già registrata';
 end if;

 if exists(
   select 1 from public.answer_correction_reports
   where assignment_id=p_assignment_id and position=p_position
 ) then
   raise exception 'Correzione già utilizzata per questa domanda';
 end if;

 select count(*) into used_count
 from public.answer_correction_reports
 where assignment_id=p_assignment_id
   and reported_by=auth.uid()
   and status='accepted';

 if used_count>=3 then
   raise exception 'Hai già utilizzato le 3 correzioni automatiche disponibili';
 end if;

 select * into q
 from public.question_bank
 where id=eq.question_id;

 original_displayed:=eq.selected_option;
 original_selected:=eq.option_order[eq.selected_option+1];
 retried_selected:=eq.option_order[p_selected_option+1];
 ok:=(retried_selected=q.correct_option);

 insert into public.answer_correction_reports(
   assignment_id,position,question_id,original_option,intended_option,
   status,reported_by,reported_at,reviewed_at
 ) values(
   p_assignment_id,p_position,eq.question_id,original_displayed,p_selected_option,
   'accepted',auth.uid(),now(),now()
 );

 update public.exam_questions
 set selected_option=p_selected_option,
     is_correct=ok,
     answered_at=now()
 where assignment_id=p_assignment_id
   and position=p_position;

 update public.exam_assignments
 set answered_questions=(
       select count(*) from public.exam_questions
       where assignment_id=p_assignment_id and selected_option is not null
     ),
     correct_answers=(
       select count(*) from public.exam_questions
       where assignment_id=p_assignment_id and is_correct=true
     )
 where id=p_assignment_id;

 used_count:=used_count+1;
 return jsonb_build_object(
   'is_correct',ok,
   'retry_used',used_count,
   'retry_remaining',greatest(0,3-used_count)
 );
end $function$;

-- La protezione di accesso si applica solo al codice corsista pubblico.
-- Il limite e per coppia username + indirizzo client; la tabella non contiene credenziali in chiaro.
CREATE TABLE IF NOT EXISTS public.k9_candidate_login_throttle (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.k9_candidate_login_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.k9_candidate_login_throttle FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.k9_candidate_login_throttle TO service_role;

CREATE OR REPLACE FUNCTION public.k9_candidate_login_gate(
  p_key_hash text, p_success boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $login$
DECLARE v public.k9_candidate_login_throttle%rowtype;
        v_attempts integer;
BEGIN
 IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'Chiave tentativi non valida';
 END IF;
 INSERT INTO public.k9_candidate_login_throttle(key_hash)
 VALUES(p_key_hash) ON CONFLICT (key_hash) DO NOTHING;
 SELECT * INTO v FROM public.k9_candidate_login_throttle WHERE key_hash=p_key_hash FOR UPDATE;
 IF p_success THEN
   UPDATE public.k9_candidate_login_throttle
   SET attempts=0, blocked_until=NULL, window_started_at=now(), updated_at=now()
   WHERE key_hash=p_key_hash;
   RETURN true;
 END IF;
 IF v.blocked_until IS NOT NULL AND v.blocked_until>now() THEN
   RETURN false;
 END IF;
 v_attempts:=case when v.window_started_at < now()-interval '15 minutes'
                    then 1 else v.attempts+1 end;
 UPDATE public.k9_candidate_login_throttle
 SET attempts=v_attempts,
     window_started_at=case when v.window_started_at<now()-interval '15 minutes'
                             then now() else v.window_started_at end,
     blocked_until=case when v_attempts>10 then now()+interval '15 minutes' else NULL end,
     updated_at=now()
 WHERE key_hash=p_key_hash;
 RETURN v_attempts<=10;
END $login$;
REVOKE ALL ON FUNCTION public.k9_candidate_login_gate(text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.k9_candidate_login_gate(text,boolean) TO service_role;

-- Conservare i permessi necessari alle RPC e negare la lettura diretta di soluzioni.
REVOKE ALL ON FUNCTION public.prepare_exam_questions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_exam_questions(uuid) TO service_role;
REVOKE SELECT ON TABLE public.exam_questions FROM PUBLIC, anon, authenticated;

COMMIT;

-- Verifica di SOLA LETTURA dopo Run (in nuova query):
-- SELECT discipline, count(*) as totale, count(*) FILTER (WHERE active) as attive
-- FROM public.question_bank GROUP BY discipline ORDER BY discipline;
