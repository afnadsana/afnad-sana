-- ============================================================
--  نظام المتابعة اليومية v2 — المعايير الأساسية + تصدير التقرير
--  (2026-10-07)
--
--  يضيف:
--    1) مرات الظهور لكل (جمعية + يوم + منصة)        → client_reports.impressions
--    2) لقطات عدد المتابعين لكل منصة                 → جدول client_followers
--    3) عدد المحتويات المنفَّذة                       → client_events.qty
--    4) شعار الجهة لتقرير التصدير                    → clients.logo_url + bucket
--
--  آمن لإعادة التشغيل (idempotent). شغّله في SQL Editor بحساب المالك.
-- ============================================================

-- 1) مرات الظهور — تُسجَّل في صفوف المنصات الإعلانية (نفس صف الإنفاق)
alter table public.client_reports
  add column if not exists impressions bigint not null default 0 check (impressions >= 0);

-- 2) لقطات المتابعين: ليست رقماً يومياً بل "قراءة" تُؤخذ وقت الفحص.
--    "قبل" = آخر لقطة ≤ بداية الفترة، "بعد" = آخر لقطة ≤ نهاية الفترة.
create table if not exists public.client_followers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id)    on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  snap_date   date not null,
  platform    text not null default 'x',   -- x | instagram | snapchat | tiktok | youtube | facebook | whatsapp | other
  followers   bigint not null default 0 check (followers >= 0),
  note        text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (client_id, snap_date, platform)
);
create index if not exists client_followers_client_idx on public.client_followers(client_id, snap_date desc);
create index if not exists client_followers_org_idx    on public.client_followers(org_id);

alter table public.client_followers enable row level security;

drop policy if exists client_followers_member_select on public.client_followers;
create policy client_followers_member_select on public.client_followers for select
  using (public.is_member(org_id));

drop policy if exists client_followers_member_write on public.client_followers;
create policy client_followers_member_write on public.client_followers for all
  using (public.can_write(org_id)) with check (public.can_write(org_id));

-- الجهة تقرأ لقطاتها فقط (نفس نمط client_reports_portal_select)
drop policy if exists client_followers_portal_select on public.client_followers;
create policy client_followers_portal_select on public.client_followers for select
  using (client_id = public.my_client_id());

-- 3) عدد المحتويات: حدث واحد قد يمثل عدة قطع ("10 تصاميم" بدل 10 صفوف)
alter table public.client_events
  add column if not exists qty integer not null default 1 check (qty >= 1);

-- 4) شعار الجهة
alter table public.clients
  add column if not exists logo_url text;

-- 4-ب) bucket عام للشعارات (القراءة عامة، والكتابة لأعضاء المنشأة)
insert into storage.buckets (id, name, public)
  values ('client-logos', 'client-logos', true)
  on conflict (id) do nothing;

drop policy if exists client_logos_public_read on storage.objects;
create policy client_logos_public_read on storage.objects for select
  using (bucket_id = 'client-logos');

drop policy if exists client_logos_member_write on storage.objects;
create policy client_logos_member_write on storage.objects for all
  using (bucket_id = 'client-logos' and auth.role() = 'authenticated'
         and not public.is_portal_user())
  with check (bucket_id = 'client-logos' and auth.role() = 'authenticated'
         and not public.is_portal_user());

-- تحقق
select 'client_reports.impressions' as added, count(*) filter (where impressions > 0) as rows_with_value from public.client_reports
union all
select 'client_followers', count(*) from public.client_followers
union all
select 'clients.logo_url', count(*) filter (where logo_url is not null) from public.clients;
