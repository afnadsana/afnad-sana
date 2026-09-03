-- ============================================================
--  بوابة الجهات — حسابات دخول للجمعيات + تقارير أداء يومية
--
--  مبدأ العزل: مستخدم البوابة ليس عضواً في المنشأة (لا يوجد له صف
--  في memberships)، لذلك كل سياسات is_member/can_write الحالية
--  ترفضه تلقائياً — فلا يرى الفواتير ولا الإدخالات ولا الإعدادات.
--  ثم نمنحه صراحةً قراءة صف جهته فقط ومستحقاتها وتقاريرها.
--  آمن لإعادة التشغيل (idempotent)
-- ============================================================

-- 1) ربط مستخدم دخول بجهة واحدة
create table if not exists public.client_users (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id)    on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  user_id    uuid not null references auth.users(id)     on delete cascade,
  email      text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id)               -- مستخدم واحد = جهة واحدة فقط
);
create index if not exists client_users_client_idx on public.client_users(client_id);
create index if not exists client_users_org_idx    on public.client_users(org_id);

-- 2) تقرير الأداء اليومي لكل جهة
create table if not exists public.client_reports (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id)    on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  report_date  date not null,
  spend        numeric(14,2) not null default 0 check (spend   >= 0),  -- كم أنفقنا
  revenue      numeric(14,2) not null default 0 check (revenue >= 0),  -- كم العائد
  reach        bigint        not null default 0 check (reach   >= 0),  -- الوصول
  leads        integer       not null default 0 check (leads   >= 0),  -- التفاعلات
  achievements text not null default '',                               -- المنجزات
  note         text not null default '',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, report_date)
);
create index if not exists client_reports_client_idx on public.client_reports(client_id, report_date desc);
create index if not exists client_reports_org_idx    on public.client_reports(org_id);

drop trigger if exists client_reports_touch on public.client_reports;
create trigger client_reports_touch before update on public.client_reports
  for each row execute function public.touch_updated_at();

-- 3) دوال مساعدة — security definer لتفادي الدوران في سياسات RLS
create or replace function public.my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from public.client_users where user_id = auth.uid() limit 1;
$$;

create or replace function public.is_portal_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.client_users where user_id = auth.uid());
$$;

revoke all on function public.my_client_id()   from public, anon;
revoke all on function public.is_portal_user() from public, anon;
grant execute on function public.my_client_id()   to authenticated;
grant execute on function public.is_portal_user() to authenticated;

-- 4) تفعيل RLS
alter table public.client_users   enable row level security;
alter table public.client_reports enable row level security;

-- client_users: المالك/المدير يدير، ومستخدم البوابة يقرأ صفه فقط
drop policy if exists client_users_manage on public.client_users;
create policy client_users_manage on public.client_users for all
  using (public.can_write(org_id)) with check (public.can_write(org_id));

drop policy if exists client_users_self on public.client_users;
create policy client_users_self on public.client_users for select
  using (user_id = auth.uid());

-- client_reports: الأعضاء يقرأون الكل ويكتبون، والجهة تقرأ تقاريرها فقط
drop policy if exists client_reports_member_select on public.client_reports;
create policy client_reports_member_select on public.client_reports for select
  using (public.is_member(org_id));

drop policy if exists client_reports_member_write on public.client_reports;
create policy client_reports_member_write on public.client_reports for all
  using (public.can_write(org_id)) with check (public.can_write(org_id));

drop policy if exists client_reports_portal_select on public.client_reports;
create policy client_reports_portal_select on public.client_reports for select
  using (client_id = public.my_client_id());

-- 5) قراءة الجهة لبياناتها هي فقط (إضافة إلى سياسات الأعضاء القائمة)
drop policy if exists clients_portal_select on public.clients;
create policy clients_portal_select on public.clients for select
  using (id = public.my_client_id());

drop policy if exists client_dues_portal_select on public.client_dues;
create policy client_dues_portal_select on public.client_dues for select
  using (client_id = public.my_client_id());

-- 6) منع مستخدم البوابة من إنشاء منشأة له عبر bootstrap_org
-- نسخة طبق الأصل من schema.sql، أُضيف إليها حارس واحد فقط في الأعلى
create or replace function public.bootstrap_org(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
  ent     uuid;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  -- حسابات بوابة الجهات لا تملك منشأة ولا تدخل النظام الرئيسي
  if exists (select 1 from public.client_users cu where cu.user_id = auth.uid()) then
    raise exception 'هذا الحساب خاص ببوابة الجهات';
  end if;

  -- لا تنشئ منظمة ثانية لمستخدم لديه واحدة
  select m.org_id into new_org
  from public.memberships m where m.user_id = auth.uid() limit 1;
  if new_org is not null then
    return new_org;
  end if;

  insert into public.orgs (name) values (coalesce(nullif(org_name,''), 'منشأتي'))
    returning id into new_org;

  insert into public.memberships (user_id, org_id, role)
    values (auth.uid(), new_org, 'owner');

  insert into public.settings (org_id) values (new_org);

  insert into public.entities (org_id, name)
    values (new_org, 'المنشأة الرئيسية') returning id into ent;

  insert into public.channels (org_id, name, color, icon) values
    (new_org, 'الترويج',          '#4f46e5', 'send'),
    (new_org, 'المؤثرين',         '#f97316', 'users'),
    (new_org, 'ميتا (انستقرام)',  '#db2777', 'camera'),
    (new_org, 'سناب شات',         '#ca8a04', 'ghost'),
    (new_org, 'جوجل',             '#0284c7', 'search'),
    (new_org, 'الواتساب',         '#16a34a', 'chat'),
    (new_org, 'تيك توك',          '#7e22ce', 'music'),
    (new_org, 'واتساب بزنس',      '#0d9488', 'chat');

  return new_org;
end $$;

revoke all on function public.bootstrap_org(text) from public, anon;
grant execute on function public.bootstrap_org(text) to authenticated;

-- تحقق
select 'client_users'   as t, count(*) from public.client_users
union all
select 'client_reports' as t, count(*) from public.client_reports;
