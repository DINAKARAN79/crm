"use client";

import * as React from "react";
import { Database, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { modulesApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ModuleDefinition {
  id: string;
  name: string;
  label: string;
  pluralLabel: string;
  description?: string | null;
  icon?: string | null;
  objectType: "standard" | "custom";
  isActive: boolean;
  isAvailableInNavigation?: boolean;
  isAvailableInReports?: boolean;
}

const emptyForm = { label: "", name: "", pluralLabel: "", description: "", icon: "database", isActive: true, isAvailableInNavigation: true, isAvailableInReports: true };

export default function ModulesPage() {
  const { toast } = useToast();
  const [modules, setModules] = React.useState<ModuleDefinition[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ModuleDefinition | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const loadModules = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await modulesApi.list(true);
      setModules(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error: any) {
      toast({ title: "Unable to load modules", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally { setLoading(false); }
  }, [toast]);

  React.useEffect(() => { void loadModules(); }, [loadModules]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (module: ModuleDefinition) => {
    setEditing(module);
    setForm({ label: module.label, name: module.name, pluralLabel: module.pluralLabel, description: module.description || "", icon: module.icon || "database", isActive: module.isActive, isAvailableInNavigation: module.isAvailableInNavigation !== false, isAvailableInReports: module.isAvailableInReports !== false });
    setDialogOpen(true);
  };

  const saveModule = async () => {
    if (!form.label.trim() || !form.name.trim() || !form.pluralLabel.trim()) {
      toast({ title: "Required fields missing", description: "Module name, API name, and plural label are required.", variant: "destructive" as any });
      return;
    }
    try {
      setSaving(true);
      const payload = { ...form, label: form.label.trim(), name: form.name.trim(), pluralLabel: form.pluralLabel.trim(), description: form.description.trim() || undefined };
      if (editing) await modulesApi.update(editing.name, payload);
      else await modulesApi.create(payload);
      setDialogOpen(false);
      await loadModules();
      toast({ title: editing ? "Module updated" : "Module created", description: `${payload.label} is ready.` });
    } catch (error: any) {
      toast({ title: "Unable to save module", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally { setSaving(false); }
  };

  const toggleActive = async (module: ModuleDefinition) => {
    try { await modulesApi.update(module.name, { isActive: !module.isActive }); await loadModules(); }
    catch (error: any) { toast({ title: "Unable to update module", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
  };

  const removeModule = async (module: ModuleDefinition) => {
    if (module.objectType === "standard") return;
    if (!window.confirm(`Delete ${module.label}?`)) return;
    try { await modulesApi.delete(module.name); await loadModules(); toast({ title: "Module deleted", description: `${module.label} was removed.` }); }
    catch (error: any) { toast({ title: "Unable to delete module", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
  };

  const filtered = modules.filter((module) => `${module.label} ${module.name} ${module.description || ""}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4 border-b pb-6"><div><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Setup / Customization</p><h1 className="mt-1 text-xl font-semibold tracking-tight">Modules</h1><p className="mt-2 text-muted-foreground">Manage the CRM modules built on your object definitions.</p></div><Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Module</Button></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Modules</CardTitle><div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search modules" value={search} onChange={(event) => setSearch(event.target.value)} /></div></CardHeader><CardContent>{loading ? <p className="py-8 text-center text-muted-foreground">Loading modules...</p> : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>API Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Navigation</TableHead><TableHead>Reports</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filtered.map((module) => <TableRow key={module.id}><TableCell className="font-medium">{module.pluralLabel}</TableCell><TableCell className="font-mono text-sm">{module.name}</TableCell><TableCell><Badge variant={module.objectType === "standard" ? "secondary" : "default"}>{module.objectType}</Badge></TableCell><TableCell><Badge variant={module.isActive ? "default" : "outline"}>{module.isActive ? "Active" : "Inactive"}</Badge></TableCell><TableCell>{module.isAvailableInNavigation !== false ? "Available" : "Hidden"}</TableCell><TableCell>{module.isAvailableInReports !== false ? "Available" : "Hidden"}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(module)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem><DropdownMenuItem onClick={() => toggleActive(module)}>{module.isActive ? "Deactivate" : "Activate"}</DropdownMenuItem>{module.objectType === "custom" && <DropdownMenuItem className="text-destructive" onClick={() => removeModule(module)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table>{!filtered.length && <p className="p-8 text-center text-sm text-muted-foreground">No modules found.</p>}</div>}</CardContent></Card>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit Module" : "Create Module"}</DialogTitle><DialogDescription>Configure a CRM module backed by an ObjectDefinition.</DialogDescription></DialogHeader><div className="grid gap-4 py-3"><div className="space-y-2"><Label htmlFor="module-label">Module Name *</Label><Input id="module-label" value={form.label} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value, name: current.name || event.target.value.replace(/[^A-Za-z0-9]/g, "") }))} placeholder="Leads" /></div><div className="space-y-2"><Label htmlFor="module-name">API Name *</Label><Input id="module-name" value={form.name} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Lead" /></div><div className="space-y-2"><Label htmlFor="module-plural">Plural Label *</Label><Input id="module-plural" value={form.pluralLabel} onChange={(event) => setForm((current) => ({ ...current, pluralLabel: event.target.value }))} placeholder="Leads" /></div><div className="space-y-2"><Label htmlFor="module-description">Description</Label><Input id="module-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Manage sales leads" /></div><label className="flex items-center justify-between rounded-md border p-3 text-sm">Active<Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} /></label><label className="flex items-center justify-between rounded-md border p-3 text-sm">Available in Navigation<Switch checked={form.isAvailableInNavigation} onCheckedChange={(checked) => setForm((current) => ({ ...current, isAvailableInNavigation: checked }))} /></label><label className="flex items-center justify-between rounded-md border p-3 text-sm">Available in Reports<Switch checked={form.isAvailableInReports} onCheckedChange={(checked) => setForm((current) => ({ ...current, isAvailableInReports: checked }))} /></label></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={saveModule} disabled={saving}>{saving ? "Saving..." : editing ? "Save Module" : "Create Module"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
