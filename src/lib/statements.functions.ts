import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyGlobalPaymentsCode, GLOBAL_PAYMENTS_CODE_GUIDANCE } from "@/lib/global-payments-codes";
import { extractWithAI, resolveAIConfig, type AIContent } from "@/lib/ai-provider";
import { recordExtractionFailure } from "@/lib/extraction-errors";

// Tool-call schema for the AI extraction
const lineSchema = {
  type: "object",
  properties: {
    raw_description: { type: "string", description: "Exact label as it appears on the statement, OR one of 'visa'|'mastercard'|'maestro' for card-type summary rows." },
    acquirer: { type: ["string", "null"] },
    site_name: { type: ["string", "null"], description: "Trading name of the site this line came from (for multi-site PDFs)." },
    site_mid: { type: ["string", "null"], description: "Merchant ID (MID) of the site this line came from. Preferred key over name." },
    txn_count: { type: ["number", "null"], description: "Number of transactions for this line." },
    txn_value: { type: ["number", "null"], description: "Total monetary volume in GBP for this line." },
    raw_rate: { type: ["number", "null"], description: "Percentage rate charged (e.g. 0.21 means 0.21%)." },
    extracted_fee: { type: ["number", "null"], description: "Total fee charged in GBP for this line." },
    scheme_hint: { type: ["string", "null"], enum: ["visa", "mastercard", "maestro", "amex", "discover", "other", null] },
    section_heading: { type: ["string", "null"], description: "The section heading this line was printed under, e.g. 'Visa Pass-thru Interchange & Fees' or 'GP Processing Fees'." },
    fee_category_hint: {
      type: ["string", "null"],
      enum: [
        "interchange", "scheme", "auth_fee", "chargeback_fee", "gateway_fee",
        "monthly_fee", "minimum_monthly_fee", "pci_fee", "refund_fee",
        "settlement_fee", "terminal_rental", "tokenization_fee", "avs_fee",
        "commercial_card_fee", "non_qual_fee", "non_secure_fee",
        "ecommerce_assessment_fee", "other", null,
      ],
    },
  },
  required: ["raw_description"],
  additionalProperties: false,
};

const siteSchema = {
  type: "object",
  properties: {
    site_name: { type: ["string", "null"] },
    site_mid: { type: ["string", "null"] },
    period_start: { type: ["string", "null"] },
    period_end: { type: ["string", "null"] },
    total_volume: { type: ["number", "null"] },
    total_fees: { type: ["number", "null"] },
  },
  additionalProperties: false,
};

