import { createFileRoute } from "@tanstack/react-router";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import { useApp } from "@/lib/forecasting/app-store";
import { FORECAST_START, formatMonth } from "@/lib/forecasting/mock-data";
import { ForecastPageHeader } from "@/components/forecasting/PageHeader";
import { allResellerIds, portfolioMonthly } from "@/lib/forecasting/forecast-helpers";

export const Route = createFileRoute("/_authenticated/forecasting/admin")({
  head: () => ({ meta: [{ title: "Admin · Payment Forecasting" }] }),
  component: Admin,
});

function Admin() {
  const { user, forecastOverrides } = useApp();
  if (user?.role !== "admin") {
    return (
      <div>
        <ForecastPageHeader title="Admin" />
        <div className="text-sm text-muted-foreground">Admin access required.</div>
      </div>
    );
  }

  const ids = allResellerIds();
  const actualTurn = portfolioMonthly(ids, "actual", forecastOverrides);
  const fcstTurn = portfolioMonthly(ids, "vestaForecast", forecastOverrides);
  const actualComm = portfolioMonthly(ids, "actualCommission", forecastOverrides);
  const fcstComm = portfolioMonthly(ids, "vestaForecastCommission", forecastOverrides);

  const turnoverData = actualTurn.map((row, i) => ({
    label: formatMonth(row.month),
    actual: row.total || null,
    forecast: fcstTurn[i]?.total || null,
  }));
  const commissionData = actualComm.map((row, i) => ({
    label: formatMonth(row.month),
    actual: row.total || null,
    forecast: fcstComm[i]?.total || null,
  }));

  const forecastLabel = formatMonth(FORECAST_START);

  return (
    <div>
      <ForecastPageHeader title="Admin" subtitle="Portfolio roll-up: actuals vs forecast across all resellers" />

      <div className="bg-card border rounded-xl p-5 shadow-sm mb-6">
        <h2 className="font-semibold mb-3">Card turnover — Actual vs Forecast</h2>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={turnoverData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={5} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(1)}m`} />
            <Tooltip formatter={(v: number) => `£${(v / 1000).toFixed(2)}m`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x={forecastLabel} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Forecast →", position: "top", fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Line type="monotone" dataKey="actual" stroke="var(--color-chart-actual)" strokeWidth={2.5} dot={false} name="Actual turnover" connectNulls={false} />
            <Line type="monotone" dataKey="forecast" stroke="var(--color-chart-vesta)" strokeWidth={2} strokeDasharray="6 4" dot={false} name="Forecast turnover" connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">Total card turnover summed across all resellers, Jan 2025 → Dec 2028.</p>
      </div>

      <div className="bg-card border rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold mb-3">Commission — Actual vs Forecast</h2>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={commissionData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={5} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v.toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => `£${v.toFixed(1)}k`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x={forecastLabel} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Forecast →", position: "top", fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Line type="monotone" dataKey="actual" stroke="var(--color-chart-vesta-commission)" strokeWidth={2.5} dot={false} name="Actual commission" connectNulls={false} />
            <Line type="monotone" dataKey="forecast" stroke="var(--color-chart-bu-commission)" strokeWidth={2} strokeDasharray="6 4" dot={false} name="Forecast commission" connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">Total commission earned summed across all resellers, Jan 2025 → Dec 2028.</p>
      </div>
    </div>
  );
}
