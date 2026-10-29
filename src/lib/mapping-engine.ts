import { classifyGlobalPaymentsCode } from "./global-payments-codes";

// Lightweight rules-based mapping engine.
// 1) exact dictionary match (handled at call site against mapping_dictionary)
// 2) token-based heuristic scoring against canonical categories
// 3) confidence in [0..1]

export interface CanonicalCategory {
  id: string;
  code: string;
  label: string;
  scheme?: string | null;
  funding?: string | null;
  card_category?: string | null;
  region?: string | null;
}

const SCHEME_TOKENS: Record<string, string[]> = {
  visa: ["visa", "vs", "v-uk", "v "],
  mastercard: ["mc", "mastercard", "m-uk", "mcd", "m "],
};
const FUNDING_TOKENS: Record<string, string[]> = {
  debit: ["debit", "db", "deb", "dbchip"],
  credit: ["credit", "cr", "crd", "crchip"],
};
const CATEGORY_TOKENS: Record<string, string[]> = {
  business: ["business", "comm", "commercial", "comcd", "corp", "corporate", "biz"],
  consumer: ["personal", "consumer"],
};
const REGION_TOKENS: Record<string, string[]> = {
  uk: ["uk", "domestic", "dom", "gbr"],
  eu: ["eu", "eea", "intra", "europe"],
  non_eu: ["non-eu", "non eu", "intl", "international", "inter", "world"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();

function hit(text: string, tokens: string[]): boolean {
  return tokens.some((t) => text.includes(t));
}

export interface MappingSuggestion {
  category: CanonicalCategory;
  confidence: number;
  reason: string;
}

export function suggestCategory(
  rawDescription: string,
  categories: CanonicalCategory[],
  acquirer?: string | null,
): MappingSuggestion | null {
  const product = classifyGlobalPaymentsCode(rawDescription, acquirer);
  if (product) {
    if (!product.code) return null;
    const category = categories.find((c) => c.code === product.code);
    return category ? { category, confidence: 0.95, reason: product.reason } : null;
  }
  const text = norm(rawDescription);
  if (!text) return null;

  let scheme: string | null = null;
  for (const [k, toks] of Object.entries(SCHEME_TOKENS)) if (hit(text, toks)) { scheme = k; break; }

  let funding: string | null = null;
  for (const [k, toks] of Object.entries(FUNDING_TOKENS)) if (hit(text, toks)) { funding = k; break; }

  let category: string = "consumer";
  for (const [k, toks] of Object.entries(CATEGORY_TOKENS)) if (hit(text, toks)) { category = k; break; }

  let region: string = "uk";
  for (const [k, toks] of Object.entries(REGION_TOKENS)) if (hit(text, toks)) { region = k; break; }

  const matches = categories.filter((c) =>
    (!scheme || c.scheme === scheme) &&
    (!funding || c.funding === funding) &&
    (c.card_category === category) &&
    (c.region === region)
  );

  if (matches.length === 0) return null;

  // confidence: more constraints satisfied = higher confidence
  const constraints = [scheme, funding].filter(Boolean).length;
  const base = 0.4 + constraints * 0.2 + (matches.length === 1 ? 0.15 : 0);
  const confidence = Math.min(0.95, base);

  return {
    category: matches[0],
    confidence,
    reason: `Heuristic: ${[scheme, funding, category, region].filter(Boolean).join(" / ")}`,
  };
}
