-- K9 Academy Esami 2.2.1 - aggiornamento incrementale, NON distruttivo.
-- Include limite famiglie Detection verificato sul CSV del 20/11/2026.
-- Requisito: aggiornamento 20261102 già applicato. Backup prima del RUN.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.prepare_exam_questions(uuid)') IS NULL OR to_regclass('public.exam_document_generations') IS NULL OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_questions' AND column_name='question_snapshot') THEN
 RAISE EXCEPTION 'Schema non compatibile: installare prima gli aggiornamenti precedenti'; END IF;
 IF EXISTS(SELECT 1 FROM public.exam_assignments WHERE status='in_progress') THEN RAISE EXCEPTION 'Terminare le prove in corso prima di aggiornare'; END IF;
END $$;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS concept_id text;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS source_reference text;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS k9_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'da_verificare' CHECK (validation_status IN ('da_verificare','bozza','approvata'));
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS variant_number integer CHECK(variant_number>0);
CREATE OR REPLACE FUNCTION public.k9_question_family(p_concept text,p_category text,p_a text,p_b text,p_c text,p_d text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN nullif(btrim(p_concept),'') IS NOT NULL THEN 'manual:'||lower(btrim(p_concept)) ELSE 'auto:'||md5(coalesce(lower(btrim(p_category)),'')||chr(31)||array_to_string(ARRAY(SELECT regexp_replace(lower(btrim(o)), '[[:space:]]+', ' ', 'g') FROM unnest(ARRAY[p_a,p_b,p_c,p_d]) t(o) ORDER BY 1),chr(31))) END
$$;
CREATE INDEX IF NOT EXISTS k9_bank_active_discipline_idx ON public.question_bank(discipline) WHERE active;
CREATE INDEX IF NOT EXISTS k9_bank_exam_difficulty_idx ON public.question_bank(discipline,difficulty) WHERE active;
CREATE INDEX IF NOT EXISTS k9_assignment_student_discipline_idx ON public.exam_assignments(student_id,discipline);
CREATE INDEX IF NOT EXISTS k9_assignment_session_idx ON public.exam_assignments(session_id);
-- Fisher-Yates: chiamata volatile eseguita per ciascuna riga.
CREATE OR REPLACE FUNCTION public.k9_shuffle_options() RETURNS smallint[] LANGUAGE plpgsql VOLATILE SET search_path=public AS $$
DECLARE a smallint[]:=ARRAY[0,1,2,3]::smallint[]; i integer; j integer; t smallint;
BEGIN FOR i IN REVERSE 4..2 LOOP j:=1+floor(random()*i)::integer; t:=a[i]; a[i]:=a[j]; a[j]:=t; END LOOP; RETURN a; END $$;
-- Solo aggiunta di metadati, nessun aggiornamento delle risposte esistenti.
CREATE OR REPLACE FUNCTION public.k9_validate_new_question() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NEW.discipline IS DISTINCT FROM OLD.discipline AND EXISTS(SELECT 1 FROM public.exam_questions WHERE question_id=OLD.id) THEN RAISE EXCEPTION 'Disciplina non modificabile per domanda già utilizzata'; END IF;
   IF ROW(NEW.question_text,NEW.category,NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d,NEW.correct_option,NEW.explanation) IS NOT DISTINCT FROM ROW(OLD.question_text,OLD.category,OLD.option_a,OLD.option_b,OLD.option_c,OLD.option_d,OLD.correct_option,OLD.explanation) THEN RETURN NEW; END IF;
 END IF;
 IF nullif(btrim(NEW.question_text),'') IS NULL OR nullif(btrim(NEW.category),'') IS NULL OR nullif(btrim(NEW.explanation),'') IS NULL THEN RAISE EXCEPTION 'Domanda, categoria e spiegazione obbligatorie'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY[NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d]) o WHERE nullif(btrim(o),'') IS NULL) OR (SELECT count(DISTINCT regexp_replace(lower(btrim(o)),'[[:space:]]+',' ','g')) FROM unnest(ARRAY[NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d]) o)<>4 THEN RAISE EXCEPTION 'Le quattro alternative devono essere distinte e non vuote'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS k9_validate_new_question ON public.question_bank;
CREATE TRIGGER k9_validate_new_question BEFORE INSERT OR UPDATE ON public.question_bank FOR EACH ROW EXECUTE FUNCTION public.k9_validate_new_question();
-- Completa snapshot eventualmente mancanti; non sovrascrive quelli esistenti.
UPDATE public.exam_questions eq SET question_snapshot=jsonb_build_object('code',q.code,'category',q.category,'difficulty',q.difficulty,'question_text',q.question_text,'options',jsonb_build_array(q.option_a,q.option_b,q.option_c,q.option_d),'correct_option',q.correct_option,'explanation',q.explanation) FROM public.question_bank q WHERE eq.question_id=q.id AND eq.question_snapshot IS NULL;
ALTER TABLE public.exam_questions ALTER COLUMN question_snapshot SET NOT NULL;
CREATE OR REPLACE FUNCTION public.k9_protect_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF ROW(NEW.question_snapshot,NEW.option_order,NEW.question_id,NEW.assignment_id,NEW.position) IS DISTINCT FROM ROW(OLD.question_snapshot,OLD.option_order,OLD.question_id,OLD.assignment_id,OLD.position) THEN RAISE EXCEPTION 'Composizione della prova immutabile'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS k9_protect_snapshot ON public.exam_questions;
CREATE TRIGGER k9_protect_snapshot BEFORE UPDATE ON public.exam_questions FOR EACH ROW EXECUTE FUNCTION public.k9_protect_snapshot();

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
 eligible_families integer;
begin
 select * into ex from public.exam_assignments where id=p_assignment_id for update;
 if not found then raise exception 'Assegnazione non trovata'; end if;
 if ex.status<>'assigned' then raise exception 'La prova non è più preparabile'; end if;
 select count(*) into existing_count from public.exam_questions where assignment_id=ex.id;
 if existing_count>0 then
  if existing_count<>ex.question_count then raise exception 'Composizione prova incompleta'; end if;
  return existing_count;
 end if;

 -- Le famiglie sono concetti, non numero di formulazioni: 100 domande Detection
 -- attuali possono rappresentare solo 10 famiglie didattiche.
 select count(distinct public.k9_question_family(q.concept_id,q.category,q.option_a,q.option_b,q.option_c,q.option_d))
 into eligible_families
 from public.question_bank q
 where q.active=true and q.discipline=ex.discipline and q.difficulty in ('medio','difficile');
 if eligible_families < ex.question_count then
  raise exception 'Esame %: % domande richieste, ma soltanto % famiglie didattiche medio/difficili distinte. Ampliare la banca con concetti realmente nuovi oppure ridurre il numero di domande.',
   ex.discipline, ex.question_count, eligible_families;
 end if;

 -- Prima scegliamo le famiglie; poi una variante per famiglia. Se una famiglia
 -- contiene versioni medie e difficili, il livello richiesto determina la variante.
 -- Questo evita che la prima variante estratta a caso renda impossibile una quota 40/60.
 insert into public.exam_questions(assignment_id,position,question_id,option_order,question_snapshot)
 with candidates as (
  select q.id,q.difficulty,
   regexp_replace(lower(btrim(q.question_text)), '[[:space:]]+', ' ', 'g') as stem_key,
   public.k9_question_family(q.concept_id,q.category,q.option_a,q.option_b,q.option_c,q.option_d) as family_key
  from public.question_bank q
  where q.active=true and q.discipline=ex.discipline and q.difficulty in ('medio','difficile')
 ), distinct_stem as (
  select c.*,row_number() over(partition by stem_key order by random()) as stem_rank from candidates c
 ), pool as (
  select family_key,bool_or(difficulty='medio') as has_medium,bool_or(difficulty='difficile') as has_hard
  from distinct_stem where stem_rank=1 group by family_key
 ), hard_selected as (
  select family_key from pool where has_hard
  order by case when has_medium then 1 else 0 end,random()
  limit ceil(ex.question_count*0.40)::integer
 ), others as (
  select p.family_key, case when p.has_medium then 'medio' else 'difficile' end as wanted
  from pool p where not exists (select 1 from hard_selected h where h.family_key=p.family_key)
  order by case when p.has_medium then 0 else 1 end,random()
  limit greatest(0,ex.question_count-(select count(*) from hard_selected))
 ), wanted_families as (
  select family_key,'difficile'::text as wanted from hard_selected
  union all
  select family_key,wanted from others
 ), candidate_rows as (
  select c.id,c.family_key,
   row_number() over(partition by c.family_key order by case when c.difficulty=w.wanted then 0 else 1 end,random()) as choice_rank
  from distinct_stem c join wanted_families w on w.family_key=c.family_key where c.stem_rank=1
 ), chosen as (
  select id,row_number() over(order by random())::integer as position from candidate_rows where choice_rank=1
 )
 select ex.id,c.position,c.id,
  public.k9_shuffle_options(),jsonb_build_object('code',q.code,'category',q.category,'difficulty',q.difficulty,'question_text',q.question_text,'options',jsonb_build_array(q.option_a,q.option_b,q.option_c,q.option_d),'correct_option',q.correct_option,'explanation',q.explanation,'concept_id',q.concept_id,'source_reference',q.source_reference,'version',q.k9_version,'validation_status',q.validation_status)
 from chosen c join public.question_bank q on q.id=c.id;

 get diagnostics inserted_count = row_count;
 if inserted_count <> ex.question_count then
  raise exception 'Prova non composta: % domande inseribili su % richieste; verificare testi duplicati e famiglie della banca', inserted_count,ex.question_count;
 end if;
 return inserted_count;
