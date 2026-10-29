import { test } from "node:test";
import assert from "node:assert/strict";
import { stripInterchangePlus, classifyUsCard, US_PRODUCT_CODES } from "./interchange-plus";

// Lines are typed from a Global Payments / EVO-style US "Payment Processing Statement" (figures are
// from a public sample document). They stand in for what the extractor returns; the assertions
// exercise the app's own rules.
const row = (raw_description: string, txn_value: number | null, fee: number, hint: string | null, section: string) =>
  ({ raw_description, txn_value, extracted_fee: fee, scheme_hint: hint, section_heading: section });
const SD = "SETTLEMENT/DISCOUNT";

const margin = [
  row("DISC", 3489, 146.31, "discover", SD), row("DSPP", 219, 9.51, "discover", SD), row("DSBS", 1971, 82.59, "discover", SD),
  row("VISA", 19575, 819, "visa", SD), row("VDBT", 23583.5, 1004.84, "visa", SD), row("VIBS", 1446, 62.34, "visa", SD), row("VISP", 2042, 85.43, "visa", SD),
  row("MC", 7122, 300.63, "mastercard", SD), row("MDBT", 8090, 343.1, "mastercard", SD), row("MCWC", 3617.75, 152.21, "mastercard", SD),
];
const network = [
  row("DISCOVER NETWORK ACCESS FEE", 6078, 0.31, "discover", SD), row("VISA NETWORK ACCESS FEE", 48092.5, 0.44, "visa", SD),
  row("VISA DEBIT INTEGRITY FEE", 799, 0.1, "visa", SD), row("DISCOVER ASSESSMENTS", 6078, 6.69, "discover", SD),
  row("VISA ASSESSMENTS-DEBIT", 24880.5, 32.34, "visa", SD), row("VISA ASSESSMENTS", 23212, 30.18, "visa", SD),
  row("VISA INTL SERVICE ASSESSMENT", 3105, 40.37, "visa", SD), row("VISA INTL ACQUIRING FEE", 3105, 29.5, "visa", SD),
  row("MASTERCARD ASSESSMENTS", 24363.75, 29.24, "mastercard", SD), row("CROSS BORDER FEE", 1223, 13.45, "mastercard", SD),
  row("MC ACQUIRER PGM SUPPORT FEE", 1223, 12.84, "mastercard", SD), row("ACCEPTANCE LICENSE FEE", 24363.75, 12.18, "mastercard", SD),
];
const interchange = [
  row("VDBT CNP 1.65% + $0.15", 9828, 167.41, "visa", "INTERCHANGE"),
  row("MC MERIT I (CNP) 1.89% + $0.10", 5899, 113.29, "mastercard", "INTERCHANGE"),
];
const otherFees = [
  row("AMEX PER ITEM", null, 5.63, null, "OTHER FEES"), row("MONTHLY SERVICE FEE", null, 10, null, "OTHER FEES"),
  row("PCI-DSS Regulations Update", null, 10, null, "OTHER FEES"), row("MC NABU", null, 25.88, null, "OTHER FEES"),
];

test("bare product codes with a fixed meaning map to US categories", () => {
  assert.equal(classifyUsCard("VISA", "visa"), "visa_credit_us");
  assert.equal(classifyUsCard("VDBT", "visa"), "visa_debit_us");
  assert.equal(classifyUsCard("MC", "mastercard"), "mc_credit_us");
  assert.equal(classifyUsCard("MDBT", "mastercard"), "mc_debit_us");
  assert.equal(classifyUsCard("DISC", "discover"), "discover_credit_us");
});

test("bare codes whose meaning is ambiguous stay unmapped, even with a scheme hint", () => {
  const review = ["VIBS", "MCBS", "VIBE", "VISB", "VISP", "VIPP", "MCPP", "MCHV", "MCWC", "MWEL", "MCEC", "DSPP", "DSBS", "DSPM"];
  for (const code of review) {
    assert.ok(Object.hasOwn(US_PRODUCT_CODES, code), `${code} should be a known code`);
    for (const hint of [null, "visa", "mastercard", "discover"]) {
      assert.equal(classifyUsCard(code, hint), null, `${code} with hint ${hint}`);
    }
  }
});

test("lower-case scheme summary rows are not treated as product codes", () => {
  assert.equal(classifyUsCard("visa", "visa"), null);
  assert.equal(classifyUsCard("mastercard", "mastercard"), null);
});

test("network and authorisation fee lines are never card-rate lines", () => {
  for (const [desc, hint] of [
    ["VISA ASSESSMENTS-DEBIT", "visa"], ["VISA DEBIT INTEGRITY FEE", "visa"], ["DISCOVER ASSESSMENTS", "discover"],
    ["DISCOVER NETWORK ACCESS FEE", "discover"], ["Visa APF Fee - Credit", "visa"], ["AMX Electronic Authorization", "amex"],
    ["Visa Electronic Authorization", "visa"], ["MASTERCARD ASSESSMENTS", "mastercard"],
  ] as const) {
    assert.equal(classifyUsCard(desc, hint), null, desc);
  }
});

test("existing US wording still maps (guard does not catch processor margin lines)", () => {
  assert.equal(classifyUsCard("VS Discount Fee"), "visa_credit_us");
  assert.equal(classifyUsCard("American Express Discount Fee"), "amex_us");
  assert.equal(classifyUsCard("VISA Business Credit"), "visa_business_credit_us");
});

test("network and assessment lines are stripped as pass-through when margin lines exist", () => {
  const kept = stripInterchangePlus([...margin, ...network, ...otherFees]).lines.map((l) => l.raw_description);
  for (const l of network) assert.ok(!kept.includes(l.raw_description), `${l.raw_description} should be removed`);
  assert.ok(kept.includes("VISA") && kept.includes("MDBT") && kept.includes("MONTHLY SERVICE FEE"));
});

test("interchange lines labelled with their section are stripped", () => {
  const kept = stripInterchangePlus([...margin, ...interchange]).lines.map((l) => l.raw_description);
  assert.ok(!kept.some((d) => /CNP/.test(d)));
});

test("sample statement: mapped card volume never exceeds the real card sales", () => {
  const lines = stripInterchangePlus([...margin, ...network, ...interchange, ...otherFees]).lines;
  const mapped: Record<string, number> = {};
  for (const l of lines) {
    const code = classifyUsCard(l.raw_description, l.scheme_hint);
    if (code && Number(l.txn_value) > 0) mapped[code.split("_")[0]] = (mapped[code.split("_")[0]] ?? 0) + Number(l.txn_value);
  }
  // Statement card summary: Visa 47,638.50 / Mastercard 23,964.75 / Discover 5,579.00.
  assert.equal(mapped.visa, 19575 + 23583.5);
  assert.equal(mapped.mc, 7122 + 8090);
  assert.equal(mapped.discover, 3489);
  assert.ok(mapped.visa <= 47638.5 && mapped.mc <= 23964.75 && mapped.discover <= 5579);
});
