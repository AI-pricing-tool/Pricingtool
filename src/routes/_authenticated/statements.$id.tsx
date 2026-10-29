import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, num, pct } from "@/lib/format";
import { detectCurrency } from "@/lib/interchange-plus";
import { suggestCategory, type CanonicalCategory } from "@/lib/mapping-engine";
import { toast } from "sonner";
import { CheckCheck, Sparkles, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/statements/$id")({
  head: () => ({ meta: [
    { title: "Statement Mapping Review | Pricing Tool" },
    { name: "description", content: "Review extracted statement lines and their card category mappings in Pricing Tool." },
    { property: "og:title", content: "Statement Mapping Review | Pricing Tool" },
    { property: "og:description", content: "Review extracted statement lines and their card category mappings in Pricing Tool." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: StatementReview,
});

interface Line {
  id: string;
  raw_description: string;
  acquirer: string | null;
  txn_count: number | null;
  txn_value: number | null;
  raw_rate: number | null;
  extracted_fee: number | null;
  canonical_category_id: string | null;
  confidence: number | null;
  status: "unmapped" | "suggested" | "approved" | "manual";
}

function StatementReview() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [demoSeeded, setDemoSeeded] = useState(false);

  const { data: stmt } = useQuery({
    queryKey: ["stmt", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("statements").select("*, merchant:merchant_id(name)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });


  const { data: categories = [] } = useQuery({
    queryKey: ["canonical"],
    queryFn: async () => {
      const { data } = await supabase.from("canonical_categories").select("id, code, label, scheme, funding, card_category, region").order("sort_order");
      return (data ?? []) as CanonicalCategory[];
    },
  });

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["lines", id],
    queryFn: async () => {
      const { data } = await supabase.from("statement_lines").select("*").eq("statement_id", id).order("created_at");
      return (data ?? []) as Line[];
    },
  });

  // Auto-seed sample lines once if empty (demo aid)
  async function seedDemo() {
    if (!stmt) return;
    setDemoSeeded(true);
    const samples = [
      { raw_description: "VS DBChip", txn_count: 1240, txn_value: 38420, raw_rate: 0.31, extracted_fee: 119.10 },
      { raw_description: "V-UK CONTACTLESS DB", txn_count: 980, txn_value: 21560, raw_rate: 0.29, extracted_fee: 62.52 },
      { raw_description: "MC DEBIT DOMESTIC", txn_count: 760, txn_value: 19280, raw_rate: 0.32, extracted_fee: 61.69 },
      { raw_description: "MC Comcd", txn_count: 88, txn_value: 7240, raw_rate: 1.85, extracted_fee: 133.94 },
      { raw_description: "Visa Debit Per", txn_count: 305, txn_value: 9120, raw_rate: 0.30, extracted_fee: 27.36 },
      { raw_description: "AUTH FEE", txn_count: 3373, txn_value: 0, raw_rate: null, extracted_fee: 67.46 },
      { raw_description: "PCI MONTHLY", txn_count: 1, txn_value: 0, raw_rate: null, extracted_fee: 14.95 },
    ];
    const rows = samples.map((s) => ({
      ...s,
      statement_id: id,
      organisation_id: (stmt as any).organisation_id,
      acquirer: (stmt as any).acquirer,
      status: "unmapped" as const,
    }));
    const { error } = await supabase.from("statement_lines").insert(rows);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["lines", id] });
  }

  const currency = detectCurrency((stmt as any)?.currency === "USD" ? "USD" : null, [(stmt as any)?.file_name, ...lines.map((l) => l.raw_description)].filter(Boolean).join("\n"));
  const fmt = (n: number | null | undefined) => money(n, currency);

  const updateLine = useMutation({
    mutationFn: async ({ lineId, patch }: { lineId: string; patch: Partial<Line> }) => {
      const { error } = await supabase.from("statement_lines").update(patch).eq("id", lineId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lines", id] }),
  });

  const runSuggestions = async () => {
    if (!lines.length || !categories.length) return;
    const updates: Promise<unknown>[] = [];
    for (const line of lines) {
      if (line.canonical_category_id) continue;
      const s = suggestCategory(line.raw_description, categories, line.acquirer ?? stmt?.acquirer);
      if (s) {
        updates.push(
          Promise.resolve(
            supabase.from("statement_lines").update({
              canonical_category_id: s.category.id,
              confidence: s.confidence,
              status: "suggested",
            }).eq("id", line.id)
          ),
        );
      }
    }
    await Promise.all(updates);
    qc.invalidateQueries({ queryKey: ["lines", id] });
    toast.success(`Mapped ${updates.length} lines`);
  };

  const approveAll = async () => {
    const ids = lines.filter((l) => l.canonical_category_id && l.status !== "approved").map((l) => l.id);
    if (!ids.length) return;
    const { error } = await supabase.from("statement_lines").update({ status: "approved" }).in("id", ids);
    if (error) toast.error(error.message); else { toast.success(`Approved ${ids.length} lines`); qc.invalidateQueries({ queryKey: ["lines", id] }); }
  };

  const totals = useMemo(() => {
    const vol = lines.reduce((s, l) => s + Number(l.txn_value ?? 0), 0);
    const fees = lines.reduce((s, l) => s + Number(l.extracted_fee ?? 0), 0);
    const txns = lines.reduce((s, l) => s + Number(l.txn_count ?? 0), 0);
    return { vol, fees, txns };
  }, [lines]);

  return (
    <>
      <Link to="/statements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="size-4" /> Back to statements</Link>
      <PageHeader
        title={(stmt as any)?.file_name ?? "Statement"}
        description={`${(stmt as any)?.acquirer ?? "—"} · ${(stmt as any)?.merchant?.name ?? "Unassigned merchant"}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={runSuggestions}><Sparkles className="size-4 mr-1" /> Auto-map</Button>
            <Button onClick={approveAll} className="bg-gradient-brand text-primary-foreground"><CheckCheck className="size-4 mr-1" /> Approve all</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Stat label="Total volume" value={fmt(totals.vol)} />
        <Stat label="Total fees" value={fmt(totals.fees)} />
        <Stat label="Transactions" value={num(totals.txns)} />
        <Stat label="Effective rate" value={pct(totals.vol ? (totals.fees / totals.vol) * 100 : 0)} />
      </div>

      <div className="rounded-2xl border bg-card shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-3 font-medium">Raw description</th>
              <th className="px-3 py-3 font-medium text-right">Txns</th>
              <th className="px-3 py-3 font-medium text-right">Value</th>
              <th className="px-3 py-3 font-medium text-right">Rate</th>
              <th className="px-3 py-3 font-medium text-right">Fee</th>
              <th className="px-3 py-3 font-medium">Canonical category</th>
              <th className="px-3 py-3 font-medium">Confidence</th>
              <th className="px-3 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && lines.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                No line items extracted yet.{" "}
                <button onClick={seedDemo} disabled={demoSeeded} className="text-primary hover:underline">Load sample data</button>
              </td></tr>
            )}
            {lines.map((line) => {
              const conf = Number(line.confidence ?? 0);
              const confTone = conf > 0.8 ? "text-success" : conf > 0.5 ? "text-warning-foreground" : "text-destructive";
              return (
                <tr key={line.id} className="hover:bg-accent/30">
                  <td className="px-3 py-2 font-mono text-xs">{line.raw_description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(line.txn_count)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(line.txn_value)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.raw_rate ? `${line.raw_rate}%` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(line.extracted_fee)}</td>
                  <td className="px-3 py-2 min-w-[220px]">
                    <Select
                      value={line.canonical_category_id ?? ""}
                      onValueChange={(v) => updateLine.mutate({ lineId: line.id, patch: { canonical_category_id: v, status: "manual", confidence: 1.0 } })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unmapped" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className={cn("px-3 py-2 text-xs tabular-nums font-medium", confTone)}>
                    {line.confidence ? `${(conf * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={line.status === "approved" ? "default" : line.status === "manual" ? "secondary" : "outline"} className="capitalize text-xs">
                      {line.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

void Input;
