-- RT LAB V2 — M1 Schema
-- Run in Supabase SQL Editor (or CLI migration).
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS pattern where needed.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.rt_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Patients (single source of truth for person)
-- ---------------------------------------------------------------------------
create table if not exists public.patients (
  id            text primary key,
  full_name     text not null,
  gender        text check (gender is null or gender in ('Male','Female','Other','Unknown')),
  dob           date,
  age_text      text,
  phone         text,
  whatsapp      text,
  address       text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_patients_phone on public.patients (phone);
create index if not exists idx_patients_name on public.patients (full_name);

drop trigger if exists trg_patients_updated on public.patients;
create trigger trg_patients_updated
before update on public.patients
for each row execute function public.rt_set_updated_at();

-- ---------------------------------------------------------------------------
-- Memberships / loyalty (Booking/CRM)
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id            text primary key,
  patient_id    text references public.patients(id) on delete set null,
  card_number   text unique,
  plan_code     text,
  plan_name     text,
  points        integer not null default 0,
  status        text not null default 'ACTIVE',
  starts_at     date,
  ends_at       date,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_memberships_patient on public.memberships (patient_id);

drop trigger if exists trg_memberships_updated on public.memberships;
create trigger trg_memberships_updated
before update on public.memberships
for each row execute function public.rt_set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id                text primary key,
  patient_id        text references public.patients(id) on delete set null,
  full_name         text,
  phone             text,
  whatsapp          text,
  age_text          text,
  gender            text,
  visit_type        text check (visit_type is null or visit_type in ('branch','home')),
  address           text,
  appointment_at    timestamptz,
  preferred_date    date,
  preferred_time    text,
  prescription_url  text,
  status            text not null default 'NEW'
                    check (status in (
                      'NEW','REVIEWING','QUOTED','CONFIRMED','CANCELLED','COMPLETED'
                    )),
  subtotal          numeric(12,2) not null default 0,
  discount          numeric(12,2) not null default 0,
  home_fee          numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  membership_id     text references public.memberships(id) on delete set null,
  notes             text,
  quoted_at         timestamptz,
  confirmed_at      timestamptz,
  lab_order_id      text,
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_bookings_status on public.bookings (status);
create index if not exists idx_bookings_patient on public.bookings (patient_id);
create index if not exists idx_bookings_phone on public.bookings (phone);

drop trigger if exists trg_bookings_updated on public.bookings;
create trigger trg_bookings_updated
before update on public.bookings
for each row execute function public.rt_set_updated_at();

create table if not exists public.booking_tests (
  id            bigserial primary key,
  booking_id    text not null references public.bookings(id) on delete cascade,
  test_code     text not null,
  test_name     text,
  price         numeric(12,2) not null default 0,
  unique (booking_id, test_code)
);

-- ---------------------------------------------------------------------------
-- Test catalog (Result Engine foundation)
-- ---------------------------------------------------------------------------
create table if not exists public.test_definitions (
  code          text primary key,
  name_en       text not null,
  name_ar       text,
  category      text not null default 'General',
  test_type     text not null default 'single'
                check (test_type in ('single','profile','package')),
  price         numeric(12,2) not null default 0,
  unit          text,
  sample_type   text,
  sort_order    integer not null default 100,
  active        boolean not null default true,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_test_definitions_updated on public.test_definitions;
create trigger trg_test_definitions_updated
before update on public.test_definitions
for each row execute function public.rt_set_updated_at();

create table if not exists public.test_parameters (
  id            bigserial primary key,
  profile_code  text not null references public.test_definitions(code) on delete cascade,
  param_code    text not null,
  name_en       text not null,
  name_ar       text,
  unit          text,
  sort_order    integer not null default 50,
  is_calculated boolean not null default false,
  formula       text,
  unique (profile_code, param_code)
);

create index if not exists idx_test_parameters_profile on public.test_parameters (profile_code, sort_order);

create table if not exists public.reference_ranges (
  id              bigserial primary key,
  param_code      text not null,
  profile_code    text,
  sex             text check (sex is null or sex in ('Male','Female','Any')),
  age_min_years   numeric(6,2),
  age_max_years   numeric(6,2),
  condition_code  text, -- e.g. pregnant_t1, child, neonate
  min_value       numeric,
  max_value       numeric,
  ref_text        text,
  critical_low    numeric,
  critical_high   numeric,
  unit            text,
  priority        integer not null default 100,
  active          boolean not null default true
);

create index if not exists idx_reference_ranges_param on public.reference_ranges (param_code, active);

-- ---------------------------------------------------------------------------
-- Lab orders
-- ---------------------------------------------------------------------------
create table if not exists public.lab_orders (
  id              text primary key,
  patient_id      text not null references public.patients(id),
  booking_id      text references public.bookings(id) on delete set null,
  doctor          text,
  priority        text not null default 'Routine',
  status          text not null default 'CREATED'
                  check (status in (
                    'CREATED','SAMPLE_PENDING','COLLECTED','RECEIVED','PROCESSING',
                    'RESULTS_PENDING','VERIFICATION','FINAL','RELEASED','CANCELLED'
                  )),
  branch          text,
  clinical_notes  text,
  interpretation  text,
  created_by      text,
  verified_by     text,
  verified_at     timestamptz,
  released_at     timestamptz,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_lab_orders_status on public.lab_orders (status);
create index if not exists idx_lab_orders_patient on public.lab_orders (patient_id);
create index if not exists idx_lab_orders_booking on public.lab_orders (booking_id);

drop trigger if exists trg_lab_orders_updated on public.lab_orders;
create trigger trg_lab_orders_updated
before update on public.lab_orders
for each row execute function public.rt_set_updated_at();

-- optional back-link from bookings.lab_order_id (no strict FK cycle required)

create table if not exists public.order_tests (
  id            bigserial primary key,
  order_id      text not null references public.lab_orders(id) on delete cascade,
  test_code     text not null references public.test_definitions(code),
  price         numeric(12,2) not null default 0,
  unique (order_id, test_code)
);

-- ---------------------------------------------------------------------------
-- Samples
-- ---------------------------------------------------------------------------
create table if not exists public.samples (
  id              text primary key,
  order_id        text not null references public.lab_orders(id) on delete cascade,
  sample_type     text,
  status          text not null default 'PENDING'
                  check (status in ('PENDING','COLLECTED','RECEIVED','REJECTED')),
  collected_at    timestamptz,
  collected_by    text,
  received_at     timestamptz,
  received_by     text,
  rejected_reason text,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_samples_order on public.samples (order_id);

drop trigger if exists trg_samples_updated on public.samples;
create trigger trg_samples_updated
before update on public.samples
for each row execute function public.rt_set_updated_at();

-- ---------------------------------------------------------------------------
-- Result lines (immutable versions after release; new version on correction)
-- ---------------------------------------------------------------------------
create table if not exists public.result_lines (
  id              bigserial primary key,
  order_id        text not null references public.lab_orders(id) on delete cascade,
  test_code       text not null,
  param_code      text not null,
  value_text      text,
  value_num       numeric,
  unit            text,
  ref_text        text,
  flag            text not null default 'N'
                  check (flag in ('N','L','H','LL','HH','POS','NEG','EQ','NA')),
  comment_lab     text,
  comment_medical text,
  version         integer not null default 1,
  is_current      boolean not null default true,
  entered_by      text,
  entered_at      timestamptz not null default now(),
  unique (order_id, test_code, param_code, version)
);

create index if not exists idx_result_lines_order on public.result_lines (order_id, is_current);
create index if not exists idx_result_lines_param on public.result_lines (param_code);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id              text primary key,
  order_id        text not null references public.lab_orders(id) on delete cascade,
  mode            text not null default 'standard'
                  check (mode in ('standard','professional','premium')),
  status          text not null default 'DRAFT'
                  check (status in ('DRAFT','FINAL','RELEASED','CORRECTED')),
  secure_token    text not null unique default encode(gen_random_bytes(24), 'hex'),
  summary_text    text,
  recommendations text,
  html_snapshot   text,
  pdf_path        text,
  version         integer not null default 1,
  released_at     timestamptz,
  released_by     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_reports_order on public.reports (order_id);
create unique index if not exists idx_reports_token on public.reports (secure_token);

drop trigger if exists trg_reports_updated on public.reports;
create trigger trg_reports_updated
before update on public.reports
for each row execute function public.rt_set_updated_at();

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id            text primary key,
  order_id      text references public.lab_orders(id) on delete set null,
  booking_id    text references public.bookings(id) on delete set null,
  patient_id    text references public.patients(id) on delete set null,
  amount        numeric(12,2) not null,
  method        text,
  status        text not null default 'PAID',
  paid_at       timestamptz default now(),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_payments_order on public.payments (order_id);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id            bigserial primary key,
  actor         text,
  action        text not null,
  entity_type   text,
  entity_id     text,
  before_data   jsonb,
  after_data    jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_audit_created on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Seed: CBC parameters (Result Engine starter)
-- ---------------------------------------------------------------------------
insert into public.test_definitions (code, name_en, name_ar, category, test_type, price, unit, sort_order)
values
  ('CBC', 'Complete Blood Count', 'صورة الدم الكاملة', 'Hematology', 'profile', 150, 'Panel', 10),
  ('LIPID', 'Lipid Profile', 'دهون الدم', 'Chemistry', 'profile', 200, 'Panel', 20),
  ('LFT', 'Liver Function Tests', 'وظائف كبد', 'Chemistry', 'profile', 250, 'Panel', 30),
  ('KFT', 'Kidney Function Tests', 'وظائف كلى', 'Chemistry', 'profile', 250, 'Panel', 40),
  ('URINE', 'Complete Urinalysis', 'تحليل بول كامل', 'Urinalysis', 'profile', 80, 'Panel', 50),
  ('Hb', 'Hemoglobin', 'هيموجلوبين', 'Hematology', 'single', 60, 'g/dL', 11),
  ('GLU', 'Glucose Fasting', 'سكر صائم', 'Chemistry', 'single', 50, 'mg/dL', 60)
on conflict (code) do nothing;

insert into public.test_parameters (profile_code, param_code, name_en, unit, sort_order)
values
  ('CBC','Hb','Hemoglobin','g/dL',10),
  ('CBC','HCT','Hematocrit','%',20),
  ('CBC','RBC','RBC','10^6/µL',30),
  ('CBC','MCV','MCV','fL',40),
  ('CBC','MCH','MCH','pg',50),
  ('CBC','MCHC','MCHC','g/dL',60),
  ('CBC','RDW','RDW','%',70),
  ('CBC','WBC','WBC','10^3/µL',80),
  ('CBC','NEUT','Neutrophils','%',90),
  ('CBC','LYMPH','Lymphocytes','%',100),
  ('CBC','MONO','Monocytes','%',110),
  ('CBC','EOS','Eosinophils','%',120),
  ('CBC','BASO','Basophils','%',130),
  ('CBC','PLT','Platelets','10^3/µL',140),
  ('LIPID','CHOL','Total Cholesterol','mg/dL',10),
  ('LIPID','TG','Triglycerides','mg/dL',20),
  ('LIPID','HDL','HDL','mg/dL',30),
  ('LIPID','LDL','LDL','mg/dL',40),
  ('LIPID','VLDL','VLDL','mg/dL',50)
on conflict (profile_code, param_code) do nothing;

insert into public.reference_ranges (param_code, profile_code, sex, min_value, max_value, ref_text, critical_low, critical_high, unit, priority)
values
  ('Hb','CBC','Male',13.5,17.5,'Male: 13.5 – 17.5',7,20,'g/dL',10),
  ('Hb','CBC','Female',12.0,15.5,'Female: 12.0 – 15.5',7,20,'g/dL',10),
  ('HCT','CBC','Male',41,50,'Male: 41 – 50',null,null,'%',20),
  ('HCT','CBC','Female',36,46,'Female: 36 – 46',null,null,'%',20),
  ('RBC','CBC','Male',4.5,5.9,'Male: 4.5 – 5.9',null,null,'10^6/µL',30),
  ('RBC','CBC','Female',4.1,5.1,'Female: 4.1 – 5.1',null,null,'10^6/µL',30),
  ('WBC','CBC','Any',4.0,11.0,'4.0 – 11.0',2,30,'10^3/µL',80),
  ('PLT','CBC','Any',150,450,'150 – 450',50,1000,'10^3/µL',140),
  ('CHOL','LIPID','Any',null,200,'Desirable < 200',null,null,'mg/dL',10),
  ('TG','LIPID','Any',null,150,'Desirable < 150',null,null,'mg/dL',20),
  ('HDL','LIPID','Any',40,null,'≥ 40',null,null,'mg/dL',30),
  ('LDL','LIPID','Any',null,100,'Optimal < 100',null,null,'mg/dL',40)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS baseline
-- NOTE: Tighten with auth.uid() roles in M1.5. Until Auth is wired, policies
-- allow authenticated + anon read/write for lab operations (dev only).
-- Public anonymous access is limited to reports by secure_token via RPC below.
-- ---------------------------------------------------------------------------
alter table public.patients enable row level security;
alter table public.memberships enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_tests enable row level security;
alter table public.test_definitions enable row level security;
alter table public.test_parameters enable row level security;
alter table public.reference_ranges enable row level security;
alter table public.lab_orders enable row level security;
alter table public.order_tests enable row level security;
alter table public.samples enable row level security;
alter table public.result_lines enable row level security;
alter table public.reports enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;

-- Dev-open policies (replace with role-based policies after Supabase Auth)
do $$
declare
  t text;
begin
  foreach t in array array[
    'patients','memberships','bookings','booking_tests','test_definitions',
    'test_parameters','reference_ranges','lab_orders','order_tests','samples',
    'result_lines','reports','payments','audit_log'
  ]
  loop
    execute format('drop policy if exists rt_dev_all on public.%I', t);
    execute format(
      'create policy rt_dev_all on public.%I for all using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- Public: fetch released report by token only (no full table read required from client)
create or replace function public.get_report_by_token(p_token text)
returns table (
  report_id text,
  order_id text,
  mode text,
  status text,
  summary_text text,
  recommendations text,
  html_snapshot text,
  released_at timestamptz,
  patient_name text,
  gender text,
  age_text text
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.order_id,
    r.mode,
    r.status,
    r.summary_text,
    r.recommendations,
    r.html_snapshot,
    r.released_at,
    p.full_name,
    p.gender,
    p.age_text
  from public.reports r
  join public.lab_orders o on o.id = r.order_id
  join public.patients p on p.id = o.patient_id
  where r.secure_token = p_token
    and r.status in ('FINAL','RELEASED','CORRECTED')
  limit 1;
$$;

revoke all on function public.get_report_by_token(text) from public;
grant execute on function public.get_report_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Confirm booking → create patient (if needed) + lab order skeleton
-- ---------------------------------------------------------------------------
create or replace function public.confirm_booking_to_order(
  p_booking_id text,
  p_order_id text default null,
  p_branch text default null,
  p_created_by text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_patient_id text;
  v_order_id text;
  rec record;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found: %', p_booking_id;
  end if;

  if b.status = 'CANCELLED' then
    raise exception 'Booking cancelled';
  end if;

  -- Ensure patient
  if b.patient_id is not null then
    v_patient_id := b.patient_id;
  else
    v_patient_id := 'P-' || to_char(now(), 'YYYYMMDD') || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 6);
    insert into public.patients (id, full_name, gender, age_text, phone, whatsapp, address)
    values (
      v_patient_id,
      coalesce(nullif(b.full_name,''), 'Unknown'),
      b.gender,
      b.age_text,
      b.phone,
      b.whatsapp,
      b.address
    );
    update public.bookings set patient_id = v_patient_id where id = b.id;
  end if;

  v_order_id := coalesce(nullif(p_order_id,''), 'RT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('lab_orders_seq')::text, 6, '0'));

  begin
    create sequence if not exists lab_orders_seq;
  exception when others then
    null;
  end;

  if p_order_id is null then
    v_order_id := 'RT-' || to_char(now(), 'YYYY') || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  end if;

  insert into public.lab_orders (id, patient_id, booking_id, status, branch, created_by)
  values (v_order_id, v_patient_id, b.id, 'CREATED', p_branch, p_created_by);

  for rec in select test_code, price from public.booking_tests where booking_id = b.id
  loop
    insert into public.order_tests (order_id, test_code, price)
    values (v_order_id, rec.test_code, rec.price)
    on conflict (order_id, test_code) do nothing;
  end loop;

  insert into public.samples (id, order_id, status)
  values (
    'S-' || substr(encode(gen_random_bytes(5), 'hex'), 1, 10),
    v_order_id,
    'PENDING'
  );

  update public.bookings
  set status = 'CONFIRMED',
      confirmed_at = now(),
      lab_order_id = v_order_id,
      updated_at = now()
  where id = b.id;

  insert into public.audit_log (actor, action, entity_type, entity_id, after_data)
  values (
    p_created_by,
    'CONFIRM_BOOKING_TO_ORDER',
    'booking',
    b.id,
    jsonb_build_object('order_id', v_order_id, 'patient_id', v_patient_id)
  );

  return v_order_id;
end;
$$;

grant execute on function public.confirm_booking_to_order(text, text, text, text) to authenticated;

-- Done
notify pgrst, 'reload schema';
