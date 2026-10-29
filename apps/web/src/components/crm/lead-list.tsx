"use client";

import * as React from "react";

import Link from "next/link";

import { ColumnDef } from "@tanstack/react-table";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { DataTable } from "@/components/crm/data-table";

import { format } from "date-fns";

import { MoreHorizontal, Eye, Edit, Phone, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Lead {
  id: string;
  leadNumber: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  statusLabel?: string;
  rating?: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
}

interface LeadListProps {
  leads: Lead[];
  isLoading?: boolean;
  totalItems?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  canDelete?: boolean;
  onDelete?: (lead: Lead) => void | Promise<void>;
  sorting?: { id: string; desc: boolean }[];
  onSortingChange?: (sorting: { id: string; desc: boolean }[]) => void;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  incoming: "bg-cyan-100 text-cyan-800",
  prospect: "bg-yellow-100 text-yellow-800",
  site_visit_scheduled: "bg-orange-100 text-orange-800",
  site_visit_happened: "bg-amber-100 text-amber-800",
  booked: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

export function getLeadColumns({
  canDelete = false,
  onDelete,
}: {
  canDelete?: boolean;
  onDelete?: (lead: Lead) => void | Promise<void>;
} = {}): ColumnDef<Lead>[] {
  return [
    {
      accessorKey: "leadNumber",
      header: () => <span className="whitespace-nowrap">Lead Number</span>,
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <Link href={`/leads/${lead.id}`} className="whitespace-nowrap font-mono text-sm font-medium text-[#1479a8] hover:text-[#075d91] hover:underline">
            {lead.leadNumber || "—"}
          </Link>
        );
      },
    },
    {
      accessorKey: "firstName",
      header: "Name",
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <Link href={`/leads/${lead.id}`} className="group block min-w-40">
            <span className="block truncate font-semibold text-[#075d91] group-hover:text-[#1479a8] group-hover:underline">
              {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead"}
            </span>
            {lead.company && (
              <span className="block truncate text-[11px] font-normal text-slate-500">
                {lead.company}
              </span>
            )}
          </Link>
        );
      },
    },
    {
      accessorKey: "company",
      header: "Company",
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-[#1479a8]">
          <Phone className="h-3.5 w-3.5 fill-sky-100" />
          {row.original.phone || "—"}
        </span>
      ),
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("source")}</Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const label = row.original.statusLabel || status.replaceAll("_", " ");
        return (
          <Badge className={cn(statusColors[status])}>
            {label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "assignedTo",
      header: "Assigned To",
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => {
        const created = new Date(row.getValue("createdAt") as string);
        return Number.isNaN(created.getTime()) ? "—" : format(created, "MMM d, yyyy");
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const lead = row.original;
        const canDeleteLead = canDelete && Boolean(onDelete);

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/leads/${lead.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {canDeleteLead && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(event) => {
                    event.preventDefault();
                    void onDelete?.(lead);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}

export function LeadList({
  leads,
  isLoading,
  totalItems,
  currentPage,
  onPageChange,
  canDelete = false,
  onDelete,
  sorting,
  onSortingChange,
}: LeadListProps) {
  const columns = React.useMemo(
    () => getLeadColumns({ canDelete, onDelete }),
    [canDelete, onDelete],
  );

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={leads}
        theme="blue"
        isLoading={isLoading}
        totalItems={totalItems}
        currentPage={currentPage}
        onPageChange={onPageChange}
        serverPagination
        sorting={sorting}
        onSortingChange={onSortingChange}
      />
    </div>
  );
}