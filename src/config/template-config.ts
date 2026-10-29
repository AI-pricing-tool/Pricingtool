/**
 * TEMPLATE CONFIGURATION — REVIEW EVERY VALUE BEFORE USE
 *
 * These are the commercial assumptions baked into this template. The sample
 * values below are arbitrary placeholders, not advice and not benchmarks.
 * Your own arrangements will differ. Change them before you rely on any
 * figure this application produces.
 */

/**
 * How the total commission on a deal is split between the platform operator
 * and the partner (reseller / business unit) who brought the merchant.
 *
 * The 20/80 below is an arbitrary example. Replace both numbers with your own
 * arrangement; they must add up to 1.
 *
 * The forecasting module stores only the PARTNER's commission and derives the
 * platform's share from it:
 *
 *   platformCommission = (partnerCommission / PARTNER_COMMISSION_SHARE)
 *                        * PLATFORM_COMMISSION_SHARE
 *
 * If your split is not the one below, every platform commission figure in the
 * forecasting screens will be wrong, and nothing will warn you.
 */
export const PLATFORM_COMMISSION_SHARE = 0.2;
export const PARTNER_COMMISSION_SHARE = 0.8;

/**
 * Margin target in basis points, and the thresholds used to colour the BPS
 * indicator on the analysis screen. The numbers below are arbitrary examples,
 * not industry norms. Entirely a commercial choice — set your own.
 */
export const BPS_TARGET = 50;
export const BPS_GREEN_FROM = 60; // >= this shows green
export const BPS_AMBER_FROM = 35; // >= this shows amber, below shows red

/**
 * NOT YET WIRED into the proposal generator — see the README. The analysis
 * screen and the generator currently use different defaults.
 *
 * Default per-transaction sell price in minor units (pence / cents) used when
 * no explicit price has been set on a line.
 *
 * NOTE: the analysis screen and the proposal generator currently use different
 * defaults, which can make a proposal disagree with the page it came from.
 * Pick one value and apply it in both places.
 */
export const DEFAULT_SELL_PER_ITEM_MINOR_UNITS = 0;

/**
 * Monthly seasonality weights (Jan..Dec) used when distributing an annual
 * target across months in the forecast builder. Flat by default — replace with
 * your own sector's shape if you have one.
 */
export const SEASONAL_WEIGHTS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/**
 * Default year-on-year growth assumption offered in the forecast builder, as a
 * percentage.
 */
export const DEFAULT_GROWTH_PCT = 5;

/**
 * Documentation only — nothing reads this constant. It records the unit
 * convention so you don't have to infer it from the data.
 *
 * Units. All forecasting turnover and commission figures are in THOUSANDS of
 * the base currency: a stored value of 1000 means 1,000,000. Keep your own
 * data in the same units or every chart will be out by a factor of 1000.
 */
export const FORECAST_VALUE_UNIT = "thousands" as const;
