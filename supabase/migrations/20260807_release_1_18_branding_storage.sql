-- K9 Academy Esami — Release 1.18
-- Logo e icona App gestibili dalla galleria tramite Supabase Storage.
-- Eseguire una sola volta nel SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists branding_super_insert on storage.objects;
create policy branding_super_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'branding'
  and public.current_role() = 'super_admin'
);

drop policy if exists branding_super_update on storage.objects;
create policy branding_super_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'branding'
  and public.current_role() = 'super_admin'
)
with check (
  bucket_id = 'branding'
  and public.current_role() = 'super_admin'
);

drop policy if exists branding_super_delete on storage.objects;
create policy branding_super_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'branding'
  and public.current_role() = 'super_admin'
);

select id, name, public, file_size_limit
from storage.buckets
where id='branding';
