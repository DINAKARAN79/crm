import React from "react";
import type { ReactNode } from "react";
import { projectUnitStatusColor, projectUnitStatusLabel } from "@/lib/project-land-layout";

export interface QuotationLayoutUnit {
  id: string;
  number: string;
  type?: string | null;
  area?: number | null;
  price?: number | null;
  status: string;
  block?: string | null;
  floor?: number | null;
}

export type QuotationLayoutShape =
  | {
      id: string;
      kind: "RECTANGLE";
      geometry: { x: number; y: number; width: number; height: number };
      unit: QuotationLayoutUnit;
    }
  | {
      id: string;
      kind: "POLYGON";
      geometry: { points: Array<{ x: number; y: number }> };
      unit: QuotationLayoutUnit;
    };

function unitLabel(number: string): string {
  if (number.length <= 8) return number;
  const lastPart = number.split(/[\s_-]+/).filter(Boolean).at(-1);
  if (lastPart && lastPart.length <= 8) return lastPart;
  return `${number.slice(0, 5)}…`;
}

function shapeMetrics(shape: QuotationLayoutShape) {
  if (shape.kind === "RECTANGLE") {
    const { x, y, width, height } = shape.geometry;
    return { x: x + width / 2, y: y + height / 2, width, height };
  }
  const xs = shape.geometry.points.map((point) => point.x);
  const ys = shape.geometry.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY };
}

interface QuotationLayoutDrawingProps {
  drawing: ReactNode;
  shapes: QuotationLayoutShape[];
  units: QuotationLayoutUnit[];
  selectedUnitId: string;
  onSelectUnit: (unit: QuotationLayoutUnit) => void;
}

export function QuotationLayoutDrawing({
  drawing,
  shapes,
  units,
  selectedUnitId,
  onSelectUnit,
}: QuotationLayoutDrawingProps) {
  return (
    <div className="relative isolate mx-auto w-fit max-w-full bg-white shadow-lg" style={{ backgroundColor: "#fff" }}>
      {drawing}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 z-10 block h-full w-full overflow-hidden"
        style={{ backgroundColor: "transparent" }}
        role="group"
        aria-label="Mapped units on project layout"
      >
        {shapes.map((shape) => {
          const unit = units.find((candidate) => candidate.id === shape.unit.id) || shape.unit;
          const isAvailable = unit.status.toUpperCase() === "AVAILABLE";
          const isSelected = unit.id === selectedUnitId;
          const statusColor = projectUnitStatusColor(unit.status);
          const statusLabel = projectUnitStatusLabel(unit.status);
          const geometry = shape.kind === "RECTANGLE"
            ? { x: shape.geometry.x, y: shape.geometry.y, width: shape.geometry.width, height: shape.geometry.height }
            : null;
          const points = shape.kind === "POLYGON"
            ? shape.geometry.points.map(({ x, y }) => `${x},${y}`).join(" ")
            : "";
          const metrics = shapeMetrics(shape);
          const compactLabel = unitLabel(unit.number);
          const labelFontSize = Math.max(0.009, Math.min(0.018, metrics.width / Math.max(4, compactLabel.length * 1.15), metrics.height * 0.24));
          const activateShape = () => {
            if (isAvailable) onSelectUnit(unit);
          };
          return (
            <g
              key={shape.id}
              role="button"
              tabIndex={isAvailable ? 0 : -1}
              aria-label={`Unit ${unit.number}, ${statusLabel}`}
              aria-pressed={isSelected}
              aria-disabled={!isAvailable}
              className={isAvailable ? "cursor-pointer" : "cursor-not-allowed"}
              style={{ pointerEvents: "auto" }}
              onMouseDown={(event) => {
                // Focusing this shape scrolls the quotation dialog onto the empty part of the plan.
                event.preventDefault();
              }}
              onClick={activateShape}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateShape();
                }
              }}
            >
              <title>{`${unit.number} · ${statusLabel}${unit.type ? ` · ${unit.type}` : ""}`}</title>
              {geometry ? (
                <>
                  <rect
                    x={geometry.x}
                    y={geometry.y}
                    width={geometry.width}
                    height={geometry.height}
                    fill={statusColor}
                    fillOpacity="1"
                    stroke="#334155"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {isSelected && (
                    <rect
                      x={geometry.x}
                      y={geometry.y}
                      width={geometry.width}
                      height={geometry.height}
                      fill="none"
                      stroke="#1d4ed8"
                      strokeWidth="4"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
                </>
              ) : (
                <>
                  <polygon
                    points={points}
                    fill={statusColor}
                    fillOpacity="1"
                    stroke="#334155"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {isSelected && (
                    <polygon
                      points={points}
                      fill="none"
                      stroke="#1d4ed8"
                      strokeWidth="4"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
                </>
              )}
              <text
                x={metrics.x}
                y={metrics.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={labelFontSize}
                fill="#0f172a"
                stroke="white"
                strokeWidth="0.0025"
                paintOrder="stroke"
                pointerEvents="none"
              >{compactLabel}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
