"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { fieldsApi, modulesApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ModuleDefinition { id: string; name: string; label: string; pluralLabel: string; isActive: boolean; }
interface FieldDefinition { id: string; name: string; label: string; fieldType: string; required: boolean; description?: string | null; helpText?: string | null; isActive: boolean; isSystemField: boolean; }

const salesforceType = /^(?:Formula \([^)]+\)|Currency\(\d+,\s*\d+\)|Number\(\d+,\s*\d+\)|Text\(\d+\)|Text Area\(\d+\)|Long Text Area\(\d+\)|Percent\(\d+,\s*\d+\)|Lookup\(.+\)|Master-Detail\(.+\)|Picklist|Checkbox|Date)$/;

function fieldDataType(field: FieldDefinition) {
  if (field.description && salesforceType.test(field.description)) return field.description;
  const stored = field.helpText?.match(/Salesforce type: ([^.]+)\./)?.[1];
  if (stored) return stored;
  return fieldTypes.find(([value]) => value === field.fieldType)?.[1] || field.fieldType;
}

const fieldTypes = [
  ["text", "Text"], ["longText", "Long Text"], ["number", "Number"], ["currency", "Currency"], ["percentage", "Percentage"],
  ["phone", "Phone"], ["email", "Email"], ["date", "Date"], ["dateTime", "Date & Time"], ["boolean", "Checkbox"],
  ["picklist", "Picklist"], ["multiPicklist", "Multi-Select Picklist"], ["lookup", "Lookup"],
] as const;

const emptyForm = { label: "", name: "", fieldType: "text", required: false, description: "" };

export default function FieldsPage() {
  const { toast } = useToast();
  const [modules, setModules] = React.useState<ModuleDefinition[]>([]);
  const [selectedModule, setSelectedModule] = React.useState("");
  const [fields, setFields] = React.useState<FieldDefinition[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FieldDefinition | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const loadModules = React.useCallback(async () => {
    try {
      const response = await modulesApi.list(false);
      const data = (Array.isArray(response.data.data) ? response.data.data : []).filter((module: ModuleDefinition) => module.isActive);
      setModules(data);
      setSelectedModule((current) => current || data[0]?.name || "");
    } catch (error: any) {
      toast({ title: "Unable to load modules", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    }
  }, [toast]);

  const loadFields = React.useCallback(async () => {
    if (!selectedModule) { setFields([]); setLoading(false); return; }
    try {
      setLoading(true);
      const response = await fieldsApi.list(selectedModule, true);
      setFields(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error: any) {
      toast({ title: "Unable to load fields", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally { setLoading(false); }
  }, [selectedModule, toast]);

  React.useEffect(() => { void loadModules(); }, [loadModules]);
  React.useEffect(() => { void loadFields(); }, [loadFields]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (field: FieldDefinition) => { setEditing(field); setForm({ label: field.label, name: field.name, fieldType: field.fieldType, required: field.required, description: field.description || "" }); setDialogOpen(true); };

  const saveField = async () => {
    if (!selectedModule || !form.label.trim() || !form.name.trim()) {
      toast({ title: "Required fields missing", description: "Field label and API name are required.", variant: "destructive" as any });
      return;
    }
    try {
      setSaving(true);
      if (editing) await fieldsApi.update(selectedModule, editing.id, { label: form.label.trim(), required: form.required, description: form.description.trim() || undefined });
      else await fieldsApi.create(selectedModule, { label: form.label.trim(), name: form.name.trim(), fieldType: form.fieldType, required: form.required, description: form.description.trim() || undefined });
      setDialogOpen(false);
      await loadFields();
      toast({ title: editing ? "Field updated" : "Field created", description: `${form.label.trim()} is ready.` });
    } catch (error: any) {
      toast({ title: "Unable to save field", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
    } finally { setSaving(false); }
  };

  const toggleField = async (field: FieldDefinition) => {
    try { await fieldsApi.toggle(selectedModule, field.id); await loadFields(); }
    catch (error: any) { toast({ title: "Unable to update field", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any }); }
  };

  const filteredFields = fields.filter((field) => `${field.label} ${field.name} ${field.fieldType}`.toLowerCase().includes(search.toLowerCase()));
  const selectedModuleLabel = modules.find((module) => module.name === selectedModule)?.pluralLabel || selectedModule;

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4 border-b pb-6"><div><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Setup / Customization</p><h1 className="mt-1 text-xl font-semibold tracking-tight">Fields</h1><p className="mt-2 text-muted-foreground">Manage the fields inside each CRM module.</p></div><Button onClick={openCreate} disabled={!selectedModule}><Plus className="mr-2 h-4 w-4" />New Field</Button></div>
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-4"><CardTitle>Fields</CardTitle><div className="flex flex-wrap gap-3"><Select value={selectedModule} onValueChange={setSelectedModule}><SelectTrigger className="w-56"><SelectValue placeholder="Select module" /></SelectTrigger><SelectContent>{modules.map((module) => <SelectItem key={module.id} value={module.name}>{module.pluralLabel}</SelectItem>)}</SelectContent></Select><div className="relative w-64"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search fields" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div></div></CardHeader><CardContent>{loading ? <p className="py-8 text-center text-muted-foreground">Loading fields...</p> : !selectedModule ? <p className="py-8 text-center text-muted-foreground">Create or select a module first.</p> : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Field Name</TableHead><TableHead>API Name</TableHead><TableHead>Type</TableHead><TableHead>Required</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredFields.map((field) => <TableRow key={field.id}><TableCell className="font-medium">{field.label}</TableCell><TableCell className="font-mono text-sm">{field.name}</TableCell><TableCell>{fieldDataType(field)}</TableCell><TableCell>{field.required ? "Yes" : "No"}</TableCell><TableCell><Badge variant={field.isActive ? "default" : "outline"}>{field.isActive ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(field)} disabled={field.isSystemField}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem><DropdownMenuItem onClick={() => toggleField(field)} disabled={field.isSystemField}>{field.isActive ? "Deactivate" : "Activate"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table>{!filteredFields.length && <p className="p-8 text-center text-sm text-muted-foreground">No fields found for {selectedModuleLabel}.</p>}</div>}</CardContent></Card>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit Field" : "Create Field"}</DialogTitle><DialogDescription>{editing ? "Update this field's label and validation settings." : "Add a field to the selected CRM module."}</DialogDescription></DialogHeader><div className="grid gap-4 py-3"><div className="space-y-2"><Label>Module</Label><Input value={selectedModuleLabel} disabled /></div><div className="space-y-2"><Label htmlFor="field-label">Field Label *</Label><Input id="field-label" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value, name: editing ? current.name : current.name || event.target.value.replace(/[^A-Za-z0-9]/g, "") }))} placeholder="Mobile Number" /></div><div className="space-y-2"><Label htmlFor="field-name">API Name *</Label><Input id="field-name" value={form.name} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="mobileNumber" /></div><div className="space-y-2"><Label>Field Type *</Label><Select value={form.fieldType} onValueChange={(value) => setForm((current) => ({ ...current, fieldType: value }))} disabled={Boolean(editing)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{fieldTypes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.required} onChange={(event) => setForm((current) => ({ ...current, required: event.target.checked }))} />Required</label><div className="space-y-2"><Label htmlFor="field-description">Description</Label><Input id="field-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Describe this field" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={saveField} disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Create Field"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
