import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classifyUsCard, US_PRODUCT_CODES } from "./interchange-plus";
import { classifyGlobalPaymentsCode, GLOBAL_PAYMENTS_CODES } from "./global-payments-codes";

// Guards the Supabase migrations that make the app usable on a fresh database: the card taxonomy must
// contain every code the classifiers can produce, and no migration may carry a personal account id.
const dir = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const read = (name: string) => readFileSync(dir + name, "utf8");

const seedFile = files.find((f) => f.includes("seed_canonical_categories"))!;
const seedSql = read(seedFile);
const rows = [...seedSql.matchAll(/^\s*\('([a-z_]+)',\s*'[^']+',\s*'([a-z]+)',\s*'[a-z]+',\s*'[a-z]+',\s*'([a-z_]+)',\s*(\d+)\)/gm)]
  .map((m) => ({ code: m[1], scheme: m[2], region: m[3], sort: Number(m[4]) }));
const seeded = new Set(rows.map((r) => r.code));

test("the card taxonomy seed exists and has the expected rows", () => {
  assert.ok(seedFile, "seed migration present");
  assert.equal(rows.length, 37);
  assert.equal(seeded.size, 37, "codes are unique");
  assert.equal(rows.filter((r) => r.region === "us").length, 13);
});

test("every US code the classifier can produce is seeded", () => {
  const produced = new Set<string>();
  for (const code of Object.values(US_PRODUCT_CODES)) if (code) produced.add(code);
  for (const brand of ["Visa", "MC", "Discover", "Amex"]) {
    for (const kind of ["", "Credit", "Debit", "Business", "Business Credit", "Business Debit", "Commercial", "Corporate"]) {
      for (const hint of [null, brand.toLowerCase()]) {
        const code = classifyUsCard(`${brand} ${kind} Discount Fee`.replace(/\s+/g, " "), hint);
        if (code) produced.add(code);
      }
    }
  }
  assert.ok(produced.size >= 10, `exercised ${produced.size} codes`);
  for (const code of produced) assert.ok(seeded.has(code), `${code} is produced by classifyUsCard but not seeded`);
});

test("every UK/EU code the Global Payments classifier can produce is seeded", () => {
  const produced = new Set<string>();
  for (const product of Object.keys(GLOBAL_PAYMENTS_CODES)) {
    for (const funding of ["", "credit", "debit"]) {
      for (const region of ["", "UK", "EEA", "intra-regional", "non-EU", "inter-regional"]) {
        const r = classifyGlobalPaymentsCode(`${product} ${funding} ${region}`, "Global Payments");
        if (r?.code) produced.add(r.code);
      }
    }
  }
  assert.ok(produced.size >= 10, `exercised ${produced.size} codes`);
  for (const code of produced) assert.ok(seeded.has(code), `${code} is produced but not seeded`);
});

test("every category the dictionary seeds point at exists in the taxonomy", () => {
  const dictionary = read(files.find((f) => f.includes("974fae24"))!);
  const referenced = [...dictionary.matchAll(/\('[^']+','[^']*','([a-z_]+_(?:uk|eu|non_eu|us))'\)/g)].map((m) => m[1]);
  assert.ok(referenced.length >= 25);
  for (const code of referenced) assert.ok(seeded.has(code), `${code} is referenced by the dictionary seed`);
  // The seed migration re-applies the card mappings because the original ran before any category existed.
  assert.ok(seedSql.includes("INSERT INTO public.mapping_dictionary"));
});

test("the scheme-only fallback (lowest sort_order per scheme) is UK consumer credit", () => {
  const first = (scheme: string) => rows.filter((r) => r.scheme === scheme).sort((a, b) => a.sort - b.sort)[0].code;
  assert.equal(first("visa"), "visa_credit_uk");
  assert.equal(first("mastercard"), "mc_credit_uk");
});

test("enum values and the currency column the code needs are added by a Supabase migration", () => {
  const sql = files.map(read).join("\n");
  assert.match(sql, /ALTER TYPE public\.region_code ADD VALUE IF NOT EXISTS 'us'/);
  assert.match(sql, /ALTER TYPE public\.card_scheme ADD VALUE IF NOT EXISTS 'discover'/);
  assert.match(sql, /ALTER TABLE public\.statements ADD COLUMN IF NOT EXISTS currency/);
});

test("no migration hard-codes a user id, organisation id or email address", () => {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
  for (const f of files) {
    const sql = read(f);
    assert.doesNotMatch(sql, uuid, `${f} contains a UUID literal`);
    assert.doesNotMatch(sql, email, `${f} contains an email address`);
  }
});
