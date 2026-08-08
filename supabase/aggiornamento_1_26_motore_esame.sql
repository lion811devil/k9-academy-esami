-- K9 Academy Esami — Release 1.26 MOTORE ESAME
-- Obiettivi:
-- 1) stessa scheda e stesso ordine risposte dopo refresh/chiusura;
-- 2) ordine A/B/C/D casuale e persistente per ogni domanda assegnata;
-- 3) correzione automatica coerente con l'ordine visualizzato;
-- 4) question_id disponibile al client per la segnalazione errore di pigiatura;
-- 5) nessuna modifica alla banca domande.

begin;

-- Compatibilità con la funzione "errore di pigiatura".
create table if not exists public.answer_correction_reports(
 id bigint generated always as identity primary key,
 assignment_id uuid not null references public.exam_assignments(id) on delete cascade,
 position integer not null,
 question_id bigint not null references public.question_bank(id),
 original_option smallint not null check(original_option between 0 and 3),
 intended_option smallint not null check(intended_option between 0 and 3),
 status text not null default 'reported' check(status in('reported','accepted','rejected')),
 reported_by uuid not null references public.profiles(id),
 reported_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 unique(assignment_id,position)
);

alter table public.answer_correction_reports enable row level security;

drop policy if exists correction_student_insert on public.answer_correction_reports;
create policy correction_student_insert on public.answer_correction_reports
 for insert to authenticated
 with check(reported_by=auth.uid());

drop policy if exists correction_student_update on public.answer_correction_reports;
create policy correction_student_update on public.answer_correction_reports
 for update to authenticated
 using(reported_by=auth.uid())
 with check(reported_by=auth.uid());

drop policy if exists correction_read on public.answer_correction_reports;
create policy correction_read on public.answer_correction_reports
 for select to authenticated
 using(reported_by=auth.uid() or public.current_role() in('teacher','vice_admin','super_admin'));

grant select,insert,update on public.answer_correction_reports to authenticated;
grant usage,select on sequence public.answer_correction_reports_id_seq to authenticated;

-- L'ordine delle quattro risposte appartiene alla singola scheda e viene salvato sul server.
alter table public.exam_questions
 add column if not exists option_order smallint[] not null default array[0,1,2,3]::smallint[];

update public.exam_questions
set option_order=array[0,1,2,3]::smallint[]
where option_order is null
   or array_length(option_order,1)<>4;

do $$
begin
 if not exists(
   select 1
   from pg_constraint
   where conname='exam_questions_option_order_valid'
     and conrelid='public.exam_questions'::regclass
 ) then
   alter table public.exam_questions
   add constraint exam_questions_option_order_valid
   check (
     array_length(option_order,1)=4
     and option_order @> array[0,1,2,3]::smallint[]
     and array[0,1,2,3]::smallint[] @> option_order
   );
 end if;
end $$;

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

   -- Una nuova composizione viene creata SOLO al primo avvio.
   -- Le righe restano in exam_questions, quindi refresh e riapertura recuperano la stessa prova.
   insert into public.exam_questions(assignment_id,position,question_id,option_order)
   with ranked as (
     select
       id,
       category,
       row_number() over(partition by category order by random()) as category_rank
     from public.question_bank
     where active=true
       and discipline=ex.discipline
   ),
   picked as (
     select id
     from ranked
     order by category_rank, random()
     limit ex.question_count
   ),
   shuffled as (
     select id,
            row_number() over(order by random())::integer as position
     from picked
   )
   select
     ex.id,
     s.position,
     s.id,
     array(
       select v::smallint
       from unnest(array[0,1,2,3]::smallint[]) as v
       where s.id=s.id
       order by random()
     )::smallint[]
   from shuffled s;

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
     select jsonb_agg(
       jsonb_build_object(
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
         'is_correct',eq.is_correct,
         'correct_option',
           case
             when eq.selected_option is null then null
             else array_position(eq.option_order,qb.correct_option::smallint)-1
           end,
         'explanation',
           case when eq.selected_option is null then null else qb.explanation end
       )
       order by eq.position
     )
     from public.exam_questions eq
     join public.question_bank qb on qb.id=eq.question_id
     where eq.assignment_id=ex.id
   )
 );
end $$;

create or replace function public.answer_exam_question(
 p_assignment_id uuid,
 p_position integer,
 p_selected_option integer
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 ex public.exam_assignments%rowtype;
 eq public.exam_questions%rowtype;
 q public.question_bank%rowtype;
 original_selected smallint;
 displayed_correct smallint;
 ok boolean;
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
   perform public.finalize_exam(ex.id,true);
   raise exception 'Tempo scaduto';
 end if;

 select * into eq
 from public.exam_questions
 where assignment_id=p_assignment_id
   and position=p_position
 for update;

 if not found then
   raise exception 'Domanda non disponibile';
 end if;

 if eq.selected_option is not null then
   raise exception 'Risposta già registrata';
 end if;

 select * into q
 from public.question_bank
 where id=eq.question_id;

 original_selected:=eq.option_order[p_selected_option+1];
 displayed_correct:=array_position(eq.option_order,q.correct_option::smallint)-1;
 ok:=(original_selected=q.correct_option);

 update public.exam_questions
 set selected_option=p_selected_option,
     is_correct=ok,
     answered_at=now()
 where assignment_id=p_assignment_id
   and position=p_position;

 update public.exam_assignments
 set answered_questions=(
       select count(*)
       from public.exam_questions
       where assignment_id=p_assignment_id
         and selected_option is not null
     ),
     correct_answers=(
       select count(*)
       from public.exam_questions
       where assignment_id=p_assignment_id
         and is_correct=true
     )
 where id=p_assignment_id;

 return jsonb_build_object(
   'is_correct',ok,
   'correct_option',displayed_correct,
   'explanation',q.explanation
 );
end $$;

grant execute on function public.start_assigned_exam(uuid) to authenticated;
grant execute on function public.answer_exam_question(uuid,integer,integer) to authenticated;

commit;

-- Controlli non distruttivi
select column_name,data_type
from information_schema.columns
where table_schema='public'
  and table_name='exam_questions'
  and column_name='option_order';

select discipline,count(*) as totale
from public.question_bank
group by discipline
order by discipline;
