import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label, value, delta, icon: Icon, accent = "primary", index = 0,
}: {
  label: string;
  value: string;
  delta?: { value: string; positive?: boolean };
  icon: LucideIcon;
  accent?: "primary" | "success" | "warning" | "destructive";
  index?: number;
}) {
  const accentBg = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
  }[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="rounded-2xl border bg-card p-5 shadow-soft hover:shadow-elevated transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-semibold tracking-tight mt-2 text-foreground">{value}</div>
          {delta && (
            <div className={cn("text-xs mt-1 font-medium", delta.positive ? "text-success" : "text-destructive")}>
              {delta.positive ? "▲" : "▼"} {delta.value}
            </div>
          )}
        </div>
        <div className={cn("size-10 rounded-xl grid place-items-center", accentBg)}>
          <Icon className="size-5" />
        </div>
      </div>
    </motion.div>
  );
}
