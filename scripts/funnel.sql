-- What the store installs actually did, read from the app's own tables.
--
-- The build in Bazaar and Myket carries no analytics (AppMetrica landed five
-- days after 1.26.6 shipped), so there are no events and none can be
-- recovered. But every step leaves a row behind: a name in profiles, an outing
-- in stories, a split in expenses, a repayment in settlements. That is the
-- funnel, and it has been recording since day one.
--
-- Supabase → SQL Editor → paste → Run. Read-only. One statement on purpose:
-- the editor only shows the result of the last one.

select بخش, مورد, عدد from (
  select 1 as ر, 'قیف' as بخش, 'حساب ساخت (اسمش را داد)' as مورد,
         (select count(*) from public.profiles) as عدد
  union all select 2, 'قیف', 'شماره موبایل وصل کرد',
         (select count(*) from public.profiles where phone not like 'anonymous:%')
  union all select 3, 'قیف', 'شماره کارت ثبت کرد',
         (select count(*) from public.payment_methods where coalesce(card_number,'') <> '')
  union all select 4, 'قیف', 'ماجرا ساخت',
         (select count(distinct owner_id) from public.stories)
  union all select 5, 'قیف', 'عضو یک ماجرا شد',
         (select count(distinct user_id) from public.story_members where user_id is not null)
  union all select 6, 'قیف', 'خرجی به نامش ثبت شد',
         (select count(distinct m.user_id) from public.expenses e
            join public.story_members m on m.id = e.paid_by where m.user_id is not null)
  union all select 7, 'قیف', 'ماجرایی که به تسویه رسید',
         (select count(distinct story_id) from public.settlements)
  union all select 8, 'قیف', 'ماجرای تمام‌شده',
         (select count(*) from public.stories where status = 'completed')

  union all select 20, 'کل', 'همهٔ ماجراها',  (select count(*) from public.stories)
  union all select 21, 'کل', 'همهٔ خرج‌ها',   (select count(*) from public.expenses)
  union all select 22, 'کل', 'همهٔ تسویه‌ها', (select count(*) from public.settlements)
  union all select 23, 'کل', 'اعضای مهمان (بدون اپ)',
         (select count(*) from public.story_members where member_kind = 'guest')

  union all select 30, 'کجا متوقف شدند', 'ماجرا ساخت، هیچ خرجی ثبت نکرد',
         (select count(*) from public.stories s
            where not exists (select 1 from public.expenses e where e.story_id = s.id))
  union all select 31, 'کجا متوقف شدند', 'خرج ثبت کرد، ولی هرگز تسویه نکرد',
         (select count(*) from public.stories s
            where exists (select 1 from public.expenses e where e.story_id = s.id)
              and not exists (select 1 from public.settlements t where t.story_id = s.id))
  union all select 32, 'کجا متوقف شدند', 'تا تسویه رسید',
         (select count(distinct story_id) from public.settlements)
  union all select 33, 'کجا متوقف شدند', 'ماجرای تک‌نفره (اپ اینجا بی‌فایده است)',
         (select count(*) from public.stories s
            where (select count(*) from public.story_members m where m.story_id = s.id) <= 1)
) t order by ر;