const extractToolSchema = {
  type: "object",
  properties: {
    period_start: { type: ["string", "null"], description: "ISO date YYYY-MM-DD for start of statement period (earliest across all sites if multi-site)." },
    period_end: { type: ["string", "null"], description: "ISO date YYYY-MM-DD for end of statement period (latest across all sites)." },
    acquirer: { type: ["string", "null"] },
    currency: { type: ["string", "null"], enum: ["GBP", "USD", null], description: "Statement currency. USD for US merchants ($ amounts, US address)." },
    total_volume: { type: ["number", "null"], description: "Sum across all sites if multi-site." },
    total_fees: { type: ["number", "null"], description: "Sum across all sites if multi-site." },
    confidence: { type: ["number", "null"], description: "0..1 confidence in extraction." },
    sites: { type: "array", items: siteSchema, description: "One entry per embedded merchant statement in the PDF. Required when the document contains more than one site." },
    lines: { type: "array", items: lineSchema },
  },
  required: ["lines"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a payment-statement extraction engine for a merchant-services reseller.
Extract every fee line from the supplied merchant statement PDF and return it via the record_statement tool.

Rules:
- Only emit a scheme summary row with raw_description set to exactly "visa", "mastercard" or "maestro" (lowercase) when the statement provides a single scheme-level total and NO per-product breakdown for that scheme (e.g. Clover-style summaries). If per-product service charge lines exist for that scheme (e.g. "VISA CHIP SERVICE CHARGE", "VISA DEBIT CHIP SERVICE CHARGE", "MC DEBIT CHIP SERVICE CHARGE", "MASTERCARD CHIP SERVICE CHARGE", "MC PURCHASE CARD SERV CHRG", etc., as seen on First Data / Worldpay-style statements), do NOT emit the summary row — the itemised product lines already carry txn_count and txn_value, and adding the summary would double-count turnover.
- When a scheme summary row IS emitted, populate txn_count, txn_value, raw_rate (as a percentage number, e.g. 0.21 for 0.21%) and extracted_fee, and set scheme_hint to the same value.
- For every other fee line (Interchange, Scheme fees, Authorisation fees, Chargeback, Gateway, PCI, Monthly, per-product service charges, etc.) keep the original raw_description from the statement. Populate the fields you can confidently read; set the others to null.
- Use numbers without currency symbols (GBP for UK statements, USD for US statements) and set the top-level currency. Convert pence to pounds where appropriate.
- Pick the closest fee_category_hint from the enum, or null if you are unsure.
- Do not invent lines. Do not include subtotals labelled as "Total" or summary footers.
- Include the statement period_start/period_end in ISO format if visible.

Interchange++ (IC++) statements:
- Some statements (e.g. Global Payments "INTERCHANGE OTHER CHARGES", lines like "VISA CP UK DR 0.0324%&0.0323", "MC SCHEME FEE UK ...") itemise pass-through interchange and scheme fees separately from the acquirer's margin.
- On these statements DO NOT extract interchange or scheme fee lines — they are the same across acquirers. Extract only the acquirer margin lines (e.g. the per-product "TRANSACTIONS CHARGES" rows such as VDBT, MDPD, VISA, MC) and the additional fees (authorisation fees such as V ATH DOM / UK BASE24 / MC ATH VOL, PCI non-compliance, card-not-present, token/AVS, terminal rental, monthly fees, etc.).
- If you are unsure whether a line is interchange/scheme, set fee_category_hint to "interchange" or "scheme" accordingly.

US statements (Heartland, Global Payments US, EPX, TSYS, Fiserv/First Data US, Elavon, Chase Paymentech):
- Set currency to "USD". Amounts are in dollars.
- Always set section_heading to the heading each line was printed under.
- US interchange-plus statements print "Pass-thru Interchange & Fees" sections (e.g. "VS CR Small Merchant PD1 Infinite SQ", "VS DB US Regulated", "MC CR World Elite Merit I", Amex OptBlue "Tier" fees) plus network fees (Assessment, FANF, NABU, AVS, Issuer Settlement, Digital Enablement, License, Merchant Location, Network Acquiring Processing). Do NOT extract those — set fee_category_hint "interchange"/"scheme" if you do.
- Extract the processor's own fees: per-brand "Discount Fee" lines (e.g. "VS Discount Fee 1.60%"), per-brand "Transaction Fee", Batch/Settlement fees, PCI non-compliance, "Service & Regulatory Mandate", value-added services and monthly fees.
- For each per-brand Discount Fee line, set txn_value to that brand's net sales from the Processing Summary and txn_count to the brand's transaction count, and set scheme_hint. Include the card funding printed in the Processing Summary (e.g. "Credit", "Signature (Non-PIN) Debit") in raw_description when a brand has only one funding type.
- Tiered pricing (Qualified / Mid-Qualified / Non-Qualified, Global Payments "NQS-*" surcharges): extract base discount lines per brand and surcharge lines; label surcharges with their brand (VISA/MC/DISC/AMEX) in raw_description.
- Discover (DISC/DS) is a card scheme: use scheme_hint "discover".

Global Payments product codes:
- ${GLOBAL_PAYMENTS_CODE_GUIDANCE}.
- Preserve the printed product code and any printed credit/debit, consumer/commercial or region wording in raw_description. Do not replace codes with scheme-only summary labels.
- Mixed credit/debit business codes do not establish funding: never invent credit or debit. Premium consumer VPRE/VPRD are not business products. VPPD is used for both consumer and commercial prepaid and must not be guessed as ordinary debit. Use only supporting wording actually printed on the statement.

Multi-site documents:
- A single PDF may contain SEVERAL merchant statements concatenated back-to-back (e.g. a Dojo group upload with one statement per site/store). Treat each site's pages as its own statement.
- Walk through every page to the end of the document. Do NOT stop after the first site.
- For every distinct site you find, emit one entry in the top-level "sites" array with its site_name, site_mid (Merchant ID — preferred unique key), period_start, period_end, total_volume and total_fees.
- Every line in "lines" MUST carry site_mid (preferred) and site_name identifying the site whose pages the line came from. Never merge lines from different sites into one row even if descriptions are identical.
- If only one site is present, "sites" may contain a single entry or be omitted.`;



export const extractStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ statementId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Any error below is recorded on the statement (status "failed" plus error_message) by the
    // try/catch at the end of this handler, so it is never left "processing" with nothing shown.
    const extract = async () => {
    // Fails early, with setup instructions, when no AI provider is configured.
    const aiConfig = resolveAIConfig();

    // 1. Load statement
    const { data: stmt, error: sErr } = await supabase
      .from("statements")
      .select("id, organisation_id, file_path, file_name, file_type, acquirer")
      .eq("id", data.statementId)
      .single();
    if (sErr || !stmt) throw new Error(sErr?.message ?? "Statement not found");
    if (!stmt.file_path) throw new Error("Statement has no file attached");

    const { error: startErr } = await supabase
      .from("statements")
      .update({ status: "processing", error_message: null })
      .eq("id", stmt.id);
    if (startErr) throw new Error(`Could not start extraction: ${startErr.message}`);

    // 2. Download file from storage
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("statements")
      .download(stmt.file_path);
    if (dlErr || !fileBlob) throw new Error(dlErr?.message ?? "Failed to download file");

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const fileName = (stmt.file_name ?? "").toLowerCase();
    const fileType = (stmt.file_type ?? "").toLowerCase();

    // 3. Build user message — multimodal for PDF/image, text for CSV/XLSX
    let userContent: AIContent;
    const isPdf = fileType.includes("pdf") || fileName.endsWith(".pdf");
    const isImage = fileType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(fileName);
    const isCsv = fileType.includes("csv") || fileName.endsWith(".csv");
    const isXlsx = fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileType.includes("sheet") || fileType.includes("excel");

    const instruction = (label: string) => `Extract every fee line from this merchant-statements PDF (${stmt.file_name}${label}). The PDF may contain MULTIPLE merchant statements (one per site/MID) concatenated — process every site through to the last page and tag each line with its site_mid and site_name. Acquirer hint: ${stmt.acquirer ?? "unknown"}.`;
    let pdfChunks: Uint8Array[] | null = null;
    if (isPdf) {
      try {
        const { PDFDocument } = await import("pdf-lib");
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const n = src.getPageCount();
        if (n > CHUNK_PAGES) {
          pdfChunks = [];
          for (let i = 0; i < n; i += CHUNK_PAGES) {
            const out = await PDFDocument.create();
            const idx = Array.from({ length: Math.min(CHUNK_PAGES, n - i) }, (_, k) => i + k);
            const pages = await out.copyPages(src, idx);
            pages.forEach((pg) => out.addPage(pg));
            pdfChunks.push(await out.save());
          }
        }
      } catch (err) {
        // Splitting is an optimisation: fall back to sending the whole file, but say why.
        console.warn(`[extractStatement] could not split ${stmt.file_name} into page batches; sending it whole:`, err);
        pdfChunks = null;
      }
    }

    if (isPdf || isImage) {
      const mime = isPdf ? "application/pdf" : (fileType || "image/png");
      const b64 = uint8ToBase64(bytes);
      userContent = [
        { type: "text", text: instruction("") },
        { type: "file", mimeType: mime, base64: b64, filename: stmt.file_name ?? undefined },
      ];
    } else if (isCsv) {
      const text = new TextDecoder().decode(bytes);
      userContent = `Statement file: ${stmt.file_name}\nAcquirer hint: ${stmt.acquirer ?? "unknown"}\n\nCSV contents:\n${text.slice(0, 200_000)}`;
    } else if (isXlsx) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(bytes, { type: "array" });
      const parts: string[] = [];
      for (const name of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        parts.push(`# Sheet: ${name}\n${csv}`);
      }
      userContent = `Statement file: ${stmt.file_name}\nAcquirer hint: ${stmt.acquirer ?? "unknown"}\n\n${parts.join("\n\n").slice(0, 200_000)}`;
    } else {
      throw new Error(`Unsupported file type: ${stmt.file_type ?? stmt.file_name}`);
    }

    // 4. Call the configured AI provider (see src/lib/ai-provider.ts) with forced tool use
    const callAI = (content: AIContent): Promise<any> =>
      extractWithAI({ system: SYSTEM_PROMPT, content, schema: extractToolSchema }, aiConfig);

    let parsed: any;
    if (pdfChunks && pdfChunks.length > 1) {
      const results = await Promise.all(
        pdfChunks.map((c, i) =>
          callAI([
            { type: "text", text: instruction(`, part ${i + 1} of ${pdfChunks.length} of a larger file`) },
            { type: "file", mimeType: "application/pdf", base64: uint8ToBase64(c), filename: `${stmt.file_name ?? "statement"}-part-${i + 1}.pdf` },
          ]),
        ),
      );
      parsed = mergeChunkResults(results);
    } else {
      parsed = await callAI(userContent);
      if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) parsed = await callAI(userContent);
    }

    // 5. Look up canonical/fee categories + mapping dictionary
    const stmtAcquirer = (parsed.acquirer ?? stmt.acquirer ?? null) as string | null;
    const [{ data: cats, error: catsErr }, { data: feeCats, error: feeCatsErr }, { data: dict, error: dictErr }] = await Promise.all([
      // Ordered so the first category per scheme (the scheme-only fallback below) is deterministic.
      supabase.from("canonical_categories").select("id, scheme, code").not("scheme", "is", null).order("sort_order", { ascending: true }),
      supabase.from("fee_categories").select("id, code"),
      supabase
        .from("mapping_dictionary")
        .select("acquirer, raw_description_normalized, canonical_category_id, fee_category_id"),
    ]);
    // Without these every line would silently come out unmapped, so treat a failed lookup as a failure.
    const lookupErr = catsErr ?? feeCatsErr ?? dictErr;
    if (lookupErr) throw new Error(`Could not load the card taxonomy: ${lookupErr.message}`);

    const schemeToCatId = new Map<string, string>();
    const codeToCatId = new Map<string, string>();
    for (const c of cats ?? []) {
      if (c.code) codeToCatId.set(c.code as string, c.id as string);
      if (c.scheme && !schemeToCatId.has(c.scheme)) schemeToCatId.set(c.scheme, c.id as string);
    }
    const feeCodeToId = new Map<string, string>();
    for (const f of feeCats ?? []) feeCodeToId.set(f.code as string, f.id as string);

    // Token-based classifier — maps Worldpay-style descriptions
    // (e.g. "MasterCard Cr Per Purchases", "Visa Debit Com Purchases",
    // "Dr MasterCard EEA Purchases", "Visa: Credit: Inter-regional: Sale")
    // onto the granular canonical_category code naming
    // (`{scheme}_{[business_]}{funding}_{region}`, plus consumer-credit/debit-UK
    // which uses `visa_credit_uk` / `mc_debit_uk`).
    function classifyCard(desc: string, schemeHint: string | null): string | null {
      const s = desc.toLowerCase();
      let scheme: "visa" | "mastercard" | null =
        schemeHint === "visa" || schemeHint === "mastercard"
          ? schemeHint
          : /\bvisa\b/.test(s)
            ? "visa"
            : /\b(mastercard|master\s*card|\bmc\b)\b/.test(s)
              ? "mastercard"
              : null;
      if (!scheme) return null;

      const business =
        /\b(com|commercial|corporate|business|signia|world(?!wide)|purchasing|fleet)\b/.test(s);

      let funding: "credit" | "debit" | null = null;
      if (/\b(debit|maestro|\bdr\b)\b/.test(s)) funding = "debit";
      else if (/\b(credit|\bcr\b|signia|world|corporate)\b/.test(s)) funding = "credit";
      // Worldpay "Visa Business" without debit/credit token => credit
      else if (business) funding = "credit";
      if (!funding) return null;

      let region: "uk" | "eu" | "non_eu" = "uk";
      if (/inter[-\s]?regional|non[-\s]?eu|international/.test(s)) region = "non_eu";
      else if (/\b(eea|intra[-\s]?regional|\bint\b|\beu\b|europe)\b/.test(s)) region = "eu";

      // Code naming differs slightly between business / consumer
      const prefix = scheme === "visa" ? "visa" : "mc";
      const code = business
        ? `${prefix}_business_${funding}_${region}`
        : `${prefix}_${funding}_${region}`;
      return codeToCatId.has(code) ? code : null;
    }

    // Dictionary lookup keyed by acquirer + normalized raw description, with acquirer-agnostic fallback
    const dictKey = (acq: string | null, norm: string) =>
      `${(acq ?? "").toLowerCase().trim()}::${norm}`;
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
    const dictMap = new Map<string, { canonical_category_id: string | null; fee_category_id: string | null }>();
    for (const d of dict ?? []) {
      const norm = d.raw_description_normalized as string | null;
      if (!norm) continue;
      const entry = {
        canonical_category_id: (d.canonical_category_id as string | null) ?? null,
        fee_category_id: (d.fee_category_id as string | null) ?? null,
      };
      dictMap.set(dictKey(d.acquirer as string | null, norm), entry);
      const fallbackKey = `*::${norm}`;
      if (!dictMap.has(fallbackKey)) dictMap.set(fallbackKey, entry);
    }

    const { stripInterchangePlus } = await import("./interchange-plus");
    const { detectCurrency, classifyUsCard } = await import("./interchange-plus");
    const rawLines: any[] = Array.isArray(parsed.lines) ? parsed.lines : [];
    const currency = detectCurrency(
      parsed.currency,
      [stmt.file_name, parsed.acquirer, ...rawLines.map((l) => l?.raw_description)].filter(Boolean).join(" \n "),
    );
    const linesIn: any[] = stripInterchangePlus(Array.isArray(parsed.lines) ? parsed.lines : []).lines;
    const rows = linesIn
      .filter((l) => l && typeof l.raw_description === "string" && l.raw_description.trim())
      .map((l) => {
        const rawDesc = String(l.raw_description).trim();
        const lineAcq = (l.acquirer ?? stmtAcquirer ?? null) as string | null;
        const norm = normalize(rawDesc);

        const dictHit =
          dictMap.get(dictKey(lineAcq, norm)) ?? dictMap.get(`*::${norm}`) ?? null;

        const product = currency === "USD" ? null : classifyGlobalPaymentsCode(rawDesc, lineAcq);
        // Product-code rules take precedence over old exact or cross-acquirer guesses.
        let canonical_category_id: string | null = product
          ? (product.code ? codeToCatId.get(product.code) ?? null : null)
          : dictHit?.canonical_category_id ?? null;
        let fee_category_id: string | null = dictHit?.fee_category_id ?? null;

        if (!canonical_category_id && !product) {
          // Try fine-grained classifier first (funding + card category + region),
          // then fall back to scheme-only mapping so other acquirers don't regress.
          const schemeHint = (l.scheme_hint ?? "").toLowerCase() || null;
          const code = currency === "USD"
            ? (() => { const c = classifyUsCard(rawDesc, schemeHint); return c && codeToCatId.has(c) ? c : null; })()
            : classifyCard(rawDesc, schemeHint);
          if (code) {
            canonical_category_id = codeToCatId.get(code) ?? null;
          } else if (currency !== "USD" && schemeHint && schemeToCatId.has(schemeHint)) {
            canonical_category_id = schemeToCatId.get(schemeHint) ?? null;
          }
        }
        // US per-transaction/fixed fees name a brand but carry no sales; keep them as fees.
        if (currency === "USD" && !(Number(l.txn_value) > 0)) canonical_category_id = null;
        if (!fee_category_id) {
          const feeHint = (l.fee_category_hint ?? "").toLowerCase();
          if (feeHint && feeCodeToId.has(feeHint)) fee_category_id = feeCodeToId.get(feeHint) ?? null;
        }


        const status = product
          ? (canonical_category_id ? ("suggested" as const) : ("unmapped" as const))
          : dictHit
          ? ("approved" as const)
          : canonical_category_id || fee_category_id
            ? ("suggested" as const)
            : ("unmapped" as const);

        return {
          statement_id: stmt.id,
          organisation_id: stmt.organisation_id,
          acquirer: lineAcq,
          raw_description: rawDesc,
          site_name: typeof l.site_name === "string" && l.site_name.trim() ? l.site_name.trim() : null,
          site_mid: typeof l.site_mid === "string" && l.site_mid.trim() ? l.site_mid.trim() : null,
          txn_count: numOrNull(l.txn_count),
          txn_value: numOrNull(l.txn_value),
          // Prefer rate derived from fee/value (source of truth) over AI-extracted rate,
          // since acquirers print rates inconsistently (e.g. First Data uses decimals like
          // 0.0082 for 0.82%, others print 0.082 meaning 0.082%). Deriving avoids ambiguity.
          raw_rate: deriveRate(numOrNull(l.txn_value), numOrNull(l.extracted_fee)) ?? numOrNull(l.raw_rate),
          extracted_fee: numOrNull(l.extracted_fee),
          canonical_category_id,
          fee_category_id,
          status,
          confidence: product ? (canonical_category_id ? 0.95 : null) : dictHit ? 1 : typeof parsed.confidence === "number" ? parsed.confidence : null,
        };
      });

    // 6. Replace any existing lines for this statement
    const { error: delErr } = await supabase.from("statement_lines").delete().eq("statement_id", stmt.id);
    if (delErr) throw new Error(`Could not clear the previous extraction: ${delErr.message}`);
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("statement_lines").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    // 7. Roll up document totals/period across sites if multi-site
    const sites = Array.isArray(parsed.sites) ? parsed.sites : [];
    const siteCount = sites.length;
    let docVolume = numOrNull(parsed.total_volume);
    let docFees = numOrNull(parsed.total_fees);
    let docStart: string | null = parsed.period_start ?? null;
    let docEnd: string | null = parsed.period_end ?? null;
    if (siteCount > 1) {
      const sumVol = sites.reduce((a: number, s: any) => a + (numOrNull(s?.total_volume) ?? 0), 0);
      const sumFee = sites.reduce((a: number, s: any) => a + (numOrNull(s?.total_fees) ?? 0), 0);
      if (sumVol > 0) docVolume = sumVol;
      if (sumFee > 0) docFees = sumFee;
      const starts = sites.map((s: any) => s?.period_start).filter((x: any) => typeof x === "string") as string[];
      const ends = sites.map((s: any) => s?.period_end).filter((x: any) => typeof x === "string") as string[];
      if (starts.length) docStart = starts.sort()[0];
      if (ends.length) docEnd = ends.sort()[ends.length - 1];
    }

    // 8. Update statement totals + status
    const { error: finishErr } = await supabase
      .from("statements")
      .update({
        status: "extracted",
        error_message: null,
        period_start: docStart,
        period_end: docEnd,
        acquirer: parsed.acquirer ?? stmt.acquirer ?? null,
        currency,
        total_volume: docVolume,
        total_fees: docFees,
        confidence_score: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
      })
      .eq("id", stmt.id);
    if (finishErr) throw new Error(`Could not save the extraction result: ${finishErr.message}`);

    return { ok: true, lineCount: rows.length, siteCount };
    };

    try {
      return await extract();
    } catch (err) {
      await recordExtractionFailure(supabase, data.statementId, err);
      throw err;
    }
  });


