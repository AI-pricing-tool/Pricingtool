
-- 1) audit_logs: bind INSERT to user's organisation
DROP POLICY IF EXISTS "audit insert" ON public.audit_logs;
CREATE POLICY "audit insert"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (organisation_id IS NULL OR organisation_id = current_org_id())
);

-- 2) profiles: prevent self-reassignment of organisation_id via RLS update
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND organisation_id IS NOT DISTINCT FROM (
    SELECT p.organisation_id FROM public.profiles p WHERE p.id = auth.uid()
  )
);
