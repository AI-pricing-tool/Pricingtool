import { BPS_GREEN_FROM, BPS_AMBER_FROM, BPS_TARGET } from "@/config/template-config";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { classifyUsCard, detectCurrency, stripInterchangePlus } from "@/lib/interchange-plus";
import { moneyPrecise, currencySymbol, num } from "@/lib/format";
import { toast } from "sonner";
import {
  ArrowLeft, PoundSterling, CreditCard, Percent, DollarSign, TrendingDown, Gauge,
  RefreshCw, FileText, Plus, Trash2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractStatement } from "@/lib/statements.functions";
import { generateProposal } from "@/lib/proposals.functions";

export const Route = createFileRoute("/_authenticated/analyses/$id")({
  component: AnalysisPage,
});

/**
 * Strip noisy trailing "Purchase(s)" suffix from Worldpay-style card type
 * labels in the breakdown table. Refunds are left intact so the user can
 * still distinguish refund rows.
 */
function prettifyCardType(raw: string): string {
  return raw.replace(/\s+purchases?\b\s*$/i, "").trim();
}

interface Line {
  id: string;
  raw_description: string;
  txn_count: number | null;
  txn_value: number | null;
  raw_rate: number | null;
  extracted_fee: number | null;
  our_rate: number | null;
  our_per_txn: number | null;
  our_fee: number | null;
  canonical_category_id: string | null;
  fee_category_id: string | null;
  status: "unmapped" | "suggested" | "approved" | "manual";
}

interface Category {
  id: string;
  label: string;
  scheme: string | null;
  card_category: string | null;
}

// Invented round figures for the "Load sample data" button. Not from any real statement.
const SAMPLE_LINES = [
  { raw_description: "Mastercard", txn_count: 12000, txn_value: 180000, raw_rate: 0, extracted_fee: 396, scheme: "mastercard" },
  { raw_description: "Visa", txn_count: 15000, txn_value: 225000, raw_rate: 0, extracted_fee: 495, scheme: "visa" },
  { raw_description: "Maestro", txn_count: 50, txn_value: 700, raw_rate: 0, extracted_fee: 1.50, scheme: "maestro" },
  { raw_description: "Interchange", txn_count: null, txn_value: null, raw_rate: null, extracted_fee: 700, scheme: null },
  { raw_description: "Scheme fees", txn_count: null, txn_value: null, raw_rate: null, extracted_fee: 250, scheme: null },
  { raw_description: "Visa Acquired Auth Approved Dom", txn_count: 15000, txn_value: null, raw_rate: null, extracted_fee: 30, scheme: null },
  { raw_description: "MC Acquired Auth Approved Dom", txn_count: 12000, txn_value: null, raw_rate: null, extracted_fee: 24, scheme: null },
  { raw_description: "MC Authorisation Fees (Grouped Entries)", txn_count: null, txn_value: null, raw_rate: null, extracted_fee: 10, scheme: null },
  { raw_description: "Chargeback", txn_count: 1, txn_value: null, raw_rate: null, extracted_fee: 100, scheme: null },
  { raw_description: "Visa Acquired Auth Appvd International", txn_count: 500, txn_value: null, raw_rate: null, extracted_fee: 15, scheme: null },
  { raw_description: "MC Acquired Auth Declined Dom", txn_count: 2000, txn_value: null, raw_rate: null, extracted_fee: 10, scheme: null },
  { raw_description: "Visa Acquired Auth Approved EEA", txn_count: 900, txn_value: null, raw_rate: null, extracted_fee: 5, scheme: null },
  { raw_description: "Visa Acquired Auth Declined Dom", txn_count: 1500, txn_value: null, raw_rate: null, extracted_fee: 5, scheme: null },
  { raw_description: "Minimum monthly service charge (MMSC)", txn_count: null, txn_value: null, raw_rate: null, extracted_fee: 0, scheme: null },
  { raw_description: "Gateway", txn_count: null, txn_value: null, raw_rate: null, extracted_fee: 0, scheme: null },
];

function AnalysisPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const extractFn = useServerFn(extractStatement);
  const generateProposalFn = useServerFn(generateProposal);
  const [seeding, setSeeding] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [buildingProposal, setBuildingProposal] = useState(false);

  const { data: stmt } = useQuery({
    queryKey: ["analysis-stmt", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("statements")
        .select("*, merchant:merchant_id(id, name, stage)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rawLines = [] } = useQuery({
    queryKey: ["analysis-lines", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("statement_lines")
        .select("*")
        .eq("statement_id", id)
        .order("created_at");
      return (data ?? []) as Line[];
    },
  });
  // Older/US uploads may have been saved as GBP with pass-thru interchange lines; correct on display.
  const detected = detectCurrency(
    (stmt as any)?.currency === "USD" ? "USD" : null,
    [(stmt as any)?.file_name, ...rawLines.map((l) => l.raw_description)].filter(Boolean).join("\n"),
  );
  const currency: string = detected;
  const fmt = (n: number | null | undefined) => moneyPrecise(n, currency);

  const { data: categories = [] } = useQuery({
    queryKey: ["canonical-mini-code"],
    queryFn: async () => {
      const { data } = await supabase
        .from("canonical_categories")
        .select("id, code, label, scheme, card_category");
      return (data ?? []) as (Category & { code: string })[];
    },
  });
  // US uploads read by an older version may have brand discount lines with sales but no card type;
  // match them to the US card types on display so they price against US buy rates.
  const lines = useMemo(() => {
    if (currency !== "USD") return rawLines;
    const idByCode = new Map(categories.map((c) => [c.code, c.id]));
    return stripInterchangePlus(rawLines).lines.map((l) => {
      if (l.canonical_category_id || !(Number(l.txn_value ?? 0) > 0)) return l;
      const code = classifyUsCard(l.raw_description);
      const id = code ? idByCode.get(code) : undefined;
      return id ? { ...l, canonical_category_id: id } : l;
    });
  }, [rawLines, currency, categories]);

  const { data: buyRates = [] } = useQuery({
    queryKey: ["buy-rates-card-type"],
    queryFn: async () => {
      const { data } = await supabase
        .from("buy_rates")
        .select("canonical_category_id, percent_rate, per_item")
        .is("fee_category_id", null)
        .is("card_present", null);
      return data ?? [];
    },
  });

  const { data: authFeeCategoryIds = new Set<string>() } = useQuery({
    queryKey: ["fee-categories-auth"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_categories")
        .select("id, code")
        .eq("code", "auth_fee");
      return new Set<string>((data ?? []).map((r: any) => r.id as string));
    },
  });

  const buyRateByCat = useMemo(() => {
    const m = new Map<string, { percent_rate: number | null; per_item: number | null }>();
    for (const b of buyRates) {
      if (b.canonical_category_id) {
        m.set(b.canonical_category_id as string, {
          percent_rate: b.percent_rate as number | null,
          per_item: b.per_item as number | null,
        });
      }
    }
    return m;
  }, [buyRates]);


  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (stmt && (stmt as any).notes != null) setNotes((stmt as any).notes ?? "");
  }, [stmt]);

  // Debounced notes save
  useEffect(() => {
    if (!stmt) return;
    if (notes === ((stmt as any).notes ?? "")) return;
    const t = setTimeout(async () => {
      await supabase.from("statements").update({ notes }).eq("id", id);
      qc.invalidateQueries({ queryKey: ["analysis-stmt", id] });
    }, 600);
    return () => clearTimeout(t);
  }, [notes, stmt, id, qc]);

  const updateLine = useMutation({
    mutationFn: async ({ lineId, patch }: { lineId: string; patch: Partial<Line> }) => {
      const { error } = await supabase.from("statement_lines").update(patch).eq("id", lineId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analysis-lines", id] }),
  });

  const deleteLine = useMutation({
    mutationFn: async (lineId: string) => {
      const { error } = await supabase.from("statement_lines").delete().eq("id", lineId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analysis-lines", id] }),
  });

  async function addManualFee() {
    if (!stmt) return;
    const { error } = await supabase.from("statement_lines").insert({
      statement_id: id,
      organisation_id: (stmt as any).organisation_id,
      raw_description: "New fee",
      status: "manual",
      extracted_fee: 0,
    });
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["analysis-lines", id] });
  }

  async function seedDemo() {
    if (!stmt) return;
    setSeeding(true);
    try {
      const rows = SAMPLE_LINES.map((s) => ({
        statement_id: id,
        organisation_id: (stmt as any).organisation_id,
        acquirer: (stmt as any).acquirer,
        raw_description: s.raw_description,
        txn_count: s.txn_count,
        txn_value: s.txn_value,
        raw_rate: s.raw_rate,
        extracted_fee: s.extracted_fee,
        status: "suggested" as const,
      }));
      const { error } = await supabase.from("statement_lines").insert(rows);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["analysis-lines", id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSeeding(false);
    }
  }

  async function reExtract() {
    setReExtracting(true);
    try {
      const res = await extractFn({ data: { statementId: id } });
      qc.invalidateQueries({ queryKey: ["analysis-stmt", id] });
      qc.invalidateQueries({ queryKey: ["analysis-lines", id] });
      toast.success(`Re-extracted ${res.lineCount} fee line${res.lineCount === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Re-extraction failed");
    } finally {
      setReExtracting(false);
    }
  }




  async function buildProposal() {
    if (!stmt) return;
    setBuildingProposal(true);
    try {
      const res = await generateProposalFn({ data: { statementId: id } });
      toast.success(
        `Proposal created — est. monthly saving ${
          moneyPrecise(res.monthlySaving, currency)
        }`,
      );
      navigate({ to: "/proposals" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to build proposal");
    } finally {
      setBuildingProposal(false);
    }
  }

  // Partition lines: card type breakdown vs transaction fees.
  // A line is a card-type breakdown row if its canonical_category has a scheme of visa/mastercard/maestro
  // OR its raw_description is exactly one of those scheme names (demo seed).
  const cardSchemes = new Set(["visa", "mastercard", "maestro", "amex", "discover"]);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const breakdownLines: Line[] = [];
  const feeLines: Line[] = [];
  for (const l of lines) {
    const cat = l.canonical_category_id ? catById.get(l.canonical_category_id) : null;
    const isSummary = cardSchemes.has(l.raw_description.trim().toLowerCase());
    // Card rows need sales; brand-named per-transaction fees stay in the fees table.
    const isScheme = isSummary || (!!cat?.scheme && cardSchemes.has(cat.scheme) && Number(l.txn_value ?? 0) > 0);
    if (isScheme) breakdownLines.push(l);
    else feeLines.push(l);
  }
  const keptFees = lines.reduce((s, l) => s + Number(l.extracted_fee ?? 0), 0);
  const passThruExcluded = currency === "USD" ? Number((stmt as any)?.total_fees ?? 0) - keptFees : 0;

  // Effective rate/per-txn for a row. Rate defaults to the buy rate (lowest sellable rate);
  // per-txn defaults to 0p — buy-side per-txn is £0.00, so any reseller p/txn above zero is margin.
  const DEFAULT_PER_TXN_PENCE = 0;
  const effectiveFor = (l: Line) => {
    const buy = l.canonical_category_id ? buyRateByCat.get(l.canonical_category_id) : null;
    const rate = l.our_rate != null ? Number(l.our_rate) : buy?.percent_rate != null ? Number(buy.percent_rate) : null;
    const perTxn = l.our_per_txn != null ? Number(l.our_per_txn) : DEFAULT_PER_TXN_PENCE;
    return { rate, perTxn, buyRate: buy?.percent_rate != null ? Number(buy.percent_rate) : null };
  };

  // Computed our_fee for breakdown rows = (volume * effective rate%) + (txns * effective p/txn pence/100)
  const computeBreakdownOurFee = (l: Line) => {
    const vol = Number(l.txn_value ?? 0);
    const txns = Number(l.txn_count ?? 0);
    const { rate, perTxn } = effectiveFor(l);
    return (vol * Number(rate ?? 0)) / 100 + (txns * Number(perTxn ?? 0)) / 100;
  };

  // Buy-side cost for a breakdown row using mapped buy rate (percent + per_item pence).
  const computeBreakdownBuyFee = (l: Line) => {
    const buy = l.canonical_category_id ? buyRateByCat.get(l.canonical_category_id) : null;
    if (!buy) return 0;
    const vol = Number(l.txn_value ?? 0);
    const txns = Number(l.txn_count ?? 0);
    const pct = buy.percent_rate != null ? Number(buy.percent_rate) : 0;
    const perItem = (buy as any).per_item != null ? Number((buy as any).per_item) : 0;
    return (vol * pct) / 100 + (txns * perItem) / 100;
  };

  // Margin tone for the "Our % Rate" cell based on effective vs buy rate.
  const rateTone = (l: Line): "destructive" | "warning" | "success" | undefined => {
    const { rate, buyRate } = effectiveFor(l);
    if (rate == null || buyRate == null) return undefined;
    const diff = rate - buyRate;
    if (Math.abs(diff) < 0.0005) return "warning";
    return diff < 0 ? "destructive" : "success";
  };

  // Totals
  const totals = useMemo(() => {
    // Lines can repeat the same sales (e.g. several fee rows per card brand); never exceed the statement's printed total.
    const lineTurnover = breakdownLines.reduce((s, l) => s + Number(l.txn_value ?? 0), 0);
    const printed = Number((stmt as any)?.total_volume ?? 0);
    const turnover = printed > 0 && lineTurnover > printed * 1.01 ? printed : lineTurnover;
    const txns = breakdownLines.reduce((s, l) => s + Number(l.txn_count ?? 0), 0);
    const currentFees = lines.reduce((s, l) => s + Number(l.extracted_fee ?? 0), 0);
    const breakdownSell = breakdownLines.reduce((s, l) => s + computeBreakdownOurFee(l), 0);
    const breakdownBuy = breakdownLines.reduce((s, l) => s + computeBreakdownBuyFee(l), 0);
    const ourFees = breakdownSell + feeLines.reduce((s, l) => s + Number(l.our_fee ?? 0), 0);
    const saving = currentFees - ourFees;
    const netMargin = breakdownSell - breakdownBuy;
    return { turnover, txns, currentFees, ourFees, saving, netMargin, breakdownSell };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);


  const reductionPct = totals.currentFees > 0 ? (totals.saving / totals.currentFees) * 100 : 0;

  return (
    <>
      <Link to="/statements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="size-4" /> All analyses
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {(stmt as any)?.merchant?.name ?? (stmt as any)?.file_name ?? "Analysis"}
          </h1>
          {(stmt as any)?.acquirer && (
            <div className="text-sm text-muted-foreground mt-1">{(stmt as any).acquirer}</div>
          )}
          <Link to="/statements/$id" params={{ id }} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1">
            View raw extract →
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={reExtract} disabled={reExtracting}>
            {reExtracting ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
            Re-extract
          </Button>
          <Button size="sm" onClick={buildProposal} disabled={buildingProposal} className="bg-gradient-brand text-primary-foreground">
            {buildingProposal ? <Loader2 className="size-4 mr-1 animate-spin" /> : <FileText className="size-4 mr-1" />}
            Build Proposal
          </Button>
        </div>
      </div>

      {(stmt as any)?.status === "failed" && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Extraction failed</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {(stmt as any).error_message ?? "No details were recorded."} Fix the cause, then use Re-extract to try again.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Kpi icon={currency === "USD" ? <DollarSign className="size-4" /> : <PoundSterling className="size-4" />} tint="muted" label="Total Turnover" value={fmt(totals.turnover)} />
        <Kpi icon={<CreditCard className="size-4" />} tint="muted" label="Total Transactions" value={num(totals.txns)} />
        <Kpi icon={<Percent className="size-4" />} tint="muted" label="Current Monthly Fees" value={fmt(totals.currentFees)} />
        <Kpi
          icon={<DollarSign className="size-4" />}
          tint="primary"
          label="Net Margin"
          value={fmt(totals.netMargin)}
          sub={`${totals.breakdownSell > 0 ? ((totals.netMargin / totals.breakdownSell) * 100).toFixed(1) : "0"}% of sell`}

        />
        <Kpi
          icon={<TrendingDown className="size-4" />}
          tint="success"
          label="Est. Monthly Saving"
          value={fmt(totals.saving)}
          sub={`${reductionPct.toFixed(1)}% reduction`}
        />
        {(() => {
          const bps = totals.turnover > 0 ? (totals.netMargin / totals.turnover) * 10000 : 0;
          const tone = bps >= BPS_GREEN_FROM ? "text-success" : bps >= BPS_AMBER_FROM ? "text-warning-foreground" : "text-destructive";
          return (
            <Kpi
              icon={<Gauge className="size-4" />}
              tint="muted"
              label="BPS"
              value={`${bps.toFixed(1)} bps`}
              sub={`Target ${BPS_TARGET} bps`}
              valueClassName={tone}
            />
          );
        })()}
      </div>

      {/* Empty state */}
      {lines.length === 0 && (
        <div className="rounded-2xl border bg-card p-12 text-center mb-6">
          <div className="text-sm text-muted-foreground mb-3">No fee lines extracted yet.</div>
          <Button onClick={seedDemo} disabled={seeding} variant="outline">
            {seeding ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
            Load sample data
          </Button>
        </div>
      )}

      {/* Card Type Breakdown */}
      {breakdownLines.length > 0 && (
        <section className="rounded-2xl border bg-card shadow-soft mb-6">
          <header className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold">Card Type Breakdown</h2>
            <span className="text-xs text-muted-foreground">Click any rate to edit it</span>
          </header>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Card Type</th>
                <th className="px-4 py-3 font-medium text-right">Turnover</th>
                <th className="px-4 py-3 font-medium text-right">Transactions</th>
                <th className="px-4 py-3 font-medium text-right">Current %</th>
                <th className="px-4 py-3 font-medium text-right">Current Fee</th>
                <th className="px-4 py-3 font-medium text-right">Our % Rate</th>
                <th className="px-4 py-3 font-medium text-right">Our p/txn</th>
                <th className="px-4 py-3 font-medium text-right">Our Fee</th>
                <th className="px-4 py-3 font-medium text-right">Saving</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {breakdownLines.map((l) => {
                const ourFee = computeBreakdownOurFee(l);
                const saving = Number(l.extracted_fee ?? 0) - ourFee;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-medium capitalize">{prettifyCardType(l.raw_description)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(l.txn_value)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{num(l.txn_count)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {Number(l.raw_rate ?? 0).toFixed(3)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(l.extracted_fee)}</td>
                    <CellNumeric
                      value={l.our_rate}
                      defaultValue={effectiveFor(l).rate}
                      tone={rateTone(l)}
                      suffix="%"
                      step={0.001}
                      onCommit={(v) => updateLine.mutate({ lineId: l.id, patch: { our_rate: v } })}
                    />
                    <CellNumeric
                      value={l.our_per_txn}
                      defaultValue={effectiveFor(l).perTxn}
                      suffix="p"
                      step={0.1}
                      onCommit={(v) => updateLine.mutate({ lineId: l.id, patch: { our_per_txn: v } })}
                    />

                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(ourFee)}</td>
                    <SavingCell value={saving} currency={currency} />
                  </tr>
                );
              })}
              <tr className="bg-muted/30 font-semibold">
                <td className="px-4 py-3">Totals</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(breakdownLines.reduce((s, l) => s + Number(l.txn_value ?? 0), 0))}</td>
                <td className="px-4 py-3 text-right tabular-nums">{num(breakdownLines.reduce((s, l) => s + Number(l.txn_count ?? 0), 0))}</td>
                <td />
                <td className="px-4 py-3 text-right tabular-nums">{fmt(breakdownLines.reduce((s, l) => s + Number(l.extracted_fee ?? 0), 0))}</td>
                <td /><td />
                <td className="px-4 py-3 text-right tabular-nums">{fmt(breakdownLines.reduce((s, l) => s + computeBreakdownOurFee(l), 0))}</td>
                <SavingCell value={breakdownLines.reduce((s, l) => s + (Number(l.extracted_fee ?? 0) - computeBreakdownOurFee(l)), 0)} bold currency={currency} />
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Card Transaction Fees */}
      {feeLines.length > 0 && (
        <section className="rounded-2xl border bg-card shadow-soft mb-6">
          <header className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h2 className="font-semibold">Card Transaction Fees</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Additional service &amp; transaction charges — click any rate to edit</p>
            </div>
            <Button variant="ghost" size="sm" onClick={addManualFee}>
              <Plus className="size-4 mr-1" /> Add fee
            </Button>
          </header>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Fee Name</th>
                <th className="px-4 py-3 font-medium text-right">Quantity</th>
                <th className="px-4 py-3 font-medium text-right">Unit Cost</th>
                <th className="px-4 py-3 font-medium text-right">Current Fee</th>
                <th className="px-4 py-3 font-medium text-right">Our p/txn</th>
                <th className="px-4 py-3 font-medium text-right">Our Fee</th>
                <th className="px-4 py-3 font-medium text-right">Saving</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {feeLines.map((l) => {
                const isAuth = !!(l.fee_category_id && authFeeCategoryIds.has(l.fee_category_id));
                const effPerTxn = l.our_per_txn != null ? Number(l.our_per_txn) : isAuth ? 2.5 : null;
                const effOurFee = l.our_fee != null
                  ? Number(l.our_fee)
                  : isAuth && l.txn_count ? Number(l.txn_count) * 0.025 : null;
                const saving = Number(l.extracted_fee ?? 0) - Number(effOurFee ?? 0);
                const unitCost = l.txn_count && l.txn_count > 0 && l.extracted_fee
                  ? Number(l.extracted_fee) / Number(l.txn_count)
                  : null;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3">
                      <InlineText
                        value={l.raw_description}
                        onCommit={(v) => updateLine.mutate({ lineId: l.id, patch: { raw_description: v } })}
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{l.txn_count ? num(l.txn_count) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{unitCost ? `${currencySymbol(currency)}${unitCost.toFixed(4)}` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(l.extracted_fee)}</td>
                    <CellNumeric
                      value={l.our_per_txn}
                      defaultValue={effPerTxn}
                      suffix="p"
                      step={0.001}
                      onCommit={(v) => updateLine.mutate({ lineId: l.id, patch: { our_per_txn: v } })}
                    />
                    <CellNumeric
                      value={l.our_fee}
                      defaultValue={effOurFee}
                      prefix={currencySymbol(currency)}
                      step={0.01}
                      onCommit={(v) => updateLine.mutate({ lineId: l.id, patch: { our_fee: v } })}
                    />
                    <SavingCell value={saving} currency={currency} />
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteLine.mutate(l.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Delete row"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(() => {
                const feeTotals = feeLines.reduce(
                  (acc, l) => {
                    const isAuth = !!(l.fee_category_id && authFeeCategoryIds.has(l.fee_category_id));
                    const effOurFee = l.our_fee != null
                      ? Number(l.our_fee)
                      : isAuth && l.txn_count ? Number(l.txn_count) * 0.025 : 0;
                    acc.current += Number(l.extracted_fee ?? 0);
                    acc.our += effOurFee;
                    return acc;
                  },
                  { current: 0, our: 0 },
                );
                return (
                  <tr className="bg-muted/30 font-semibold">
                    <td className="px-4 py-3">Totals</td>
                    <td /><td /><td className="px-4 py-3 text-right tabular-nums">{fmt(feeTotals.current)}</td>
                    <td />
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(feeTotals.our)}</td>
                    <SavingCell value={feeTotals.current - feeTotals.our} bold currency={currency} />
                    <td />
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </section>
      )}

      {passThruExcluded > 0.005 && (
        <p className="-mt-4 mb-6 text-sm text-muted-foreground">
          Pass-through interchange &amp; network fees excluded: <span className="font-medium text-foreground tabular-nums">{fmt(passThruExcluded)}</span>
          {" "}(statement total {fmt(Number((stmt as any)?.total_fees ?? 0))}).
        </p>
      )}

      {/* Reseller Notes */}
      <section className="rounded-2xl border bg-card shadow-soft p-5 mb-10">
        <h2 className="font-semibold mb-1">Reseller Notes</h2>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this merchant or offer..."
          className="min-h-[100px] resize-y"
        />
      </section>
    </>
  );
}

function Kpi({
  icon, label, value, sub, tint, valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tint: "muted" | "primary" | "success";
  valueClassName?: string;
}) {
  const tintClass = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
  }[tint];
  const valueClass = {
    muted: "",
    primary: "text-primary",
    success: "text-success",
  }[tint];
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <div className={cn("size-8 rounded-lg grid place-items-center mb-3", tintClass)}>{icon}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold tabular-nums mt-0.5", valueClass, valueClassName)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function CellNumeric({
  value, onCommit, suffix, prefix, step = 0.01, defaultValue, tone,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  suffix?: string;
  prefix?: string;
  step?: number;
  defaultValue?: number | null;
  tone?: "destructive" | "warning" | "success";
}) {
  const effective = value != null ? value : defaultValue != null ? defaultValue : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(effective == null ? "" : String(effective));
  useEffect(() => { setDraft(effective == null ? "" : String(effective)); }, [effective]);

  if (editing) {
    return (
      <td className="px-2 py-1 text-right">
        <Input
          autoFocus
          type="number"
          step={step}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            const n = draft === "" ? null : Number(draft);
            if (n !== value) onCommit(n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setDraft(effective == null ? "" : String(effective)); setEditing(false); }
          }}
          className="h-8 text-right text-sm tabular-nums"
        />
      </td>
    );
  }
  const toneClass = tone === "destructive"
    ? "text-destructive"
    : tone === "warning"
      ? "text-warning-foreground"
      : tone === "success"
        ? "text-success"
        : "text-primary";
  const display = effective == null
    ? <span className="text-muted-foreground">—</span>
    : <>{prefix}{Number(effective).toFixed(3)}{suffix}</>;
  return (
    <td
      onClick={() => setEditing(true)}
      className={cn(
        "px-4 py-3 text-right tabular-nums cursor-pointer hover:bg-accent/40 font-medium",
        toneClass,
      )}
    >
      {display}
    </td>
  );
}


function InlineText({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onCommit(draft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="h-8 text-sm"
      />
    );
  }
  return (
    <span onClick={() => setEditing(true)} className="cursor-pointer hover:underline">
      {value}
    </span>
  );
}

function SavingCell({ value, bold, currency }: { value: number; bold?: boolean; currency?: string }) {
  const positive = value >= 0;
  return (
    <td className={cn(
      "px-4 py-3 text-right tabular-nums",
      bold && "font-semibold",
      positive ? "text-success" : "text-destructive",
    )}>
      {positive ? "+" : ""}{moneyPrecise(value, currency)}
    </td>
  );
}
