-- Providers onboarding schema — signature + payroll + admin lifecycle
--
-- Adds columns to the `providers` table that the admin AddProviderModal writes,
-- plus a `signatures` storage bucket for prescriber signature images used in
-- prescription / referral / medical certificate PDFs.
--
-- Run this in the Supabase SQL editor. Safe to re-run — all statements use
-- IF NOT EXISTS / IF EXISTS guards.

-- ── 1. Add payroll + signature columns to providers ─────────────────────────
alter table providers add column if not exists signature_url text;
alter table providers add column if not exists base_rate numeric(10,2);
alter table providers add column if not exists hourly_rate numeric(10,2);
alter table providers add column if not exists holiday_pay_pct numeric(5,2) default 8.0;
alter table providers add column if not exists bank_account text;
alter table providers add column if not exists ird_number text;
alter table providers add column if not exists tax_code text;
alter table providers add column if not exists contract_type text
  check (contract_type in ('contractor','employee') or contract_type is null);
alter table providers add column if not exists contract_signed_at timestamptz;

comment on column providers.signature_url is
  'Supabase Storage URL to the prescriber signature image. Used in prescription PDFs.';
comment on column providers.base_rate is
  'Per-consultation payment rate in NZD. Contractor default.';
comment on column providers.hourly_rate is
  'Optional alternate hourly rate for shift-based providers.';
comment on column providers.holiday_pay_pct is
  'Holiday pay percentage on top of base_rate (default 8 percent).';
comment on column providers.bank_account is
  'NZ bank account number for payments. Highly sensitive — admin-only column.';
comment on column providers.ird_number is
  'IRD tax number. Highly sensitive — admin-only column.';
comment on column providers.tax_code is
  'NZ tax code (M, ME, S, SB, ST, etc.).';
comment on column providers.contract_type is
  'contractor or employee. Different tax and holiday-pay treatment.';

-- ── 2. Create signatures storage bucket ────────────────────────────────────
-- Bucket is public with UUID-based filenames — signatures are rendered on
-- prescription PDFs anyway, and the paths are not linked from anywhere
-- externally. This is a pragmatic trade-off vs. maintaining signed-URL
-- flows in every render surface.
insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', true)
on conflict (id) do update set public = true;

-- Storage policies — authenticated users can upload; anyone can read (public bucket).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'signatures_authenticated_write'
  ) then
    execute $pol$
      create policy signatures_authenticated_write on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'signatures')
    $pol$;
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'signatures_authenticated_update'
  ) then
    execute $pol$
      create policy signatures_authenticated_update on storage.objects
      for update
      to authenticated
      using (bucket_id = 'signatures')
    $pol$;
  end if;
end $$;

-- ── 3. Grant admin PATCH access to payroll columns via existing API ────────
-- No SQL change needed — /api/providers PATCH allowlist is expanded in the
-- endpoint code. This migration just makes the columns exist.

-- ── 4. Sanity check ─────────────────────────────────────────────────────────
-- Verify the columns were added.
select
  count(*) filter (where column_name = 'signature_url')       as has_signature_url,
  count(*) filter (where column_name = 'base_rate')           as has_base_rate,
  count(*) filter (where column_name = 'ird_number')          as has_ird_number,
  count(*) filter (where column_name = 'contract_type')       as has_contract_type
from information_schema.columns
where table_schema = 'public' and table_name = 'providers';
