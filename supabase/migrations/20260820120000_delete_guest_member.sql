-- Adding a person to a story was one-way. A name typed by mistake, or a friend
-- who ended up not coming, stayed in the story forever and took a share of
-- every expense split equally from then on; the only way out was deleting the
-- whole story. This removes a guest, and only under conditions where removing
-- one cannot silently change anyone's balance.
--
-- Deliberately narrow:
--   * guests only — a member row belonging to a real account is that person's
--     membership, and the owner does not get to revoke it from here
--   * the story owner only, and only while the story is still open
--   * refused outright once the guest appears in any expense or settlement,
--     because the amounts already recorded against them would have nowhere to
--     go. The caller is told which of the two it is, so the app can say so.
create or replace function public.delete_guest_member(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_story_id uuid;
  member_kind_value text;
  story_status_value text;
  story_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select story_members.story_id, story_members.member_kind
    into member_story_id, member_kind_value
    from public.story_members
    where story_members.id = target_member_id;

  if member_story_id is null then
    raise exception 'Member not found';
  end if;

  if member_kind_value is distinct from 'guest' then
    raise exception 'Only guest members can be removed';
  end if;

  select stories.owner_id, stories.status
    into story_owner, story_status_value
    from public.stories
    where stories.id = member_story_id;

  if story_owner is distinct from auth.uid() then
    raise exception 'Not allowed';
  end if;

  if story_status_value is distinct from 'active' then
    raise exception 'Story is closed';
  end if;

  if exists (select 1 from public.expenses where paid_by = target_member_id)
     or exists (select 1 from public.expense_shares where member_id = target_member_id) then
    raise exception 'Member has expenses';
  end if;

  if exists (
    select 1 from public.settlements
    where from_member_id = target_member_id or to_member_id = target_member_id
  ) then
    raise exception 'Member has settlements';
  end if;

  delete from public.story_members where id = target_member_id;
end;
$$;

revoke all on function public.delete_guest_member(uuid) from public;
grant execute on function public.delete_guest_member(uuid) to authenticated;
