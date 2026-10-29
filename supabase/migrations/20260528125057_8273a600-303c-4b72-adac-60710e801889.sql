INSERT INTO public.fee_categories (code, label, unit) VALUES
  ('secure_txn_fee', 'Secure Transaction Fee', 'per_item'),
  ('preauth_fee', 'Pre-authorisation Fee', 'per_item'),
  ('international_card_uplift', 'International Card Uplift', 'percent'),
  ('eu_card_uplift', 'European Card Uplift', 'percent')
ON CONFLICT (code) DO NOTHING;