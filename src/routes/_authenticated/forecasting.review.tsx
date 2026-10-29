import { createFileRoute } from "@tanstack/react-router";
import { SelectBrandNotice } from "@/components/forecasting/SelectBrandNotice";
import { useApp } from "@/lib/forecasting/app-store";
import { RESELLERS, formatMoney } from "@/lib/forecasting/mock-data";
import { StatusBadge } from "@/components/forecasting/Kpi";
import { ForecastPageHeader } from "@/components/forecasting/PageHeader";

export const Route = createFileRoute("/_authenticated/forecasting/review")({
  head: () => ({ meta: [{ title: "Review & history · Payment Forecasting" }] }),
  component: Review,
});

function Review() {
  const { activeResellerId, isAllResellers, versions } = useApp();
  if (!activeResellerId) return null;
  if (isAllResellers) return <SelectBrandNotice page="Review & versions" />;
  const reseller = RESELLERS.find(r => r.id === activeResellerId)!;
  const list = versions.filter(v => v.resellerId === activeResellerId);

  return (
    <div>
      <ForecastPageHeader title="Forecast review & history" subtitle={`${reseller.name} · saved forecast versions, awaiting Platform sign-off`} />
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-secondary">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left">Author</th>
              <th className="text-left">Method</th>
              <th className="text-right">2026 annual</th>
              <th className="text-left">Notes</th>
              <th className="text-right p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No saved versions yet — use the Forecast builder to create one.</td></tr>}
            {list.map((v, i) => (
              <tr key={v.id}>
                <td className="p-3">{v.createdAt}</td>
                <td>{v.author}</td>
                <td className="capitalize">{v.method.replace("_", " ")}</td>
                <td className="text-right font-medium">{formatMoney(v.annualTotal2026)}</td>
                <td className="text-muted-foreground max-w-md">{v.notes || "—"}</td>
                <td className="text-right p-3">
                  <StatusBadge tone={i === 0 ? "info" : "muted"}>{i === 0 ? "Current" : "Superseded"}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Each save from the Forecast builder is recorded here as a version, newest first. Versions are saved in your browser only, so they are not shared.</p>
    </div>
  );
}
