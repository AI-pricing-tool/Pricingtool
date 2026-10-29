-- Seeds public.canonical_categories, the card taxonomy every statement line is mapped to and every
-- buy rate is priced against. No earlier migration inserted these rows, so on a fresh database no
-- card line could be mapped.
--
-- Codes follow the naming the code generates: {visa|mc}_{business_}{credit|debit}_{uk|eu|non_eu|us}
-- (src/lib/global-payments-codes.ts, classifyCard in statements.functions.ts, classifyUsCard in
-- interchange-plus.ts), plus discover_* and amex_* for the US.
--
-- sort_order places UK consumer credit first within each scheme. statements.functions.ts uses the
-- first category per scheme as a last-resort fallback, so that is the default a bare scheme maps to.

INSERT INTO public.canonical_categories (code, label, scheme, funding, card_category, region, sort_order) VALUES
  ('visa_credit_uk', 'Visa Consumer Credit UK', 'visa', 'credit', 'consumer', 'uk', 101),
  ('visa_debit_uk', 'Visa Consumer Debit UK', 'visa', 'debit', 'consumer', 'uk', 102),
  ('visa_business_credit_uk', 'Visa Business Credit UK', 'visa', 'credit', 'business', 'uk', 103),
  ('visa_business_debit_uk', 'Visa Business Debit UK', 'visa', 'debit', 'business', 'uk', 104),
  ('visa_credit_eu', 'Visa Consumer Credit EU', 'visa', 'credit', 'consumer', 'eu', 111),
  ('visa_debit_eu', 'Visa Consumer Debit EU', 'visa', 'debit', 'consumer', 'eu', 112),
  ('visa_business_credit_eu', 'Visa Business Credit EU', 'visa', 'credit', 'business', 'eu', 113),
  ('visa_business_debit_eu', 'Visa Business Debit EU', 'visa', 'debit', 'business', 'eu', 114),
  ('visa_credit_non_eu', 'Visa Consumer Credit Non-EU', 'visa', 'credit', 'consumer', 'non_eu', 121),
  ('visa_debit_non_eu', 'Visa Consumer Debit Non-EU', 'visa', 'debit', 'consumer', 'non_eu', 122),
  ('visa_business_credit_non_eu', 'Visa Business Credit Non-EU', 'visa', 'credit', 'business', 'non_eu', 123),
  ('visa_business_debit_non_eu', 'Visa Business Debit Non-EU', 'visa', 'debit', 'business', 'non_eu', 124),
  ('visa_credit_us', 'Visa Consumer Credit US', 'visa', 'credit', 'consumer', 'us', 131),
  ('visa_debit_us', 'Visa Consumer Debit US', 'visa', 'debit', 'consumer', 'us', 132),
  ('visa_business_credit_us', 'Visa Business Credit US', 'visa', 'credit', 'business', 'us', 133),
  ('visa_business_debit_us', 'Visa Business Debit US', 'visa', 'debit', 'business', 'us', 134),
  ('mc_credit_uk', 'Mastercard Consumer Credit UK', 'mastercard', 'credit', 'consumer', 'uk', 201),
  ('mc_debit_uk', 'Mastercard Consumer Debit UK', 'mastercard', 'debit', 'consumer', 'uk', 202),
  ('mc_business_credit_uk', 'Mastercard Business Credit UK', 'mastercard', 'credit', 'business', 'uk', 203),
  ('mc_business_debit_uk', 'Mastercard Business Debit UK', 'mastercard', 'debit', 'business', 'uk', 204),
  ('mc_credit_eu', 'Mastercard Consumer Credit EU', 'mastercard', 'credit', 'consumer', 'eu', 211),
  ('mc_debit_eu', 'Mastercard Consumer Debit EU', 'mastercard', 'debit', 'consumer', 'eu', 212),
  ('mc_business_credit_eu', 'Mastercard Business Credit EU', 'mastercard', 'credit', 'business', 'eu', 213),
  ('mc_business_debit_eu', 'Mastercard Business Debit EU', 'mastercard', 'debit', 'business', 'eu', 214),
  ('mc_credit_non_eu', 'Mastercard Consumer Credit Non-EU', 'mastercard', 'credit', 'consumer', 'non_eu', 221),
  ('mc_debit_non_eu', 'Mastercard Consumer Debit Non-EU', 'mastercard', 'debit', 'consumer', 'non_eu', 222),
  ('mc_business_credit_non_eu', 'Mastercard Business Credit Non-EU', 'mastercard', 'credit', 'business', 'non_eu', 223),
  ('mc_business_debit_non_eu', 'Mastercard Business Debit Non-EU', 'mastercard', 'debit', 'business', 'non_eu', 224),
  ('mc_credit_us', 'Mastercard Consumer Credit US', 'mastercard', 'credit', 'consumer', 'us', 231),
  ('mc_debit_us', 'Mastercard Consumer Debit US', 'mastercard', 'debit', 'consumer', 'us', 232),
  ('mc_business_credit_us', 'Mastercard Business Credit US', 'mastercard', 'credit', 'business', 'us', 233),
  ('mc_business_debit_us', 'Mastercard Business Debit US', 'mastercard', 'debit', 'business', 'us', 234),
  ('discover_credit_us', 'Discover Consumer Credit US', 'discover', 'credit', 'consumer', 'us', 301),
  ('discover_debit_us', 'Discover Consumer Debit US', 'discover', 'debit', 'consumer', 'us', 302),
  ('discover_commercial_us', 'Discover Commercial US', 'discover', 'credit', 'commercial', 'us', 303),
  ('amex_us', 'American Express Consumer US', 'amex', 'credit', 'consumer', 'us', 401),
  ('amex_business_us', 'American Express Business US', 'amex', 'credit', 'business', 'us', 402)
ON CONFLICT (code) DO NOTHING;

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
