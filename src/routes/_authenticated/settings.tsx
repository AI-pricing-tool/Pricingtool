import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");

  const { data: org } = useQuery({
    queryKey: ["my-org", profile?.organisation_id],
    enabled: !!profile?.organisation_id,
    queryFn: async () => (await supabase.from("organisations").select("*").eq("id", profile!.organisation_id!).single()).data,
  });
  const [orgName, setOrgName] = useState(org?.name ?? "");

  async function saveProfile() {
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    qc.invalidateQueries();
  }

  async function saveOrg() {
    if (!org) return;
    const { error } = await supabase.from("organisations").update({ name: orgName }).eq("id", org.id);
    if (error) return toast.error(error.message);
    toast.success("Organisation updated");
  }

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile and organisation." />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Profile">
          <Field label="Email"><Input value={user?.email ?? ""} disabled /></Field>
          <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Button onClick={saveProfile} className="bg-gradient-brand text-primary-foreground">Save profile</Button>
        </Card>

        <Card title="Organisation">
          {org ? (
            <>
              <Field label="Name"><Input value={orgName || org.name} onChange={(e) => setOrgName(e.target.value)} /></Field>
              <Field label="Slug"><Input value={org.slug} disabled /></Field>
              <Button onClick={saveOrg} className="bg-gradient-brand text-primary-foreground">Save organisation</Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No organisation assigned yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-soft space-y-4">
      <div className="font-semibold">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
