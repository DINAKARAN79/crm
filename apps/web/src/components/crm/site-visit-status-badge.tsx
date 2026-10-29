import { Badge } from "@/components/ui/badge";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  SCHEDULED: { label: "Scheduled", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  COMPLETED: { label: "Completed", className: "bg-green-100 text-green-800 hover:bg-green-100" },
  CANCELLED: { label: "Cancelled", className: "bg-red-100 text-red-800 hover:bg-red-100" },
  MISSED: { label: "Missed", className: "bg-red-100 text-red-800 hover:bg-red-100" },
  RESCHEDULED: { label: "Rescheduled", className: "bg-violet-100 text-violet-800 hover:bg-violet-100" },
};

export function isSiteVisitStatusColumn(objectName: string | undefined, column: string): boolean {
  return objectName === "SiteVisit" && (column === "status" || column.endsWith(".status"));
}

export function siteVisitStatusLabel(status: string): string {
  return STATUS_BADGES[status.toUpperCase()]?.label || status;
}

export function SiteVisitStatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status.toUpperCase()];
  if (!badge) return <>{status.replaceAll("_", " ")}</>;
  return <Badge className={badge.className}>{badge.label}</Badge>;
}

export function reportStatusCell(
  objectName: string | undefined,
  column: string,
  value: unknown,
  empty = "-",
) {
  if (value == null || value === "") return empty;
  const text = String(value);
  if (!isSiteVisitStatusColumn(objectName, column)) return text;
  return <SiteVisitStatusBadge status={text} />;
}