end $function$;

ALTER TABLE public.exam_assignments ADD COLUMN IF NOT EXISTS k9_auth_session text;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS first_answered_at timestamptz;
CREATE OR REPLACE FUNCTION public.k9_check_exam_session(p_assignment uuid,p_bind boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_session text; sid text:=auth.jwt()->>'session_id';
BEGIN
 IF sid IS NULL OR public.current_role() IS DISTINCT FROM 'student' THEN RAISE EXCEPTION 'Sessione di accesso non valida'; END IF;
 SELECT k9_auth_session INTO old_session FROM public.exam_assignments WHERE id=p_assignment AND student_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Esame non disponibile'; END IF;
 IF old_session IS NULL AND p_bind THEN UPDATE public.exam_assignments SET k9_auth_session=sid WHERE id=p_assignment;
 ELSIF old_session IS DISTINCT FROM sid THEN RAISE EXCEPTION 'Prova aperta con un altro accesso. Chiedere al Super Amministratore lo sblocco.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.k9_check_exam_session(uuid,boolean) FROM PUBLIC,anon,authenticated;
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

 if not found or auth.uid() is null or public.current_role() is distinct from 'student' or ex.student_id is distinct from auth.uid() then
   raise exception 'Esame non disponibile';
 end if;

 perform public.k9_check_exam_session(ex.id,true);
 if ex.status='assigned' then
   if ex.available_from > clock_timestamp() then raise exception 'Esame non ancora disponibile'; end if;
   -- Anche per assegnazioni legacy, usa l'unico selettore anti-duplicati.
   if not exists (select 1 from public.exam_questions where assignment_id=ex.id) then
     perform public.prepare_exam_questions(ex.id);
   end if;
   update public.exam_assignments
   set status='in_progress',
       started_at=clock_timestamp(),
       ends_at=clock_timestamp()+make_interval(mins=>duration_minutes)
   where id=ex.id
   returning * into ex;


   if (select count(*) from public.exam_questions where assignment_id=ex.id) <> ex.question_count then
     raise exception 'Errore nella composizione della prova';
   end if;
 elsif ex.status<>'in_progress' then
   raise exception 'Esame non avviabile';
 end if;

 if clock_timestamp()>=ex.ends_at then
   return public.finalize_exam(ex.id,true);
 end if;

 return jsonb_build_object(
   'assignment_id',ex.id,
   'discipline',ex.discipline,
   'started_at',ex.started_at,
   'ends_at',ex.ends_at,
   'server_now',clock_timestamp(),
   'question_count',ex.question_count,
   'duration_minutes',ex.duration_minutes,
   'status',ex.status,
   'questions',(
     select jsonb_agg(jsonb_build_object(
       'position',eq.position,
       'question_id',eq.question_id,
       'code',eq.question_snapshot->>'code',
       'category',eq.question_snapshot->>'category',
       'question_text',eq.question_snapshot->>'question_text',
       'options',jsonb_build_array(
         (eq.question_snapshot->'options') -> eq.option_order[1],
         (eq.question_snapshot->'options') -> eq.option_order[2],
         (eq.question_snapshot->'options') -> eq.option_order[3],
         (eq.question_snapshot->'options') -> eq.option_order[4]
       ),
       'selected_option',eq.selected_option,
       'is_correct',eq.is_correct
     ) order by eq.position)
     from public.exam_questions eq
     where eq.assignment_id=ex.id
   )
 );
end $function$;

CREATE OR REPLACE FUNCTION public.answer_exam_question(p_assignment_id uuid, p_position integer, p_selected_option integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 ex public.exam_assignments%rowtype;
 eq public.exam_questions%rowtype;
 original_selected smallint;
 ok boolean;
begin
 if p_selected_option is null or p_selected_option not between 0 and 3 then raise exception 'Risposta non valida'; end if;
 select * into ex from public.exam_assignments where id=p_assignment_id for update;
 if not found or auth.uid() is null or public.current_role() is distinct from 'student' or ex.student_id is distinct from auth.uid() then raise exception 'Esame non disponibile'; end if;
 if ex.status<>'in_progress' then raise exception 'Esame chiuso'; end if;
 if clock_timestamp()>=ex.ends_at then return public.finalize_exam(ex.id,true); end if;
 perform public.k9_check_exam_session(ex.id,false);
 select * into eq from public.exam_questions where assignment_id=p_assignment_id and position=p_position for update;
 if not found then raise exception 'Domanda non disponibile'; end if;
 if eq.selected_option is not null then
   if eq.selected_option=p_selected_option then return jsonb_build_object('is_correct',eq.is_correct); end if;
   raise exception 'Risposta già registrata'; end if;
 original_selected:=eq.option_order[p_selected_option+1];
 ok:=(original_selected=(eq.question_snapshot->>'correct_option')::smallint);
 update public.exam_questions set selected_option=p_selected_option,is_correct=ok,answered_at=now(),first_answered_at=coalesce(first_answered_at,clock_timestamp())
 where assignment_id=p_assignment_id and position=p_position;
 update public.exam_assignments
 set answered_questions=(select count(*) from public.exam_questions where assignment_id=p_assignment_id and selected_option is not null),
     correct_answers=(select count(*) from public.exam_questions where assignment_id=p_assignment_id and is_correct=true)
 where id=p_assignment_id;
 -- Durante la prova restituiamo solo l'esito della scelta, mai soluzione o spiegazione.
 return jsonb_build_object('is_correct',ok);
end $function$;

CREATE OR REPLACE FUNCTION public.retry_exam_question(p_assignment_id uuid, p_position integer, p_selected_option integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 ex public.exam_assignments%rowtype;
 eq public.exam_questions%rowtype;
 original_displayed smallint;
 original_selected smallint;
 retried_selected smallint;
 ok boolean;
 used_count integer;
begin
 if p_selected_option is null or p_selected_option not between 0 and 3 then
   raise exception 'Risposta non valida';
 end if;

 select * into ex
 from public.exam_assignments
 where id=p_assignment_id
 for update;

 if not found or auth.uid() is null or public.current_role() is distinct from 'student' or ex.student_id is distinct from auth.uid() then
   raise exception 'Esame non disponibile';
 end if;
 if ex.status<>'in_progress' then
   raise exception 'Esame chiuso';
 end if;
 if clock_timestamp()>=ex.ends_at then
   return public.finalize_exam(ex.id,true);
 end if;
 perform public.k9_check_exam_session(ex.id,false);

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
 if exists(select 1 from public.answer_correction_reports where assignment_id=p_assignment_id and position=p_position and intended_option=p_selected_option and status='accepted') then
   select count(*) into used_count from public.answer_correction_reports where assignment_id=p_assignment_id and status='accepted';
   return jsonb_build_object('is_correct',eq.is_correct,'retry_used',used_count,'retry_remaining',greatest(0,3-used_count));
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

 original_displayed:=eq.selected_option;
 original_selected:=eq.option_order[eq.selected_option+1];
 retried_selected:=eq.option_order[p_selected_option+1];
 ok:=(retried_selected=(eq.question_snapshot->>'correct_option')::smallint);

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

  if auth.uid() is null or v_role is null then raise exception 'Non autorizzato'; end if;
  if ex.student_id is distinct from auth.uid() then
    if v_role is distinct from 'super_admin' then
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

  if ex.student_id=auth.uid() and clock_timestamp()<ex.ends_at then perform public.k9_check_exam_session(ex.id,false); end if;
  if p_expired is true and clock_timestamp()<ex.ends_at then
    return jsonb_build_object('status','in_progress','server_now',clock_timestamp(),'ends_at',ex.ends_at);
  end if;
  select count(*) filter(where is_correct=true),count(*) filter(where selected_option is not null)
  into c,a from public.exam_questions where assignment_id=p_assignment_id;

  pct:=round(c::numeric/greatest(ex.question_count,1)*100,2);

  update public.exam_assignments
  set status=case when clock_timestamp()>=ends_at then 'expired' else 'submitted' end,
      submitted_at=clock_timestamp(),correct_answers=c,answered_questions=a,
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
  if auth.uid() is null or v_role is null then raise exception 'Permesso negato'; end if;
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
          'code',eq.question_snapshot->>'code',
          'category',eq.question_snapshot->>'category',
          'difficulty',eq.question_snapshot->>'difficulty',
          'question_text',eq.question_snapshot->>'question_text',
          'options',jsonb_build_array(
            (eq.question_snapshot->'options')->eq.option_order[1],
            (eq.question_snapshot->'options')->eq.option_order[2],
            (eq.question_snapshot->'options')->eq.option_order[3],
            (eq.question_snapshot->'options')->eq.option_order[4]
          ),
          'selected_option',eq.selected_option,
          'correct_option',array_position(eq.option_order,(eq.question_snapshot->>'correct_option')::smallint)-1,
          'is_correct',eq.is_correct,
          'answered_at',eq.answered_at,
          'explanation',eq.question_snapshot->>'explanation',
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
      where eq.assignment_id=ex.id
    ),'[]'::jsonb)
  );
