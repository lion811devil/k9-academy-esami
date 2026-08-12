-- K9 ACADEMY ESAMI RELEASE 1.22 - SCHEMA COMPLETO
-- Eseguire una sola volta su un nuovo progetto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 email text, full_name text,
 role text not null default 'student' check(role in('student','teacher','examiner','vice_admin','super_admin')),
 created_at timestamptz default now(), updated_at timestamptz default now(), archived_at timestamptz);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,email,full_name,role) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),'student') on conflict(id) do update set email=excluded.email; return new; end$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
insert into public.profiles(id,email,full_name,role) select id,email,coalesce(raw_user_meta_data->>'full_name',''),'student' from auth.users on conflict(id) do nothing;

create table if not exists public.exam_settings(
 discipline text primary key check(discipline in('dogsitter','mantrailing','hrdd','detection')),
 question_count integer not null default 40 check(question_count between 1 and 200),
 duration_minutes integer not null default 45 check(duration_minutes between 1 and 300),
 pass_percentage integer not null default 60 check(pass_percentage between 1 and 100),
 updated_by uuid references public.profiles(id),updated_at timestamptz default now());
insert into public.exam_settings(discipline) values('dogsitter'),('mantrailing'),('hrdd'),('detection') on conflict(discipline) do nothing;

create table if not exists public.question_bank(
 id bigint generated always as identity primary key,code text not null unique,
 discipline text not null check(discipline in('dogsitter','mantrailing','hrdd','detection')),
 category text not null,difficulty text not null check(difficulty in('facile','medio','difficile')),
 question_text text not null,option_a text not null,option_b text not null,option_c text not null,option_d text not null,
 correct_option smallint not null check(correct_option between 0 and 3),explanation text,active boolean default true,
 created_at timestamptz default now(),updated_at timestamptz default now(),unique(discipline,question_text));


-- Viste logiche separate: ogni vista contiene esclusivamente la propria disciplina.
create or replace view public.questions_dogsitter with (security_invoker=true) as
select * from public.question_bank where discipline='dogsitter';

create or replace view public.questions_mantrailing with (security_invoker=true) as
select * from public.question_bank where discipline='mantrailing';

create or replace view public.questions_hrdd with (security_invoker=true) as
select * from public.question_bank where discipline='hrdd';

create or replace view public.questions_detection with (security_invoker=true) as
select * from public.question_bank where discipline='detection';

create or replace view public.question_bank_stats with (security_invoker=true) as
select discipline,
       count(*)::integer as total_questions,
       count(*) filter(where active)::integer as active_questions,
       count(distinct category)::integer as categories
from public.question_bank
group by discipline;

create table if not exists public.exam_assignments(
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles(id) on delete cascade,
 assigned_by uuid not null references public.profiles(id),evaluator_id uuid references public.profiles(id),discipline text not null check(discipline in('dogsitter','mantrailing','hrdd','detection')),
 question_count integer not null check(question_count between 1 and 200),duration_minutes integer not null check(duration_minutes between 1 and 300),
 pass_percentage integer not null check(pass_percentage between 1 and 100),notes text,status text not null default 'assigned' check(status in('assigned','in_progress','submitted','expired','cancelled')),
 assigned_at timestamptz default now(),available_from timestamptz default now(),started_at timestamptz,ends_at timestamptz,submitted_at timestamptz,
 correct_answers integer default 0,answered_questions integer default 0,score_percentage numeric(5,2) default 0,passed boolean);
create unique index if not exists one_open_assignment_per_student on public.exam_assignments(student_id) where status in('assigned','in_progress');

create table if not exists public.exam_questions(
 assignment_id uuid references public.exam_assignments(id) on delete cascade,position integer not null,
 question_id bigint references public.question_bank(id),
 option_order smallint[] not null default array[0,1,2,3]::smallint[],
 selected_option smallint check(selected_option between 0 and 3),is_correct boolean,answered_at timestamptz,
 primary key(assignment_id,position),unique(assignment_id,question_id),
 constraint exam_questions_option_order_valid check(
   array_length(option_order,1)=4
   and option_order @> array[0,1,2,3]::smallint[]
   and array[0,1,2,3]::smallint[] @> option_order
 ));


-- Vincolo forte: una domanda può essere collegata solo a un esame della stessa disciplina.
create or replace function public.enforce_exam_question_discipline()
returns trigger language plpgsql set search_path=public as $$
declare exam_discipline text; question_discipline text;
begin
  select discipline into exam_discipline from public.exam_assignments where id=new.assignment_id;
  select discipline into question_discipline from public.question_bank where id=new.question_id;
  if exam_discipline is null or question_discipline is null then
    raise exception 'Esame o domanda non disponibile';
  end if;
  if exam_discipline <> question_discipline then
    raise exception 'La domanda % appartiene a %, ma l’esame è %',
      new.question_id, question_discipline, exam_discipline;
  end if;
  return new;
end $$;

drop trigger if exists trg_exam_question_discipline on public.exam_questions;
create trigger trg_exam_question_discipline
before insert or update of question_id,assignment_id on public.exam_questions
for each row execute function public.enforce_exam_question_discipline();

