import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dictionary")({
  component: DictionaryPage,
});

function DictionaryPage() {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["dictionary", q],
    queryFn: async () => {
      let req = supabase
        .from("mapping_dictionary")
        .select("id, acquirer, raw_description, confidence, usage_count, verified_at, source, canonical_category:canonical_category_id(code, label)")
        .order("usage_count", { ascending: false })
        .limit(200);
      if (q) req = req.ilike("raw_description", `%${q}%`);
      const { data } = await req;
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader title="Mapping dictionary" description="Statement descriptions mapped to standard categories." />

      <div className="rounded-2xl border bg-card shadow-soft overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search raw descriptions…" className="border-0 focus-visible:ring-0 shadow-none" />
          <Badge variant="secondary" className="ml-auto">{data.length} entries</Badge>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Acquirer</th>
              <th className="px-4 py-2 font-medium">Raw description</th>
              <th className="px-4 py-2 font-medium">Standard category</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium text-right">Usage</th>
              <th className="px-4 py-2 font-medium text-right">Confidence</th>
              <th className="px-4 py-2 font-medium">Verified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {data.map((d: any) => (
              <tr key={d.id}>
                <td className="px-4 py-2 text-muted-foreground">{d.acquirer}</td>
                <td className="px-4 py-2 font-mono text-xs">{d.raw_description}</td>
                <td className="px-4 py-2">{d.canonical_category?.label ?? "—"}</td>
                <td className="px-4 py-2"><Badge variant="outline" className="text-[10px] capitalize">{d.source}</Badge></td>
                <td className="px-4 py-2 text-right tabular-nums">{d.usage_count}</td>
                <td className="px-4 py-2 text-right tabular-nums">{(Number(d.confidence) * 100).toFixed(0)}%</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{shortDate(d.verified_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
