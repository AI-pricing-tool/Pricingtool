// Interchange++ statements itemise pass-through interchange and scheme fees
// separately from the acquirer's margin. Those pass-through costs are broadly
// identical across acquirers, so we drop them and keep margin + other fees.

type LineLike = { raw_description?: unknown; fee_category_hint?: unknown; section_heading?: unknown };

// Card-network fees printed as their own lines (Visa/Mastercard/Discover assessments, access and
// integrity fees...). Pass-through costs the processor does not mark up, so they are not margin.
const NETWORK_FEE_DESC = [
  /\bassessments?\b/i,
  /\bassess\s+(vs|mc|ds)\b/i, // "ASSESS VS" in Global Payments' statement guide
  /\bnetwork\s+access\s+fee\b/i,
  /\bdebit\s+integrity\s+fee\b/i,
  /\b(intl|int'l|international)\s+(acquiring\s+fee|service\s+assessment)\b/i,
  /\bacquirer\s+(pgm|program)\s+support\s+fee\b/i,
  /\bcross[-\s]?border\s+fee\b/i,
  /\bacceptance\s+licen[sc]e\s+fee\b/i,
  /\bAPF\s+fee\b/i,
];

const PASS_THROUGH_DESC = [
  ...NETWORK_FEE_DESC,
  /\binterchange\b/i,
  /\bscheme\s*fees?\b/i,
  /\d\.\d+%\s*&\s*\d?\.\d+/, // e.g. "VISA CP UK DR 0.0324%&0.0323"
  // US card-network pass-through fees (Heartland / Global Payments US etc.)
  /\bassessment\s*fee\b/i,
  /\bFANF\b/i,
  /\bNABU\b/i,
  /\bissuer\s+settlement\b/i,
  /\bnetwork\s+acquiring\s+processing\b/i,
  /\bdigital\s+(commerce\s+service|enablement)\s+fee\b/i,
  /\bfinancial\s+transaction\s+fee\b/i,
  /\bMC\s+(license|merchant\s+location|AVS|pre-?authorization)\s+fee\b/i,
  /\bOptBlue\s+acquirer\b/i,
  /^amex\s*-\s*.*\btier\s*\d/i,
  /^american\s+express\s*-\s*(assessment|CNP)\b/i,
  /\bUS\s+regulated\b/i,
  /\bsmall\s+merchant\b/i,
  /\bmerit\s*(i{1,3}|[123])\b/i,
  /\bCPS\b/,
  /\bEIRF\b/,
];

const PASS_THROUGH_SECTION = /pass[-\s]?thr(u|ough)|interchange/i;

export function isPassThroughLine(l: LineLike): boolean {
  const hint = typeof l.fee_category_hint === "string" ? l.fee_category_hint : "";
  if (hint === "interchange" || hint === "scheme") return true;
  const section = typeof l.section_heading === "string" ? l.section_heading : "";
  if (section && PASS_THROUGH_SECTION.test(section)) return true;
  const desc = typeof l.raw_description === "string" ? l.raw_description : "";
  return PASS_THROUGH_DESC.some((re) => re.test(desc));
}

/** Removes interchange/scheme lines only when the statement also has margin/other lines. */
export function stripInterchangePlus<T extends LineLike>(lines: T[]): { lines: T[]; removed: number } {
  const kept = lines.filter((l) => !isPassThroughLine(l));
  if (kept.length === 0 || kept.length === lines.length) return { lines, removed: 0 };
  return { lines: kept, removed: lines.length - kept.length };
}

/** Detects a US-dollar statement from extractor output or address/currency text. */
export function detectCurrency(hint: unknown, sampleText = ""): "USD" | "GBP" {
  const h = typeof hint === "string" ? hint.toUpperCase() : "";
  if (h === "USD" || h === "$") return "USD";
  if (h === "GBP" || h === "£") return "GBP";
  if (/£/.test(sampleText)) return "GBP";
  if (/\$\s?\d/.test(sampleText)) return "USD";
  // US-only wording (Durbin-regulated debit, card-network fees, US processors)
  return /\b(US\s+regulated|FANF|NABU|OptBlue|heartland|EPX|TSYS|durbin)\b/i.test(sampleText) ? "USD" : "GBP";
}

/**
 * Bare product codes printed as the whole description on US statements (the Settlement/Discount
 * table of Global Payments / EVO-style statements). Global Payments' statement guide fixes the
 * meaning of five of them: VISA = Visa consumer, VDBT = Visa check (debit), MC = Mastercard
 * consumer, MDBT = Mastercard check (debit), DISC = Discover.
 *
 * The others are real codes whose meaning the repo does not establish (business or commercial
 * funding, prepaid, T&E, premium, ...). They map to null on purpose: ambiguous lines stay unmapped
 * for human review rather than being guessed, as in the UK path (classifyGlobalPaymentsCode).
 */
export const US_PRODUCT_CODES: Record<string, string | null> = {
  VISA: "visa_credit_us",
  VDBT: "visa_debit_us",
  MC: "mc_credit_us",
  MDBT: "mc_debit_us",
  DISC: "discover_credit_us",
  VIBS: null, MCBS: null, VIBE: null, VISB: null, VISP: null, VIPP: null,
  MCPP: null, MCHV: null, MCWC: null, MWEL: null, MCEC: null,
  DSPP: null, DSBS: null, DSPM: null,
};

/** Fee lines that name a brand and carry volume but are not card-rate lines. */
const isNonCardFeeLine = (desc: string) =>
  NETWORK_FEE_DESC.some((re) => re.test(desc)) || /\bauthori[sz]ation\b/i.test(desc);

/**
 * US card-type classifier for USD statements. Returns a canonical code
 * (e.g. "visa_debit_us", "discover_credit_us", "amex_business_us") or null.
 */
export function classifyUsCard(desc: string, schemeHint: string | null = null): string | null {
  // Exact, upper-case match only: a lower-case "visa" is the scheme summary row the extractor emits.
  const bare = desc.trim();
  if (Object.hasOwn(US_PRODUCT_CODES, bare)) return US_PRODUCT_CODES[bare];
  if (isNonCardFeeLine(desc)) return null;

  const s = desc.toLowerCase();
  const h = (schemeHint ?? "").toLowerCase();
  let scheme: "visa" | "mc" | "discover" | "amex" | null = null;
  // "VS"/"VI" abbreviate Visa only at the start of a label or after punctuation —
  // never in prose like "Monthly vs Daily Discount Cost".
  if (h === "visa" || /\bvisa\b/.test(s) || /(^|[-\/(,:;|])\s*(vs|vi)\b/.test(s)) scheme = "visa";
  else if (h === "mastercard" || /\b(mastercard|master\s*card|mc)\b/.test(s)) scheme = "mc";
  else if (h === "discover" || /\b(discover|disc|ds)\b/.test(s)) scheme = "discover";
  else if (h === "amex" || /\b(amex|american\s+express|ax)\b/.test(s)) scheme = "amex";
  if (!scheme) return null;

  const business = /\b(business|bus|commercial|corporate|corp|purchasing|fleet|b2b)\b/.test(s);
  if (scheme === "amex") return business ? "amex_business_us" : "amex_us";
  if (scheme === "discover") {
    if (business) return "discover_commercial_us";
    return /\b(debit|db|dbt)\b/.test(s) ? "discover_debit_us" : "discover_credit_us";
  }
  const debit = /\b(debit|db|dbt|regulated|durbin|check\s*card)\b/.test(s);
  const credit = /\b(credit|cr|infinite|signature|sign\s+pref|world(\s+elite)?|rewards|traditional)\b/.test(s);
  // Brand-level processor margin lines (e.g. Heartland "VS Discount Fee") carry no funding;
  // most US card sales are credit, so default those to consumer credit for review.
  const funding = debit ? "debit" : credit || business || /\bdiscount\b/.test(s) ? "credit" : null;
  if (!funding) return null;
  return business ? `${scheme}_business_${funding}_us` : `${scheme}_${funding}_us`;
}
