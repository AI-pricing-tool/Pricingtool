import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Kpi({ label, value, hint, tone, icon }: {
  label: string; value: ReactNode; hint?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
  icon?: ReactNode;
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    primary: "text-primary",
  }[tone ?? "default"];
  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</div>
        {icon}
      </div>
      <div className={cn("mt-2 text-2xl font-bold", toneClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ tone, children }: { tone: "success" | "warning" | "destructive" | "info" | "muted"; children: ReactNode }) {
  const cls = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    info: "bg-primary/15 text-primary",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-semibold", cls)}>{children}</span>;
}
