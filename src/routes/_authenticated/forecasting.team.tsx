import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/lib/forecasting/app-store";
import { RESELLERS, getResellerSeries, formatMoney, formatCommission, formatBps, CURRENT_MONTH, FORECAST_START } from "@/lib/forecasting/mock-data";
import { yearTotal, latestActual, yoyGrowth, statusVsForecast, effectiveBps, portfolioMonthlyCombined, portfolioYearTotal, portfolioRolling12 } from "@/lib/forecasting/forecast-helpers";
import { StatusBadge } from "@/components/forecasting/Kpi";
import { ForecastPageHeader } from "@/components/forecasting/PageHeader";
import { StackedPortfolioChart } from "@/components/forecasting/ForecastChart";

export const Route = createFileRoute("/_authenticated/forecasting/team")({
  head: () => ({ meta: [{ title: "Account manager view · Payment Forecasting" }] }),
  component: Team,
});

function Team() {
  const { user, setActiveResellerId, forecastOverrides } = useApp();
  if (!user) return null;
  const ids = user.role === "admin" ? RESELLERS.map(r => r.id) : user.resellerIds ?? [];
  const rows = ids.map(id => {
    const r = RESELLERS.find(x => x.id === id)!;
    const series = getResellerSeries(id, forecastOverrides[id]);
    const cur = latestActual(series)!;
    const vesta = yearTotal(series, 2026, "vestaForecast");
    const resellerY = yearTotal(series, 2026, "resellerForecast");
    const vestaComm = yearTotal(series, 2026, "vestaForecastVestaCommission");
    return { r, cur, vesta, resellerY, vestaComm, bps: effectiveBps(series), yoy: yoyGrowth(series), resellerStatus: statusVsForecast(cur.actual, cur.resellerForecast), vestaStatus: statusVsForecast(cur.actual, cur.vestaForecast) };
  });

  const r12VestaTotal = portfolioRolling12(ids, "actualVestaCommission", forecastOverrides);
  const r12BuTotal = portfolioRolling12(ids, "actualBuCommission", forecastOverrides);
  const ytd2026VestaTotal = portfolioYearTotal(ids, 2026, "actualVestaCommission", forecastOverrides);
  const vestaForecast2026 = portfolioYearTotal(ids, 2026, "vestaForecastVestaCommission", forecastOverrides);
  const portfolioVestaCommSeries = portfolioMonthlyCombined(ids, "actualVestaCommission", "vestaForecastVestaCommission", forecastOverrides);

  return (
    <div>
      <ForecastPageHeader title="Account manager portfolio" subtitle={`${rows.length} assigned resellers · current period to ${CURRENT_MONTH}`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border rounded-xl p-4"><div className="text-xs uppercase text-muted-foreground font-semibold">Pricing Tool R12 earned</div><div className="text-2xl font-bold mt-1 text-warning">{formatCommission(r12VestaTotal)}</div><div className="text-xs text-muted-foreground mt-1">Across {ids.length} resellers</div></div>
        <div className="bg-card border rounded-xl p-4"><div className="text-xs uppercase text-muted-foreground font-semibold">Business Unit R12 earned</div><div className="text-2xl font-bold mt-1 text-success">{formatCommission(r12BuTotal)}</div></div>
        <div className="bg-card border rounded-xl p-4"><div className="text-xs uppercase text-muted-foreground font-semibold">Pricing Tool 2026 YTD earned</div><div className="text-2xl font-bold mt-1 text-warning">{formatCommission(ytd2026VestaTotal)}</div></div>
        <div className="bg-card border rounded-xl p-4"><div className="text-xs uppercase text-muted-foreground font-semibold">Pricing Tool 2026 forecast</div><div className="text-2xl font-bold mt-1 text-primary">{formatCommission(vestaForecast2026)}</div></div>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-sm mb-6">
        <h2 className="font-semibold mb-3">Pricing Tool monthly earnings by reseller — actuals + forecast</h2>
        <StackedPortfolioChart rows={portfolioVestaCommSeries} forecastFromMonth={FORECAST_START} />
        <p className="text-xs text-muted-foreground mt-2">Stacked monthly Pricing Tool commission Jan 2025 → Dec 2028. Dashed line marks the forecast cut-over at Jun 2026.</p>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-secondary">
            <tr>
              <th className="text-left p-3">Reseller</th>
              <th className="text-left">Sector</th>
              <th className="text-right">Latest value</th>
              <th className="text-right">YoY</th>
              <th className="text-right">Avg bps</th>
              <th className="text-right">Platform 2026 value</th>
              <th className="text-right">Reseller 2026 forecast</th>
              <th className="text-right">Pricing Tool 2026 forecast</th>
              <th className="text-right">Reseller status</th>
              <th className="text-right p-3">Pricing Tool status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(({ r, cur, vesta, resellerY, vestaComm, bps, yoy, resellerStatus, vestaStatus }) => {
              const gap = resellerY - vesta;
              return (
                <tr key={r.id} className="hover:bg-accent/40 cursor-pointer" onClick={() => setActiveResellerId(r.id)}>
                  <td className="p-3 font-medium"><Link to="/forecasting" onClick={() => setActiveResellerId(r.id)} className="hover:text-primary">{r.name}</Link></td>
                  <td className="text-muted-foreground">{r.sector}</td>
                  <td className="text-right">{formatMoney(cur.actual)}</td>
                  <td className={`text-right ${yoy >= 0 ? "text-success" : "text-destructive"}`}>{yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}%</td>
                  <td className="text-right">{formatBps(bps)}</td>
                  <td className="text-right">{formatMoney(vesta)}</td>
                  <td className={`text-right ${gap >= 0 ? "text-success" : "text-destructive"}`}>{formatMoney(resellerY)}</td>
                  <td className="text-right text-warning font-semibold">{formatCommission(vestaComm)}</td>
                  <td className="text-right"><StatusBadge tone={resellerStatus.tone === "muted" ? "muted" : resellerStatus.tone === "info" ? "info" : resellerStatus.tone}>{resellerStatus.label}</StatusBadge></td>
                  <td className="text-right p-3"><StatusBadge tone={vestaStatus.tone === "muted" ? "muted" : vestaStatus.tone === "info" ? "info" : vestaStatus.tone}>{vestaStatus.label}</StatusBadge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
