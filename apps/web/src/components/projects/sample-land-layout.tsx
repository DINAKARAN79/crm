"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Compass, Layers3, LocateFixed, MapPinned, Minus, Plus, RotateCcw } from "lucide-react";
import { CommonFilterPanel, FilterSearch, FilterSelect } from "@/components/crm/common-filter-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  masterPlanGeometry,
  masterPlanInternalRoads,
} from "@/lib/land-layout-geometry";
import {
  sampleLandPlots,
  sampleLandProject,
  samplePlotStatuses,
  samplePlotStatusColors,
  type SampleLandPlot,
  type SamplePlotStatus,
} from "@/lib/mock-land-layout";
import { projectUnitStatuses } from "@/lib/project-land-layout";

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlotTooltip {
  plot: SampleLandPlot;
  x: number;
  y: number;
}

const INITIAL_VIEW: ViewBox = {
  x: 0,
  y: 0,
  width: masterPlanGeometry.width,
  height: masterPlanGeometry.height,
};
const MIN_VIEW_WIDTH = 480;
const MAX_VIEW_WIDTH = INITIAL_VIEW.width;

interface LandLayoutProject {
  id: string;
  name: string;
  location: string;
  totalUnits?: number;
  tagline?: string;
}

interface SampleLandLayoutProps {
  project?: LandLayoutProject;
  plots?: SampleLandPlot[];
  statusColors?: Record<SamplePlotStatus, string>;
  statusOptions?: SamplePlotStatus[];
  demo?: boolean;
  pickerMode?: boolean;
  selectedPlotId?: string;
  onSelectionChange?: (plot: SampleLandPlot | null) => void;
}

function getPlotArea(plot: SampleLandPlot): number {
  return plot.area;
}

function getMapPlotNumber(plotNumber: string): string {
  return plotNumber.replace(/^DCTValley-/, "");
}

