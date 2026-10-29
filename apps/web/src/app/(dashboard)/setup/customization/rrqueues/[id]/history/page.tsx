"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, History, RefreshCw } from "lucide-react";
import { rrQueueApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 100;

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function RRQueueHistoryPage({ params }: { params: { id: string } }) {
  const { toast } = useToast();
  const [queue, setQueue] = React.useState<any>(null);
  const [entries, setEntries] = React.useState<any[]>([]);
  const [page, setPage] = React.useState(1);
  const [pagination, setPagination] = React.useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [queueResponse, historyResponse] = await Promise.all([
        rrQueueApi.get(params.id),
        rrQueueApi.history(params.id, { page, limit: PAGE_SIZE }),
      ]);
      setQueue(queueResponse.data.data);
      setEntries(historyResponse.data.data || []);
      setPagination(historyResponse.data.pagination || { total: 0, totalPages: 1 });
    } catch (error: any) {
      toast({ title: "Unable to load queue history", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
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
          <History className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Round Robin History</h1>
        </div>
        <Button variant="outline" size="icon" aria-label="Refresh history" title="Refresh history" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{pagination.total} items · Sorted by Date</p>
    </div>

    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/70"><tr className="border-b text-left text-muted-foreground"><th className="w-12 px-4 py-2.5 font-medium">#</th><th className="px-4 py-2.5 font-medium">Date</th><th className="px-4 py-2.5 font-medium">Field</th><th className="px-4 py-2.5 font-medium">User</th><th className="px-4 py-2.5 font-medium">Original Value</th><th className="px-4 py-2.5 font-medium">New Value</th></tr></thead>
        <tbody>
          {entries.map((entry, index) => <tr className="border-b last:border-0 hover:bg-muted/30" key={entry.id}>
            <td className="px-4 py-2.5 text-muted-foreground">{(page - 1) * PAGE_SIZE + index + 1}</td>
            <td className="whitespace-nowrap px-4 py-2.5">{formatDate(entry.createdAt)}</td>
            <td className="px-4 py-2.5">{entry.field}</td>
            <td className="px-4 py-2.5">{entry.userName || "-"}</td>
            <td className="px-4 py-2.5">{entry.originalValue ?? "-"}</td>
            <td className="px-4 py-2.5">{entry.newValue ?? "-"}</td>
          </tr>)}
          {!loading && !entries.length && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>No history found.</td></tr>}
          {loading && !entries.length && <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>Loading history...</td></tr>}
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