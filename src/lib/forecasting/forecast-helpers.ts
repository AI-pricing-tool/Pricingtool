import type { MonthlyPoint } from "./mock-data";
import { CURRENT_MONTH, MONTHS, RESELLERS, getResellerSeries } from "./mock-data";

type NumericKey =
  | "actual"
  | "vestaForecast"
  | "resellerForecast"
  | "actualCommission"
  | "vestaForecastCommission"
  | "resellerForecastCommission"
  | "actualVestaCommission"
  | "actualBuCommission"
  | "vestaForecastVestaCommission"
  | "vestaForecastBuCommission"
  | "resellerForecastVestaCommission"
  | "resellerForecastBuCommission";

export function yearTotal(points: MonthlyPoint[], year: number, key: NumericKey) {
  return points
    .filter(p => p.month.startsWith(String(year)))
    .reduce((acc, p) => acc + ((p[key] as number | null) ?? 0), 0);
}

export function rolling12(points: MonthlyPoint[], endMonth = CURRENT_MONTH, key: NumericKey = "actual") {
  const idx = points.findIndex(p => p.month === endMonth);
  if (idx < 11) return 0;
  return points.slice(idx - 11, idx + 1).reduce((a, p) => a + ((p[key] as number | null) ?? 0), 0);
}

export function latestActual(points: MonthlyPoint[]) {
  return points.find(p => p.month === CURRENT_MONTH);
}

export function yoyGrowth(points: MonthlyPoint[]) {
  const cur = points.find(p => p.month === CURRENT_MONTH);
  const [y, m] = CURRENT_MONTH.split("-");
  const prev = points.find(p => p.month === `${parseInt(y) - 1}-${m}`);
  if (!cur?.actual || !prev?.actual) return 0;
  return ((cur.actual - prev.actual) / prev.actual) * 100;
}

export function ytd(points: MonthlyPoint[], key: NumericKey = "actual") {
  const y = CURRENT_MONTH.slice(0, 4);
  return points
    .filter(p => p.month.startsWith(y) && p.month <= CURRENT_MONTH)
    .reduce((a, p) => a + ((p[key] as number | null) ?? 0), 0);
}

export function effectiveBps(points: MonthlyPoint[], endMonth = CURRENT_MONTH): number {
  const turnover = rolling12(points, endMonth, "actual");
  const commission = rolling12(points, endMonth, "actualCommission");
  if (!turnover) return 0;
  return (commission / turnover) * 10000;
}

export function statusVsForecast(actual: number | null, target: number | null) {
  if (actual == null || target == null) return { label: "—", tone: "muted" as const };
  const ratio = actual / target;
  if (ratio >= 1.02) return { label: "Ahead", tone: "success" as const };
  if (ratio >= 0.97) return { label: "On track", tone: "info" as const };
  return { label: "Behind", tone: "destructive" as const };
}

/** Portfolio monthly roll-up across the given resellers for one numeric key. */
export interface PortfolioMonthRow {
  month: string;
  total: number;
  perReseller: Record<string, number>;
}

export function portfolioMonthly(
  resellerIds: string[],
  key: NumericKey,
  overrides?: Record<string, Record<string, number>>,
): PortfolioMonthRow[] {
  const seriesById: Record<string, MonthlyPoint[]> = {};
  resellerIds.forEach(id => { seriesById[id] = getResellerSeries(id, overrides?.[id]); });
  return MONTHS.map(month => {
    const perReseller: Record<string, number> = {};
    let total = 0;
    resellerIds.forEach(id => {
      const p = seriesById[id].find(x => x.month === month);
      const v = ((p?.[key] as number | null) ?? 0) || 0;
      perReseller[id] = v;
      total += v;
    });
    return { month, total, perReseller };
  });
}

/** Combined monthly roll-up: actuals where available, forecast for future months. */
export function portfolioMonthlyCombined(
  resellerIds: string[],
  actualKey: NumericKey,
  forecastKey: NumericKey,
  overrides?: Record<string, Record<string, number>>,
): PortfolioMonthRow[] {
  const seriesById: Record<string, MonthlyPoint[]> = {};
  resellerIds.forEach(id => { seriesById[id] = getResellerSeries(id, overrides?.[id]); });
  return MONTHS.map(month => {
    const perReseller: Record<string, number> = {};
    let total = 0;
    resellerIds.forEach(id => {
      const p = seriesById[id].find(x => x.month === month);
      const a = (p?.[actualKey] as number | null) ?? null;
      const f = (p?.[forecastKey] as number | null) ?? null;
      const v = (a != null ? a : (f ?? 0)) || 0;
      perReseller[id] = v;
      total += v;
    });
    return { month, total, perReseller };
  });
}

export function portfolioYearTotal(resellerIds: string[], year: number, key: NumericKey, overrides?: Record<string, Record<string, number>>): number {
  return resellerIds.reduce((acc, id) => acc + yearTotal(getResellerSeries(id, overrides?.[id]), year, key), 0);
}

export function portfolioRolling12(resellerIds: string[], key: NumericKey = "actualVestaCommission", overrides?: Record<string, Record<string, number>>): number {
  return resellerIds.reduce((acc, id) => acc + rolling12(getResellerSeries(id, overrides?.[id]), CURRENT_MONTH, key), 0);
}

export function allResellerIds(): string[] {
  return RESELLERS.map(r => r.id);
}

const NULLABLE_KEYS: NumericKey[] = [
  "actual",
  "resellerForecast",
  "actualCommission",
  "resellerForecastCommission",
  "actualVestaCommission",
  "actualBuCommission",
  "resellerForecastVestaCommission",
  "resellerForecastBuCommission",
];
const REQUIRED_KEYS: NumericKey[] = [
  "vestaForecast",
  "vestaForecastCommission",
  "vestaForecastVestaCommission",
  "vestaForecastBuCommission",
];

/**
 * Sum every reseller's series into a single portfolio-wide series so the
 * existing charts/KPIs can render a consolidated "All resellers" view.
 * Nullable keys stay null for months where no reseller has a value.
 */
export function aggregateSeries(
  resellerIds: string[],
  overrides?: Record<string, Record<string, number>>,
): MonthlyPoint[] {
  const seriesById = resellerIds.map(id => getResellerSeries(id, overrides?.[id]));
  return MONTHS.map((month, i) => {
    const point: Record<string, number | null | string> = { month };
    for (const k of REQUIRED_KEYS) {
      point[k] = seriesById.reduce((a, s) => a + ((s[i]?.[k] as number | null) ?? 0), 0);
    }
    for (const k of NULLABLE_KEYS) {
      let sum = 0;
      let any = false;
      for (const s of seriesById) {
        const v = s[i]?.[k] as number | null | undefined;
        if (v != null) { sum += v; any = true; }
      }
      point[k] = any ? +sum.toFixed(3) : null;
    }
    return point as unknown as MonthlyPoint;
  });
}
