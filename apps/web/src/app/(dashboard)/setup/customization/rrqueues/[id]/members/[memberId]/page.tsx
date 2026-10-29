"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { rrQueueApi, userApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Tab = "related" | "details";
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

function displayDate(value?: string) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function RRMemberDetailsPage({ params }: { params: { id: string; memberId: string } }) {
  const { toast } = useToast();
  const [member, setMember] = React.useState<any>(null);
  const [users, setUsers] = React.useState<any[]>([]);
  const [tab, setTab] = React.useState<Tab>("details");
  const [editing, setEditing] = React.useState(false);
  const [draftUserId, setDraftUserId] = React.useState("");
  const [draftUserType, setDraftUserType] = React.useState<(typeof MEMBER_USER_TYPES)[number]>("Sales");
  const [draftActiveMember, setDraftActiveMember] = React.useState(true);
  const [draftAvailable, setDraftAvailable] = React.useState(true);
  const [draftWorking, setDraftWorking] = React.useState(true);
  const [draftWeekOff, setDraftWeekOff] = React.useState(false);
  const [draftMaxLeadCapacity, setDraftMaxLeadCapacity] = React.useState("-1");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    Promise.all([rrQueueApi.member(params.id, params.memberId), userApi.list({ limit: 200 })])
      .then(([memberResponse, usersResponse]) => {
        setMember(memberResponse.data.data);
        setUsers(usersResponse.data.data || []);
      })
      .catch((error: any) => toast({
        title: "Unable to load RRMember",
        description: error?.response?.data?.error || "Try again.",
        variant: "destructive" as any,
      }));
  }, [params.id, params.memberId, toast]);

  const matchesSelectedType = (userId: string, userType: (typeof MEMBER_USER_TYPES)[number]) => {
    const user = users.find((candidate) => candidate.id === userId && candidate.isActive);
    if (!user) return false;
    return MEMBER_PROFILE_NAMES[userType].includes(user.profile?.name?.toLowerCase());
  };
  const selectionUnchanged = draftUserId === member?.user?.id && draftUserType === member?.userType;
  const canSaveSelection = selectionUnchanged || (!!draftUserId && matchesSelectedType(draftUserId, draftUserType));

  const saveChanges = async () => {
    const maxLeadCapacity = Number(draftMaxLeadCapacity);
    if (!draftMaxLeadCapacity.trim() || !Number.isInteger(maxLeadCapacity) || maxLeadCapacity < -1) {
      toast({ title: "Invalid capacity", description: "Enter -1 for unlimited or a whole number of leads.", variant: "destructive" as any });
      return;
    }
    const data: {
      userId?: string;
      userType?: (typeof MEMBER_USER_TYPES)[number];
      activeMember?: boolean;
      isAvailable?: boolean;
      isWorking?: boolean;
      weekOff?: boolean;
      maxLeadCapacity?: number;
    } = {};
    if (draftUserId !== member.user.id) data.userId = draftUserId;
    if (draftUserType !== member.userType) data.userType = draftUserType;
    if (draftActiveMember !== member.activeMember) data.activeMember = draftActiveMember;
    if (draftAvailable !== member.isAvailable) data.isAvailable = draftAvailable;
    if (draftWorking !== member.isWorking) data.isWorking = draftWorking;
    if (draftWeekOff !== member.weekOff) data.weekOff = draftWeekOff;
    if (maxLeadCapacity !== Number(member.maxLeadCapacity ?? -1)) data.maxLeadCapacity = maxLeadCapacity;
    if (!Object.keys(data).length) {
      setEditing(false);
      return;
    }
    try {
      setSaving(true);
      await rrQueueApi.updateMember(params.id, params.memberId, data);
      const response = await rrQueueApi.member(params.id, params.memberId);
      setMember(response.data.data);
      setEditing(false);
      toast({ title: "RRMember updated", description: "Your changes were saved." });
    } catch (error: any) {
      toast({
        title: "Unable to update RRMember",
        description: error?.response?.data?.error || "Try again.",
        variant: "destructive" as any,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!member) return <div className="py-12 text-center text-muted-foreground">Loading RRMember...</div>;

  const userName = `${member.user.firstName} ${member.user.lastName}`.trim();
  const memberName = member.name || userName;
  const startEditing = () => {
    setDraftUserId(member.user.id);
    setDraftUserType(member.userType);
    setDraftActiveMember(Boolean(member.activeMember));
    setDraftAvailable(Boolean(member.isAvailable));
    setDraftWorking(Boolean(member.isWorking));
    setDraftWeekOff(Boolean(member.weekOff));
    setDraftMaxLeadCapacity(String(member.maxLeadCapacity ?? -1));
    setEditing(true);
  };
  const cancelEditing = () => {
    setDraftUserId(member.user.id);
    setDraftUserType(member.userType);
    setDraftActiveMember(Boolean(member.activeMember));
    setDraftAvailable(Boolean(member.isAvailable));
    setDraftWorking(Boolean(member.isWorking));
    setDraftWeekOff(Boolean(member.weekOff));
    setDraftMaxLeadCapacity(String(member.maxLeadCapacity ?? -1));
    setEditing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/setup/customization/rrqueues/${params.id}`} aria-label="Back to queue" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500 text-white">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Queue Member</p>
          <h1 className="text-3xl font-semibold">{memberName}</h1>
        </div>
        </div>
        {!editing && <Button onClick={startEditing}><Pencil className="mr-2 h-4 w-4" />Edit</Button>}
      </div>

      <section className="rounded-2xl bg-card px-6 py-4 shadow-sm">
        <div className="flex gap-8 border-b">
          <Link className={`border-b-2 px-3 py-2 text-sm ${tab === "related" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} href={`/setup/customization/rrqueues/${params.id}`} onClick={() => setTab("related")}>Related</Link>
          <button className={`border-b-2 px-3 py-2 text-sm ${tab === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("details")}>Details</button>
        </div>

        {tab === "details" && (
          <Card className="mt-4 border-0 shadow-none">
            {editing && <div className="px-6 pt-4 text-right text-sm text-muted-foreground"><span className="text-destructive">*</span> = Required Information</div>}
            <CardContent className="grid gap-x-12 gap-y-0 px-0 md:grid-cols-2">
              <div>
                <DetailRow label="Name">{memberName}</DetailRow>
                <DetailRow label="Round Robin Queue"><Link className="text-primary underline decoration-dotted underline-offset-4" href={`/setup/customization/rrqueues/${params.id}`}>{member.rrQueue.name}</Link></DetailRow>
                <DetailRow
                  label={<span>User <span className="text-destructive">*</span></span>}
                  editing={editing}
                  editor={<select id="rrmember-edit-user" aria-label="User" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draftUserId} onChange={(event) => setDraftUserId(event.target.value)}><option value="">Select user</option>{users.filter((user) => user.isActive && MEMBER_PROFILE_NAMES[draftUserType].includes(user.profile?.name?.toLowerCase())).map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName} ({user.email})</option>)}</select>}
                >
                  <div>{userName}<span className="ml-2 text-muted-foreground">{member.user.email}</span></div>
                </DetailRow>
                <DetailRow label="Created">{displayDate(member.createdAt)}</DetailRow>
                <DetailRow label="User Type" editing={editing} editor={<select id="rrmember-edit-user-type" aria-label="User Type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draftUserType} onChange={(event) => { const value = event.target.value as (typeof MEMBER_USER_TYPES)[number]; setDraftUserType(value); if (!matchesSelectedType(draftUserId, value)) setDraftUserId(""); }}>{MEMBER_USER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>}>{member.userType}</DetailRow>
              </div>
              <div>
                <DetailRow label="No of New Leads">{member.noOfNewLeads}</DetailRow>
                <DetailRow label="Leads Owned">{member.leadsOwned}</DetailRow>
                <DetailRow label="Last Assigned">{displayDate(member.lastAssignedAt)}</DetailRow>
                <DetailRow label="Last Modified">{displayDate(member.updatedAt)}</DetailRow>
                <DetailRow
                  label="Week Off"
                  editing={editing}
                  editor={<input aria-label="Week Off" type="checkbox" checked={draftWeekOff} onChange={(event) => setDraftWeekOff(event.target.checked)} className="h-4 w-4" />}
                >
                  <Badge variant={member.weekOff ? "secondary" : "default"}>{member.weekOff ? "Yes" : "No"}</Badge>
                </DetailRow>
                <DetailRow
                  label="Max Lead Capacity"
                  editing={editing}
                  editor={<input aria-label="Max Lead Capacity" type="number" min={-1} step={1} value={draftMaxLeadCapacity} onChange={(event) => setDraftMaxLeadCapacity(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />}
                >
                  {Number(member.maxLeadCapacity ?? -1) < 0 ? "Unlimited" : member.maxLeadCapacity}
                </DetailRow>
                <DetailRow
                  label="Active Member"
                  editing={editing}
                  editor={<input aria-label="Active Member" type="checkbox" checked={draftActiveMember} onChange={(event) => setDraftActiveMember(event.target.checked)} className="h-4 w-4" />}
                >
                  <Badge variant={member.activeMember ? "default" : "secondary"}>{member.activeMember ? "Active" : "Inactive"}</Badge>
                </DetailRow>
                <DetailRow
                  label="Available"
                  editing={editing}
                  editor={<input aria-label="Available" type="checkbox" checked={draftAvailable} onChange={(event) => setDraftAvailable(event.target.checked)} className="h-4 w-4" />}
                >
                  <Badge variant={member.isAvailable ? "default" : "secondary"}>{member.isAvailable ? "Yes" : "No"}</Badge>
                </DetailRow>
                <DetailRow
                  label="Working"
                  editing={editing}
                  editor={<input aria-label="Working" type="checkbox" checked={draftWorking} onChange={(event) => setDraftWorking(event.target.checked)} className="h-4 w-4" />}
                >
                  <Badge variant={member.isWorking ? "default" : "secondary"}>{member.isWorking ? "Yes" : "No"}</Badge>
                </DetailRow>
              </div>
            </CardContent>
            {editing && <div className="sticky bottom-0 flex justify-center gap-3 border-t bg-card px-6 py-4 shadow-[0_-4px_8px_rgba(0,0,0,0.12)]"><Button variant="outline" onClick={cancelEditing} disabled={saving}>Cancel</Button><Button onClick={() => void saveChanges()} disabled={saving || !canSaveSelection}>{saving ? "Saving..." : "Save"}</Button></div>}
          </Card>
        )}
      </section>
    </div>
  );
}

function DetailRow({ label, children, editing = false, editor }: { label: React.ReactNode; children: React.ReactNode; editing?: boolean; editor?: React.ReactNode }) {
  return (
    <div className="grid min-h-[60px] grid-cols-[minmax(120px,0.55fr)_minmax(0,1fr)] items-center gap-4 border-b py-2 text-sm">
      <span className="font-semibold">{label}</span>
      <div className="min-w-0 break-words">
        {editing && editor ? editor : children}
      </div>
    </div>
  );
}