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
  vat_rate    numeric(5,4) not null default 0,
  vat_amount  numeric(14,2) not null default 0,
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
  org_id                 uuid primary key references public.orgs(id) on delete cascade,
  opening_balance        numeric(14,2) not null default 0,
  bank_name              text not null default '',
  vat_registration_date  date,
  default_vat_rate       numeric(5,4) not null default 0.15,
  updated_at             timestamptz not null default now()
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
--  10) دعوة الأعضاء
--     المالك أو المدير فقط يدعو مستخدماً موجوداً مسبقاً (بريده مسجَّل بالفعل)
--     إلى نفس المنظمة بصلاحية محددة.
-- ============================================================
create or replace function public.invite_member(target_email text, target_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare caller_org uuid; caller_role text; target_id uuid;
begin
  select m.org_id, m.role into caller_org, caller_role
    from public.memberships m where m.user_id = auth.uid() limit 1;

  if caller_org is null then
    return jsonb_build_object('ok', false, 'reason', 'لست عضواً في أي منشأة');
  end if;
  if caller_role not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'reason', 'فقط المالك أو المدير يقدر يدعو أعضاء');
  end if;
  if target_role not in ('admin','member','viewer') then
    return jsonb_build_object('ok', false, 'reason', 'صلاحية غير صحيحة');
  end if;

  select u.id into target_id from auth.users u
    where lower(u.email) = lower(trim(target_email)) limit 1;

  if target_id is null then
    return jsonb_build_object('ok', false, 'reason',
      'ما فيه حساب بهذا البريد. اطلب منه يفتح الرابط وينشئ حساب أولاً، ثم أعد المحاولة.');
  end if;

  if exists (select 1 from public.memberships m
             where m.org_id = caller_org and m.user_id = target_id) then
    return jsonb_build_object('ok', false, 'reason', 'هذا العضو مضاف مسبقاً');
  end if;

  insert into public.memberships (user_id, org_id, role)
    values (target_id, caller_org, target_role);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.invite_member(text, text) from public, anon;
grant execute on function public.invite_member(text, text) to authenticated;
revoke all on function public.bootstrap_org(text) from public, anon;
grant execute on function public.bootstrap_org(text) to authenticated;

-- المالك أو المدير يقدر يزيل أي عضو غير نفسه
drop policy if exists memberships_owner_delete on public.memberships;
create policy memberships_owner_delete on public.memberships
  for delete using (
    user_id <> auth.uid()
    and exists (select 1 from public.memberships m
                where m.org_id = memberships.org_id
                  and m.user_id = auth.uid()
                  and m.role in ('owner','admin'))
  );

-- ============================================================
--  11) العملاء والمستحقات الشهرية
--     متابعة الجهات التي تدفع اشتراكاً/رسوماً شهرية متكررة:
--     هل عقدها ساري؟ هل سدّدت شهرها الحالي؟ كم المتأخر عليها إجمالاً؟
-- ============================================================
create table if not exists public.clients (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  entity_id         uuid references public.entities(id) on delete set null,
  name              text not null,
  contract_status   text not null default 'active' check (contract_status in ('active','ended','paused')),
  contract_start    date,
  contract_end      date,
  monthly_amount    numeric(14,2) not null default 0 check (monthly_amount >= 0),
  note              text not null default '',
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists clients_org_idx on public.clients(org_id);

-- مستحقات كل عميل لكل شهر (period = أول يوم من الشهر)
create table if not exists public.client_dues (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  period       date not null,
  amount_due   numeric(14,2) not null default 0 check (amount_due >= 0),
  amount_paid  numeric(14,2) not null default 0 check (amount_paid >= 0),
  paid_date    date,
  note         text not null default '',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, period)
);
create index if not exists client_dues_org_idx    on public.client_dues(org_id);
create index if not exists client_dues_client_idx on public.client_dues(client_id, period desc);

drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
drop trigger if exists client_dues_touch on public.client_dues;
create trigger client_dues_touch before update on public.client_dues
  for each row execute function public.touch_updated_at();

alter table public.clients     enable row level security;
alter table public.client_dues enable row level security;

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select using (public.is_member(org_id));
drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients for all
  using (public.can_write(org_id)) with check (public.can_write(org_id));

drop policy if exists client_dues_select on public.client_dues;
create policy client_dues_select on public.client_dues for select using (public.is_member(org_id));
drop policy if exists client_dues_write on public.client_dues;
create policy client_dues_write on public.client_dues for all
  using (public.can_write(org_id)) with check (public.can_write(org_id));

-- ============================================================
--  انتهى. بعد التشغيل تحقق أن كل الجداول تظهر RLS enabled
--  في: Database ← Tables
-- ============================================================
