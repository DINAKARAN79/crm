import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WidgetConfigForm, type AxisField } from "./widget-config-form";

const fields: AxisField[] = [
  { key: "status", label: "Lead Status", type: "enum" },
  { key: "source", label: "Lead Source", type: "enum" },
  { key: "projectName", label: "Project", type: "string" },
  { key: "ownerName", label: "Owner", type: "string" },
  { key: "createdAt", label: "Created Date", type: "date" },
  { key: "budget", label: "Budget", type: "number" },
];

function Harness({ initial }: { initial: Record<string, unknown> }) {
  const [draft, setDraft] = React.useState(initial);
  return (
    <WidgetConfigForm
      draft={draft}
      setDraft={setDraft}
      fields={fields}
      onChangeReport={() => undefined}
    />
  );
}

function optionLabels(select: HTMLElement) {
  return Array.from((select as HTMLSelectElement).options).map((option) => option.text);
}

describe("widget chart axes form", () => {
  it("shows category on X and record count on Y for a bar chart", () => {
    render(<Harness initial={{ chartType: "column", aggregation: "count", reportName: "Leads" }} />);
    expect(screen.getByLabelText("Enable X-axis")).toBeChecked();
    expect(optionLabels(screen.getByLabelText("X-axis field"))).toEqual(
      expect.arrayContaining(["Lead Status", "Lead Source", "Project", "Owner", "Created Date"]),
    );
    expect(optionLabels(screen.getByLabelText("X-axis field"))).not.toContain("Budget");
    expect(optionLabels(screen.getByLabelText("Y-axis field"))).toContain("Record Count");
    expect(optionLabels(screen.getByLabelText("Y-axis field"))).toContain("Budget");
    expect(optionLabels(screen.getByLabelText("Y-axis field"))).not.toContain("Lead Status");
  });

  it("puts the metric on X and the category on Y for a horizontal bar", () => {
    render(<Harness initial={{ chartType: "bar", aggregation: "count" }} />);
    expect(optionLabels(screen.getByLabelText("X-axis field"))).toContain("Record Count");
    expect(optionLabels(screen.getByLabelText("X-axis field"))).toContain("Budget");
    expect(optionLabels(screen.getByLabelText("Y-axis field"))).toContain("Lead Status");
    expect(optionLabels(screen.getByLabelText("Y-axis field"))).not.toContain("Budget");
  });

  it("shows date grouping for a created date line chart and updates the title immediately", () => {
    render(
      <Harness
        initial={{
          chartType: "line",
          xAxis: "createdAt",
          xFieldType: "date",
          aggregation: "count",
        }}
      />,
    );
    expect(screen.getByLabelText("Date grouping")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("X-axis title"), { target: { value: "Created" } });
    expect(screen.getByLabelText("X-axis title")).toHaveValue("Created");
    fireEvent.change(screen.getByLabelText("Number format"), { target: { value: "currency" } });
    expect(screen.getByLabelText("Number format")).toHaveValue("currency");
  });

  it("offers sum, average, minimum, and maximum for a numeric field", () => {
    render(<Harness initial={{ chartType: "column", aggregation: "count" }} />);
    fireEvent.change(screen.getByLabelText("Y-axis field"), { target: { value: "budget" } });
    expect(optionLabels(screen.getByLabelText("Y-axis aggregation"))).toEqual([
      "Sum",
      "Average",
      "Minimum",
      "Maximum",
    ]);
  });

  it("hides cartesian axes for pie, donut, number, and table", () => {
    render(<Harness initial={{ chartType: "pie", aggregation: "count" }} />);
    expect(screen.queryByLabelText("Enable X-axis")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Category field")).toBeInTheDocument();
    cleanup();
    render(<Harness initial={{ chartType: "donut", aggregation: "count" }} />);
    expect(screen.queryByLabelText("Enable X-axis")).not.toBeInTheDocument();
    cleanup();
    render(<Harness initial={{ chartType: "number", aggregation: "count" }} />);
    expect(screen.queryByLabelText("Enable X-axis")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Metric")).toBeInTheDocument();
    cleanup();
    render(<Harness initial={{ chartType: "table" }} />);
    expect(screen.queryByLabelText("Enable X-axis")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Column Lead Status")).toBeInTheDocument();
  });

  it("switches the visible controls when the chart type changes", () => {
    render(<Harness initial={{ chartType: "column", aggregation: "count" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Gauge" }));
    expect(screen.queryByLabelText("Enable X-axis")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Gauge minimum")).toBeInTheDocument();
    expect(screen.getByLabelText("Gauge target")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scatter" }));
    expect(screen.getByLabelText("Enable X-axis")).toBeInTheDocument();
    expect(optionLabels(screen.getAllByLabelText("X-axis field")[0])).toEqual(["Select a field", "Budget"]);
  });
});
