
-- Helper: current user's organisation slug (used by RLS to scope reseller data)
CREATE OR REPLACE FUNCTION public.current_org_slug()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.slug
  FROM public.profiles p
  JOIN public.organisations o ON o.id = p.organisation_id
  WHERE p.id = auth.uid()
$$;

-- Stream enum
DO $$ BEGIN
  CREATE TYPE public.forecast_stream AS ENUM (
    'reseller_turnover', 'reseller_commission', 'vesta_turnover', 'vesta_commission'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- forecast_overrides
CREATE TABLE public.forecast_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id TEXT NOT NULL,
  stream public.forecast_stream NOT NULL,
  month TEXT NOT NULL,
  value NUMERIC NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, stream, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forecast_overrides TO authenticated;
GRANT ALL ON public.forecast_overrides TO service_role;
ALTER TABLE public.forecast_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forecast_overrides admins all" ON public.forecast_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "forecast_overrides own org read" ON public.forecast_overrides
  FOR SELECT TO authenticated
  USING (reseller_id = public.current_org_slug());

CREATE POLICY "forecast_overrides own org insert" ON public.forecast_overrides
  FOR INSERT TO authenticated
  WITH CHECK (reseller_id = public.current_org_slug());

CREATE POLICY "forecast_overrides own org update" ON public.forecast_overrides
  FOR UPDATE TO authenticated
  USING (reseller_id = public.current_org_slug())
  WITH CHECK (reseller_id = public.current_org_slug());

CREATE POLICY "forecast_overrides own org delete" ON public.forecast_overrides
  FOR DELETE TO authenticated
  USING (reseller_id = public.current_org_slug());

CREATE TRIGGER trg_forecast_overrides_touch
  BEFORE UPDATE ON public.forecast_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- forecast_versions
CREATE TABLE public.forecast_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id TEXT NOT NULL,
  author TEXT NOT NULL,
  method TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  annual_total_2026 NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forecast_versions TO authenticated;
GRANT ALL ON public.forecast_versions TO service_role;
ALTER TABLE public.forecast_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forecast_versions admins all" ON public.forecast_versions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "forecast_versions own org read" ON public.forecast_versions
  FOR SELECT TO authenticated
  USING (reseller_id = public.current_org_slug());

CREATE POLICY "forecast_versions own org insert" ON public.forecast_versions
  FOR INSERT TO authenticated
  WITH CHECK (reseller_id = public.current_org_slug());

CREATE INDEX idx_forecast_versions_reseller_created ON public.forecast_versions (reseller_id, created_at DESC);

-- growth_actions
CREATE TABLE public.growth_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  due TEXT NOT NULL DEFAULT '',
  monthly_uplift NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_actions TO authenticated;
GRANT ALL ON public.growth_actions TO service_role;
ALTER TABLE public.growth_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "growth_actions admins all" ON public.growth_actions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "growth_actions own org read" ON public.growth_actions
  FOR SELECT TO authenticated
  USING (reseller_id = public.current_org_slug());

CREATE POLICY "growth_actions own org insert" ON public.growth_actions
  FOR INSERT TO authenticated
  WITH CHECK (reseller_id = public.current_org_slug());

CREATE POLICY "growth_actions own org update" ON public.growth_actions
  FOR UPDATE TO authenticated
  USING (reseller_id = public.current_org_slug())
  WITH CHECK (reseller_id = public.current_org_slug());

CREATE POLICY "growth_actions own org delete" ON public.growth_actions
  FOR DELETE TO authenticated
  USING (reseller_id = public.current_org_slug());

CREATE TRIGGER trg_growth_actions_touch
  BEFORE UPDATE ON public.growth_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
