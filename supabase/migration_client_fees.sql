-- ============================================================
--  ترقية متابعة العملاء
--  - أتعاب محسوبة من الإيراد (نسبة، أو خصم ثم هامش)
--  - حالة عقد "قيد التوقيع"
--  آمنة لإعادة التشغيل (idempotent)
-- ============================================================

-- 1) نوع احتساب الأتعاب
--    fixed      : مبلغ شهري ثابت (monthly_amount)
--    percent    : نسبة من الإيراد            → الإيراد × fee_percent%
--    net_markup : خصم ثم هامش على الإيراد     → الإيراد × (1-خصم%) × (1+هامش%)
--    ثم تُضاف ضريبة القيمة المضافة على الناتج في الحالتين المحسوبتين.
alter table public.clients
  add column if not exists fee_type text not null default 'fixed';
alter table public.clients
  add column if not exists fee_percent numeric(6,3) not null default 0;
alter table public.clients
  add column if not exists fee_deduct_percent numeric(6,3) not null default 0;
alter table public.clients
  add column if not exists fee_markup_percent numeric(6,3) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_fee_type_chk') then
    alter table public.clients add constraint clients_fee_type_chk
      check (fee_type in ('fixed','percent','net_markup'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_fee_pcts_chk') then
    alter table public.clients add constraint clients_fee_pcts_chk
      check (fee_percent between 0 and 100
         and fee_deduct_percent between 0 and 100
         and fee_markup_percent between 0 and 1000);
  end if;
end $$;

-- 2) حالة "قيد التوقيع" ضمن حالات العقد
alter table public.clients drop constraint if exists clients_contract_status_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_contract_status_chk') then
    alter table public.clients add constraint clients_contract_status_chk
      check (contract_status in ('active','ended','paused','pending'));
  end if;
end $$;

-- 3) الإيراد المحقق للشهر — أساس حساب الأتعاب المحسوبة
alter table public.client_dues
  add column if not exists revenue_base numeric(14,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_dues_revenue_base_chk') then
    alter table public.client_dues add constraint client_dues_revenue_base_chk
      check (revenue_base >= 0);
  end if;
end $$;

-- تحقق
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'clients' and column_name in
        ('fee_type','fee_percent','fee_deduct_percent','fee_markup_percent'))
    or (table_name = 'client_dues' and column_name = 'revenue_base'))
order by table_name, column_name;
