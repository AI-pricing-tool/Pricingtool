import { createFileRoute } from "@tanstack/react-router";
import { SelectBrandNotice } from "@/components/forecasting/SelectBrandNotice";
import { useApp } from "@/lib/forecasting/app-store";
import {
  getResellerSeries,
  formatMoney,
  formatCommission,
  formatBps,
  formatMonth,
  RESELLERS,
  MONTHS,
  resellerBpsSplit,
} from "@/lib/forecasting/mock-data";
import { FORECAST_START, FORECAST_END } from "@/lib/forecasting/forecasts";
import { SEASONAL_WEIGHTS, DEFAULT_GROWTH_PCT } from "@/config/template-config";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { yearTotal } from "@/lib/forecasting/forecast-helpers";
import { ForecastPageHeader } from "@/components/forecasting/PageHeader";
import { useAuth } from "@/hooks/use-auth";
import * as XLSX from "xlsx";
import { Download, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/forecasting/builder")({
  head: () => ({ meta: [{ title: "Forecast builder · Payment Forecasting" }] }),
  component: Builder,
});

type Stream = "reseller" | "vesta";

function Builder() {
  const {
    activeResellerId, isAllResellers, forecastOverrides, commissionOverrides,
    vestaTurnoverOverrides, vestaCommissionOverrides,
    saveForecast, user,
  } = useApp();
  const { isSuperAdmin } = useAuth();
  if (!activeResellerId) return null;
  if (isAllResellers) return <SelectBrandNotice page="Forecast builder" />;
  const reseller = RESELLERS.find(r => r.id === activeResellerId)!;
  const { totalBps } = resellerBpsSplit(activeResellerId);

  const baseSeries = useMemo(() => getResellerSeries(activeResellerId), [activeResellerId]);
  const horizonMonths = useMemo(
    () => MONTHS.filter(m => m >= FORECAST_START && m <= FORECAST_END),
    [],
  );

  // Local in-grid edits (committed via Save). Pre-seeded from persisted overrides.
  const [resTurn, setResTurn] = useState<Record<string, number>>(() => ({ ...(forecastOverrides[activeResellerId] || {}) }));
  const [resComm, setResComm] = useState<Record<string, number>>(() => ({ ...(commissionOverrides[activeResellerId] || {}) }));
  const [vestaTurn, setVestaTurn] = useState<Record<string, number>>(() => ({ ...(vestaTurnoverOverrides[activeResellerId] || {}) }));
  const [vestaComm, setVestaComm] = useState<Record<string, number>>(() => ({ ...(vestaCommissionOverrides[activeResellerId] || {}) }));

  const [notes, setNotes] = useState("");
  const [exportStream, setExportStream] = useState<Stream>("reseller");
  const uploadStream = exportStream;

  // ── Assumptions sidebar (apply quick-spread to reseller turnover) ──────────
  const [year, setYear] = useState<2026 | 2027 | 2028>(2026);
  const [method, setMethod] = useState<"manual" | "growth_pct" | "annual_target">("growth_pct");
  const [growthPct, setGrowthPct] = useState(DEFAULT_GROWTH_PCT);
  const [annualTarget, setAnnualTarget] = useState(() => yearTotal(baseSeries, 2026, "vestaForecast"));

  const applyAssumption = () => {
    const yearMonths = horizonMonths.filter(m => m.startsWith(String(year)));
    const next: Record<string, number> = { ...resTurn };
    if (method === "growth_pct") {
      yearMonths.forEach(m => {
        const prevYearMonth = `${year - 1}-${m.split("-")[1]}`;
        const prev = baseSeries.find(p => p.month === prevYearMonth);
        const base = prev?.actual ?? prev?.vestaForecast ?? baseSeries.find(p => p.month === m)?.vestaForecast ?? 0;
        next[m] = Math.round(base * (1 + growthPct / 100));
      });
    } else if (method === "annual_target") {
      yearMonths.forEach(m => {
        const mi = parseInt(m.split("-")[1]) - 1;
        const total = SEASONAL_WEIGHTS.reduce((a, b) => a + b, 0);
        next[m] = Math.round(annualTarget * (SEASONAL_WEIGHTS[mi] / total));
      });
    }
    setResTurn(next);
    // Recompute commission from new turnover at fallback bps.
    const nextComm: Record<string, number> = { ...resComm };
    yearMonths.forEach(m => { nextComm[m] = +(next[m] * totalBps / 10000).toFixed(2); });
    setResComm(nextComm);
    toast.success(`${year} forecast updated — review it, then select Save forecast version to keep it.`);
  };

  // ── Display values for the grid: local edit ?? saved override ?? base ─────
  const valueFor = (m: string) => {
    const point = baseSeries.find(p => p.month === m)!;
    const rt = resTurn[m] ?? point.resellerForecast ?? point.vestaForecast ?? 0;
    const rc = resComm[m] ?? (rt * totalBps) / 10000;
    const vt = vestaTurn[m] ?? point.vestaForecast ?? 0;
    const vc = vestaComm[m] ?? point.vestaForecastCommission ?? 0;
    return { rt, rc: +rc.toFixed(2), vt, vc: +vc.toFixed(2) };
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const buckets: Record<number, { rt: number; rc: number; vt: number; vc: number }> = {};
    horizonMonths.forEach(m => {
      const y = Number(m.slice(0, 4));
      const v = valueFor(m);
      buckets[y] ??= { rt: 0, rc: 0, vt: 0, vc: 0 };
      buckets[y].rt += v.rt; buckets[y].rc += v.rc;
      buckets[y].vt += v.vt; buckets[y].vc += v.vc;
    });
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonMonths, resTurn, resComm, vestaTurn, vestaComm, baseSeries]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = () => {
    const patch: Parameters<typeof saveForecast>[1] = {
      resellerTurnover: resTurn,
      resellerCommission: resComm,
    };
    if (isSuperAdmin) {
      patch.vestaTurnover = vestaTurn;
      patch.vestaCommission = vestaComm;
    }
    const annual = horizonMonths
      .filter(m => m.startsWith("2026"))
      .reduce((acc, m) => acc + (resTurn[m] ?? baseSeries.find(p => p.month === m)?.vestaForecast ?? 0), 0);
    saveForecast(activeResellerId, patch, {
      author: user?.name ?? "Unknown",
      notes: notes || `Manual grid edits`,
      method: "manual",
      annualTotal2026: annual,
    });
    toast.success("Forecast saved");
    setNotes("");
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const isVesta = exportStream === "vesta";
    const header = isVesta
      ? ["Month", "Pricing Tool card turnover (£k)", "Pricing Tool commission (£k)"]
      : ["Month", "Card turnover (£k)", "Commission (£k)"];
    const rows = horizonMonths.map(m => {
      const v = valueFor(m);
      return isVesta ? [m, Math.round(v.vt), +v.vc.toFixed(2)] : [m, Math.round(v.rt), +v.rc.toFixed(2)];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${reseller.name.slice(0, 28)} forecast`);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `${reseller.id}-forecast-${exportStream}-${stamp}.xlsx`);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      if (!rows.length) throw new Error("Sheet is empty");

      const keys = Object.keys(rows[0]);
      const monthKey = keys.find(k => /^month$/i.test(k));
      if (!monthKey) throw new Error("Missing 'Month' column");
      const turnoverKey = keys.find(k => /turnover/i.test(k));
      const commissionKey = keys.find(k => /commission/i.test(k));
      if (!turnoverKey && !commissionKey) throw new Error("Need at least a turnover or commission column");

      const isVesta = uploadStream === "vesta";
      if (isVesta && !isSuperAdmin) throw new Error("Only admins can upload Pricing Tool forecasts");

      const nextTurn: Record<string, number> = {};
      const nextComm: Record<string, number> = {};
      const badMonths: string[] = [];

      rows.forEach((r) => {
        const raw = String(r[monthKey] ?? "").trim();
        let month = raw;
        // Accept "YYYY-MM" or Excel date-serialised values.
        if (/^\d{4}-\d{2}/.test(raw)) month = raw.slice(0, 7);
        else if (!Number.isNaN(Date.parse(raw))) {
          const d = new Date(raw);
          month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        }
        if (!horizonMonths.includes(month)) { badMonths.push(raw); return; }
        if (turnoverKey != null) {
          const n = Number(r[turnoverKey]);
          if (!Number.isNaN(n)) nextTurn[month] = n;
        }
        if (commissionKey != null) {
          const n = Number(r[commissionKey]);
          if (!Number.isNaN(n)) nextComm[month] = n;
        }
      });

      if (!Object.keys(nextTurn).length && !Object.keys(nextComm).length) {
        throw new Error("No valid rows found");
      }

      if (isVesta) {
        setVestaTurn(prev => ({ ...prev, ...nextTurn }));
        setVestaComm(prev => ({ ...prev, ...nextComm }));
      } else {
        setResTurn(prev => ({ ...prev, ...nextTurn }));
        setResComm(prev => ({ ...prev, ...nextComm }));
      }

      // Replace + save as new version (per approved plan).
      const patch: Parameters<typeof saveForecast>[1] = isVesta
        ? { vestaTurnover: nextTurn, vestaCommission: nextComm }
        : { resellerTurnover: nextTurn, resellerCommission: nextComm };
      const annual = horizonMonths
        .filter(m => m.startsWith("2026"))
        .reduce((acc, m) => acc + (isVesta ? (nextTurn[m] ?? vestaTurn[m] ?? 0) : (nextTurn[m] ?? resTurn[m] ?? 0)), 0);
      saveForecast(activeResellerId, patch, {
        author: user?.name ?? "Unknown",
        notes: `Uploaded ${file.name}`,
        method: "manual",
        annualTotal2026: annual,
      });

      toast.success(`Imported ${Object.keys(nextTurn).length || Object.keys(nextComm).length} rows — saved as new version.`);
      if (badMonths.length) {
        toast.warning(`${badMonths.length} rows skipped (month outside the forecast range): ${badMonths.slice(0, 3).join(", ")}${badMonths.length > 3 ? "…" : ""}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const years = Array.from(new Set(horizonMonths.map(m => Number(m.slice(0, 4))))).sort();

  return (
    <div>
      <ForecastPageHeader
        title="Forecast builder"
        subtitle={`${reseller.name} · edit, export and re-upload across the full forecast horizon (Jun 2026 → Dec 2028)`}
      />

      {/* Toolbar */}
      <div className="bg-card border rounded-xl p-4 shadow-sm mb-4 flex flex-wrap items-end gap-3">
        {isSuperAdmin && (
          <div className="space-y-1">
            <Label className="text-xs">Stream</Label>
            <Select value={exportStream} onValueChange={v => setExportStream(v as Stream)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reseller">Reseller forecast</SelectItem>
                <SelectItem value="vesta">Pricing Tool forecast</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="size-4 mr-2" /> Export .xlsx
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4 mr-2" /> Upload .xlsx
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={handleSave}>Save forecast version</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        {/* Assumptions sidebar */}
        <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 h-fit">
          <h2 className="font-semibold">Quick assumptions</h2>
          <p className="text-xs text-muted-foreground">Spreads a method across a year of reseller turnover. You can still edit individual cells in the grid afterwards.</p>
          <div>
            <Label>Forecast year</Label>
            <Select value={String(year)} onValueChange={v => setYear(Number(v) as 2026)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
                <SelectItem value="2028">2028</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={method} onValueChange={v => setMethod(v as typeof method)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="growth_pct">Growth %</TabsTrigger>
              <TabsTrigger value="annual_target">Annual target</TabsTrigger>
            </TabsList>
            <TabsContent value="growth_pct" className="space-y-2 pt-3">
              <Label>Growth vs previous year (%)</Label>
              <Input type="number" step="0.1" value={growthPct} onChange={e => setGrowthPct(parseFloat(e.target.value) || 0)} />
            </TabsContent>
            <TabsContent value="annual_target" className="space-y-2 pt-3">
              <Label>Annual target (£k)</Label>
              <Input type="number" value={annualTarget} onChange={e => setAnnualTarget(parseFloat(e.target.value) || 0)} />
            </TabsContent>
          </Tabs>
          <Button variant="secondary" className="w-full" onClick={applyAssumption}>Apply to {year}</Button>

          <div>
            <Label>Notes & assumptions</Label>
            <Textarea placeholder="e.g. Assumes Q1 reactivation campaign delivers +£28k/mo." value={notes} onChange={e => setNotes(e.target.value)} className="mt-1.5" />
          </div>

          <div className="text-xs text-muted-foreground border-t pt-3">
            Assumed bps for {reseller.name}: <span className="font-semibold">{formatBps(totalBps)}</span>
          </div>
        </div>

        {/* Excel-style grid */}
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold">Monthly forecast grid</h2>
            <p className="text-xs text-muted-foreground">{horizonMonths.length} months · {isSuperAdmin ? "4" : "2"} editable columns</p>
          </div>
          <div className="overflow-auto max-h-[68vh]">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-muted/40 border-b border-r">Month</th>
                  <th className={`text-right px-3 py-2 border-b ${isSuperAdmin ? "" : "bg-muted/30"}`}>Pricing Tool turnover (£k)</th>
                  <th className={`text-right px-3 py-2 border-b ${isSuperAdmin ? "" : "bg-muted/30"}`}>Pricing Tool commission (£k)</th>
                  <th className="text-right px-3 py-2 border-b">Your turnover (£k)</th>
                  <th className="text-right px-3 py-2 border-b">Your commission (£k)</th>
                </tr>
              </thead>
              <tbody>
                {horizonMonths.map(m => {
                  const v = valueFor(m);
                  return (
                    <tr key={m} className="hover:bg-muted/20">
                      <td className="px-3 py-1 sticky left-0 bg-card border-b border-r font-medium">{formatMonth(m)}</td>
                      <td className="px-2 py-1 border-b text-right">
                        {isSuperAdmin ? (
                          <CellInput value={v.vt} onChange={n => setVestaTurn(p => ({ ...p, [m]: n }))} />
                        ) : (
                          <span className="text-muted-foreground pr-3">{Math.round(v.vt).toLocaleString()}</span>
                        )}
                      </td>
                      <td className="px-2 py-1 border-b text-right">
                        {isSuperAdmin ? (
                          <CellInput value={v.vc} onChange={n => setVestaComm(p => ({ ...p, [m]: n }))} />
                        ) : (
                          <span className="text-muted-foreground pr-3">{v.vc.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-2 py-1 border-b text-right">
                        <CellInput
                          value={v.rt}
                          onChange={n => {
                            setResTurn(p => ({ ...p, [m]: n }));
                            // Auto-recalc commission only if user hasn't manually overridden it.
                            if (resComm[m] == null) setResComm(p => ({ ...p, [m]: +(n * totalBps / 10000).toFixed(2) }));
                          }}
                        />
                      </td>
                      <td className="px-2 py-1 border-b text-right">
                        <CellInput value={v.rc} onChange={n => setResComm(p => ({ ...p, [m]: n }))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="text-xs font-semibold bg-muted/30">
                {years.map(y => {
                  const t = totals[y] ?? { rt: 0, rc: 0, vt: 0, vc: 0 };
                  return (
                    <tr key={y}>
                      <td className="px-3 py-2 sticky left-0 bg-muted/30 border-t border-r">{y} total</td>
                      <td className="px-3 py-2 text-right border-t text-muted-foreground">{formatMoney(t.vt)}</td>
                      <td className="px-3 py-2 text-right border-t text-muted-foreground">{formatCommission(t.vc)}</td>
                      <td className="px-3 py-2 text-right border-t">{formatMoney(t.rt)}</td>
                      <td className="px-3 py-2 text-right border-t text-primary">{formatCommission(t.rc)}</td>
                    </tr>
                  );
                })}
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground px-5 py-3 border-t">
            Editing a turnover cell auto-fills its commission at {formatBps(totalBps)} until you override it manually.
          </p>
        </div>
      </div>
    </div>
  );
}

function CellInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? +value.toFixed(2) : 0}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="h-7 text-right border-0 bg-transparent focus-visible:ring-1 focus-visible:bg-background w-28 ml-auto"
    />
  );
}
