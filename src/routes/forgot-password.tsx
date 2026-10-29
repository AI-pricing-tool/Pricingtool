import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — Pricing Tool" },
      { name: "description", content: "Reset your Pricing Tool account password." },
      { property: "og:title", content: "Forgot password — Pricing Tool" },
      { property: "og:description", content: "Reset your Pricing Tool account password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot password</h1>
        {sent ? (
          <p className="text-sm text-muted-foreground mt-3">
            If an account exists for <strong>{email}</strong>, we've sent a link to reset your password. Check your inbox.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mt-1">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-brand text-primary-foreground">
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}
        <p className="text-sm text-muted-foreground mt-6 text-center">
          <Link to="/login" search={{ redirect: "/dashboard" }} className="text-primary font-medium hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
