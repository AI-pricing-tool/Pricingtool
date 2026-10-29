UPDATE public.statement_lines
SET raw_rate = ROUND(((extracted_fee / txn_value) * 100)::numeric, 5)
WHERE txn_value IS NOT NULL
  AND txn_value > 0
  AND extracted_fee IS NOT NULL;