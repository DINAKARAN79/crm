"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, GitBranch, Info, MoreHorizontal, Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { rrQueueApi, userApi } from "@/lib/api";
import { UserLookup } from "@/components/crm/user-lookup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Tab = "related" | "details";
type QueueUpdate = Parameters<typeof rrQueueApi.update>[1];
const MEMBER_USER_TYPES = ["Pre Sales", "Sales", "Post Sales", "Recovery", "Channel Partner", "SVC", "CRM"] as const;
const MEMBER_PROFILE_NAMES: Record<(typeof MEMBER_USER_TYPES)[number], string[]> = {
  "Pre Sales": ["pre sales", "presales"],
  Sales: ["sales", "sales executive"],
  "Post Sales": ["post sales", "post-sales"],
  Recovery: ["recovery"],
  "Channel Partner": ["channel partner"],
  SVC: ["svc"],
  CRM: ["crm"],
};

export default function RRQueueDetailsPage({ params }: { params: { id: string } }) {
  const { toast } = useToast();
  const [queue, setQueue] = React.useState<any>(null);
  const [tab, setTab] = React.useState<Tab>("details");
  const [editing, setEditing] = React.useState(false);
  const [users, setUsers] = React.useState<any[]>([]);
  const [memberDialogOpen, setMemberDialogOpen] = React.useState(false);
  const [memberUserId, setMemberUserId] = React.useState("");
  const [memberUserType, setMemberUserType] = React.useState<(typeof MEMBER_USER_TYPES)[number] | "">("");
  const [memberActive, setMemberActive] = React.useState(true);
  const [savingMember, setSavingMember] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [options, setOptions] = React.useState<{ statuses: any[]; sources: any[]; projects: any[] }>({ statuses: [], sources: [], projects: [] });

  const load = React.useCallback(async () => {
    try {
      const [queueResponse, usersResponse, optionsResponse] = await Promise.all([rrQueueApi.get(params.id), userApi.list({ limit: 200 }), rrQueueApi.options()]);
      setQueue(queueResponse.data.data);
      setUsers(usersResponse.data.data || []);
      setOptions(optionsResponse.data.data || { statuses: [], sources: [], projects: [] });
    } catch (error: any) {
      toast({ title: "Unable to load queue", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    }
  }, [params.id, toast]);
  React.useEffect(() => { void load(); }, [load]);

  const update = async (patch: QueueUpdate) => {
    try { setSaving(true); await rrQueueApi.update(params.id, patch); await load(); setEditing(false); return true; }
    catch (error: any) { toast({ title: "Unable to save queue", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); return false; }
    finally { setSaving(false); }
  };

  const addMember = async (saveAndNew = false) => {
    if (!memberUserId || !memberUserType) return;
    try {
      setSavingMember(true);
      await rrQueueApi.addMember(params.id, {
        userId: memberUserId,
        userType: memberUserType,
        activeMember: memberActive,
      });
      setMemberUserId("");
      setMemberActive(true);
      await load();
      toast({ title: "Member created", description: "The RRMember was added to this queue." });
      if (!saveAndNew) setMemberDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Unable to add member", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setSavingMember(false);
    }
  };

  const setActive = async (member: any) => {
    try { await rrQueueApi.setMemberActive(params.id, member.id, !member.activeMember); await load(); }
    catch (error: any) { toast({ title: "Unable to update member", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
  };

  const deleteMember = async (member: any) => {
    const name = `${member.user.firstName} ${member.user.lastName}`.trim();
    if (!window.confirm(`Delete ${name} from this queue? This permanently removes the queue membership.`)) return;
    try {
      await rrQueueApi.removeMember(params.id, member.id);
      await load();
      toast({ title: "Member deleted", description: `${name} was removed from this queue.` });
    } catch (error: any) {
      toast({ title: "Unable to delete member", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    }
  };

  const eligibleProfileNames = memberUserType ? MEMBER_PROFILE_NAMES[memberUserType] : [];
  const availableUsers = users.filter((user) =>
    user.isActive
    && eligibleProfileNames.includes(user.profile?.name?.toLowerCase())
    && !queue?.members?.some((member: any) => member.userId === user.id && member.userType === memberUserType),
  );

  if (!queue) return <div className="py-12 text-center text-muted-foreground">Loading queue...</div>;

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4"><div><Link href="/setup/customization/rrqueues" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Round Robins</Link><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-500 text-white"><GitBranch className="h-5 w-5" /></span><h1 className="text-2xl font-semibold">{queue.name}</h1></div></div>{tab === "details" && !editing && <Button onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>}</div>
    <div className="flex gap-6 border-b"><button className={`border-b-2 px-3 py-2 text-sm ${tab === "related" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("related")}>Related</button><button className={`border-b-2 px-3 py-2 text-sm ${tab === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("details")}>Details</button></div>
    {tab === "details" && <QueueDetails queue={queue} options={options} users={users} editing={editing} saving={saving} onSave={update} onStartEdit={() => setEditing(true)} onCancelEdit={() => setEditing(false)} />}
    {tab === "related" && <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />RRMembers ({queue.members?.length || 0})</CardTitle>
          <Button onClick={() => { setMemberUserId(""); setMemberUserType(""); setMemberActive(true); setMemberDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />New</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Name</th><th className="p-3">User</th><th className="p-3">User Type</th><th className="p-3">Last Assigned</th><th className="p-3">Actions</th></tr></thead>
              <tbody>{queue.members?.map((member: any) => <tr className="border-b last:border-0" key={member.id}>
                <td className="p-3"><Link className="font-medium text-primary hover:underline" href={`/setup/customization/rrqueues/${params.id}/members/${member.id}`}>{member.name}</Link></td>
                <td className="p-3">{member.user.firstName} {member.user.lastName}<span className="ml-2 text-muted-foreground">{member.user.email}</span></td>
                <td className="p-3">{member.userType || "Sales"}</td>
                <td className="p-3">{member.lastAssignedAt ? new Date(member.lastAssignedAt).toLocaleString() : "-"}</td>
                <td className="p-3"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${member.name}`} title="Member actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/setup/customization/rrqueues/${params.id}/members/${member.id}`}><Pencil className="mr-2 h-4 w-4" />Edit</Link></DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => void deleteMember(member)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td>
              </tr>)}</tbody>
            </table>
          </div>
          <Button className="mt-4" variant="outline" asChild><Link href={`/setup/customization/rrqueues/${params.id}/members`}>View All</Link></Button>
        </CardContent>
      </Card>

      <Dialog open={memberDialogOpen} onOpenChange={(open) => { if (!savingMember) setMemberDialogOpen(open); }}>
        <DialogContent className="crm-sky max-h-[94vh] max-w-4xl gap-0 overflow-y-auto border-sky-100 bg-white p-0 [&_button.border]:border-sky-200 [&_label]:font-semibold [&_label]:text-[#1479a8]">
          <DialogHeader className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-white px-6 py-5"><DialogTitle className="text-center text-2xl font-bold text-[#075d91]">New Round Robin Member</DialogTitle></DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <p className="text-right text-sm text-muted-foreground"><span className="text-destructive">*</span> = Required Information</p>
            <div className="rounded-md bg-muted px-4 py-3 text-lg text-muted-foreground">Information</div>
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            <div className="grid grid-cols-[minmax(100px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label>Name</Label><Input value="Auto-numbered on save" disabled readOnly /></div>
              <div className="grid grid-cols-[minmax(100px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label>RRQueue <span className="text-destructive">*</span></Label><div className="rounded-md border bg-background px-3 py-2 text-sm">{queue.name}</div></div>
              <div className="grid grid-cols-[minmax(100px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrmember-user-type">User Type <span className="text-destructive">*</span></Label><select id="rrmember-user-type" aria-label="User Type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={memberUserType} onChange={(event) => { setMemberUserType(event.target.value as (typeof MEMBER_USER_TYPES)[number] | ""); setMemberUserId(""); }}><option value="">--None--</option>{MEMBER_USER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
              <div className="grid grid-cols-[minmax(100px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrmember-user">User <span className="text-destructive">*</span></Label><UserLookup id="rrmember-user" users={availableUsers} excludedUserIds={queue.members?.filter((member: any) => member.userType === memberUserType).map((member: any) => member.userId) || []} value={memberUserId} onChange={setMemberUserId} placeholder={memberUserType ? "Search People..." : "Select a user type first"} /></div>
              <div className="grid grid-cols-[minmax(100px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrmember-active">Active</Label><input id="rrmember-active" aria-label="Member active" type="checkbox" checked={memberActive} onChange={(event) => setMemberActive(event.target.checked)} className="h-4 w-4 justify-self-start" /></div>
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4 sm:justify-center">
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)} disabled={savingMember}>Cancel</Button>
            <Button variant="outline" onClick={() => void addMember(true)} disabled={!memberUserId || !memberUserType || savingMember}>{savingMember ? "Saving..." : "Save & New"}</Button>
            <Button onClick={() => void addMember(false)} disabled={!memberUserId || !memberUserType || savingMember}>{savingMember ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card><CardHeader><div className="flex items-center justify-between gap-4"><CardTitle>Round Robin History ({queue.history?.length || 0})</CardTitle><Button variant="outline" asChild><Link href={`/setup/customization/rrqueues/${params.id}/history`}>View All</Link></Button></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Date</th><th className="p-3">Field</th><th className="p-3">User</th><th className="p-3">Original Value</th><th className="p-3">New Value</th></tr></thead><tbody>{queue.history?.map((entry: any) => <tr className="border-b last:border-0" key={entry.id}><td className="p-3">{new Date(entry.createdAt).toLocaleString()}</td><td className="p-3">{entry.field}</td><td className="p-3">{entry.userName}</td><td className="p-3">{entry.originalValue || "-"}</td><td className="p-3">{entry.newValue || "-"}</td></tr>)}</tbody></table></div></CardContent></Card>
    </div>}
  </div>;
}

function QueueDetails({ queue, options, users, editing, saving, onSave, onStartEdit, onCancelEdit }: { queue: any; options: { statuses: any[]; sources: any[]; projects: any[] }; users: any[]; editing: boolean; saving: boolean; onSave: (patch: QueueUpdate) => Promise<boolean>; onStartEdit: () => void; onCancelEdit: () => void }) {
  const [name, setName] = React.useState(queue.name);
  const [projectId, setProjectId] = React.useState(queue.projectId || "");
  const [active, setActive] = React.useState(Boolean(queue.active));
  const [leadStatus, setLeadStatus] = React.useState<string[]>(queue.leadStatus || []);
  const [sources, setSources] = React.useState<string[]>(queue.leadSource || []);
  const [ownerId, setOwnerId] = React.useState(queue.ownerId || "");
  React.useEffect(() => {
    setName(queue.name);
    setProjectId(queue.projectId || "");
    setActive(Boolean(queue.active));
    setLeadStatus(queue.leadStatus || []);
    setSources(queue.leadSource || []);
    setOwnerId(queue.ownerId || "");
  }, [queue]);

  const cancelEdit = () => {
    setName(queue.name);
    setProjectId(queue.projectId || "");
    setActive(Boolean(queue.active));
    setLeadStatus(queue.leadStatus || []);
    setSources(queue.leadSource || []);
    setOwnerId(queue.ownerId || "");
    onCancelEdit();
  };
  const save = () => onSave({ name, projectId, active, leadStatus, leadSource: sources, ownerId: ownerId || null });
  const optionLabel = (value: string, items: Array<string | { value: string; label: string }>) => {
    const option = items.find((item) => (typeof item === "string" ? item : item.value) === value);
    return typeof option === "string" ? option : option?.label || value;
  };
  const renderValues = (values: string[], items: Array<string | { value: string; label: string }>) => values.length ? values.map((value) => optionLabel(value, items)).join(", ") : "-";
  if (editing) return <Card className="rounded-xl border-0 bg-card shadow-sm">
    <div className="px-6 pt-4 text-right text-sm text-muted-foreground"><span className="text-destructive">*</span> = Required Information</div>
    <CardContent className="grid gap-x-12 gap-y-6 px-6 py-5 md:grid-cols-2">
      <div>
        <EditFieldRow label="Name" required><Input value={name} onChange={(event) => setName(event.target.value)} /></EditFieldRow>
        <EditFieldRow label="Project Assigned" required><select aria-label="Project Assigned" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">--None--</option>{options.projects.map((project) => <option key={project.value} value={project.value}>{project.label}</option>)}</select></EditFieldRow>
        <EditFieldRow label="Active"><input aria-label="Queue active" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4" /></EditFieldRow>
        <DualListEditor label="Lead Status" options={options.statuses} value={leadStatus} onChange={setLeadStatus} />
        <EditFieldRow label="No of users" info help="This field is calculated upon save"><span className="text-sm">{queue.noOfUsers ?? 0}</span></EditFieldRow>
        <EditFieldRow label="Lead Count" info><span>{queue.leadCount ?? 0}</span></EditFieldRow>
        <EditFieldRow label="Next sequence position" info><span>{queue.previousId ?? 0}</span></EditFieldRow>
        <EditFieldRow label="Created By"><span>{queue.createdBy ? `${queue.createdBy.firstName} ${queue.createdBy.lastName}, ` : ""}{queue.createdAt ? new Date(queue.createdAt).toLocaleString() : "-"}</span></EditFieldRow>
      </div>
      <div>
        <DualListEditor label="Lead Source" options={options.sources} value={sources} onChange={setSources} />
        <EditFieldRow label="Owner"><UserLookup id="rrqueue-owner" ariaLabel="Owner" users={users.filter((user) => user.isActive)} value={ownerId} onChange={setOwnerId} placeholder="Unassigned or search users..." selectedUser={queue.owner} /></EditFieldRow>
        <div className="mt-4"><EditFieldRow label="Last Modified By"><span>{queue.updatedBy ? `${queue.updatedBy.firstName} ${queue.updatedBy.lastName}, ` : ""}{queue.updatedAt ? new Date(queue.updatedAt).toLocaleString() : "-"}</span></EditFieldRow></div>
      </div>
    </CardContent>
    <div className="sticky bottom-0 flex justify-center gap-3 border-t bg-card px-6 py-4 shadow-[0_-4px_8px_rgba(0,0,0,0.12)]"><Button variant="outline" onClick={cancelEdit} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving || !name.trim() || !projectId}>{saving ? "Saving..." : "Save"}</Button></div>
  </Card>;

  return <Card className="rounded-xl border-0 bg-card shadow-sm"><CardContent className="grid gap-x-12 px-6 py-5 md:grid-cols-2">
    <div>
      <QueueDetailRow label="Name" onEdit={onStartEdit}>{queue.name}</QueueDetailRow>
      <QueueDetailRow label="Project Assigned" onEdit={onStartEdit}>{queue.project?.name || renderValues(queue.projectInterested || [], options.projects)}</QueueDetailRow>
      <QueueDetailRow label="Active" onEdit={onStartEdit}>{queue.active ? "Active" : "Inactive"}</QueueDetailRow>
      <QueueDetailRow label="Lead Status" onEdit={onStartEdit} info>{renderValues(queue.leadStatus || [], options.statuses)}</QueueDetailRow>
      <QueueDetailRow label="No of users" info>{queue.noOfUsers ?? 0}</QueueDetailRow>
      <QueueDetailRow label="Lead Count" info>{queue.leadCount ?? 0}</QueueDetailRow>
      <QueueDetailRow label="Previous id" info>{queue.previousId ?? 0}</QueueDetailRow>
      <QueueDetailRow label="Created By">{queue.createdBy ? `${queue.createdBy.firstName} ${queue.createdBy.lastName}, ` : ""}{queue.createdAt ? new Date(queue.createdAt).toLocaleString() : "-"}</QueueDetailRow>
    </div>
    <div>
      <QueueDetailRow label="Lead Source" onEdit={onStartEdit}>{renderValues(queue.leadSource || [], options.sources)}</QueueDetailRow>
      <QueueDetailRow label="Owner" onEdit={onStartEdit}>{queue.owner ? <span className="inline-flex items-center gap-2"><UserRound className="h-5 w-5 text-muted-foreground" />{queue.owner.firstName} {queue.owner.lastName}</span> : "Unassigned"}</QueueDetailRow>
      <QueueDetailRow label="Last Modified By">{queue.updatedBy ? `${queue.updatedBy.firstName} ${queue.updatedBy.lastName}, ` : ""}{queue.updatedAt ? new Date(queue.updatedAt).toLocaleString() : "-"}</QueueDetailRow>
    </div>
  </CardContent></Card>;
}

function QueueDetailRow({ label, children, onEdit, info = false }: { label: string; children: React.ReactNode; onEdit?: () => void; info?: boolean }) {
  return <div className="grid min-h-[58px] grid-cols-[minmax(140px,0.7fr)_minmax(0,1fr)_32px] items-center gap-3 border-b border-border/80 py-2 text-sm">
    <span className="flex items-center gap-2 font-semibold text-foreground">{label}{info && <Info className="h-4 w-4 shrink-0 rounded-full fill-red-700 text-white" />}</span>
    <div className="min-w-0 break-words">{children}</div>
    <div className="flex justify-end">{onEdit && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Edit ${label}`} title={`Edit ${label}`} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>}</div>
  </div>;
}

function EditFieldRow({ label, children, required = false, info = false, help }: { label: string; children: React.ReactNode; required?: boolean; info?: boolean; help?: string }) {
  return <div className="grid min-h-[58px] grid-cols-[minmax(140px,0.7fr)_minmax(0,1fr)] items-center gap-3 border-b border-border/80 py-2 text-sm">
    <span className="flex items-center gap-2 font-semibold">{label}{required && <span className="text-destructive">*</span>}{info && <Info className="h-4 w-4 shrink-0 rounded-full fill-red-700 text-white" />}</span>
    <div className="min-w-0">{children}{help && <p className="mt-1 text-xs italic text-muted-foreground">{help}</p>}</div>
  </div>;
}

function DualListEditor({ label, options, value, onChange, info = false }: { label: string; options: Array<string | { value: string; label: string }>; value: string[]; onChange: (value: string[]) => void; info?: boolean }) {
  const [availableSelection, setAvailableSelection] = React.useState("");
  const [chosenSelection, setChosenSelection] = React.useState("");
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const available = normalized.filter((option) => !value.includes(option.value));
  const moveToChosen = () => {
    if (!availableSelection) return;
    onChange([...value, availableSelection]);
    setAvailableSelection("");
  };
  const moveToAvailable = () => {
    if (!chosenSelection) return;
    onChange(value.filter((item) => item !== chosenSelection));
    setChosenSelection("");
  };
  return <div className="border-b border-border/80 py-3">
    <p className="mb-2 flex items-center gap-2 text-sm font-semibold">{label}{info && <Info className="h-4 w-4 rounded-full fill-red-700 text-white" />}</p>
    <div className="grid grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] items-center gap-2">
      <div><p className="mb-1 text-xs font-medium text-muted-foreground">Available</p><select aria-label={`${label} available`} multiple size={6} value={availableSelection ? [availableSelection] : []} onChange={(event) => setAvailableSelection(event.target.value)} className="h-36 w-full rounded-md border bg-background p-2 text-sm">{available.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div className="grid gap-2"><Button type="button" variant="ghost" size="icon" aria-label={`Add ${label}`} title={`Add ${label}`} disabled={!availableSelection} onClick={moveToChosen}><ChevronRight className="h-4 w-4 text-primary" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label}`} title={`Remove ${label}`} disabled={!chosenSelection} onClick={moveToAvailable}><ChevronLeft className="h-4 w-4 text-primary" /></Button></div>
      <div><p className="mb-1 text-xs font-medium text-muted-foreground">Chosen</p><select aria-label={`${label} chosen`} multiple size={6} value={chosenSelection ? [chosenSelection] : []} onChange={(event) => setChosenSelection(event.target.value)} className="h-36 w-full rounded-md border bg-background p-2 text-sm">{value.map((item) => <option key={item} value={item}>{normalized.find((option) => option.value === item)?.label || item}</option>)}</select></div>
    </div>
  </div>;
}