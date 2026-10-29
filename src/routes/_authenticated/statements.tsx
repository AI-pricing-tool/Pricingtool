import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Archive, ArchiveRestore } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { gbp, num, shortDate } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/statements")({
  component: StatementsPage,
});

function StatementsPage() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["statements-list", showArchived],
    queryFn: async () => {
      let q = supabase
        .from("statements")
        .select("id, file_name, acquirer, status, error_message, period_start, period_end, total_volume, total_fees, confidence_score, created_at, archived_at, uploaded_by, merchant:merchant_id(name)")
        .order("created_at", { ascending: false });
      if (!showArchived) q = q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r: any) => r.uploaded_by).filter(Boolean)));
      let profMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids as string[]);
        profMap = new Map((profs ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
      }
      return rows.map((r: any) => ({ ...r, uploader: r.uploaded_by ? profMap.get(r.uploaded_by) ?? null : null }));
    },
  });

  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("statements")
        .update({ archived_at: archived ? new Date().toISOString() : null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.archived ? "Statement archived" : "Statement restored");
      qc.invalidateQueries({ queryKey: ["statements-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Statements"
        description="All uploaded merchant statements."
        actions={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="show-archived" className="text-sm cursor-pointer">Show archived</Label>
            </div>
            <Button asChild className="bg-gradient-brand text-primary-foreground"><Link to="/upload"><Upload className="size-4 mr-1" /> Upload</Link></Button>
          </div>
        }
      />

      <div className="rounded-2xl border bg-card shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Statement</th>
              <th className="px-4 py-3 font-medium">Acquirer</th>
              <th className="px-4 py-3 font-medium">Merchant</th>
              {isSuperAdmin && <th className="px-4 py-3 font-medium">Created by</th>}
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium text-right">Volume</th>
              <th className="px-4 py-3 font-medium text-right">Fees</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={isSuperAdmin ? 10 : 9} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && (data ?? []).length === 0 && (
              <tr><td colSpan={isSuperAdmin ? 10 : 9} className="px-4 py-12 text-center text-muted-foreground">No statements yet — <Link to="/upload" className="text-primary hover:underline">upload one</Link>.</td></tr>
            )}
            {(data ?? []).map((s: any) => {
              const archived = !!s.archived_at;
              return (
                <tr key={s.id} className={`hover:bg-accent/40 transition-colors ${archived ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3">
                    <Link to="/analyses/$id" params={{ id: s.id }} className="flex items-center gap-2 font-medium hover:text-primary">
                      <FileText className="size-4 text-muted-foreground" />
                      {s.file_name ?? "Statement"}
                      {archived && <Badge variant="outline" className="ml-1">Archived</Badge>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.acquirer ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.merchant?.name ?? "—"}</td>
                  {isSuperAdmin && <td className="px-4 py-3 text-muted-foreground">{s.uploader?.full_name ?? s.uploader?.email ?? "—"}</td>}
                  <td className="px-4 py-3 text-muted-foreground">{shortDate(s.period_start)} – {shortDate(s.period_end)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{gbp(s.total_volume)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{gbp(s.total_fees)}</td>
                  <td className="px-4 py-3">{s.confidence_score ? `${(Number(s.confidence_score) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="px-4 py-3"><Badge variant={s.status === "failed" ? "destructive" : "secondary"} className="capitalize" title={s.error_message ?? undefined}>{s.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setArchived.mutate({ id: s.id, archived: !archived })}
                      disabled={setArchived.isPending}
                    >
                      {archived ? <><ArchiveRestore className="size-4 mr-1" /> Restore</> : <><Archive className="size-4 mr-1" /> Archive</>}
                    </Button>
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

void num;