create table if not exists public.practical_evaluations(
 id uuid primary key default gen_random_uuid(),assignment_id uuid unique references public.exam_assignments(id) on delete cascade,
 evaluator_id uuid not null references public.profiles(id),discipline text not null,
 criteria jsonb not null default '[]'::jsonb,
 professional_criteria jsonb not null default '[]'::jsonb,
 practical_score integer default 0 check(practical_score between 0 and 50),
 professional_score integer default 0 check(professional_score between 0 and 20),
 outcome text check(outcome is null or outcome in('idoneo','non_idoneo','da_rivedere')),
 components jsonb not null default '[]'::jsonb,
 notes text,completed_at timestamptz default now());

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


create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$select case when archived_at is null then role else null end from public.profiles where id=auth.uid()$$;

create or replace function public.assign_exam(p_student_id uuid,p_discipline text,p_question_count integer,p_duration_minutes integer,p_pass_percentage integer,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$declare new_id uuid;
begin
 if public.current_role() not in('teacher','super_admin') then raise exception 'Non autorizzato'; end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student' and archived_at is null) then raise exception 'Corsista non valido o archiviato'; end if;
 if p_discipline not in('dogsitter','mantrailing','hrdd','detection') then raise exception 'Disciplina non valida'; end if;
 if exists(select 1 from public.exam_assignments where student_id=p_student_id and status in('assigned','in_progress')) then raise exception 'Il corsista ha già un esame aperto'; end if;
 if (select count(*) from public.question_bank where active and discipline=p_discipline) < p_question_count then
   raise exception 'Domande attive insufficienti per la disciplina selezionata';
 end if;
 insert into public.exam_assignments(student_id,assigned_by,discipline,question_count,duration_minutes,pass_percentage,notes)
 values(p_student_id,auth.uid(),p_discipline,p_question_count,p_duration_minutes,p_pass_percentage,p_notes) returning id into new_id;
 return new_id; end$$;

create or replace function public.get_my_assigned_exam()
returns jsonb language plpgsql security definer set search_path=public as $$declare ex public.exam_assignments%rowtype;
begin
 if public.current_role()<>'student' then raise exception 'Riservato al Corsista'; end if;
 select * into ex from public.exam_assignments where student_id=auth.uid() and status in('assigned','in_progress') order by assigned_at desc limit 1;
 if not found then return null; end if;
 if ex.status='in_progress' and now()>=ex.ends_at then perform public.finalize_exam(ex.id,true); select * into ex from public.exam_assignments where id=ex.id; end if;
 return jsonb_build_object('id',ex.id,'discipline',ex.discipline,'question_count',ex.question_count,'duration_minutes',ex.duration_minutes,'pass_percentage',ex.pass_percentage,'notes',ex.notes,'status',ex.status,'assigned_at',ex.assigned_at,'started_at',ex.started_at,'ends_at',ex.ends_at,'answered_questions',ex.answered_questions);
end$$;

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



create or replace function public.finalize_exam(p_assignment_id uuid,p_expired boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$declare ex public.exam_assignments%rowtype;c integer;a integer;pct numeric(5,2);
begin
 select * into ex from public.exam_assignments where id=p_assignment_id for update;
 if not found then raise exception 'Esame non disponibile'; end if;
 if ex.student_id<>auth.uid() and public.current_role() not in('teacher','super_admin') then raise exception 'Non autorizzato'; end if;
 if ex.status<>'in_progress' then return jsonb_build_object('status',ex.status,'score_percentage',ex.score_percentage,'passed',ex.passed); end if;
 select count(*) filter(where is_correct=true),count(*) filter(where selected_option is not null) into c,a from public.exam_questions where assignment_id=p_assignment_id;
 pct:=round(c::numeric/greatest(ex.question_count,1)*100,2);
 update public.exam_assignments set status=case when p_expired or now()>=ends_at then'expired'else'submitted'end,submitted_at=now(),correct_answers=c,answered_questions=a,score_percentage=pct,passed=(pct>=pass_percentage) where id=p_assignment_id returning * into ex;
 return jsonb_build_object('status',ex.status,'discipline',ex.discipline,'correct_answers',c,'answered_questions',a,'question_count',ex.question_count,'score_percentage',pct,'passed',ex.passed);end$$;


create or replace function public.set_exam_evaluator(p_assignment_id uuid,p_evaluator_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 if p_evaluator_id is not null and not exists(select 1 from public.profiles where id=p_evaluator_id and role in('examiner','teacher')) then
   raise exception 'Esaminatore non valido';
 end if;
 update public.exam_assignments set evaluator_id=p_evaluator_id where id=p_assignment_id;
 if not found then raise exception 'Esame non disponibile'; end if;
end$$;

create or replace view public.exam_overview with(security_invoker=true) as
select
 e.*,
 s.full_name student_name,
 s.email student_email,
 a.full_name assigned_by_name,
 ev.full_name evaluator_name,
 ev.email evaluator_email,
 p.criteria practical_criteria,
 p.professional_criteria,
 p.practical_score,
 p.professional_score,
 p.outcome practical_outcome,
 p.components practical_components,
 p.notes practical_notes,
 p.completed_at practical_completed_at
from public.exam_assignments e
join public.profiles s on s.id=e.student_id
join public.profiles a on a.id=e.assigned_by
left join public.profiles ev on ev.id=e.evaluator_id
left join public.practical_evaluations p on p.assignment_id=e.id;


create table if not exists public.exam_sessions(id uuid primary key default gen_random_uuid(),title text not null,common_username text not null unique,discipline text not null check(discipline in('dogsitter','mantrailing','hrdd','detection')),question_count integer not null default 40,duration_minutes integer not null default 45,pass_percentage integer not null default 60,notes text,active boolean not null default true,archived_at timestamptz,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.session_candidates(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.exam_sessions(id) on delete cascade,auth_user_id uuid not null unique references auth.users(id) on delete cascade,full_name text not null,candidate_code text not null,active boolean not null default true,created_at timestamptz not null default now(),unique(session_id,candidate_code));
alter table public.session_candidates
 add column if not exists login_email text,
 add column if not exists credential_hash text;
create unique index if not exists session_candidates_login_email_unique on public.session_candidates(login_email) where login_email is not null;
create unique index if not exists session_candidates_credential_hash_unique on public.session_candidates(credential_hash) where credential_hash is not null;
alter table public.exam_assignments add column if not exists session_id uuid references public.exam_sessions(id) on delete set null;
alter table public.exam_sessions enable row level security;alter table public.session_candidates enable row level security;
drop policy if exists sessions_staff_read on public.exam_sessions;create policy sessions_staff_read on public.exam_sessions for select to authenticated using(public.current_role() in('teacher','examiner','super_admin') or exists(select 1 from public.session_candidates c where c.session_id=id and c.auth_user_id=auth.uid() and c.active));
drop policy if exists sessions_admin_all on public.exam_sessions;create policy sessions_admin_all on public.exam_sessions for all to authenticated using(public.current_role()='super_admin') with check(public.current_role()='super_admin');
drop policy if exists candidates_read on public.session_candidates;create policy candidates_read on public.session_candidates for select to authenticated using(public.current_role() in('teacher','examiner','super_admin') or auth_user_id=auth.uid());
drop policy if exists candidates_admin_all on public.session_candidates;create policy candidates_admin_all on public.session_candidates for all to authenticated using(public.current_role()='super_admin') with check(public.current_role()='super_admin');
create or replace view public.exam_session_overview with(security_invoker=true) as select s.*,count(c.id)::integer candidate_count,count(c.id) filter(where c.active)::integer active_candidate_count from public.exam_sessions s left join public.session_candidates c on c.session_id=s.id group by s.id;
grant select on public.exam_session_overview,public.exam_sessions,public.session_candidates to authenticated;

alter table public.profiles enable row level security;alter table public.exam_settings enable row level security;alter table public.question_bank enable row level security;alter table public.exam_assignments enable row level security;alter table public.exam_questions enable row level security;alter table public.practical_evaluations enable row level security;

drop policy if exists profiles_read on public.profiles;create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.current_role() in('teacher','examiner','super_admin'));
drop policy if exists profiles_admin_update on public.profiles;create policy profiles_admin_update on public.profiles for update to authenticated using(public.current_role()='super_admin') with check(public.current_role()='super_admin');
drop policy if exists settings_read on public.exam_settings;create policy settings_read on public.exam_settings for select to authenticated using(public.current_role() in('teacher','super_admin'));
drop policy if exists settings_admin_update on public.exam_settings;create policy settings_admin_update on public.exam_settings for update to authenticated using(public.current_role()='super_admin') with check(public.current_role()='super_admin');
drop policy if exists bank_admin_read on public.question_bank;create policy bank_admin_read on public.question_bank for select to authenticated using(public.current_role()='super_admin');
drop policy if exists assignments_read on public.exam_assignments;create policy assignments_read on public.exam_assignments for select to authenticated using(student_id=auth.uid() or public.current_role()='super_admin' or assigned_by=auth.uid() or evaluator_id=auth.uid());
drop policy if exists questions_read on public.exam_questions;create policy questions_read on public.exam_questions for select to authenticated using(exists(select 1 from public.exam_assignments e where e.id=assignment_id and(e.student_id=auth.uid() or public.current_role()='super_admin' or e.assigned_by=auth.uid() or e.evaluator_id=auth.uid())));
drop policy if exists practical_staff on public.practical_evaluations;
create policy practical_staff on public.practical_evaluations for all to authenticated
using(
 public.current_role()='super_admin' or exists(
  select 1 from public.exam_assignments e where e.id=assignment_id and (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid())
 )
)
with check(
 public.current_role()='super_admin' or exists(
  select 1 from public.exam_assignments e where e.id=assignment_id and (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid())
 )
);

grant execute on function public.current_role() to authenticated;grant execute on function public.set_exam_evaluator(uuid,uuid) to authenticated;grant execute on function public.assign_exam(uuid,text,integer,integer,integer,text) to authenticated;grant execute on function public.get_my_assigned_exam() to authenticated;grant execute on function public.start_assigned_exam(uuid) to authenticated;grant execute on function public.answer_exam_question(uuid,integer,integer) to authenticated;grant execute on function public.finalize_exam(uuid,boolean) to authenticated;grant select on public.exam_overview to authenticated;grant select on public.question_bank to authenticated;grant select on public.question_bank_stats to authenticated;
-- Primo Super Amministratore, dopo la registrazione:
-- update public.profiles set role='super_admin' where email='LA_TUA_EMAIL';

-- Impostazioni centralizzate dell'app
create table if not exists public.app_settings (
  id integer primary key default 1 check (id=1),
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.app_settings(id,settings)
values(1,'{
  "app_name":"K9 Academy",
  "app_subtitle":"Dogsitter · Mantrailing · HRDD · Detection",
  "organization_name":"K9 Academy",
  "logo_url":"",
  "footer_text":"K9 Academy — Piattaforma esami",
  "student_help_text":"Usa le credenziali fornite dal Super Amministratore.",
  "primary_color":"#5b21b6",
  "header_color":"#35106f",
  "background_color":"#f5f3f8",
  "card_color":"#ffffff",
  "theme":"light",
  "density":"comfortable",
  "corners":"rounded",
  "max_width":1150,
  "show_result":true,
  "immediate_feedback":true,
  "show_explanation":true,
  "confirm_submit":true,
  "timer_warning_minutes":5,
  "teacher_can_assign":true
}'::jsonb)
on conflict(id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to anon,authenticated using(true);
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings for all to authenticated
using(public.current_role()='super_admin') with check(public.current_role()='super_admin');
grant select on public.app_settings to anon,authenticated;
grant insert,update on public.app_settings to authenticated;



-- RELEASE 1.44 — REGISTRO DOCUMENTI (base necessaria prima della 1.45)
create table if not exists public.exam_documents (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.exam_assignments(id) on delete cascade,
  document_type text not null check (document_type in ('report','certificate')),
  document_code text not null unique,
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_name text,
  discipline text not null,
  organization_name text,
  final_status text,
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
revoke all on public.exam_documents from anon;
grant select on public.exam_documents to authenticated;

-- RELEASE 1.45 — ASSOCIAZIONE DOCUMENTI
-- K9 Academy Esami — Release 1.45
-- Associazione formale Attestato ↔ Verbale per singolo candidato/esame.
begin;

alter table public.exam_documents
  add column if not exists document_group_code text;

update public.exam_documents
set document_group_code = regexp_replace(upper(trim(document_code)), '^(ATT|VER)-', '')
where document_group_code is null or trim(document_group_code)='';

alter table public.exam_documents
  alter column document_group_code set not null;

create index if not exists exam_documents_group_code_idx
  on public.exam_documents(document_group_code);

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
  select * into v_assignment
  from public.exam_assignments
  where id=p_assignment_id;

  if not found then
    raise exception 'Esame non trovato';
  end if;

  select role into v_role from public.profiles where id=auth.uid();

  if auth.uid() <> v_assignment.student_id
     and coalesce(v_role,'') not in ('super_admin','vice_admin','teacher','examiner') then
    raise exception 'Permesso negato';
  end if;

  if p_document_type not in ('report','certificate') then
    raise exception 'Tipo documento non valido';
  end if;

  v_code := upper(trim(regexp_replace(p_document_code, '^N\.?\s*', '', 'i')));
  v_group := regexp_replace(v_code, '^(ATT|VER)-', '');

  if v_group is null or trim(v_group)='' then
    raise exception 'Codice documento non valido';
  end if;

  select full_name into v_student_name
  from public.profiles
  where id=v_assignment.student_id;

  v_org := nullif(p_metadata->>'organization_name','');
  v_final := nullif(p_metadata->>'final_status','');

  insert into public.exam_documents(
    assignment_id,document_type,document_code,document_group_code,
    student_id,student_name,discipline,organization_name,final_status,metadata,issued_by
  )
  values(
    v_assignment.id,p_document_type,v_code,v_group,
    v_assignment.student_id,v_student_name,v_assignment.discipline,
    v_org,v_final,coalesce(p_metadata,'{}'::jsonb),auth.uid()
  )
  on conflict (assignment_id,document_type)
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

drop function if exists public.verify_exam_document(text);

create function public.verify_exam_document(p_document_code text)
returns table (
  document_code text,
  document_type text,
  document_group_code text,
  associated_document_code text,
  associated_document_registered boolean,
  student_name text,
  discipline text,
  organization_name text,
  final_status text,
  issued_at timestamptz,
  last_generated_at timestamptz,
  generation_count integer,
  status text
)
language sql
security definer
set search_path=public
as $$
  with requested as (
    select upper(trim(regexp_replace(p_document_code, '^N\.?\s*', '', 'i'))) as code
  )
  select
    d.document_code,
    d.document_type,
    d.document_group_code,
    coalesce(
      sibling.document_code,
      case
        when d.document_type='certificate' then 'VER-'||d.document_group_code
        else 'ATT-'||d.document_group_code
      end
    ) as associated_document_code,
    (sibling.id is not null) as associated_document_registered,
    d.student_name,
    d.discipline,
    d.organization_name,
    d.final_status,
    d.issued_at,
    d.last_generated_at,
    d.generation_count,
    d.status
  from public.exam_documents d
  cross join requested r
  left join public.exam_documents sibling
    on sibling.assignment_id=d.assignment_id
   and sibling.document_type<>d.document_type
  where d.document_code=r.code
    and (
      d.student_id=auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id=auth.uid()
          and p.role in ('super_admin','vice_admin','teacher','examiner')
      )
    )
  limit 1;
$$;

revoke all on function public.register_exam_document(uuid,text,text,jsonb) from public,anon;
grant execute on function public.register_exam_document(uuid,text,text,jsonb) to authenticated;

revoke all on function public.verify_exam_document(text) from public,anon;
grant execute on function public.verify_exam_document(text) to authenticated;

commit;

select
  document_code,
  document_group_code,
  document_type,
  assignment_id
from public.exam_documents
order by issued_at desc
limit 20;


-- K9 Academy Esami — Release 1.51
-- Ruoli e permessi configurabili per Vice, Docente ed Esaminatore.
begin;

create table if not exists public.role_permissions(
  role text primary key check(role in('vice_admin','teacher','examiner')),
  permissions jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.role_permissions(role,permissions) values
('vice_admin','{
 "dashboard":true,"students_view":true,"assign_exam":true,"exam_management":true,
 "practice_evaluation":true,"assign_evaluator":true,"exam_history":true,"analytics":true,
 "documents_view":true,"generate_report":true,"generate_certificate":true,"verify_documents":true,
 "document_archive":true,"question_bank":false,"sessions_manage":true,"candidates_create":true,"users_create":true
}'::jsonb),
('teacher','{
 "dashboard":true,"students_view":true,"assign_exam":true,"exam_management":true,
 "practice_evaluation":true,"assign_evaluator":false,"exam_history":true,"analytics":false,
 "documents_view":true,"generate_report":true,"generate_certificate":false,"verify_documents":true,
 "document_archive":false,"question_bank":false,"sessions_manage":false,"candidates_create":false,"users_create":false
}'::jsonb),
('examiner','{
 "dashboard":false,"students_view":false,"assign_exam":false,"exam_management":true,
 "practice_evaluation":true,"assign_evaluator":false,"exam_history":false,"analytics":false,
 "documents_view":false,"generate_report":true,"generate_certificate":false,"verify_documents":false,
 "document_archive":false,"question_bank":false,"sessions_manage":false,"candidates_create":false,"users_create":false
}'::jsonb)
on conflict(role) do nothing;

alter table public.role_permissions enable row level security;

drop policy if exists role_permissions_super_all on public.role_permissions;
create policy role_permissions_super_all on public.role_permissions
for all to authenticated
using(public.current_role()='super_admin')
with check(public.current_role()='super_admin');

drop policy if exists role_permissions_own_read on public.role_permissions;
create policy role_permissions_own_read on public.role_permissions
for select to authenticated
using(role=public.current_role() or public.current_role()='super_admin');

grant select,insert,update,delete on public.role_permissions to authenticated;

create or replace function public.has_role_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
 select case
  when public.current_role()='super_admin' then true
  when public.current_role() in('vice_admin','teacher','examiner') then
    coalesce((
      select (rp.permissions ->> p_permission)::boolean
      from public.role_permissions rp
      where rp.role=public.current_role()
    ),false)
  else false
 end;
$$;

create or replace function public.get_my_role_permissions()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
 select case
  when public.current_role()='super_admin' then '{}'::jsonb
  else coalesce((select permissions from public.role_permissions where role=public.current_role()),'{}'::jsonb)
 end;
$$;

create or replace function public.get_all_role_permissions()
returns table(role text,permissions jsonb)
language plpgsql
security definer
set search_path=public
as $$
begin
 if public.current_role()<>'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 return query select rp.role,rp.permissions from public.role_permissions rp order by rp.role;
end;
$$;

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
bad_key text;
begin
 if public.current_role()<>'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 if p_role not in('vice_admin','teacher','examiner') then raise exception 'Ruolo non configurabile'; end if;
 select key into bad_key from jsonb_object_keys(coalesce(p_permissions,'{}'::jsonb)) key where not(key=any(allowed_keys)) limit 1;
 if bad_key is not null then raise exception 'Permesso non valido: %',bad_key; end if;
 insert into public.role_permissions(role,permissions,updated_by,updated_at)
 values(p_role,coalesce(p_permissions,'{}'::jsonb),auth.uid(),now())
 on conflict(role) do update set permissions=excluded.permissions,updated_by=auth.uid(),updated_at=now();
end;
$$;

grant execute on function public.has_role_permission(text) to authenticated;
grant execute on function public.get_my_role_permissions() to authenticated;
grant execute on function public.get_all_role_permissions() to authenticated;
grant execute on function public.set_role_permissions(text,jsonb) to authenticated;

-- Assegnazione esami: ruolo + permesso.
create or replace function public.assign_exam(p_student_id uuid,p_discipline text,p_question_count integer,p_duration_minutes integer,p_pass_percentage integer,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
 if not public.has_role_permission('assign_exam') then raise exception 'Assegnazione esami non abilitata'; end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student' and archived_at is null) then raise exception 'Corsista non valido o archiviato'; end if;
 if p_discipline not in('dogsitter','mantrailing','hrdd','detection') then raise exception 'Disciplina non valida'; end if;
 if exists(select 1 from public.exam_assignments where student_id=p_student_id and status in('assigned','in_progress')) then raise exception 'Il corsista ha già un esame aperto'; end if;
 if (select count(*) from public.question_bank where active and discipline=p_discipline) < p_question_count then raise exception 'Domande attive insufficienti per la disciplina selezionata'; end if;
 insert into public.exam_assignments(student_id,assigned_by,discipline,question_count,duration_minutes,pass_percentage,notes)
 values(p_student_id,auth.uid(),p_discipline,p_question_count,p_duration_minutes,p_pass_percentage,p_notes) returning id into new_id;
 return new_id;
end$$;

create or replace function public.set_exam_evaluator(p_assignment_id uuid,p_evaluator_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_role_permission('assign_evaluator') then raise exception 'Assegnazione valutatore non abilitata'; end if;
 if p_evaluator_id is not null and not exists(select 1 from public.profiles where id=p_evaluator_id and role in('examiner','teacher') and archived_at is null) then raise exception 'Esaminatore non valido o archiviato'; end if;
 update public.exam_assignments set evaluator_id=p_evaluator_id where id=p_assignment_id;
 if not found then raise exception 'Esame non disponibile'; end if;
end$$;

-- RLS: visibilità e operazioni sensibili seguono i permessi.
drop policy if exists sessions_staff_read on public.exam_sessions;
create policy sessions_staff_read on public.exam_sessions for select to authenticated
using(
 (public.has_role_permission('sessions_manage') or public.has_role_permission('candidates_create'))
 or exists(select 1 from public.session_candidates c where c.session_id=id and c.auth_user_id=auth.uid() and c.active)
);
drop policy if exists sessions_admin_all on public.exam_sessions;
create policy sessions_admin_all on public.exam_sessions for all to authenticated
using(public.has_role_permission('sessions_manage')) with check(public.has_role_permission('sessions_manage'));

drop policy if exists candidates_read on public.session_candidates;
create policy candidates_read on public.session_candidates for select to authenticated
using(public.has_role_permission('sessions_manage') or public.has_role_permission('candidates_create') or auth_user_id=auth.uid());
drop policy if exists candidates_admin_all on public.session_candidates;
create policy candidates_admin_all on public.session_candidates for all to authenticated
using(public.has_role_permission('sessions_manage') or public.has_role_permission('candidates_create'))
with check(public.has_role_permission('sessions_manage') or public.has_role_permission('candidates_create'));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using(
 id=auth.uid()
 or public.current_role()='super_admin'
 or public.has_role_permission('students_view')
 or public.has_role_permission('assign_exam')
 or public.has_role_permission('users_create')
 or public.has_role_permission('assign_evaluator')
);

drop policy if exists settings_read on public.exam_settings;
create policy settings_read on public.exam_settings for select to authenticated
using(public.current_role()='super_admin' or public.has_role_permission('assign_exam') or public.has_role_permission('sessions_manage'));

drop policy if exists bank_admin_read on public.question_bank;
create policy bank_admin_read on public.question_bank for select to authenticated
using(public.current_role()='super_admin' or public.has_role_permission('question_bank'));

drop policy if exists bank_admin_insert on public.question_bank;
create policy bank_admin_insert on public.question_bank for insert to authenticated
with check(public.current_role()='super_admin' or public.has_role_permission('question_bank'));
drop policy if exists bank_admin_update on public.question_bank;
create policy bank_admin_update on public.question_bank for update to authenticated
using(public.current_role()='super_admin' or public.has_role_permission('question_bank'))
with check(public.current_role()='super_admin' or public.has_role_permission('question_bank'));
drop policy if exists bank_admin_delete on public.question_bank;
create policy bank_admin_delete on public.question_bank for delete to authenticated
using(public.current_role()='super_admin' or public.has_role_permission('question_bank'));

drop policy if exists assignments_read on public.exam_assignments;
create policy assignments_read on public.exam_assignments for select to authenticated
using(
 student_id=auth.uid()
 or public.current_role()='super_admin'
 or (
   (public.has_role_permission('exam_management') or public.has_role_permission('exam_history') or public.has_role_permission('analytics') or public.has_role_permission('documents_view'))
   and (public.current_role()='vice_admin' or assigned_by=auth.uid() or evaluator_id=auth.uid())
 )
);

drop policy if exists questions_read on public.exam_questions;
create policy questions_read on public.exam_questions for select to authenticated
using(exists(
 select 1 from public.exam_assignments e
 where e.id=assignment_id and(
  e.student_id=auth.uid()
  or public.current_role()='super_admin'
  or (
    public.has_role_permission('exam_management')
    and (public.current_role()='vice_admin' or e.assigned_by=auth.uid() or e.evaluator_id=auth.uid())
  )
 )
));

drop policy if exists practical_staff on public.practical_evaluations;
create policy practical_staff on public.practical_evaluations for all to authenticated
using(
 public.current_role()='super_admin'
 or (
   public.has_role_permission('practice_evaluation')
   and exists(select 1 from public.exam_assignments e where e.id=assignment_id and (public.current_role()='vice_admin' or e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()))
 )
)
with check(
 public.current_role()='super_admin'
 or (
   public.has_role_permission('practice_evaluation')
   and exists(select 1 from public.exam_assignments e where e.id=assignment_id and (public.current_role()='vice_admin' or e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()))
 )
);

-- Registro documenti: accesso subordinato ai permessi documentali.
drop policy if exists exam_documents_select_authenticated on public.exam_documents;
create policy exam_documents_select_authenticated on public.exam_documents
for select to authenticated
using(
 student_id=auth.uid()
 or public.current_role()='super_admin'
 or (
   (public.has_role_permission('documents_view') or public.has_role_permission('document_archive') or public.has_role_permission('verify_documents'))
   and (public.current_role()='vice_admin' or issued_by=auth.uid())
 )
);

-- Funzioni registro/verifica/lista aggiornate con controllo permessi.
create or replace function public.verify_exam_document(p_document_code text)
returns table (
  document_code text,document_type text,document_group_code text,associated_document_code text,
  associated_document_registered boolean,student_name text,discipline text,organization_name text,
  final_status text,issued_at timestamptz,last_generated_at timestamptz,generation_count integer,status text
)
language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'super_admin' and not public.has_role_permission('verify_documents') then
   raise exception 'Verifica documenti non abilitata';
 end if;
 return query
 with requested as (
   select upper(trim(regexp_replace(p_document_code, '^N\.?\s*', '', 'i'))) as code
 )
 select d.document_code,d.document_type,d.document_group_code,
   coalesce(sibling.document_code,case when d.document_type='certificate' then 'VER-'||d.document_group_code else 'ATT-'||d.document_group_code end),
   (sibling.id is not null),d.student_name,d.discipline,d.organization_name,d.final_status,
   d.issued_at,d.last_generated_at,d.generation_count,d.status
 from public.exam_documents d cross join requested r
 left join public.exam_documents sibling on sibling.assignment_id=d.assignment_id and sibling.document_type<>d.document_type
 where d.document_code=r.code
   and (public.current_role()='super_admin' or public.current_role()='vice_admin' or d.issued_by=auth.uid() or d.student_id=auth.uid())
 limit 1;
end$$;

create or replace function public.list_exam_documents()
returns table (
 id uuid,assignment_id uuid,document_type text,document_code text,document_group_code text,
 student_id uuid,student_name text,discipline text,organization_name text,final_status text,
 issued_at timestamptz,last_generated_at timestamptz,generation_count integer,status text
)
language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()<>'super_admin' and not public.has_role_permission('document_archive') then
   raise exception 'Archivio documenti non abilitato';
 end if;
 return query select d.id,d.assignment_id,d.document_type,d.document_code,d.document_group_code,d.student_id,d.student_name,
 d.discipline,d.organization_name,d.final_status,d.issued_at,d.last_generated_at,d.generation_count,d.status
 from public.exam_documents d
 where public.current_role() in('super_admin','vice_admin') or d.student_id=auth.uid() or d.issued_by=auth.uid()
 order by d.issued_at desc;
end$$;

grant execute on function public.verify_exam_document(text) to authenticated;
grant execute on function public.list_exam_documents() to authenticated;

commit;

select role,permissions from public.role_permissions order by role;


-- K9 Academy Esami — Release 1.52
-- Correzione approfondita Ruoli e permessi.
begin;

-- Le dipendenze vengono normalizzate anche lato database.
create or replace function public.normalize_role_permissions(p_permissions jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare p jsonb:=coalesce(p_permissions,'{}'::jsonb);
begin
 if coalesce((p->>'practice_evaluation')::boolean,false) then p:=jsonb_set(p,'{exam_management}','true'::jsonb,true); end if;
 if coalesce((p->>'assign_evaluator')::boolean,false) then p:=jsonb_set(p,'{exam_management}','true'::jsonb,true); end if;
 if coalesce((p->>'verify_documents')::boolean,false) then p:=jsonb_set(p,'{documents_view}','true'::jsonb,true); end if;
 if coalesce((p->>'assign_exam')::boolean,false) then p:=jsonb_set(p,'{students_view}','true'::jsonb,true); end if;
 return p;
end;
$$;

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
 if public.current_role()<>'super_admin' then raise exception 'Funzione riservata al Super Amministratore'; end if;
 if p_role not in('vice_admin','teacher','examiner') then raise exception 'Ruolo non configurabile'; end if;
 select key into bad_key from jsonb_object_keys(coalesce(p_permissions,'{}'::jsonb)) key where not(key=any(allowed_keys)) limit 1;
 if bad_key is not null then raise exception 'Permesso non valido: %',bad_key; end if;
 normalized:=public.normalize_role_permissions(p_permissions);
 insert into public.role_permissions(role,permissions,updated_by,updated_at)
 values(p_role,normalized,auth.uid(),now())
 on conflict(role) do update set permissions=excluded.permissions,updated_by=auth.uid(),updated_at=now();
end;
$$;

-- Normalizza le configurazioni già salvate.
update public.role_permissions set permissions=public.normalize_role_permissions(permissions),updated_at=now();

-- Dashboard coerente: una singola RPC controllata dal permesso dashboard.
create or replace function public.get_role_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare r text:=public.current_role();students_count integer:=0;open_count integer:=0;completed_count integer:=0;sessions_count integer:=0;
begin
 if r<>'super_admin' and not public.has_role_permission('dashboard') then raise exception 'Dashboard non abilitata'; end if;
 if r in('super_admin','vice_admin') then
   select count(*) into students_count from public.profiles where role='student' and archived_at is null;
   select count(*) into open_count from public.exam_assignments where status in('assigned','in_progress');
   select count(*) into completed_count from public.exam_assignments where status in('submitted','expired');
   select count(*) into sessions_count from public.exam_sessions where active=true;
 else
   select count(distinct e.student_id) into students_count from public.exam_assignments e where e.assigned_by=auth.uid() or e.evaluator_id=auth.uid();
   select count(*) into open_count from public.exam_assignments e where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and e.status in('assigned','in_progress');
   select count(*) into completed_count from public.exam_assignments e where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and e.status in('submitted','expired');
   select count(distinct e.session_id) into sessions_count from public.exam_assignments e join public.exam_sessions s on s.id=e.session_id where (e.assigned_by=auth.uid() or e.evaluator_id=auth.uid()) and s.active=true;
 end if;
 return jsonb_build_object('students',students_count,'open_exams',open_count,'completed_exams',completed_count,'active_sessions',sessions_count);
end;
$$;
grant execute on function public.get_role_dashboard() to authenticated;

-- Registrazione documenti: applica generate_report / generate_certificate anche lato server.
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
  if p_document_type not in ('report','certificate') then raise exception 'Tipo documento non valido'; end if;
  required_permission:=case when p_document_type='certificate' then 'generate_certificate' else 'generate_report' end;
  if v_role<>'super_admin' and not public.has_role_permission(required_permission) then raise exception 'Generazione documento non abilitata'; end if;
  if v_role<>'super_admin' and v_role<>'vice_admin' and v_assignment.assigned_by<>auth.uid() and coalesce(v_assignment.evaluator_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid() then raise exception 'Esame non accessibile'; end if;
  v_code:=upper(trim(regexp_replace(p_document_code,'^N\.?\s*','','i')));
  v_group:=regexp_replace(v_code,'^(ATT|VER)-','');
  if v_group is null or trim(v_group)='' then raise exception 'Codice documento non valido'; end if;
  select full_name into v_student_name from public.profiles where id=v_assignment.student_id;
  v_org:=nullif(p_metadata->>'organization_name','');v_final:=nullif(p_metadata->>'final_status','');
  insert into public.exam_documents(assignment_id,document_type,document_code,document_group_code,student_id,student_name,discipline,organization_name,final_status,metadata,issued_by)
  values(v_assignment.id,p_document_type,v_code,v_group,v_assignment.student_id,v_student_name,v_assignment.discipline,v_org,v_final,coalesce(p_metadata,'{}'::jsonb),auth.uid())
  on conflict(assignment_id,document_type) do update set document_code=excluded.document_code,document_group_code=excluded.document_group_code,student_name=excluded.student_name,discipline=excluded.discipline,organization_name=excluded.organization_name,final_status=excluded.final_status,metadata=excluded.metadata,last_generated_at=now(),generation_count=public.exam_documents.generation_count+1,issued_by=auth.uid(),status='valid'
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.register_exam_document(uuid,text,text,jsonb) to authenticated;

commit;

select role,permissions from public.role_permissions order by role;


-- K9 Academy Esami — Release 1.55
-- Correzione RLS per schede esame con ruoli dinamici.
begin;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
for select to authenticated
using(
  id=auth.uid()
  or public.current_role()='super_admin'
  or public.has_role_permission('students_view')
  or public.has_role_permission('assign_exam')
  or public.has_role_permission('users_create')
  or public.has_role_permission('assign_evaluator')
  or (
    (
      public.has_role_permission('exam_management')
      or public.has_role_permission('exam_history')
      or public.has_role_permission('analytics')
      or public.has_role_permission('documents_view')
      or public.has_role_permission('practice_evaluation')
    )
    and exists(
      select 1
      from public.exam_assignments e
      where
        (e.student_id=profiles.id or e.assigned_by=profiles.id or e.evaluator_id=profiles.id)
        and (
          public.current_role()='vice_admin'
          or e.assigned_by=auth.uid()
          or e.evaluator_id=auth.uid()
        )
    )
  )
);

commit;

select policyname,tablename
from pg_policies
where schemaname='public' and tablename='profiles'
order by policyname;


-- RELEASE 1.61 — ARCHIVIAZIONE SESSIONI
alter table public.exam_sessions add column if not exists archived_at timestamptz;
create index if not exists exam_sessions_archived_at_idx on public.exam_sessions(archived_at);


-- K9 Academy Esami — Release 1.61
-- Foto profilo ruoli + Storage privato
-- Eseguire una sola volta su Supabase SQL Editor.

begin;

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'profile-photos',
  'profile-photos',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Lettura: solo utenti autenticati dell'app.
drop policy if exists k9_profile_photos_read on storage.objects;
create policy k9_profile_photos_read
on storage.objects
for select
to authenticated
using(bucket_id='profile-photos');

-- Inserimento/aggiornamento/rimozione:
-- ciascun utente può gestire la propria cartella;
-- Super e ruoli abilitati a creare utenti possono gestire le foto degli account.
drop policy if exists k9_profile_photos_insert on storage.objects;
create policy k9_profile_photos_insert
on storage.objects
for insert
to authenticated
with check(
  bucket_id='profile-photos'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.current_role()='super_admin'
    or public.has_role_permission('users_create')
  )
);

drop policy if exists k9_profile_photos_update on storage.objects;
create policy k9_profile_photos_update
on storage.objects
for update
to authenticated
using(
  bucket_id='profile-photos'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.current_role()='super_admin'
    or public.has_role_permission('users_create')
  )
)
with check(
  bucket_id='profile-photos'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.current_role()='super_admin'
    or public.has_role_permission('users_create')
  )
);

drop policy if exists k9_profile_photos_delete on storage.objects;
create policy k9_profile_photos_delete
on storage.objects
for delete
to authenticated
using(
  bucket_id='profile-photos'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.current_role()='super_admin'
    or public.has_role_permission('users_create')
  )
);

create or replace function public.set_profile_photo_path(p_user_id uuid,p_path text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  caller_role text:=public.current_role();
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  if p_user_id is null then raise exception 'Utente non valido'; end if;

  if p_user_id<>auth.uid()
     and caller_role<>'super_admin'
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

revoke all on function public.set_profile_photo_path(uuid,text) from public,anon;
grant execute on function public.set_profile_photo_path(uuid,text) to authenticated;

commit;

select column_name
from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name='avatar_path';


-- RELEASE 1.61 — CONSOLIDAMENTO AUDIT
-- Mantiene schema.sql coerente con il database live e con l'archiviazione sessioni.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check(role in('student','teacher','examiner','vice_admin','super_admin'));
alter table public.practical_evaluations
  add column if not exists professional_criteria jsonb not null default '[]'::jsonb;
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


-- RELEASE 1.63 — REPORT COMPLETO CORSISTA / ESAME
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


-- RELEASE 1.66 — CONSOLIDAMENTO E HARDENING
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
