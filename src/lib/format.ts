export const gbp = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(n ?? 0));

export const gbpPrecise = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(n ?? 0));

export const num = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-GB").format(Number(n ?? 0));

export const pct = (n: number | null | undefined, digits = 2) =>
  `${Number(n ?? 0).toFixed(digits)}%`;

export const shortDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const money = (n: number | null | undefined, currency: string | null | undefined = "GBP") =>
  new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-GB", { style: "currency", currency: currency === "USD" ? "USD" : "GBP", maximumFractionDigits: 0 }).format(Number(n ?? 0));

export const moneyPrecise = (n: number | null | undefined, currency: string | null | undefined = "GBP") =>
  new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-GB", { style: "currency", currency: currency === "USD" ? "USD" : "GBP" }).format(Number(n ?? 0));

export const currencySymbol = (currency: string | null | undefined) => (currency === "USD" ? "$" : "£");
