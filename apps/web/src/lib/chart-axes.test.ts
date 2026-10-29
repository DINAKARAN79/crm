import { describe, expect, it } from "vitest";
import {
  aggregationChoices,
  axisMode,
  bucketDate,
  cartesianAxes,
  fieldsForRole,
  fieldsFromSource,
  formatChartNumber,
  prepareWidgetChart,
  remapChartType,
} from "./chart-axes";

const leadFields = [
  { key: "status", label: "Lead Status", type: "enum" as const },
  { key: "source", label: "Lead Source", type: "enum" as const },
  { key: "projectName", label: "Project", type: "string" as const },
  { key: "ownerName", label: "Owner", type: "string" as const },
  { key: "createdAt", label: "Created Date", type: "date" as const },
  { key: "budget", label: "Budget", type: "number" as const },
  { key: "notes", label: "Notes", type: "string" as const },
];

const rows = [
  { status: "New", source: "Web", projectName: "A", ownerName: "Ada", createdAt: "2026-01-05T10:00:00.000Z", budget: 10 },
  { status: "New", source: "Web", projectName: "A", ownerName: "Ada", createdAt: "2026-01-20T10:00:00.000Z", budget: 30 },
  { status: "Lost", source: "Call", projectName: "B", ownerName: "Bo", createdAt: "2026-03-02T10:00:00.000Z", budget: 5 },
];

describe("chart axis modes", () => {
  it("maps chart types onto the axes they should show", () => {
    expect(axisMode("column")).toBe("category-metric");
    expect(axisMode("bar")).toBe("metric-category");
    expect(axisMode("line")).toBe("category-metric");
    expect(axisMode("area")).toBe("category-metric");
    expect(axisMode("scatter")).toBe("scatter");
    expect(axisMode("pie")).toBe("category-value");
    expect(axisMode("donut")).toBe("category-value");
    expect(axisMode("funnel")).toBe("category-value");
    expect(axisMode("gauge")).toBe("gauge");
    expect(axisMode("number")).toBe("kpi");
    expect(axisMode("table")).toBe("table");
    expect(cartesianAxes("column")).toBe(true);
    expect(cartesianAxes("pie")).toBe(false);
    expect(cartesianAxes("table")).toBe(false);
    expect(cartesianAxes("number")).toBe(false);
  });

  it("offers only fields the selected report exposes", () => {
    const fields = fieldsFromSource({
      metadata: leadFields,
      reportColumns: ["status", "source", "projectName", "ownerName", "createdAt", "budget"],
      sampleRows: rows,
    });
    expect(fields.map((field) => field.label)).toEqual([
      "Lead Status",
      "Lead Source",
      "Project",
      "Owner",
      "Created Date",
      "Budget",
    ]);
    expect(fieldsForRole(fields, "category").map((field) => field.key)).not.toContain("budget");
    expect(fieldsForRole(fields, "numeric").map((field) => field.key)).toEqual(["budget"]);
    expect(aggregationChoices(fields.find((field) => field.key === "status"))).toEqual([
      { value: "count", label: "Record Count" },
    ]);
    expect(aggregationChoices(fields.find((field) => field.key === "budget")).map((choice) => choice.value)).toEqual([
      "count",
      "sum",
      "avg",
      "min",
      "max",
    ]);
  });
});

