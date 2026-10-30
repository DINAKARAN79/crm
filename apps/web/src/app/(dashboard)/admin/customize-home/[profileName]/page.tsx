"use client";

import * as React from "react";
import { DashboardValuesWidget } from "@/components/crm/dashboard-values-widget";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Rnd } from "react-rnd";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Check,
  GripVertical,
  LayoutDashboard,
  Loader2,
  MoreHorizontal,
  Pencil,
  Power,
  Plus,
  Save,
  Search,
  Blocks,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportStatusCell } from "@/components/crm/site-visit-status-badge";
import {
  activityApi,
  analyticsApi,
  companyApi,
  dashboardApi,
  homepageApi,
  profileApi,
  followUpApi,
  reportApi,
} from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { rememberHomeProfile, userHomePath } from "@/lib/user-home-path";

interface Widget {
  id: string;
  title: string;
  description: string;
  value: string;
  type: "kpi" | "list" | "summary";
  category: "Org Overview" | "Activity Stats" | "Reports" | "Dashboards";
}
interface ReportWidgetRow {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  objectName?: string;
  columns?: string[];
  filters?: unknown;
  filterLogic?: "AND" | "OR";
  aggregates?: unknown;
  groupBy?: string | null;
  groupColumn?: string | null;
  rowGroups?: string[];
  columnGroups?: string[];
  crossFilter?: unknown;
  sortBy?: string | null;
  sortOrder?: string | null;
  createdBy?: string;
  createdAt?: string;
  folder?: { name: string } | null;
}
interface ReportResult {
  columns: string[];
  columnTypes?: Record<string, string>;
  totalRows: number;
  rows: Record<string, unknown>[];
}
interface Profile {
  id: string;
  name: string;
}
interface WidgetLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface WidgetSize {
  columns: number;
  rows: number;
}
interface DashboardPreviewData {
  kpis: Record<string, string>;
  upcomingTasks: any[];
  recentActivities: any[];
  loading: boolean;
}

const CELL_WIDTH = 85;
const CELL_HEIGHT = 116;
const CELL_GAP = 8;
const CELL_ORIGIN = 8;
const MIN_WIDGET_WIDTH = CELL_WIDTH;
const MIN_WIDGET_HEIGHT = CELL_HEIGHT;
const GRID_SLOT_WIDTH = CELL_WIDTH + CELL_GAP;
const GRID_SLOT_HEIGHT = CELL_HEIGHT + CELL_GAP;
const GRID_COLUMNS = 12;
const GRID_ROWS = 8;
const CANVAS_WIDTH =
  CELL_ORIGIN * 2 +
  GRID_COLUMNS * CELL_WIDTH +
  (GRID_COLUMNS - 1) * CELL_GAP;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const widgetSizes: Record<string, WidgetSize> = {
  "total-leads": { columns: 3, rows: 1 },
  "active-tasks": { columns: 3, rows: 1 },
  "upcoming-tasks": { columns: 8, rows: 4 },
  "recent-activity": { columns: 4, rows: 4 },
  "leads-by-source": { columns: 6, rows: 4 },
  "open-tasks": { columns: 3, rows: 2 },
  "overdue-tasks": { columns: 3, rows: 2 },
  "tasks-completed": { columns: 3, rows: 2 },
  "tasks-by-users": { columns: 4, rows: 3 },
  "calls-by-purpose": { columns: 4, rows: 3 },
  "my-calls-today": { columns: 3, rows: 2 },
};

const widgets: Widget[] = [
  {
    id: "total-leads",
    title: "Total Leads",
    description: "Total lead volume across your CRM",
    value: "10  ▲ 100%",
    type: "kpi",
    category: "Org Overview",
  },
  {
    id: "active-tasks",
    title: "Active Tasks",
    description: "Tasks requiring attention",
    value: "10  ▲ 100%",
    type: "kpi",
    category: "Org Overview",
  },
  {
    id: "upcoming-tasks",
    title: "Upcoming Tasks",
    description: "Tasks due next",
    value: "Remaining: 990        Target: 1000",
    type: "summary",
    category: "Org Overview",
  },
  {
    id: "recent-activity",
    title: "Recent Activity",
    description: "Latest CRM activity",
    value: "Target: Rs. 10,000.00   Rs. 7,00,000.00",
    type: "summary",
    category: "Org Overview",
  },
  {
    id: "leads-by-source",
    title: "LEADS BY SOURCE",
    description: "Lead source distribution",
    value: "Website  4\nReferral  3\nCampaign  3",
    type: "list",
    category: "Org Overview",
  },
  {
    id: "open-tasks",
    title: "OPEN TASKS",
    description: "Open tasks requiring attention",
    value: "0",
    type: "kpi",
    category: "Activity Stats",
  },
  {
    id: "overdue-tasks",
    title: "OVERDUE TASKS",
    description: "Tasks past their due date",
    value: "0",
    type: "kpi",
    category: "Activity Stats",
  },
  {
    id: "tasks-completed",
    title: "TASKS COMPLETED",
    description: "Completed task count",
    value: "0",
    type: "kpi",
    category: "Activity Stats",
  },
  {
    id: "tasks-by-users",
    title: "TASKS BY USERS",
    description: "Task ownership summary",
    value: "Yeshwanth  0",
    type: "list",
    category: "Activity Stats",
  },
  {
    id: "calls-by-purpose",
    title: "CALLS BY PURPOSE",
    description: "Call purpose summary",
    value: "No calls",
    type: "list",
    category: "Activity Stats",
  },
  {
    id: "my-calls-today",
    title: "MY CALLS TODAY",
    description: "Your calls for today",
    value: "0",
    type: "kpi",
    category: "Activity Stats",
  },
];
const defaultIds = [
  "total-leads",
  "active-tasks",
  "upcoming-tasks",
  "recent-activity",
];
const topRowWidgetIds = new Set([
  "total-leads",
  "active-tasks",
]);
const responseData = (response: any) => response?.data?.data ?? response?.data;
const DEBUG_DND = false;

function formatDashboardTimeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function debugDnd(label: string, details: Record<string, unknown>) {
  if (DEBUG_DND && typeof window !== "undefined") {
    console.debug(`[homepage-dnd] ${label}`, details);
  }
}

function getWidgetSize(id: string): WidgetSize {
  if (id.startsWith("report-")) return { columns: 12, rows: 4 };
  if (id.startsWith("dashboard-")) return { columns: 12, rows: 5 };
  return widgetSizes[id] || { columns: 3, rows: 2 };
}

function getWidgetDimensions(id: string) {
  const size = getWidgetSize(id);
  return {
    width: size.columns * CELL_WIDTH + (size.columns - 1) * CELL_GAP,
    height: size.rows * CELL_HEIGHT + (size.rows - 1) * CELL_GAP,
  };
}

