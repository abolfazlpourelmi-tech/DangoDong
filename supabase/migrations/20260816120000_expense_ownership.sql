-- Track who recorded each expense so only that person can edit or delete it.
-- Existing rows keep a null creator: nobody claims authorship retroactively,
-- and the app shows them as read-only rather than guessing an owner.
alter table public.expenses
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Set through a trigger rather than by rewriting create_story_expense, so the
-- creator is recorded no matter which path inserts the row.
create or replace function public.stamp_expense_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_expense_creator on public.expenses;
create trigger stamp_expense_creator
  before insert on public.expenses
  for each row execute function public.stamp_expense_creator();

create or replace function public.delete_story_expense(target_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_creator uuid;
  target_story_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select expenses.created_by, stories.status
    into expense_creator, target_story_status
  from public.expenses
  join public.stories on stories.id = expenses.story_id
  where expenses.id = target_expense_id;

  if not found then
    raise exception 'Expense not found';
  end if;

  if target_story_status <> 'active' then
    raise exception 'Completed stories cannot be edited';
  end if;

  if expense_creator is null or expense_creator is distinct from auth.uid() then
    raise exception 'Only the member who recorded this expense can remove it';
  end if;

  delete from public.expense_shares where expense_id = target_expense_id;
  delete from public.expenses where id = target_expense_id;
end;
$$;

create or replace function public.update_story_expense(
  target_expense_id uuid,
  expense_title text,
  expense_amount numeric,
  expense_category text,
  payer_member_id uuid,
  allocations jsonb,
  person_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_creator uuid;
  target_story_id uuid;
  target_story_status text;
  clean_title text;
  allocation_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select expenses.created_by, expenses.story_id, stories.status
    into expense_creator, target_story_id, target_story_status
  from public.expenses
  join public.stories on stories.id = expenses.story_id
  where expenses.id = target_expense_id;

  if not found then
    raise exception 'Expense not found';
  end if;

  if target_story_status <> 'active' then
    raise exception 'Completed stories cannot be edited';
  end if;

  if expense_creator is null or expense_creator is distinct from auth.uid() then
    raise exception 'Only the member who recorded this expense can edit it';
  end if;

  clean_title := btrim(coalesce(expense_title, ''));
  if length(clean_title) < 1 or length(clean_title) > 120 then
    raise exception 'Title must be between 1 and 120 characters';
  end if;

  if expense_amount is null or expense_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if person_count is null or person_count < 1 or person_count > 100 then
    raise exception 'Participant person count must be between 1 and 100';
  end if;

  -- The payer and every allocation must belong to this story.
  if not exists (
    select 1 from public.story_members
    where id = payer_member_id and story_id = target_story_id
  ) then
    raise exception 'Payer is not a member of this story';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(allocations, '[]'::jsonb)) as allocation
    where not exists (
      select 1 from public.story_members
      where id = (allocation ->> 'member_id')::uuid
        and story_id = target_story_id
    )
  ) then
    raise exception 'Allocation refers to a member outside this story';
  end if;

  select coalesce(sum((allocation ->> 'amount')::numeric), 0)
    into allocation_total
  from jsonb_array_elements(coalesce(allocations, '[]'::jsonb)) as allocation;

  if allocation_total <> expense_amount then
    raise exception 'Allocations must add up to the expense amount';
  end if;

  update public.expenses
  set title = clean_title,
      amount = expense_amount,
      category = expense_category,
      paid_by = payer_member_id,
      participant_person_count = person_count
  where id = target_expense_id;

  delete from public.expense_shares where expense_id = target_expense_id;

  insert into public.expense_shares (expense_id, member_id, amount, item_label)
  select target_expense_id,
         (allocation ->> 'member_id')::uuid,
         (allocation ->> 'amount')::numeric,
         nullif(btrim(coalesce(allocation ->> 'label', '')), '')
  from jsonb_array_elements(coalesce(allocations, '[]'::jsonb)) as allocation;
end;
$$;

revoke all on function public.delete_story_expense(uuid) from public;
revoke all on function public.update_story_expense(uuid, text, numeric, text, uuid, jsonb, integer) from public;
grant execute on function public.delete_story_expense(uuid) to authenticated;
grant execute on function public.update_story_expense(uuid, text, numeric, text, uuid, jsonb, integer) to authenticated;
