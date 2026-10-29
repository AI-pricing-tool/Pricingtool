import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode, createElement } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RESELLERS, ALL_RESELLERS_ID, type User, type GrowthAction, type ForecastVersion } from "./mock-data";
import {
  listForecastOverrides, listAllForecastOverrides, saveForecastOverrides,
  listForecastVersions, listGrowthActions, addGrowthAction, updateGrowthAction,
  type OverridesPayload,
} from "./persistence.functions";

type MonthMap = Record<string, number>;

export interface BuilderOverrides {
  resellerTurnover: MonthMap;
  resellerCommission: MonthMap;
  vestaTurnover: MonthMap;
  vestaCommission: MonthMap;
}

interface AppState {
  user: User | null;
  activeResellerId: string | null;
  setActiveResellerId: (id: string) => void;
  isAllResellers: boolean;
  forecastOverrides: Record<string, MonthMap>;
  commissionOverrides: Record<string, MonthMap>;
  vestaTurnoverOverrides: Record<string, MonthMap>;
  vestaCommissionOverrides: Record<string, MonthMap>;
  saveForecast: (
    resellerId: string,
    patch: Partial<BuilderOverrides>,
    version: Omit<ForecastVersion, "id" | "createdAt" | "resellerId">,
  ) => void;
  actions: GrowthAction[];
  addAction: (a: Omit<GrowthAction, "id">) => void;
  updateAction: (id: string, patch: Partial<GrowthAction>) => void;
  versions: ForecastVersion[];
  isLoading: boolean;
}

const Ctx = createContext<AppState | null>(null);
const LS_KEY = "vesta-pf-state-v2";

