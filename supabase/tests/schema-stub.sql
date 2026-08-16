-- A stand-in for the hosted schema, holding just the tables and columns the app
-- reads and writes. It exists so the migrations can be exercised against a
-- throwaway Postgres instead of against production.
--
-- Keep this in step with the real schema: if a migration starts touching a
-- column that is missing here, the tests will fail for the wrong reason.

create schema if not exists auth;

create table auth.users (
  id uuid primary key
);

-- Supabase derives this from the request's JWT. Backing it with a setting lets
-- the tests switch identity with `set request.jwt.claim.sub = '<uuid>'`.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  phone text unique not null,
  updated_at timestamptz default now()
);

create table public.payment_methods (
  user_id uuid primary key references auth.users(id),
  card_number text,
  updated_at timestamptz default now()
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id),
  name text not null,
  template text not null,
  status text not null default 'active',
  invite_code text,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table public.story_members (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade,
  user_id uuid references auth.users(id),
  share_units integer not null default 1,
  member_kind text not null default 'registered',
  display_name text,
  household_members text[] not null default '{}'::text[],
  joined_at timestamptz default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade,
  title text not null,
  amount numeric not null,
  category text,
  paid_by uuid references public.story_members(id),
  participant_person_count integer not null default 1,
  created_at timestamptz default now()
);

create table public.expense_shares (
  expense_id uuid references public.expenses(id) on delete cascade,
  member_id uuid references public.story_members(id),
  amount numeric not null,
  item_label text
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete cascade,
  from_member_id uuid references public.story_members(id),
  to_member_id uuid references public.story_members(id),
  amount numeric not null,
  status text not null default 'paid',
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- Roles are cluster-wide, so this may already exist on a reused instance.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
