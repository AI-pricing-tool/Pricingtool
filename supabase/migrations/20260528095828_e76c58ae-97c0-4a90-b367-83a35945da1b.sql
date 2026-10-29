
-- ============ ENUMS ============
create type public.app_role as enum ('super_admin', 'reseller', 'viewer');
create type public.merchant_stage as enum ('creating_proposal','proposed','contract_sent','contract_signed','onboarding','implementation','live');
create type public.statement_status as enum ('uploaded','processing','extracted','reviewed','failed');
create type public.line_status as enum ('unmapped','suggested','approved','manual');
create type public.card_scheme as enum ('visa','mastercard','amex','other');
create type public.card_funding as enum ('debit','credit','prepaid','unknown');
create type public.card_category as enum ('consumer','business','commercial','corporate');
create type public.region_code as enum ('uk','eu','non_eu','intra','inter');

-- ============ CORE TENANCY ============
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  brand_color text,
  is_super boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  organisation_id uuid references public.organisations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, organisation_id)
);

-- Security definer role helper
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select organisation_id from public.profiles where id = auth.uid()
$$;

-- ============ TAXONOMY ============
create table public.canonical_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  scheme public.card_scheme,
  funding public.card_funding,
  card_category public.card_category,
  region public.region_code,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create table public.fee_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  description text,
  unit text check (unit in ('percent','per_item','monthly','fixed')) not null default 'percent',
  created_at timestamptz not null default now()
);

create table public.semantic_tokens (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  expansion text not null,
  context text,
  created_at timestamptz not null default now()
);

