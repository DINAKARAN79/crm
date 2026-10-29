"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Filter,
  Loader2,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { CommonFilterPanel, FilterSearch } from "@/components/crm/common-filter-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSiteVisitStatusColumn, reportStatusCell, siteVisitStatusLabel, SiteVisitStatusBadge } from "@/components/crm/site-visit-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crmDateToUtcStart } from "@dct-crm/shared";
import { useAuth } from "@/contexts/auth-context";

interface Report {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  objectName: string;
  columns: string[];
  filters?: unknown;
  filterLogic?: "AND" | "OR";
  aggregates?: unknown;
  groupBy?: string | null;
  groupColumn?: string | null;
  rowGroups?: string[];
  columnGroups?: string[];
  crossFilter?: { objectName: string; mode: "with" | "without" } | null;
  sortBy?: string | null;
  sortOrder?: string | null;
  createdAt: string;
  config?: {
    showRowCounts?: boolean;
    showDetailRows?: boolean;
    showSubtotals?: boolean;
    showGrandTotal?: boolean;
    rowGroups?: string[];
    columnGroups?: string[];
    groupDateBuckets?: Record<string, "day" | "week" | "month" | "quarter" | "year">;
    aggregates?: { function: string; field?: string; label?: string }[];
  };
}

interface ReportResult {
  columns: string[];
  columnTypes?: Record<string, string>;
  totalRows: number;
  rows: Record<string, unknown>[];
  summary?: Record<string, number>;
  groups?: {
    group: string;
    groupValues?: Record<string, string>;
    count: number;
    summary?: Record<string, number>;
    rows?: Record<string, unknown>[];
  }[];
  columnGroups?: { group: string; count: number }[];
  pivot?: {
    aggregate?: { function: string; field?: string; label?: string };
    aggregateLabel?: string;
    columns: string[];
    columnValues?: Record<string, Record<string, string>>;
    rows: { group: string; groupValues?: Record<string, string>; values: Record<string, number> }[];
  };
}

interface ReportFilter {
  field: string;
  operator: string;
  value: unknown;
}

interface AvailableReportField {
  key: string;
  label: string;
}

