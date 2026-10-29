type Funding = "credit" | "debit";
type CardCategory = "consumer" | "business";

// Funding is null where the supplied reporting code does not distinguish it.
export const GLOBAL_PAYMENTS_CODES: Record<string, { scheme: "visa" | "mastercard"; funding: Funding | null; category: CardCategory | null; prepaid?: boolean; description: string }> = {
  VISA: { scheme: "visa", funding: "credit", category: "consumer", description: "Standard consumer credit (traditional)" },
  VDBT: { scheme: "visa", funding: "debit", category: "consumer", description: "Standard consumer debit" },
  VIBS: { scheme: "visa", funding: null, category: "business", description: "Visa business (SME credit or debit)" },
  VIPU: { scheme: "visa", funding: null, category: "business", description: "Visa purchasing (commercial procurement/GSA)" },
  VIVP: { scheme: "visa", funding: null, category: "business", description: "Visa commercial/premium/signature corporate variants" },
  VPRE: { scheme: "visa", funding: "credit", category: "consumer", description: "Visa premium consumer credit (Signature/Infinite)" },
  VPRD: { scheme: "visa", funding: "debit", category: "consumer", description: "Visa premium consumer debit" },
  VBUS: { scheme: "visa", funding: null, category: "business", description: "Visa business alternate code" },
  VCOR: { scheme: "visa", funding: null, category: "business", description: "Visa corporate T&E" },
  VPPD: { scheme: "visa", funding: null, category: null, prepaid: true, description: "Visa prepaid: consumer OR commercial; supporting context required" },
  VDEL: { scheme: "visa", funding: "debit", category: "consumer", description: "Visa deferred debit/Electron" },
  MCCR: { scheme: "mastercard", funding: "credit", category: "consumer", description: "Mastercard standard consumer credit" },
  MCDB: { scheme: "mastercard", funding: "debit", category: "consumer", description: "Mastercard consumer debit" },
  MCBS: { scheme: "mastercard", funding: null, category: "business", description: "Mastercard business (SME credit or debit)" },
  MCCN: { scheme: "mastercard", funding: null, category: "business", description: "Mastercard corporate enterprise/T&E" },
  MCPU: { scheme: "mastercard", funding: null, category: "business", description: "Mastercard purchasing" },
};

export const GLOBAL_PAYMENTS_CODE_GUIDANCE = Object.entries(GLOBAL_PAYMENTS_CODES)
  .map(([code, rule]) => `${code}: ${rule.description}`).join("; ");

/** null means not a GP code; {code:null} means recognised but requires review. */
export function classifyGlobalPaymentsCode(description: string, acquirer?: string | null): { code: string | null; reason: string } | null {
  if (!/global[\s_-]*payments?/i.test(acquirer ?? "")) return null;
  const tokens = description.toUpperCase().match(/\b[A-Z0-9]+\b/g) ?? [];
  const codes = [...new Set(tokens.filter((token) => Object.hasOwn(GLOBAL_PAYMENTS_CODES, token)))];
  if (!codes.length) return null;
  const review = (reason: string) => ({ code: null, reason });
  if (codes.length !== 1) return review("Multiple card product codes");
  const rule = GLOBAL_PAYMENTS_CODES[codes[0]];
  if (!rule) return null;
  // Existing buy-rate taxonomy has no prepaid category; never silently use debit.
  if (rule.prepaid) return review("Prepaid product requires manual mapping; VPPD is also consumer/commercial ambiguous");
  const credit = /\b(credit|cr|crd)\b/i.test(description);
  const debit = /\b(debit|db|dbt|dr)\b/i.test(description);
  if (credit && debit) return review("Credit/debit ambiguous");
  const explicitFunding: Funding | null = credit ? "credit" : debit ? "debit" : null;
  if (explicitFunding && rule.funding && explicitFunding !== rule.funding) return review("Funding conflicts with product code");
  const funding = rule.funding ?? explicitFunding;
  if (!funding) return review("Product code requires credit/debit context");
  const commercial = /\b(business|commercial|corporate|purchasing)\b/i.test(description);
  const consumer = /\b(consumer|personal|per)\b/i.test(description);
  if ((commercial && rule.category === "consumer") || (consumer && rule.category === "business")) return review("Card category conflicts with product code");
  // Preserve the existing UK statement default, but respect explicit foreign regions.
  const nonEu = /non[-\s]?eu|inter[-\s]?regional|\b(international|intl|canada|canadian|usa|us)\b/i.test(description);
  const eu = /\b(eu|eea|europe|european)\b|intra[-\s]?regional/i.test(description.replace(/non[-\s]?eu/ig, ""));
  const uk = /\b(uk|gbr|domestic)\b/i.test(description);
  if ([nonEu, eu, uk].filter(Boolean).length > 1) return review("Conflicting regions");
  const region = nonEu ? "non_eu" : eu ? "eu" : "uk";
  const prefix = rule.scheme === "visa" ? "visa" : "mc";
  return { code: `${prefix}_${rule.category === "business" ? "business_" : ""}${funding}_${region}`, reason: `Global Payments ${codes[0]}` };
}