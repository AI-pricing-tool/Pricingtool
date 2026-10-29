import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users, TrendingUp, FileCheck2, Banknote, ArrowUpRight, Upload, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { gbp, num, shortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [{ count: merchantCount }, { count: stmtCount }, { data: recent }, { data: proposals }] = await Promise.all([
        supabase.from("merchants").select("*", { count: "exact", head: true }),
        supabase.from("statements").select("*", { count: "exact", head: true }),
        supabase.from("statements").select("id, file_name, acquirer, status, created_at, total_volume").order("created_at", { ascending: false }).limit(6),
        supabase.from("proposals").select("estimated_monthly_saving, estimated_reseller_revenue"),
      ]);
      const monthlySavings = (proposals ?? []).reduce((s, p: any) => s + Number(p.estimated_monthly_saving ?? 0), 0);
      const revenue = (proposals ?? []).reduce((s, p: any) => s + Number(p.estimated_reseller_revenue ?? 0), 0);
      return { merchantCount: merchantCount ?? 0, stmtCount: stmtCount ?? 0, recent: recent ?? [], monthlySavings, revenue };
    },
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your reseller activity at a glance."
        actions={
          <Button asChild className="bg-gradient-brand text-primary-foreground shadow-elevated">
            <Link to="/upload"><Upload className="size-4 mr-1" /> Upload statement</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TODO (template): placeholder value — replace with a real figure or remove this element. */}
        <StatCard index={0} icon={Users} label="Merchants analysed" value={num(data?.merchantCount)} delta={{ value: "12% this month", positive: true }} />
        <StatCard index={1} icon={TrendingUp} label="Est. monthly savings" value={gbp(data?.monthlySavings)} delta={{ value: "8.4%", positive: true }} accent="success" />
        <StatCard index={2} icon={Banknote} label="Reseller revenue" value={gbp(data?.revenue)} accent="warning" />
        <StatCard index={3} icon={FileCheck2} label="Statements processed" value={num(data?.stmtCount)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-semibold">Recent uploads</div>
              <div className="text-xs text-muted-foreground">Latest merchant statements processed</div>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/statements">View all <ArrowUpRight className="size-3.5 ml-1" /></Link></Button>
          </div>
          <div className="divide-y divide-border -mx-2">
            {(data?.recent ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">No statements yet. <Link to="/upload" className="text-primary hover:underline">Upload your first</Link>.</div>
            )}
            {(data?.recent ?? []).map((r: any) => (
              <Link key={r.id} to="/analyses/$id" params={{ id: r.id }} className="flex items-center justify-between gap-3 px-2 py-3 hover:bg-accent/50 rounded-lg transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center"><FileCheck2 className="size-4" /></div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.file_name ?? "Statement"}</div>
                    <div className="text-xs text-muted-foreground">{r.acquirer ?? "Unknown acquirer"} · {shortDate(r.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-sm font-medium tabular-nums">{gbp(r.total_volume)}</div>
                  <Badge variant={r.status === "reviewed" ? "default" : "secondary"} className="capitalize">{r.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-soft relative overflow-hidden">
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-primary/20 blur-3xl" />
          <Sparkles className="size-5 text-primary" />
          <div className="font-semibold mt-3">Mapping confidence</div>
          {/* TODO (template): placeholder value — replace with a real figure or remove this element. */}
          <div className="text-4xl font-semibold tabular-nums mt-1 text-gradient-brand">94.2%</div>
          <div className="text-xs text-muted-foreground mt-1">Across all processed statements</div>
          <div className="mt-4 text-sm text-muted-foreground">
            The learning engine improved by <span className="text-success font-medium">+3.1%</span> over the last 30 days thanks to your manual corrections.
          </div>
          <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/dictionary">Review dictionary</Link></Button>
        </motion.div>
      </div>
    </>
  );
}