create table public.mapping_dictionary (
  id uuid primary key default gen_random_uuid(),
  acquirer text not null,
  raw_description text not null,
  raw_description_normalized text generated always as (lower(regexp_replace(raw_description,'\s+',' ','g'))) stored,
  canonical_category_id uuid references public.canonical_categories(id) on delete set null,
  fee_category_id uuid references public.fee_categories(id) on delete set null,
  confidence numeric(5,4) not null default 1.0,
  usage_count int not null default 0,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  source text not null default 'manual' check (source in ('manual','seed','ai','correction')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (acquirer, raw_description_normalized)
);

create index on public.mapping_dictionary (acquirer);
create index on public.mapping_dictionary (raw_description_normalized);

-- ============ MERCHANTS / STATEMENTS ============
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  mid text,
  acquirer text,
  industry text,
  stage public.merchant_stage not null default 'creating_proposal',
  monthly_volume numeric(14,2),
  monthly_transactions int,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.merchants (organisation_id);

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  merchant_id uuid references public.merchants(id) on delete cascade,
  acquirer text,
  period_start date,
  period_end date,
  file_path text,
  file_name text,
  file_type text,
  status public.statement_status not null default 'uploaded',
  confidence_score numeric(5,4),
  total_volume numeric(14,2),
  total_fees numeric(14,2),
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.statements (organisation_id);
create index on public.statements (merchant_id);

create table public.statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.statements(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  raw_description text not null,
  acquirer text,
  txn_count int,
  txn_value numeric(14,2),
  raw_rate numeric(8,5),
  extracted_fee numeric(14,4),
  canonical_category_id uuid references public.canonical_categories(id),
  fee_category_id uuid references public.fee_categories(id),
  confidence numeric(5,4),
  status public.line_status not null default 'unmapped',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.statement_lines (statement_id);
create index on public.statement_lines (organisation_id);

-- ============ PRICING ============
create table public.buy_rates (
  id uuid primary key default gen_random_uuid(),
  canonical_category_id uuid references public.canonical_categories(id) on delete cascade,
  fee_category_id uuid references public.fee_categories(id) on delete cascade,
  card_present boolean,
  percent_rate numeric(8,5),
  per_item numeric(10,4),
  monthly_fee numeric(10,2),
  effective_from date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.reseller_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  merchant_id uuid references public.merchants(id) on delete cascade,
  canonical_category_id uuid references public.canonical_categories(id),
  fee_category_id uuid references public.fee_categories(id),
  percent_rate numeric(8,5),
  per_item numeric(10,4),
  monthly_fee numeric(10,2),
  margin_uplift numeric(6,4),
  created_at timestamptz not null default now()
);
create index on public.reseller_rates (organisation_id);
create index on public.reseller_rates (merchant_id);

-- ============ PROPOSALS ============
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  title text not null,
  status text not null default 'draft',
  estimated_monthly_saving numeric(14,2),
  estimated_annual_saving numeric(14,2),
  estimated_reseller_revenue numeric(14,2),
  payload jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version int not null,
  payload jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (proposal_id, version)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ============ TIMESTAMP TRIGGERS ============
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  for t in select unnest(array['organisations','profiles','merchants','statements','statement_lines','mapping_dictionary','proposals']) loop
    execute format('create trigger trg_%I_updated before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ============ PROFILE AUTO-CREATE ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'reseller');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ GRANTS ============
grant select on public.canonical_categories, public.fee_categories, public.semantic_tokens to authenticated, anon;
grant select, insert, update, delete on
  public.organisations, public.profiles, public.user_roles,
  public.merchants, public.statements, public.statement_lines,
  public.mapping_dictionary, public.buy_rates, public.reseller_rates,
  public.proposals, public.proposal_versions, public.audit_logs
  to authenticated;
grant all on
  public.organisations, public.profiles, public.user_roles,
  public.canonical_categories, public.fee_categories, public.semantic_tokens,
  public.merchants, public.statements, public.statement_lines,
  public.mapping_dictionary, public.buy_rates, public.reseller_rates,
  public.proposals, public.proposal_versions, public.audit_logs
  to service_role;

-- ============ RLS ============
alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.canonical_categories enable row level security;
alter table public.fee_categories enable row level security;
alter table public.semantic_tokens enable row level security;
alter table public.mapping_dictionary enable row level security;
alter table public.merchants enable row level security;
alter table public.statements enable row level security;
alter table public.statement_lines enable row level security;
alter table public.buy_rates enable row level security;
alter table public.reseller_rates enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.audit_logs enable row level security;

-- Organisations
create policy "org read own or admin" on public.organisations for select to authenticated
  using (id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'));
create policy "org admin manage" on public.organisations for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- Profiles
create policy "profiles self read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin manage" on public.profiles for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- User roles
create policy "roles self read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "roles admin manage" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- Taxonomy: readable by authenticated; admin manages
create policy "cat read" on public.canonical_categories for select to authenticated, anon using (true);
create policy "cat admin" on public.canonical_categories for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "fee read" on public.fee_categories for select to authenticated, anon using (true);
create policy "fee admin" on public.fee_categories for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "tok read" on public.semantic_tokens for select to authenticated, anon using (true);
create policy "tok admin" on public.semantic_tokens for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- Mapping dictionary: all authenticated can read & contribute corrections; admin manages
create policy "dict read" on public.mapping_dictionary for select to authenticated using (true);
create policy "dict insert" on public.mapping_dictionary for insert to authenticated with check (auth.uid() is not null);
create policy "dict update admin" on public.mapping_dictionary for update to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "dict delete admin" on public.mapping_dictionary for delete to authenticated
  using (public.has_role(auth.uid(),'super_admin'));

-- Merchants / statements / lines / reseller_rates / proposals: scoped to org or admin
create policy "merch org" on public.merchants for all to authenticated
  using (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'))
  with check (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'));

create policy "stmt org" on public.statements for all to authenticated
  using (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'))
  with check (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'));

create policy "line org" on public.statement_lines for all to authenticated
  using (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'))
  with check (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'));

create policy "rr org" on public.reseller_rates for all to authenticated
  using (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'))
  with check (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'));

create policy "prop org" on public.proposals for all to authenticated
  using (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'))
  with check (organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'));

create policy "pv org" on public.proposal_versions for all to authenticated
  using (exists(select 1 from public.proposals p where p.id = proposal_id and (p.organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'))))
  with check (exists(select 1 from public.proposals p where p.id = proposal_id and (p.organisation_id = public.current_org_id() or public.has_role(auth.uid(),'super_admin'))));

-- Buy rates: read all authed, admin manage
create policy "br read" on public.buy_rates for select to authenticated using (true);
create policy "br admin" on public.buy_rates for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- Audit logs: admin read; insert by authed
create policy "audit admin read" on public.audit_logs for select to authenticated
  using (public.has_role(auth.uid(),'super_admin') or organisation_id = public.current_org_id());
create policy "audit insert" on public.audit_logs for insert to authenticated with check (auth.uid() = user_id);

-- ============ STORAGE BUCKET ============
insert into storage.buckets (id, name, public) values ('statements','statements', false)
on conflict (id) do nothing;

create policy "stmt upload own org" on storage.objects for insert to authenticated
  with check (bucket_id = 'statements' and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy "stmt read own org" on storage.objects for select to authenticated
  using (bucket_id = 'statements' and ((storage.foldername(name))[1] = public.current_org_id()::text or public.has_role(auth.uid(),'super_admin')));
create policy "stmt delete own org" on storage.objects for delete to authenticated
  using (bucket_id = 'statements' and ((storage.foldername(name))[1] = public.current_org_id()::text or public.has_role(auth.uid(),'super_admin')));
