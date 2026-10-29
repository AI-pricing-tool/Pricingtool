-- Add missing fee categories referenced by the matrix
INSERT INTO public.fee_categories (code, label, unit, description) VALUES
  ('discount_rate','Discount Rate','percent','Blended service charge / MSC'),
  ('international_fee','International Fee','percent','Cross-border / international card fee')
ON CONFLICT (code) DO NOTHING;

-- Unique index for upserts
CREATE UNIQUE INDEX IF NOT EXISTS mapping_dictionary_acq_norm_uniq
  ON public.mapping_dictionary (acquirer, raw_description_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS semantic_tokens_token_uniq
  ON public.semantic_tokens (token);

-- Friendlier display labels
UPDATE public.canonical_categories SET label = 'Visa Consumer Debit UK'        WHERE code = 'visa_debit_uk';
UPDATE public.canonical_categories SET label = 'Visa Consumer Credit UK'       WHERE code = 'visa_credit_uk';
UPDATE public.canonical_categories SET label = 'Mastercard Consumer Debit UK'  WHERE code = 'mc_debit_uk';
UPDATE public.canonical_categories SET label = 'Mastercard Consumer Credit UK' WHERE code = 'mc_credit_uk';
UPDATE public.canonical_categories SET label = 'Visa Business Credit UK'       WHERE code = 'visa_business_credit_uk';
UPDATE public.canonical_categories SET label = 'Mastercard Business Credit UK' WHERE code = 'mc_business_credit_uk';
UPDATE public.canonical_categories SET label = 'Visa Consumer Debit EU'        WHERE code = 'visa_debit_eu';
UPDATE public.canonical_categories SET label = 'Mastercard Consumer Credit Non-EU' WHERE code = 'mc_credit_non_eu';

-- Semantic tokens
INSERT INTO public.semantic_tokens (token, expansion, context) VALUES
  ('DB','Debit','Funding/Card Type'),
  ('CR','Credit','Funding/Card Type'),
  ('CHIP','EMV Chip','Auth Method'),
  ('PAYPASS','Contactless','Channel'),
  ('CNP','Card Not Present','Channel'),
  ('MOTO','Mail Order Telephone Order','Channel'),
  ('COM','Commercial','Funding'),
  ('CORP','Corporate','Funding'),
  ('WORLD','Premium Product','Product Tier'),
  ('SIGNIA','Premium Product','Product Tier')
ON CONFLICT (token) DO UPDATE
  SET expansion = EXCLUDED.expansion, context = EXCLUDED.context;

-- Card mappings
WITH src(acquirer, raw_description, code) AS (VALUES
  ('Worldpay','MasterCard Cr Per','mc_credit_uk'),
  ('Worldpay','MasterCard Signia','mc_credit_uk'),
  ('Worldpay','MasterCard World','mc_credit_uk'),
  ('Worldpay','MasterCard Dr Per Int','mc_debit_non_eu'),
  ('Worldpay','Debit MasterCard Com','mc_business_debit_uk'),
  ('Worldpay','Visa Debit Per','visa_debit_uk'),
  ('Worldpay','Visa Debit Com','visa_business_debit_uk'),
  ('Worldpay','Visa Credit Personal','visa_credit_uk'),
  ('Worldpay','MasterCard Corporate','mc_business_credit_uk'),
  ('Barclaycard','M-UK DEBIT CHIP PIN','mc_debit_uk'),
  ('Barclaycard','M-UK PAYPASS DB','mc_debit_uk'),
  ('Barclaycard','M-UK CONS CHIP PIN','mc_credit_uk'),
  ('Barclaycard','M-UK COMM CHIP PIN','mc_business_credit_uk'),
  ('Barclaycard','V-UK CONTACTLESS DB','visa_debit_uk'),
  ('Barclaycard','V-UK EMV CR','visa_credit_uk'),
  ('Barclaycard','V-UK CORP EMV','visa_business_credit_uk'),
  ('Barclaycard','V-EUINT CONS F2F DBPP','visa_debit_eu'),
  ('First Data','Visa','visa_credit_uk'),
  ('First Data','VS Debit','visa_debit_uk'),
  ('First Data','VS DBChip','visa_debit_uk'),
  ('First Data','VS Chip','visa_credit_uk'),
  ('First Data','MC','mc_credit_uk'),
  ('First Data','MC Debit','mc_debit_uk'),
  ('First Data','MC DBChp','mc_debit_uk'),
  ('First Data','MC Chip','mc_credit_uk'),
  ('First Data','VS Comcd','visa_business_credit_uk'),
  ('First Data','MC Comcd','mc_business_credit_uk')
)
INSERT INTO public.mapping_dictionary
  (acquirer, raw_description, canonical_category_id, source, confidence, verified_at)
SELECT s.acquirer, s.raw_description, cc.id, 'seed', 1.0, now()
FROM src s
JOIN public.canonical_categories cc ON cc.code = s.code
ON CONFLICT (acquirer, raw_description_normalized) DO UPDATE
  SET canonical_category_id = EXCLUDED.canonical_category_id,
      source = 'seed', confidence = 1.0, verified_at = now(),
      updated_at = now();

-- Fee mappings
WITH src(acquirer, raw_description, code) AS (VALUES
  ('First Data','VISA DEBIT SERVICE CHARGE','discount_rate'),
  ('First Data','VISA NON-QUAL SERVICE FEE','non_qual_fee'),
  ('First Data','VISA CHIP SERVICE CHARGE','discount_rate'),
  ('First Data','MASTERCARD NO SERVICE CHARGE','discount_rate'),
  ('First Data','MC PURCHASE CARD SERV CHRG','commercial_card_fee'),
  ('First Data','REFUND TXN CHARGE','refund_fee'),
  ('First Data','AUTHORISATION REQUEST','auth_fee'),
  ('First Data','PCI DSS MANAGEMENT FEE','pci_fee'),
  ('First Data','MONTHLY MAINTENANCE FEE','monthly_fee'),
  ('Barclaycard','International Consumer Credit Txn Fee','international_fee'),
  ('Barclaycard','Electronic Authorisation','auth_fee'),
  ('Worldpay','Visa Acquired Auth Approved Dom','auth_fee'),
  ('Worldpay','Visa Address Verification Fee','avs_fee')
)
INSERT INTO public.mapping_dictionary
  (acquirer, raw_description, fee_category_id, source, confidence, verified_at)
SELECT s.acquirer, s.raw_description, fc.id, 'seed', 1.0, now()
FROM src s
JOIN public.fee_categories fc ON fc.code = s.code
ON CONFLICT (acquirer, raw_description_normalized) DO UPDATE
  SET fee_category_id = EXCLUDED.fee_category_id,
      source = 'seed', confidence = 1.0, verified_at = now(),
      updated_at = now();