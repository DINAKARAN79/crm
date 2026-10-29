"use client";

import * as React from "react";
import {
  AreaChart as AreaChartIcon,
  BarChart3,
  BarChartHorizontal,
  CircleDot,
  Filter,
  Gauge,
  Hash,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  ScatterChart as ScatterChartIcon,
  Table2,
  X,
} from "lucide-react";
import {
  aggregationChoices,
  axisMode,
  cartesianAxes,
  fieldsForRole,
  remapChartType,
  type AxisField,
} from "@/lib/chart-axes";

export type { AxisField };
export type WidgetDraft = Record<string, any>;

const CHART_OPTIONS = [
  { value: "column", label: "Bar", Icon: BarChart3 },
  { value: "bar", label: "Horizontal Bar", Icon: BarChartHorizontal },
  { value: "line", label: "Line", Icon: LineChartIcon },
  { value: "area", label: "Area", Icon: AreaChartIcon },
  { value: "scatter", label: "Scatter", Icon: ScatterChartIcon },
  { value: "pie", label: "Pie", Icon: PieChartIcon },
  { value: "donut", label: "Donut", Icon: CircleDot },
  { value: "funnel", label: "Funnel", Icon: Filter },
  { value: "gauge", label: "Gauge", Icon: Gauge },
  { value: "number", label: "Number", Icon: Hash },
  { value: "table", label: "Table", Icon: Table2 },
] as const;

