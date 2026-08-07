-- K9 Academy Esami Release 1.17 - gestione banca domande
-- Eseguire una sola volta nel SQL Editor di Supabase.

drop policy if exists bank_admin_insert on public.question_bank;
create policy bank_admin_insert on public.question_bank
for insert to authenticated
with check (public.current_role()='super_admin');

drop policy if exists bank_admin_update on public.question_bank;
create policy bank_admin_update on public.question_bank
for update to authenticated
using (public.current_role()='super_admin')
with check (public.current_role()='super_admin');

drop policy if exists bank_admin_delete on public.question_bank;
create policy bank_admin_delete on public.question_bank
for delete to authenticated
using (public.current_role()='super_admin');

grant insert, update, delete on public.question_bank to authenticated;
grant usage, select on sequence public.question_bank_id_seq to authenticated;
