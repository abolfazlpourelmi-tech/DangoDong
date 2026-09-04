-- Why do 31 of 57 outings collect expenses and then stop?
--
-- Two explanations fit the totals equally well and lead to opposite fixes:
--
--   A. The app cannot say where to send the money. 68% of participants are
--      guests, and a guest can never hold a card number, so the settlement
--      screen ends in "go ask them yourself".
--   B. People settle in cash and never bother recording it. Then the card is
--      irrelevant and the fix is elsewhere entirely.
--
-- Two columns separate them. If A, settled outings should hold noticeably more
-- card-carrying members than unsettled ones. If B, the unsettled group should
-- be full of outings that were *closed* anyway — finishing an outing you never
-- recorded a payment for is exactly what settling in cash looks like.
--
-- Supabase → SQL Editor → paste → Run. Read-only, one statement.

with story_facts as (
  select st.id,
         st.status,
         (select count(*) from public.expenses    e where e.story_id = st.id) as expenses,
         (select count(*) from public.settlements t where t.story_id = st.id) as settlements,
         (select count(*) from public.story_members m
            where m.story_id = st.id and m.member_kind = 'guest')             as guests,
         (select count(*) from public.story_members m
            where m.story_id = st.id and m.user_id is not null)               as registered,
         (select count(*) from public.story_members m
            join public.payment_methods pm on pm.user_id = m.user_id
            where m.story_id = st.id and coalesce(pm.card_number, '') <> '')  as with_card
  from public.stories st
)
select case when settlements > 0 then 'تسویه شد'
            when expenses   > 0 then 'خرج دارد، تسویه ندارد'
            else 'هیچ خرجی ندارد' end                              as گروه,
       count(*)                                                    as ماجرا,
       round(avg(guests), 1)                                       as میانگین_مهمان,
       round(avg(registered), 1)                                   as میانگین_عضو_با_اپ,
       round(avg(with_card), 1)                                    as میانگین_عضو_کارت_دار,
       count(*) filter (where with_card = 0)                       as بدون_هیچ_کارتی,
       count(*) filter (where status = 'completed')                as تمام_شده,
       round(avg(expenses), 1)                                     as میانگین_خرج
from story_facts
group by 1
order by 2 desc;
