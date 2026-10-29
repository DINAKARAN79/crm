"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Eye, Pencil, Plus, Search, Shield, Trash2, Users } from "lucide-react";
import { companySettingsApi, roleApi, userApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Role {
  id: string;
  name: string;
  description?: string | null;
  parentRoleId?: string | null;
  parentRole?: { id: string; name: string } | null;
  isSystem?: boolean;
  _count?: { users: number };
  users?: { user: { id: string; firstName: string; lastName?: string; email: string } }[];
}

const emptyForm = { name: "", description: "", parentRoleId: "none" };

export default function RolesPage() {
  const { toast } = useToast();
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<Role | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [assignmentRole, setAssignmentRole] = React.useState<Role | null>(null);
  const [users, setUsers] = React.useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = React.useState(false);
  const [assigningUser, setAssigningUser] = React.useState<string | null>(null);
  const [expandedRoleIds, setExpandedRoleIds] = React.useState<Set<string>>(new Set());
  const [viewRole, setViewRole] = React.useState<Role | null>(null);
  const [viewRoleUsers, setViewRoleUsers] = React.useState<any[]>([]);
  const [viewRoleLoading, setViewRoleLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"roles" | "sharing">("roles");
  const [organizationName, setOrganizationName] = React.useState("");
  const [organizationDialogOpen, setOrganizationDialogOpen] = React.useState(false);
  const [organizationSaving, setOrganizationSaving] = React.useState(false);

  const loadRoles = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await roleApi.list({ limit: 500 });
      const nextRoles = Array.isArray(response.data.data) ? response.data.data : [];
      setRoles(nextRoles);
      setExpandedRoleIds((current) => new Set([...current].filter((id) => nextRoles.some((role: Role) => role.id === id))));
    } catch (error: any) {
      toast({ title: "Unable to load roles", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { void loadRoles(); }, [loadRoles]);

  React.useEffect(() => {
    void companySettingsApi.get().then((response) => {
      const name = response.data?.data?.name || "";
      setOrganizationName(name);
      if (!name.trim()) setOrganizationDialogOpen(true);
    }).catch((error: any) => {
      toast({ title: "Unable to load organization", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    });
  }, [toast]);

  const openCreate = (parentRoleId = "none") => {
    if (!organizationName.trim()) {
      setOrganizationDialogOpen(true);
      toast({ title: "Create your organization first", description: "Enter an organization name before creating roles.", variant: "destructive" as any });
      return;
    }
    setEditingRole(null);
    setForm({ ...emptyForm, parentRoleId });
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setForm({ name: role.name, description: role.description || "", parentRoleId: role.parentRoleId || "none" });
    setDialogOpen(true);
  };

  const saveRole = async () => {
    if (!form.name.trim()) {
      toast({ title: "Role name required", description: "Enter a role name.", variant: "destructive" as any });
      return;
    }
    try {
      setSaving(true);
      const payload = { name: form.name.trim(), description: form.description.trim() || undefined, parentRoleId: form.parentRoleId === "none" ? null : form.parentRoleId };
      if (editingRole) await roleApi.update(editingRole.id, payload);
      else await roleApi.create(payload);
      setDialogOpen(false);
      await loadRoles();
      toast({ title: editingRole ? "Role updated" : "Role created", description: `${form.name.trim()} is ready.` });
    } catch (error: any) {
      toast({ title: "Unable to save role", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  const saveOrganization = async () => {
    const name = organizationName.trim();
    if (!name) {
      toast({ title: "Organization name required", description: "Enter an organization name.", variant: "destructive" as any });
      return;
    }
    try {
      setOrganizationSaving(true);
      await companySettingsApi.update({ name });
      setOrganizationName(name);
      setOrganizationDialogOpen(false);
      toast({ title: "Organization saved", description: `${name} is now the role hierarchy root.` });
    } catch (error: any) {
      toast({ title: "Unable to save organization", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally {
      setOrganizationSaving(false);
    }
  };

  const deleteRole = async (role: Role) => {
    if (!window.confirm(`Delete the role \"${role.name}\"?`)) return;
    try {
      setDeleting(role.id);
      await roleApi.delete(role.id);
      await loadRoles();
      toast({ title: "Role deleted", description: `${role.name} was removed.` });
    } catch (error: any) {
      toast({ title: "Unable to delete role", description: error?.response?.data?.error || error?.message || "Reassign users first.", variant: "destructive" as any });
    } finally {
      setDeleting(null);
    }
  };

  const openAssignments = async (role: Role) => {
    setAssignmentRole(role);
    setLoadingUsers(true);
    try {
      const response = await userApi.list({ limit: 500 });
      const data = response.data.data || [];
      setUsers(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({ title: "Unable to load users", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally {
      setLoadingUsers(false);
    }
  };

  const assignUser = async (user: any) => {
    if (!assignmentRole) return;
    try {
      setAssigningUser(user.id);
      await userApi.assignRoles(user.id, [assignmentRole.id]);
      await loadRoles();
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, roles: [{ role: assignmentRole }] } : item));
      toast({ title: "User assigned", description: `${user.firstName} ${user.lastName || ""}`.trim() + ` is now assigned to ${assignmentRole.name}.` });
    } catch (error: any) {
      toast({ title: "Unable to assign user", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally {
      setAssigningUser(null);
    }
  };

  const openRoleView = async (role: Role) => {
    setExpandedRoleIds((current) => new Set(current).add(role.id));
    setViewRole(role);
    setViewRoleUsers([]);
    setViewRoleLoading(true);
    try {
      const response = await roleApi.get(role.id);
      const details = response.data.data;
      setViewRole(details || role);
      setViewRoleUsers(Array.isArray(details?.users) ? details.users.map((item: any) => item.user).filter(Boolean) : []);
    } catch (error: any) {
      toast({ title: "Unable to load role details", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally {
      setViewRoleLoading(false);
    }
  };

  const toggleRole = (roleId: string) => setExpandedRoleIds((current) => {
    const next = new Set(current);
    if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
    return next;
  });

  const visibleRoles = roles.filter((role) => `${role.name} ${role.description || ""}`.toLowerCase().includes(search.toLowerCase()));
  const childrenOf = (parentRoleId: string | null) => visibleRoles.filter((role) => (role.parentRoleId || null) === parentRoleId).sort((a, b) => a.name.localeCompare(b.name));

  const renderRoleNode = (role: Role, depth = 0): React.ReactNode => {
    const children = childrenOf(role.id);
    const expanded = expandedRoleIds.has(role.id);
    const assignedUsers = role.users?.map((assignment) => assignment.user) || [];

    return (
      <div key={role.id} className="relative">
        <div className="group relative flex min-h-12 items-center gap-2 py-2" style={{ paddingLeft: `${depth * 38}px` }}>
          {depth > 0 && <span className="absolute top-1/2 border-t-2 border-dashed border-slate-300" style={{ left: `${depth * 38 - 15}px`, width: "15px" }} />}
          {children.length > 0 ? <Button variant="outline" size="icon" className="h-6 w-6 shrink-0 rounded-sm" onClick={() => toggleRole(role.id)} title={expanded ? "Collapse role" : "Expand role"}>{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}</Button> : <span className="h-6 w-6 shrink-0" />}
          <div className="min-w-0">
            <button className="text-left font-medium text-slate-800 hover:text-primary" onClick={() => void openRoleView(role)}>{role.name}</button>
            {assignedUsers.length > 0 && <span className="ml-3 text-xs text-muted-foreground">{assignedUsers.map((user) => `${user.firstName} ${user.lastName || ""}`.trim()).join(", ")}</span>}
          </div>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => void openAssignments(role)} title="Assigned users"><Users className="h-3.5 w-3.5" />{role._count?.users || 0}</Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCreate(role.id)} title="Add child role"><Plus className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(role)} disabled={role.isSystem} title="Edit role"><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRole(role)} disabled={role.isSystem || deleting === role.id} title="Delete role"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </div>
        {expanded && children.length > 0 && <div className="ml-4 border-l-2 border-dashed border-slate-300">{children.map((child) => renderRoleNode(child, depth + 1))}</div>}
      </div>
    );
  };

  return <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
    <div className="flex border-b bg-muted/50"><button className={`border-b-2 px-6 py-4 text-sm font-semibold ${activeTab === "roles" ? "border-primary text-slate-900" : "border-transparent text-muted-foreground"}`} onClick={() => setActiveTab("roles")}>Roles</button><button className={`border-b-2 px-6 py-4 text-sm font-semibold ${activeTab === "sharing" ? "border-primary text-slate-900" : "border-transparent text-muted-foreground"}`} onClick={() => setActiveTab("sharing")}>Data Sharing Settings</button></div>
    {activeTab === "sharing" ? <div className="p-8"><h2 className="text-xl font-semibold">Data Sharing Settings</h2><p className="mt-2 text-sm text-muted-foreground">Configure additional sharing rules for records between roles.</p></div> : <>
      <div className="border-b px-8 py-7"><h1 className="text-xl font-semibold">Roles</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Define your organization&apos;s role hierarchy and control how users share data.</p><div className="mt-6 flex flex-wrap items-center gap-3"><Button onClick={() => openCreate()} disabled={!organizationName.trim()}><Plus className="mr-2 h-4 w-4" />New Role</Button><Button variant="link" className="px-1" onClick={() => setExpandedRoleIds(new Set(roles.map((role) => role.id)))}>Expand All</Button><span className="text-muted-foreground">|</span><Button variant="link" className="px-1" onClick={() => setExpandedRoleIds(new Set())}>Collapse All</Button><Button variant="outline" className="ml-2" onClick={() => setOrganizationDialogOpen(true)}>{organizationName ? "Edit Organization" : "Create Organization"}</Button></div></div>
      <div className="px-8 py-6"><div className="relative mb-5 max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search roles" value={search} onChange={(event) => setSearch(event.target.value)} /></div>{loading ? <p className="p-8 text-center text-muted-foreground">Loading roles...</p> : <div className="max-w-3xl py-2"><div className="flex items-center gap-2 font-semibold text-slate-800"><Button variant="outline" size="icon" className="h-6 w-6 rounded-sm" onClick={() => setExpandedRoleIds(new Set(roles.map((role) => role.id)))} title="Expand organization"><ChevronDown className="h-3.5 w-3.5" /></Button><span>{organizationName || "Your Organization"}</span></div>{visibleRoles.length === 0 ? <p className="py-8 pl-10 text-sm text-muted-foreground">No roles found. Create a role to add it under {organizationName || "your organization"}.</p> : <div className="ml-3 border-l-2 border-dashed border-slate-300 pl-3">{childrenOf(null).map((role) => renderRoleNode(role, 0))}</div>}</div>}</div>
    </>}
    <Dialog open={organizationDialogOpen} onOpenChange={setOrganizationDialogOpen}><DialogContent><DialogHeader><DialogTitle>{organizationName ? "Edit Organization" : "Create Organization"}</DialogTitle><DialogDescription>This name appears above the role hierarchy.</DialogDescription></DialogHeader><div className="space-y-2 py-3"><Label htmlFor="organization-name">Organization Name *</Label><Input id="organization-name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="DCT" /></div><DialogFooter><Button variant="outline" onClick={() => setOrganizationDialogOpen(false)}>Cancel</Button><Button onClick={saveOrganization} disabled={organizationSaving}>{organizationSaving ? "Saving..." : "Save Organization"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(viewRole)} onOpenChange={(open) => { if (!open) { setViewRole(null); setViewRoleUsers([]); } }}><DialogContent><DialogHeader><DialogTitle>{viewRole?.name}</DialogTitle><DialogDescription>Role hierarchy details and assigned users</DialogDescription></DialogHeader>{viewRole && <div className="space-y-5"><div><p className="text-xs font-medium uppercase text-muted-foreground">Description</p><p className="mt-1 text-sm">{viewRole.description || "No description"}</p></div><div><p className="text-xs font-medium uppercase text-muted-foreground">Parent role</p><p className="mt-1 text-sm">{viewRole.parentRole?.name || roles.find((role) => role.id === viewRole.parentRoleId)?.name || "Top-level role"}</p></div><div><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase text-muted-foreground">Users assigned</p><span className="text-xs text-muted-foreground">{viewRole._count?.users || viewRoleUsers.length}</span></div>{viewRoleLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading assigned users...</p> : viewRoleUsers.length === 0 ? <p className="mt-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">No users assigned to this role.</p> : <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{viewRoleUsers.map((user) => <div key={user.id} className="rounded-md border p-3"><p className="text-sm font-medium">{user.firstName} {user.lastName || ""}</p><p className="text-xs text-muted-foreground">{user.email}</p></div>)}</div>}</div></div>}<DialogFooter><Button variant="outline" onClick={() => setViewRole(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(assignmentRole)} onOpenChange={(open) => { if (!open) setAssignmentRole(null); }}><DialogContent><DialogHeader><DialogTitle>Assign Users to {assignmentRole?.name}</DialogTitle><DialogDescription>Assigning a user to this role controls which subordinate records they can access through the hierarchy.</DialogDescription></DialogHeader>{loadingUsers ? <p className="py-6 text-center text-sm text-muted-foreground">Loading users...</p> : <div className="max-h-80 space-y-2 overflow-y-auto">{users.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p> : users.map((user) => { const currentRole = user.roles?.[0]?.role?.name || user.role?.name; const isAssigned = user.roles?.some((item: any) => item.roleId === assignmentRole?.id || item.role?.id === assignmentRole?.id) || user.roleId === assignmentRole?.id; return <div key={user.id} className="flex items-center justify-between rounded-md border p-3"><div><p className="text-sm font-medium">{user.firstName} {user.lastName || ""}</p><p className="text-xs text-muted-foreground">{user.email}{currentRole ? ` · ${currentRole}` : ""}</p></div><Button size="sm" variant={isAssigned ? "secondary" : "outline"} disabled={isAssigned || assigningUser === user.id} onClick={() => void assignUser(user)}>{isAssigned ? "Assigned" : assigningUser === user.id ? "Assigning..." : "Assign"}</Button></div>; })}</div>}<DialogFooter><Button variant="outline" onClick={() => setAssignmentRole(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editingRole ? "Edit Role" : "Create Role"}</DialogTitle><DialogDescription>Define a role and its place in the organization hierarchy.</DialogDescription></DialogHeader><div className="grid gap-4 py-3"><div className="space-y-2"><Label htmlFor="role-name">Role Name *</Label><Input id="role-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Sales Manager" /></div><div className="space-y-2"><Label htmlFor="role-parent">Parent Role</Label><Select value={form.parentRoleId} onValueChange={(value) => setForm((current) => ({ ...current, parentRoleId: value }))}><SelectTrigger id="role-parent"><SelectValue placeholder="Select parent role" /></SelectTrigger><SelectContent><SelectItem value="none">No parent role</SelectItem>{roles.filter((role) => role.id !== editingRole?.id).map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="role-description">Description</Label><Input id="role-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Manages sales team records" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={saveRole} disabled={saving}>{saving ? "Saving..." : editingRole ? "Save Role" : "Create Role"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
