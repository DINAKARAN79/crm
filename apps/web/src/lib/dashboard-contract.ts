export const dashboardChartTypes = [
  "bar",
  "column",
  "stackedBar",
  "stackedColumn",
  "line",
  "area",
  "pie",
  "donut",
  "number",
  "gauge",
  "funnel",
  "scatter",
  "table",
] as const;

export function dashboardMode(search: string): "view" | "edit" {
  return new URLSearchParams(search).get("mode") === "view" ? "view" : "edit";
}

export function dashboardExportUrl(
  id: string,
  format: "json" | "csv" | "pdf",
): string {
  return `/api/proxy/api/dashboards/${encodeURIComponent(id)}/export?format=${format}`;
}

export function hasReportData(rows: unknown): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

export function hasWidgetId(
  widgets: Array<{ id?: string }> | undefined,
  widgetId: string | undefined,
): boolean {
  return Boolean(
    widgetId &&
      Array.isArray(widgets) &&
      widgets.some((widget) => widget.id === widgetId),
  );
}
