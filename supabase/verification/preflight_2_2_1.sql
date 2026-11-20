-- Solo lettura: confrontare i risultati prima e dopo la migrazione.
SELECT discipline,count(*) AS totale,count(*) FILTER (WHERE active) AS attive,
 md5(string_agg(md5(jsonb_build_array(id,code,category,difficulty,question_text,option_a,option_b,option_c,option_d,correct_option,explanation,active)::text),'' ORDER BY id)) AS impronta_contenuti
 FROM public.question_bank GROUP BY discipline ORDER BY discipline;
SELECT status,count(*) FROM public.exam_assignments GROUP BY status ORDER BY status;
SELECT count(*) AS corsisti_senza_credenziali_personali FROM public.profiles p WHERE p.role='student' AND NOT EXISTS(SELECT 1 FROM public.student_credentials c WHERE c.student_id=p.id);
SELECT to_regclass('public.exam_document_generations') IS NOT NULL AS registro_presente,
 to_regprocedure('public.prepare_exam_questions(uuid)') IS NOT NULL AS motore_presente,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_questions' AND column_name='question_snapshot') AS snapshot_presente,
 EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') AS cron_attivo;

-- Distribuzione effettiva per livello: NON attribuire la difficoltà automaticamente.
SELECT discipline,difficulty,COUNT(*) AS totale,COUNT(*) FILTER(WHERE active) AS attive
FROM public.question_bank GROUP BY discipline,difficulty ORDER BY discipline,difficulty;

-- Prima della migrazione: stima dei concetti usando categoria e alternative.
-- Questa query non richiede le nuove funzioni SQL.
WITH candidate AS (
 SELECT discipline,active,difficulty,lower(btrim(category)) AS category_key,
  (SELECT string_agg(regexp_replace(lower(btrim(o)), '[[:space:]]+', ' ', 'g'), '|' ORDER BY regexp_replace(lower(btrim(o)), '[[:space:]]+', ' ', 'g'))
   FROM unnest(ARRAY[option_a,option_b,option_c,option_d]) AS x(o)) AS answer_key
 FROM public.question_bank
)
SELECT discipline,
 count(*) FILTER(WHERE active AND difficulty IN ('medio','difficile')) AS ammissibili,
 count(DISTINCT (category_key,answer_key)) FILTER(WHERE active AND difficulty IN ('medio','difficile')) AS famiglie_stimate
FROM candidate GROUP BY discipline ORDER BY discipline;
