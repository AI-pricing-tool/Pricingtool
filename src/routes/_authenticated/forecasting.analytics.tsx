import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/lib/forecasting/app-store";
import { getResellerSeries, formatMoney, formatCommission, formatBps, formatMonth, RESELLERS, CURRENT_MONTH, ALL_RESELLERS_LABEL } from "@/lib/forecasting/mock-data";
import { Kpi, StatusBadge } from "@/components/forecasting/Kpi";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { latestActual, ytd, rolling12, yoyGrowth, effectiveBps, aggregateSeries, allResellerIds } from "@/lib/forecasting/forecast-helpers";
import { ForecastPageHeader } from "@/components/forecasting/PageHeader";

void ytd;

export const Route = createFileRoute("/_authenticated/forecasting/analytics")({
  head: () => ({ meta: [{ title: "Volumes, values & commission · Payment Forecasting" }] }),
  component: Analytics,
});

function Analytics() {
  const { activeResellerId, isAllResellers, forecastOverrides } = useApp();
  if (!activeResellerId) return null;
  const reseller = isAllResellers ? undefined : RESELLERS.find(r => r.id === activeResellerId)!;
  const series = isAllResellers
    ? aggregateSeries(allResellerIds(), forecastOverrides)
    : getResellerSeries(activeResellerId);
  const cur = latestActual(series)!;
  const label = reseller?.name ?? ALL_RESELLERS_LABEL;

  const histData = series
    .filter(p => p.actual != null)
    .map(p => ({ label: formatMonth(p.month), value: p.actual, commission: p.actualCommission }));
  // TODO (template): 48 is an arbitrary assumed average-ticket divisor, not a
  // real transaction count. Wire this to actual transaction data or remove it.
  const txns = Math.round((cur.actual ?? 0) * 48);
  const avgTicket = ((cur.actual ?? 0) * 1000) / txns;
  const bpsR12 = effectiveBps(series);
  const bps = reseller?.bps ?? bpsR12;

  return (
    <div>
      <ForecastPageHeader title="Volumes, values & commission" subtitle={`${label} · historic card payment performance to ${CURRENT_MONTH}`} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="Value this month" value={formatMoney(cur.actual)} hint={`YoY ${yoyGrowth(series) >= 0 ? "+" : ""}${yoyGrowth(series).toFixed(1)}%`} tone="success" />
        <Kpi label="Commission this month" value={formatCommission(cur.actualCommission)} hint={`@ ${formatBps(bps)}`} tone="primary" />
        <Kpi label="Transactions" value={txns.toLocaleString()} hint="Sample data" />
        <Kpi label="Average ticket" value={`£${avgTicket.toFixed(2)}`} hint="Sample data" />
        <Kpi label="Rolling 12 months" value={formatMoney(rolling12(series))} hint={`Comm ${formatCommission(rolling12(series, CURRENT_MONTH, "actualCommission"))} · ${formatBps(bpsR12)}`} tone="primary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4 mt-6">
        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold mb-3">Monthly value & commission trend</h2>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={histData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={3} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(1)}m`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v.toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number, n: string) => n === "Commission" ? formatCommission(v) : formatMoney(v)}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="value" name="Card turnover" fill="var(--color-chart-actual)" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="commission" name="Commission" stroke="var(--color-chart-commission)" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold mb-3">Forecast-relevant segments</h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b">
              <tr><th className="text-left py-2">Segment</th><th className="text-right">Value</th><th className="text-right">Commission</th><th className="text-right">Trend</th></tr>
            </thead>
            <tbody className="divide-y">
              {[
                { name: "Top 20 sites", share: 0.58, tone: "success" as const, trend: "+14%" },
                { name: "Long-tail sites", share: 0.28, tone: "info" as const, trend: "+5%" },
                { name: "New sites (90d)", share: 0.09, tone: "success" as const, trend: "new" },
                { name: "Dormant / reactivation", share: 0.05, tone: "warning" as const, trend: "opportunity" },
              ].map(s => {
                const value = (cur.actual ?? 0) * s.share;
                const comm = value * bps / 10000;
                return (
                  <tr key={s.name}>
                    <td className="py-2">{s.name}</td>
                    <td className="text-right">{formatMoney(value)}</td>
                    <td className="text-right text-primary">{formatCommission(comm)}</td>
                    <td className="text-right"><StatusBadge tone={s.tone}>{s.trend}</StatusBadge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-3">Commission column uses the assumed {formatBps(bps)} return for {label}.</p>
        </div>
      </div>
    </div>
  );
}
