import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { gbp, num } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

const STAGES = ["creating_proposal","proposed","contract_sent","contract_signed","onboarding","implementation","live","lost"] as const;

export const Route = createFileRoute("/_authenticated/merchants")({
  component: MerchantsPage,
});

function MerchantsPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [form, setForm] = useState({ name: "", acquirer: "", industry: "", monthly_volume: "" });

  const { data: merchants = [] } = useQuery({
    queryKey: ["merchants"],
    queryFn: async () => {
      const { data: m } = await supabase
        .from("merchants")
        .select("*")
        .order("created_at", { ascending: false });
      const list = (m ?? []) as any[];
      const ids = list.map((x) => x.id);
      const userIds = [...new Set(list.map((x) => x.created_by).filter(Boolean))] as string[];

      const [stmtsRes, profsRes] = await Promise.all([
        ids.length
          ? supabase
              .from("statements")
              .select("id, merchant_id, created_at")
              .in("merchant_id", ids)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // latest statement per merchant
      const latestStmt = new Map<string, string>();
      for (const s of (stmtsRes.data ?? []) as any[]) {
        if (!latestStmt.has(s.merchant_id)) latestStmt.set(s.merchant_id, s.id);
      }
      const stmtIds = [...latestStmt.values()];

      const turnoverByStmt = new Map<string, number>();
      if (stmtIds.length) {
        const { data: lines } = await supabase
          .from("statement_lines")
          .select("statement_id, txn_value, raw_description, canonical_category:canonical_category_id(scheme)")
          .in("statement_id", stmtIds);
        const cardSchemes = new Set(["visa", "mastercard", "maestro"]);
        for (const l of (lines ?? []) as any[]) {
          const scheme = l.canonical_category?.scheme as string | undefined;
          const raw = (l.raw_description ?? "").trim().toLowerCase();
          const isCard = (scheme && cardSchemes.has(scheme)) || cardSchemes.has(raw);
          if (!isCard) continue;
          turnoverByStmt.set(l.statement_id, (turnoverByStmt.get(l.statement_id) ?? 0) + Number(l.txn_value ?? 0));
        }
      }

      const profById = new Map<string, any>(((profsRes.data ?? []) as any[]).map((p) => [p.id, p]));

      return list.map((x) => {
        const sid = latestStmt.get(x.id);
        const cardTurnover = sid ? turnoverByStmt.get(sid) ?? null : null;
        const reseller = x.created_by ? profById.get(x.created_by) : null;
        return { ...x, _cardTurnover: cardTurnover, _reseller: reseller };
      });
    },
  });


  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from("merchants").update({ stage: stage as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["merchants"] }),
  });

  async function createMerchant() {
    if (!profile?.organisation_id) return toast.error("Your account is not linked to an organisation yet.");
    const { error } = await supabase.from("merchants").insert({
      name: form.name,
      acquirer: form.acquirer || null,
      industry: form.industry || null,
      monthly_volume: form.monthly_volume ? Number(form.monthly_volume) : null,
      organisation_id: profile.organisation_id,
    });
    if (error) return toast.error(error.message);
    toast.success("Merchant created");
    setOpen(false);
    setForm({ name: "", acquirer: "", industry: "", monthly_volume: "" });
    qc.invalidateQueries({ queryKey: ["merchants"] });
  }

  return (
    <>
      <PageHeader
        title="Merchants"
        description="Your pipeline of analysed merchants."
        actions={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input id="show-lost" type="checkbox" className="size-4 cursor-pointer" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} />
              <Label htmlFor="show-lost" className="text-sm cursor-pointer">Show lost</Label>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button className="bg-gradient-brand text-primary-foreground"><Plus className="size-4 mr-1" /> Add merchant</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New merchant</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>Current acquirer</Label><Input value={form.acquirer} onChange={(e) => setForm({ ...form, acquirer: e.target.value })} /></div>
                  <div><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
                  <div><Label>Monthly volume (£)</Label><Input type="number" value={form.monthly_volume} onChange={(e) => setForm({ ...form, monthly_volume: e.target.value })} /></div>
                  <Button onClick={createMerchant} disabled={!form.name} className="w-full bg-gradient-brand text-primary-foreground">Create</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(() => {
          const visible = merchants.filter((m: any) => showLost ? true : m.stage !== "lost");
          if (visible.length === 0) return (
            <div className="col-span-full rounded-2xl border-dashed border-2 p-12 text-center text-muted-foreground">
              <Users className="size-8 mx-auto mb-2 opacity-50" />
              No merchants yet
            </div>
          );
          return visible.map((m: any) => (
          <div key={m.id} className={`rounded-2xl border bg-card p-5 shadow-soft hover:shadow-elevated transition-shadow ${m.stage === "lost" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.acquirer ?? "No acquirer"} · {m.industry ?? "—"}</div>
              </div>
              <Badge variant="outline" className="capitalize">{String(m.stage).replace(/_/g, " ")}</Badge>
            </div>
            <div className="mt-4 text-sm">
              <span className="text-muted-foreground">Monthly card turnover</span>{" "}
              <span className="font-medium tabular-nums">
                {m._cardTurnover != null ? gbp(m._cardTurnover) : m.monthly_volume != null ? gbp(m.monthly_volume) : "—"}
              </span>
            </div>
            <div className="mt-2 text-xs">
              <span className="text-muted-foreground">Reseller</span>{" "}
              <span className="font-medium">
                {m._reseller?.full_name ?? m._reseller?.email ?? (m.created_by ? "Unknown user" : "—")}
              </span>
              {m.created_by && (
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5 break-all">{m.created_by}</div>
              )}
            </div>

            <div className="mt-4">
              <Label className="text-xs text-muted-foreground">Stage</Label>
              <Select value={m.stage} onValueChange={(v) => updateStage.mutate({ id: m.id, stage: v })}>
                <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        ));
        })()}
      </div>
    </>
  );
}

void num;
