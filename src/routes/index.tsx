import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, FileText, ShieldCheck, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (data?.user) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Pricing Tool — Merchant Statement Intelligence" },
      { name: "description", content: "Upload UK merchant statements, normalise card fees into standard categories, and generate proposals in minutes." },
    ],
  }),
  component: Landing,
});

const acquirers = ["Worldpay", "Barclaycard", "First Data", "Global Payments", "Dojo", "Elavon", "Adyen", "Stripe", "EVO", "AIB"];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur-md sticky top-0 z-30 bg-background/70">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-[#0e1c2e] grid place-items-center shadow-elevated">
              <span className="font-display text-sm font-bold text-[#c9a23b] leading-none">P</span>
            </div>
            <span className="font-display font-bold tracking-tight">Pricing <span className="text-[#c9a23b]">Tool</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/login" search={{ redirect: "/dashboard" }}>Sign in</Link></Button>
            <Button asChild className="bg-gradient-brand text-primary-foreground"><Link to="/signup">Start free <ArrowRight className="size-4 ml-1" /></Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-7xl mx-auto px-6 pt-20 pb-24 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground mb-6">
              <span className="size-1.5 rounded-full bg-success animate-pulse" />
              Works with UK and US card statements
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight max-w-4xl mx-auto leading-[1.05]">
              Merchant statements, <span className="text-gradient-brand">decoded</span> in seconds.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
              Upload statements from Worldpay, Barclaycard, Stripe, Dojo and more. Pricing Tool sorts every fee into standard categories, calculates merchant savings, and generates branded proposals — automatically.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="bg-gradient-brand text-primary-foreground shadow-elevated">
                <Link to="/signup">Get started free <ArrowRight className="size-4 ml-1" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline"><Link to="/login" search={{ redirect: "/dashboard" }}>Sign in</Link></Button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-16">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Supports statements from</div>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
              {acquirers.map((a) => <span key={a} className="font-medium">{a}</span>)}
            </div>
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-4">
          {[
            { icon: FileText, title: "Automatic extraction", body: "PDFs, CSVs, XLSX, images. Every line item is parsed, classified, and mapped to a standard fee category." },
            { icon: BarChart3, title: "Pricing simulator", body: "Apply margin uplift, override rates, and instantly see merchant savings and reseller revenue." },
            { icon: ShieldCheck, title: "Learning engine", body: "Every manual correction trains the dictionary. Future statements map faster and more accurately." },
          ].map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="rounded-2xl border bg-card p-6 shadow-soft">
              <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center mb-4"><f.icon className="size-5" /></div>
              <div className="font-semibold">{f.title}</div>
              <div className="text-sm text-muted-foreground mt-2">{f.body}</div>
            </motion.div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Pricing Tool</footer>
    </div>
  );
}
