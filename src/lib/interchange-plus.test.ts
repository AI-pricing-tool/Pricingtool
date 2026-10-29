import { test } from "node:test";
import assert from "node:assert/strict";
import { stripInterchangePlus } from "./interchange-plus";

const lines = [
  { raw_description: "VDBT", fee_category_hint: null },
  { raw_description: "PCI NON COMPLIANCE", fee_category_hint: "pci_fee" },
  { raw_description: "UK BASE24", fee_category_hint: "auth_fee" },
  { raw_description: "VI UK COMMERCIAL DEBIT", fee_category_hint: "interchange" },
  { raw_description: "VISA CP UK DR 0.0324%&0.0323", fee_category_hint: null },
  { raw_description: "MC SCHEME FEE UK 0.0466%&0.0307", fee_category_hint: null },
];

test("IC++ drops interchange and scheme lines, keeps margin and other fees", () => {
  const r = stripInterchangePlus(lines);
  assert.equal(r.removed, 3);
  assert.deepEqual(r.lines.map((l) => l.raw_description), ["VDBT", "PCI NON COMPLIANCE", "UK BASE24"]);
});

test("keeps everything when the statement only has pass-through lines", () => {
  const only = [{ raw_description: "Interchange", fee_category_hint: "interchange" }];
  assert.equal(stripInterchangePlus(only).lines.length, 1);
});