export function ForecastingProvider({ children }: { children: ReactNode }) {
  const { profile, isSuperAdmin, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const user: User | null = useMemo(() => {
    if (!profile) return null;
    if (isSuperAdmin) {
      return { id: profile.id, email: profile.email ?? "", name: profile.full_name ?? "Admin", role: "admin" };
    }
    const slug = profile.organisation_slug;
    const matched = slug ? RESELLERS.find(r => r.id === slug) : undefined;
    return {
      id: profile.id,
      email: profile.email ?? "",
      name: profile.full_name ?? "Reseller",
      role: "reseller",
      resellerId: matched?.id,
    };
  }, [profile, isSuperAdmin]);

  const [activeResellerId, setActiveResellerId] = useState<string | null>(null);

  const isAllResellers = activeResellerId === ALL_RESELLERS_ID;

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") {
      if (!activeResellerId) setActiveResellerId(ALL_RESELLERS_ID);
    } else if (user.resellerId) {
      if (activeResellerId !== user.resellerId) setActiveResellerId(user.resellerId);
    } else {
      if (activeResellerId !== null) setActiveResellerId(null);
    }
  }, [user, activeResellerId]);

  // ── Server fns bound to client ─────────────────────────────────────────────
  const listOverridesFn = useServerFn(listForecastOverrides);
  const listAllOverridesFn = useServerFn(listAllForecastOverrides);
  const listVersionsFn = useServerFn(listForecastVersions);
  const saveOverridesFn = useServerFn(saveForecastOverrides);
  const listActionsFn = useServerFn(listGrowthActions);
  const addActionFn = useServerFn(addGrowthAction);
  const updateActionFn = useServerFn(updateGrowthAction);

  // ── Queries ────────────────────────────────────────────────────────────────
  const enabled = isAuthenticated && !!activeResellerId && !isAllResellers;

  const overridesQ = useQuery({
    queryKey: ["forecasting", "overrides", activeResellerId],
    queryFn: () => listOverridesFn({ data: { resellerId: activeResellerId! } }),
    enabled,
  });
  const allOverridesQ = useQuery({
    queryKey: ["forecasting", "overrides", "__all__"],
    queryFn: () => listAllOverridesFn(),
    enabled: isAuthenticated && isAllResellers,
  });
  const versionsQ = useQuery({
    queryKey: ["forecasting", "versions", activeResellerId],
    queryFn: () => listVersionsFn({ data: { resellerId: activeResellerId! } }),
    enabled,
  });
  const actionsQ = useQuery({
    queryKey: ["forecasting", "actions", activeResellerId],
    queryFn: () => listActionsFn({ data: { resellerId: activeResellerId! } }),
    enabled,
  });

  const ov: OverridesPayload = overridesQ.data ?? {
    resellerTurnover: {}, resellerCommission: {}, vestaTurnover: {}, vestaCommission: {},
  };
  const allOv = allOverridesQ.data;
  const pick = (key: keyof OverridesPayload) => {
    if (isAllResellers) {
      const out: Record<string, MonthMap> = {};
      for (const [rid, payload] of Object.entries(allOv ?? {})) out[rid] = payload[key];
      return out;
    }
    return activeResellerId ? { [activeResellerId]: ov[key] } : {};
  };
  const forecastOverrides = useMemo(() => pick("resellerTurnover"), [activeResellerId, isAllResellers, ov.resellerTurnover, allOv]);
  const commissionOverrides = useMemo(() => pick("resellerCommission"), [activeResellerId, isAllResellers, ov.resellerCommission, allOv]);
  const vestaTurnoverOverrides = useMemo(() => pick("vestaTurnover"), [activeResellerId, isAllResellers, ov.vestaTurnover, allOv]);
  const vestaCommissionOverrides = useMemo(() => pick("vestaCommission"), [activeResellerId, isAllResellers, ov.vestaCommission, allOv]);

  const versions: ForecastVersion[] = versionsQ.data ?? [];
  const actions: GrowthAction[] = actionsQ.data ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (vars: { resellerId: string; patch: Partial<BuilderOverrides>; version: Omit<ForecastVersion, "id" | "createdAt" | "resellerId"> }) =>
      saveOverridesFn({ data: vars }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["forecasting", "overrides", vars.resellerId] });
      queryClient.invalidateQueries({ queryKey: ["forecasting", "versions", vars.resellerId] });
    },
  });

  const addMutation = useMutation({
    mutationFn: (a: Omit<GrowthAction, "id">) => addActionFn({ data: a }),
    onSuccess: (_d, a) => queryClient.invalidateQueries({ queryKey: ["forecasting", "actions", a.resellerId] }),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<GrowthAction> }) => updateActionFn({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forecasting", "actions"] }),
  });

  const saveForecast: AppState["saveForecast"] = useCallback((resellerId, patch, version) => {
    if (!resellerId || resellerId === ALL_RESELLERS_ID) return;
    saveMutation.mutate({ resellerId, patch, version });
  }, [saveMutation]);

  const addAction: AppState["addAction"] = useCallback((a) => { addMutation.mutate(a); }, [addMutation]);
  const updateAction: AppState["updateAction"] = useCallback((id, patch) => {
    updateMutation.mutate({ id, patch });
  }, [updateMutation]);

  // ── One-shot localStorage migrator ─────────────────────────────────────────
  // If the user had a forecast saved in browser storage (pre-DB), push it up
  // on first authenticated load then clear the local cache.
  useEffect(() => {
    if (!isAuthenticated || !activeResellerId || isAllResellers || !user) return;
    if (overridesQ.isLoading) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        forecastOverrides?: Record<string, MonthMap>;
        commissionOverrides?: Record<string, MonthMap>;
        vestaTurnoverOverrides?: Record<string, MonthMap>;
        vestaCommissionOverrides?: Record<string, MonthMap>;
      };
      const rid = activeResellerId;
      const patch: Partial<BuilderOverrides> = {
        resellerTurnover: s.forecastOverrides?.[rid] ?? {},
        resellerCommission: s.commissionOverrides?.[rid] ?? {},
        vestaTurnover: s.vestaTurnoverOverrides?.[rid] ?? {},
        vestaCommission: s.vestaCommissionOverrides?.[rid] ?? {},
      };
      const total =
        Object.keys(patch.resellerTurnover ?? {}).length +
        Object.keys(patch.resellerCommission ?? {}).length +
        Object.keys(patch.vestaTurnover ?? {}).length +
        Object.keys(patch.vestaCommission ?? {}).length;
      if (total === 0) {
        localStorage.removeItem(LS_KEY);
        return;
      }
      saveOverridesFn({
        data: {
          resellerId: rid,
          patch,
          version: {
            author: user.name,
            notes: "Migrated from local browser storage",
            method: "manual",
            annualTotal2026: 0,
          },
        },
      })
        .then(() => {
          localStorage.removeItem(LS_KEY);
          queryClient.invalidateQueries({ queryKey: ["forecasting", "overrides", rid] });
          queryClient.invalidateQueries({ queryKey: ["forecasting", "versions", rid] });
        })
        .catch(() => { /* keep local copy if upload failed; will retry next session */ });
    } catch {
      // ignore parse errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeResellerId, overridesQ.isLoading]);

  return createElement(Ctx.Provider, {
    value: {
      user, activeResellerId, setActiveResellerId, isAllResellers,
      forecastOverrides, commissionOverrides, vestaTurnoverOverrides, vestaCommissionOverrides,
      saveForecast, actions, addAction, updateAction, versions,
      isLoading: overridesQ.isLoading || actionsQ.isLoading || versionsQ.isLoading || allOverridesQ.isLoading,
    },
  }, children);
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ForecastingProvider missing");
  return v;
}