function defaultLayouts(ids: string[]): Record<string, WidgetLayout> {
  const usesAdminHomeTemplate =
    ids.length === defaultIds.length &&
    defaultIds.every((id) => ids.includes(id));
  if (usesAdminHomeTemplate) {
    const positions: Record<string, { column: number; row: number }> = {
      "total-leads": { column: 0, row: 0 },
      "active-tasks": { column: 3, row: 0 },
      "upcoming-tasks": { column: 0, row: 5 },
      "recent-activity": { column: 8, row: 5 },
    };
    return Object.fromEntries(
      ids.map((id) => {
        const position = positions[id];
        const dimensions = getWidgetDimensions(id);
        return [
          id,
          {
            id,
            x: CELL_ORIGIN + position.column * GRID_SLOT_WIDTH,
            y: CELL_ORIGIN + position.row * GRID_SLOT_HEIGHT,
            ...dimensions,
          },
        ];
      }),
    );
  }
  const layouts: Record<string, WidgetLayout> = {};
  ids.forEach((id) => {
    layouts[id] = findFreeLayout(id, layouts);
  });
  return layouts;
}

function overlaps(first: WidgetLayout, second: WidgetLayout) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function isWithinCanvas(layout: WidgetLayout) {
  return (
    layout.x >= CELL_ORIGIN &&
    layout.y >= CELL_ORIGIN &&
    layout.x + layout.width <= CANVAS_WIDTH - CELL_ORIGIN
  );
}

function canPlace(
  id: string,
  candidate: WidgetLayout,
  layouts: Record<string, WidgetLayout>,
) {
  if (!isWithinCanvas(candidate)) return false;
  return Object.values(layouts).every(
    (layout) => layout.id === id || !overlaps(candidate, layout),
  );
}

function findFreeSwapLayout(
  layout: WidgetLayout,
  preferred: { x: number; y: number },
  occupied: Record<string, WidgetLayout>,
): WidgetLayout | null {
  const normalized = snapLayout({ ...layout, x: CELL_ORIGIN, y: CELL_ORIGIN });
  const columns = clamp(
    Math.round((normalized.width + CELL_GAP) / GRID_SLOT_WIDTH),
    1,
    GRID_COLUMNS,
  );
  const preferredColumn = clamp(
    Math.round((preferred.x - CELL_ORIGIN) / GRID_SLOT_WIDTH),
    0,
    GRID_COLUMNS - columns,
  );
  const preferredRow = Math.max(
    0,
    Math.round((preferred.y - CELL_ORIGIN) / GRID_SLOT_HEIGHT),
  );
  const rows = Math.max(
    GRID_ROWS,
    Object.keys(occupied).length * 5 +
      Math.ceil(normalized.height / GRID_SLOT_HEIGHT) +
      1,
  );
  let nearest: { layout: WidgetLayout; distance: number } | null = null;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column <= GRID_COLUMNS - columns; column += 1) {
      const candidate = {
        ...normalized,
        x: CELL_ORIGIN + column * GRID_SLOT_WIDTH,
        y: CELL_ORIGIN + row * GRID_SLOT_HEIGHT,
      };
      if (!isWithinCanvas(candidate)) continue;
      if (
        Object.values(occupied).some((other) => overlaps(candidate, other))
      ) {
        continue;
      }
      const distance =
        Math.abs(column - preferredColumn) + Math.abs(row - preferredRow);
      if (
        !nearest ||
        distance < nearest.distance ||
        (distance === nearest.distance &&
          row < (nearest.layout.y - CELL_ORIGIN) / GRID_SLOT_HEIGHT)
      ) {
        nearest = { layout: candidate, distance };
      }
    }
  }
  return nearest?.layout ?? null;
}

function placeWithDisplacement(
  id: string,
  candidate: WidgetLayout,
  layouts: Record<string, WidgetLayout>,
): Record<string, WidgetLayout> | null {
  if (!isWithinCanvas(candidate)) return null;
  const displaced = Object.values(layouts).filter(
    (layout) => layout.id !== id && overlaps(candidate, layout),
  );
  if (!displaced.length) {
    return { ...layouts, [id]: candidate };
  }

  const next = Object.fromEntries(
    Object.entries(layouts).filter(
      ([layoutId]) =>
        layoutId !== id && !displaced.some((layout) => layout.id === layoutId),
    ),
  ) as Record<string, WidgetLayout>;
  next[id] = candidate;
  for (const layout of displaced) {
    const destination = findFreeSwapLayout(layout, layout, next);
    if (!destination) return null;
    next[layout.id] = destination;
  }
  return next;
}

function findFreeLayout(
  id: string,
  layouts: Record<string, WidgetLayout>,
  preferredColumn = 0,
  preferredRow = 0,
): WidgetLayout {
  const size = getWidgetSize(id);
  const dimensions = getWidgetDimensions(id);
  const maxRows = Math.max(
    GRID_ROWS,
    Object.keys(layouts).length * 5 + size.rows + 1,
  );
  let nearest: { layout: WidgetLayout; distance: number } | null = null;
  for (let row = 0; row < maxRows; row += 1) {
    for (let column = 0; column <= GRID_COLUMNS - size.columns; column += 1) {
      const candidate = {
        id,
        x: CELL_ORIGIN + column * GRID_SLOT_WIDTH,
        y: CELL_ORIGIN + row * GRID_SLOT_HEIGHT,
        ...dimensions,
      };
      if (canPlace(id, candidate, layouts)) {
        const distance =
          Math.abs(column - preferredColumn) +
          Math.abs(row - preferredRow);
        if (
          !nearest ||
          distance < nearest.distance ||
          (distance === nearest.distance && row < (nearest.layout.y - CELL_ORIGIN) / GRID_SLOT_HEIGHT)
        ) {
          nearest = { layout: candidate, distance };
        }
      }
    }
  }
  if (nearest) return nearest.layout;
  return {
    id,
    x: CELL_ORIGIN,
    y: CELL_ORIGIN,
    ...dimensions,
  };
}

function layoutAtDropPoint(
  id: string,
  x: number,
  y: number,
): WidgetLayout {
  const size = getWidgetSize(id);
  const dimensions = getWidgetDimensions(id);
  const column = Math.min(
    GRID_COLUMNS - size.columns,
    Math.max(0, Math.floor((x - CELL_ORIGIN) / GRID_SLOT_WIDTH)),
  );
  const row = Math.max(
    0,
    Math.floor((y - CELL_ORIGIN) / GRID_SLOT_HEIGHT),
  );
  const candidate = {
    id,
    x: CELL_ORIGIN + column * GRID_SLOT_WIDTH,
    y: CELL_ORIGIN + row * GRID_SLOT_HEIGHT,
    ...dimensions,
  };
  debugDnd("grid drop position", {
    id,
    inputX: x,
    inputY: y,
    column,
    row,
    candidateX: candidate.x,
    candidateY: candidate.y,
    candidateWidth: candidate.width,
    candidateHeight: candidate.height,
  });
  return candidate;
}

function snapLayout(layout: WidgetLayout): WidgetLayout {
  const columns = clamp(
    Math.round((layout.width + CELL_GAP) / GRID_SLOT_WIDTH),
    1,
    GRID_COLUMNS,
  );
  const rows = Math.max(
    1,
    Math.round((layout.height + CELL_GAP) / GRID_SLOT_HEIGHT),
  );
  const column = clamp(
    Math.round((layout.x - CELL_ORIGIN) / GRID_SLOT_WIDTH),
    0,
    GRID_COLUMNS - columns,
  );
  const row = Math.max(
    0,
    Math.round((layout.y - CELL_ORIGIN) / GRID_SLOT_HEIGHT),
  );
  return {
    id: layout.id,
    x: CELL_ORIGIN + column * GRID_SLOT_WIDTH,
    y: CELL_ORIGIN + row * GRID_SLOT_HEIGHT,
    width: columns * CELL_WIDTH + (columns - 1) * CELL_GAP,
    height: rows * CELL_HEIGHT + (rows - 1) * CELL_GAP,
  };
}

