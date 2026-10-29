"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, RefreshCw, Users, X } from "lucide-react";
import { rrQueueApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 100;

export default function RRQueueMembersPage({ params }: { params: { id: string } }) {
  const { toast } = useToast();
  const [queue, setQueue] = React.useState<any>(null);
  const [members, setMembers] = React.useState<any[]>([]);
  const [page, setPage] = React.useState(1);
  const [pagination, setPagination] = React.useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [queueResponse, memberResponse] = await Promise.all([
        rrQueueApi.get(params.id),
        rrQueueApi.members(params.id, { page, limit: PAGE_SIZE }),
      ]);
      setQueue(queueResponse.data.data);
      setMembers(memberResponse.data.data || []);
      setPagination(memberResponse.data.pagination || { total: 0, totalPages: 1 });
    } catch (error: any) {
      toast({ title: "Unable to load RRMembers", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  }, [page, params.id, toast]);

  React.useEffect(() => { void load(); }, [load]);

  return <div className="space-y-5">
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Link className="hover:text-primary" href="/setup/customization/rrqueues">Round Robins</Link>
        <span aria-hidden="true">&gt;</span>
        <Link className="hover:text-primary" href={`/setup/customization/rrqueues/${params.id}`}>{queue?.name || "Round Robin Queue"}</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/setup/customization/rrqueues/${params.id}`} aria-label="Back to queue" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <Users className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">RRMembers</h1>
        </div>
        <Button variant="outline" size="icon" aria-label="Refresh members" title="Refresh members" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{pagination.total} items</p>
    </div>

    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/70"><tr className="border-b text-left text-muted-foreground"><th className="w-12 px-4 py-2.5 font-medium">#</th><th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">User</th><th className="px-4 py-2.5 font-medium">User Type</th><th className="px-4 py-2.5 font-medium">Active Member</th><th className="px-4 py-2.5 font-medium">Available</th><th className="px-4 py-2.5 font-medium">Working</th><th className="px-4 py-2.5 font-medium">Week Off</th><th className="px-4 py-2.5 font-medium">Max Lead Capacity</th><th className="px-4 py-2.5 font-medium">Last Assigned</th></tr></thead>
        <tbody>
          {members.map((member, index) => <tr className="border-b last:border-0 hover:bg-muted/30" key={member.id}>
            <td className="px-4 py-2.5 text-muted-foreground">{(page - 1) * PAGE_SIZE + index + 1}</td>
            <td className="px-4 py-2.5"><Link className="font-medium text-primary hover:underline" href={`/setup/customization/rrqueues/${params.id}/members/${member.id}`}>{member.name}</Link></td>
            <td className="px-4 py-2.5"><Link className="text-primary hover:underline" href={`/setup/customization/rrqueues/${params.id}/members/${member.id}`}>{member.user.firstName} {member.user.lastName}</Link></td>
            <td className="px-4 py-2.5">{member.userType}</td>
            <td className="px-4 py-2.5">{member.activeMember ? <Check aria-label="Active member" className="h-5 w-5 text-muted-foreground" strokeWidth={2.5} /> : <X aria-label="Inactive member" className="h-5 w-5 text-muted-foreground" />}</td>
            <td className="px-4 py-2.5">{member.isAvailable ? <Check aria-label="Available" className="h-5 w-5 text-muted-foreground" strokeWidth={2.5} /> : <X aria-label="Unavailable" className="h-5 w-5 text-muted-foreground" />}</td>
            <td className="px-4 py-2.5">{member.isWorking ? <Check aria-label="Working" className="h-5 w-5 text-muted-foreground" strokeWidth={2.5} /> : <X aria-label="Not working" className="h-5 w-5 text-muted-foreground" />}</td>
            <td className="px-4 py-2.5">{member.weekOff ? "Yes" : "No"}</td>
            <td className="px-4 py-2.5">{Number(member.maxLeadCapacity ?? -1) < 0 ? "Unlimited" : member.maxLeadCapacity}</td>
            <td className="px-4 py-2.5">{member.lastAssignedAt ? new Date(member.lastAssignedAt).toLocaleString() : "-"}</td>
          </tr>)}
          {!loading && !members.length && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={10}>No RRMembers found.</td></tr>}
          {loading && !members.length && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={10}>Loading RRMembers...</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>Page {page} of {pagination.totalPages}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
        <Button variant="outline" size="sm" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </div>
  </div>;
}