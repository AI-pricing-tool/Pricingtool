ALTER TABLE public.statements ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TYPE public.merchant_stage ADD VALUE IF NOT EXISTS 'lost';