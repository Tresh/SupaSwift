-- =====================================================================
-- SupaSwift — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles — one row per SupaSwift user (created automatically on signup)
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  plan            text not null default 'free',           -- reserved for future paid plans
  email_alerts    boolean not null default true,
  recovery_alerts boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- connected_accounts — one row per connected Supabase login (OAuth app authorization)
-- ---------------------------------------------------------------------
create table public.connected_accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  provider               text not null default 'supabase',
  -- Identifies the connected Supabase login: the sorted list of its
  -- organization slugs. Used to dedupe re-connections of the same login.
  account_identifier     text not null,
  display_name           text not null default 'Supabase',
  encrypted_refresh_token text not null,                   -- AES-256-GCM encrypted at rest
  revoked_at             timestamptz,                      -- set when Supabase rejects our token
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, account_identifier)
);

-- ---------------------------------------------------------------------
-- monitored_projects — projects the user asked SupaSwift to watch
-- ---------------------------------------------------------------------
create table public.monitored_projects (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts(id) on delete cascade,
  project_ref          text not null,                      -- 20-char Supabase project ref
  project_name         text not null,
  organization_slug    text,
  organization_name    text,
  region               text,
  monitoring_enabled   boolean not null default true,
  check_interval_hours integer not null default 24,        -- 1 check / project / 24h (MVP)
  next_check_at        timestamptz not null default now(),
  last_checked_at      timestamptz,
  last_status          text,                               -- checking|healthy|warning|offline|paused|unknown
  last_response_ms     integer,
  last_error           text,
  consecutive_failures integer not null default 0,
  failure_notified_at  timestamptz,                        -- set once per incident to avoid notification spam
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, project_ref)
);

create index monitored_projects_due_idx
  on public.monitored_projects (next_check_at)
  where monitoring_enabled;

-- ---------------------------------------------------------------------
-- health_checks — bounded history of check results
-- ---------------------------------------------------------------------
create table public.health_checks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.monitored_projects(id) on delete cascade,
  status        text not null,
  response_ms   integer,
  error_message text,
  checked_at    timestamptz not null default now()
);

create index health_checks_project_idx on public.health_checks (project_id, checked_at desc);

-- ---------------------------------------------------------------------
-- app_state — tiny key/value store for worker bookkeeping (e.g. last prune)
-- ---------------------------------------------------------------------
create table public.app_state (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger connected_accounts_updated_at before update on public.connected_accounts
  for each row execute function public.set_updated_at();
create trigger monitored_projects_updated_at before update on public.monitored_projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Create/refresh a profile row whenever a SupaSwift user signs up
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Worker: atomically claim due checks.
-- Only the service role (the scheduler) may run this.
-- `FOR UPDATE SKIP LOCKED` guarantees two workers never claim the same row.
-- ---------------------------------------------------------------------
create or replace function public.claim_due_checks(p_limit int default 25)
returns setof public.monitored_projects
language sql
as $$
  with claimed as (
    select id
    from public.monitored_projects
    where monitoring_enabled
      and next_check_at <= now()
      -- skip rows currently being checked, unless the worker crashed
      -- mid-check (stale 'checking' older than an hour)
      and (last_status is distinct from 'checking' or updated_at < now() - interval '1 hour')
    order by next_check_at
    limit p_limit
    for update skip locked
  )
  update public.monitored_projects mp
  set last_status = 'checking', updated_at = now()
  from claimed c
  where mp.id = c.id
  returning mp.*;
$$;

revoke execute on function public.claim_due_checks(int) from public, anon, authenticated;
grant execute on function public.claim_due_checks(int) to service_role;

-- ---------------------------------------------------------------------
-- Worker: keep health history bounded (last p_keep rows per project)
-- ---------------------------------------------------------------------
create or replace function public.prune_health_history(p_keep int default 500)
returns int
language sql
as $$
  with ranked as (
    select id, row_number() over (partition by project_id order by checked_at desc) as rn
    from public.health_checks
  ), to_delete as (
    select id from ranked where rn > p_keep
  ), deleted as (
    delete from public.health_checks hc
    using to_delete td
    where hc.id = td.id
    returning hc.id
  )
  select count(*) from deleted;
$$;

revoke execute on function public.prune_health_history(int) from public, anon, authenticated;
grant execute on function public.prune_health_history(int) to service_role;

-- ---------------------------------------------------------------------
-- Row Level Security — users can only touch their own data.
-- The service role (scheduler, account deletion) bypasses RLS.
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.monitored_projects enable row level security;
alter table public.health_checks enable row level security;

create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);

create policy "accounts select own" on public.connected_accounts for select using (auth.uid() = user_id);
create policy "accounts insert own" on public.connected_accounts for insert with check (auth.uid() = user_id);
create policy "accounts update own" on public.connected_accounts for update using (auth.uid() = user_id);
create policy "accounts delete own" on public.connected_accounts for delete using (auth.uid() = user_id);

create policy "projects select own" on public.monitored_projects for select using (auth.uid() = user_id);
create policy "projects insert own" on public.monitored_projects for insert with check (auth.uid() = user_id);
create policy "projects update own" on public.monitored_projects for update using (auth.uid() = user_id);
create policy "projects delete own" on public.monitored_projects for delete using (auth.uid() = user_id);

create policy "checks select own" on public.health_checks for select using (
  exists (
    select 1 from public.monitored_projects mp
    where mp.id = health_checks.project_id and mp.user_id = auth.uid()
  )
);
