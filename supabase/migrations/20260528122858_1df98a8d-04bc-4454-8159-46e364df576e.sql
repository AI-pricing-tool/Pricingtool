
CREATE UNIQUE INDEX IF NOT EXISTS buy_rates_card_type_unique
ON public.buy_rates (canonical_category_id)
WHERE fee_category_id IS NULL AND card_present IS NULL AND canonical_category_id IS NOT NULL;
