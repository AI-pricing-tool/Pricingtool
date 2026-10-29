import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/lib/forecasting/app-store";
import { getResellerSeries, formatMoney, formatCommission, formatBps, RESELLERS, CURRENT_MONTH, resellerBpsSplit } from "@/lib/forecasting/mock-data";
import { Kpi, StatusBadge } from "@/components/forecasting/Kpi";
import { ForecastLineChart, CommissionLineChart } from "@/components/forecasting/ForecastChart";
import { latestActual, ytd, rolling12, yoyGrowth, yearTotal, statusVsForecast, effectiveBps, aggregateSeries, allResellerIds } from "@/lib/forecasting/forecast-helpers";
import { Button } from "@/components/ui/button";
import { ForecastPageHeader } from "@/components/forecasting/PageHeader";
import { ArrowUpRight, TrendingUp, Wallet, Calendar, Target as TargetIcon, Coins, Percent } from "lucide-react";

export const Route = createFileRoute("/_authenticated/forecasting/")({
  head: () => ({ meta: [{ title: "Dashboard · Payment Forecasting" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { activeResellerId, isAllResellers, forecastOverrides } = useApp();
  if (!activeResellerId) return null;
  const reseller = isAllResellers ? undefined : RESELLERS.find(r => r.id === activeResellerId)!;
  const series = isAllResellers
    ? aggregateSeries(allResellerIds(), forecastOverrides)
    : getResellerSeries(activeResellerId, forecastOverrides[activeResellerId]);

  const cur = latestActual(series)!;
  const ytdValue = ytd(series);
  const ytdVestaComm = ytd(series, "actualVestaCommission");
  const ytdBuComm = ytd(series, "actualBuCommission");
  const r12 = rolling12(series);
  const r12VestaComm = rolling12(series, CURRENT_MONTH, "actualVestaCommission");
  const r12BuComm = rolling12(series, CURRENT_MONTH, "actualBuCommission");
  const yoy = yoyGrowth(series);
  const bpsR12 = effectiveBps(series);
  const split = isAllResellers
    ? {
        vestaBps: r12 ? (r12VestaComm / r12) * 10000 : 0,
        buBps: r12 ? (r12BuComm / r12) * 10000 : 0,
        totalBps: bpsR12,
      }
    : resellerBpsSplit(activeResellerId);
  const vesta26 = yearTotal(series, 2026, "vestaForecast");
  const reseller26 = yearTotal(series, 2026, "resellerForecast");
  const vesta26VestaComm = yearTotal(series, 2026, "vestaForecastVestaCommission");
  const vesta26BuComm = yearTotal(series, 2026, "vestaForecastBuCommission");
  const reseller26VestaComm = yearTotal(series, 2026, "resellerForecastVestaCommission");
  const reseller26BuComm = yearTotal(series, 2026, "resellerForecastBuCommission");
  const variance26 = reseller26 - vesta26;
  const status = statusVsForecast(cur.actual, cur.vestaForecast);

  return (
    <div>
      <ForecastPageHeader
        title="Growth dashboard"
        subtitle={reseller
          ? `${reseller.name} · ${reseller.sector} · current period to ${CURRENT_MONTH}`
          : `All resellers · consolidated portfolio · current period to ${CURRENT_MONTH}`}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <Kpi label="Latest month value" value={formatMoney(cur.actual)} hint={`vs Platform ${formatMoney(cur.vestaForecast)}`} icon={<Wallet className="h-4 w-4 text-muted-foreground" />} />
        <Kpi label="Pricing Tool earned (mo)" value={formatCommission(cur.actualVestaCommission)} hint={`@ ${formatBps(split.vestaBps)}`} tone="warning" icon={<Coins className="h-4 w-4 text-muted-foreground" />} />
        <Kpi label="Business Unit earned (mo)" value={formatCommission(cur.actualBuCommission)} hint={`@ ${formatBps(split.buBps)}`} tone="success" icon={<Coins className="h-4 w-4 text-muted-foreground" />} />
        <Kpi label="Rolling 12m value" value={formatMoney(r12)} hint={`YoY ${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%`} tone={yoy >= 0 ? "success" : "destructive"} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
        <Kpi label="YTD value" value={formatMoney(ytdValue)} hint={`R12 bps ${formatBps(bpsR12)}`} icon={<Calendar className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <Kpi label="Pricing Tool YTD commission" value={formatCommission(ytdVestaComm)} hint={`R12 ${formatCommission(r12VestaComm)}`} tone="warning" icon={<Percent className="h-4 w-4 text-muted-foreground" />} />
        <Kpi label="Business Unit YTD commission" value={formatCommission(ytdBuComm)} hint={`R12 ${formatCommission(r12BuComm)}`} tone="success" />
        <Kpi label="Pricing Tool 2026 forecast" value={formatCommission(vesta26VestaComm)} hint={`Reseller plan: ${formatCommission(reseller26VestaComm)}`} tone="warning" icon={<TargetIcon className="h-4 w-4 text-muted-foreground" />} />
        <Kpi label="Business Unit 2026 forecast" value={formatCommission(vesta26BuComm)} hint={`Reseller plan: ${formatCommission(reseller26BuComm)}`} tone="success" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4 mt-6">
        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Card turnover — actuals vs forecasts to Dec 2028</h2>
            <StatusBadge tone={status.tone === "muted" ? "muted" : status.tone === "info" ? "info" : status.tone}>{status.label} this month</StatusBadge>
          </div>
          <ForecastLineChart data={series} />
        </div>
        <div className="bg-card border rounded-xl p-5 shadow-sm flex flex-col">
          <h2 className="font-semibold mb-3">This month</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              <tr><td className="py-2 text-muted-foreground">Actual value</td><td className="py-2 text-right font-semibold">{formatMoney(cur.actual)}</td></tr>
              <tr><td className="py-2 text-muted-foreground">Platform forecast value</td><td className="py-2 text-right">{formatMoney(cur.vestaForecast)}</td></tr>
              <tr><td className="py-2 text-muted-foreground">Pricing Tool commission</td><td className="py-2 text-right font-semibold text-warning">{formatCommission(cur.actualVestaCommission)}</td></tr>
              <tr><td className="py-2 text-muted-foreground">Business Unit commission</td><td className="py-2 text-right font-semibold text-success">{formatCommission(cur.actualBuCommission)}</td></tr>
              <tr><td className="py-2 text-muted-foreground">Total commission</td><td className="py-2 text-right">{formatCommission(cur.actualCommission)}</td></tr>
              <tr><td className="py-2 text-muted-foreground">Effective bps (platform / partner)</td><td className="py-2 text-right">{formatBps(split.vestaBps)} / {formatBps(split.buBps)}</td></tr>
              <tr><td className="py-2 text-muted-foreground">Vs Platform value</td><td className="py-2 text-right"><StatusBadge tone={(cur.actual ?? 0) >= cur.vestaForecast ? "success" : "destructive"}>{formatMoney((cur.actual ?? 0) - cur.vestaForecast)}</StatusBadge></td></tr>
            </tbody>
          </table>
          <div className="mt-4 bg-primary/10 text-primary rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Gap to your 2026 target</span>
            <strong>{formatMoney(reseller26 - ytdValue)}</strong>
          </div>
          <div className="mt-auto pt-4 flex gap-2">
            <Button asChild className="flex-1"><Link to="/forecasting/builder">Update forecast <ArrowUpRight className="h-4 w-4 ml-1" /></Link></Button>
            <Button asChild variant="outline"><Link to="/forecasting/compare">Compare</Link></Button>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-sm mt-6">
        <h2 className="font-semibold mb-3">Commission split — Pricing Tool vs Business Unit (actuals + forecasts)</h2>
        <CommissionLineChart data={series} />
        <p className="text-xs text-muted-foreground mt-2">Actuals through {CURRENT_MONTH} are sample data. Forecasts project each stream forward using the effective rolling bps split derived from those actuals (variance {variance26 >= 0 ? "+" : ""}{formatMoney(variance26)} vs platform baseline). The platform share is derived from the total commission using the platform and partner split set in your configuration.</p>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">Sample actuals aggregated per partner. Commission split = platform share + partner share.</div>
    </div>
  );
}
