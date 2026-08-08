-- K9 ACADEMY ESAMI RELEASE 1.22 - SCHEMA COMPLETO
-- Eseguire una sola volta su un nuovo progetto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 email text, full_name text,
 role text not null default 'student' check(role in('student','teacher','examiner','super_admin')),
 created_at timestamptz default now(), updated_at timestamptz default now());

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
 criteria jsonb not null default '[]'::jsonb,practical_score integer default 0 check(practical_score between 0 and 50),
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


create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$select role from public.profiles where id=auth.uid()$$;

create or replace function public.assign_exam(p_student_id uuid,p_discipline text,p_question_count integer,p_duration_minutes integer,p_pass_percentage integer,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$declare new_id uuid;
begin
 if public.current_role() not in('teacher','super_admin') then raise exception 'Non autorizzato'; end if;
 if not exists(select 1 from public.profiles where id=p_student_id and role='student') then raise exception 'Corsista non valido'; end if;
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


create table if not exists public.exam_sessions(id uuid primary key default gen_random_uuid(),title text not null,common_username text not null unique,discipline text not null check(discipline in('dogsitter','mantrailing','hrdd','detection')),question_count integer not null default 40,duration_minutes integer not null default 45,pass_percentage integer not null default 60,notes text,active boolean not null default true,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.session_candidates(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.exam_sessions(id) on delete cascade,auth_user_id uuid not null unique references auth.users(id) on delete cascade,full_name text not null,candidate_code text not null,active boolean not null default true,created_at timestamptz not null default now(),unique(session_id,candidate_code));
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
