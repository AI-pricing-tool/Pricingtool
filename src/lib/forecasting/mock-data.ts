// Sample actuals come from `actuals.ts` (synthetic demo data).
// Sample forecasts come from `forecasts.ts` (synthetic demo data).

import { PLATFORM_COMMISSION_SHARE, PARTNER_COMMISSION_SHARE } from "@/config/template-config";
import { ACTUALS, ACTUAL_END, ACTUAL_START, type ActualPoint } from "./actuals";
import { FORECASTS_GBP, FORECAST_END, FORECAST_START } from "./forecasts";

export type Role = "reseller" | "account_manager" | "admin";

export interface Reseller {
  id: string;
  name: string;
  sector: string;
  sizeFactor: number;
  growthYoY: number;
  amId: string;
  bps: number; // fallback effective bps (platform + partner) when no actuals exist
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  resellerId?: string;
  resellerIds?: string[];
}

/** Sentinel id for the consolidated all-resellers view (admins only). */
export const ALL_RESELLERS_ID = "__all__";
export const ALL_RESELLERS_LABEL = "All resellers";

export const RESELLERS: Reseller[] = [
  { id: "partner-retail", name: "Northwind Retail Systems", sector: "Retail & fashion", sizeFactor: 740, growthYoY: 6, amId: "am-1", bps: 95.03 },
  { id: "partner-education", name: "Lakeside Education Software", sector: "Schools & education", sizeFactor: 740, growthYoY: 11, amId: "am-1", bps: 99.24 },
  { id: "partner-restaurants", name: "Brightfork Hospitality", sector: "Restaurants & cafés", sizeFactor: 850, growthYoY: 7, amId: "am-2", bps: 96.51 },
  { id: "partner-hospitality", name: "Cobalt POS", sector: "Hospitality", sizeFactor: 740, growthYoY: 12, amId: "am-2", bps: 96.92 },
  { id: "partner-stadiums", name: "Summit Venue Tech", sector: "Stadiums & events", sizeFactor: 1380, growthYoY: 12, amId: "am-1", bps: 97.94 },
  { id: "partner-attractions", name: "Meridian Attractions", sector: "Visitor attractions", sizeFactor: 450, growthYoY: 6, amId: "am-2", bps: 93.8 },
  { id: "partner-retail-2", name: "Fairway Retail Ltd", sector: "Retail", sizeFactor: 1100, growthYoY: 11, amId: "am-1", bps: 97.14 },
  { id: "partner-pubs", name: "Oakbridge Leisure", sector: "Pubs & clubs", sizeFactor: 960, growthYoY: 10, amId: "am-2", bps: 94.43 },
  { id: "partner-colleges", name: "Harbour Campus Systems", sector: "Schools & colleges", sizeFactor: 680, growthYoY: 5, amId: "am-1", bps: 96.64 },
  { id: "partner-schools", name: "Vantage Education", sector: "Schools & education", sizeFactor: 560, growthYoY: 14, amId: "am-2", bps: 96.29 },
];

export const USERS: User[] = [
  { id: "u-1", email: "demo@partner-retail.test", name: "Sam Patel", role: "reseller", resellerId: "partner-retail" },
  { id: "u-2", email: "demo@partner-restaurants.test", name: "Jess Reed", role: "reseller", resellerId: "partner-restaurants" },
  { id: "am-1", email: "alex.morgan@example.test", name: "Alex Morgan", role: "account_manager", resellerIds: RESELLERS.filter(r => r.amId === "am-1").map(r => r.id) },
  { id: "am-2", email: "priya.shah@example.test", name: "Priya Shah", role: "account_manager", resellerIds: RESELLERS.filter(r => r.amId === "am-2").map(r => r.id) },
  { id: "admin-1", email: "admin@example.test", name: "Platform Admin", role: "admin" },
];

