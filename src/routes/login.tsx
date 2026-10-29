import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { GoogleButton } from "@/components/google-button";

export const Route = createFileRoute("/login")({
  validateSearch: (s) => ({ redirect: (s.redirect as string) || "/dashboard" }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate({ to: search.redirect, replace: true });
  }, [isAuthenticated, navigate, search.redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: search.redirect, replace: true });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative bg-gradient-brand p-12 text-primary-foreground flex-col justify-between overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-[#0e1c2e] grid place-items-center"><span className="font-display text-lg font-bold text-[#c9a23b] leading-none">P</span></div>
          <span className="font-display font-bold tracking-tight text-xl">Pricing <span className="text-[#c9a23b]">Tool</span></span>
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10 max-w-md">
          <div className="text-3xl font-semibold leading-tight">Decode every statement.<br />Win more merchants.</div>
          <p className="mt-4 text-primary-foreground/80">Built for resellers of card acquiring services.</p>
        </motion.div>
        <div className="text-xs text-primary-foreground/70">© {new Date().getFullYear()} Pricing Tool</div>
        <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute top-20 -right-20 size-64 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="size-9 rounded-xl bg-[#0e1c2e] grid place-items-center"><span className="font-display text-lg font-bold text-[#c9a23b] leading-none">P</span></div>
            <span className="font-display font-bold tracking-tight text-lg">Pricing <span className="text-[#c9a23b]">Tool</span></span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back to your reseller workspace.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-gradient-brand text-primary-foreground">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton />

          <p className="text-sm text-muted-foreground mt-6 text-center">
            No account? <Link to="/signup" className="text-primary font-medium hover:underline">Create one</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
