"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { MoreHorizontal, Eye, CheckCircle2, RotateCcw, Clock, CalendarClock, ChevronDown, ChevronUp, Layers3 } from "lucide-react";
import { CommonFilterPanel, FilterDate, FilterSearch, FilterSelect } from "@/components/crm/common-filter-panel";
import { useListView } from "@/components/crm/list-view-control";
import { ListPageHeader } from "@/components/crm/list-page-header";
import { formatDateTime } from "@/lib/date-format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { followUpApi } from "@/lib/api";
import { RecordSubjectCell } from "@/components/crm/record-subject-cell";

interface FollowUp {
  id: string;
  followUpNumber: string;
  title: string;
  description: string;
  dueDate: string;
  isCompleted: boolean;
  isMissed: boolean;
  completedAt?: string;
  owner: string;
  leadId?: string;
  relatedTo?: string;
  relatedHref?: string;
}

const INITIAL_FOLLOW_UPS = 10;

const columns: ColumnDef<FollowUp>[] = [
  {
    accessorKey: "followUpNumber",
    header: "Follow-up ID",
    cell: ({ row }) => {
      const item = row.original;
      const number = item.followUpNumber || "—";
      return (
        <RecordSubjectCell
          href={`/follow-ups/${item.id}`}
          subject={number}
          title={number}
          className="max-w-none"
        />
      );
    },
  },
  {
    accessorKey: "title",
    header: "Follow-up",
    cell: ({ row }) => {
      const item = row.original;
      const subject = item.title || "Follow-up";
      return (
        <RecordSubjectCell
          href={`/follow-ups/${item.id}`}
          subject={subject}
          title={`${subject} (${item.followUpNumber})`}
        />
      );
    },
  },
  {
    accessorKey: "dueDate",
    header: "Due Date",
    cell: ({ row }) => {
      const value = row.getValue("dueDate");
      if (!value) return "-";
      const date = new Date(value as string);
      const isOverdue = !row.original.isCompleted && !row.original.isMissed && date < new Date();
      return (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span className={isOverdue ? "text-red-500" : ""}>{formatDateTime(date)}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "isCompleted",
    header: "Status",
    cell: ({ row }) => {
      const completed = row.original.isCompleted;
      const missed = row.original.isMissed;
      return (
        <Badge className={completed ? "bg-green-100 text-green-800" : missed ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>
          {completed ? "Completed" : missed ? "Missed" : "Scheduled"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "owner",
    header: "Owner",
  },
  {
    accessorKey: "relatedTo",
    header: "Related To",
    cell: ({ row }) => {
      const item = row.original;
      if (!item.relatedTo) return "-";
      if (!item.relatedHref) return item.relatedTo;
      return (
        <Link href={item.relatedHref} className="hover:underline text-primary">
          {item.relatedTo}
        </Link>
      );
    },
  },
];

function mapFollowUp(item: any): FollowUp {
  const owner = item.owner
    ? `${item.owner.firstName || ""} ${item.owner.lastName || ""}`.trim()
    : "";
  const leadName = item.lead
    ? `${item.lead.firstName || ""} ${item.lead.lastName || ""}`.trim() || item.lead.phone || undefined
    : undefined;
  return {
    id: item.id,
    followUpNumber: item.followUpNumber,
    title: item.title,
    description: item.description || "",
    dueDate: item.dueDate || "",
    isCompleted: Boolean(item.isCompleted),
    isMissed: Boolean(item.isMissed),
    completedAt: item.completedAt || undefined,
    owner: owner || "-",
    leadId: item.leadId || undefined,
    relatedTo: leadName,
    relatedHref: item.leadId ? `/leads/${item.leadId}` : undefined,
  };
}

export default function FollowUpsPage() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get("leadId");
  const { toast } = useToast();
  const listViews = useListView("FOLLOW_UP");
  const [status, setStatus] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [dateError, setDateError] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);
  const [followUps, setFollowUps] = React.useState<FollowUp[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const totalItemsRef = React.useRef(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [actionId, setActionId] = React.useState("");

  const loadFollowUps = React.useCallback(async () => {
    if (!listViews.ready) return;
    try {
      setIsLoading(true);
      const params: Record<string, any> = {
        page: 1,
        limit: showAll ? Math.max(totalItemsRef.current, INITIAL_FOLLOW_UPS) : INITIAL_FOLLOW_UPS,
        statusOrder: true,
      };
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      if (leadId) params.leadId = leadId;
      Object.assign(params, listViews.params);
      const res = await followUpApi.list(params);
      if (res.data.success && res.data.data) {
        setFollowUps(res.data.data.map(mapFollowUp));
        const total = res.data.pagination?.total ?? res.data.data.length;
        totalItemsRef.current = total;
        setTotalItems(total);
      } else {
        setFollowUps([]);
        totalItemsRef.current = 0;
        setTotalItems(0);
      }
    } catch (error: any) {
      setFollowUps([]);
      totalItemsRef.current = 0;
      setTotalItems(0);
      toast({
        title: "Unable to load follow-ups",
        description: error?.response?.data?.error || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, leadId, listViews.ready, listViews.queryKey, search, showAll, status, toast]);

  React.useEffect(() => {
    void loadFollowUps();
  }, [loadFollowUps]);

  const toggleStatus = async (item: FollowUp) => {
    setActionId(item.id);
    try {
      const res = item.isCompleted
        ? await followUpApi.reopen(item.id)
        : await followUpApi.complete(item.id);
      if (res.data.success) {
        toast({
          title: item.isCompleted ? "Follow-up reopened" : "Follow-up completed",
          description: item.title,
        });
        await loadFollowUps();
      }
    } catch (error: any) {
      toast({
        title: "Unable to update follow-up",
        description: error?.response?.data?.error || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionId("");
    }
  };

  const renderActions = (item: FollowUp) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={actionId === item.id}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {item.relatedHref && (
          <DropdownMenuItem asChild>
            <Link href={item.relatedHref}>
              <Eye className="mr-2 h-4 w-4" />
              View lead
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void toggleStatus(item)}>
          {item.isCompleted ? (
            <>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reopen
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark complete
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const changeDueDate = (field: "from" | "to", value: string) => {
    const nextFrom = field === "from" ? value : dateFrom;
    const nextTo = field === "to" ? value : dateTo;
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setDateError("To Date cannot be earlier than From Date.");
      return;
    }
    setDateError("");
    if (field === "from") setDateFrom(value);
    else setDateTo(value);
    setShowAll(false);
  };

  const allColumns: ColumnDef<FollowUp>[] = [
    ...columns,
    { id: "actions", cell: ({ row }) => renderActions(row.original) },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-white via-sky-50 to-blue-50 px-4 py-4 shadow-sm dark:border-sky-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
        <ListPageHeader
          className="m-0"
          icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />}
          title="Follow-ups"
          subtitle={leadId ? "Follow-ups related to this lead" : "Track every open follow-up across your leads"}
          view={listViews.control}
          actions={!isLoading ? (
            <div className="hidden shrink-0 rounded-xl border border-white/80 bg-white/80 px-4 py-2 text-right shadow-sm dark:border-sky-900 dark:bg-slate-950 sm:block">
              <p className="text-lg font-bold leading-tight text-[#075d91] dark:text-sky-100">{totalItems}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total follow-ups</p>
            </div>
          ) : null}
        />
      </div>

      {listViews.dialog}
      <div className="space-y-4">
        <CommonFilterPanel
          onReset={() => {
            setStatus("");
            setSearch("");
            setDateFrom("");
            setDateTo("");
            setDateError("");
            setShowAll(false);
          }}
        >
          <FilterSearch
            id="follow-up-search"
            label="Search"
            value={search}
            onChange={(value) => {
              setSearch(value);
              setShowAll(false);
            }}
            placeholder="Search by title, details, or number..."
          />
          <FilterSelect
            id="follow-up-status"
            label="Status"
            icon={Layers3}
            value={status}
            onChange={(value) => {
              setStatus(value);
              setShowAll(false);
            }}
            options={[
              { label: "All statuses", value: "" },
              { label: "Scheduled", value: "SCHEDULED" },
              { label: "Missed", value: "MISSED" },
              { label: "Completed", value: "COMPLETED" },
              { label: "Cancelled", value: "CANCELLED" },
            ]}
          />
          <FilterDate
            id="follow-up-from"
            label="From Date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(value) => changeDueDate("from", value)}
          />
          <FilterDate
            id="follow-up-to"
            label="To Date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(value) => changeDueDate("to", value)}
          />
        </CommonFilterPanel>
        {dateError && <p role="alert" className="text-xs font-medium text-rose-700">{dateError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-800">Your follow-up schedule</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {isLoading
                ? "Loading follow-ups..."
                : `Showing ${followUps.length} of ${totalItems} follow-up${totalItems === 1 ? "" : "s"}`}
            </p>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold text-[#1479a8] dark:bg-slate-900 dark:text-sky-200">
            {status ? status.toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase()) : "All statuses"}
          </span>
        </div>

        <DataTable
          columns={allColumns}
          data={followUps}
          isLoading={isLoading}
          pageSize={INITIAL_FOLLOW_UPS}
          serverPagination
          hidePagination
          theme="blue"
          sorting={listViews.sorting ? [listViews.sorting] : []}
          onSortingChange={(next) => listViews.onSortingChange(next[0] || null)}
        />
        {!isLoading && totalItems > INITIAL_FOLLOW_UPS && <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-xs text-slate-500">
            {showAll ? `You're viewing all ${totalItems} follow-ups` : `Showing the first ${INITIAL_FOLLOW_UPS} of ${totalItems} follow-ups`}
          </p>
          <Button
            type="button"
            onClick={() => setShowAll((expanded) => !expanded)}
            className="h-10 gap-2 rounded-full bg-gradient-to-r from-blue-700 to-sky-600 px-6 text-sm font-semibold text-white shadow-md shadow-blue-900/15 transition hover:-translate-y-0.5 hover:from-blue-800 hover:to-sky-700 hover:shadow-lg"
          >
            {showAll ? <><ChevronUp className="h-4 w-4" />Show first 10</> : <><ChevronDown className="h-4 w-4" />View all {totalItems} follow-ups</>}
          </Button>
        </div>}
      </div>
    </div>
  );
}