export function SampleLandLayout({
  project = sampleLandProject,
  plots = sampleLandPlots,
  statusColors = samplePlotStatusColors,
  statusOptions = samplePlotStatuses,
  demo = true,
  pickerMode = false,
  selectedPlotId,
  onSelectionChange,
}: SampleLandLayoutProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number; clientX: number; clientY: number; view: ViewBox } | null>(null);
  const [viewBox, setViewBox] = React.useState<ViewBox>(INITIAL_VIEW);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"All" | SamplePlotStatus>("All");
  const [blockFilter, setBlockFilter] = React.useState("All");
  const [activePlot, setActivePlot] = React.useState<SampleLandPlot | null>(plots[0] || null);
  const [selectedPlotIds, setSelectedPlotIds] = React.useState<string[]>([]);
  const [tooltip, setTooltip] = React.useState<PlotTooltip | null>(null);
  const [isPanning, setIsPanning] = React.useState(false);

  const visiblePlots = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return plots.map((plot) => ({
      plot,
      matches: (!normalizedSearch || plot.plotNumber.toLowerCase().includes(normalizedSearch))
        && (statusFilter === "All" || plot.status === statusFilter)
        && (blockFilter === "All" || plot.block === blockFilter),
    }));
  }, [search, statusFilter, blockFilter, plots]);

  const updateZoom = (factor: number, anchor?: { x: number; y: number }) => {
    setViewBox((current) => {
      const width = Math.min(MAX_VIEW_WIDTH, Math.max(MIN_VIEW_WIDTH, current.width * factor));
      const height = width * INITIAL_VIEW.height / INITIAL_VIEW.width;
      const anchorX = anchor?.x ?? current.x + current.width / 2;
      const anchorY = anchor?.y ?? current.y + current.height / 2;
      const ratioX = (anchorX - current.x) / current.width;
      const ratioY = (anchorY - current.y) / current.height;
      return {
        x: anchorX - ratioX * width,
        y: anchorY - ratioY * height,
        width,
        height,
      };
    });
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: viewBox.x + ((event.clientX - bounds.left) / bounds.width) * viewBox.width,
      y: viewBox.y + ((event.clientY - bounds.top) / bounds.height) * viewBox.height,
    };
    updateZoom(event.deltaY < 0 ? 0.88 : 1.14, anchor);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest("[data-plot='true']")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view: viewBox,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleX = drag.view.width / bounds.width;
    const scaleY = drag.view.height / bounds.height;
    setViewBox({
      ...drag.view,
      x: drag.view.x - (event.clientX - drag.clientX) * scaleX,
      y: drag.view.y - (event.clientY - drag.clientY) * scaleY,
    });
  };

  const finishPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
  };

  const showTooltip = (plot: SampleLandPlot, event: React.MouseEvent<SVGGElement>) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setTooltip({ plot, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  };

  const togglePlotSelection = (plot: SampleLandPlot) => {
    setActivePlot(plot);
    if (plot.status !== "Available") return;
    if (pickerMode) {
      onSelectionChange?.(selectedPlotId === plot.id ? null : plot);
      return;
    }
    setSelectedPlotIds((current) => current.includes(plot.id)
      ? current.filter((id) => id !== plot.id)
      : [...current, plot.id]);
  };

  const handlePlotKeyDown = (event: React.KeyboardEvent<SVGGElement>, plot: SampleLandPlot) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    togglePlotSelection(plot);
  };

  const clearSelection = () => setSelectedPlotIds([]);
  const activePlotSelected = Boolean(activePlot && (pickerMode
    ? selectedPlotId === activePlot.id
    : selectedPlotIds.includes(activePlot.id)));
  const legendStatuses = demo ? statusOptions : projectUnitStatuses;
  const blockNames = Array.from(new Set(plots.map((plot) => plot.block)));

  return (
    <div className="space-y-4">
      <Card>
        {!pickerMode && <CardHeader className="gap-4 border-b bg-slate-50/80 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPinned className="h-5 w-5 text-sky-700" />
              {demo ? "Interactive sample land layout" : `${project.name} · Interactive land layout`}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {demo
                ? "A fictional demonstration map. It does not use or change live project inventory."
                : "Live unit numbers, areas and statuses are shown in an illustrative arrangement. Plot positions, roads, sections and facing are not surveyed project data."}
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-amber-300 bg-amber-50 text-amber-900">
            {demo ? "Prototype · Dummy data" : "Illustrative map · Live inventory"}
          </Badge>
        </CardHeader>}
        <CardContent className={pickerMode ? "space-y-2 p-2" : "space-y-4 p-4"}>
          {!pickerMode && <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <CommonFilterPanel
              className="min-w-0 flex-1"
              onReset={() => {
                setSearch("");
                setStatusFilter("All");
                setBlockFilter("All");
              }}
            >
              <FilterSearch
                id="land-layout-search"
                label="Plot number"
                value={search}
                onChange={setSearch}
                placeholder="Search plot number..."
              />
              <FilterSelect
                id="land-layout-status"
                label="Status"
                icon={Layers3}
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as "All" | SamplePlotStatus)}
                options={[
                  { label: "All statuses", value: "All" },
                  ...statusOptions.map((status) => ({ label: status, value: status })),
                ]}
              />
              <FilterSelect
                id="land-layout-block"
                label="Block"
                value={blockFilter}
                onChange={setBlockFilter}
                options={[
                  { label: "All blocks", value: "All" },
                  ...blockNames.map((block) => ({ label: block, value: block })),
                ]}
              />
            </CommonFilterPanel>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" variant="outline" size="icon" title="Zoom in" aria-label="Zoom in" onClick={() => updateZoom(0.8)}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" title="Zoom out" aria-label="Zoom out" onClick={() => updateZoom(1.25)}>
                <Minus className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm"               onClick={() => {
                setViewBox(INITIAL_VIEW);
                canvasRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
              }}>
                <LocateFixed className="mr-2 h-4 w-4" />Fit to screen
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Reset map view"
                aria-label="Reset map view"
                onClick={() => {
                  setViewBox(INITIAL_VIEW);
                  canvasRef.current?.scrollTo({ top: 0, left: 0 });
                  setSearch("");
                  setStatusFilter("All");
                  setBlockFilter("All");
                  clearSelection();
                  setActivePlot(null);
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>}
          {pickerMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
              <span>Click an available unit on the map to select it. Other statuses are unavailable.</span>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="icon" title="Zoom in" aria-label="Zoom in" onClick={() => updateZoom(0.8)}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" title="Zoom out" aria-label="Zoom out" onClick={() => updateZoom(1.25)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewBox(INITIAL_VIEW);
                    canvasRef.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
                  }}
                >
                  <LocateFixed className="mr-2 h-4 w-4" />Fit
                </Button>
              </div>
            </div>
          )}

          <div className={pickerMode ? "grid gap-2" : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]"}>
            <div
              ref={canvasRef}
              className={`relative min-w-0 overflow-hidden rounded-none border border-black bg-white ${pickerMode ? "mx-auto w-fit max-w-full" : "max-h-[72vh] overflow-auto"}`}
            >
              <svg
                ref={svgRef}
                role="group"
                aria-label={`Interactive land layout map for ${project.name}, ${plots.length} plots`}
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                style={pickerMode
                  ? { height: "52vh", width: "auto", maxHeight: "400px", maxWidth: "100%" }
                  : { aspectRatio: `${INITIAL_VIEW.width} / ${INITIAL_VIEW.height}` }}
                className={`${pickerMode ? "block" : "block w-full"} select-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPan}
                onPointerCancel={finishPan}
                onPointerLeave={() => setTooltip(null)}
              >
                <defs>
                  <filter id="plot-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#334155" floodOpacity="0.18" />
                  </filter>
                </defs>
                <rect width={masterPlanGeometry.width} height={masterPlanGeometry.height} fill="#fff" />
                <rect
                  x="16"
                  y="16"
                  width={masterPlanGeometry.width - 32}
                  height={masterPlanGeometry.height - 32}
                  fill="none"
                  stroke="#171717"
                  strokeWidth="2"
                />
                <svg
                  x="80"
                  y="50"
                  width={masterPlanGeometry.planWidth}
                  height={masterPlanGeometry.planHeight}
                  viewBox={`0 0 ${masterPlanGeometry.planWidth} ${masterPlanGeometry.planHeight}`}
                >
                <rect width={masterPlanGeometry.planWidth} height={masterPlanGeometry.planHeight} fill="#fff" />
                <path d={masterPlanGeometry.siteBoundary} fill="#fff" stroke="#252525" strokeWidth="2" />
                <path d={masterPlanGeometry.siteBoundary} fill="none" stroke="#a7a7a7" strokeWidth="0.8" strokeDasharray="3 5" />

                <g aria-label="Internal road network">
                  <g aria-label="Main roads">
                  {masterPlanGeometry.roads.map((road) => (
                    <g key={road.id}>
                      <path d={road.path} fill="none" stroke="#353535" strokeWidth={road.width + 2} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={road.path} fill="none" stroke="#d5d5d5" strokeWidth={road.width} strokeLinecap="round" strokeLinejoin="round" />
                      {road.width >= 30 && (
                        <path d={road.path} fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="12 12" />
                      )}
                      {road.label && (
                        <text
                          x={road.x}
                          y={road.y}
                          textAnchor="middle"
                          transform={road.rotation ? `rotate(${road.rotation} ${road.x} ${road.y})` : undefined}
                          className="map-road-label"
                        >
                          {road.label}
                        </text>
                      )}
                    </g>
                  ))}
                  </g>
                  <g aria-label="Block access roads">
                  {masterPlanInternalRoads.map((road) => (
                    <g key={road.id}>
                      <path d={road.path} fill="none" stroke="#353535" strokeWidth="10" />
                      <path d={road.path} fill="none" stroke="#d5d5d5" strokeWidth="8" />
                      <path d={road.path} fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="5 5" />
                    </g>
                  ))}
                  </g>
                </g>

                <g aria-label="Parks and open spaces">
                  {masterPlanGeometry.parks.map((park) => (
                    <g key={park.id}>
                      <rect x={park.x} y={park.y} width={park.width} height={park.height} rx="3" fill="#e6f1df" stroke="#5c6c55" strokeWidth="1.5" />
                      <text x={park.x + park.width / 2} y={park.y + park.height / 2} textAnchor="middle" className="map-park-title">{park.label}</text>
                    </g>
                  ))}
                </g>

                <g aria-label="Project title">
                  <rect x="86" y="58" width="50" height="50" rx="11" fill="#1d5b4b" />
                  <path d="M98 96 L111 68 L124 96 Z" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinejoin="round" />
                  <path d="M104 96 V84 H118 V96" fill="none" stroke="#fff" strokeWidth="2.8" />
                  <text x="151" y="79" className="map-project-title">{project.name}</text>
                  <text x="152" y="101" className="map-project-subtitle">{project.location} · {project.tagline || (demo ? "ILLUSTRATIVE MASTER PLAN" : "ILLUSTRATIVE UNIT PLAN")}</text>
                  {!demo && <text x="152" y="119" className="map-project-note">LIVE UNIT STATUS · POSITIONS ARE ILLUSTRATIVE</text>}
                </g>

                <g aria-hidden="true">
                  {masterPlanGeometry.blocks.map((block) => (
                    <g key={block.id}>
                      <path d={block.outline} fill="#f2f0e5" fillOpacity="0.75" stroke="#899377" strokeWidth="2" />
                      <text x={block.x} y={block.y - 12} className="map-block-label">
                        {block.label} · {block.phase}
                      </text>
                    </g>
                  ))}
                  {masterPlanGeometry.entries.map((entry) => (
                    <g key={entry.label}>
                      <circle cx={entry.x} cy={entry.y} r="6" fill="#fff" stroke="#496657" strokeWidth="2" />
                      <text x={entry.x + 14} y={entry.y + 4} className="map-entry-label">{entry.label}</text>
                    </g>
                  ))}
                  <path d="M462 474 H694 M776 474 H972 M462 573 H694 M776 573 H972" stroke="#91aa76" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 8" />
                </g>

                {visiblePlots.map(({ plot, matches }) => {
                  const selected = pickerMode ? selectedPlotId === plot.id : selectedPlotIds.includes(plot.id);
                  const active = activePlot?.id === plot.id;
                  const fill = statusColors[plot.status];
                  const centerX = plot.x + plot.width / 2;
                  const centerY = plot.y + plot.height / 2;
                  return (
                    <g
                      key={plot.id}
                      data-plot="true"
                      role="button"
                      tabIndex={matches ? 0 : -1}
                      aria-label={`${plot.plotNumber}, ${plot.block}, ${getPlotArea(plot)} square feet, ${plot.status}. ${plot.status === "Available" ? "Available to select." : "Not eligible for selection."}`}
                      aria-pressed={selected}
                      aria-hidden={!matches}
                      opacity={matches ? 1 : 0.12}
                      pointerEvents={matches ? "auto" : "none"}
                      style={{ outline: "none" }}
                      className="cursor-pointer"
                      onMouseDown={(event) => {
                        if (pickerMode) event.preventDefault();
                      }}
                      onMouseEnter={(event) => showTooltip(plot, event)}
                      onMouseMove={(event) => showTooltip(plot, event)}
                      onMouseLeave={() => setTooltip(null)}
                      onFocus={(event) => {
                        const bounds = canvasRef.current?.getBoundingClientRect();
                        if (!bounds) return;
                        const plotBounds = event.currentTarget.getBoundingClientRect();
                        setTooltip({
                          plot,
                          x: plotBounds.left + plotBounds.width / 2 - bounds.left,
                          y: plotBounds.top - bounds.top,
                        });
                      }}
                      onClick={() => togglePlotSelection(plot)}
                      onKeyDown={(event) => handlePlotKeyDown(event, plot)}
                    >
                      <g transform={`rotate(${plot.rotation} ${centerX} ${centerY})`}>
                        <rect
                          x={plot.x}
                          y={plot.y}
                          width={plot.width}
                          height={plot.height}
                          rx="2"
                          fill={fill}
                          fillOpacity={selected ? 1 : 0.9}
                          stroke={selected ? "#075985" : active ? "#0f172a" : "#354338"}
                          strokeWidth={selected ? 4 : active ? 2.6 : 1.15}
                          filter="url(#plot-shadow)"
                        />
                        {selected && (
                          <g aria-hidden="true">
                            <circle cx={plot.x + plot.width - 9} cy={plot.y + 9} r="8" fill="#075985" />
                            <path d={`M${plot.x + plot.width - 12} ${plot.y + 9} l2 2 4 -5`} fill="none" stroke="#fff" strokeWidth="1.8" />
                          </g>
                        )}
                      </g>
                      <text
                        x={centerX}
                        y={centerY + (viewBox.width < 900 ? -2 : 3)}
                        textAnchor="middle"
                        className="map-plot-number"
                        textLength={Math.min(plot.width - 5, getMapPlotNumber(plot.plotNumber).length * 5.6)}
                        lengthAdjust="spacingAndGlyphs"
                        pointerEvents="none"
                      >
                        {getMapPlotNumber(plot.plotNumber)}
                      </text>
                      {viewBox.width < 900 && (
                        <text
                          x={centerX}
                          y={centerY + 8}
                          textAnchor="middle"
                          className="map-plot-area"
                          pointerEvents="none"
                        >
                          {getPlotArea(plot).toLocaleString()} sq.ft
                        </text>
                      )}
                    </g>
                  );
                })}

                <g aria-label="Compass" transform={`translate(${masterPlanGeometry.compass.x} ${masterPlanGeometry.compass.y})`}>
                  <circle cx="0" cy="0" r="43" fill="#fff" fillOpacity="0.93" stroke="#94a3b8" strokeWidth="1.5" />
                  <path d="M0 -30 L-8 -2 L0 -7 L8 -2 Z" fill="#0f4c81" />
                  <path d="M0 30 L-8 2 L0 7 L8 2 Z" fill="#cbd5e1" stroke="#64748b" strokeWidth="0.8" />
                  <text x="0" y="-33" textAnchor="middle" className="map-compass-label">N</text>
                  <text x="0" y="43" textAnchor="middle" className="map-compass-label">S</text>
                  <text x="34" y="4" textAnchor="middle" className="map-compass-label">E</text>
                  <text x="-34" y="4" textAnchor="middle" className="map-compass-label">W</text>
                </g>

                <g aria-label="Plot status legend">
                  <rect
                    x={masterPlanGeometry.legend.x}
                    y={masterPlanGeometry.legend.y}
                    width={masterPlanGeometry.legend.width}
                    height={masterPlanGeometry.legend.height}
                    rx="8"
                    fill="#fff"
                    fillOpacity="0.97"
                    stroke="#cbd5e1"
                  />
                  <text x={masterPlanGeometry.legend.x + 18} y={masterPlanGeometry.legend.y + 22} className="map-legend-heading">PLOT STATUS</text>
                  {legendStatuses.map((status, index) => {
                    const x = masterPlanGeometry.legend.x + 20 + index * 190;
                    return (
                      <g key={status} transform={`translate(${x} ${masterPlanGeometry.legend.y + 37})`}>
                        <rect width="16" height="16" rx="2" fill={statusColors[status]} stroke="#475569" strokeWidth="0.8" />
                        <text x="23" y="12" className="map-legend-label">{status}</text>
                      </g>
                    );
                  })}
                </g>
                </svg>
              </svg>
              {tooltip && !pickerMode && (
                <div
                  role="status"
                  className="pointer-events-none absolute z-10 max-w-56 rounded-md border bg-white/95 px-3 py-2 text-xs shadow-lg"
                  style={{ left: Math.min(tooltip.x + 12, (canvasRef.current?.clientWidth || 300) - 220), top: Math.max(tooltip.y - 10, 8) }}
                >
                  <p className="font-semibold">{tooltip.plot.plotNumber} · {tooltip.plot.status}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {tooltip.plot.block} · {getPlotArea(tooltip.plot).toLocaleString()} sq.ft
                  </p>
                  <p className="text-muted-foreground">{tooltip.plot.phase}</p>
                  {tooltip.plot.status === "Available" && <p className="mt-1 font-medium text-emerald-700">Click to select</p>}
                </div>
              )}
            </div>

            {!pickerMode && <Card className="h-fit xl:sticky xl:top-4">
              <CardHeader className="border-b bg-slate-50/80 py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Compass className="h-4 w-4 text-sky-700" />
                  Plot details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {activePlot ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">{demo ? "Plot number" : "Unit number"}</p>
                        <p className="text-xl font-semibold">{activePlot.plotNumber}</p>
                      </div>
                      <Badge
                        className="border-0 text-slate-900"
                        style={{ backgroundColor: statusColors[activePlot.status] }}
                      >
                        {activePlot.status}
                      </Badge>
                    </div>
                    <div className="space-y-3 rounded-md border p-3 text-sm">
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Area</span><span className="font-medium">{getPlotArea(activePlot).toLocaleString()} sq.ft</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Block</span><span className="font-medium">{activePlot.block}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Facing</span><span className="font-medium">{activePlot.facing}</span></div>
                      {!demo && activePlot.unitType && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Unit type</span><span className="font-medium">{activePlot.unitType}</span></div>}
                      {!demo && activePlot.price != null && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Listed price</span><span className="font-medium">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(activePlot.price)}</span></div>}
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Phase</span><span className="text-right font-medium">{activePlot.phase}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Project</span><span className="text-right font-medium">{project.name}</span></div>
                    </div>
                    {activePlot.status === "Available" ? (
                      <Button
                        type="button"
                        className="w-full"
                        variant={activePlotSelected ? "outline" : "default"}
                        onClick={() => togglePlotSelection(activePlot)}
                      >
                        {activePlotSelected ? <><Check className="mr-2 h-4 w-4" />Selected · Remove</> : `Select this ${demo ? "plot" : "unit"}`}
                      </Button>
                    ) : (
                      <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                        {demo
                          ? "This sample plot is not eligible for selection. Only available plots can be selected."
                          : "This unit is not available to select. Only available units are selectable in this preview."}
                      </p>
                    )}
                    {!demo && (
                      <Button type="button" className="w-full" variant="outline" asChild>
                        <Link href={`/units/${activePlot.id}`}>Edit unit</Link>
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Click a plot to view its details.</p>
                )}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{demo ? "Selected plots" : "Selected units"}</p>
                    {selectedPlotIds.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
                    )}
                  </div>
                  <p className="mt-1 text-2xl font-semibold">{selectedPlotIds.length}</p>
                  {selectedPlotIds.length > 0 && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {plots.filter((plot) => selectedPlotIds.includes(plot.id)).map((plot) => plot.plotNumber).join(", ")}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>}
          </div>

          {pickerMode && (
            <p className="px-1 text-sm" aria-live="polite">
              {selectedPlotId
                ? `Selected unit: ${plots.find((plot) => plot.id === selectedPlotId)?.plotNumber || "Unit"}`
                : "No unit selected"}
            </p>
          )}
          {!pickerMode && <div className="space-y-1 text-xs text-muted-foreground">
            <p>{visiblePlots.filter(({ matches }) => matches).length} of {plots.length} {demo ? "plots" : "units"} match the current filters.</p>
            {!demo && project.totalUnits != null && project.totalUnits > plots.length && (
              <p className="text-amber-800">
                Showing {plots.length} registered unit records. The project summary lists {project.totalUnits} units;
                {` ${project.totalUnits - plots.length} units do not have inventory records to display.`}
              </p>
            )}
            <p>
              {demo
                ? "Drag the map to pan · Scroll to zoom · Only available plots can be selected"
                : "Drag to pan · Scroll to zoom · Selection is a preview only and does not reserve units"}
            </p>
          </div>}
        </CardContent>
      </Card>
      <style jsx>{`
        .map-project-title { fill: #16324f; font: 700 23px system-ui, sans-serif; }
        .map-project-subtitle { fill: #64748b; font: 600 11px system-ui, sans-serif; letter-spacing: 1.1px; }
        .map-project-note { fill: #9a6b18; font: 700 8px system-ui, sans-serif; letter-spacing: 1px; }
        .map-block-label { fill: #3e5740; font: 700 11px system-ui, sans-serif; letter-spacing: 1.1px; }
        .map-entry-label { fill: #486255; font: 700 8px system-ui, sans-serif; letter-spacing: 0.8px; }
        .map-road-label { fill: #5d5a53; font: 700 10px system-ui, sans-serif; letter-spacing: 1.2px; paint-order: stroke; stroke: #e4e1d9; stroke-width: 4px; stroke-linejoin: round; }
        .map-plot-number { fill: #172033; font: 700 9px system-ui, sans-serif; }
        .map-plot-area { fill: #334155; font: 600 5px system-ui, sans-serif; }
        .map-park-title { fill: #386341; font: 700 8px system-ui, sans-serif; letter-spacing: 0.7px; }
        .map-compass-label { fill: #334155; font: 700 11px system-ui, sans-serif; }
        .map-legend-heading { fill: #334155; font: 700 10px system-ui, sans-serif; letter-spacing: 1.2px; }
        .map-legend-label { fill: #334155; font: 600 11px system-ui, sans-serif; }
      `}</style>
    </div>
  );
}