end;
$function$;

-- Scadenze automatiche indipendenti dal browser (funzione per job/server).
CREATE OR REPLACE FUNCTION public.k9_expire_due_exams() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex public.exam_assignments%rowtype; n integer:=0; c integer; a integer; pct numeric(5,2);
BEGIN
 FOR ex IN SELECT * FROM public.exam_assignments WHERE status='in_progress' AND ends_at<=clock_timestamp() FOR UPDATE SKIP LOCKED LOOP
  SELECT count(*) FILTER(WHERE is_correct IS TRUE),count(*) FILTER(WHERE selected_option IS NOT NULL) INTO c,a FROM public.exam_questions WHERE assignment_id=ex.id;
  pct:=round(c::numeric/greatest(ex.question_count,1)*100,2);
  UPDATE public.exam_assignments SET status='expired',submitted_at=clock_timestamp(),correct_answers=c,answered_questions=a,score_percentage=pct,passed=(pct>=pass_percentage) WHERE id=ex.id;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.k9_expire_due_exams() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.k9_expire_due_exams() TO service_role;
CREATE INDEX IF NOT EXISTS k9_exam_expiry_idx ON public.exam_assignments(ends_at) WHERE status='in_progress';
-- Controlli di completezza della pratica (le bozze delle componenti restano ammesse).
CREATE OR REPLACE FUNCTION public.k9_validate_practical() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex public.exam_assignments%rowtype; p integer; f integer;
BEGIN
 SELECT * INTO ex FROM public.exam_assignments WHERE id=NEW.assignment_id FOR UPDATE;
 IF NOT FOUND OR NEW.discipline IS DISTINCT FROM ex.discipline OR ex.status NOT IN ('submitted','expired') THEN RAISE EXCEPTION 'Pratica consentita solo dopo la teoria della stessa disciplina'; END IF;
 IF auth.uid() IS NOT NULL AND (public.current_role() IS NULL OR NEW.evaluator_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Valutatore non valido'; END IF;
 IF TG_OP='UPDATE' AND OLD.completed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD AND NEW.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Valutazione chiusa: usare Riapri valutazione'; END IF;
 IF TG_OP='UPDATE' AND OLD.completed_at IS NOT NULL AND NEW.completed_at IS NULL AND (NEW.outcome IS NOT NULL OR current_setting('k9.reopening_practical',true) IS DISTINCT FROM 'yes') THEN RAISE EXCEPTION 'Riapertura non valida'; END IF;
 IF NEW.outcome IS NULL THEN NEW.completed_at:=NULL; RETURN NEW; END IF;
 IF jsonb_typeof(NEW.criteria) IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.professional_criteria) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Criteri non validi'; END IF;
 IF jsonb_array_length(NEW.criteria)<>10 OR jsonb_array_length(NEW.professional_criteria)<>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.criteria||NEW.professional_criteria) c WHERE coalesce(c->>'score','') !~ '^[1-5]$' OR nullif(btrim(c->>'label'),'') IS NULL) THEN RAISE EXCEPTION 'Compilare i 10 criteri pratici e i 4 professionali'; END IF;
 IF (SELECT count(DISTINCT c->>'label') FROM jsonb_array_elements(NEW.criteria) c)<>10 OR (SELECT count(DISTINCT c->>'label') FROM jsonb_array_elements(NEW.professional_criteria) c)<>4 THEN RAISE EXCEPTION 'Criteri duplicati'; END IF;
 SELECT sum((c->>'score')::integer) INTO p FROM jsonb_array_elements(NEW.criteria) c;
 SELECT sum((c->>'score')::integer) INTO f FROM jsonb_array_elements(NEW.professional_criteria) c;
 NEW.practical_score:=p; NEW.professional_score:=f;
 IF NEW.outcome='idoneo' AND ex.discipline='mantrailing' THEN
  IF jsonb_typeof(NEW.components) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Componenti non valide'; END IF;
  IF jsonb_array_length(NEW.components)<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.components) c WHERE c->>'status' IS DISTINCT FROM 'superata' OR nullif(btrim(c->>'name'),'') IS NULL) OR (SELECT count(DISTINCT c->>'name') FROM jsonb_array_elements(NEW.components) c)<>2 THEN RAISE EXCEPTION 'Le due componenti devono essere distinte e superate'; END IF;
 END IF;
 IF ((NEW.outcome='idoneo' AND (ex.passed IS DISTINCT FROM true OR p<30 OR f<12)) OR (NEW.outcome='non_idoneo' AND ex.passed IS TRUE AND p>=30 AND f>=12 AND (ex.discipline<>'mantrailing' OR CASE WHEN jsonb_typeof(NEW.components)='array' THEN jsonb_array_length(NEW.components)=2 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.components) c WHERE c->>'status' IS DISTINCT FROM 'superata') ELSE false END))) AND nullif(btrim(NEW.notes),'') IS NULL THEN RAISE EXCEPTION 'Motivare il giudizio diverso dal consiglio automatico'; END IF;
 IF NEW.outcome='da_rivedere' THEN NEW.completed_at:=NULL; ELSE NEW.completed_at:=coalesce(NEW.completed_at,clock_timestamp()); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS k9_validate_practical ON public.practical_evaluations;
CREATE TRIGGER k9_validate_practical BEFORE INSERT OR UPDATE ON public.practical_evaluations FOR EACH ROW EXECUTE FUNCTION public.k9_validate_practical();

