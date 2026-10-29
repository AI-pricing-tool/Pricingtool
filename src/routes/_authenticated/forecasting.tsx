import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ForecastingProvider, useApp } from "@/lib/forecasting/app-store";
import { RESELLERS, ALL_RESELLERS_ID, ALL_RESELLERS_LABEL } from "@/lib/forecasting/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LayoutDashboard, BarChart3, PencilRuler, GitCompareArrows, Target, History, Users, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/forecasting")({
  component: ForecastingLayout,
});

function ForecastingLayout() {
  return (
    <ForecastingProvider>
      <Shell />
    </ForecastingProvider>
  );
}

const subNavAll = [
  { to: "/forecasting", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/forecasting/analytics", label: "Volumes & values", icon: BarChart3 },
  { to: "/forecasting/builder", label: "Builder", icon: PencilRuler },
  { to: "/forecasting/compare", label: "Compare", icon: GitCompareArrows },
  { to: "/forecasting/actions", label: "Growth actions", icon: Target },
  { to: "/forecasting/review", label: "Review", icon: History },
  { to: "/forecasting/team", label: "Portfolio", icon: Users, adminOnly: true },
  { to: "/forecasting/admin", label: "Admin", icon: Settings, adminOnly: true },
];

function Shell() {
  const { activeResellerId, setActiveResellerId, user } = useApp();
  const { isSuperAdmin } = useAuth();
  const { pathname } = useRouterState({ select: (s) => s.location });

  const subNav = subNavAll.filter((n) => !n.adminOnly || isSuperAdmin);
  const selectable =
    user?.role === "admin" ? RESELLERS :
    user?.role === "account_manager" ? RESELLERS.filter(r => user.resellerIds!.includes(r.id)) :
    user?.resellerId ? RESELLERS.filter(r => r.id === user.resellerId) :
    [];

  const noResellerLinked = user?.role === "reseller" && !user.resellerId;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap border-b pb-3 mb-6">
        <nav className="flex flex-wrap gap-1">
          {subNav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {selectable.length > 1 ? (
            <Select value={activeResellerId ?? undefined} onValueChange={setActiveResellerId}>
              <SelectTrigger className="w-[220px] h-9 text-xs"><SelectValue placeholder="Select reseller" /></SelectTrigger>
              <SelectContent>
                {user?.role === "admin" && (
                  <SelectItem value={ALL_RESELLERS_ID}>{ALL_RESELLERS_LABEL}</SelectItem>
                )}
                {selectable.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : selectable.length === 1 ? (
            <div className="px-3 py-1.5 rounded-md border bg-card text-xs font-medium">{selectable[0].name}</div>
          ) : null}
          
        </div>
      </div>
      {noResellerLinked ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground max-w-2xl">
          Your account is not linked to a reseller yet — ask a super admin to assign your organisation in <span className="font-medium text-foreground">Manage users</span>.
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
}
