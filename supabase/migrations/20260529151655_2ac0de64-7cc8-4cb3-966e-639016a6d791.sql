
-- 1. Add file_path to proposals
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS file_path text;

-- 2. Create private proposals storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposals', 'proposals', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies (path is "{organisation_id}/{filename}")
DROP POLICY IF EXISTS "proposals read org" ON storage.objects;
CREATE POLICY "proposals read org"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proposals'
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (storage.foldername(name))[1] = public.current_org_id()::text
  )
);

DROP POLICY IF EXISTS "proposals insert org" ON storage.objects;
CREATE POLICY "proposals insert org"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proposals'
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (storage.foldername(name))[1] = public.current_org_id()::text
  )
);

DROP POLICY IF EXISTS "proposals update org" ON storage.objects;
CREATE POLICY "proposals update org"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'proposals'
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (storage.foldername(name))[1] = public.current_org_id()::text
  )
);

DROP POLICY IF EXISTS "proposals delete org" ON storage.objects;
CREATE POLICY "proposals delete org"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'proposals'
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (storage.foldername(name))[1] = public.current_org_id()::text
  )
);
