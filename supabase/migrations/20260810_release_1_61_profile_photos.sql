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
