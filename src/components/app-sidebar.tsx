import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  LayoutDashboard, FileUp, FileText, Users, Library, BookOpen, Calculator,
  FileSignature, Settings, LogOut, Moon, Sun, UserCog, LineChart,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/statements", label: "Statements", icon: FileText },
  { to: "/upload", label: "Upload", icon: FileUp },
  { to: "/merchants", label: "Pipeline", icon: Users },
  { to: "/proposals", label: "Proposals", icon: FileSignature },
  { to: "/forecasting", label: "Forecasting", icon: LineChart },
];

const adminNav = [
  { to: "/users", label: "Manage users", icon: UserCog },
  { to: "/taxonomy", label: "Taxonomy", icon: Library },
  { to: "/dictionary", label: "Mapping dictionary", icon: BookOpen },
  { to: "/buy-rates", label: "Buy rates", icon: Calculator },
];


export function AppSidebar() {
  const { profile, isSuperAdmin, signOut } = useAuth();
  const { pathname } = useRouterState({ select: (s) => s.location });
  const { theme, toggle } = useTheme();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="size-9 rounded-xl bg-[#0e1c2e] grid place-items-center shadow-elevated">
          <span className="font-display text-lg font-bold text-[#c9a23b] leading-none">P</span>
        </div>
        <div>
          <div className="text-base font-semibold tracking-tight font-display">
            Pricing <span className="text-[#c9a23b]">Tool</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground -mt-0.5">statement analysis & pricing</div>
        </div>
      </div>

      <nav className="px-3 py-2 space-y-0.5">
        {nav.map((n) => <NavItem key={n.to} {...n} active={pathname.startsWith(n.to)} />)}
      </nav>

      {isSuperAdmin && (
        <div className="px-3 mt-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mb-1">Admin</div>
          <nav className="space-y-0.5">
            {adminNav.map((n) => <NavItem key={n.to} {...n} active={pathname.startsWith(n.to)} />)}
          </nav>
        </div>
      )}

      <div className="mt-auto px-3 py-4 border-t border-sidebar-border space-y-2">
        <Link to="/settings" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <Settings className="size-4" /> Settings
        </Link>
        <button onClick={toggle} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="size-8 rounded-full bg-gradient-brand grid place-items-center text-xs font-semibold text-primary-foreground">
            {(profile?.full_name ?? profile?.email ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{profile?.full_name ?? profile?.email}</div>
            <div className="text-[10px] text-muted-foreground truncate">{isSuperAdmin ? "Super admin" : "Reseller"}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} title="Sign out"><LogOut className="size-4" /></Button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ to, label, icon: Icon, active }: { to: string; label: string; icon: any; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      {active && (
        <motion.span
          layoutId="active-pill"
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary"
        />
      )}
      <Icon className="size-4" /> {label}
    </Link>
  );
}