export default function ReportDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { getLeadStatusLabel, leadStatuses } = useAuth();
  const reportId = params?.id as string;
  const [report, setReport] = React.useState<Report | null>(null);
  const [result, setResult] = React.useState<ReportResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState("");
  const [runError, setRunError] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [resultDateField, setResultDateField] = React.useState("");
  const [resultFrom, setResultFrom] = React.useState("");
  const [resultTo, setResultTo] = React.useState("");
  const [resultSearch, setResultSearch] = React.useState("");
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});
  const [showRowCounts, setShowRowCounts] = React.useState(true);
  const [showDetailRows, setShowDetailRows] = React.useState(true);
  const [showSubtotals, setShowSubtotals] = React.useState(false);
  const [showGrandTotal, setShowGrandTotal] = React.useState(true);
  const [editableFilters, setEditableFilters] = React.useState<ReportFilter[]>([]);
  const [availableFields, setAvailableFields] = React.useState<AvailableReportField[]>([]);
  const filtersHydratedRef = React.useRef(false);
  const transientPreviewRef = React.useRef(false);
  const previewLoadedRef = React.useRef<string | null>(null);

  const reportFilters = Array.isArray(report?.filters)
    ? (report.filters as ReportFilter[])
    : [];
  const activeFilters = filtersHydratedRef.current ? editableFilters : reportFilters;
  const hasGrouping = Boolean(
    report?.rowGroups?.length ||
    report?.groupBy ||
    report?.columnGroups?.length ||
    report?.groupColumn ||
    report?.config?.rowGroups?.length ||
    report?.config?.columnGroups?.length,
  );
  const filterFields = Array.from(new Set([
    ...availableFields.map((field) => field.key),
    ...(report?.columns || []),
    ...activeFilters.map((filter) => filter.field),
  ]));
  const filterFieldLabel = (field: string) => availableFields.find((item) => item.key === field)?.label || field;
  const filterOperators = ["equals", "notEquals", "contains", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "isBlank", "isNotBlank"];
  const formatReportCell = (objectName: string | undefined, field: string, value: unknown) =>
    objectName === "Lead" && field === "status"
      ? getLeadStatusLabel(String(value ?? ""))
      : reportStatusCell(objectName, field, value);
  const formatGroupedField = (objectName: string | undefined, field: string, value: string) =>
    objectName === "Lead" && field === "status"
      ? getLeadStatusLabel(value)
      : isSiteVisitStatusColumn(objectName, field) ? siteVisitStatusLabel(value) : value;
  const resultDateFields =
    result?.columns.filter((column) => result.columnTypes?.[column] === "date") || [];
  const activeResultDateField = resultDateField || resultDateFields[0] || "";
  const fromTimestamp = resultFrom
    ? crmDateToUtcStart(resultFrom).getTime()
    : Number.NEGATIVE_INFINITY;
  const toTimestamp = resultTo
    ? crmDateToUtcStart(resultTo).getTime() + 24 * 60 * 60 * 1000 - 1
    : Number.POSITIVE_INFINITY;
  const dateRangeError = fromTimestamp > toTimestamp;
  const matchesResultSearch = React.useCallback(
    (row: Record<string, unknown>) => {
      const query = resultSearch.trim().toLowerCase();
      return (
        !query ||
        result?.columns.some((column) =>
          String(row[column] ?? "")
            .toLowerCase()
            .includes(query),
        ) || false
      );
    },
    [resultSearch, result?.columns],
  );
  const matchesResultDate = React.useCallback(
    (row: Record<string, unknown>) => {
      if (
        dateRangeError ||
        !activeResultDateField ||
        (!resultFrom && !resultTo)
      )
        return true;
      const value = row[activeResultDateField];
      if (value == null) return false;
      const timestamp = new Date(String(value)).getTime();
      if (Number.isNaN(timestamp)) return false;
      return timestamp >= fromTimestamp && timestamp <= toTimestamp;
    },
    [activeResultDateField, dateRangeError, fromTimestamp, resultFrom, resultTo, toTimestamp],
  );
  const matchesResultRow = React.useCallback(
    (row: Record<string, unknown>) =>
      matchesResultSearch(row) && matchesResultDate(row),
    [matchesResultDate, matchesResultSearch],
  );
  const filteredResultRows = result?.rows.filter(matchesResultRow) || [];
  const filteredGroups = result?.groups?.map((group) => {
    const groupMatches = matchesResultSearch({
      ...group.groupValues,
      group: group.group,
    });
    const rows = (group.rows || []).filter(matchesResultRow);
    return { ...group, rows: groupMatches ? group.rows : rows };
  }).filter((group) =>
    matchesResultSearch({ ...group.groupValues, group: group.group }) ||
    (group.rows?.length || 0) > 0,
  ) || [];
  const filteredPivotRows = result?.pivot?.rows.filter((row) => {
    const query = resultSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      row.group,
      ...Object.values(row.groupValues || {}),
      ...Object.values(row.values),
    ].some((value) => String(value ?? "").toLowerCase().includes(query));
  }) || [];
  const pivotIsAdditive = result?.pivot?.aggregate?.function === "count" || result?.pivot?.aggregate?.function === "sum";
  const savedRowGroupsFromReport = report?.rowGroups?.length
    ? report.rowGroups
    : report?.config?.rowGroups?.length
      ? report.config.rowGroups
      : report?.groupBy
        ? [report.groupBy]
        : [];
  const savedColumnGroups = report?.columnGroups?.length
    ? report.columnGroups
    : report?.config?.columnGroups?.length
      ? report.config.columnGroups
      : report?.groupColumn
        ? [report.groupColumn]
        : [];
  const savedRowGroups = savedRowGroupsFromReport.filter((field) => !savedColumnGroups.includes(field));
  const pivotColumnHeaders = result?.pivot?.columns.map((column) => ({
    label: column,
    primary: result.pivot?.columnValues?.[column]?.[savedColumnGroups[0]] || column,
    secondary: savedColumnGroups.length > 1 ? result.pivot?.columnValues?.[column]?.[savedColumnGroups[1]] || "(Blank)" : "",
  })) || [];

  const loadReport = React.useCallback(async () => {
    if (!reportId) return;
    try {
      setLoading(true);
      setError("");
      const isNewPreview = reportId === "preview";
      const previewKey = `report-preview:${isNewPreview ? "new" : reportId}`;
      if (isNewPreview && previewLoadedRef.current === previewKey) {
        // Already hydrated by the first invocation (StrictMode double-run):
        // do not wipe the preview result that was just restored.
        return;
      }
      setRunError("");
      setResult(null);
      const previewRaw = sessionStorage.getItem(previewKey);
      let savedReport: Report | null = null;
      if (isNewPreview) {
        if (!previewRaw) {
          router.replace("/reports/new");
          return;
        }
      } else {
        const response = await fetch(`/api/proxy/api/reports/${reportId}`, {
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body?.message || body?.error || "Failed to load report",
          );
        savedReport = body.data || body.report || null;
      }
      let loadedReport = savedReport;
      let previewResult: ReportResult | null = null;
      if (previewRaw) {
        sessionStorage.removeItem(previewKey);
        previewLoadedRef.current = previewKey;
        try {
          const preview = JSON.parse(previewRaw);
          previewResult = preview?.result || null;
          transientPreviewRef.current = Boolean(previewResult);
          loadedReport = {
            ...(savedReport || {}),
            ...(preview?.report || {}),
            config: { ...savedReport?.config, ...preview?.report?.config },
          } as Report;
        } catch {
          loadedReport = savedReport;
        }
      } else {
        previewLoadedRef.current = null;
        transientPreviewRef.current = false;
      }
      setReport(loadedReport);
      if (previewResult) setResult(previewResult);
      setEditableFilters(Array.isArray(loadedReport?.filters) ? loadedReport.filters : []);
      filtersHydratedRef.current = true;
      const metadataResponse = await fetch(`/api/proxy/api/report-metadata/${encodeURIComponent(loadedReport?.objectName || "")}`, { cache: "no-store" });
      if (metadataResponse.ok) {
        const metadataBody = await metadataResponse.json();
        const metadataFields = metadataBody.data?.fields || metadataBody.data?.object?.fields || [];
        setAvailableFields((Array.isArray(metadataFields) ? metadataFields : []).map((field: any) => ({ key: field.key || field.name, label: field.label || field.key || field.name })).filter((field: AvailableReportField) => field.key));
      }
      const config = loadedReport?.config || {};
      setShowRowCounts(config.showRowCounts !== false);
      setShowDetailRows(config.showDetailRows !== false);
      setShowSubtotals(config.showSubtotals === true);
      setShowGrandTotal(config.showGrandTotal !== false);
    } catch (err: any) {
      setError(err?.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  React.useEffect(() => {
    loadReport();
  }, [loadReport]);

  React.useEffect(() => {
    if (!report || result || running || transientPreviewRef.current) return;
    void runReport();
  }, [report]);

  React.useEffect(() => {
    if (!report || !filtersHydratedRef.current || transientPreviewRef.current) return;
    const timer = window.setTimeout(() => void runReport(), 350);
    return () => window.clearTimeout(timer);
  }, [editableFilters]);

  const runReport = async () => {
    if (!report) return;
    if (dateRangeError) {
      setRunError("From date/time cannot be after To date/time.");
      return;
    }
    try {
      setRunning(true);
      setRunError("");
      setResult(null);
      const response = await fetch("/api/proxy/api/reports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectName: report.objectName,
          columns: Array.isArray(report.columns) ? report.columns : [],
          filters: activeFilters,
          filterLogic: report.filterLogic === "OR" ? "OR" : "AND",
          aggregates: Array.isArray(report.aggregates) && report.aggregates.length
            ? report.aggregates
            : Array.isArray(report.config?.aggregates)
              ? report.config.aggregates
              : [],
          groupBy: savedRowGroups[0] || undefined,
          groupColumn: savedColumnGroups[0] || undefined,
          rowGroups: savedRowGroups.length ? savedRowGroups : undefined,
          columnGroups: savedColumnGroups.length ? savedColumnGroups : undefined,
          groupOptions: Object.fromEntries(Object.entries(report.config?.groupDateBuckets || {}).map(([field, dateBucket]) => [field, { dateBucket }])),
          crossFilter: report.crossFilter || undefined,
          sortBy: report.sortBy || undefined,
          sortOrder: report.sortOrder === "asc" ? "asc" : "desc",
          resultDateField: activeResultDateField || undefined,
          resultFrom: resultFrom || undefined,
          resultTo: resultTo || undefined,
          limit: 10000,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body?.message || body?.error || "Failed to run report");
      setResult(body.data || body.result || body);
    } catch (err: any) {
      setRunError(err?.message || "Failed to run report");
    } finally {
      setRunning(false);
    }
  };

  React.useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => void runReport(), 300);
    return () => window.clearTimeout(timer);
  }, [resultDateField, resultFrom, resultTo]);

  if (loading)
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading report...
      </div>
    );

  if (error || !report)
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/reports">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Reports
          </Link>
        </Button>
        <Card>
          <CardContent className="flex min-h-[250px] flex-col items-center justify-center text-center">
            <FileText className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              {error || "Report not found"}
            </h2>
            <Button variant="outline" className="mt-4" onClick={loadReport}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-sky-100 bg-gradient-to-br from-white to-sky-50 px-5 py-4">
        <div className="min-w-0 flex-1">
          <Button variant="ghost" size="sm" asChild className="mb-1 -ml-3 h-7 text-xs text-[#1479a8] hover:bg-sky-100">
            <Link href="/reports">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Reports
            </Link>
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <div className="min-w-0"><p className="text-[11px] text-[#1479a8]">Report: {report.objectName}</p><h1 className="truncate text-xl font-bold leading-tight tracking-tight text-[#075d91]">{report.name}</h1></div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            variant={filtersOpen ? "default" : "outline"}
            size="icon"
            className={filtersOpen ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600" : "border-sky-200 bg-white text-[#075d91] hover:bg-sky-50"}
            onClick={() => setFiltersOpen((current) => !current)}
            aria-label="Filters"
          >
            <Filter className="h-4 w-4" />
            {activeFilters.length > 0 && (
              <span className="absolute -mt-6 ml-5 rounded-full bg-red-500 px-1.5 text-[11px] text-white">{activeFilters.length}</span>
            )}
          </Button>
          <Button variant="outline" size="icon" className="border-sky-200 bg-white text-[#075d91] hover:bg-sky-50" onClick={runReport} disabled={running} aria-label="Refresh report"><RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} /></Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden border-sky-200 bg-white text-[#075d91] hover:bg-sky-50 sm:inline-flex"
            onClick={() => {
              const tenantId = new URLSearchParams(window.location.search).get("tenantId");
              const params = new URLSearchParams();
              if (reportId !== "preview") params.set("edit", report.id);
              if (tenantId) params.set("tenantId", tenantId);
              router.push(`/reports/new${params.size ? `?${params.toString()}` : ""}`);
            }}
          >
            Edit
          </Button>
        </div>
      </div>
      <div className="px-4 pt-3">
        <CommonFilterPanel onReset={() => setResultSearch("")}>
          <FilterSearch
            value={resultSearch}
            onChange={setResultSearch}
            placeholder="Search report"
          />
        </CommonFilterPanel>
      </div>
      {filtersOpen && (
        <Card className="mx-4 mt-3 rounded-xl border-sky-100 bg-[#f5fbff] shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-[#075d91]">Report Filters</CardTitle>
              <span className="text-xs text-muted-foreground">
                  {activeFilters.length > 0 ? "Edit a filter to refresh the results" : "No filters applied"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {editableFilters.map((filter, index) => <div key={`${filter.field}-${index}`} className="grid gap-2 rounded-md border border-sky-100 bg-white p-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
                <select value={filter.field} onChange={(event) => setEditableFilters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item))} className="crm-filter-control" aria-label={`Filter ${index + 1} field`}>
                  {filterFields.map((field) => <option key={field} value={field}>{filterFieldLabel(field)}</option>)}
                </select>
                <select value={filter.operator} onChange={(event) => setEditableFilters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value } : item))} className="crm-filter-control" aria-label={`Filter ${index + 1} operator`}>
                  {filterOperators.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                </select>
                {filter.operator === "isBlank" || filter.operator === "isNotBlank" ? (
                  <div className="flex items-center text-sm text-muted-foreground">No value required</div>
                ) : (
                  <input
                    value={typeof filter.value === "object"
                      ? ""
                      : report?.objectName === "Lead" && filter.field === "status"
                        ? getLeadStatusLabel(String(filter.value ?? ""))
                        : String(filter.value ?? "")}
                    onChange={(event) => setEditableFilters((current) => current.map((item, itemIndex) => {
                      if (itemIndex !== index) return item;
                      const status = report?.objectName === "Lead" && item.field === "status"
                        ? leadStatuses.find((option) => option.label === event.target.value)?.status
                        : undefined;
                      return { ...item, value: status || event.target.value };
                    }))}
                    className="crm-filter-control"
                    placeholder="Filter value"
                    aria-label={`Filter ${index + 1} value`}
                  />
                )}
              </div>)}
              {editableFilters.length === 0 && <p className="text-sm text-muted-foreground">This report includes all records.</p>}
            </div>
          </CardContent>
        </Card>
      )}
      {report.description && (
        <Card className="mx-4 mt-3 rounded-xl border-sky-100 bg-[#f5fbff] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-[#075d91]">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {report.description}
            </p>
          </CardContent>
        </Card>
      )}
      {runError && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {runError}
        </p>
      )}
      <Card className="hidden">
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-sm font-medium">Fields</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {report.columns?.map((column) => (
                <Badge key={column} variant="secondary">
                  {column}
                </Badge>
              ))}
            </div>
          </div>
          {(report.rowGroups?.length || report.groupBy) && (
            <div>
              <p className="text-sm font-medium">Group Rows</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(report.rowGroups?.length
                  ? report.rowGroups
                  : [report.groupBy]
                )
                  .filter(Boolean)
                  .map((group) => (
                    <Badge key={group} variant="outline">
                      {group}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
          {(report.columnGroups?.length || report.groupColumn) && (
            <div>
              <p className="text-sm font-medium">Group Columns</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(report.columnGroups?.length
                  ? report.columnGroups
                  : [report.groupColumn]
                )
                  .filter(Boolean)
                  .map((group) => (
                    <Badge key={group} variant="outline">
                      {group}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
          {report.sortBy && (
            <div>
              <p className="text-sm font-medium">Sort By</p>
              <p className="text-sm text-muted-foreground">
                {report.sortBy} ({report.sortOrder || "desc"})
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {result && (
        <>
        <div className="mx-4 mt-3 rounded-xl border border-sky-100 bg-[#f5fbff] px-5 py-3 text-sm text-[#075d91] shadow-sm">
          <p className="font-medium">⚠ This report has more results than can be shown. Summary information is calculated from the full report results.</p>
          <p className="mt-2 text-xs text-[#1479a8]">Total Records</p>
          <p className="text-lg font-bold text-[#0b2a5b]">{result.totalRows.toLocaleString()}</p>
        </div>
        <Card className="mx-4 mb-16 mt-2 rounded-xl border-sky-100 shadow-sm [&_tbody_td]:text-[#075d91]">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="text-base text-[#075d91]">
                Report Results {" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({filteredResultRows.length}
                  {filteredResultRows.length !== result.totalRows
                    ? ` of ${result.totalRows}`
                    : ""}{" "}
                  rows)
                </span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.summary && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.summary).map(([label, value]) => (
                  <Badge key={label} variant="outline">
                    {label}: {value}
                  </Badge>
                ))}
              </div>
            )}
            {result.pivot ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-sky-100 bg-sky-50 text-[#1479a8]">
                      {savedColumnGroups.length > 1 ? <>
                        <th rowSpan={2} className="sticky left-0 bg-sky-50 px-3 py-2">
                          {savedRowGroups.join(" / ") || "Group"}
                        </th>
                        {pivotColumnHeaders.reduce<{ label: string; span: number }[]>((headers, column) => {
                          const existing = headers.find((header) => header.label === column.primary);
                          if (existing) existing.span += 1;
                          else headers.push({ label: column.primary, span: 1 });
                          return headers;
                        }, []).map((header) => <th key={header.label} colSpan={header.span} className="border-l px-3 py-2 text-center">{header.label}</th>)}
                        {showSubtotals && pivotIsAdditive && <th rowSpan={2} className="px-3 py-2 text-center">Total</th>}
                      </> : <>
                        <th className="sticky left-0 bg-sky-50 px-3 py-2">
                          {savedRowGroups.join(" / ") || "Group"}
                        </th>
                        {result.pivot.columns.map((column) => (
                          <th key={column} className="px-3 py-2 text-center">
                            {column}
                          </th>
                        ))}
                        {showSubtotals && pivotIsAdditive && <th className="px-3 py-2 text-center">Total</th>}
                      </>}
                    </tr>
                    {savedColumnGroups.length > 1 && <tr className="border-b bg-sky-50/60">{pivotColumnHeaders.map((column) => <th key={column.label} className="border-l px-3 py-1.5 text-center text-xs font-normal text-muted-foreground">{column.secondary}</th>)}</tr>}
                  </thead>
                  <tbody>
                    {filteredPivotRows.map((row) => {
                      const total = result.pivot!.columns.reduce(
                        (sum, column) => sum + Number(row.values[column] || 0),
                        0,
                      );
                      return (
                        <tr key={row.group} className="border-b hover:bg-sky-50/60">
                          <td className="sticky left-0 bg-background px-3 py-2 font-medium text-[#075d91]">
                            {(savedRowGroups.length
                              ? savedRowGroups.map((field) => {
                                  const value = row.groupValues?.[field];
                                  if (!value) return "(Blank)";
                                  return isSiteVisitStatusColumn(report?.objectName, field) ? siteVisitStatusLabel(value) : value;
                                }).join(" / ")
                              : row.group)}{showRowCounts && <span className="ml-1 font-normal text-muted-foreground">({total})</span>}
                          </td>
                          {result.pivot!.columns.map((column) => (
                            <td key={column} className="px-3 py-2 text-center">
                              {row.values[column] || 0}
                            </td>
                          ))}
                          {showSubtotals && pivotIsAdditive && <td className="px-3 py-2 text-center font-semibold">{total}</td>}
                        </tr>
                      );
                    })}
                    {filteredPivotRows.length === 0 && (
                      <tr>
                        <td colSpan={result.pivot.columns.length + (pivotIsAdditive ? 2 : 1)} className="py-8 text-center text-sm text-muted-foreground">
                          No pivot groups match your search.
                        </td>
                      </tr>
                    )}
                    {showGrandTotal && filteredPivotRows.length > 0 && (
                      <tr className="border-t bg-sky-50 font-semibold">
                        <td className="sticky left-0 bg-sky-50 px-3 py-2">Total</td>
                        {result.pivot.columns.map((column) => (
                          <td key={column} className="px-3 py-2 text-center">
                            {filteredPivotRows.reduce((sum, row) => sum + Number(row.values[column] || 0), 0)}
                          </td>
                        ))}
                        {showSubtotals && pivotIsAdditive && <td className="px-3 py-2 text-center">
                          {filteredPivotRows.reduce((sum, row) => sum + Object.values(row.values).reduce((rowSum, value) => rowSum + Number(value || 0), 0), 0)}
                        </td>}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : result.groups && savedRowGroups.length ? (
              <div className="overflow-x-auto">
                <div className="mb-3 flex items-center justify-between rounded-md border border-sky-100 bg-[#f5fbff] px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">Summary</p>
                    <p className="text-xs text-muted-foreground">Grouped by {savedRowGroups.map(filterFieldLabel).join(" · ")}</p>
                  </div>
                  <Badge variant="secondary">{result.totalRows} records</Badge>
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-sky-100 bg-sky-50 text-[#1479a8]">
                      {savedRowGroups.map((groupField) => (
                        <th key={groupField} className="border-r px-3 py-2 font-semibold text-[#075d91]">
                          {filterFieldLabel(groupField)}
                        </th>
                      ))}
                      {showDetailRows && result.columns.map((column) => (
                        <th key={column} className="px-3 py-2">
                          {filterFieldLabel(column)}
                        </th>
                      ))}
                      {!showDetailRows && showRowCounts && <th className="border-r px-3 py-2 text-center font-semibold">Record Count</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.length === 0 ? (
                      <tr>
                        <td colSpan={savedRowGroups.length + (showDetailRows ? result.columns.length : showRowCounts ? 1 : 0)} className="py-8 text-center text-sm text-muted-foreground">
                          No grouped records match your search or date range.
                        </td>
                      </tr>
                    ) : filteredGroups.flatMap((group, groupIndex) => {
                      const groupKey = `${group.group}-${groupIndex}`;
                      const collapsed = Boolean(collapsedGroups[groupKey]);
                      if (!showDetailRows) {
                        return [
                          <tr key={`group-${groupKey}-summary`} className="border-b hover:bg-sky-50/60">
                            {savedRowGroups.map((groupField) => <td key={groupField} className="border-r px-3 py-2 text-[#075d91]">{group.groupValues?.[groupField] ? (isSiteVisitStatusColumn(report?.objectName, groupField) ? <SiteVisitStatusBadge status={group.groupValues[groupField]} /> : group.groupValues[groupField]) : "(Blank)"}</td>)}
                            {showRowCounts && <td className="border-r px-3 py-2 text-center">{group.count}</td>}
                          </tr>,
                          ...(showSubtotals ? [<tr key={`${groupKey}-subtotal`} className="border-b bg-sky-50 font-semibold"><td colSpan={savedRowGroups.length + (showRowCounts ? 1 : 0)} className="px-3 py-2 text-right">Subtotal: {group.count}</td></tr>] : []),
                        ];
                      }
                      return [
                      <tr key={`group-${groupKey}`} className="cursor-pointer border-b bg-sky-100/60 hover:bg-sky-100">
                        {savedRowGroups.map((groupField, groupIndex) => <td key={groupField} className="border-r px-3 py-2 font-semibold text-[#075d91]">
                          {groupIndex === 0 && <button type="button" onClick={() => setCollapsedGroups((current) => ({ ...current, [groupKey]: !collapsed }))} className="mr-2 text-xs" aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.group}`}>{collapsed ? "▶" : "▼"}</button>}
                          {group.groupValues?.[groupField] ? (isSiteVisitStatusColumn(report?.objectName, groupField) ? <SiteVisitStatusBadge status={group.groupValues[groupField]} /> : formatGroupedField(report?.objectName, groupField, group.groupValues[groupField])) : (groupIndex === 0 ? group.group : "")}{groupIndex === savedRowGroups.length - 1 && showRowCounts && <span className="font-normal text-muted-foreground"> ({group.count})</span>}
                        </td>)}
                        {result.columns.map((column) => <td key={column} className="border-r px-3 py-2" />)}
                      </tr>,
                      ...(!collapsed && showDetailRows ? (group.rows || []).map((row, index) => (
                        <tr
                          key={`${groupKey}-${index}`}
                          className="border-b"
                        >
                          {savedRowGroups.map((groupField) => <td key={groupField} className="border-r px-3 py-2" />)}
                          {result.columns.map((column) => (
                            <td key={column} className="px-3 py-2">
                              {formatReportCell(report?.objectName, column, row[column])}
                            </td>
                          ))}
                        </tr>
                      )) : []),
                      ...(!collapsed && showSubtotals ? [<tr key={`${groupKey}-subtotal`} className="border-b bg-sky-50 font-semibold"><td colSpan={savedRowGroups.length + result.columns.length} className="px-3 py-2 text-right">Subtotal: {group.count}</td></tr>] : []),
                    ];
                    })}
                    {showGrandTotal && filteredGroups.length > 0 && result.summary && (
                      <tr className="border-t bg-sky-50 font-semibold">
                        <td colSpan={savedRowGroups.length + (showDetailRows ? result.columns.length : showRowCounts ? 1 : 0)} className="px-3 py-2">Grand Total: {result.totalRows} records {Object.entries(result.summary).map(([label, value]) => <span key={label} className="ml-4 font-normal">{label}: {value}</span>)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : filteredResultRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No rows match the selected search or date/time range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-sky-100 bg-sky-50 text-[#1479a8]">
                      {result.columns.map((column) => (
                        <th key={column} className="px-3 py-2">
                          {filterFieldLabel(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResultRows.map((row, index) => (
                      <tr key={index} className="border-b border-sky-50 hover:bg-sky-50/60">
                        {result.columns.map((column) => (
                          <td key={column} className="px-3 py-2">
                            {formatReportCell(report?.objectName, column, row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {hasGrouping && showGrandTotal && filteredResultRows.length > 0 && (
                      <tr className="border-t bg-sky-50 font-semibold">
                        <td colSpan={result.columns.length} className="px-3 py-2">Grand Total: {result.totalRows} records</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="sticky bottom-0 z-20 mt-auto flex w-full flex-wrap items-center gap-5 border-t border-sky-100 bg-[#f5fbff] px-6 py-2 text-xs text-[#1479a8] shadow-[0_-2px_8px_rgba(15,23,42,0.12)]">
          {hasGrouping && <label className="flex items-center gap-2">Row Counts<input type="checkbox" checked={showRowCounts} onChange={(event) => setShowRowCounts(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>}
          {hasGrouping && <label className="flex items-center gap-2">Detail Rows<input type="checkbox" checked={showDetailRows} onChange={(event) => setShowDetailRows(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>}
          {hasGrouping && <label className="flex items-center gap-2">Subtotals<input type="checkbox" checked={showSubtotals} onChange={(event) => setShowSubtotals(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>}
          {hasGrouping && <label className="flex items-center gap-2">Grand Total<input type="checkbox" checked={showGrandTotal} onChange={(event) => setShowGrandTotal(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>}
        </div>
        </>
      )}
    </div>
  );
}