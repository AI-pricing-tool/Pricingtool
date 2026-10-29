import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
} from "docx";

// ---------- helpers ----------
const gbp = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 2,
      }).format(Number(n));

const pct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(3)}%`;

const CARD_SCHEMES = new Set(["visa", "mastercard", "maestro"]);
const DEFAULT_PER_TXN_PENCE = 2.5;

const cellBorder = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function headerCell(text: string, width: number, fill = "1F3A5F") {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: allBorders,
    shading: { fill, type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF" })] })],
  });
}

function bodyCell(text: string, width: number, opts: { bold?: boolean; align?: "left" | "right" } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: allBorders,
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    children: [
      new Paragraph({
        alignment: opts.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold })],
      }),
    ],
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) {
  return new Paragraph({
    heading: level,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, color: "1F3A5F" })],
  });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun(text)],
  });
}

// ---------- server function ----------
export const generateProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ statementId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1. Load statement + merchant
    const { data: stmt, error: sErr } = await supabase
      .from("statements")
      .select("*, merchant:merchant_id(id, name, industry, acquirer, monthly_volume)")
      .eq("id", data.statementId)
      .single();
    if (sErr || !stmt) throw new Error(sErr?.message ?? "Statement not found");

    // 2. Ensure merchant exists
    let merchantId = (stmt as any).merchant_id as string | null;
    let merchant = (stmt as any).merchant as any;
    if (!merchantId) {
      const fallbackName = ((stmt as any).file_name ?? "New merchant").replace(/\.[^/.]+$/, "");
      const { data: m, error: mErr } = await supabase
        .from("merchants")
        .insert({
          organisation_id: (stmt as any).organisation_id,
          name: fallbackName,
          acquirer: (stmt as any).acquirer ?? null,
          stage: "creating_proposal",
        })
        .select("id, name, industry, acquirer, monthly_volume")
        .single();
      if (mErr || !m) throw new Error(mErr?.message ?? "Failed to create merchant");
      merchantId = m.id;
      merchant = m;
      await supabase.from("statements").update({ merchant_id: merchantId }).eq("id", (stmt as any).id);
    }

    // 3. Load lines + categories + buy rates
    const [linesRes, catsRes, brRes] = await Promise.all([
      supabase.from("statement_lines").select("*").eq("statement_id", (stmt as any).id).order("created_at"),
      supabase.from("canonical_categories").select("id, label, scheme, funding, card_category, region, sort_order"),
      supabase.from("buy_rates").select("canonical_category_id, percent_rate, per_item").is("fee_category_id", null).is("card_present", null),
    ]);
    const lines = (linesRes.data ?? []) as any[];
    const categories = (catsRes.data ?? []) as any[];
    const buyRates = (brRes.data ?? []) as any[];

    const catById = new Map(categories.map((c) => [c.id, c]));
    const buyRateByCat = new Map<string, { percent_rate: number | null; per_item: number | null }>();
    for (const b of buyRates) {
      if (b.canonical_category_id) {
        buyRateByCat.set(b.canonical_category_id, {
          percent_rate: b.percent_rate,
          per_item: b.per_item,
        });
      }
    }

    // 4. Partition breakdown vs fee lines (same logic as the analyses page)
    const breakdownLines: any[] = [];
    const feeLines: any[] = [];
    for (const l of lines) {
      const cat = l.canonical_category_id ? catById.get(l.canonical_category_id) : null;
      const raw = (l.raw_description ?? "").trim().toLowerCase();
      const isScheme = (cat?.scheme && CARD_SCHEMES.has(cat.scheme)) || CARD_SCHEMES.has(raw);
      if (isScheme) breakdownLines.push(l);
      else feeLines.push(l);
    }

    // 5. Compute effective rate / per-txn and totals
    const effectiveFor = (l: any) => {
      const buy = l.canonical_category_id ? buyRateByCat.get(l.canonical_category_id) : null;
      const rate = l.our_rate != null
        ? Number(l.our_rate)
        : buy?.percent_rate != null ? Number(buy.percent_rate) : 0;
      const perTxn = l.our_per_txn != null
        ? Number(l.our_per_txn)
        : DEFAULT_PER_TXN_PENCE;
      return { rate, perTxn };
    };

    const computeOurFee = (l: any) => {
      const { rate, perTxn } = effectiveFor(l);
      const vol = Number(l.txn_value ?? 0);
      const txns = Number(l.txn_count ?? 0);
      return (vol * rate) / 100 + (txns * perTxn) / 100;
    };

    const turnover = breakdownLines.reduce((s, l) => s + Number(l.txn_value ?? 0), 0);
    const totalTxns = breakdownLines.reduce((s, l) => s + Number(l.txn_count ?? 0), 0);
    const avgTxn = totalTxns > 0 ? turnover / totalTxns : 0;
    const currentFees = lines.reduce((s, l) => s + Number(l.extracted_fee ?? 0), 0);
    const ourFees =
      breakdownLines.reduce((s, l) => s + computeOurFee(l), 0) +
      feeLines.reduce((s, l) => s + Number(l.our_fee ?? 0), 0);
    const monthlySaving = currentFees - ourFees;
    const annualSaving = monthlySaving * 12;

    // 6. Build the .docx
    const COL_LEFT = 5400;
    const COL_RIGHT = 3960;
    const TABLE_WIDTH = COL_LEFT + COL_RIGHT; // 9360 DXA = 6.5 in

    const merchantName = merchant?.name ?? (stmt as any).file_name ?? "Merchant";
    const today = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    const infoRows: Array<[string, string]> = [
      ["Merchant Name", merchantName],
      ["Industry", merchant?.industry ?? "—"],
      ["Annual Card Volume", gbp(turnover * 12)],
      ["Average Transaction Size", gbp(avgTxn)],
      ["Current Processor", merchant?.acquirer ?? (stmt as any).acquirer ?? "—"],
    ];

    const blendedRows = breakdownLines.map((l) => {
      const cat = l.canonical_category_id ? catById.get(l.canonical_category_id) : null;
      const label = cat?.label ?? (l.raw_description as string);
      const { rate } = effectiveFor(l);
      return [label, pct(rate)] as [string, string];
    });

    const feeRows = feeLines.map((l) => {
      const label = (l.raw_description as string) ?? "Fee";
      const value = l.our_fee != null
        ? gbp(Number(l.our_fee))
        : l.our_per_txn != null
          ? `£${(Number(l.our_per_txn) / 100).toFixed(3)} per txn`
          : "—";
      return [label, value] as [string, string];
    });

    const titleBlock = new Table({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [TABLE_WIDTH],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: TABLE_WIDTH, type: WidthType.DXA },
              borders: allBorders,
              shading: { fill: "1F3A5F", type: ShadingType.CLEAR, color: "auto" },
              margins: { top: 200, bottom: 200, left: 200, right: 200 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: "MERCHANT SERVICES PROPOSAL", bold: true, size: 36, color: "FFFFFF" })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `Prepared for: ${merchantName}`, color: "FFFFFF" })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `Date: ${today}`, color: "FFFFFF" })],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const twoColTable = (rows: Array<[string, string]>, leftHeader: string, rightHeader: string) =>
      new Table({
        width: { size: TABLE_WIDTH, type: WidthType.DXA },
        columnWidths: [COL_LEFT, COL_RIGHT],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [headerCell(leftHeader, COL_LEFT), headerCell(rightHeader, COL_RIGHT)],
          }),
          ...rows.map(([k, v]) =>
            new TableRow({
              children: [bodyCell(k, COL_LEFT), bodyCell(v, COL_RIGHT, { align: "right" })],
            }),
          ),
        ],
      });

    const savingsTable = new Table({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [COL_LEFT, COL_RIGHT],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [headerCell("Current Provider", COL_LEFT), headerCell("Proposed Solution", COL_RIGHT)],
        }),
        new TableRow({
          children: [
            bodyCell(`${gbp(currentFees * 12)} / year`, COL_LEFT, { align: "right" }),
            bodyCell(`${gbp(ourFees * 12)} / year`, COL_RIGHT, { align: "right" }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: TABLE_WIDTH, type: WidthType.DXA },
              borders: allBorders,
              columnSpan: 2,
              shading: { fill: "E8F0F8", type: ShadingType.CLEAR, color: "auto" },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: `Estimated Monthly Saving: ${gbp(monthlySaving)}`, bold: true }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const doc = new Document({
      creator: "Pricing Tool",
      title: `Proposal — ${merchantName}`,
      styles: {
        default: { document: { run: { font: "Calibri", size: 22 } } },
        paragraphStyles: [
          {
            id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 36, bold: true, font: "Calibri", color: "1F3A5F" },
            paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0 },
          },
          {
            id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 28, bold: true, font: "Calibri", color: "1F3A5F" },
            paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
          },
        ],
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          titleBlock,
          new Paragraph({ spacing: { before: 200 }, children: [] }),

          heading("Executive Summary"),
          new Paragraph({ children: [new TextRun(
            "Thank you for the opportunity to provide a payment processing solution for your business. " +
            "This proposal outlines a tailored merchant services program designed to reduce processing costs, " +
            "improve transaction efficiency, and provide transparent pricing and support.",
          )] }),
          new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Our goal is to deliver:", bold: true })] }),
          bullet("Competitive card processing rates"),
          bullet("Transparent fee structure"),
          bullet("Reliable payment technology"),
          bullet("Fast funding and reporting"),
          bullet("Dedicated account support"),

          heading("Merchant Information"),
          twoColTable(infoRows, "Business Information", "Details"),

          heading("Proposed Pricing Structure"),
          new Paragraph({ children: [new TextRun({ text: "Blended Rate Pricing", bold: true })] }),
          new Paragraph({ spacing: { after: 120 }, children: [] }),
          blendedRows.length
            ? twoColTable(blendedRows, "Transaction Type", "Rate")
            : new Paragraph({ children: [new TextRun({ text: "No card-type rates configured.", italics: true })] }),

          heading("Other Fees"),
          feeRows.length
            ? twoColTable(feeRows, "Fee Type", "Rate")
            : new Paragraph({ children: [new TextRun({ text: "No additional fees configured.", italics: true })] }),

          heading("Estimated Savings"),
          new Paragraph({ spacing: { after: 80 }, children: [
            new TextRun({ text: `Estimated Annual Savings: `, bold: true }),
            new TextRun({ text: gbp(annualSaving), bold: true, color: "1F8A4C" }),
          ]}),
          savingsTable,

          // TEMPLATE: the service commitments below and the validity/terms paragraph at the end are placeholders.
          // Replace them with your own before sending any proposal to a customer.
          heading("Support & Service"),
          new Paragraph({ children: [new TextRun({ text: "Included Support:", bold: true })] }),
          bullet("[Your service commitment here]"),
          bullet("[Your service commitment here]"),
          bullet("Technical support"),
          bullet("PCI assistance"),
          bullet("Statement analysis reviews"),

          heading("Next Steps & Acceptance"),
          new Paragraph({ children: [new TextRun(
            "We look forward to supporting your business. To proceed, please contact your account manager.",
          )] }),
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({
            text: "[Your proposal validity period and terms here]",
            italics: true, color: "777777",
          })] }),
        ],
      }],
    });

    const buf = await Packer.toBuffer(doc);

    // 7. Insert proposal row first (so we have a stable id for the filename)
    const { data: proposal, error: pErr } = await supabase
      .from("proposals")
      .insert({
        organisation_id: (stmt as any).organisation_id,
        merchant_id: merchantId,
        title: `Proposal — ${merchantName}`,
        status: "draft",
        estimated_monthly_saving: Number(monthlySaving.toFixed(2)),
        estimated_annual_saving: Number(annualSaving.toFixed(2)),
        estimated_reseller_revenue: Number(ourFees.toFixed(2)),
        payload: { statement_id: (stmt as any).id },
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (pErr || !proposal) throw new Error(pErr?.message ?? "Failed to create proposal");

    // 8. Upload .docx to storage
    const safeName = merchantName.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 60) || "Proposal";
    const filePath = `${(stmt as any).organisation_id}/${proposal.id}_${safeName}.docx`;
    const { error: upErr } = await supabase.storage
      .from("proposals")
      .upload(filePath, buf, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    await supabase.from("proposals").update({ file_path: filePath }).eq("id", proposal.id);

    // 9. Move merchant to next stage
    if (merchantId) {
      await supabase.from("merchants").update({ stage: "proposed" }).eq("id", merchantId);
    }

    return { proposalId: proposal.id, filePath, monthlySaving, annualSaving };
  });