const fieldClass =
  "mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        className="h-4 w-4 accent-blue-600"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  allowBlank,
  blankLabel,
}: {
  label: string;
  value: string;
  options: AxisField[];
  onChange: (field: AxisField | undefined) => void;
  disabled?: boolean;
  allowBlank?: boolean;
  blankLabel?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <select
        aria-label={label}
        className={fieldClass}
        disabled={disabled}
        value={value}
        onChange={(event) =>
          onChange(options.find((field) => field.key === event.target.value))
        }
      >
        {allowBlank && <option value="">{blankLabel || "Select a field"}</option>}
        {options.map((field) => (
          <option key={field.key} value={field.key}>
            {field.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <input
        aria-label={label}
        className={fieldClass}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function WidgetConfigForm({
  draft,
  setDraft,
  fields,
  fieldError,
  onChangeReport,
}: {
  draft: WidgetDraft;
  setDraft: React.Dispatch<React.SetStateAction<WidgetDraft>>;
  fields: AxisField[];
  fieldError?: string;
  onChangeReport: () => void;
}) {
  const patch = (value: WidgetDraft) =>
    setDraft((current) => ({ ...current, axesVersion: 2, ...value }));
  const chartType = draft.chartType || "bar";
  const mode = axisMode(chartType);
  const useReportChart = Boolean(draft.useReportChart);
  const useReportTable = Boolean(draft.useReportTable);
  const aggregation = draft.aggregation || "count";
  const categoryFields = fieldsForRole(fields, "category");
  const numericFields = fieldsForRole(fields, "numeric");
  const categoryOnY = mode === "metric-category";
  const categoryKey = categoryOnY ? "yAxis" : "xAxis";
  const metricKey = categoryOnY ? "xAxis" : "yAxis";
  const categoryTypeKey = categoryOnY ? "yFieldType" : "xFieldType";
  const metricTypeKey = categoryOnY ? "xFieldType" : "yFieldType";
  const categoryField = fields.find((field) => field.key === draft[categoryKey]);
  const metricField = fields.find((field) => field.key === draft[metricKey]);
  const metricChoices = aggregationChoices(metricField || numericFields[0]);
  const showDateGrouping = categoryField?.type === "date";
  const metricIsNumeric = aggregation !== "count";

  const setCategory = (field: AxisField | undefined) => {
    patch({
      [categoryKey]: field?.key || "",
      [categoryTypeKey]: field?.type,
      ...(field?.type === "date" ? { dateGrouping: draft.dateGrouping || "day" } : { dateGrouping: undefined }),
    });
  };
  const setMetricChoice = (value: string) => {
    if (value === "count") {
      patch({ aggregation: "count", [metricKey]: "", [metricTypeKey]: undefined });
      return;
    }
    const field = numericFields.find((item) => item.key === value) || numericFields[0];
    patch({
      aggregation: metricIsNumeric ? aggregation : "sum",
      [metricKey]: field?.key || "",
      [metricTypeKey]: field?.type,
    });
  };
  const setAggregation = (value: string) => {
    const field = metricField || numericFields[0];
    patch({
      aggregation: value,
      [metricKey]: field?.key || "",
      [metricTypeKey]: field?.type,
    });
  };

  const categoryControls = (axis: "X-axis" | "Y-axis") => (
    <>
      <FieldSelect
        label={`${axis} field`}
        value={String(draft[categoryKey] || "")}
        options={categoryFields}
        disabled={useReportChart}
        allowBlank
        onChange={setCategory}
      />
      <TextField
        label={`${axis} title`}
        value={String(draft[axis === "X-axis" ? "xAxisTitle" : "yAxisTitle"] || "")}
        placeholder={categoryField?.label || "Category"}
        onChange={(value) =>
          patch(axis === "X-axis" ? { xAxisTitle: value } : { yAxisTitle: value })
        }
      />
      <Check
        label={`Show ${axis} labels`}
        checked={draft[axis === "X-axis" ? "showXLabels" : "showYLabels"] !== false}
        onChange={(value) =>
          patch(axis === "X-axis" ? { showXLabels: value } : { showYLabels: value })
        }
      />
      <label className="block text-xs font-semibold text-slate-700">
        {axis} label rotation
        <select
          aria-label={`${axis} label rotation`}
          className={fieldClass}
          value={String(draft.labelRotation ?? 0)}
          onChange={(event) => patch({ labelRotation: Number(event.target.value) })}
        >
          <option value="0">Horizontal</option>
          <option value="45">45 degrees</option>
          <option value="90">90 degrees</option>
          <option value="-45">-45 degrees</option>
        </select>
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        {axis} sort
        <select
          aria-label={`${axis} sort`}
          className={fieldClass}
          value={String(draft.axisSort || "none")}
          onChange={(event) => patch({ axisSort: event.target.value })}
        >
          <option value="none">None</option>
          <option value="labelAsc">Label A to Z</option>
          <option value="labelDesc">Label Z to A</option>
          <option value="valueAsc">Value low to high</option>
          <option value="valueDesc">Value high to low</option>
        </select>
      </label>
      {showDateGrouping && (
        <label className="block text-xs font-semibold text-slate-700">
          Date grouping
          <select
            aria-label="Date grouping"
            className={fieldClass}
            value={String(draft.dateGrouping || "day")}
            onChange={(event) => patch({ dateGrouping: event.target.value })}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </label>
      )}
    </>
  );

  const metricControls = (axis: "X-axis" | "Y-axis") => {
    const titleKey = axis === "X-axis" ? "xAxisTitle" : "yAxisTitle";
    const labelsKey = axis === "X-axis" ? "showXLabels" : "showYLabels";
    const minKey = axis === "X-axis" ? "xMin" : "yMin";
    const maxKey = axis === "X-axis" ? "xMax" : "yMax";
    const tickKey = axis === "X-axis" ? "xTickInterval" : "yTickInterval";
    const selectedMetric = metricIsNumeric ? String(draft[metricKey] || numericFields[0]?.key || "") : "count";
    return (
      <>
        <label className="block text-xs font-semibold text-slate-700">
          {axis} field
          <select
            aria-label={`${axis} field`}
            className={fieldClass}
            disabled={useReportChart}
            value={selectedMetric}
            onChange={(event) => setMetricChoice(event.target.value)}
          >
            <option value="count">Record Count</option>
            {numericFields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
        {metricIsNumeric && (
          <label className="block text-xs font-semibold text-slate-700">
            {axis} aggregation
            <select
              aria-label={`${axis} aggregation`}
              className={fieldClass}
              disabled={useReportChart}
              value={aggregation}
              onChange={(event) => setAggregation(event.target.value)}
            >
              {metricChoices
                .filter((choice) => choice.value !== "count")
                .map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        <TextField
          label={`${axis} title`}
          value={String(draft[titleKey] || "")}
          placeholder={aggregation === "count" ? "Record Count" : metricField?.label || "Value"}
          onChange={(value) => patch({ [titleKey]: value })}
        />
        <Check
          label={`Show ${axis} labels`}
          checked={draft[labelsKey] !== false}
          onChange={(value) => patch({ [labelsKey]: value })}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <TextField
            label={`${axis} minimum`}
            value={draft[minKey] ?? ""}
            onChange={(value) => patch({ [minKey]: value })}
          />
          <TextField
            label={`${axis} maximum`}
            value={draft[maxKey] ?? ""}
            onChange={(value) => patch({ [maxKey]: value })}
          />
          <TextField
            label={`${axis} tick interval`}
            value={draft[tickKey] ?? ""}
            onChange={(value) => patch({ [tickKey]: value })}
          />
        </div>
        <NumberFormat value={draft} onChange={patch} />
      </>
    );
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-700">Report</p>
        <div className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2">
          <span className="truncate font-medium text-slate-900">
            {draft.reportName || "Selected report"}
          </span>
          <button
            type="button"
            aria-label="Change report"
            title="Change report"
            onClick={onChangeReport}
            className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <TextField
        label="Title"
        value={String(draft.title || "")}
        onChange={(value) => patch({ title: value })}
      />

      <Check
        label="Use chart settings from report"
        checked={useReportChart}
        onChange={(value) =>
          patch(
            value
              ? { useReportChart: true, xAxis: "", yAxis: "", aggregation: "count" }
              : { useReportChart: false },
          )
        }
      />
      <Check
        label="Use table settings from report"
        checked={useReportTable}
        onChange={(value) =>
          patch(
            value
              ? { useReportTable: true, chartType: "table" }
              : { useReportTable: false, chartType: "column" },
          )
        }
      />

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-700">Display As</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {CHART_OPTIONS.map(({ value, label, Icon }) => {
            const active = chartType === value;
            return (
              <button
                key={value}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={active}
                disabled={useReportTable}
                onClick={() => patch(remapChartType(value, draft, fields))}
                className={`flex h-11 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-500 hover:border-blue-400 hover:bg-blue-50"
                }`}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
      </div>

      {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}

      {mode === "table" && (
        <ColumnPicker
          fields={fields.length ? fields : []}
          selected={Array.isArray(draft.tableColumns) ? draft.tableColumns : fields.map((field) => field.key)}
          onChange={(tableColumns) => patch({ tableColumns })}
        />
      )}

      {mode === "kpi" && (
        <section className="space-y-2 rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">Metric</p>
          <MetricOnly
            aggregation={aggregation}
            metricKey={String(draft.yAxis || "")}
            numericFields={numericFields}
            disabled={useReportChart}
            onMetric={setMetricChoice}
            onAggregation={setAggregation}
            metricIsNumeric={metricIsNumeric}
          />
          <NumberFormat value={draft} onChange={patch} />
        </section>
      )}

      {mode === "gauge" && (
        <section className="space-y-2 rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">Gauge</p>
          <MetricOnly
            aggregation={aggregation}
            metricKey={String(draft.yAxis || "")}
            numericFields={numericFields}
            disabled={useReportChart}
            onMetric={setMetricChoice}
            onAggregation={setAggregation}
            metricIsNumeric={metricIsNumeric}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <TextField label="Gauge minimum" value={draft.gaugeMin ?? ""} onChange={(value) => patch({ gaugeMin: value })} />
            <TextField label="Gauge maximum" value={draft.gaugeMax ?? ""} onChange={(value) => patch({ gaugeMax: value })} />
            <TextField label="Gauge target" value={draft.gaugeTarget ?? ""} onChange={(value) => patch({ gaugeTarget: value })} />
          </div>
          <NumberFormat value={draft} onChange={patch} />
        </section>
      )}

      {mode === "category-value" && (
        <section className="space-y-2 rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">
            {chartType === "funnel" ? "Funnel" : "Values"}
          </p>
          <FieldSelect
            label={chartType === "funnel" ? "Stage field" : "Category field"}
            value={String(draft.xAxis || "")}
            options={categoryFields}
            disabled={useReportChart}
            allowBlank
            onChange={setCategory}
          />
          <MetricOnly
            aggregation={aggregation}
            metricKey={String(draft.yAxis || "")}
            numericFields={numericFields}
            disabled={useReportChart}
            onMetric={setMetricChoice}
            onAggregation={setAggregation}
            metricIsNumeric={metricIsNumeric}
          />
          <NumberFormat value={draft} onChange={patch} />
        </section>
      )}

      {cartesianAxes(chartType) && mode !== "scatter" && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-slate-700">Chart Axes</p>
          <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-700">X-axis</legend>
            <Check
              label="Enable X-axis"
              checked={draft.xAxisEnabled !== false}
              onChange={(value) => patch({ xAxisEnabled: value })}
            />
            {categoryOnY ? metricControls("X-axis") : categoryControls("X-axis")}
          </fieldset>
          <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-700">Y-axis</legend>
            <Check
              label="Enable Y-axis"
              checked={draft.yAxisEnabled !== false}
              onChange={(value) => patch({ yAxisEnabled: value })}
            />
            {categoryOnY ? categoryControls("Y-axis") : metricControls("Y-axis")}
          </fieldset>
        </section>
      )}

      {mode === "scatter" && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-slate-700">Chart Axes</p>
          <ScatterAxis
            axis="X-axis"
            enabled={draft.xAxisEnabled !== false}
            onEnabled={(value) => patch({ xAxisEnabled: value })}
            field={String(draft.xAxis || "")}
            fields={numericFields}
            disabled={useReportChart}
            onField={(field) => patch({ xAxis: field?.key || "", xFieldType: field?.type })}
            title={String(draft.xAxisTitle || "")}
            onTitle={(value) => patch({ xAxisTitle: value })}
            showLabels={draft.showXLabels !== false}
            onShowLabels={(value) => patch({ showXLabels: value })}
            min={draft.xMin ?? ""}
            max={draft.xMax ?? ""}
            tick={draft.xTickInterval ?? ""}
            onMin={(value) => patch({ xMin: value })}
            onMax={(value) => patch({ xMax: value })}
            onTick={(value) => patch({ xTickInterval: value })}
          />
          <ScatterAxis
            axis="Y-axis"
            enabled={draft.yAxisEnabled !== false}
            onEnabled={(value) => patch({ yAxisEnabled: value })}
            field={String(draft.yAxis || "")}
            fields={numericFields}
            disabled={useReportChart}
            onField={(field) => patch({ yAxis: field?.key || "", yFieldType: field?.type })}
            title={String(draft.yAxisTitle || "")}
            onTitle={(value) => patch({ yAxisTitle: value })}
            showLabels={draft.showYLabels !== false}
            onShowLabels={(value) => patch({ showYLabels: value })}
            min={draft.yMin ?? ""}
            max={draft.yMax ?? ""}
            tick={draft.yTickInterval ?? ""}
            onMin={(value) => patch({ yMin: value })}
            onMax={(value) => patch({ yMax: value })}
            onTick={(value) => patch({ yTickInterval: value })}
          />
          <NumberFormat value={draft} onChange={patch} />
        </section>
      )}

      {mode !== "table" && mode !== "kpi" && (
        <div className="space-y-2">
          <Check
            label="Show Values"
            checked={Boolean(draft.showValues)}
            onChange={(value) => patch({ showValues: value })}
          />
          {(chartType === "pie" || chartType === "donut") && (
            <>
              <Check
                label="Show Percentages"
                checked={Boolean(draft.showPercentages)}
                onChange={(value) => patch({ showPercentages: value })}
              />
              <Check
                label='Combine Small Groups into "Others"'
                checked={Boolean(draft.combineOthers)}
                onChange={(value) => patch({ combineOthers: value })}
              />
              <Check
                label="Show Total"
                checked={draft.showTotal !== false}
                onChange={(value) => patch({ showTotal: value })}
              />
            </>
          )}
          {(chartType === "bar" || chartType === "column") && (
            <>
              <Check
                label="Show reference line"
                checked={Boolean(draft.showReferenceLine)}
                onChange={(value) => patch({ showReferenceLine: value })}
              />
              {draft.showReferenceLine && (
                <input
                  type="number"
                  aria-label="Reference value"
                  className={fieldClass}
                  placeholder="Reference value"
                  value={draft.referenceValue ?? ""}
                  onChange={(event) => patch({ referenceValue: event.target.value })}
                />
              )}
            </>
          )}
          <label className="block text-xs font-semibold text-slate-700">
            Decimal Places
            <select
              className={fieldClass}
              value={draft.decimals ?? "auto"}
              onChange={(event) => patch({ decimals: event.target.value })}
            >
              <option value="auto">Automatic</option>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
        </div>
      )}

      <Check
        label="Show report link"
        checked={Boolean(draft.showReportLink)}
        onChange={(value) => patch({ showReportLink: value })}
      />
    </div>
  );
}

function NumberFormat({
  value,
  onChange,
}: {
  value: WidgetDraft;
  onChange: (patch: WidgetDraft) => void;
}) {
  const current = value.numberFormat || (value.displayUnits === "full" ? "full" : "short");
  return (
    <label className="block text-xs font-semibold text-slate-700">
      Number format
      <select
        aria-label="Number format"
        className={fieldClass}
        value={current}
        onChange={(event) => {
          const numberFormat = event.target.value;
          onChange({
            numberFormat,
            displayUnits: numberFormat === "full" ? "full" : "short",
          });
        }}
      >
        <option value="short">Shortened Number</option>
        <option value="full">Full Number</option>
        <option value="currency">Currency</option>
        <option value="percent">Percent</option>
      </select>
    </label>
  );
}

function MetricOnly({
  aggregation,
  metricKey,
  numericFields,
  disabled,
  onMetric,
  onAggregation,
  metricIsNumeric,
}: {
  aggregation: string;
  metricKey: string;
  numericFields: AxisField[];
  disabled?: boolean;
  onMetric: (value: string) => void;
  onAggregation: (value: string) => void;
  metricIsNumeric: boolean;
}) {
  const choices = aggregationChoices(numericFields.find((field) => field.key === metricKey) || numericFields[0]);
  return (
    <>
      <label className="block text-xs font-semibold text-slate-700">
        Metric
        <select
          aria-label="Metric"
          className={fieldClass}
          disabled={disabled}
          value={metricIsNumeric ? metricKey : "count"}
          onChange={(event) => onMetric(event.target.value)}
        >
          <option value="count">Record Count</option>
          {numericFields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
      </label>
      {metricIsNumeric && (
        <label className="block text-xs font-semibold text-slate-700">
          Aggregation
          <select
            aria-label="Aggregation"
            className={fieldClass}
            disabled={disabled}
            value={aggregation}
            onChange={(event) => onAggregation(event.target.value)}
          >
            {choices
              .filter((choice) => choice.value !== "count")
              .map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
          </select>
        </label>
      )}
    </>
  );
}

function ColumnPicker({
  fields,
  selected,
  onChange,
}: {
  fields: AxisField[];
  selected: string[];
  onChange: (columns: string[]) => void;
}) {
  if (!fields.length) {
    return <p className="text-xs text-slate-500">No columns are available for this report.</p>;
  }
  return (
    <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-700">Columns</legend>
      {fields.map((field) => {
        const checked = selected.includes(field.key);
        return (
          <label key={field.key} className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              aria-label={`Column ${field.label}`}
              className="h-4 w-4 accent-blue-600"
              checked={checked}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, field.key]
                  : selected.filter((key) => key !== field.key);
                onChange(next);
              }}
            />
            {field.label}
          </label>
        );
      })}
    </fieldset>
  );
}

function ScatterAxis({
  axis,
  enabled,
  onEnabled,
  field,
  fields,
  disabled,
  onField,
  title,
  onTitle,
  showLabels,
  onShowLabels,
  min,
  max,
  tick,
  onMin,
  onMax,
  onTick,
}: {
  axis: "X-axis" | "Y-axis";
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  field: string;
  fields: AxisField[];
  disabled?: boolean;
  onField: (field: AxisField | undefined) => void;
  title: string;
  onTitle: (value: string) => void;
  showLabels: boolean;
  onShowLabels: (value: boolean) => void;
  min: string | number;
  max: string | number;
  tick: string | number;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
  onTick: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-700">{axis}</legend>
      <Check label={`Enable ${axis}`} checked={enabled} onChange={onEnabled} />
      <FieldSelect
        label={`${axis} field`}
        value={field}
        options={fields}
        disabled={disabled}
        allowBlank
        onChange={onField}
      />
      {!fields.length && (
        <p className="text-xs text-slate-500">This report has no numeric fields.</p>
      )}
      <TextField label={`${axis} title`} value={title} onChange={onTitle} />
      <Check label={`Show ${axis} labels`} checked={showLabels} onChange={onShowLabels} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <TextField label={`${axis} minimum`} value={min} onChange={onMin} />
        <TextField label={`${axis} maximum`} value={max} onChange={onMax} />
        <TextField label={`${axis} tick interval`} value={tick} onChange={onTick} />
      </div>
    </fieldset>
  );
}
