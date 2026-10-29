import { createFileRoute } from "@tanstack/react-router";
import { SelectBrandNotice } from "@/components/forecasting/SelectBrandNotice";
import { useApp } from "@/lib/forecasting/app-store";
import { RESELLERS, formatMoney, formatCommission, formatBps } from "@/lib/forecasting/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge, Kpi } from "@/components/forecasting/Kpi";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ForecastPageHeader } from "@/components/forecasting/PageHeader";

export const Route = createFileRoute("/_authenticated/forecasting/actions")({
  head: () => ({ meta: [{ title: "Growth actions · Payment Forecasting" }] }),
  component: Actions,
});

const TYPES = ["Merchant onboarding", "Dormant reactivation", "Pricing review", "Sector campaign", "Sales training", "Referral campaign"];

function Actions() {
  const { activeResellerId, isAllResellers, actions, addAction, updateAction, user } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", type: TYPES[0], owner: user?.name ?? "", due: "", monthlyUplift: 10, notes: "", status: "planned" as const });

  if (!activeResellerId) return null;
  if (isAllResellers) return <SelectBrandNotice page="Growth actions" />;
  const reseller = RESELLERS.find(r => r.id === activeResellerId)!;
  const list = actions.filter(a => a.resellerId === activeResellerId);

  const totalUplift = list.filter(a => a.status !== "blocked").reduce((s, a) => s + a.monthlyUplift, 0);
  const committed = list.filter(a => a.status === "in_progress" || a.status === "done").reduce((s, a) => s + a.monthlyUplift, 0);
  const commissionUplift = totalUplift * reseller.bps / 10000;
  const committedComm = committed * reseller.bps / 10000;

  const submit = () => {
    if (!draft.title.trim()) return toast.error("Title required");
    addAction({ ...draft, resellerId: activeResellerId });
    setDraft({ title: "", type: TYPES[0], owner: user?.name ?? "", due: "", monthlyUplift: 10, notes: "", status: "planned" });
    setOpen(false);
    toast.success("Action added");
  };

  return (
    <div>
      <ForecastPageHeader title="Growth actions" subtitle={`${reseller.name} · close the forecast gap with planned initiatives`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Open actions" value={list.length} hint={`@ ${formatBps(reseller.bps)}`} />
        <Kpi label="Monthly value uplift" value={formatMoney(totalUplift)} hint={`Commission ${formatCommission(commissionUplift)}`} tone="primary" />
        <Kpi label="Committed uplift" value={formatMoney(committed)} hint={`Commission ${formatCommission(committedComm)}`} tone="success" />
        <Kpi label="Annualised opportunity" value={formatMoney(totalUplift * 12)} hint={`Commission ${formatCommission(commissionUplift * 12)}`} />
      </div>

      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 className="font-semibold">Action plan</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New action</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New growth action</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Type</Label>
                  <Select value={draft.type} onValueChange={v => setDraft({ ...draft, type: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Owner</Label><Input value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })} /></div>
                <div><Label>Due date</Label><Input type="date" value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })} /></div>
                <div><Label>Expected monthly uplift (£k)</Label><Input type="number" value={draft.monthlyUplift} onChange={e => setDraft({ ...draft, monthlyUplift: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div><Label>Notes</Label><Textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Add action</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {list.length === 0 && <div className="text-sm text-muted-foreground bg-card border rounded-xl p-6 text-center col-span-full">No actions yet. Add one to close the gap to Platform forecast.</div>}
        {list.map(a => (
          <div key={a.id} className="bg-card border rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{a.type}</div>
                <h3 className="font-semibold mt-1">{a.title}</h3>
              </div>
              <StatusBadge tone={a.status === "done" ? "success" : a.status === "in_progress" ? "info" : a.status === "blocked" ? "destructive" : "muted"}>
                {a.status.replace("_", " ")}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{a.notes}</p>
            <div className="grid grid-cols-4 gap-3 mt-4 text-sm">
              <div><div className="text-xs text-muted-foreground">Owner</div><div className="font-medium">{a.owner}</div></div>
              <div><div className="text-xs text-muted-foreground">Due</div><div className="font-medium">{a.due || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Value / mo</div><div className="font-medium text-success">{formatMoney(a.monthlyUplift)}</div></div>
              <div><div className="text-xs text-muted-foreground">Commission / mo</div><div className="font-medium text-primary">{formatCommission(a.monthlyUplift * reseller.bps / 10000)}</div></div>
            </div>
            <div className="mt-4">
              <Select value={a.status} onValueChange={(v) => updateAction(a.id, { status: v as never })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
