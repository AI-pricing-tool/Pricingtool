import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertSchema = z.object({
  canonical_category_id: z.string().uuid(),
  percent_rate: z.number().nullable(),
  per_item: z.number().nullable(),
  monthly_fee: z.number().nullable(),
  effective_from: z.string().min(1),
});

export const upsertCardTypeBuyRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Must be super admin (RLS will also enforce, but check early for a clean error)
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: super_admin required");

    const { data: existing, error: selErr } = await supabase
      .from("buy_rates")
      .select("id")
      .eq("canonical_category_id", data.canonical_category_id)
      .is("fee_category_id", null)
      .is("card_present", null)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    const payload = {
      percent_rate: data.percent_rate,
      per_item: data.per_item,
      monthly_fee: data.monthly_fee,
      effective_from: data.effective_from,
    };

    if (existing) {
      const { error } = await supabase
        .from("buy_rates")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("buy_rates").insert({
        canonical_category_id: data.canonical_category_id,
        fee_category_id: null,
        card_present: null,
        ...payload,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
