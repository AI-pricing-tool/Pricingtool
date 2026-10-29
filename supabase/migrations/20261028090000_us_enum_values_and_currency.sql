-- Schema the app depends on that was previously only in drizzle/migrations (0001, 0002).
-- Idempotent, so running the drizzle migrations as well is harmless.
--
-- Kept separate from the category seed on purpose: a value added with ALTER TYPE ... ADD VALUE
-- cannot be used in the same transaction, so the rows that use 'us' / 'discover' live in the next file.

ALTER TYPE public.region_code ADD VALUE IF NOT EXISTS 'us';
ALTER TYPE public.card_scheme ADD VALUE IF NOT EXISTS 'discover';

-- extractStatement writes the detected currency here; without the column the final update fails.
ALTER TABLE public.statements ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP';
