-- K9 Academy Esami 2.2.5 — Estrazione pesata, non distruttiva.
-- NON e' un aggiornamento alla banca dati: nessuna domanda viene cambiata o attivata forzatamente.
-- L'estrazione considera le domande ATTIVE: priorita' a medie/difficili (obiettivo 80%),
-- facili fino al 20% quando disponibili, con ripiego se mancano famiglie sufficienti.
-- Si applica SOLTANTO alle prove preparate dopo il RUN.
-- Eseguire UNA VOLTA in Supabase SQL Editor, dopo un backup dello schema.
BEGIN;

DO $guard$
BEGIN
 IF to_regprocedure('public.prepare_exam_questions(uuid)') IS NULL
   OR to_regprocedure('public.k9_shuffle_options()') IS NULL
   OR to_regprocedure('public.k9_question_family(text,text,text,text,text,text)') IS NULL
   OR to_regprocedure('public.k9_bank_summary()') IS NULL
   OR to_regclass('public.exam_questions') IS NULL
   OR NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='exam_questions' AND column_name='question_snapshot')
 THEN
   RAISE EXCEPTION 'Schema incompatibile: verificare che aggiornamento 2.2.1 sia gia'' installato. Nessuna modifica applicata.';
 END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.prepare_exam_questions(p_assignment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ex public.exam_assignments%rowtype;
  existing_count integer;
  inserted_count integer;
  eligible_families integer;
BEGIN
  SELECT * INTO ex FROM public.exam_assignments
  WHERE id=p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assegnazione non trovata'; END IF;
  IF ex.status<>'assigned' THEN RAISE EXCEPTION 'La prova non e'' piu'' preparabile'; END IF;

  SELECT count(*) INTO existing_count FROM public.exam_questions
  WHERE assignment_id=ex.id;
  -- Non modificare la composizione delle prove gia' assegnate.
  IF existing_count>0 THEN
    IF existing_count<>ex.question_count THEN RAISE EXCEPTION 'Composizione prova incompleta'; END IF;
    RETURN existing_count;
  END IF;

  SELECT count(DISTINCT public.k9_question_family(q.concept_id,q.category,
    q.option_a,q.option_b,q.option_c,q.option_d)) INTO eligible_families
  FROM public.question_bank q
  WHERE q.active=true AND q.discipline=ex.discipline
    AND q.difficulty IN ('facile','medio','difficile');
  IF eligible_families < ex.question_count THEN
    RAISE EXCEPTION 'Esame %: richieste % domande, disponibili solo % famiglie didattiche attive distinte (facili, medie e difficili).',
      ex.discipline,ex.question_count,eligible_families;
  END IF;

  -- Una sola variante per concetto didattico. La scelta delle famiglie
  -- precede la scelta della variante e la mescolatura delle risposte.
  INSERT INTO public.exam_questions
    (assignment_id,position,question_id,option_order,question_snapshot)
  WITH candidates AS (
    SELECT q.id,q.difficulty,
      regexp_replace(lower(btrim(q.question_text)),'[[:space:]]+',' ','g') AS stem_key,
      public.k9_question_family(q.concept_id,q.category,
        q.option_a,q.option_b,q.option_c,q.option_d) AS family_key
    FROM public.question_bank q
    WHERE q.active=true AND q.discipline=ex.discipline
      AND q.difficulty IN ('facile','medio','difficile')
  ), distinct_stem AS (
    SELECT c.*,
      row_number() OVER(PARTITION BY c.stem_key ORDER BY
        CASE c.difficulty WHEN 'difficile' THEN 0 WHEN 'medio' THEN 1 ELSE 2 END,
        random()) AS stem_rank
    FROM candidates c
  ), pool AS (
    SELECT c.family_key,
      bool_or(c.difficulty='difficile') AS has_hard,
      bool_or(c.difficulty='medio') AS has_medium,
      bool_or(c.difficulty='facile') AS has_easy
    FROM distinct_stem c WHERE c.stem_rank=1
    GROUP BY c.family_key
  ), priority_selected AS (
    -- Prima almeno circa l'80% medio/difficile, quando la banca lo permette.
    SELECT p.family_key,
      CASE WHEN p.has_hard AND (NOT p.has_medium OR random()<0.5)
        THEN 'difficile' ELSE 'medio' END::text AS wanted
    FROM pool p WHERE p.has_medium OR p.has_hard
    ORDER BY random()
    LIMIT ceil(ex.question_count*0.80)::integer
  ), easy_selected AS (
    SELECT p.family_key,'facile'::text AS wanted
    FROM pool p
    WHERE p.has_easy AND NOT EXISTS (
      SELECT 1 FROM priority_selected x WHERE x.family_key=p.family_key
    )
    ORDER BY random()
    LIMIT greatest(0,ex.question_count-(SELECT count(*) FROM priority_selected))
  ), fill_selected AS (
    -- Famiglie mancanti: ripiegare prima su medie/difficili, poi facili.
    SELECT p.family_key,
      CASE WHEN p.has_hard AND (NOT p.has_medium OR random()<0.5)
             THEN 'difficile'
           WHEN p.has_medium THEN 'medio'
           ELSE 'facile' END::text AS wanted
    FROM pool p
    WHERE NOT EXISTS (SELECT 1 FROM priority_selected x WHERE x.family_key=p.family_key)
      AND NOT EXISTS (SELECT 1 FROM easy_selected x WHERE x.family_key=p.family_key)
    ORDER BY CASE WHEN p.has_medium OR p.has_hard THEN 0 ELSE 1 END, random()
    LIMIT greatest(0,ex.question_count
      -(SELECT count(*) FROM priority_selected)
      -(SELECT count(*) FROM easy_selected))
  ), wanted_families AS (
    SELECT family_key,wanted FROM priority_selected
    UNION ALL SELECT family_key,wanted FROM easy_selected
    UNION ALL SELECT family_key,wanted FROM fill_selected
  ), candidate_rows AS (
    SELECT c.id,c.family_key,
      row_number() OVER(PARTITION BY c.family_key
        ORDER BY CASE WHEN c.difficulty=w.wanted THEN 0 ELSE 1 END,random()) AS choice_rank
    FROM distinct_stem c JOIN wanted_families w ON w.family_key=c.family_key
    WHERE c.stem_rank=1
  ), chosen AS (
    SELECT c.id,row_number() OVER(ORDER BY random())::integer AS position
    FROM candidate_rows c WHERE c.choice_rank=1
  )
  SELECT ex.id,c.position,c.id,
    public.k9_shuffle_options(),
    jsonb_build_object(
      'code',q.code,'category',q.category,'difficulty',q.difficulty,
      'question_text',q.question_text,
      'options',jsonb_build_array(q.option_a,q.option_b,q.option_c,q.option_d),
      'correct_option',q.correct_option,'explanation',q.explanation,
      'concept_id',q.concept_id,'source_reference',q.source_reference,
      'version',q.k9_version,'validation_status',q.validation_status)
  FROM chosen c JOIN public.question_bank q ON q.id=c.id;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count<>ex.question_count THEN
    RAISE EXCEPTION 'Prova non composta: % concetti distinti inseribili su % richiesti; controllare i duplicati nella banca.',
      inserted_count,ex.question_count;
  END IF;
  RETURN inserted_count;
END
$function$;

-- Il riepilogo amministrativo deve contare anche le famiglie facili ammissibili.
-- Non modifica il livello, lo stato o il contenuto delle domande.
CREATE OR REPLACE FUNCTION public.k9_bank_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path=public
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(
   public.current_role()='super_admin' OR public.has_role_permission('question_bank'),false
 ) THEN RAISE EXCEPTION 'Banca non autorizzata'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (
   SELECT discipline,count(*) AS total,
     count(*) FILTER(WHERE active) AS active,
     count(DISTINCT public.k9_question_family(concept_id,category,
       option_a,option_b,option_c,option_d)) FILTER(
       WHERE active AND difficulty IN ('facile','medio','difficile')) AS families,
     count(*) FILTER(WHERE active AND difficulty='facile') AS easy,
     count(*) FILTER(WHERE active AND difficulty='medio') AS medium,
     count(*) FILTER(WHERE active AND difficulty='difficile') AS hard,
     array_agg(DISTINCT category ORDER BY category) AS categories,
     count(*) FILTER(WHERE validation_status='approvata') AS approved
   FROM public.question_bank GROUP BY discipline
 ) t),'[]'::jsonb);
END
$function$;

-- Conservazione del controllo: RPC interna accessibile solo al service role.
REVOKE ALL ON FUNCTION public.prepare_exam_questions(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_exam_questions(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.k9_bank_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.k9_bank_summary() TO authenticated;
COMMIT;

-- Verifica SOLO LETTURA dopo l'esecuzione, eseguibile separatamente:
-- SELECT discipline,difficulty,count(*) AS attive
-- FROM public.question_bank WHERE active
-- GROUP BY discipline,difficulty ORDER BY discipline,difficulty;
