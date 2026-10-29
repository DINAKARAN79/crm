import { describe, expect, it } from "vitest";
import {
  dashboardChartTypes,
  dashboardExportUrl,
  dashboardMode,
  hasReportData,
  hasWidgetId,
} from "@/lib/dashboard-contract";

describe("dashboard contract", () => {
  it("supports view and edit URL modes", () => {
    expect(dashboardMode("?mode=view")).toBe("view");
    expect(dashboardMode("?mode=edit")).toBe("edit");
    expect(dashboardMode("")).toBe("edit");
  });

  it("builds authenticated dashboard export URLs", () => {
    expect(dashboardExportUrl("dash/1", "pdf")).toBe(
      "/api/proxy/api/dashboards/dash%2F1/export?format=pdf",
    );
  });

  it("renders only configured chart types and real rows", () => {
    expect(dashboardChartTypes).toContain("line");
    expect(dashboardChartTypes).toContain("funnel");
    expect(hasReportData([])).toBe(false);
    expect(hasReportData([{ count: 1 }])).toBe(true);
  });

  it("ignores stale widget ids that no longer exist in the dashboard layout", () => {
    expect(hasWidgetId([{ id: "a" }, { id: "b" }], "b")).toBe(true);
    expect(hasWidgetId([{ id: "a" }, { id: "b" }], "c")).toBe(false);
    expect(hasWidgetId(undefined, "c")).toBe(false);
  });
});
