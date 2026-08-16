-- Executable statement of the access rules the migrations are supposed to
-- enforce. Every assertion raises on failure, so with ON_ERROR_STOP the runner
-- exits non-zero the moment a rule stops holding.
--
-- Run with supabase/tests/run.sh — it applies schema-stub.sql, then every
-- migration in order, then this file.

\set ON_ERROR_STOP on

create or replace function pg_temp.ok(condition boolean, label text) returns void
language plpgsql as $$
begin
  if condition then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end $$;

-- Asserts that a call is refused. A statement that succeeds is the failure.
create or replace function pg_temp.denies(statement text, label text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    raise notice 'PASS  % — refused with: %', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % — the call went through', label;
end $$;

-- ---------------------------------------------------------------- fixtures --
-- Two account holders and one guest, sharing a single story.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.profiles (id, full_name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'کاربر الف', '+989120000001'),
  ('22222222-2222-2222-2222-222222222222', 'کاربر ب', '+989120000002');

insert into public.payment_methods (user_id, card_number) values
  ('11111111-1111-1111-1111-111111111111', '6219861012345678'),
  ('22222222-2222-2222-2222-222222222222', '   ');  -- whitespace must count as "no card"

insert into public.stories (id, owner_id, name, template, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'سفر', 'trip', 'CODE1234');

insert into public.story_members (id, story_id, user_id, member_kind, display_name) values
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'registered', null),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'registered', null),
  ('bbbbbbbb-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', null, 'guest', 'مهمان');

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.expenses (id, story_id, title, amount, category, paid_by, participant_person_count)
values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'شام', 300, 'food', 'bbbbbbbb-0000-0000-0000-00000000000a', 3);

insert into public.expense_shares (expense_id, member_id, amount) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000a', 100),
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 100),
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000c', 100);

-- --------------------------------------------------- expense authorship --
select pg_temp.ok(
  (select created_by = '11111111-1111-1111-1111-111111111111'
   from public.expenses where id = 'cccccccc-0000-0000-0000-000000000001'),
  'the insert trigger records who created the expense');

select public.update_story_expense(
  'cccccccc-0000-0000-0000-000000000001', 'ناهار', 300, 'food',
  'bbbbbbbb-0000-0000-0000-00000000000a',
  '[{"member_id":"bbbbbbbb-0000-0000-0000-00000000000a","amount":150,"label":"الف"},
    {"member_id":"bbbbbbbb-0000-0000-0000-00000000000b","amount":150,"label":"ب"}]'::jsonb,
  2);

select pg_temp.ok(
  (select title = 'ناهار' and amount = 300 and participant_person_count = 2
   from public.expenses where id = 'cccccccc-0000-0000-0000-000000000001'),
  'the author can edit the expense');

select pg_temp.ok(
  (select count(*) = 2 and sum(amount) = 300
   from public.expense_shares where expense_id = 'cccccccc-0000-0000-0000-000000000001'),
  'editing replaces the shares rather than appending to them');

select pg_temp.denies($$
  select public.update_story_expense(
    'cccccccc-0000-0000-0000-000000000001', 'ناهار', 300, 'food',
    'bbbbbbbb-0000-0000-0000-00000000000a',
    '[{"member_id":"bbbbbbbb-0000-0000-0000-00000000000a","amount":10}]'::jsonb, 1)
$$, 'shares that do not add up to the total are rejected');

select pg_temp.denies($$
  select public.update_story_expense(
    'cccccccc-0000-0000-0000-000000000001', 'ناهار', 300, 'food',
    'bbbbbbbb-0000-0000-0000-00000000000a',
    '[{"member_id":"bbbbbbbb-0000-0000-0000-00000000000a","amount":150},
      {"member_id":"dddddddd-0000-0000-0000-00000000000d","amount":150}]'::jsonb, 2)
$$, 'a share pointing outside the story is rejected');

select pg_temp.denies($$
  select public.update_story_expense(
    'cccccccc-0000-0000-0000-000000000001', '', 300, 'food',
    'bbbbbbbb-0000-0000-0000-00000000000a',
    '[{"member_id":"bbbbbbbb-0000-0000-0000-00000000000a","amount":300}]'::jsonb, 1)
$$, 'an empty title is rejected');

-- ------------------------------------------------------ other people --
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select pg_temp.denies($$
  select public.update_story_expense(
    'cccccccc-0000-0000-0000-000000000001', 'دستکاری', 300, 'food',
    'bbbbbbbb-0000-0000-0000-00000000000a',
    '[{"member_id":"bbbbbbbb-0000-0000-0000-00000000000a","amount":300}]'::jsonb, 1)
$$, 'someone who did not record the expense cannot edit it');

select pg_temp.denies(
  $$select public.delete_story_expense('cccccccc-0000-0000-0000-000000000001')$$,
  'someone who did not record the expense cannot delete it');

-- ----------------------------------------------------------- card lookup --
select pg_temp.ok(
  (select count(*) = 1
          and bool_and(member_id = 'bbbbbbbb-0000-0000-0000-00000000000a')
          and bool_and(card_number = '6219861012345678')
   from public.story_member_cards('aaaaaaaa-0000-0000-0000-000000000001')),
  'a co-member sees real cards, and blank ones are withheld');

set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select pg_temp.denies(
  $$select * from public.story_member_cards('aaaaaaaa-0000-0000-0000-000000000001')$$,
  'someone outside the story cannot read its cards');

-- ------------------------------------------------------ completed stories --
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.stories set status = 'completed' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.denies(
  $$select public.delete_story_expense('cccccccc-0000-0000-0000-000000000001')$$,
  'a completed story is frozen even for the author');

update public.stories set status = 'active' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------- delete --
select public.delete_story_expense('cccccccc-0000-0000-0000-000000000001');

select pg_temp.ok(
  (select count(*) = 0 from public.expenses where id = 'cccccccc-0000-0000-0000-000000000001')
  and (select count(*) = 0 from public.expense_shares where expense_id = 'cccccccc-0000-0000-0000-000000000001'),
  'deleting an expense takes its shares with it');

-- ------------------------------------------------------------ legacy rows --
-- Expenses that predate the migration have no author and must stay read-only.
insert into public.expenses (id, story_id, title, amount, paid_by)
values ('cccccccc-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'قدیمی', 50, 'bbbbbbbb-0000-0000-0000-00000000000a');
update public.expenses set created_by = null where id = 'cccccccc-0000-0000-0000-000000000009';

select pg_temp.denies(
  $$select public.delete_story_expense('cccccccc-0000-0000-0000-000000000009')$$,
  'an expense with no recorded author cannot be deleted by anyone');

select pg_temp.denies($$
  select public.update_story_expense(
    'cccccccc-0000-0000-0000-000000000009', 'تغییر', 50, 'food',
    'bbbbbbbb-0000-0000-0000-00000000000a',
    '[{"member_id":"bbbbbbbb-0000-0000-0000-00000000000a","amount":50}]'::jsonb, 1)
$$, 'an expense with no recorded author cannot be edited by anyone');

-- ----------------------------------------------------------- signed out --
set request.jwt.claim.sub = '';
select pg_temp.denies(
  $$select * from public.story_member_cards('aaaaaaaa-0000-0000-0000-000000000001')$$,
  'an unauthenticated caller is refused');
