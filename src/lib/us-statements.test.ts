import { test } from "node:test";
import assert from "node:assert/strict";
import { stripInterchangePlus, classifyUsCard, detectCurrency } from "./interchange-plus";

// Sample statement lines in a Heartland-style US layout. Figures are synthetic.
const heartland = [
  { raw_description: "VS CR Small Merchant PD1 Infinite SQ", extracted_fee: 196.32, section_heading: "Visa Pass-thru Interchange & Fees" },
  { raw_description: "VS DB US Regulated", extracted_fee: 0.94, section_heading: "Visa Pass-thru Interchange & Fees" },
  { raw_description: "VS Assessment Fee", extracted_fee: 17.64 },
  { raw_description: "VS FANF CNP and/or Fast Food 1 Loc", extracted_fee: 9.21 },
  { raw_description: "MC CR World Elite Merit I", extracted_fee: 103.67 },
  { raw_description: "MC NABU Fee", extracted_fee: 0.05 },
  { raw_description: "Amex - Service/Prof Service Tier 5 Fee", extracted_fee: 448.57 },
  { raw_description: "Amex OptBlue Acquirer Transaction Fee", extracted_fee: 0.14 },
  { raw_description: "VS Discount Fee", extracted_fee: 222.96, section_heading: "GP Processing Fees" },
  { raw_description: "Visa Transaction Fee", extracted_fee: 0.98, section_heading: "GP Processing Fees" },
  { raw_description: "Batch Settlement Fee", extracted_fee: 3.01 },
  { raw_description: "Monthly PCI Non-Compliance Fee - January", extracted_fee: 122.74 },
  { raw_description: "Service & Regulatory Mandate", extracted_fee: 20.56 },
];

test("US IC++ drops pass-thru lines and keeps processor margin", () => {
  const kept = stripInterchangePlus(heartland).lines.map((l) => l.raw_description);
  assert.deepEqual(kept, [
    "VS Discount Fee", "Visa Transaction Fee", "Batch Settlement Fee",
    "Monthly PCI Non-Compliance Fee - January", "Service & Regulatory Mandate",
  ]);
});

test("Visa margin kept is the discount fee plus transaction fee", () => {
  const visa = stripInterchangePlus(heartland).lines
    .filter((l) => /^(VS|Visa)\b/.test(l.raw_description))
    .reduce((s, l) => s + l.extracted_fee, 0);
  assert.equal(Math.round(visa * 100) / 100, 223.94);
});

test("US card wording maps to US categories", () => {
  assert.equal(classifyUsCard("VS DB US Regulated"), "visa_debit_us");
  assert.equal(classifyUsCard("VS CR Small Merchant PD1 Infinite SQ"), "visa_credit_us");
  assert.equal(classifyUsCard("MC CR World Elite Merit I"), "mc_credit_us");
  assert.equal(classifyUsCard("MCBS"), null);
  assert.equal(classifyUsCard("VISA Business Credit"), "visa_business_credit_us");
  assert.equal(classifyUsCard("DISC"), "discover_credit_us");
  assert.equal(classifyUsCard("American Express Discount Fee"), "amex_us");
  assert.equal(classifyUsCard("Signature (Non-PIN) Debit", "visa"), "visa_debit_us");
});

test("currency detection", () => {
  assert.equal(detectCurrency("USD"), "USD");
  assert.equal(detectCurrency(null, "Total Deposits $42,718.59"), "USD");
  assert.equal(detectCurrency(null, "£1,000"), "GBP");
});

test("Heartland is USD even when the extractor omits currency", () => {
  assert.equal(detectCurrency(null, "Heartland Passport Statement - sample.pdf \n VS DB US Regulated"), "USD");
  assert.equal(detectCurrency(null, "Worldpay statement \n Visa Debit"), "GBP");
});

test("brand-level Heartland discount lines map to US consumer credit", () => {
  assert.equal(classifyUsCard("VS Discount Fee"), "visa_credit_us");
  assert.equal(classifyUsCard("MC Discount Fee"), "mc_credit_us");
  assert.equal(classifyUsCard("Visa Transaction Fee"), null);
});

test("'Monthly vs Daily Discount Cost' is a fee, not a Visa card row", () => {
  assert.equal(classifyUsCard("Monthly vs Daily Discount Cost"), null);
});

// Sample saved lines (fees kept after pass-thru removal). Figures are synthetic.
const saved = [
  { d: "American Express Discount Fee", v: 24803.35, f: 396.86 },
  { d: "American Express Transaction Fee", v: 0.0, f: 1.35 },
  { d: "Batch Settlement Fee", v: 0.0, f: 3.01 },
  { d: "MC Discount Fee", v: 3980.03, f: 63.68 },
  { d: "MC Transaction Fee", v: 0.0, f: 0.49 },
  { d: "Monthly PCI Non-Compliance Fee - January", v: 0.0, f: 122.74 },
  { d: "Service & Regulatory Mandate", v: 0.0, f: 20.56 },
  { d: "Visa Transaction Fee", v: 0.0, f: 0.98 },
  { d: "VS Discount Fee", v: 13935.21, f: 222.96 },
  { d: "Customer Intelligence Suite", v: 0.0, f: 36.79 },
];

test("card turnover sums to the printed $42,718.59", () => {
  const turnover = saved.filter((l) => l.v > 0 && classifyUsCard(l.d)).reduce((s, l) => s + l.v, 0);
  assert.equal(Math.round(turnover * 100) / 100, 42718.59);
});

test("excluded pass-thru is $1,119.80", () => {
  const kept = saved.reduce((s, l) => s + l.f, 0) + 4.28; // + Monthly vs Daily Discount Cost
  assert.equal(Math.round((1993.5 - kept) * 100) / 100, 1119.8);
});