describe("prepareWidgetChart", () => {
  it("puts lead status on X and record count on Y for a bar chart", () => {
    const chart = prepareWidgetChart({
      rows,
      chartType: "column",
      config: {
        xAxis: "status",
        xFieldType: "enum",
        aggregation: "count",
        xAxisTitle: "Lead Status",
        yAxisTitle: "Record Count",
      },
    });
    expect(chart.xNumeric).toBe(false);
    expect(chart.yNumeric).toBe(true);
    expect(chart.xTitle).toBe("Lead Status");
    expect(chart.yTitle).toBe("Record Count");
    expect(chart.data).toEqual([
      { category: "New", value: 2 },
      { category: "Lost", value: 1 },
    ]);
  });

  it("keeps an older horizontal bar that stored the category on xAxis", () => {
    const chart = prepareWidgetChart({
      rows,
      chartType: "bar",
      config: { xAxis: "status", aggregation: "count" },
    });
    expect(chart.categoryAxis).toBe("y");
    expect(chart.data).toEqual([
      { category: "New", value: 2 },
      { category: "Lost", value: 1 },
    ]);
  });

  it("puts the category on Y and the metric on X for a horizontal bar", () => {
    const chart = prepareWidgetChart({
      rows,
      chartType: "bar",
      config: {
        axesVersion: 2,
        yAxis: "source",
        yFieldType: "enum",
        aggregation: "count",
      },
    });
    expect(chart.categoryAxis).toBe("y");
    expect(chart.xNumeric).toBe(true);
    expect(chart.yNumeric).toBe(false);
    expect(chart.data).toEqual([
      { category: "Web", value: 2 },
      { category: "Call", value: 1 },
    ]);
  });

  it("groups a line chart by created date", () => {
    const chart = prepareWidgetChart({
      rows,
      chartType: "line",
      config: {
        xAxis: "createdAt",
        xFieldType: "date",
        dateGrouping: "month",
        aggregation: "count",
      },
    });
    expect(chart.data.map((row) => row.category)).toEqual(["2026-01", "2026-03"]);
    expect(chart.data.map((row) => row.value)).toEqual([2, 1]);
  });

  it("sums a numeric field and formats the axis value", () => {
    const chart = prepareWidgetChart({
      rows,
      chartType: "column",
      config: {
        xAxis: "projectName",
        yAxis: "budget",
        yFieldType: "number",
        aggregation: "sum",
        numberFormat: "full",
      },
    });
    expect(chart.data).toEqual([
      { category: "A", value: 40 },
      { category: "B", value: 5 },
    ]);
    expect(chart.format(1500)).toBe("1,500");
    expect(formatChartNumber(1500, { numberFormat: "short" })).toBe("1.5K");
  });

  it("hides a cartesian series when the chosen field is not in the report", () => {
    const chart = prepareWidgetChart({
      rows,
      chartType: "column",
      config: { xAxis: "missingField", aggregation: "count" },
    });
    expect(chart.message).toMatch(/not in this report/);
    expect(chart.data).toEqual([]);
  });

  it("plots scatter points from two numeric fields and skips nulls", () => {
    const chart = prepareWidgetChart({
      rows: [
        { score: 1, budget: 10 },
        { score: null, budget: 4 },
        { score: 3, budget: 8 },
      ],
      chartType: "scatter",
      config: { xAxis: "score", yAxis: "budget" },
    });
    expect(chart.data).toEqual([
      { x: 1, y: 10 },
      { x: 3, y: 8 },
    ]);
  });

  it("builds a gauge metric with minimum, maximum, and target", () => {
    const chart = prepareWidgetChart({
      rows,
      chartType: "gauge",
      config: { aggregation: "count", gaugeMin: 0, gaugeMax: 10, gaugeTarget: 8 },
    });
    expect(chart.metricTotal).toBe(3);
    expect(chart.gauge).toMatchObject({ min: 0, max: 10, target: 8, value: 3 });
  });

  it("updates titles and hides axes from the same config the widget stores", () => {
    const hidden = prepareWidgetChart({
      rows,
      chartType: "column",
      config: {
        xAxis: "status",
        aggregation: "count",
        xAxisEnabled: false,
        showYLabels: false,
        yAxisTitle: "Leads",
      },
    });
    expect(hidden.showXAxis).toBe(false);
    expect(hidden.showYLabels).toBe(false);
    expect(hidden.yTitle).toBe("Leads");
  });
});

describe("date buckets and chart type changes", () => {
  it("buckets dates in Asia/Kolkata", () => {
    expect(bucketDate("2026-01-15T20:30:00.000Z", "day")).toBe("2026-01-16");
    expect(bucketDate("2026-01-15T10:00:00.000Z", "quarter")).toBe("Q1 2026");
    expect(bucketDate("", "month")).toBe("(Blank)");
  });

  it("drops a category field that cannot be a scatter axis", () => {
    const next = remapChartType(
      "scatter",
      { chartType: "column", xAxis: "status", yAxis: "budget", aggregation: "sum" },
      leadFields,
    );
    expect(next.xAxis).toBe("budget");
    expect(next.yAxis).toBe("");
  });
});
