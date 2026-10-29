import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { gbp, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pricing")({
  component: PricingPage,
});

function PricingPage() {
  // TODO (template): sample starting values for the simulator only.
  const [monthlyVolume, setMonthlyVolume] = useState(85000);
  const [currentRate, setCurrentRate] = useState(1.65);
  const [proposedRate, setProposedRate] = useState(1.25);
  const [buyRate, setBuyRate] = useState(0.95);
  const [margin, setMargin] = useState(0.30);

  const calc = useMemo(() => {
    const currentCost = monthlyVolume * (currentRate / 100);
    const proposedCost = monthlyVolume * (proposedRate / 100);
    const merchantSaving = currentCost - proposedCost;
    const resellerRevenue = monthlyVolume * (margin / 100);
    const acquirerCost = monthlyVolume * (buyRate / 100);
    return { currentCost, proposedCost, merchantSaving, resellerRevenue, acquirerCost };
  }, [monthlyVolume, currentRate, proposedRate, buyRate, margin]);

  return (
    <>
      <PageHeader title="Pricing simulator" description="Model the merchant savings and reseller revenue for any deal." />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 rounded-2xl border bg-card p-6 shadow-soft space-y-5">
          <div>
            <Label>Monthly card volume</Label>
            <Input type="number" value={monthlyVolume} onChange={(e) => setMonthlyVolume(Number(e.target.value))} className="mt-1" />
          </div>
          <SliderInput label="Current blended rate" suffix="%" value={currentRate} onChange={setCurrentRate} min={0.3} max={3.5} step={0.01} />
          <SliderInput label="Proposed blended rate" suffix="%" value={proposedRate} onChange={setProposedRate} min={0.3} max={3.5} step={0.01} />
          <SliderInput label="Buy rate (cost)" suffix="%" value={buyRate} onChange={setBuyRate} min={0.2} max={2.5} step={0.01} />
          <SliderInput label="Reseller margin uplift" suffix="%" value={margin} onChange={setMargin} min={0} max={1.5} step={0.01} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-gradient-brand text-primary-foreground p-6 shadow-elevated relative overflow-hidden">
            <div className="absolute -top-20 -right-20 size-60 rounded-full bg-white/10 blur-3xl" />
            <div className="text-xs uppercase tracking-widest opacity-80">Merchant monthly saving</div>
            <div className="text-5xl font-semibold tracking-tight mt-2 tabular-nums">{gbp(calc.merchantSaving)}</div>
            <div className="text-sm opacity-90 mt-1">{gbp(calc.merchantSaving * 12)} annually · {pct(((currentRate - proposedRate) / currentRate) * 100, 1)} reduction</div>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Tile label="Current monthly cost" value={gbp(calc.currentCost)} sub={pct(currentRate)} tone="muted" />
            <Tile label="Proposed monthly cost" value={gbp(calc.proposedCost)} sub={pct(proposedRate)} tone="success" />
            <Tile label="Reseller monthly revenue" value={gbp(calc.resellerRevenue)} sub={pct(margin)} tone="primary" />
            <Tile label="Acquirer cost" value={gbp(calc.acquirerCost)} sub={pct(buyRate)} tone="muted" />
          </div>
        </div>
      </div>
    </>
  );
}

function SliderInput({ label, value, onChange, min, max, step, suffix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm font-medium tabular-nums">{value.toFixed(2)}{suffix}</span>
      </div>
      <Slider className="mt-2" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "primary" | "success" | "muted" }) {
  const styles = {
    primary: "border-primary/30 bg-primary/5",
    success: "border-success/30 bg-success/5",
    muted: "",
  }[tone];
  return (
    <div className={`rounded-2xl border p-5 bg-card ${styles}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
