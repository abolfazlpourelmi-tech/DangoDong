alter table public.story_members
  add column if not exists household_members text[] not null default '{}'::text[];

alter table public.expenses
  add column if not exists participant_person_count integer not null default 1
  check (participant_person_count between 1 and 100);

create or replace function public.set_household_members(
  target_member_id uuid,
  member_names text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner_id uuid;
  target_user_id uuid;
  target_member_kind text;
  target_story_status text;
  clean_names text[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select stories.owner_id, story_members.user_id, story_members.member_kind, stories.status
    into target_owner_id, target_user_id, target_member_kind, target_story_status
  from public.story_members
  join public.stories on stories.id = story_members.story_id
  where story_members.id = target_member_id;

  if not found then
    raise exception 'Member not found';
  end if;

  if target_story_status <> 'active' then
    raise exception 'Completed stories cannot be edited';
  end if;

  if target_user_id is distinct from auth.uid()
     and not (target_owner_id = auth.uid() and target_member_kind = 'guest') then
    raise exception 'Not allowed';
  end if;

  select coalesce(array_agg(trimmed_name order by position), '{}'::text[])
    into clean_names
  from (
    select btrim(value) as trimmed_name, ordinality as position
    from unnest(coalesce(member_names, '{}'::text[])) with ordinality as names(value, ordinality)
    where length(btrim(value)) between 2 and 80
  ) cleaned;

  if cardinality(clean_names) < 1
     or cardinality(clean_names) > 12
     or cardinality(clean_names) <> cardinality(coalesce(member_names, '{}'::text[])) then
    raise exception 'Household must contain 1 to 12 valid names (2 to 80 characters each)';
  end if;

  update public.story_members
  set household_members = clean_names,
      share_units = cardinality(clean_names)
  where id = target_member_id;
end;
$$;

create or replace function public.set_current_household_members(
  target_story_id uuid,
  member_names text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into current_member_id
  from public.story_members
  where story_id = target_story_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Current member not found';
  end if;

  perform public.set_household_members(current_member_id, member_names);
end;
$$;

revoke all on function public.set_household_members(uuid, text[]) from public;
revoke all on function public.set_current_household_members(uuid, text[]) from public;
grant execute on function public.set_household_members(uuid, text[]) to authenticated;
grant execute on function public.set_current_household_members(uuid, text[]) to authenticated;

create or replace function public.set_expense_participant_person_count(
  target_expense_id uuid,
  person_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_story_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if person_count is null or person_count < 1 or person_count > 100 then
    raise exception 'Participant person count must be between 1 and 100';
  end if;

  select story_id into target_story_id
  from public.expenses
  where id = target_expense_id;

  if not found then
    raise exception 'Expense not found';
  end if;

  if not exists (
    select 1
    from public.story_members
    where story_id = target_story_id
      and user_id = auth.uid()
  ) then
    raise exception 'Not allowed';
  end if;

  update public.expenses
  set participant_person_count = person_count
  where id = target_expense_id;
end;
$$;

revoke all on function public.set_expense_participant_person_count(uuid, integer) from public;
grant execute on function public.set_expense_participant_person_count(uuid, integer) to authenticated;