create or replace function public.assign_exam(p_student_id uuid,p_discipline text,p_question_count integer,p_duration_minutes integer,p_pass_percentage integer,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
 if not public.has_role_permission('assign_exam') then raise exception 'Assegnazione esami non abilitata'; end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student' and archived_at is null) then raise exception 'Corsista non valido o archiviato'; end if;
 if p_discipline not in('dogsitter','mantrailing','hrdd','detection') then raise exception 'Disciplina non valida'; end if;
 perform public.k9_expire_due_exams();
 perform 1 from public.profiles where id=p_student_id for update;
 if exists(select 1 from public.exam_assignments where student_id=p_student_id and status in('assigned','in_progress')) then raise exception 'Il corsista ha già un esame aperto'; end if;
 -- Controllo di capienza per famiglie svolto da prepare_exam_questions, non dal numero grezzo di righe.
 insert into public.exam_assignments(student_id,assigned_by,discipline,question_count,duration_minutes,pass_percentage,notes)
 values(p_student_id,auth.uid(),p_discipline,p_question_count,p_duration_minutes,p_pass_percentage,p_notes) returning id into new_id;
 perform public.prepare_exam_questions(new_id);
 return new_id;
end$$;

create or replace function public.set_exam_evaluator(p_assignment_id uuid,p_evaluator_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_role_permission('assign_evaluator') then raise exception 'Assegnazione valutatore non abilitata'; end if;
 if p_evaluator_id is not null and not exists(select 1 from public.profiles where id=p_evaluator_id and role in('examiner','teacher') and archived_at is null) then raise exception 'Esaminatore non valido o archiviato'; end if;
 update public.exam_assignments set evaluator_id=p_evaluator_id where id=p_assignment_id and (public.current_role() in ('super_admin','vice_admin') or assigned_by=auth.uid());
 if not found then raise exception 'Esame non disponibile'; end if;
end$$;

create or replace function public.get_exam_audit_timeline(p_assignment_id uuid)
returns table(id bigint,event_type text,event_label text,actor_id uuid,actor_name text,actor_role text,event_data jsonb,created_at timestamptz,event_hash text)
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or coalesce(public.current_role(),'') not in('teacher','examiner','vice_admin','super_admin') then raise exception 'Non autorizzato'; end if;
 if not exists(select 1 from public.exam_assignments ea where ea.id=p_assignment_id and (public.current_role() in ('super_admin','vice_admin') or ea.assigned_by=auth.uid() or ea.evaluator_id=auth.uid())) then raise exception 'Esame non disponibile'; end if;
 return query select a.id,a.event_type,a.event_label,a.actor_id,p.full_name,a.actor_role,a.event_data,a.created_at,a.event_hash
 from public.exam_audit_events a left join public.profiles p on p.id=a.actor_id
 where a.assignment_id=p_assignment_id order by a.created_at,a.id;
end$$;

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
  select * into v_assignment from public.exam_assignments where id=p_assignment_id for update;
  if not found then raise exception 'Esame non trovato'; end if;

  if p_document_type is null or p_document_type not in('report','certificate','candidate_report') then
    raise exception 'Tipo documento non valido';
  end if;

  if auth.uid() is null or v_role is null then raise exception 'Permesso negato'; end if;
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

  IF p_document_type IN ('report','certificate','candidate_report') AND v_assignment.status NOT IN ('submitted','expired') THEN RAISE EXCEPTION 'Prova teorica non conclusa'; END IF;
  IF p_document_type='certificate' AND (v_assignment.passed IS DISTINCT FROM true OR NOT EXISTS (
    SELECT 1 FROM public.practical_evaluations pe WHERE pe.assignment_id=v_assignment.id AND pe.outcome='idoneo' AND pe.completed_at IS NOT NULL
    AND (v_assignment.discipline<>'mantrailing' OR CASE WHEN jsonb_typeof(pe.components)='array' THEN jsonb_array_length(pe.components)=2 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pe.components) c WHERE c->>'status' IS DISTINCT FROM 'superata' OR nullif(btrim(c->>'name'),'') IS NULL) AND (SELECT count(DISTINCT c->>'name') FROM jsonb_array_elements(pe.components) c)=2 ELSE false END)
  )) THEN RAISE EXCEPTION 'Requisiti di idoneità non soddisfatti'; END IF;
  IF EXISTS(SELECT 1 FROM public.exam_documents WHERE assignment_id=v_assignment.id AND document_type=p_document_type AND status='revoked') AND nullif(btrim(p_metadata->>'reissue_reason'),'') IS NULL THEN RAISE EXCEPTION 'Indicare la motivazione della riemissione'; END IF;
  v_code:=upper(trim(regexp_replace(p_document_code,'^N\.?\s*','','i')));
  IF NOT EXISTS(SELECT 1 FROM public.exam_documents WHERE assignment_id=v_assignment.id AND document_type=p_document_type) AND v_code IS DISTINCT FROM ((CASE p_document_type WHEN 'certificate' THEN 'ATT' WHEN 'candidate_report' THEN 'RPT' ELSE 'VER' END)||'-'||extract(year FROM v_assignment.assigned_at AT TIME ZONE 'Europe/Rome')::integer::text||'-'||left(upper(v_assignment.discipline),5)||'-'||upper(replace(v_assignment.id::text,'-',''))) THEN RAISE EXCEPTION 'Codice documento non conforme'; END IF;
  IF EXISTS(SELECT 1 FROM public.exam_documents WHERE assignment_id=v_assignment.id AND document_type=p_document_type AND document_code<>v_code) THEN RAISE EXCEPTION 'Codice documento già assegnato: mantenere il codice originale'; END IF;
  v_group:=regexp_replace(v_code,'^(ATT|VER|RPT)-','');
  if v_group is null or trim(v_group)='' or v_code !~ '^[A-Z0-9._-]+$' then raise exception 'Codice documento non valido'; end if;

  select full_name into v_student_name from public.profiles where id=v_assignment.student_id;
  v_org:=nullif(p_metadata->>'organization_name','');
  v_final:=case when p_document_type='certificate' then 'ESAME SUPERATO' else nullif(p_metadata->>'final_status','') end;

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

-- Accesso diretto alle soluzioni e scritture di correzioni esclusivamente tramite RPC.
REVOKE ALL ON public.exam_questions FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.answer_correction_reports FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS correction_read ON public.answer_correction_reports;
CREATE POLICY correction_read ON public.answer_correction_reports FOR SELECT TO authenticated USING(
 public.current_role() IS NOT NULL AND (reported_by=auth.uid() OR public.current_role() IN ('super_admin','vice_admin') OR EXISTS(SELECT 1 FROM public.exam_assignments e WHERE e.id=assignment_id AND (e.assigned_by=auth.uid() OR e.evaluator_id=auth.uid()))));
