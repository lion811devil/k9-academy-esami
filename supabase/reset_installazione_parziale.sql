-- K9 ACADEMY - RESET DI UNA INSTALLAZIONE PARZIALE
-- Usare SOLO nel nuovo progetto Supabase dedicato a K9 Academy Esami,
-- prima di rieseguire schema.sql. Elimina esclusivamente gli oggetti
-- presenti nello schema public; non elimina il progetto Supabase né auth.users.

begin;

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
grant create on schema public to postgres, service_role;

-- Impostazioni standard consigliate da Supabase per lo schema public.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to postgres, service_role;

commit;
