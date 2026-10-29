import { test } from "node:test";
import assert from "node:assert/strict";
import { describeExtractionError, recordExtractionFailure } from "./extraction-errors";
import { resolveAIConfig, AIProviderError } from "./ai-provider";

// A fake of the one Supabase call chain recordExtractionFailure uses: from().update(values).eq("id", id).
function fakeDb(results: Array<{ message: string } | null>) {
  const calls: Array<{ table: string; values: Record<string, unknown>; id: string }> = [];
  let i = 0;
  const db = {
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          calls.push({ table, values, id });
          return { error: results[Math.min(i++, results.length - 1)] };
        },
      }),
    }),
  };
  return { db, calls };
}
const quietLog = () => { const lines: string[] = []; return { lines, log: { error: (...a: unknown[]) => { lines.push(a.map(String).join(" ")); } } }; };

test("describeExtractionError handles every kind of thrown value", () => {
  assert.equal(describeExtractionError(new Error("  boom  ")), "boom");
  assert.equal(describeExtractionError("plain string"), "plain string");
  assert.equal(describeExtractionError({ message: "from an object" }), "from an object");
  assert.match(describeExtractionError(undefined), /unknown reason/);
  assert.match(describeExtractionError(new Error("")), /unknown reason/);
  assert.match(describeExtractionError(42), /unknown reason/);
});

test("describeExtractionError bounds very long messages", () => {
  const out = describeExtractionError(new Error("x".repeat(5000)));
  assert.equal(out.length, 1000);
  assert.ok(out.endsWith("…"));
});

test("describeExtractionError keeps the multi-line setup help for a missing AI provider", () => {
  let err: unknown;
  try { resolveAIConfig({}); } catch (e) { err = e; }
  assert.ok(err instanceof AIProviderError);
  const msg = describeExtractionError(err);
  assert.ok(msg.includes("\n"));
  for (const v of ["AI_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY"]) assert.ok(msg.includes(v), v);
});

test("a failure marks the statement failed, stores the message and logs it", async () => {
  const { db, calls } = fakeDb([null]);
  const { lines, log } = quietLog();
  await recordExtractionFailure(db, "stmt-1", new Error("AI rate limit reached"), log);
  assert.deepEqual(calls, [{ table: "statements", values: { status: "failed", error_message: "AI rate limit reached" }, id: "stmt-1" }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /stmt-1.*AI rate limit reached/);
});

test("if the message cannot be stored (column missing), the status is still set to failed", async () => {
  const { db, calls } = fakeDb([{ message: 'column "error_message" does not exist' }, null]);
  const { lines, log } = quietLog();
  await recordExtractionFailure(db, "stmt-2", new Error("boom"), log);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].values, { status: "failed" });
  assert.ok(lines.some((l) => /could not store the error message/.test(l)));
});

test("recordExtractionFailure never throws, even when the database itself is down", async () => {
  const { lines, log } = quietLog();
  const dead = { from: () => { throw new Error("connection refused"); } };
  await assert.doesNotReject(recordExtractionFailure(dead, "stmt-3", new Error("boom"), log));
  assert.ok(lines.some((l) => /connection refused/.test(l)));
  const { db } = fakeDb([{ message: "nope" }, { message: "still nope" }]);
  await assert.doesNotReject(recordExtractionFailure(db, "stmt-4", new Error("boom"), quietLog().log));
});
