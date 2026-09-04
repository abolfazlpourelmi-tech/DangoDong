-- Every outing, one row each, and how far it got. Run after funnel.sql.
-- This is where an outing created and then abandoned becomes visible.
select s.created_at::date as ساخته_شده,
       s.template         as نوع,
       s.status           as وضعیت,
       (select count(*) from public.story_members m where m.story_id = s.id) as اعضا,
       (select count(*) from public.story_members m where m.story_id = s.id and m.user_id is not null) as اعضای_با_اپ,
       (select count(*) from public.expenses    e where e.story_id = s.id) as خرج,
       (select count(*) from public.settlements t where t.story_id = s.id) as تسویه
from public.stories s
order by s.created_at desc;
