import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { upsertCardTypeBuyRate } from "@/lib/buy-rates.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/buy-rates")({
  component: BuyRatesPage,
});

type Category = {
  id: string;
  code: string;
  label: string;
  scheme: string | null;
  funding: string | null;
  card_category: string | null;
  region: string | null;
  sort_order: number | null;
};

type Rate = {
  canonical_category_id: string | null;
  percent_rate: number | null;
  per_item: number | null;
  monthly_fee: number | null;
  effective_from: string;
};

type RowDraft = {
  percent_rate: string;
  per_item: string;
  monthly_fee: string;
  effective_from: string;
};

const REGION_LABEL: Record<string, string> = { uk: "UK", eu: "EU", non_eu: "Non-EU", us: "US (USD)" };
const SCHEME_LABEL: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover" };

function BuyRatesPage() {
  const { isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const upsert = useServerFn(upsertCardTypeBuyRate);

  const { data: categories = [] } = useQuery({
    queryKey: ["canonical_categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("canonical_categories")
        .select("id, code, label, scheme, funding, card_category, region, sort_order")
        .not("scheme", "is", null)
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true });
      return (data ?? []) as Category[];
    },
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["buy_rates_card_type"],
    queryFn: async () => {
      const { data } = await supabase
        .from("buy_rates")
        .select("canonical_category_id, percent_rate, per_item, monthly_fee, effective_from")
        .is("fee_category_id", null)
        .is("card_present", null);
      return (data ?? []) as Rate[];
    },
  });

  const rateMap = useMemo(() => {
    const m = new Map<string, Rate>();
    for (const r of rates) if (r.canonical_category_id) m.set(r.canonical_category_id, r);
    return m;
  }, [rates]);

  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Seed drafts when rates load
  useEffect(() => {
    const next: Record<string, RowDraft> = {};
    for (const c of categories) {
      const r = rateMap.get(c.id);
      next[c.id] = {
        percent_rate: r?.percent_rate != null ? String(r.percent_rate) : "",
        per_item: r?.per_item != null ? String(r.per_item) : "",
        monthly_fee: r?.monthly_fee != null ? String(r.monthly_fee) : "",
        effective_from: r?.effective_from ?? new Date().toISOString().slice(0, 10),
      };
    }
    setDrafts(next);
  }, [categories, rateMap]);

  // Group by scheme then region
  const grouped = useMemo(() => {
    const g: Record<string, Record<string, Category[]>> = {};
    for (const c of categories) {
      const s = c.scheme ?? "other";
      const r = c.region ?? "other";
      g[s] ??= {};
      g[s][r] ??= [];
      g[s][r].push(c);
    }
    return g;
  }, [categories]);

  const isDirty = (c: Category): boolean => {
    const d = drafts[c.id];
    if (!d) return false;
    const r = rateMap.get(c.id);
    const cur = {
      percent_rate: r?.percent_rate != null ? String(r.percent_rate) : "",
      per_item: r?.per_item != null ? String(r.per_item) : "",
      monthly_fee: r?.monthly_fee != null ? String(r.monthly_fee) : "",
      effective_from: r?.effective_from ?? new Date().toISOString().slice(0, 10),
    };
    return (
      d.percent_rate !== cur.percent_rate ||
      d.per_item !== cur.per_item ||
      d.monthly_fee !== cur.monthly_fee ||
      d.effective_from !== cur.effective_from
    );
  };

  const onSave = async (c: Category) => {
    const d = drafts[c.id];
    if (!d) return;
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    setSavingId(c.id);
    try {
      await upsert({
        data: {
          canonical_category_id: c.id,
          percent_rate: num(d.percent_rate),
          per_item: num(d.per_item),
          monthly_fee: num(d.monthly_fee),
          effective_from: d.effective_from,
        },
      });
      toast.success(`Saved ${c.label}`);
      await qc.invalidateQueries({ queryKey: ["buy_rates_card_type"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  const update = (id: string, patch: Partial<RowDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  return (
    <>
      <PageHeader
        title="Buy rates"
        description={
          isSuperAdmin
            ? "Set the buy rate for each card type. These feed margin calculations on every proposal."
            : "View buy rates per card type (only admins can edit)."
        }
      />

      <div className="space-y-6">
        {Object.entries(grouped).map(([scheme, byRegion]) => (
          <div key={scheme} className="rounded-2xl border bg-card shadow-soft overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/40 text-sm font-medium">
              {SCHEME_LABEL[scheme] ?? scheme}
            </div>
            {Object.entries(byRegion).map(([region, rows]) => (
              <div key={region}>
                <div className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/20 border-b">
                  {REGION_LABEL[region] ?? region}
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-medium">Card type</th>
                      <th className="px-3 py-2 font-medium text-right w-28">% Rate</th>
                      <th className="px-3 py-2 font-medium text-right w-28">Per item (£)</th>
                      <th className="px-3 py-2 font-medium text-right w-28">Monthly (£)</th>
                      <th className="px-3 py-2 font-medium w-40">Effective from</th>
                      <th className="px-3 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((c) => {
                      const d = drafts[c.id];
                      const dirty = isDirty(c);
                      const readOnly = !isSuperAdmin;
                      return (
                        <tr key={c.id}>
                          <td className="px-4 py-2">
                            <div>{c.label}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{c.code}</div>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              inputMode="decimal"
                              className="h-8 text-right tabular-nums"
                              disabled={readOnly}
                              value={d?.percent_rate ?? ""}
                              onChange={(e) => update(c.id, { percent_rate: e.target.value })}
                              placeholder="—"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              inputMode="decimal"
                              className="h-8 text-right tabular-nums"
                              disabled={readOnly}
                              value={d?.per_item ?? ""}
                              onChange={(e) => update(c.id, { per_item: e.target.value })}
                              placeholder="—"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              inputMode="decimal"
                              className="h-8 text-right tabular-nums"
                              disabled={readOnly}
                              value={d?.monthly_fee ?? ""}
                              onChange={(e) => update(c.id, { monthly_fee: e.target.value })}
                              placeholder="—"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="date"
                              className="h-8"
                              disabled={readOnly}
                              value={d?.effective_from ?? ""}
                              onChange={(e) => update(c.id, { effective_from: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant={dirty ? "default" : "outline"}
                                disabled={!dirty || savingId === c.id}
                                onClick={() => onSave(c)}
                              >
                                {savingId === c.id ? "Saving…" : "Save"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
