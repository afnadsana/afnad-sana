-- ============================================================
--  مخطط قاعدة البيانات — نظام مسار التسويق وإدارة الإعلانات
--  شغّل هذا الملف كاملاً في:  Supabase ← SQL Editor ← New query
-- ============================================================

-- ------------------------------------------------------------
-- 1) المنظمات والعضويات (لمشاركة الفريق)
-- ------------------------------------------------------------
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id)
);

create index if not exists memberships_org_idx  on public.memberships(org_id);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- دالة مساعدة: هل المستخدم الحالي عضو في هذه المنظمة؟
-- security definer لتفادي التكرار اللانهائي في سياسات RLS.
create or replace function public.is_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

-- هل المستخدم الحالي يملك صلاحية الكتابة؟ (كل الأدوار عدا viewer)
create or replace function public.can_write(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','member')
  );
$$;

-- ------------------------------------------------------------
-- 2) المنشآت والقنوات
-- ------------------------------------------------------------
create table if not exists public.entities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  color       text not null default '#4f46e5',
  icon        text not null default 'dot',
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3) الإدخالات التسويقية اليومية
-- ------------------------------------------------------------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  entity_id   uuid not null references public.entities(id) on delete restrict,
  channel_id  uuid not null references public.channels(id) on delete restrict,
  date        date not null,
  cost        numeric(14,2) not null default 0 check (cost   >= 0),
  orders      integer       not null default 0 check (orders >= 0),
  sales       numeric(14,2) not null default 0 check (sales  >= 0),
  cogs        numeric(14,2) not null default 0 check (cogs   >= 0),
  note        text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists entries_org_date_idx on public.entries(org_id, date desc);
create index if not exists entries_channel_idx  on public.entries(channel_id);

-- ------------------------------------------------------------
-- 4) الفواتير (دفتر الحساب البنكي)
-- ------------------------------------------------------------
create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  entity_id   uuid not null references public.entities(id) on delete restrict,
  date        date not null,
  dir         text not null check (dir in ('in','out')),
  amount      numeric(14,2) not null check (amount > 0),
  party       text not null default '',
  invoice_no  text not null default '',
  category    text not null default 'أخرى',
  method      text not null default 'تحويل بنكي',
  status      text not null default 'paid' check (status in ('paid','unpaid')),
  note        text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists invoices_org_date_idx on public.invoices(org_id, date desc);
create index if not exists invoices_status_idx   on public.invoices(org_id, status);

-- ------------------------------------------------------------
-- 5) الإعدادات (صف واحد لكل منظمة)
-- ------------------------------------------------------------
create table if not exists public.settings (
  org_id           uuid primary key references public.orgs(id) on delete cascade,
  opening_balance  numeric(14,2) not null default 0,
  bank_name        text not null default '',
  updated_at       timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6) سجل التعديلات
-- ------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigserial primary key,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text not null default '',
  action      text not null,
  detail      text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists audit_org_time_idx on public.audit_log(org_id, created_at desc);

-- ------------------------------------------------------------
-- 7) تحديث updated_at تلقائياً
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entries_touch  on public.entries;
create trigger entries_touch  before update on public.entries
  for each row execute function public.touch_updated_at();

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ============================================================
--  8) سياسات الحماية (Row Level Security)
--     بدونها أي شخص معه المفتاح العلني يقرأ كل البيانات.
--     القاعدة: لا تُقرأ ولا تُكتب أي صفوف إلا لأعضاء المنظمة.
-- ============================================================
alter table public.orgs        enable row level security;
alter table public.memberships enable row level security;
alter table public.entities    enable row level security;
alter table public.channels    enable row level security;
alter table public.entries     enable row level security;
alter table public.invoices    enable row level security;
alter table public.settings    enable row level security;
alter table public.audit_log   enable row level security;

-- المنظمات: يراها أعضاؤها فقط
drop policy if exists orgs_select on public.orgs;
create policy orgs_select on public.orgs
  for select using (public.is_member(id));

-- العضويات: كل مستخدم يرى عضوياته، والمالك/المدير يرى أعضاء منظمته
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select using (user_id = auth.uid() or public.is_member(org_id));

-- جدول بيانات عادي: قراءة للأعضاء، كتابة لمن يملك الصلاحية
-- (نكرر النمط لكل جدول)

drop policy if exists entities_select on public.entities;
create policy entities_select on public.entities
  for select using (public.is_member(org_id));
drop policy if exists entities_write on public.entities;
create policy entities_write on public.entities
  for all using (public.can_write(org_id)) with check (public.can_write(org_id));

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select using (public.is_member(org_id));
drop policy if exists channels_write on public.channels;
create policy channels_write on public.channels
  for all using (public.can_write(org_id)) with check (public.can_write(org_id));

drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries
  for select using (public.is_member(org_id));
drop policy if exists entries_write on public.entries;
create policy entries_write on public.entries
  for all using (public.can_write(org_id)) with check (public.can_write(org_id));

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (public.is_member(org_id));
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices
  for all using (public.can_write(org_id)) with check (public.can_write(org_id));

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select using (public.is_member(org_id));
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for all using (public.can_write(org_id)) with check (public.can_write(org_id));

-- السجل: قراءة للأعضاء، إضافة فقط (لا تعديل ولا حذف)
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (public.is_member(org_id));
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert with check (public.can_write(org_id));

-- ============================================================
--  9) تهيئة منظمة جديدة تلقائياً عند أول تسجيل دخول
--     ينشئ منظمة + عضوية مالك + منشأة وقنوات افتراضية.
-- ============================================================
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

  -- القنوات الافتراضية بألوان اللوحة المُتحقَّق منها
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

-- ============================================================
--  انتهى. بعد التشغيل تحقق أن كل الجداول تظهر RLS enabled
--  في: Database ← Tables
-- ============================================================
