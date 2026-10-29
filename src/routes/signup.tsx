import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GoogleButton } from "@/components/google-button";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          // organisation_name is read back when the workspace is created (see upload.tsx).
          data: { full_name: fullName, organisation_name: orgName },
          emailRedirectTo: window.location.origin + "/dashboard",
        },
      });
      if (error) throw error;
      if (!data.session) {
        // Supabase projects ask new users to confirm their email by default, so nobody is signed in yet.
        // The workspace is created on first upload instead, once they have signed in.
        toast.success("Account created. Check your email to confirm it, then sign in.");
        navigate({ to: "/login", search: { redirect: "/dashboard" } });
        return;
      }
      const userId = data.user?.id;
      if (userId && orgName) {
        const { error: rpcErr } = await supabase.rpc("create_organisation_for_current_user", { p_name: orgName });
        if (rpcErr) throw rpcErr;
        await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
      }
      toast.success("Account created");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative bg-gradient-brand p-12 text-primary-foreground flex-col justify-between overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-[#0e1c2e] grid place-items-center"><span className="font-display text-lg font-bold text-[#c9a23b] leading-none">P</span></div>
          <span className="font-display font-bold tracking-tight text-xl">Pricing <span className="text-[#c9a23b]">Tool</span></span>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 max-w-md">
          <div className="text-3xl font-semibold leading-tight">Start analysing in minutes.</div>
          <p className="mt-4 text-primary-foreground/80">Free during early access. Bring your first merchant statement.</p>
        </motion.div>
        <div className="text-xs text-primary-foreground/70">© {new Date().getFullYear()} Pricing Tool</div>
        <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign up as a reseller partner.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5"><Label>Full name</Label><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Company / Reseller name</Label><Input required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Payments Ltd" /></div>
            <div className="space-y-1.5"><Label>Work email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" disabled={loading} className="w-full bg-gradient-brand text-primary-foreground">
              {loading ? "Creating…" : "Create account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton label="Sign up with Google" />

          <p className="text-sm text-muted-foreground mt-6 text-center">
            Already have an account? <Link to="/login" search={{ redirect: "/dashboard" }} className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
