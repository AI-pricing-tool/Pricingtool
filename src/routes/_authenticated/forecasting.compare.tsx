import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/lib/forecasting/app-store";
import { getResellerSeries, formatMoney, formatCommission, formatBps, formatMonth, RESELLERS, ALL_RESELLERS_LABEL } from "@/lib/forecasting/mock-data";
import { ForecastLineChart, VarianceBarChart } from "@/components/forecasting/ForecastChart";
import { Kpi, StatusBadge } from "@/components/forecasting/Kpi";
import { yearTotal, aggregateSeries, allResellerIds } from "@/lib/forecasting/forecast-helpers";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useState } from "react";
import { ForecastPageHeader } from "@/components/forecasting/PageHeader";

export const Route = createFileRoute("/_authenticated/forecasting/compare")({
  head: () => ({ meta: [{ title: "Compare forecasts · Payment Forecasting" }] }),
  component: Compare,
});

function Compare() {
  const { activeResellerId, isAllResellers, forecastOverrides } = useApp();
  const [year, setYear] = useState<2026 | 2027 | 2028>(2026);
  if (!activeResellerId) return null;
  const reseller = isAllResellers ? undefined : RESELLERS.find(r => r.id === activeResellerId)!;
  const label = reseller?.name ?? ALL_RESELLERS_LABEL;
  const series = isAllResellers
    ? aggregateSeries(allResellerIds(), forecastOverrides)
    : getResellerSeries(activeResellerId, forecastOverrides[activeResellerId]);

  const vestaY = yearTotal(series, year, "vestaForecast");
  const resellerY = yearTotal(series, year, "resellerForecast");
  const vestaYComm = yearTotal(series, year, "vestaForecastCommission");
  const resellerYComm = yearTotal(series, year, "resellerForecastCommission");
  const gap = vestaY - resellerY;
  const commGap = vestaYComm - resellerYComm;
  const bps = reseller?.bps ?? (yearTotal(series, year, 'resellerForecast') ? (resellerYComm / yearTotal(series, year, 'resellerForecast')) * 10000 : 0);
  const additionalRequired = gap > 0 ? gap : 0;

  const yearRows = series.filter(p => p.month.startsWith(String(year)));

  return (
    <div>
      <ForecastPageHeader title="Compare forecasts" subtitle={`${label} · actuals vs Platform vs reseller submitted forecast`} />
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-muted-foreground">Year</span>
        <Select value={String(year)} onValueChange={v => setYear(Number(v) as 2026)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2026">2026</SelectItem>
            <SelectItem value="2027">2027</SelectItem>
            <SelectItem value="2028">2028</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={`Platform ${year} value`} value={formatMoney(vestaY)} hint={`Comm ${formatCommission(vestaYComm)}`} tone="primary" />
        <Kpi label={`Reseller ${year} value`} value={formatMoney(resellerY)} hint={`Comm ${formatCommission(resellerYComm)}`} tone={resellerY >= vestaY ? "success" : "warning"} />
        <Kpi label="Value growth gap" value={formatMoney(Math.abs(gap))} hint={gap > 0 ? "Reseller below platform" : "Reseller ahead"} tone={gap > 0 ? "destructive" : "success"} />
        <Kpi label="Commission gap" value={formatCommission(Math.abs(commGap))} hint={`@ ${formatBps(bps)} · ${commGap > 0 ? "below" : "ahead of"} Platform`} tone={commGap > 0 ? "destructive" : "success"} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Additional value required to match Platform baseline: <strong>{formatMoney(additionalRequired)}</strong></div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6">
        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold mb-3">Actuals vs forecasts</h2>
          <ForecastLineChart data={series} />
        </div>
        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold mb-3">Monthly variance (reseller − Platform)</h2>
          <VarianceBarChart data={series} />
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-sm mt-6 overflow-x-auto">
        <h2 className="font-semibold mb-3">{year} month-by-month</h2>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b">
            <tr>
              <th className="text-left py-2">Month</th>
              <th className="text-right">Actual value</th>
              <th className="text-right">Platform value</th>
              <th className="text-right">Reseller value</th>
              <th className="text-right">Value variance</th>
              <th className="text-right">Platform comm</th>
              <th className="text-right">Reseller comm</th>
              <th className="text-right">Comm variance</th>
              <th className="text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {yearRows.map(p => {
              const variance = (p.resellerForecast ?? 0) - p.vestaForecast;
              const commVariance = (p.resellerForecastCommission ?? 0) - p.vestaForecastCommission;
              const tone = variance >= 0 ? "success" : "destructive";
              const commTone = commVariance >= 0 ? "success" : "destructive";
              const status = p.actual != null
                ? (p.actual >= p.vestaForecast ? "Ahead" : p.actual >= p.vestaForecast * 0.97 ? "On track" : "Behind")
                : (p.resellerForecast == null || p.resellerForecast >= p.vestaForecast ? "Aligned" : "Below platform");
              const sTone = status === "Ahead" || status === "Aligned" ? "success" : status === "On track" ? "info" : status === "Below platform" ? "warning" : "destructive";
              return (
                <tr key={p.month} className={p.resellerForecast != null && p.resellerForecast < p.vestaForecast ? "bg-destructive/5" : ""}>
                  <td className="py-2">{formatMonth(p.month)}</td>
                  <td className="text-right">{formatMoney(p.actual)}</td>
                  <td className="text-right">{formatMoney(p.vestaForecast)}</td>
                  <td className="text-right">{formatMoney(p.resellerForecast)}</td>
                  <td className={`text-right font-semibold ${tone === "success" ? "text-success" : "text-destructive"}`}>{variance >= 0 ? "+" : ""}{formatMoney(variance)}</td>
                  <td className="text-right text-muted-foreground">{formatCommission(p.vestaForecastCommission)}</td>
                  <td className="text-right">{formatCommission(p.resellerForecastCommission)}</td>
                  <td className={`text-right font-semibold ${commTone === "success" ? "text-success" : "text-destructive"}`}>{commVariance >= 0 ? "+" : ""}{formatCommission(commVariance)}</td>
                  <td className="text-right"><StatusBadge tone={sTone as never}>{status}</StatusBadge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-3">Commission columns use {label}'s {formatBps(bps)} return assumption.</p>
      </div>
    </div>
  );
}
