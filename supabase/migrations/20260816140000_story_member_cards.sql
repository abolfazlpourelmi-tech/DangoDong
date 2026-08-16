-- Settling up means knowing where to send the money, so members of a story need
-- to see each other's card numbers. payment_methods stays locked to its owner
-- under RLS; this function is the only way out, and it hands a card over only to
-- someone who shares a story with that person.
create or replace function public.story_member_cards(target_story_id uuid)
returns table (member_id uuid, card_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.story_members
    where story_id = target_story_id
      and user_id = auth.uid()
  ) then
    raise exception 'Not allowed';
  end if;

  return query
    select story_members.id, payment_methods.card_number
    from public.story_members
    join public.payment_methods on payment_methods.user_id = story_members.user_id
    where story_members.story_id = target_story_id
      and story_members.user_id is not null
      and coalesce(btrim(payment_methods.card_number), '') <> '';
end;
$$;

revoke all on function public.story_member_cards(uuid) from public;
grant execute on function public.story_member_cards(uuid) to authenticated;
