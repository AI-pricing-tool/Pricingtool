import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StreamKey =
  | "reseller_turnover"
  | "reseller_commission"
  | "vesta_turnover"
  | "vesta_commission";

export interface OverridesPayload {
  resellerTurnover: Record<string, number>;
  resellerCommission: Record<string, number>;
  vestaTurnover: Record<string, number>;
  vestaCommission: Record<string, number>;
}

export interface VersionRow {
  id: string;
  resellerId: string;
  createdAt: string;
  author: string;
  notes: string;
  method: "manual" | "growth_pct" | "annual_target";
  annualTotal2026: number;
}

export interface GrowthActionRow {
  id: string;
  resellerId: string;
  title: string;
  type: string;
  owner: string;
  due: string;
  monthlyUplift: number;
  status: "planned" | "in_progress" | "done" | "blocked";
  notes: string;
}

const emptyOverrides = (): OverridesPayload => ({
  resellerTurnover: {},
  resellerCommission: {},
  vestaTurnover: {},
  vestaCommission: {},
});

export const listForecastOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { resellerId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("forecast_overrides")
      .select("stream, month, value")
      .eq("reseller_id", data.resellerId);
    if (error) throw error;
    const out = emptyOverrides();
    for (const r of rows ?? []) {
      const v = Number(r.value);
      if (r.stream === "reseller_turnover") out.resellerTurnover[r.month] = v;
      else if (r.stream === "reseller_commission") out.resellerCommission[r.month] = v;
      else if (r.stream === "vesta_turnover") out.vestaTurnover[r.month] = v;
      else if (r.stream === "vesta_commission") out.vestaCommission[r.month] = v;
    }
    return out;
  });

/** All resellers' overrides in one call, keyed by reseller id. */
export const listAllForecastOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, OverridesPayload>> => {
    const { data: rows, error } = await context.supabase
      .from("forecast_overrides")
      .select("reseller_id, stream, month, value");
    if (error) throw error;
    const out: Record<string, OverridesPayload> = {};
    for (const r of rows ?? []) {
      const rid = r.reseller_id as string;
      if (!out[rid]) out[rid] = emptyOverrides();
      const v = Number(r.value);
      if (r.stream === "reseller_turnover") out[rid].resellerTurnover[r.month] = v;
      else if (r.stream === "reseller_commission") out[rid].resellerCommission[r.month] = v;
      else if (r.stream === "vesta_turnover") out[rid].vestaTurnover[r.month] = v;
      else if (r.stream === "vesta_commission") out[rid].vestaCommission[r.month] = v;
    }
    return out;
  });

export const listForecastVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { resellerId: string }) => data)
  .handler(async ({ data, context }): Promise<VersionRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("forecast_versions")
      .select("id, reseller_id, author, method, notes, annual_total_2026, created_at")
      .eq("reseller_id", data.resellerId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      resellerId: r.reseller_id as string,
      author: r.author as string,
      method: r.method as VersionRow["method"],
      notes: r.notes as string,
      annualTotal2026: Number(r.annual_total_2026),
      createdAt: (r.created_at as string).slice(0, 10),
    }));
  });

interface SavePayload {
  resellerId: string;
  patch: Partial<OverridesPayload>;
  version: {
    author: string;
    notes: string;
    method: VersionRow["method"];
    annualTotal2026: number;
  };
}

export const saveForecastOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SavePayload) => data)
  .handler(async ({ data, context }) => {
    const rows: { reseller_id: string; stream: StreamKey; month: string; value: number; updated_by: string }[] = [];
    const push = (stream: StreamKey, map?: Record<string, number>) => {
      if (!map) return;
      for (const [month, value] of Object.entries(map)) {
        if (value == null || Number.isNaN(Number(value))) continue;
        rows.push({ reseller_id: data.resellerId, stream, month, value: Number(value), updated_by: context.userId });
      }
    };
    push("reseller_turnover", data.patch.resellerTurnover);
    push("reseller_commission", data.patch.resellerCommission);
    push("vesta_turnover", data.patch.vestaTurnover);
    push("vesta_commission", data.patch.vestaCommission);

    if (rows.length) {
      const { error } = await context.supabase
        .from("forecast_overrides")
        .upsert(rows, { onConflict: "reseller_id,stream,month" });
      if (error) throw error;
    }

    const { error: vErr } = await context.supabase.from("forecast_versions").insert({
      reseller_id: data.resellerId,
      author: data.version.author,
      method: data.version.method,
      notes: data.version.notes,
      annual_total_2026: data.version.annualTotal2026,
      created_by: context.userId,
    });
    if (vErr) throw vErr;
    return { ok: true };
  });

export const listGrowthActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { resellerId: string }) => data)
  .handler(async ({ data, context }): Promise<GrowthActionRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("growth_actions")
      .select("id, reseller_id, title, type, owner, due, monthly_uplift, status, notes")
      .eq("reseller_id", data.resellerId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      resellerId: r.reseller_id as string,
      title: r.title as string,
      type: r.type as string,
      owner: r.owner as string,
      due: r.due as string,
      monthlyUplift: Number(r.monthly_uplift),
      status: r.status as GrowthActionRow["status"],
      notes: r.notes as string,
    }));
  });

export const addGrowthAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Omit<GrowthActionRow, "id">) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("growth_actions")
      .insert({
        reseller_id: data.resellerId,
        title: data.title,
        type: data.type,
        owner: data.owner,
        due: data.due,
        monthly_uplift: data.monthlyUplift,
        status: data.status,
        notes: data.notes,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const updateGrowthAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; patch: Partial<Omit<GrowthActionRow, "id" | "resellerId">> }) => data)
  .handler(async ({ data, context }) => {
    const p = data.patch;
    const patch: {
      title?: string; type?: string; owner?: string; due?: string;
      monthly_uplift?: number; status?: string; notes?: string;
    } = {};
    if (p.title !== undefined) patch.title = p.title;
    if (p.type !== undefined) patch.type = p.type;
    if (p.owner !== undefined) patch.owner = p.owner;
    if (p.due !== undefined) patch.due = p.due;
    if (p.monthlyUplift !== undefined) patch.monthly_uplift = p.monthlyUplift;
    if (p.status !== undefined) patch.status = p.status;
    if (p.notes !== undefined) patch.notes = p.notes;
    const { error } = await context.supabase.from("growth_actions").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
