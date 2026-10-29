import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/taxonomy")({
  component: TaxonomyPage,
});

function TaxonomyPage() {
  const { data: cats = [] } = useQuery({
    queryKey: ["canonical-all"],
    queryFn: async () => {
      const { data } = await supabase.from("canonical_categories").select("*").order("sort_order");
      return data ?? [];
    },
  });
  const { data: fees = [] } = useQuery({
    queryKey: ["fees-all"],
    queryFn: async () => (await supabase.from("fee_categories").select("*").order("code")).data ?? [],
  });
  const { data: tokens = [] } = useQuery({
    queryKey: ["tokens-all"],
    queryFn: async () => (await supabase.from("semantic_tokens").select("*").order("token")).data ?? [],
  });

  return (
    <>
      <PageHeader title="Standard fee categories" description="The shared vocabulary every acquirer's fees are normalised into." />

      <Section title="Card categories">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {cats.map((c: any) => (
            <div key={c.id} className="rounded-xl border bg-card p-3 flex items-start justify-between">
              <div>
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{c.code}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className="text-[10px] uppercase">{c.region}</Badge>
                <Badge variant="secondary" className="text-[10px]">{c.card_category}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Fee categories">
        <div className="rounded-2xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/40">
              <tr className="text-left"><th className="px-4 py-2 font-medium">Code</th><th className="px-4 py-2 font-medium">Label</th><th className="px-4 py-2 font-medium">Unit</th><th className="px-4 py-2 font-medium">Description</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fees.map((f: any) => (
                <tr key={f.id}>
                  <td className="px-4 py-2 font-mono text-xs">{f.code}</td>
                  <td className="px-4 py-2">{f.label}</td>
                  <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{f.unit}</Badge></td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Shorthand terms">
        <div className="flex flex-wrap gap-2">
          {tokens.map((t: any) => (
            <div key={t.id} className="rounded-lg border bg-card px-3 py-1.5 text-xs">
              <span className="font-mono font-medium text-primary">{t.token}</span>
              <span className="text-muted-foreground ml-2">→ {t.expansion}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}