DROP POLICY IF EXISTS audit_staff_read ON public.exam_audit_events;
CREATE POLICY audit_staff_read ON public.exam_audit_events FOR SELECT TO authenticated USING(public.current_role() IN ('super_admin','vice_admin') OR (public.current_role() IN ('teacher','examiner') AND EXISTS(SELECT 1 FROM public.exam_assignments e WHERE e.id=assignment_id AND (e.assigned_by=auth.uid() OR e.evaluator_id=auth.uid()))));
REVOKE ALL ON FUNCTION public.prepare_exam_questions(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_exam_questions(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.write_exam_audit(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
-- L'elenco personale non espone hash a browser/staff; la Edge Function usa service_role.
REVOKE SELECT ON public.student_credentials FROM PUBLIC,anon,authenticated;
GRANT SELECT(student_id,username,login_email,active,created_at,updated_at) ON public.student_credentials TO authenticated;
-- Creazione corso e tutte le assegnazioni in unica transazione lato DB.
CREATE OR REPLACE FUNCTION public.k9_create_course_atomic(p_actor uuid,p_title text,p_code text,p_discipline text,p_count integer,p_duration integer,p_pass integer,p_notes text,p_students uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ses public.exam_sessions%rowtype; st uuid; cred public.student_credentials%rowtype; a uuid; seq integer; v_code text;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.archived_at IS NULL AND (p.role='super_admin' OR (p.role IN ('vice_admin','teacher','examiner') AND EXISTS(SELECT 1 FROM public.role_permissions rp WHERE rp.role=p.role AND (rp.permissions->>'sessions_manage')::boolean IS TRUE)))) THEN RAISE EXCEPTION 'Non autorizzato'; END IF;
 IF nullif(btrim(p_title),'') IS NULL OR nullif(btrim(p_code),'') IS NULL OR coalesce(cardinality(p_students),0)=0 THEN RAISE EXCEPTION 'Dati corso incompleti'; END IF;
 FOR seq IN 1..999 LOOP
  v_code:=p_code||CASE WHEN seq=1 THEN '' ELSE '-'||CASE WHEN seq<10 THEN '0'||seq::text ELSE seq::text END END;
  INSERT INTO public.exam_sessions(title,common_username,discipline,question_count,duration_minutes,pass_percentage,notes,created_by) VALUES(p_title,v_code,p_discipline,p_count,p_duration,p_pass,p_notes,p_actor) ON CONFLICT(common_username) DO NOTHING RETURNING * INTO ses;
  EXIT WHEN FOUND;
 END LOOP;
 IF ses.id IS NULL THEN RAISE EXCEPTION 'Codice corso non disponibile'; END IF;
 -- Blocchi in ordine stabile per prevenire assegnazioni concorrenti.
 PERFORM 1 FROM public.profiles WHERE id=ANY(p_students) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.exam_assignments WHERE student_id=ANY(p_students) AND status IN ('assigned','in_progress')) THEN RAISE EXCEPTION 'Uno o più corsisti hanno già un esame aperto'; END IF;
 FOREACH st IN ARRAY p_students LOOP
  SELECT * INTO cred FROM public.student_credentials WHERE student_id=st AND active;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=st AND role='student' AND archived_at IS NULL) THEN RAISE EXCEPTION 'Corsista non disponibile'; END IF;
  INSERT INTO public.session_candidates(session_id,auth_user_id,full_name,candidate_code,login_email,credential_hash,active) SELECT ses.id,p.id,coalesce(p.full_name,'Corsista'),cred.username,cred.login_email,NULL,true FROM public.profiles p WHERE p.id=st;
  INSERT INTO public.exam_assignments(student_id,session_id,discipline,question_count,duration_minutes,pass_percentage,notes,assigned_by,status) VALUES(st,ses.id,p_discipline,p_count,p_duration,p_pass,p_notes,p_actor,'assigned') RETURNING id INTO a;
  PERFORM public.prepare_exam_questions(a);
 END LOOP;
 RETURN jsonb_build_object('session',to_jsonb(ses),'assigned_count',cardinality(p_students));
END $$;
REVOKE ALL ON FUNCTION public.k9_create_course_atomic(uuid,text,text,text,integer,integer,integer,text,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.k9_create_course_atomic(uuid,text,text,text,integer,integer,integer,text,uuid[]) TO service_role;
-- Non si rimuove la tracciabilità dei documenti già emessi. Gli esami privi di PDF tracciati restano eliminabili.
CREATE OR REPLACE FUNCTION public.get_my_assigned_exam() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex public.exam_assignments%rowtype;
BEGIN
 IF auth.uid() IS NULL OR public.current_role() IS DISTINCT FROM 'student' THEN RAISE EXCEPTION 'Riservato al Corsista'; END IF;
 SELECT * INTO ex FROM public.exam_assignments WHERE student_id=auth.uid() AND status IN ('assigned','in_progress','submitted','expired') ORDER BY (status IN ('assigned','in_progress')) DESC,assigned_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF ex.status='in_progress' AND clock_timestamp()>=ex.ends_at THEN PERFORM public.finalize_exam(ex.id,true); SELECT * INTO ex FROM public.exam_assignments WHERE id=ex.id; END IF;
 RETURN jsonb_build_object('id',ex.id,'discipline',ex.discipline,'question_count',ex.question_count,'duration_minutes',ex.duration_minutes,'pass_percentage',ex.pass_percentage,'notes',ex.notes,'status',ex.status,'assigned_at',ex.assigned_at,'started_at',ex.started_at,'ends_at',ex.ends_at,'answered_questions',ex.answered_questions);
END $$;
-- Impedisce DML diretto delle prove e dei documenti dal browser; restano le RPC.
REVOKE INSERT,UPDATE,DELETE ON public.exam_assignments,public.exam_documents FROM PUBLIC,anon,authenticated;
REVOKE SELECT ON public.session_candidates FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,session_id,auth_user_id,full_name,candidate_code,active,created_at,login_email) ON public.session_candidates TO authenticated;
REVOKE ALL ON FUNCTION public.assign_exam(uuid,text,integer,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_exam(uuid,text,integer,integer,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION public.start_assigned_exam(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_assigned_exam(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.answer_exam_question(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.answer_exam_question(uuid,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.retry_exam_question(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retry_exam_question(uuid,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.finalize_exam(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_exam(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_assigned_exam() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_assigned_exam() TO authenticated;
REVOKE ALL ON FUNCTION public.get_exam_candidate_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_exam_candidate_report(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_exam_evaluator(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_exam_evaluator(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_exam_audit_timeline(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_exam_audit_timeline(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.register_exam_document(uuid,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.register_exam_document(uuid,text,text,jsonb) FROM authenticated;
-- La funzione tracciata, SECURITY DEFINER, può chiamare la registrazione interna.
-- Ruoli nulli (utenti archiviati o senza profilo) non possono accedere alle RPC.
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
 IF auth.uid() IS NULL OR public.current_role() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
 if public.current_role() IS DISTINCT FROM 'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 if p_role not in('vice_admin','teacher','examiner') then raise exception 'Ruolo non configurabile'; end if;
 select key into bad_key from jsonb_object_keys(coalesce(p_permissions,'{}'::jsonb)) key where not(key=any(allowed_keys)) limit 1;
 if bad_key is not null then raise exception 'Permesso non valido: %',bad_key; end if;
 normalized:=public.normalize_role_permissions(p_permissions);
 insert into public.role_permissions(role,permissions,updated_by,updated_at)
 values(p_role,normalized,auth.uid(),now())
 on conflict(role) do update set permissions=excluded.permissions,updated_by=auth.uid(),updated_at=now();
end;
$$;
REVOKE ALL ON FUNCTION public.set_role_permissions(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_role_permissions(text,jsonb) TO authenticated;
create or replace function public.get_all_role_permissions()
returns table(role text,permissions jsonb)
language plpgsql
security definer
set search_path=public
as $$
begin
 IF auth.uid() IS NULL OR public.current_role() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
 if public.current_role() IS DISTINCT FROM 'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 return query select rp.role,rp.permissions from public.role_permissions rp order by rp.role;
end;
$$;
REVOKE ALL ON FUNCTION public.get_all_role_permissions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_all_role_permissions() TO authenticated;
create or replace function public.get_role_dashboard()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r text:=public.current_role();students_count integer:=0;open_count integer:=0;completed_count integer:=0;sessions_count integer:=0;
begin
 IF auth.uid() IS NULL OR r IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
 if r IS DISTINCT FROM 'super_admin' and not public.has_role_permission('dashboard') then raise exception 'Dashboard non abilitata'; end if;
 if r in('super_admin','vice_admin') then
   select count(*) into students_count from public.profiles where role='student' and archived_at is null;
   select count(*) into open_count from public.exam_assignments where status in('assigned','in_progress');
   select count(*) into completed_count from public.exam_assignments where status in('submitted','expired');
   select count(*) into sessions_count from public.exam_sessions where active=true;
 else
   select count(distinct e.student_id) into students_count from public.exam_assignments e join public.profiles p on p.id=e.student_id where p.archived_at is null and (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid());
   select count(*) into open_count from public.exam_assignments e where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and e.status in('assigned','in_progress');
   select count(*) into completed_count from public.exam_assignments e where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and e.status in('submitted','expired');
   select count(distinct e.session_id) into sessions_count from public.exam_assignments e join public.exam_sessions s on s.id=e.session_id where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and s.active=true;
 end if;
 return jsonb_build_object('students',students_count,'open_exams',open_count,'completed_exams',completed_count,'active_sessions',sessions_count);
end$$;
REVOKE ALL ON FUNCTION public.get_role_dashboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_role_dashboard() TO authenticated;
create or replace function public.set_profile_photo_path(p_user_id uuid,p_path text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  caller_role text:=public.current_role();
begin
 IF auth.uid() IS NULL OR public.current_role() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  if p_user_id is null then raise exception 'Utente non valido'; end if;

  if p_user_id<>auth.uid()
     and caller_role IS DISTINCT FROM 'super_admin'
     and not public.has_role_permission('users_create') then
    raise exception 'Non autorizzato a modificare questa foto profilo';
  end if;

  if p_path is not null and p_path<>p_user_id::text||'/profile.webp' then
    raise exception 'Percorso foto profilo non valido';
  end if;

  update public.profiles
  set avatar_path=p_path,updated_at=now()
  where id=p_user_id;

  if not found then raise exception 'Utente non trovato'; end if;
end;
$$;
REVOKE ALL ON FUNCTION public.set_profile_photo_path(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_profile_photo_path(uuid,text) TO authenticated;
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
 IF auth.uid() IS NULL OR public.current_role() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
  if public.current_role() IS DISTINCT FROM 'super_admin' and not public.has_role_permission('verify_documents') then
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
REVOKE ALL ON FUNCTION public.verify_exam_document(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verify_exam_document(text) TO authenticated;
create or replace function public.list_exam_documents()
returns table (
 id uuid,assignment_id uuid,document_type text,document_code text,document_group_code text,
 student_id uuid,student_name text,discipline text,organization_name text,final_status text,
 issued_at timestamptz,last_generated_at timestamptz,generation_count integer,status text
)
language plpgsql security definer set search_path=public as $$
begin
 IF auth.uid() IS NULL OR public.current_role() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
 if public.current_role() IS DISTINCT FROM 'super_admin' and not public.has_role_permission('document_archive') then
   raise exception 'Archivio documenti non abilitato';
 end if;
 return query select d.id,d.assignment_id,d.document_type,d.document_code,d.document_group_code,d.student_id,d.student_name,
 d.discipline,d.organization_name,d.final_status,d.issued_at,d.last_generated_at,d.generation_count,d.status
 from public.exam_documents d
 where public.current_role() in('super_admin','vice_admin') or d.student_id=auth.uid() or d.issued_by=auth.uid()
 order by d.issued_at desc;
end$$;
REVOKE ALL ON FUNCTION public.list_exam_documents() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_exam_documents() TO authenticated;
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
 IF auth.uid() IS NULL OR public.current_role() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
  if public.current_role() IS DISTINCT FROM 'super_admin'
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
REVOKE ALL ON FUNCTION public.list_exam_documents_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_exam_documents_v2() TO authenticated;

-- 2.1: banca professionale, paginazione, archivio privato, sessioni e statistiche.
CREATE TABLE IF NOT EXISTS public.k9_question_versions (
 question_id bigint NOT NULL, version integer NOT NULL, snapshot jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), changed_by uuid,
 PRIMARY KEY(question_id,version)
);
ALTER TABLE public.k9_question_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.k9_question_versions FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS k9_versions_read ON public.k9_question_versions;
CREATE POLICY k9_versions_read ON public.k9_question_versions FOR SELECT TO authenticated USING(public.current_role()='super_admin' OR public.has_role_permission('question_bank'));
GRANT SELECT ON public.k9_question_versions TO authenticated;
-- No pre-existing answers altered; version numbering begins now.
CREATE OR REPLACE FUNCTION public.k9_bank_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE family text; check_text boolean:=true; check_code boolean:=true;
BEGIN
 IF TG_OP='DELETE' THEN
   INSERT INTO public.k9_question_versions VALUES(OLD.id,OLD.k9_version,to_jsonb(OLD),clock_timestamp(),auth.uid()) ON CONFLICT DO NOTHING;
   RETURN OLD;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('k9-bank'));
 IF NEW.validation_status='bozza' THEN NEW.active:=false; END IF;
 IF TG_OP='UPDATE' THEN
   check_text:=NEW.question_text IS DISTINCT FROM OLD.question_text OR NEW.discipline IS DISTINCT FROM OLD.discipline;
   check_code:=NEW.code IS DISTINCT FROM OLD.code;
   IF public.k9_question_family(NEW.concept_id,NEW.category,NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d) IS DISTINCT FROM public.k9_question_family(OLD.concept_id,OLD.category,OLD.option_a,OLD.option_b,OLD.option_c,OLD.option_d) OR NEW.discipline IS DISTINCT FROM OLD.discipline THEN NEW.variant_number:=NULL; END IF;
   IF (to_jsonb(NEW)-'active'-'updated_at'-'k9_version'-'validation_status'-'variant_number') IS DISTINCT FROM (to_jsonb(OLD)-'active'-'updated_at'-'k9_version'-'validation_status'-'variant_number') AND NEW.validation_status='approvata' AND OLD.validation_status='approvata' THEN NEW.validation_status:='da_verificare'; END IF;
 END IF;
 IF check_text THEN
  IF EXISTS(SELECT 1 FROM public.question_bank q WHERE q.discipline=NEW.discipline AND q.id IS DISTINCT FROM NEW.id AND regexp_replace(lower(btrim(q.question_text)),'[[:space:]]+',' ','g')=regexp_replace(lower(btrim(NEW.question_text)),'[[:space:]]+',' ','g')) THEN RAISE EXCEPTION 'Testo domanda duplicato'; END IF;
 END IF;
 IF check_code THEN
  IF EXISTS(SELECT 1 FROM public.question_bank q WHERE lower(btrim(q.code))=lower(btrim(NEW.code)) AND q.id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'Codice duplicato'; END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  NEW.k9_version:=OLD.k9_version;
  IF (to_jsonb(NEW)-'updated_at'-'k9_version') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'k9_version') THEN
   INSERT INTO public.k9_question_versions VALUES(OLD.id,OLD.k9_version,to_jsonb(OLD),clock_timestamp(),auth.uid()) ON CONFLICT DO NOTHING;
   NEW.k9_version:=OLD.k9_version+1;
  END IF;
 ELSE NEW.k9_version:=1; END IF;
 IF NEW.variant_number IS NULL OR TG_OP='INSERT' THEN
   family:=public.k9_question_family(NEW.concept_id,NEW.category,NEW.option_a,NEW.option_b,NEW.option_c,NEW.option_d);
   SELECT coalesce(max(q.variant_number),0)+1 INTO NEW.variant_number FROM public.question_bank q WHERE q.discipline=NEW.discipline AND q.id IS DISTINCT FROM NEW.id AND public.k9_question_family(q.concept_id,q.category,q.option_a,q.option_b,q.option_c,q.option_d)=family;
 END IF;
 RETURN NEW;
END $$;
-- Initial variant numbers, no revision of content.
WITH numbered AS (SELECT id,row_number() OVER(PARTITION BY discipline,public.k9_question_family(concept_id,category,option_a,option_b,option_c,option_d) ORDER BY id)::integer AS n FROM public.question_bank) UPDATE public.question_bank q SET variant_number=n.n FROM numbered n WHERE q.id=n.id AND q.variant_number IS NULL;
DROP TRIGGER IF EXISTS k9_bank_version ON public.question_bank;
CREATE TRIGGER k9_bank_version BEFORE INSERT OR UPDATE OR DELETE ON public.question_bank FOR EACH ROW EXECUTE FUNCTION public.k9_bank_version();
CREATE INDEX IF NOT EXISTS k9_bank_disc_id ON public.question_bank(discipline,id);
CREATE OR REPLACE FUNCTION public.k9_bank_page(p_discipline text DEFAULT '',p_category text DEFAULT '',p_active text DEFAULT '',p_search text DEFAULT '',p_validation text DEFAULT '',p_offset integer DEFAULT 0,p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.current_role()='super_admin' OR public.has_role_permission('question_bank'),false) THEN RAISE EXCEPTION 'Banca non autorizzata'; END IF;
 WITH filtered AS (SELECT q.* FROM public.question_bank q WHERE (coalesce(p_discipline,'')='' OR q.discipline=p_discipline) AND (coalesce(p_category,'')='' OR q.category=p_category) AND (coalesce(p_active,'')='' OR q.active::text=p_active) AND (coalesce(p_validation,'')='' OR q.validation_status=p_validation) AND (coalesce(p_search,'')='' OR strpos(lower(concat_ws(' ',q.code,q.question_text,q.category,q.option_a,q.option_b,q.option_c,q.option_d)),lower(trim(p_search)))>0)), page AS (SELECT * FROM filtered ORDER BY discipline,id OFFSET greatest(0,coalesce(p_offset,0)) LIMIT least(500,greatest(1,coalesce(p_limit,50))))
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY discipline,id) FROM page),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.k9_bank_summary() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.current_role()='super_admin' OR public.has_role_permission('question_bank'),false) THEN RAISE EXCEPTION 'Banca non autorizzata'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT discipline,count(*) AS total,count(*) FILTER(WHERE active) AS active,count(DISTINCT public.k9_question_family(concept_id,category,option_a,option_b,option_c,option_d)) FILTER(WHERE active AND difficulty IN ('medio','difficile')) AS families,count(*) FILTER(WHERE active AND difficulty='medio') AS medium,count(*) FILTER(WHERE active AND difficulty='difficile') AS hard,array_agg(DISTINCT category ORDER BY category) AS categories,count(*) FILTER(WHERE validation_status='approvata') AS approved FROM public.question_bank GROUP BY discipline) t),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.k9_bank_audit() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.current_role()='super_admin' OR public.has_role_permission('question_bank'),false) THEN RAISE EXCEPTION 'Banca non autorizzata'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY discipline,code) FROM (SELECT q.discipline,q.code,q.category,q.difficulty,q.validation_status,q.source_reference,
 array_remove(ARRAY[CASE WHEN nullif(btrim(q.explanation),'') IS NULL THEN 'spiegazione mancante' END,CASE WHEN nullif(btrim(q.source_reference),'') IS NULL THEN 'fonte mancante' END,CASE WHEN nullif(btrim(q.question_text),'') IS NULL OR nullif(btrim(q.category),'') IS NULL THEN 'testo/categoria mancante' END,CASE WHEN (SELECT count(DISTINCT lower(regexp_replace(btrim(o),'[[:space:]]+',' ','g'))) FROM unnest(ARRAY[q.option_a,q.option_b,q.option_c,q.option_d]) o WHERE nullif(btrim(o),'') IS NOT NULL)<>4 THEN 'alternative non valide' END,CASE WHEN q.validation_status<>'approvata' THEN 'validazione da completare' END,CASE WHEN count(*) OVER(PARTITION BY q.discipline,regexp_replace(lower(btrim(q.question_text)),'[[:space:]]+',' ','g'))>1 THEN 'testo ripetuto' END,CASE WHEN count(*) OVER(PARTITION BY q.discipline,public.k9_question_family(q.concept_id,q.category,q.option_a,q.option_b,q.option_c,q.option_d))>1 THEN 'famiglia con varianti' END],NULL) AS issues FROM public.question_bank q) t),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.k9_bank_page(text,text,text,text,text,integer,integer),public.k9_bank_summary(),public.k9_bank_audit() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.k9_bank_page(text,text,text,text,text,integer,integer),public.k9_bank_summary(),public.k9_bank_audit() TO authenticated;
-- Esami: sblocco controllato per cambio accesso, senza cambiare timer o risposte.
CREATE OR REPLACE FUNCTION public.k9_release_exam_session(p_assignment uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.current_role() IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Solo Super Amministratore'; END IF;
 UPDATE public.exam_assignments SET k9_auth_session=NULL WHERE id=p_assignment AND status='in_progress';
 IF NOT FOUND THEN RAISE EXCEPTION 'Prova non in corso'; END IF;
 PERFORM public.write_exam_audit(p_assignment,NULL,'session_released','Sessione di prova sbloccata','{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.k9_release_exam_session(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.k9_release_exam_session(uuid) TO authenticated;
-- Credenziali personali: migrazione non distruttiva, password Auth invariate.
INSERT INTO public.student_credentials(student_id,username,login_email,credential_hash,active)
 SELECT p.id,'k9-'||replace(p.id::text,'-',''),u.email,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),p.archived_at IS NULL
 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.role='student' AND u.email IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_credentials c WHERE c.student_id=p.id);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.profiles p WHERE p.role='student' AND NOT EXISTS(SELECT 1 FROM public.student_credentials c WHERE c.student_id=p.id)) THEN RAISE EXCEPTION 'Corsista senza email Auth: migrazione credenziali da verificare'; END IF; END $$;
UPDATE public.student_credentials SET credential_hash=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
UPDATE public.session_candidates SET credential_hash=NULL WHERE credential_hash IS NOT NULL;
-- Conservazione PDF nel DB privato, hash calcolato dal server, stessa transazione del registro.
CREATE TABLE IF NOT EXISTS public.k9_pdf_originals (
 generation_id bigint PRIMARY KEY REFERENCES public.exam_document_generations(id) ON DELETE RESTRICT,
 pdf_bytes bytea NOT NULL CHECK(octet_length(pdf_bytes) BETWEEN 5 AND 10485760)
);
ALTER TABLE public.k9_pdf_originals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.k9_pdf_originals FROM PUBLIC,anon,authenticated;
ALTER TABLE public.exam_documents ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE public.exam_documents ADD COLUMN IF NOT EXISTS revocation_reason text;
CREATE OR REPLACE FUNCTION public.k9_save_pdf(p_assignment_id uuid,p_document_type text,p_document_code text,p_metadata jsonb,p_file_name text,p_pdf_base64 text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE bytes bytea; d public.exam_documents%rowtype; g bigint; sha text; existing_sha text;
BEGIN
 IF auth.uid() IS NULL OR public.current_role() IS NULL THEN RAISE EXCEPTION 'Accesso non autorizzato'; END IF;
 IF length(coalesce(p_pdf_base64,''))>13981016 THEN RAISE EXCEPTION 'PDF superiore a 10 MB'; END IF;
 bytes:=decode(p_pdf_base64,'base64');
 IF bytes IS NULL OR octet_length(bytes)<5 OR octet_length(bytes)>10485760 OR substring(bytes FROM 1 FOR 5)<>convert_to('%PDF-','UTF8') THEN RAISE EXCEPTION 'PDF non valido'; END IF;
 sha:=encode(digest(bytes,'sha256'),'hex');
 PERFORM 1 FROM public.exam_assignments WHERE id=p_assignment_id FOR UPDATE;
 -- Controllo di idoneità e permessi anche se il documento esiste.
 SELECT * INTO d FROM public.exam_documents WHERE assignment_id=p_assignment_id AND document_type=p_document_type;
 IF FOUND THEN
  SELECT f.generation_id INTO g FROM public.k9_pdf_originals f JOIN public.exam_document_generations gen ON gen.id=f.generation_id WHERE gen.exam_document_id=d.id AND gen.generation_number=d.generation_count;
  IF g IS NOT NULL AND d.status='valid' AND nullif(btrim(p_metadata->>'reissue_reason'),'') IS NULL THEN
   RAISE EXCEPTION 'Documento già emesso: scaricare l’originale dall’archivio o motivare la riemissione';
  END IF;
  IF public.current_role() IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Riemissione riservata al Super Amministratore'; END IF;
 END IF;
 SELECT * INTO d FROM public.register_exam_document_traced(p_assignment_id,p_document_type,p_document_code,p_metadata,p_file_name,sha,octet_length(bytes)::bigint);
 SELECT id INTO g FROM public.exam_document_generations WHERE exam_document_id=d.id AND generation_number=d.generation_count;
 INSERT INTO public.k9_pdf_originals VALUES(g,bytes);
 UPDATE public.exam_documents SET revoked_at=NULL,revocation_reason=NULL WHERE id=d.id;
 RETURN jsonb_build_object('document_id',d.id,'generation',d.generation_count,'sha256',sha);
END $$;
CREATE OR REPLACE FUNCTION public.k9_download_pdf(p_document uuid,p_generation integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.exam_documents%rowtype; result jsonb;
BEGIN
 SELECT * INTO d FROM public.exam_documents WHERE id=p_document;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce((public.current_role()='super_admin' OR (public.has_role_permission('document_archive') AND (public.current_role()='vice_admin' OR d.issued_by=auth.uid()))),false) THEN RAISE EXCEPTION 'Documento non accessibile'; END IF;
 SELECT jsonb_build_object('file_name',g.file_name,'base64',encode(f.pdf_bytes,'base64'),'sha256',g.file_sha256,'status',CASE WHEN g.generation_number<>d.generation_count THEN 'superseded' ELSE d.status END) INTO result FROM public.exam_document_generations g JOIN public.k9_pdf_originals f ON f.generation_id=g.id WHERE g.exam_document_id=d.id AND g.generation_number=coalesce(p_generation,d.generation_count);
 IF result IS NULL THEN RAISE EXCEPTION 'Originale non conservato (documento precedente)'; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.k9_revoke_document(p_document uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.exam_documents%rowtype;
BEGIN
 IF public.current_role() IS DISTINCT FROM 'super_admin' OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Solo Super Amministratore; motivazione obbligatoria'; END IF;
 UPDATE public.exam_documents SET status='revoked',revoked_at=clock_timestamp(),revocation_reason=trim(p_reason) WHERE id=p_document AND status='valid' RETURNING * INTO d;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento non valido o già revocato'; END IF;
 PERFORM public.write_exam_audit(d.assignment_id,NULL,'document_revoked','Documento revocato',jsonb_build_object('code',d.document_code,'reason',p_reason));
END $$;
REVOKE ALL ON FUNCTION public.register_exam_document_traced(uuid,text,text,jsonb,text,text,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.k9_save_pdf(uuid,text,text,jsonb,text,text),public.k9_download_pdf(uuid,integer),public.k9_revoke_document(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.k9_save_pdf(uuid,text,text,jsonb,text,text),public.k9_download_pdf(uuid,integer),public.k9_revoke_document(uuid,text) TO authenticated;
-- Riapertura esplicita: revoca attestato precedente, conserva PDF e audit.
CREATE OR REPLACE FUNCTION public.k9_reopen_practical(p_assignment uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.current_role() IS DISTINCT FROM 'super_admin' OR nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Solo Super Amministratore; motivazione obbligatoria'; END IF;
 PERFORM 1 FROM public.exam_assignments WHERE id=p_assignment FOR UPDATE;
 PERFORM set_config('k9.reopening_practical','yes',true);
 UPDATE public.practical_evaluations SET outcome=NULL,completed_at=NULL,evaluator_id=auth.uid() WHERE assignment_id=p_assignment AND completed_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Valutazione non chiusa'; END IF;
 UPDATE public.exam_documents SET status='revoked',revoked_at=clock_timestamp(),revocation_reason=trim(p_reason) WHERE assignment_id=p_assignment AND document_type IN ('certificate','report','candidate_report') AND status='valid';
 PERFORM public.write_exam_audit(p_assignment,NULL,'practice_reopened','Valutazione riaperta',jsonb_build_object('reason',p_reason));
END $$;
REVOKE ALL ON FUNCTION public.k9_reopen_practical(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.k9_reopen_practical(uuid,text) TO authenticated;
-- Statistiche solo esami terminati e di competenza. Errori iniziali e finali separati.
CREATE OR REPLACE FUNCTION public.k9_didactic_stats() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.current_role()='super_admin' OR public.has_role_permission('analytics'),false) THEN RAISE EXCEPTION 'Statistiche non autorizzate'; END IF;
 RETURN (WITH base AS (SELECT e.discipline,q.question_id,q.question_snapshot->>'code' AS code,q.question_snapshot->>'category' AS category,q.question_snapshot->>'question_text' AS question_text,q.is_correct,q.selected_option,q.option_order,(q.question_snapshot->>'correct_option')::int AS correct_option,c.original_option,c.id AS correction_id,a.started_at,q.first_answered_at
 FROM public.exam_assignments a JOIN public.exam_questions q ON q.assignment_id=a.id JOIN public.exam_assignments e ON e.id=q.assignment_id LEFT JOIN public.answer_correction_reports c ON c.assignment_id=q.assignment_id AND c.position=q.position AND c.status='accepted'
 WHERE a.status IN ('submitted','expired') AND (public.current_role() IN ('super_admin','vice_admin') OR a.assigned_by=auth.uid() OR a.evaluator_id=auth.uid())),
 qstats AS (SELECT discipline,question_id,code,category,question_text,count(*) AS uses,count(*) FILTER(WHERE selected_option IS NULL) AS unanswered,count(*) FILTER(WHERE selected_option IS NOT NULL AND is_correct IS FALSE) AS final_errors,count(*) FILTER(WHERE selected_option IS NOT NULL AND option_order[coalesce(original_option,selected_option)+1]<>correct_option) AS initial_errors,count(correction_id) AS retries FROM base GROUP BY discipline,question_id,code,category,question_text),
 cats AS (SELECT discipline,category,sum(uses) AS uses,sum(initial_errors) AS initial_errors,sum(final_errors) AS final_errors,sum(retries) AS retries FROM qstats GROUP BY discipline,category),
 choices AS (SELECT discipline,code,option_order[coalesce(original_option,selected_option)+1] AS original_choice,count(*) AS uses FROM base WHERE selected_option IS NOT NULL AND option_order[coalesce(original_option,selected_option)+1]<>correct_option GROUP BY discipline,code,option_order[coalesce(original_option,selected_option)+1])
 SELECT jsonb_build_object('questions',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM qstats ORDER BY initial_errors DESC,uses DESC LIMIT 100) t),'[]'::jsonb),'categories',coalesce((SELECT jsonb_agg(to_jsonb(cats) ORDER BY initial_errors DESC) FROM cats),'[]'::jsonb),'wrong_choices',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT * FROM choices ORDER BY uses DESC LIMIT 100) t),'[]'::jsonb),'mean_seconds_from_start', (SELECT round(avg(extract(epoch FROM first_answered_at-started_at)),1) FROM base WHERE first_answered_at IS NOT NULL)));
END $$;
REVOKE ALL ON FUNCTION public.k9_didactic_stats() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.k9_didactic_stats() TO authenticated;
-- Atomic deletion of an unstarted course; locks avoid races with exam start.
CREATE OR REPLACE FUNCTION public.k9_delete_course(p_actor uuid,p_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ses public.exam_sessions%rowtype; role_name text;
BEGIN
 SELECT role INTO role_name FROM public.profiles WHERE id=p_actor AND archived_at IS NULL;
 SELECT * INTO ses FROM public.exam_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR role_name IS NULL OR NOT (role_name='super_admin' OR (EXISTS(SELECT 1 FROM public.role_permissions WHERE role=role_name AND (permissions->>'sessions_manage')::boolean IS TRUE) AND (role_name='vice_admin' OR ses.created_by=p_actor))) THEN RAISE EXCEPTION 'Corso non accessibile'; END IF;
 PERFORM 1 FROM public.exam_assignments WHERE session_id=p_session ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.exam_assignments WHERE session_id=p_session AND status<>'assigned') THEN RAISE EXCEPTION 'Corso con prove iniziate: usare Archivia'; END IF;
 DELETE FROM public.exam_assignments WHERE session_id=p_session;
 DELETE FROM public.exam_sessions WHERE id=p_session;
END $$;
REVOKE ALL ON FUNCTION public.k9_delete_course(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.k9_delete_course(uuid,uuid) TO service_role;
REVOKE DELETE ON public.practical_evaluations FROM PUBLIC,anon,authenticated;
-- Chiusura delle prove scadute: RPC server richiamata dalle operazioni, senza job pianificato.

CREATE OR REPLACE FUNCTION public.k9_delete_exam(p_actor uuid,p_assignment uuid,p_confirm boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex public.exam_assignments%rowtype; progressed boolean; n integer; details jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='super_admin' AND archived_at IS NULL) THEN RAISE EXCEPTION 'Solo Super Amministratore'; END IF;
 SELECT * INTO ex FROM public.exam_assignments WHERE id=p_assignment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Esame non trovato'; END IF;
 IF EXISTS(SELECT 1 FROM public.exam_document_generations WHERE assignment_id=p_assignment) OR EXISTS(SELECT 1 FROM public.exam_documents WHERE assignment_id=p_assignment) THEN RAISE EXCEPTION 'Esame con documenti emessi: conservare il fascicolo, revocare se necessario'; END IF;
 progressed:=ex.status<>'assigned' OR ex.started_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.practical_evaluations WHERE assignment_id=p_assignment);
 SELECT count(*) INTO n FROM public.exam_questions WHERE assignment_id=p_assignment;
 details:=jsonb_build_array('Domande/risposte: '||n, 'Stato: '||ex.status);
 IF progressed AND p_confirm IS NOT TRUE THEN RETURN jsonb_build_object('requires_confirmation',true,'details',details); END IF;
 DELETE FROM public.exam_assignments WHERE id=p_assignment;
 RETURN jsonb_build_object('deleted',true,'assignment_id',p_assignment);
END $$;
REVOKE ALL ON FUNCTION public.k9_delete_exam(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.k9_delete_exam(uuid,uuid,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.k9_protect_session_archive() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.archived_at IS NOT NULL OR NEW.active IS FALSE) AND (NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.active IS DISTINCT FROM OLD.active) THEN
  PERFORM 1 FROM public.exam_assignments WHERE session_id=OLD.id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.exam_assignments WHERE session_id=OLD.id AND status IN ('assigned','in_progress')) THEN RAISE EXCEPTION 'Concludere o eliminare le prove aperte prima di archiviare il corso'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS k9_protect_session_archive ON public.exam_sessions;
CREATE TRIGGER k9_protect_session_archive BEFORE UPDATE ON public.exam_sessions FOR EACH ROW EXECUTE FUNCTION public.k9_protect_session_archive();
CREATE OR REPLACE FUNCTION public.k9_owns_course(p_session uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.exam_sessions WHERE id=p_session AND created_by=auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.k9_is_course_member(p_session uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.session_candidates WHERE session_id=p_session AND auth_user_id=auth.uid() AND active) $$;
REVOKE ALL ON FUNCTION public.k9_owns_course(uuid),public.k9_is_course_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.k9_owns_course(uuid),public.k9_is_course_member(uuid) TO authenticated;
DROP POLICY IF EXISTS sessions_staff_read ON public.exam_sessions;
DROP POLICY IF EXISTS sessions_admin_all ON public.exam_sessions;
CREATE POLICY sessions_staff_read ON public.exam_sessions FOR SELECT TO authenticated USING(public.current_role()='super_admin' OR ((public.has_role_permission('sessions_manage') OR public.has_role_permission('candidates_create')) AND (public.current_role()='vice_admin' OR created_by=auth.uid())) OR (public.current_role()='student' AND public.k9_is_course_member(id)));
CREATE POLICY sessions_admin_all ON public.exam_sessions FOR UPDATE TO authenticated USING(public.has_role_permission('sessions_manage') AND (public.current_role() IN ('super_admin','vice_admin') OR created_by=auth.uid())) WITH CHECK(public.has_role_permission('sessions_manage') AND (public.current_role() IN ('super_admin','vice_admin') OR created_by=auth.uid()));
REVOKE INSERT,DELETE ON public.exam_sessions FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.session_candidates FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS candidates_read ON public.session_candidates;
CREATE POLICY candidates_read ON public.session_candidates FOR SELECT TO authenticated USING(public.current_role()='super_admin' OR (public.current_role()='student' AND auth_user_id=auth.uid()) OR ((public.has_role_permission('sessions_manage') OR public.has_role_permission('candidates_create')) AND (public.current_role()='vice_admin' OR public.k9_owns_course(session_id))));
-- Restrict direct session column changes; course settings are fixed once exams are prepared.
REVOKE UPDATE ON public.exam_sessions FROM PUBLIC,anon,authenticated;
GRANT UPDATE(archived_at,active,updated_at) ON public.exam_sessions TO authenticated;
-- Existing RLS for student access must also reject archived profiles; students never read snapshots.
DROP POLICY IF EXISTS assignments_read ON public.exam_assignments;
CREATE POLICY assignments_read ON public.exam_assignments FOR SELECT TO authenticated USING((public.current_role()='student' AND student_id=auth.uid()) OR public.current_role()='super_admin' OR ((public.has_role_permission('exam_management') OR public.has_role_permission('exam_history') OR public.has_role_permission('analytics') OR public.has_role_permission('documents_view')) AND (public.current_role()='vice_admin' OR assigned_by=auth.uid() OR evaluator_id=auth.uid())));
CREATE OR REPLACE FUNCTION public.k9_protect_profile_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL AND (OLD.role IN ('student','super_admin') OR NEW.role IN ('student','super_admin')) THEN RAISE EXCEPTION 'Ruolo protetto: usare la procedura di creazione account'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS k9_protect_profile_role ON public.profiles;
CREATE TRIGGER k9_protect_profile_role BEFORE UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.k9_protect_profile_role();
-- Audit writer is internal, never a client RPC.
REVOKE ALL ON FUNCTION public.write_exam_audit(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
-- Internal legacy document listing no longer used by the client.
REVOKE ALL ON FUNCTION public.list_exam_documents() FROM PUBLIC,anon,authenticated;
-- Avviso non distruttivo: non cambia in automatico la configurazione del docente.
-- Fino a nuovi quesiti Detection su concetti diversi, una prova Detection può
-- avere al massimo 10 domande medio/difficili distinte.
COMMIT;
