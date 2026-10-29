alter table public.statement_lines
  add column if not exists site_name text,
  add column if not exists site_mid text;
create index if not exists statement_lines_site_mid_idx
  on public.statement_lines (statement_id, site_mid);