export const MONTHS: string[] = (() => {
  const arr: string[] = [];
  for (let y = 2025; y <= 2028; y++) {
    for (let m = 1; m <= 12; m++) arr.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return arr;
})();

// Latest month with actual data in the sample dataset.
export const CURRENT_MONTH = ACTUAL_END;
export { ACTUAL_START, ACTUAL_END };

export { FORECAST_START, FORECAST_END };

export interface MonthlyPoint {
  month: string;
  actual: number | null;
  vestaForecast: number;
  resellerForecast: number | null;
  // Combined commission (platform + business unit) — kept for back-compat.
  actualCommission: number | null;
  vestaForecastCommission: number;
  resellerForecastCommission: number | null;
  // Split streams.
  actualVestaCommission: number | null;
  actualBuCommission: number | null;
  vestaForecastVestaCommission: number;
  vestaForecastBuCommission: number;
  resellerForecastVestaCommission: number | null;
  resellerForecastBuCommission: number | null;
}

export function commissionFromValue(valueK: number | null | undefined, bps: number): number | null {
  if (valueK == null) return null;
  return Math.round((valueK * bps) / 100) / 100;
}

/** Derived effective bps for a reseller, split by platform stream and Business Unit stream. */
export function resellerBpsSplit(resellerId: string): { vestaBps: number; buBps: number; totalBps: number } {
  const r = RESELLERS.find(x => x.id === resellerId);
  const fallbackTotal = r?.bps ?? 50;
  const a = ACTUALS[resellerId];
  if (!a) return { vestaBps: fallbackTotal * PLATFORM_COMMISSION_SHARE, buBps: fallbackTotal * PARTNER_COMMISSION_SHARE, totalBps: fallbackTotal };
  let txn = 0, v = 0, b = 0;
  for (const m of Object.keys(a)) { txn += a[m].txn; v += a[m].vestaCommission; b += a[m].buCommission; }
  if (!txn) return { vestaBps: fallbackTotal * PLATFORM_COMMISSION_SHARE, buBps: fallbackTotal * PARTNER_COMMISSION_SHARE, totalBps: fallbackTotal };
  const vestaBps = (v / txn) * 10000;
  const buBps = (b / txn) * 10000;
  return { vestaBps, buBps, totalBps: vestaBps + buBps };
}

function hasActual(resellerId: string, month: string): ActualPoint | undefined {
  return ACTUALS[resellerId]?.[month];
}

export function getResellerSeries(resellerId: string, resellerOverrides?: Record<string, number>, _bpsOverride?: number): MonthlyPoint[] {
  void _bpsOverride;
  return MONTHS.map((m) => {
    const actualEntry = hasActual(resellerId, m);
    const forecastEntry = m >= FORECAST_START && m <= FORECAST_END
      ? FORECASTS_GBP[resellerId]?.[m]
      : undefined;

    const actual = actualEntry ? actualEntry.txn : null;
    const actualBuCommission = actualEntry ? actualEntry.buCommission : null;
    // Commission split rule (see src/config/template-config.ts): the platform share is always derived from the partner
    // commission as (partner / PARTNER_COMMISSION_SHARE) * PLATFORM_COMMISSION_SHARE. Partner values are the source of truth.
    const actualVestaCommission = actualBuCommission != null
      ? +((actualBuCommission / PARTNER_COMMISSION_SHARE) * PLATFORM_COMMISSION_SHARE).toFixed(4)
      : null;
    const actualCommission = actualVestaCommission != null && actualBuCommission != null
      ? +(actualVestaCommission + actualBuCommission).toFixed(4)
      : null;

    const vesta = forecastEntry ? forecastEntry.txn : 0;
    const vestaForecastBuCommission = forecastEntry ? forecastEntry.buCommission : 0;
    const vestaForecastVestaCommission = +((vestaForecastBuCommission / PARTNER_COMMISSION_SHARE) * PLATFORM_COMMISSION_SHARE).toFixed(4);

    const isFuture = m > CURRENT_MONTH;
    const override = resellerOverrides?.[m];
    const resellerForecast = isFuture
      ? (override ?? (forecastEntry ? forecastEntry.txn : null))
      : null;

    let resellerForecastVestaCommission: number | null = null;
    let resellerForecastBuCommission: number | null = null;
    if (resellerForecast != null && forecastEntry && forecastEntry.txn > 0) {
      const ratio = resellerForecast / forecastEntry.txn;
      resellerForecastBuCommission = +(forecastEntry.buCommission * ratio).toFixed(4);
      resellerForecastVestaCommission = +((resellerForecastBuCommission / PARTNER_COMMISSION_SHARE) * PLATFORM_COMMISSION_SHARE).toFixed(4);
    } else if (resellerForecast != null) {
      resellerForecastVestaCommission = 0;
      resellerForecastBuCommission = 0;
    }

    return {
      month: m,
      actual,
      vestaForecast: vesta,
      resellerForecast,
      actualCommission,
      vestaForecastCommission: +(vestaForecastVestaCommission + vestaForecastBuCommission).toFixed(4),
      resellerForecastCommission: resellerForecastVestaCommission != null && resellerForecastBuCommission != null
        ? +(resellerForecastVestaCommission + resellerForecastBuCommission).toFixed(4)
        : null,
      actualVestaCommission,
      actualBuCommission,
      vestaForecastVestaCommission,
      vestaForecastBuCommission,
      resellerForecastVestaCommission,
      resellerForecastBuCommission,
    };
  });
}

export function formatMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1000) return `£${(v / 1000).toFixed(2)}m`;
  return `£${Math.round(v)}k`;
}

export function formatCommission(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1000) return `£${(v / 1000).toFixed(2)}m`;
  if (Math.abs(v) >= 100) return `£${Math.round(v)}k`;
  return `£${v.toFixed(1)}k`;
}

export function formatBps(bps: number | null | undefined): string {
  if (bps == null || !isFinite(bps)) return "—";
  return `${bps.toFixed(1)} bps`;
}

export function formatMonth(m: string): string {
  const [y, mo] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(mo) - 1]} ${y.slice(2)}`;
}

export interface GrowthAction {
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

export const SEED_ACTIONS: GrowthAction[] = [];

export interface ForecastVersion {
  id: string;
  resellerId: string;
  createdAt: string;
  author: string;
  notes: string;
  method: "manual" | "growth_pct" | "annual_target";
  annualTotal2026: number;
}

export const SEED_VERSIONS: ForecastVersion[] = [];
