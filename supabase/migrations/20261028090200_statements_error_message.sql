-- Why an extraction failed, shown on the statement and the analysis page. Set by extractStatement
-- when it marks a statement "failed", cleared when it starts again or succeeds.
-- (statements.notes is the user's own free-text field, so it is not reused.)
ALTER TABLE public.statements ADD COLUMN IF NOT EXISTS error_message text;
