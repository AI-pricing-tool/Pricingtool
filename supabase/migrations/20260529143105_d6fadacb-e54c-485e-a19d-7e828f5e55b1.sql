-- Dedupe existing card-type buy_rates rows (keep newest by effective_from then created_at)
DELETE FROM public.buy_rates a
USING public.buy_rates b
WHERE a.fee_category_id IS NULL
  AND a.card_present IS NULL
  AND b.fee_category_id IS NULL
  AND b.card_present IS NULL
  AND a.canonical_category_id = b.canonical_category_id
  AND (
    a.effective_from < b.effective_from
    OR (a.effective_from = b.effective_from AND a.created_at < b.created_at)
    OR (a.effective_from = b.effective_from AND a.created_at = b.created_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS buy_rates_card_type_uniq
ON public.buy_rates (canonical_category_id)
WHERE fee_category_id IS NULL AND card_present IS NULL;