function ReportResultsWidget({ reportId }: { reportId: string }) {
  const [result, setResult] = React.useState<ReportResult | null>(null);
  const [objectName, setObjectName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [dateField, setDateField] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const reportResponse = await fetch(`/api/proxy/api/reports/${reportId}`, { cache: "no-store" });
        const reportBody = await reportResponse.json();
        if (!reportResponse.ok) throw new Error(reportBody?.error || "Unable to load report");
        const loadedReport = reportBody.data || reportBody.report;
        const resultResponse = await fetch("/api/proxy/api/reports/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectName: loadedReport.objectName,
            columns: loadedReport.columns || [],
            filters: Array.isArray(loadedReport.filters) ? loadedReport.filters : [],
            filterLogic: loadedReport.filterLogic === "OR" ? "OR" : "AND",
            aggregates: Array.isArray(loadedReport.aggregates) ? loadedReport.aggregates : [],
            groupBy: loadedReport.groupBy || undefined,
            groupColumn: loadedReport.groupColumn || undefined,
            rowGroups: loadedReport.rowGroups || undefined,
            columnGroups: loadedReport.columnGroups || undefined,
            crossFilter: loadedReport.crossFilter || undefined,
            sortBy: loadedReport.sortBy || undefined,
            sortOrder: loadedReport.sortOrder === "asc" ? "asc" : "desc",
            limit: 10000,
          }),
        });
        const resultBody = await resultResponse.json();
        if (!resultResponse.ok) throw new Error(resultBody?.error || "Unable to run report");
        if (active) {
          setObjectName(loadedReport.objectName || "");
          setResult(resultBody.data || resultBody.result || resultBody);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load report");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [reportId]);

  const dateFields = result?.columns.filter((column) => {
    const type = result.columnTypes?.[column]?.toLowerCase() || "";
    if (["date", "datetime", "timestamp"].includes(type)) return true;
    if (!/(date|time|at)$/i.test(column)) return false;
    return (result.rows || []).some((row) => {
      const value = row[column];
      return value != null && !Number.isNaN(new Date(String(value)).getTime());
    });
  }) || [];
  const activeDateField = dateField || dateFields[0] || "";
  const filteredRows = (result?.rows || []).filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || result?.columns.some((column) => String(row[column] ?? "").toLowerCase().includes(query));
    const value = activeDateField ? row[activeDateField] : null;
    const timestamp = value == null ? null : new Date(String(value)).getTime();
    const matchesFrom = !from || (timestamp !== null && timestamp >= new Date(from).getTime());
    const matchesTo = !to || (timestamp !== null && timestamp <= new Date(to).getTime() + 59999);
    return matchesSearch && matchesFrom && matchesTo;
  });

  if (loading) return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading report results...</div>;
  if (error || !result) return <div className="flex flex-1 items-center justify-center p-4 text-xs text-destructive">{error || "No report results"}</div>;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-xl font-semibold text-slate-900">
            Report Results <span className="text-sm font-normal text-slate-500">({filteredRows.length} rows)</span>
          </h4>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search results..." className="h-9 w-full min-w-0 rounded-md border px-3 text-sm sm:w-52" />
            <select value={activeDateField} onChange={(event) => setDateField(event.target.value)} className="h-9 rounded-md border px-2 text-sm">
              <option value="">Filter by date/time</option>
              {dateFields.map((field) => <option key={field} value={field}>{field}</option>)}
            </select>
            <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-md border px-2 text-sm" aria-label="From date and time" />
            <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-md border px-2 text-sm" aria-label="To date and time" />
          </div>
        </div>
        <span className="w-fit rounded-full border px-3 py-1 text-xs font-medium">Record Count: {filteredRows.length}</span>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-800">{result.columns.map((column) => <th key={column} className="px-3 py-2 font-semibold">{column}</th>)}</tr></thead>
            <tbody>{filteredRows.map((row, index) => <tr key={index} className="border-b">{result.columns.map((column) => <td key={column} className="whitespace-nowrap px-3 py-2">{reportStatusCell(objectName, column, row[column], "")}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WidgetContent({
  widget,
  previewData,
}: {
  widget: Widget;
  previewData: DashboardPreviewData;
}) {
  if (widget.id.startsWith("dashboard-")) {
    return <DashboardValuesWidget widget={widget} />;
  }

  if (widget.id.startsWith("report-")) {
    return <ReportResultsWidget reportId={widget.id.replace("report-", "")} />;
  }

  if (widget.type === "kpi" && widget.id in previewData.kpis) {
    return (
      <div className="flex min-h-0 flex-1 items-center px-4 py-3">
        <p className="truncate text-[clamp(15px,3vw,28px)] font-semibold text-slate-800">
          {previewData.loading ? "Loading..." : previewData.kpis[widget.id]}
        </p>
      </div>
    );
  }

  if (widget.id === "leads-by-source") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-4 overflow-hidden p-3 sm:gap-6">
        <div
          className="relative aspect-square w-[min(42%,180px)] shrink-0 rounded-full"
          style={{
            background:
              "conic-gradient(#72d992 0 20%, #5ea2c0 20% 40%, #4e6fc1 40% 50%, #e84d39 50% 70%, #f7b83b 70% 80%, #bf5db1 80% 90%, #12c4c2 90% 100%)",
          }}
        >
          <div className="absolute inset-[24%] rounded-full bg-white" />
        </div>
        <div className="min-w-0 space-y-1 text-[clamp(9px,1.4vw,12px)] text-slate-700">
          {["Advertisement", "Cold Call", "External Referral", "Online Store", "Partner", "Web Download"].map(
            (label, index) => (
              <div key={label} className="flex items-center gap-2 truncate">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: ["#72d992", "#5ea2c0", "#4e6fc1", "#e84d39", "#f7b83b", "#12c4c2"][index],
                  }}
                />
                <span className="truncate">{label} {index % 3 + 1}</span>
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (widget.id === "upcoming-tasks") {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {previewData.upcomingTasks.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">
            {previewData.loading ? "Loading tasks..." : "No upcoming tasks"}
          </div>
        ) : (
          <div className="space-y-2">
            {previewData.upcomingTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">
                    {task.title || "Untitled Task"}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {task.status || "—"}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                    : "No due date"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (widget.id === "recent-activity") {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {previewData.recentActivities.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">
            {previewData.loading ? "Loading activity..." : "No recent activity"}
          </div>
        ) : (
          <div className="space-y-2">
            {previewData.recentActivities.map((activity) => (
              <div key={activity.id} className="rounded-md border bg-muted/20 p-3">
                <div className="text-sm font-medium text-slate-800">
                  {activity.message || "Activity"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activity.type || "Update"} • {activity.createdAt ? formatDashboardTimeAgo(activity.createdAt) : "Now"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (widget.type === "kpi") {
    return (
      <div className="flex min-h-0 flex-1 items-center px-4 py-3">
        <p className="truncate text-[clamp(15px,3vw,28px)] font-semibold text-slate-800">{widget.value}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[clamp(11px,1.6vw,16px)] font-medium whitespace-pre-line">
      {widget.value}
    </div>
  );
}

const resizeHandles = {
  top: {
    width: 6,
    height: 6,
    left: "50%",
    top: -2,
    marginLeft: -3,
    cursor: "ns-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  right: {
    width: 6,
    height: 6,
    top: "50%",
    right: -2,
    marginTop: -3,
    cursor: "ew-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  bottom: {
    width: 6,
    height: 6,
    left: "50%",
    bottom: -2,
    marginLeft: -3,
    cursor: "ns-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  left: {
    width: 6,
    height: 6,
    top: "50%",
    left: -2,
    marginTop: -3,
    cursor: "ew-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  topRight: {
    width: 6,
    height: 6,
    right: -3,
    top: -3,
    cursor: "nesw-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  bottomRight: {
    width: 6,
    height: 6,
    right: -3,
    bottom: -3,
    cursor: "nwse-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  bottomLeft: {
    width: 6,
    height: 6,
    left: -3,
    bottom: -3,
    cursor: "nesw-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  topLeft: {
    width: 6,
    height: 6,
    left: -3,
    top: -3,
    cursor: "nwse-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
};

function HomepageBuilder() {
  const params = useParams<{ profileName?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, tenant } = useAuth();
  const tenantIdOverride = searchParams.get("tenantId") || undefined;
  const profileNameOverride = searchParams.get("profile");
  const profileIdOverride = searchParams.get("profileId");
  const homepageIdOverride = searchParams.get("homepageId");
  const routeHomepageId =
    params.profileName && params.profileName !== "create" ? params.profileName : null;
  const [homepageId, setHomepageId] = React.useState<string | null>(routeHomepageId);
  const [ids, setIds] = React.useState(defaultIds);
  const [layouts, setLayouts] = React.useState<Record<string, WidgetLayout>>(
    () => defaultLayouts(defaultIds),
  );
  const [dragLayouts, setDragLayouts] = React.useState<
    Record<string, WidgetLayout>
  >({});
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [reportWidgets, setReportWidgets] = React.useState<Widget[]>([]);
  const [dashboardWidgets, setDashboardWidgets] = React.useState<Widget[]>([]);
  const [profileIds, setProfileIds] = React.useState<string[]>([]);
  const [name, setName] = React.useState("Untitled Homepage");
  const [description, setDescription] = React.useState("");
  const [widgetSearch, setWidgetSearch] = React.useState("");
  const [widgetCategory, setWidgetCategory] =
    React.useState<Widget["category"]>("Org Overview");
  const [profileSearch, setProfileSearch] = React.useState("");
  const [shareOpen, setShareOpen] = React.useState(false);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [profilePickerOpen, setProfilePickerOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(
    Boolean(routeHomepageId || homepageIdOverride || profileIdOverride),
  );
  const [previewData, setPreviewData] = React.useState<DashboardPreviewData>({
    kpis: {},
    upcomingTasks: [],
    recentActivities: [],
    loading: true,
  });
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");
  const [selectedWidgetId, setSelectedWidgetId] = React.useState<string | null>(
    null,
  );
  const [widgetRenderVersion, setWidgetRenderVersion] = React.useState(0);
  const [widgetVersions, setWidgetVersions] = React.useState<
    Record<string, number>
  >({});
  const [dropPreview, setDropPreview] = React.useState<{
    layout: WidgetLayout;
    valid: boolean;
    swap: boolean;
  } | null>(null);
  const bumpWidget = (id: string) =>
    setWidgetVersions((current) => ({
      ...current,
      [id]: (current[id] ?? 0) + 1,
    }));
  const pointerPosition = React.useRef({ x: 0, y: 0 });
  const panelPointerDrag = React.useRef<{
    widgetId: string;
    pointerId: number;
  } | null>(null);
  const dragStartLayouts = React.useRef<Record<string, WidgetLayout>>({});
  const canvasRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const trackPointer = (event: PointerEvent | MouseEvent) => {
      pointerPosition.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", trackPointer);
    window.addEventListener("mousemove", trackPointer);
    return () => {
      window.removeEventListener("pointermove", trackPointer);
      window.removeEventListener("mousemove", trackPointer);
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    if (tenantIdOverride) {
      setPreviewData({
        kpis: {},
        upcomingTasks: [],
        recentActivities: [],
        loading: false,
      });
      return () => {
        active = false;
      };
    }
    const loadDashboardPreview = async () => {
      const [leadsResult, tasksResult, activitiesResult] =
        await Promise.allSettled([
          analyticsApi.getLeads(),
          followUpApi.list({ limit: 3, sortBy: "dueDate", sortOrder: "asc", status: "SCHEDULED" }),
          activityApi.list({ limit: 3 }),
        ]);
      if (!active) return;

      const leadsData = leadsResult.status === "fulfilled" ? leadsResult.value.data?.data : null;
      const tasksData = tasksResult.status === "fulfilled" ? tasksResult.value.data?.data : [];
      const activitiesData = activitiesResult.status === "fulfilled" ? activitiesResult.value.data?.data : [];

      setPreviewData({
        kpis: {
          "total-leads": String(leadsData?.total ?? 0),
          "active-tasks": String(Array.isArray(tasksData) ? tasksData.length : 0),
        },
        upcomingTasks: Array.isArray(tasksData) ? tasksData.slice(0, 3) : [],
        recentActivities: Array.isArray(activitiesData) ? activitiesData.slice(0, 3) : [],
        loading: false,
      });
    };
    void loadDashboardPreview();
    return () => {
      active = false;
    };
  }, [tenantIdOverride]);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      profileApi.list({ limit: 100, ...(tenantIdOverride ? { tenantId: tenantIdOverride } : {}) }),
      routeHomepageId
        ? tenantIdOverride
          ? homepageApi.get(routeHomepageId, tenantIdOverride)
          : homepageApi.get(routeHomepageId)
        : homepageIdOverride
          ? tenantIdOverride
            ? homepageApi.get(homepageIdOverride, tenantIdOverride)
            : homepageApi.get(homepageIdOverride)
          : profileIdOverride
          ? tenantIdOverride
            ? homepageApi.list(tenantIdOverride)
            : homepageApi.list()
          : Promise.resolve(null),
      reportApi.list({ limit: 100, view: "all", ...(tenantIdOverride ? { tenantId: tenantIdOverride } : {}) }),
      dashboardApi.list({ limit: 100, view: "all", ...(tenantIdOverride ? { tenantId: tenantIdOverride } : {}) }).catch(() => null),
    ])
      .then(([profilesResponse, homepageResponse, reportsResponse, dashboardsResponse]) => {
        if (!active) return;
        const dashboardData = responseData(dashboardsResponse);
        const dashboardItems: any[] = Array.isArray(dashboardData)
          ? dashboardData
          : Array.isArray(dashboardData?.items)
            ? dashboardData.items
            : Array.isArray(dashboardData?.dashboards)
              ? dashboardData.dashboards
              : [];
        const loadedDashboardWidgets: Widget[] = dashboardItems.map((dashboard) => ({
          id: `dashboard-${dashboard.id}`,
          title: dashboard.name,
          description: dashboard.description || "Saved dashboard",
          value: "",
          type: "summary" as const,
          category: "Dashboards" as const,
        }));
        setDashboardWidgets(loadedDashboardWidgets);
        const profileData = responseData(profilesResponse);
        const profileItems = (
          Array.isArray(profileData)
            ? profileData
            : (profileData?.profiles ?? [])
        ) as Profile[];
        setProfiles(
          profileItems,
        );
        const reportData = responseData(reportsResponse);
        const reportItems = Array.isArray(reportData)
          ? reportData
          : Array.isArray(reportData?.items)
            ? reportData.items
            : Array.isArray(reportData?.reports)
              ? reportData.reports
              : [];
        const loadedReportWidgets: Widget[] = reportItems
          .map((report: ReportWidgetRow) => ({
            id: `report-${report.id}`,
            title: report.name,
            description: report.description || `${report.type || "Report"} report`,
            value: "",
            type: "list" as const,
            category: "Reports" as const,
          }));
        setReportWidgets(loadedReportWidgets);
        const homepageResponseData = responseData(homepageResponse);
        const existingProfileHomepage = routeHomepageId || homepageIdOverride
          ? homepageResponseData
          : profileIdOverride && Array.isArray(homepageResponseData)
            ? homepageResponseData.find((candidate: any) =>
                (candidate.sharedProfiles || []).some(
                  (item: any) => (item.profile?.id || item.profileId) === profileIdOverride,
                ),
              )
            : null;
        if (existingProfileHomepage) {
          const homepage = existingProfileHomepage;
          setHomepageId(homepage.id);
          setName(profileNameOverride || homepage.name);
          setDescription(homepage.description || "");
          const saved = Array.isArray(homepage.layout) ? homepage.layout : [];
          const savedIds = saved
            .map((item: any) => (typeof item === "string" ? item : item.id))
            .filter((id: string) =>
              [...widgets, ...loadedReportWidgets, ...loadedDashboardWidgets].some((widget) => widget.id === id),
            );
          const effectiveIds = savedIds;
          setIds(effectiveIds);
          const nextLayouts = defaultLayouts(effectiveIds);
          saved
            .filter(
              (item: any) =>
                typeof item !== "string" &&
                effectiveIds.includes(item.id) &&
                [item.x, item.y, item.width, item.height].every((n) => Number.isFinite(Number(n))),
            )
            .forEach((item: WidgetLayout) => {
              nextLayouts[item.id] = topRowWidgetIds.has(item.id)
                ? {
                    ...snapLayout(item),
                    ...getWidgetDimensions(item.id),
                  }
                : snapLayout(item);
            });
          setLayouts(nextLayouts);
          setProfileIds(
            (homepage.sharedProfiles || [])
              .map((item: any) => item.profile?.id || item.profileId)
              .filter((id: string | undefined): id is string => Boolean(id)),
          );
        } else {
          setHomepageId(null);
          setName(profileNameOverride || "Untitled Homepage");
          setDescription("");
          setIds(defaultIds);
          setLayouts(defaultLayouts(defaultIds));
          const selectedProfile = profileItems.find((profile) =>
            profileIdOverride
              ? profile.id === profileIdOverride
              : profile.name.toLowerCase() === profileNameOverride?.toLowerCase(),
          );
          setProfileIds(selectedProfile ? [selectedProfile.id] : []);
        }
      })
      .catch(() => active && setError("Unable to load this home page."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [routeHomepageId, homepageIdOverride, profileIdOverride, profileNameOverride, tenantIdOverride]);

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  React.useEffect(() => {
    ids.forEach((id) => {
      const layout = layouts[id];
      if (layout) {
        debugDnd("widget rendered from state", {
          id,
          renderedX: layout.x,
          renderedY: layout.y,
          renderedWidth: layout.width,
          renderedHeight: layout.height,
        });
      }
    });
  }, [ids, layouts]);

  const widgetCatalog = [...widgets, ...reportWidgets, ...dashboardWidgets];
  const selectedWidgets = ids
    .map((id) => widgetCatalog.find((widget) => widget.id === id))
    .filter((widget): widget is Widget => Boolean(widget));

  const availableWidgets = widgetCatalog.filter(
    (widget) =>
      widget.category === widgetCategory &&
      !ids.includes(widget.id) &&
      widget.title.toLowerCase().includes(widgetSearch.toLowerCase()),
  );
  const availableProfiles = profiles.filter(
    (profile) =>
      !profileIds.includes(profile.id) &&
      profile.name.toLowerCase().includes(profileSearch.toLowerCase()),
  );
  const layoutBottom = Object.values(layouts).reduce((bottom, layout) => {
    const end = layout.y + layout.height;
    return Number.isFinite(end) ? Math.max(bottom, end) : bottom;
  }, 0);
  const canvasHeight = Math.max(
    860,
    layoutBottom + CELL_ORIGIN + GRID_SLOT_HEIGHT,
  );
  const canvasRows = Math.max(
    GRID_ROWS,
    Math.ceil((canvasHeight - CELL_ORIGIN) / GRID_SLOT_HEIGHT),
  );
  const canvasCells = Array.from(
    { length: GRID_COLUMNS * canvasRows },
    (_, index) => index,
  );

  const getPointerLayout = (
    id: string,
    clientX = pointerPosition.current.x,
    clientY = pointerPosition.current.y,
  ) => {
    const canvas = canvasRef.current;
    const bounds = canvas?.getBoundingClientRect();
    const dropX = bounds
      ? clientX - bounds.left - (canvas?.clientLeft ?? 0)
      : CELL_ORIGIN;
    const dropY = bounds
      ? clientY - bounds.top - (canvas?.clientTop ?? 0)
      : CELL_ORIGIN;
    return layoutAtDropPoint(id, dropX, dropY);
  };
  const swapDestination = (
    candidate: WidgetLayout,
    original: WidgetLayout,
  ) => {
    const collisions = Object.values(layouts).filter(
      (layout) => layout.id !== candidate.id && overlaps(candidate, layout),
    );
    if (collisions.length !== 1 || !isWithinCanvas(candidate)) return null;
    const [other] = collisions;
    const occupied = Object.fromEntries(
      Object.entries(layouts).filter(
        ([id]) => id !== candidate.id && id !== other.id,
      ),
    );
    if (Object.values(occupied).some((layout) => overlaps(candidate, layout))) {
      return null;
    }
    const destination = findFreeSwapLayout(
      other,
      original,
      { ...occupied, [candidate.id]: candidate },
    );
    return destination ? { widget: other, layout: destination } : null;
  };
  const canSwapLayout = (candidate: WidgetLayout) => {
    const original = dragStartLayouts.current[candidate.id];
    return Boolean(original && swapDestination(candidate, original));
  };
  const previewFor = (layout: WidgetLayout) => {
    const valid = canPlace(layout.id, layout, layouts);
    const swap = !valid && canSwapLayout(layout);
    const canDisplace =
      !valid &&
      !swap &&
      !ids.includes(layout.id) &&
      Boolean(placeWithDisplacement(layout.id, layout, layouts));
    return valid || swap || canDisplace
      ? { layout, valid: valid || canDisplace, swap }
      : null;
  };

  const commitAvailableWidget = (id: string, clientX: number, clientY: number) => {
    if (ids.includes(id)) return;
    const layout = snapLayout(getPointerLayout(id, clientX, clientY));
    const nextLayouts = placeWithDisplacement(id, layout, layouts);
    if (!nextLayouts) return;
    setIds((current) => (current.includes(id) ? current : [...current, id]));
    setLayouts(nextLayouts);
    setSelectedWidgetId(id);
  };

  const handleAvailableWidgetPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    widgetId: string,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    panelPointerDrag.current = { widgetId, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  React.useEffect(() => {
    const pointIsInsideCanvas = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const bounds = canvas.getBoundingClientRect();
      return (
        clientX >= bounds.left + canvas.clientLeft &&
        clientX <= bounds.right - canvas.clientLeft &&
        clientY >= bounds.top + canvas.clientTop &&
        clientY <= bounds.bottom - canvas.clientTop
      );
    };
    const handlePointerMove = (event: PointerEvent) => {
      const drag = panelPointerDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      if (!pointIsInsideCanvas(event.clientX, event.clientY)) {
        setDropPreview(null);
        return;
      }
      setDropPreview(
        previewFor(
          snapLayout(
            getPointerLayout(drag.widgetId, event.clientX, event.clientY),
          ),
        ),
      );
    };
    const handlePointerUp = (event: PointerEvent) => {
      const drag = panelPointerDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      panelPointerDrag.current = null;
      setDropPreview(null);
      if (pointIsInsideCanvas(event.clientX, event.clientY)) {
        commitAvailableWidget(drag.widgetId, event.clientX, event.clientY);
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (panelPointerDrag.current?.pointerId !== event.pointerId) return;
      panelPointerDrag.current = null;
      setDropPreview(null);
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
    };
  }, [ids, layouts]);

  const commitRect = (
    id: string,
    rect: Partial<WidgetLayout>,
    allowSwap = false,
  ) => {
    const original = dragStartLayouts.current[id] || layouts[id];
    const next = snapLayout({ ...layouts[id], ...rect });
    const collisions = Object.values(layouts).filter(
      (layout) => layout.id !== id && overlaps(next, layout),
    );
    setDropPreview(null);
    if (!collisions.length) {
      setLayouts((current) => ({ ...current, [id]: next }));
    } else if (allowSwap && collisions.length === 1 && original) {
      const swap = swapDestination(next, original);
      if (swap) {
        setLayouts((current) => ({
          ...current,
          [id]: next,
          [swap.widget.id]: swap.layout,
        }));
      } else {
        setLayouts((current) => ({ ...current, [id]: original }));
      }
    } else {
      if (original) {
        setLayouts((current) => ({ ...current, [id]: original }));
      }
    }
    setDragLayouts((current) => {
      const nextLayouts = { ...current };
      delete nextLayouts[id];
      return nextLayouts;
    });
    delete dragStartLayouts.current[id];
    bumpWidget(id);
    if (collisions.length === 1 && allowSwap) bumpWidget(collisions[0].id);
  };
  const removeWidget = (id: string) => {
    setIds((current) => current.filter((item) => item !== id));
    setLayouts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setDragLayouts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    delete dragStartLayouts.current[id];
    setDropPreview(null);
    setSelectedWidgetId((current) => (current === id ? null : current));
  };
  const restoreDefaultComponents = () => {
    setIds(defaultIds);
    setLayouts(defaultLayouts(defaultIds));
    setWidgetCategory("Org Overview");
    setWidgetSearch("");
    setSelectedWidgetId(null);
    setWidgetRenderVersion((version) => version + 1);
    setOptionsOpen(false);
  };
  const removeAllComponents = () => {
    setIds([]);
    setLayouts({});
    setSelectedWidgetId(null);
    setWidgetRenderVersion((version) => version + 1);
    setOptionsOpen(false);
  };

  const saveHomepage = async () => {
    if (!name.trim()) {
      setError("Enter a name for the home page.");
      return;
    }
    if (!profileIds.length) {
      setError("Add at least one profile before saving.");
      return;
    }
    const layout = ids.map((id) => layouts[id] || findFreeLayout(id, layouts));
    if (layout.some((item, index) =>
      layout.slice(index + 1).some((other) => overlaps(item, other)),
    )) {
      setError("Move overlapping components to separate grid areas before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        layout,
        profileIds,
      };
      const response = homepageId
        ? tenantIdOverride
          ? await homepageApi.update(homepageId, payload, tenantIdOverride)
          : await homepageApi.update(homepageId, payload)
        : tenantIdOverride
          ? await homepageApi.create(payload, tenantIdOverride)
          : await homepageApi.create(payload);
      const savedHomepage = responseData(response);
      if (!homepageId && savedHomepage?.id) setHomepageId(savedHomepage.id);
      setShareOpen(false);
      if (tenantIdOverride) {
        router.push(`/admin/customize-home?tenantId=${encodeURIComponent(tenantIdOverride)}`);
        return;
      }
      const destinationProfileId =
        profileIdOverride && profileIds.includes(profileIdOverride)
          ? profileIdOverride
          : profileIds[0];
      const destinationProfile = profiles.find(
        (profile) => profile.id === destinationProfileId,
      );
      const destinationProfileName =
        destinationProfile?.name || profileNameOverride || name.trim();
      rememberHomeProfile({ id: destinationProfileId, name: destinationProfileName });
      router.push(userHomePath(tenant, user?.id));
    } catch (saveError: any) {
      setError(
        saveError.response?.data?.error || "Unable to save the home page.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <div className="fixed inset-0 z-[60] flex min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Homepage name"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium"
              />
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="Homepage description"
                placeholder="Enter Description"
                className="mt-2 h-8 w-full rounded-md border bg-background px-3 text-sm text-muted-foreground"
              />
            </div>
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                aria-label="More homepage options"
                aria-expanded={optionsOpen}
                onClick={() => setOptionsOpen((open) => !open)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {optionsOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-md border bg-background p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={restoreDefaultComponents}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    Restore default components
                  </button>
                  <button
                    type="button"
                    onClick={removeAllComponents}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    Remove all components
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => setShareOpen(true)} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            Save and Share
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[68px] shrink-0 border-r bg-card text-muted-foreground md:flex md:flex-col">
            <div className="flex h-14 items-center justify-center border-b border-border text-xs font-bold text-foreground">
              DCT
            </div>
            <nav className="flex flex-1 flex-col items-center gap-2 py-3">
              {[
                [LayoutDashboard, "Dashboard"],
                [BarChart3, "Reports"],
              ].map(([Icon, label]) => (
                <button
                  key={label as string}
                  type="button"
                  aria-label={label as string}
                  onClick={() => {
                    setWidgetCategory(label === "Reports" ? "Reports" : "Dashboards");
                    setWidgetSearch("");
                  }}
                  className="flex w-full flex-col items-center gap-1 px-1 py-2 text-[11px] hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label as string}</span>
                </button>
              ))}
            </nav>
            <div className="border-t border-border p-2 text-center text-[11px] text-muted-foreground">
              Help
            </div>
          </aside>
          <aside className="hidden w-72 shrink-0 border-r bg-card text-foreground md:flex md:flex-col">
            <div className="border-b border-border px-5 py-4">
              {widgetCategory === "Dashboards" && (
                <p className="text-xs text-muted-foreground">Saved dashboards — drag one onto the canvas and save.</p>
              )}
              {(widgetCategory === "Org Overview" || widgetCategory === "Dashboards") && (
                <h2 className="font-semibold">Dashboard Components</h2>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Drag a component to the page
              </p>
              <select
                value={widgetCategory}
                onChange={(event) => {
                  setWidgetCategory(event.target.value as Widget["category"]);
                  setWidgetSearch("");
                }}
                aria-label="Component category"
                className="mt-4 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none"
              >
                <option>Org Overview</option>
                <option>Activity Stats</option>
                <option>Reports</option>
                <option>Dashboards</option>
              </select>
              <div className="mt-2 flex items-center rounded-md border border-input bg-background px-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={widgetSearch}
                  onChange={(event) => setWidgetSearch(event.target.value)}
                  placeholder="Search"
                  aria-label="Search dashboard components"
                  className="h-9 w-full bg-transparent px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {availableWidgets.map((widget) => (
                <div
                  key={widget.id}
                  onPointerDown={(event) =>
                    handleAvailableWidgetPointerDown(event, widget.id)
                  }
                  aria-label={`Add ${widget.title} to dashboard`}
                  className="flex w-full touch-none cursor-grab items-start gap-2 rounded-md border border-border bg-card px-3 py-3 text-left text-sm hover:bg-muted/50 active:cursor-grabbing"
                >
                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate">{widget.title}</span>
                    {(widget.category === "Reports" || widget.category === "Dashboards") && (
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{widget.description}</span>
                    )}
                  </span>
                </div>
              ))}
              {!availableWidgets.length && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No dashboard components found
                </p>
              )}
            </div>
          </aside>
          <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-background p-3 md:p-4">
            <div className="mx-auto w-full max-w-none">
              <div className="mb-3 flex items-center justify-between rounded-lg border bg-card px-3 py-2 shadow-sm">
                <div>
                  <h1 className="font-semibold">{name}&apos;s Home</h1>
                  <p className="text-xs text-muted-foreground">
                    Drag, resize, and arrange the dashboard components.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {selectedWidgets.length} components
                </span>
              </div>
                  <div
                    ref={(node) => {
                      canvasRef.current = node;
                    }}
                    onClick={() => setSelectedWidgetId(null)}
                    className="relative w-full overflow-hidden rounded-lg border border-border bg-white"
                    style={{
                      width: CANVAS_WIDTH,
                      minWidth: CANVAS_WIDTH,
                      minHeight: canvasHeight,
                      backgroundImage: "linear-gradient(#f8fafc 1px, transparent 1px), linear-gradient(90deg, #f8fafc 1px, transparent 1px)",
                      backgroundSize: `${CELL_WIDTH + CELL_GAP}px ${CELL_HEIGHT + CELL_GAP}px`,
                      backgroundPosition: `${CELL_ORIGIN}px ${CELL_ORIGIN}px`,
                      backgroundColor: "white",
                    }}
                  >
                    <div
                      className="pointer-events-none z-0"
                      aria-hidden="true"
                      style={{ position: "absolute", inset: 0 }}
                    >
                      {canvasCells.map((cell) => (
                        <div
                          key={cell}
                          className="absolute rounded-sm bg-slate-100/80"
                          style={{
                            position: "absolute",
                            left: CELL_ORIGIN + (cell % GRID_COLUMNS) * (CELL_WIDTH + CELL_GAP),
                            top: CELL_ORIGIN + Math.floor(cell / GRID_COLUMNS) * (CELL_HEIGHT + CELL_GAP),
                            width: CELL_WIDTH,
                            height: CELL_HEIGHT,
                          }}
                        />
                      ))}
                    </div>
                    {dropPreview && (
                      <div
                        className="pointer-events-none z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-100/70 text-xs font-semibold text-blue-700"
                        style={{
                          position: "absolute",
                          left: dropPreview.layout.x,
                          top: dropPreview.layout.y,
                          width: dropPreview.layout.width,
                          height: dropPreview.layout.height,
                        }}
                      >
                        {dropPreview.swap
                          ? "Swap positions"
                          : dropPreview.valid
                            ? "Drop component here"
                            : null}
                      </div>
                    )}
                    {selectedWidgets.map((widget) => {
                      const layout =
                        layouts[widget.id] ||
                        findFreeLayout(widget.id, layouts);
                      const dragLayout = dragLayouts[widget.id];
                      return (
                        <Rnd
                          key={`${widget.id}-${widgetRenderVersion}-${widgetVersions[widget.id] ?? 0}`}
                          data-widget-id={widget.id}
                          bounds="parent"
                          cancel=".dashboard-widget-action"
                          style={{
                            zIndex: selectedWidgetId === widget.id ? 2 : 1,
                            boxSizing: "border-box",
                            opacity: 1,
                          }}
                          size={{ width: layout.width, height: layout.height }}
                          position={{
                            x: dragLayout?.x ?? layout.x,
                            y: dragLayout?.y ?? layout.y,
                          }}
                          minWidth={MIN_WIDGET_WIDTH}
                          minHeight={MIN_WIDGET_HEIGHT}
                          enableResizing={
                            selectedWidgetId === widget.id
                              ? {
                                  top: true,
                                  right: true,
                                  bottom: true,
                                  left: true,
                                  topRight: true,
                                  bottomRight: true,
                                  bottomLeft: true,
                                  topLeft: true,
                                }
                              : false
                          }
                          resizeHandleStyles={resizeHandles}
                          onDragStart={() => {
                            dragStartLayouts.current[widget.id] = layout;
                            setDragLayouts((current) => {
                              const next = { ...current };
                              delete next[widget.id];
                              return next;
                            });
                            setSelectedWidgetId(widget.id);
                          }}
                          onDrag={(_, data) => {
                            const candidate = {
                              ...layouts[widget.id],
                              x: data.x,
                              y: data.y,
                            };
                            setDropPreview(previewFor(snapLayout(candidate)));
                            setDragLayouts((current) => ({
                              ...current,
                              [widget.id]: candidate,
                            }));
                          }}
                          onDragStop={(_, data) =>
                            commitRect(widget.id, { x: data.x, y: data.y }, true)
                          }
                          onResize={(_, __, ref, ___, position) => {
                            const candidate = {
                              id: widget.id,
                              x: position.x,
                              y: position.y,
                              width: ref.offsetWidth,
                              height: ref.offsetHeight,
                            };
                            setDropPreview(previewFor(snapLayout(candidate)));
                            if (canPlace(widget.id, candidate, layouts)) {
                              setLayouts((current) => ({
                                ...current,
                                [widget.id]: candidate,
                              }));
                            }
                          }}
                          onResizeStop={(_, __, ref, ___, position) =>
                            commitRect(widget.id, {
                              x: position.x,
                              y: position.y,
                              width: ref.offsetWidth,
                              height: ref.offsetHeight,
                            })
                          }
                        >
                          <section
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedWidgetId(widget.id);
                            }}
                            className={`flex h-full w-full min-h-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${selectedWidgetId === widget.id ? "border-primary" : "border-border"}`}
                          >
                            <div className="flex shrink-0 items-start justify-between gap-2 px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <GripVertical className="h-3 w-3 cursor-move text-muted-foreground" />
                                <div className="min-w-0">
                                  <h3 className="truncate text-xs font-semibold text-foreground opacity-100">
                                    {widget.title}
                                  </h3>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {widget.description}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="dashboard-widget-action h-6 w-6"
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeWidget(widget.id);
                                }}
                                aria-label={`Close ${widget.title}`}
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                            <WidgetContent widget={widget} previewData={previewData} />
                          </section>
                        </Rnd>
                      );
                    })}
                    {!selectedWidgets.length && (
                      <div
                        className="pointer-events-none z-20 flex items-center justify-center p-6"
                        style={{ position: "absolute", inset: 0 }}
                      >
                        <div className="flex min-h-[276px] w-full max-w-[430px] flex-col items-center justify-center rounded-lg border border-border bg-white px-8 py-10 text-center shadow-sm">
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-blue-200 bg-white shadow-sm">
                            <Blocks className="h-6 w-6 text-emerald-400" />
                          </div>
                          <p className="mt-6 text-xl font-medium tracking-tight text-foreground">
                            Drag and drop a component
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Build your Homepage by adding components.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
            </div>
          </main>
        </div>
      {error && (
        <div className="fixed bottom-5 left-1/2 z-[95] -translate-x-1/2 rounded-md bg-destructive px-4 py-3 text-sm text-destructive-foreground shadow-md">
          {error}
        </div>
      )}
      {notice && (
        <div className="fixed bottom-5 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm text-white shadow-md">
          <Check className="h-4 w-4" />
          {notice}
        </div>
      )}
      {shareOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-card p-6 shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">{name}</h2>
              <button onClick={() => setShareOpen(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                />
              </label>
              <label className="block text-sm font-medium">
                Enter Description
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-2 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
                />
              </label>
              <div>
                <p className="text-sm font-medium">Share with</p>
                <div className="mt-2 flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-input px-2 py-1">
                  {profileIds.map((id) => (
                    <span
                      key={id}
                      className="rounded bg-muted px-2 py-1 text-sm"
                    >
                      {profiles.find((profile) => profile.id === id)?.name}
                      <button
                        className="ml-2"
                        onClick={() =>
                          setProfileIds((current) =>
                            current.filter((item) => item !== id),
                          )
                        }
                        aria-label="Remove profile"
                      >
                        x
                      </button>
                    </span>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setProfilePickerOpen(true)}
                  >
                    Add Profile
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShareOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveHomepage} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {profilePickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Share with</h2>
              <button
                onClick={() => setProfilePickerOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid min-h-[300px] grid-cols-2 rounded-md border">
              <div className="border-r">
                <div className="flex items-center border-b px-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={profileSearch}
                    onChange={(event) => setProfileSearch(event.target.value)}
                    placeholder="Search profiles"
                    className="h-9 w-full bg-transparent px-2 text-[13px] outline-none"
                  />
                </div>
                {availableProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-sm">{profile.name}</span>
                    <Button
                      size="sm"
                      onClick={() =>
                        setProfileIds((current) => [...current, profile.id])
                      }
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
              <div className="p-4">
                <p className="font-medium">Selected</p>
                {profileIds.map((id) => (
                  <div
                    key={id}
                    className="mt-2 flex items-center justify-between rounded bg-muted px-3 py-2 text-sm"
                  >
                    {profiles.find((profile) => profile.id === id)?.name}
                    <button
                      onClick={() =>
                        setProfileIds((current) =>
                          current.filter((item) => item !== id),
                        )
                      }
                      aria-label="Remove profile"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setProfilePickerOpen(false)}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CompanyHomepage {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  updatedAt: string;
  sharedProfiles: Array<{ profile?: { id: string; name: string } | null; profileId?: string }>;
}

function CompanySetupHomeManager({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [companyName, setCompanyName] = React.useState("");
  const [homepages, setHomepages] = React.useState<CompanyHomepage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = React.useState<string | null>(null);

  const loadHomepages = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [companyResponse, homepagesResponse] = await Promise.all([
        companyApi.get(tenantId),
        homepageApi.list(tenantId),
      ]);
      const company = responseData(companyResponse);
      const data = responseData(homepagesResponse);
      setCompanyName(company?.name || "");
      setHomepages(Array.isArray(data) ? data : []);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.error || "Unable to load this company's Setup Home pages.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    void loadHomepages();
  }, [loadHomepages]);

  const deleteHomepage = async (homepageId: string) => {
    setDeletingId(homepageId);
    setError("");
    try {
      await homepageApi.delete(homepageId, tenantId);
      await loadHomepages();
    } catch (deleteError: any) {
      setError(deleteError?.response?.data?.error || "Unable to delete this Setup Home page.");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleHomepageStatus = async (homepage: CompanyHomepage) => {
    setUpdatingStatusId(homepage.id);
    setError("");
    try {
      await homepageApi.updateStatus(homepage.id, !homepage.isActive, tenantId);
      await loadHomepages();
    } catch (statusError: any) {
      setError(statusError?.response?.data?.error || "Unable to update this Setup Home status.");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const createHref = `/admin/customize-home/create?tenantId=${encodeURIComponent(tenantId)}`;
  const profilesHref = `/setup/security/profiles?tenantId=${encodeURIComponent(tenantId)}`;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/admin/companies/${encodeURIComponent(tenantId)}`)}
            aria-label="Back to company"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Building2 className="h-5 w-5" />
              Setup Home
            </h1>
            <p className="text-sm text-muted-foreground">{companyName}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push(profilesHref)}>
            <Settings className="mr-2 h-4 w-4" />
            Manage Profiles
          </Button>
          <Button onClick={() => router.push(createHref)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Setup Home
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : homepages.length === 0 ? (
        <div className="rounded-md border py-12 text-center text-sm text-muted-foreground">
          No Setup Home pages have been created for this company.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Profiles</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {homepages.map((homepage) => (
                <tr key={homepage.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{homepage.name}</p>
                    {homepage.description && <p className="text-xs text-muted-foreground">{homepage.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {homepage.sharedProfiles.map((item) => item.profile?.name).filter(Boolean).join(", ") || "None"}
                  </td>
                  <td className="px-4 py-3">{homepage.isActive ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void toggleHomepageStatus(homepage)}
                        disabled={updatingStatusId === homepage.id}
                      >
                        {updatingStatusId === homepage.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Power className="mr-2 h-4 w-4" />
                        )}
                        {homepage.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/customize-home/${encodeURIComponent(homepage.id)}?tenantId=${encodeURIComponent(tenantId)}`)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      {deletingId === homepage.id ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setDeletingId(null)}>Cancel</Button>
                          <Button variant="destructive" size="sm" onClick={() => void deleteHomepage(homepage.id)}>Confirm delete</Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setDeletingId(homepage.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CustomizeProfileHomePage() {
  const params = useParams<{ profileName?: string }>();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");
  if (tenantId && !params.profileName) {
    return <CompanySetupHomeManager tenantId={tenantId} />;
  }
  return <HomepageBuilder />;
}