function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const CHUNK_PAGES = 6;

function mergeChunkResults(results: any[]): any {
  const lines: any[] = [];
  const siteMap = new Map<string, any>();
  let acquirer: string | null = null;
  let currency: string | null = null;
  let confidence: number | null = null;
  for (const r of results) {
    if (!r) continue;
    acquirer = acquirer ?? r.acquirer ?? null;
    currency = currency ?? r.currency ?? null;
    if (typeof r.confidence === "number") confidence = confidence === null ? r.confidence : Math.min(confidence, r.confidence);
    if (Array.isArray(r.lines)) lines.push(...r.lines);
    const sites = Array.isArray(r.sites) && r.sites.length ? r.sites : [{ site_name: null, site_mid: null, period_start: r.period_start, period_end: r.period_end, total_volume: r.total_volume, total_fees: r.total_fees }];
    for (const s of sites) {
      const key = String(s?.site_mid ?? s?.site_name ?? `chunk-${siteMap.size}`).trim().toLowerCase();
      const prev = siteMap.get(key);
      if (!prev) siteMap.set(key, { ...s });
      else {
        // Same site split across chunks: keep the largest reported totals (they're document totals, not partials)
        prev.total_volume = Math.max(Number(prev.total_volume ?? 0), Number(s?.total_volume ?? 0)) || null;
        prev.total_fees = Math.max(Number(prev.total_fees ?? 0), Number(s?.total_fees ?? 0)) || null;
        prev.period_start = prev.period_start ?? s?.period_start ?? null;
        prev.period_end = prev.period_end ?? s?.period_end ?? null;
        prev.site_name = prev.site_name ?? s?.site_name ?? null;
      }
    }
  }
  const sites = [...siteMap.values()];
  const sum = (k: string) => sites.reduce((a, s) => a + (Number(s?.[k]) || 0), 0);
  return {
    acquirer,
    currency,
    confidence,
    sites,
    lines,
    total_volume: sum("total_volume") || null,
    total_fees: sum("total_fees") || null,
    period_start: sites.map((s) => s.period_start).filter(Boolean).sort()[0] ?? null,
    period_end: sites.map((s) => s.period_end).filter(Boolean).sort().pop() ?? null,
  };
}

function deriveRate(value: number | null, fee: number | null): number | null {
  if (value === null || fee === null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(fee)) return null;
  if (value <= 0) return null;
  return (fee / value) * 100;
}

function uint8ToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack overflow on large files
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  // btoa is available in the Worker runtime
  return btoa(binary);
}
