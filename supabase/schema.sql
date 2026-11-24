-- CafeFlow stores the original client/service JSON payloads to preserve the app model.
-- Every row belongs to the authenticated account shared by the establishment's devices.
create table if not exists public.clients (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload ->> 'id' = id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id)
);

create table if not exists public.services (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload ->> 'id' = id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner_id, id)
);

create table if not exists public.quotes (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_date date not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload ->> 'date' = quote_date::text),
  updated_at timestamptz not null default now(),
  primary key (owner_id, quote_date)
);

create index if not exists clients_owner_updated_idx on public.clients (owner_id, updated_at);
create index if not exists services_owner_updated_idx on public.services (owner_id, updated_at);
create index if not exists quotes_owner_updated_idx on public.quotes (owner_id, updated_at);

create or replace function public.cafeflow_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.cafeflow_set_updated_at();

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
before update on public.services
for each row execute function public.cafeflow_set_updated_at();

drop trigger if exists quotes_set_updated_at on public.quotes;
create trigger quotes_set_updated_at
before update on public.quotes
for each row execute function public.cafeflow_set_updated_at();

alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.quotes enable row level security;

drop policy if exists "CafeFlow account owns clients" on public.clients;
create policy "CafeFlow account owns clients"
on public.clients for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "CafeFlow account owns services" on public.services;
create policy "CafeFlow account owns services"
on public.services for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "CafeFlow account owns quotes" on public.quotes;
create policy "CafeFlow account owns quotes"
on public.quotes for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
