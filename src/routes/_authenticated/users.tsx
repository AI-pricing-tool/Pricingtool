import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type Role = "super_admin" | "reseller" | "viewer";

const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin",
  reseller: "Reseller",
  viewer: "Merchant viewer",
};

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const { isSuperAdmin, loading } = useAuth();
  const qc = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: ["admin", "organisations"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisations")
        .select("id, name, slug")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, organisation_id, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const byUser = new Map<string, Role[]>();
      for (const r of roles ?? []) {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as Role);
        byUser.set(r.user_id, arr);
      }
      return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  if (loading) return null;
  if (!isSuperAdmin) {
    return (
      <>
        <PageHeader title="Manage users" />
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          You need super admin permissions to manage users.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Manage users"
        description="Assign users to a reseller organisation and set their role."
        actions={<CreateOrgDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin", "organisations"] })} />}
      />

      <div className="rounded-2xl border bg-card shadow-soft overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
          <div className="col-span-3">User</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-3">Organisation</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-1 text-right">Action</div>
        </div>
        {usersQuery.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {usersQuery.data?.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            organisations={orgsQuery.data ?? []}
            onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "users"] })}
          />
        ))}
        {usersQuery.data && usersQuery.data.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No users yet.</div>
        )}
      </div>
    </>
  );
}

function UserRow({
  user,
  organisations,
  onSaved,
}: {
  user: { id: string; full_name: string | null; email: string | null; organisation_id: string | null; roles: Role[] };
  organisations: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const currentRole: Role = useMemo(() => {
    if (user.roles.includes("super_admin")) return "super_admin";
    if (user.roles.includes("reseller")) return "reseller";
    if (user.roles.includes("viewer")) return "viewer";
    return "reseller";
  }, [user.roles]);

  const [orgId, setOrgId] = useState<string>(user.organisation_id ?? "__none__");
  const [role, setRole] = useState<Role>(currentRole);
  const [saving, setSaving] = useState(false);

  const dirty = (orgId === "__none__" ? null : orgId) !== user.organisation_id || role !== currentRole;

  async function save() {
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_user_org_and_role", {
      p_user_id: user.id,
      p_org_id: (orgId === "__none__" ? null : orgId) as string,
      p_role: role,
    });

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("User updated");
    onSaved();
  }

  return (
    <div className="grid grid-cols-12 gap-3 px-5 py-3 items-center border-b last:border-b-0 text-sm">
      <div className="col-span-3 font-medium truncate">{user.full_name ?? "—"}</div>
      <div className="col-span-3 text-muted-foreground truncate">{user.email ?? "—"}</div>
      <div className="col-span-3">
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {organisations.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-1 flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || saving} className="bg-gradient-brand text-primary-foreground">
          {saving ? "…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function CreateOrgDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    const slug =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
      "-" + Math.random().toString(36).slice(2, 8);
    const { error } = await supabase.from("organisations").insert({ name: name.trim(), slug });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Organisation created");
    setName("");
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="size-4 mr-1" /> New organisation</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create organisation</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Payments" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving || !name.trim()} className="bg-gradient-brand text-primary-foreground">
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
