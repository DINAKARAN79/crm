"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CommonFilterPanel, FilterSearch } from "@/components/crm/common-filter-panel";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  searchKey?: string;
  isLoading?: boolean;
  pageSize?: number;
  totalItems?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  serverPagination?: boolean;
  hidePagination?: boolean;
  filters?: React.ReactNode;
  onResetFilters?: () => void;
  theme?: "default" | "blue";
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchKey,
  isLoading = false,
  pageSize,
  totalItems,
  currentPage = 1,
  onPageChange,
  serverPagination = false,
  hidePagination = false,
  filters,
  onResetFilters,
  theme = "default",
  sorting: controlledSorting,
  onSortingChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const activeSorting = onSortingChange ? controlledSorting || [] : sorting;
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const effectivePageSize = pageSize ?? (serverPagination ? 20 : 10);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(activeSorting) : updater;
      if (onSortingChange) onSortingChange(next);
      else setSorting(next);
    },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    ...(serverPagination
      ? {}
      : { getPaginationRowModel: getPaginationRowModel() }),
    ...(onSortingChange ? { manualSorting: true } : { getSortedRowModel: getSortedRowModel() }),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting: activeSorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
  });

  const totalPages = totalItems
    ? Math.max(1, Math.ceil(totalItems / effectivePageSize))
    : serverPagination
      ? 1
      : table.getPageCount();

  const canPrevious = serverPagination ? currentPage > 1 : table.getCanPreviousPage();
  const canNext = serverPagination ? currentPage < totalPages : table.getCanNextPage();

  const goToPage = (page: number) => {
    onPageChange?.(page);
    if (!serverPagination) {
      table.setPageIndex(page - 1);
    }
  };

  const filterPanel = (searchKey || filters) ? (
    <CommonFilterPanel
      onReset={() => {
        setColumnFilters([]);
        onResetFilters?.();
      }}
    >
      {searchKey && (
        <FilterSearch
          value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
          onChange={(value) => table.getColumn(searchKey)?.setFilterValue(value)}
          placeholder={searchPlaceholder}
        />
      )}
      {filters}
    </CommonFilterPanel>
  ) : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {filterPanel}
        <div className={cn(
          "min-w-0 max-w-full overflow-x-auto rounded-md border",
          theme === "blue" && "rounded-xl border-sky-100 bg-white p-3 shadow-[0_8px_24px_-18px_rgba(37,99,235,0.45)]"
        )}>
          <Table>
            <TableHeader>
              <TableRow className={theme === "blue" ? "border-sky-100 bg-[#f0f7ff] hover:bg-[#f0f7ff]" : undefined}>
                {columns.map((_, index) => (
                  <TableHead
                    key={index}
                    className={theme === "blue" ? "h-10 text-[11px] font-semibold text-blue-700" : undefined}
                  >
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  className={theme === "blue" ? "border-sky-100" : undefined}
                >
                  {columns.map((_, colIndex) => (
                    <TableCell
                      key={colIndex}
                      className={theme === "blue" ? "h-[58px] py-2.5" : undefined}
                    >
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filterPanel}
      <div className={cn(
        "min-w-0 max-w-full overflow-x-auto rounded-md border",
        theme === "blue" && "rounded-xl border-sky-100 bg-white p-3 shadow-[0_8px_24px_-18px_rgba(37,99,235,0.45)]"
      )}>
        <Table className={theme === "blue" ? "min-w-[900px]" : undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className={theme === "blue" ? "border-sky-100 bg-[#f0f7ff] text-[#1479a8] hover:bg-[#f0f7ff]" : undefined}
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={theme === "blue" ? "h-10 text-[11px] font-semibold text-[#1479a8]" : undefined}
                >
                    {header.isPlaceholder ? null : onSortingChange && header.column.getCanSort() ? (
                      <button type="button" className="inline-flex items-center gap-1" onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span aria-hidden="true">{header.column.getIsSorted() === "asc" ? "↑" : header.column.getIsSorted() === "desc" ? "↓" : ""}</span>
                      </button>
                    ) : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={theme === "blue" ? "h-[58px] border-sky-100 text-[#334155] hover:bg-sky-50/70" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={theme === "blue" ? "py-2.5 text-[12px] text-slate-700" : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className={cn("h-24 text-center", theme === "blue" && "text-[#1479a8]")}>
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!hidePagination && <div className="flex items-center justify-between">
        <div className={cn("text-sm text-muted-foreground", theme === "blue" && "text-xs text-[#1479a8]")}>
          {totalItems
            ? `Showing ${(currentPage - 1) * effectivePageSize + 1} to ${Math.min(currentPage * effectivePageSize, totalItems)} of ${totalItems} ${theme === "blue" ? "leads" : "entries"}`
            : `Showing ${table.getFilteredSelectedRowModel().rows.length} of ${table.getFilteredRowModel().rows.length} rows`}
        </div>
        {theme === "blue" ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-sky-100 text-[#1479a8] hover:bg-sky-50"
              aria-label="Previous page"
              onClick={() => goToPage(currentPage - 1)}
              disabled={!canPrevious}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex h-8 min-w-8 items-center justify-center rounded-md bg-[#1479a8] px-2 text-xs font-semibold text-white">
              {currentPage}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-sky-100 text-[#1479a8] hover:bg-sky-50"
              aria-label="Next page"
              onClick={() => goToPage(currentPage + 1)}
              disabled={!canNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => goToPage(1)}
            disabled={!canPrevious}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => goToPage(currentPage - 1)}
            disabled={!canPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => goToPage(currentPage + 1)}
            disabled={!canNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => goToPage(totalPages)}
            disabled={!canNext}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>}
      </div>}
    </div>
  );
}
