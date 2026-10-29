import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGlobalPaymentsCode } from "./global-payments-codes";
import { suggestCategory } from "./mapping-engine";

const expected: Record<string, string | null> = {
  VISA: "visa_credit_uk", VDBT: "visa_debit_uk",
  VIBS: null, VIPU: null, VIVP: null,
  VPRE: "visa_credit_uk", VPRD: "visa_debit_uk",
  VBUS: null, VCOR: null, VPPD: null,
  VDEL: "visa_debit_uk", MCCR: "mc_credit_uk", MCDB: "mc_debit_uk",
  MCBS: null, MCCN: null, MCPU: null,
};
for (const [code, category] of Object.entries(expected)) {
  test(`Global Payments ${code} respects supplied product meaning`, () => {
    assert.equal(classifyGlobalPaymentsCode(code, "Global Payments")?.code, category);
  });
}
for (const code of ["VIBS", "VIPU", "VIVP", "VBUS", "VCOR", "MCBS", "MCCN", "MCPU"]) {
  test(`${code} uses explicit funding rather than guessing`, () => {
    const prefix = code.startsWith("MC") ? "mc" : "visa";
    assert.equal(classifyGlobalPaymentsCode(`${code} Debit EEA`, "Global Payments")?.code, `${prefix}_business_debit_eu`);
    assert.equal(classifyGlobalPaymentsCode(`${code} Credit International`, "Global Payments")?.code, `${prefix}_business_credit_non_eu`);
  });
}
for (const description of ["VPPD Consumer Prepaid", "VPPD Commercial Prepaid Debit", "VIBS Credit Debit", "VPRE Commercial Credit", "VPRD Credit", "MCDB UK EEA"]) {
  test(`${description} stays unresolved`, () => assert.equal(classifyGlobalPaymentsCode(description, "Global Payments")?.code, null));
}
test("code matching is bounded and acquirer scoped", () => {
  assert.equal(classifyGlobalPaymentsCode("VDBTX", "Global Payments"), null);
  assert.equal(classifyGlobalPaymentsCode("VISA", "Worldpay"), null);
});
test("review suggestions do not guess an ambiguous code", () => {
  const categories = [{ id: "consumer-debit", code: "visa_debit_uk", label: "Visa debit", scheme: "visa", funding: "debit", card_category: "consumer", region: "uk" }];
  assert.equal(suggestCategory("VPPD Debit", categories, "Global Payments"), null);
  assert.equal(suggestCategory("VDBT", categories, "Global Payments")?.category.id, "consumer-debit");
});