import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, ReferenceLine, AreaChart, Area } from "recharts";
import type { MonthlyPoint } from "@/lib/forecasting/mock-data";
import { formatMonth, RESELLERS } from "@/lib/forecasting/mock-data";
import type { PortfolioMonthRow } from "@/lib/forecasting/forecast-helpers";

const fmt = (v: number) => v == null ? "" : `£${(v / 1000).toFixed(2)}m`;
const fmtK = (v: number) => v == null ? "" : `£${v.toFixed(1)}k`;

export function ForecastLineChart({ data, height = 320 }: { data: MonthlyPoint[]; height?: number }) {
  const chartData = data.map(d => ({ ...d, label: formatMonth(d.month) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={5} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${(v / 1000).toFixed(1)}m`} />
        <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="actual" stroke="var(--color-chart-actual)" strokeWidth={2.5} dot={false} name="Actual" connectNulls={false} />
        <Line type="monotone" dataKey="vestaForecast" stroke="var(--color-chart-vesta)" strokeWidth={2} strokeDasharray="6 4" dot={false} name="Platform forecast" />
        <Line type="monotone" dataKey="resellerForecast" stroke="var(--color-chart-reseller)" strokeWidth={2} strokeDasharray="6 4" dot={false} name="Reseller forecast" connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CommissionLineChart({ data, height = 280 }: { data: MonthlyPoint[]; height?: number }) {
  const chartData = data.map(d => {
    const totalActual = d.actualVestaCommission != null && d.actualBuCommission != null
      ? +(d.actualVestaCommission + d.actualBuCommission).toFixed(3)
      : null;
    const totalVestaForecast = +(d.vestaForecastVestaCommission + d.vestaForecastBuCommission).toFixed(3);
    const totalResellerForecast = d.resellerForecastVestaCommission != null && d.resellerForecastBuCommission != null
      ? +(d.resellerForecastVestaCommission + d.resellerForecastBuCommission).toFixed(3)
      : null;
    return { ...d, label: formatMonth(d.month), totalActual, totalVestaForecast, totalResellerForecast };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={5} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v.toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => fmtK(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="actualVestaCommission" stroke="var(--color-chart-vesta-commission)" strokeWidth={2.5} dot={false} name="Pricing Tool commission (actual)" connectNulls={false} />
        <Line type="monotone" dataKey="actualBuCommission" stroke="var(--color-chart-bu-commission)" strokeWidth={2.5} dot={false} name="Business Unit commission (actual)" connectNulls={false} />
        <Line type="monotone" dataKey="totalActual" stroke="var(--color-chart-total)" strokeWidth={2.5} dot={false} name="Total commission (actual)" connectNulls={false} />
        <Line type="monotone" dataKey="vestaForecastVestaCommission" stroke="var(--color-chart-vesta-commission)" strokeWidth={1.8} strokeDasharray="6 4" dot={false} name="Pricing Tool commission (forecast)" />
        <Line type="monotone" dataKey="vestaForecastBuCommission" stroke="var(--color-chart-bu-commission)" strokeWidth={1.8} strokeDasharray="6 4" dot={false} name="Business Unit commission (forecast)" />
        <Line type="monotone" dataKey="totalVestaForecast" stroke="var(--color-chart-total)" strokeWidth={1.8} strokeDasharray="6 4" dot={false} name="Total commission (platform forecast)" />
        <Line type="monotone" dataKey="resellerForecastVestaCommission" stroke="var(--color-chart-vesta-commission)" strokeWidth={1.8} strokeDasharray="3 3" dot={false} name="Pricing Tool commission (reseller plan)" connectNulls={false} />
        <Line type="monotone" dataKey="resellerForecastBuCommission" stroke="var(--color-chart-bu-commission)" strokeWidth={1.8} strokeDasharray="3 3" dot={false} name="Business Unit commission (reseller plan)" connectNulls={false} />
        <Line type="monotone" dataKey="totalResellerForecast" stroke="var(--color-chart-total)" strokeWidth={1.8} strokeDasharray="3 3" dot={false} name="Total commission (reseller plan)" connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function VarianceBarChart({ data, height = 260 }: { data: MonthlyPoint[]; height?: number }) {
  const chartData = data
    .filter(d => d.resellerForecast != null)
    .map(d => ({
      label: formatMonth(d.month),
      variance: (d.resellerForecast! - d.vestaForecast),
    }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={3} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v > 0 ? "+" : ""}£${v}k`} />
        <Tooltip formatter={(v: number) => `${v > 0 ? "+" : ""}£${v}k vs Platform`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Bar dataKey="variance" name="Reseller − Platform">
          {chartData.map((entry, i) => (
            <rect key={i} fill={entry.variance >= 0 ? "var(--color-chart-vesta)" : "var(--destructive)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const STACK_COLORS = [
  "#2f6bff", "#11a8a0", "#c9a23b", "#1e3a5f", "#5b8aff",
  "#e3b94a", "#0e1c2e", "#7fbfbb", "#a07ad6", "#e07a5f",
];

/** Stacked area showing per-reseller monthly contribution to a value. */
export function StackedPortfolioChart({ rows, height = 320, forecastFromMonth }: { rows: PortfolioMonthRow[]; height?: number; forecastFromMonth?: string }) {
  const ids = Object.keys(rows[0]?.perReseller ?? {});
  const data = rows.map(r => ({
    label: formatMonth(r.month),
    total: +r.total.toFixed(2),
    ...Object.fromEntries(ids.map(id => [id, +r.perReseller[id].toFixed(2)])),
  }));
  const forecastLabel = forecastFromMonth ? formatMonth(forecastFromMonth) : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={5} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v.toFixed(0)}k`} />
        <Tooltip formatter={(v: number) => fmtK(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {forecastLabel && (
          <ReferenceLine x={forecastLabel} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Forecast →", position: "top", fontSize: 11, fill: "var(--muted-foreground)" }} />
        )}
        {ids.map((id, i) => {
          const r = RESELLERS.find(x => x.id === id);
          return (
            <Area key={id} type="monotone" dataKey={id} stackId="1" stroke={STACK_COLORS[i % STACK_COLORS.length]} fill={STACK_COLORS[i % STACK_COLORS.length]} fillOpacity={0.7} name={r?.name ?? id} />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
