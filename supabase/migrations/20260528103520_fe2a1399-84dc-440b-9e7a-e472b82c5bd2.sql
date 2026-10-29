ALTER TABLE public.statement_lines
  ADD COLUMN IF NOT EXISTS our_rate numeric,
  ADD COLUMN IF NOT EXISTS our_per_txn numeric,
  ADD COLUMN IF NOT EXISTS our_fee numeric;

ALTER TABLE public.statements
  ADD COLUMN IF NOT EXISTS notes text;