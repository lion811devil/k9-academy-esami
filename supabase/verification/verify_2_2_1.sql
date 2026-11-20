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

-- Atteso: 0 snapshot mancanti; 24 permutazioni diverse; false per tutti i permessi diretti.
SELECT count(*) AS snapshot_mancanti FROM public.exam_questions WHERE question_snapshot IS NULL;
SELECT count(DISTINCT public.k9_shuffle_options()) AS permutazioni_su_2400 FROM generate_series(1,2400);
SELECT has_table_privilege('authenticated','public.exam_questions','SELECT') AS lettura_soluzioni,
 has_table_privilege('authenticated','public.k9_pdf_originals','SELECT') AS lettura_pdf_diretta,
 has_table_privilege('authenticated','public.exam_assignments','UPDATE') AS modifica_esame_diretta,
 has_function_privilege('authenticated','public.register_exam_document(uuid,text,text,jsonb)','EXECUTE') AS registrazione_legacy,
 has_function_privilege('anon','public.k9_save_pdf(uuid,text,text,jsonb,text,text)','EXECUTE') AS pdf_anonimo;
SELECT discipline,count(*) AS totale,count(DISTINCT public.k9_question_family(concept_id,category,option_a,option_b,option_c,option_d)) FILTER (WHERE active) AS famiglie_attive,
 count(*) FILTER (WHERE variant_number IS NULL) AS varianti_senza_numero,
 count(*) FILTER (WHERE validation_status='approvata') AS approvate FROM public.question_bank GROUP BY discipline ORDER BY discipline;
SELECT count(*) AS hash_legacy_sessione_non_rimossi FROM public.session_candidates WHERE credential_hash IS NOT NULL;
SELECT count(*) AS originali_pdf,coalesce(sum(octet_length(pdf_bytes)),0) AS byte_pdf FROM public.k9_pdf_originals;
SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('k9_bank_page','k9_bank_summary','k9_bank_audit','k9_save_pdf','k9_download_pdf','k9_revoke_document','k9_didactic_stats','k9_release_exam_session','k9_expire_due_exams','k9_reopen_practical','k9_delete_exam','k9_create_course_atomic') ORDER BY proname;

-- Le domande facili preesistenti non vengono cancellate, ma non sono eleggibili.
SELECT discipline,
 COUNT(*) FILTER(WHERE active AND difficulty='medio') AS medie_attive,
 COUNT(*) FILTER(WHERE active AND difficulty='difficile') AS difficili_attive,
 COUNT(*) FILTER(WHERE active AND difficulty='facile') AS facili_escluse,
 COUNT(DISTINCT public.k9_question_family(concept_id,category,option_a,option_b,option_c,option_d)) FILTER (WHERE active AND difficulty IN ('medio','difficile')) AS famiglie_ammissibili
FROM public.question_bank GROUP BY discipline ORDER BY discipline;

-- Capacità reale della banca: un questionario non può superare le famiglie riconosciute.
SELECT discipline, COUNT(*) FILTER (WHERE active AND difficulty IN ('medio','difficile')) AS domande_ammissibili,
 COUNT(DISTINCT public.k9_question_family(concept_id,category,option_a,option_b,option_c,option_d)) FILTER (WHERE active AND difficulty IN ('medio','difficile')) AS famiglie_ammissibili
FROM public.question_bank GROUP BY discipline ORDER BY discipline;
