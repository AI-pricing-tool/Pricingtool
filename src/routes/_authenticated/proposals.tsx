import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { gbp, shortDate } from "@/lib/format";
import { Download, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/proposals")({
  component: ProposalsPage,
});

function ProposalsPage() {
  const { isSuperAdmin } = useAuth();
  const { data = [] } = useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("proposals")
        .select("*, merchant:merchant_id(name)")
        .neq("status", "archived")
        .order("created_at", { ascending: false });
      const list = rows ?? [];
      const ids = Array.from(new Set(list.map((r: any) => r.created_by).filter(Boolean)));
      let profMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids as string[]);
        profMap = new Map((profs ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
      }
      return list.map((r: any) => ({ ...r, creator: r.created_by ? profMap.get(r.created_by) ?? null : null }));
    },
  });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function download(p: any) {
    if (!p.file_path) {
      toast.error("No document attached to this proposal");
      return;
    }
    setDownloadingId(p.id);
    try {
      const { data, error } = await supabase.storage
        .from("proposals")
        .createSignedUrl(p.file_path, 60);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? "Failed to get download URL");
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = p.file_path.split("/").pop() ?? "proposal.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Proposals"
        description="Branded merchant proposals with savings analysis."
        actions={
          <Button className="bg-gradient-brand text-primary-foreground">
            <FileSignature className="size-4 mr-1" /> New proposal
          </Button>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.length === 0 && (
          <div className="col-span-full rounded-2xl border-dashed border-2 p-12 text-center text-muted-foreground">
            No proposals yet. Generate one from a reviewed statement.
          </div>
        )}
        {data.map((p: any) => (
          <div
            key={p.id}
            className="rounded-2xl border bg-card p-5 shadow-soft hover:shadow-elevated transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{p.title}</div>
                <div className="text-xs text-muted-foreground">{p.merchant?.name ?? "—"}</div>
                {isSuperAdmin && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">By {p.creator?.full_name ?? p.creator?.email ?? "—"}</div>
                )}
              </div>
              <Badge variant="outline" className="capitalize">
                {p.status}
              </Badge>
            </div>
            <div className="mt-4 space-y-1 text-sm">
              <Row label="Monthly saving" value={gbp(p.estimated_monthly_saving)} />
              <Row label="Annual saving" value={gbp(p.estimated_annual_saving)} />
              <Row label="Our monthly fees" value={gbp(p.estimated_reseller_revenue)} />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{shortDate(p.created_at)}</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(p)}
                disabled={!p.file_path || downloadingId === p.id}
              >
                {downloadingId === p.id ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="size-3.5 mr-1" />
                )}
                {p.file_path ? "Word doc" : "No file"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
