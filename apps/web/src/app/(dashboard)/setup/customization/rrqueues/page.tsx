"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, MoreHorizontal, Plus, Search, Users } from "lucide-react";
import { rrQueueApi, userApi } from "@/lib/api";
import { UserLookup } from "@/components/crm/user-lookup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function RRQueuesPage() {
  const { toast } = useToast();
  const [queues, setQueues] = React.useState<any[]>([]);
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [nameError, setNameError] = React.useState(false);
  const [projectId, setProjectId] = React.useState("");
  const [projectError, setProjectError] = React.useState(false);
  const [active, setActive] = React.useState(true);
  const [leadSource, setLeadSource] = React.useState<string[]>([]);
  const [newOwnerId, setNewOwnerId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [users, setUsers] = React.useState<any[]>([]);
  const [options, setOptions] = React.useState<{ statuses: any[]; sources: any[]; projects: any[] }>({ statuses: [], sources: [], projects: [] });
  const [ownerQueue, setOwnerQueue] = React.useState<any>(null);
  const [ownerId, setOwnerId] = React.useState("");
  const [ownerDialogOpen, setOwnerDialogOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try { setQueues((await rrQueueApi.list(search ? { search } : undefined)).data.data || []); }
    catch (error: any) { toast({ title: "Unable to load queues", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
  }, [search, toast]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    userApi.list({ limit: 200 })
      .then((response) => setUsers(response.data.data || []))
      .catch((error: any) => toast({ title: "Unable to load users", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }));
  }, [toast]);

  React.useEffect(() => {
    rrQueueApi.options()
      .then((response) => setOptions(response.data.data || { statuses: [], sources: [], projects: [] }))
      .catch((error: any) => toast({ title: "Unable to load queue options", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }));
  }, [toast]);

  const resetNewQueue = () => {
    setName("");
    setNameError(false);
    setProjectId("");
    setProjectError(false);
    setActive(true);
    setLeadSource([]);
    setNewOwnerId("");
  };

  const create = async (saveAndNew = false) => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    if (!projectId) {
      setProjectError(true);
      return;
    }
    try {
      setSaving(true);
      await rrQueueApi.create({
        name: name.trim(),
        projectId,
        active,
        leadSource,
        ownerId: newOwnerId || null,
      });
      await load();
      if (saveAndNew) resetNewQueue();
      else { resetNewQueue(); setOpen(false); }
    } catch (error: any) { toast({ title: "Unable to create queue", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this RRQueue? Existing lead ownership will remain unchanged.")) return;
    try { setSaving(true); await rrQueueApi.remove(id); await load(); }
    catch (error: any) { toast({ title: "Unable to delete queue", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
    finally { setSaving(false); }
  };

  const saveOwner = async () => {
    if (!ownerQueue) return;
    try {
      setSaving(true);
      await rrQueueApi.update(ownerQueue.id, { ownerId: ownerId || null });
      setOwnerDialogOpen(false);
      setOwnerQueue(null);
      await load();
      toast({ title: "Owner updated", description: "The RRQueue owner was changed." });
    } catch (error: any) {
      toast({ title: "Unable to change owner", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">Setup / Customization</p><h1 className="text-2xl font-semibold">Round Robins</h1><p className="text-sm text-muted-foreground">Manage project-specific assignment queues and members.</p></div>
      <Button onClick={() => { resetNewQueue(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />New RRQueue</Button>
    </div>
    <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search this list..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <Card><CardHeader><CardTitle>Queue list</CardTitle></CardHeader><CardContent>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Round Robin Name</th><th className="p-3">Project Assigned</th><th className="p-3">Active</th><th className="p-3">Owner</th><th className="p-3">No. of users</th><th className="w-12 p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {queues.map((queue) => <tr key={queue.id} className="border-b last:border-0"><td className="p-3 font-medium"><Link className="text-primary hover:underline" href={`/setup/customization/rrqueues/${queue.id}`}>{queue.name}</Link></td><td className="p-3">{queue.project?.name || renderProjectFallback(queue, options.projects) || "Unassigned"}</td><td className="p-3">{queue.active ? "Active" : "Inactive"}</td><td className="p-3">{queue.owner ? `${queue.owner.firstName} ${queue.owner.lastName}` : "Unassigned"}</td><td className="p-3"><span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{queue.noOfUsers}</span></td><td className="p-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${queue.name}`} title="Queue actions" disabled={saving}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/setup/customization/rrqueues/${queue.id}`}>Edit</Link></DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => void remove(queue.id)}>Delete</DropdownMenuItem><DropdownMenuItem onSelect={() => { setOwnerQueue(queue); setOwnerId(queue.ownerId || ""); setOwnerDialogOpen(true); }}>Change Owner</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td></tr>)}
        {!queues.length && <tr><td className="p-8 text-center text-muted-foreground" colSpan={7}>No Round Robins found.</td></tr>}
      </tbody></table></div>
    </CardContent></Card>
    <Dialog open={open} onOpenChange={(isOpen) => { if (!saving) { setOpen(isOpen); if (!isOpen) resetNewQueue(); } }}>
      <DialogContent className="max-h-[92vh] max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5"><DialogTitle className="text-center text-2xl font-medium text-muted-foreground">New RRQueue</DialogTitle></DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
          <p className="text-right text-sm text-muted-foreground"><span className="text-destructive">*</span> = Required Information</p>
          <div className="rounded-md bg-muted px-4 py-3 text-lg text-muted-foreground">Information</div>
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrqueue-name">Name <span className="text-destructive">*</span></Label><div><Input id="rrqueue-name" autoFocus aria-invalid={nameError} className={nameError ? "border-destructive bg-destructive/5" : ""} value={name} onChange={(event) => { setName(event.target.value); if (event.target.value.trim()) setNameError(false); }} />{nameError && <p className="mt-1 text-xs text-destructive">Complete this field.</p>}</div></div>
            <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrqueue-project">Project Assigned <span className="text-destructive">*</span></Label><div><select id="rrqueue-project" aria-label="Project Assigned" className={`h-10 w-full rounded-md border bg-background px-3 text-sm ${projectError ? "border-destructive" : ""}`} value={projectId} onChange={(event) => { setProjectId(event.target.value); if (event.target.value) setProjectError(false); }}><option value="">--None--</option>{options.projects.map((project) => <option key={project.value} value={project.value}>{project.label}</option>)}</select>{projectError && <p className="mt-1 text-xs text-destructive">Select a project.</p>}</div></div>
            <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrqueue-active">Active</Label><input id="rrqueue-active" aria-label="Active" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 justify-self-start" /></div>
            <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrqueue-new-owner">Owner</Label><UserLookup id="rrqueue-new-owner" ariaLabel="Owner" users={users.filter((user) => user.isActive)} value={newOwnerId} onChange={setNewOwnerId} placeholder="Unassigned or search users..." /></div>
            <DualListField label="Lead Source" options={options.sources} value={leadSource} onChange={setLeadSource} />
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4 sm:justify-center">
          <Button variant="outline" onClick={() => { resetNewQueue(); setOpen(false); }} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => void create(true)} disabled={saving}>{saving ? "Saving..." : "Save & New"}</Button>
          <Button onClick={() => void create(false)} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={ownerDialogOpen} onOpenChange={(isOpen) => { setOwnerDialogOpen(isOpen); if (!isOpen) setOwnerQueue(null); }}><DialogContent><DialogHeader><DialogTitle>Change Owner</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="rrqueue-owner">Owner</Label><UserLookup id="rrqueue-owner" ariaLabel="Owner" users={users.filter((user) => user.isActive)} value={ownerId} onChange={setOwnerId} placeholder="Unassigned or search users..." selectedUser={ownerQueue?.owner} /></div><DialogFooter><Button variant="outline" onClick={() => setOwnerDialogOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void saveOwner()} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function renderProjectFallback(queue: any, projects: Array<{ value: string; label: string }>) {
  const projectValue = queue.projectInterested?.[0];
  return projects.find((project) =>
    project.value === projectValue || project.label.toLowerCase() === projectValue?.toLowerCase(),
  )?.label || projectValue || "";
}

function DualListField({ label, options, value, onChange, info = false }: { label: string; options: Array<string | { value: string; label: string }>; value: string[]; onChange: (value: string[]) => void; info?: boolean }) {
  const [selectedAvailable, setSelectedAvailable] = React.useState("");
  const [selectedChosen, setSelectedChosen] = React.useState("");
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const available = normalized.filter((option) => !value.includes(option.value));
  return <div className="space-y-1"><p className="flex items-center gap-2 text-sm font-semibold">{label}{info && <Info className="h-4 w-4 rounded-full fill-red-700 text-white" />}</p><div className="grid grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] items-center gap-2"><div><p className="mb-1 text-xs font-medium text-muted-foreground">Available</p><select aria-label={`${label} available`} multiple size={6} value={selectedAvailable ? [selectedAvailable] : []} onChange={(event) => setSelectedAvailable(event.target.value)} className="h-36 w-full rounded-md border bg-background p-2 text-sm">{available.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className="grid gap-2"><Button type="button" variant="ghost" size="icon" aria-label={`Add ${label}`} disabled={!selectedAvailable} onClick={() => { if (selectedAvailable) { onChange([...value, selectedAvailable]); setSelectedAvailable(""); } }}><ChevronRight className="h-4 w-4 text-primary" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label}`} disabled={!selectedChosen} onClick={() => { if (selectedChosen) { onChange(value.filter((item) => item !== selectedChosen)); setSelectedChosen(""); } }}><ChevronLeft className="h-4 w-4 text-primary" /></Button></div><div><p className="mb-1 text-xs font-medium text-muted-foreground">Chosen</p><select aria-label={`${label} chosen`} multiple size={6} value={selectedChosen ? [selectedChosen] : []} onChange={(event) => setSelectedChosen(event.target.value)} className="h-36 w-full rounded-md border bg-background p-2 text-sm">{value.map((item) => <option key={item} value={item}>{normalized.find((option) => option.value === item)?.label || item}</option>)}</select></div></div></div>;
}