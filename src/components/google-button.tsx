import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Requires the Google provider to be enabled in your Supabase project
// (Authentication → Providers → Google). See the README for setup.
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/dashboard" },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message ?? "Google sign-in failed");
    }
    // On success the browser is redirected to Google; the session is picked up when it returns.
  }

  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={loading} className="w-full">
      <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"/>
      </svg>
      {loading ? "Redirecting…" : label}
    </Button>
  );
}
