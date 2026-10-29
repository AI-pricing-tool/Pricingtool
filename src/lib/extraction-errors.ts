// Records why a statement extraction failed, so the statement is never left "processing" with nothing
// shown to the user. Used by extractStatement in statements.functions.ts.

const MAX_MESSAGE_LENGTH = 1000;

/** A readable, bounded message for any thrown value. Newlines are kept: setup errors are multi-line. */
export function describeExtractionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : (err as { message?: unknown } | null)?.message;
  const message = typeof raw === "string" ? raw.trim() : "";
  const text = message || "Extraction failed for an unknown reason.";
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : text;
}

/** The slice of the Supabase client this needs: from("statements").update(...).eq("id", ...). */
type StatementsDb = { from: (table: "statements") => any };

/**
 * Marks the statement "failed", stores the message in statements.error_message and logs it. Never throws:
 * the caller is already handling an error, and a failure here must not hide the original one.
 */
export async function recordExtractionFailure(
  db: StatementsDb,
  statementId: string,
  err: unknown,
  log: Pick<Console, "error"> = console,
): Promise<void> {
  const message = describeExtractionError(err);
  log.error(`[extractStatement] statement ${statementId} failed: ${message}`);
  try {
    const stored = await db.from("statements").update({ status: "failed", error_message: message }).eq("id", statementId);
    if (!stored.error) return;
    // For example the error_message column is missing because the latest migration has not been applied.
    // Still leave "processing" behind.
    log.error(`[extractStatement] could not store the error message for ${statementId}: ${stored.error.message}`);
    const fallback = await db.from("statements").update({ status: "failed" }).eq("id", statementId);
    if (fallback.error) log.error(`[extractStatement] could not mark ${statementId} as failed: ${fallback.error.message}`);
  } catch (writeErr) {
    log.error(`[extractStatement] could not record the failure for ${statementId}: ${describeExtractionError(writeErr)}`);
  }
}
