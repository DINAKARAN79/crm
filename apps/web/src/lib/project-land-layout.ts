import {
  samplePlotStatusColors,
  type SampleLandPlot,
  type SamplePlotStatus,
} from "@/lib/mock-land-layout";
import { createMasterPlanPlotSlots } from "@/lib/land-layout-geometry";

export interface ProjectLayoutUnit {
  id: string;
  unitNumber: string;
  type: string;
  area: number;
  price: number;
  status: string;
}

export const projectUnitStatusColors: Record<SamplePlotStatus, string> = samplePlotStatusColors;

export const projectUnitStatuses: SamplePlotStatus[] = [
  "Available",
  "Blocked",
  "Booked",
  "Reserved",
  "Sold",
  "Hold",
];

function canonicalStatus(status: string): SamplePlotStatus | null {
  switch (status.trim().replace(/[_-]+/g, " ").toUpperCase()) {
    case "AVAILABLE": return "Available";
    case "BLOCKED": return "Blocked";
    case "BOOKED": return "Booked";
    case "RESERVED": return "Reserved";
    case "SOLD": return "Sold";
    case "HOLD":
    case "ON HOLD": return "Hold";
    case "INVESTOR": return "Investor";
    case "REGISTERED": return "Registered";
    case "NOT RELEASED": return "Not Released";
    default: return null;
  }
}

export function projectUnitStatusColor(status: string): string {
  const canonical = canonicalStatus(status);
  return projectUnitStatusColors[canonical || "Not Released"];
}

export function projectUnitStatusAppearance(status: string, selected = false) {
  return {
    fillColor: projectUnitStatusColor(status),
    outlineColor: selected ? "#1d4ed8" : "#334155",
    outlineWidth: selected ? 4 : 1.5,
  };
}

export function projectUnitStatusLabel(status: string): string {
  const canonical = canonicalStatus(status);
  if (canonical === "Hold") return "On Hold";
  if (canonical) return canonical;
  return status.trim().replace(/[_-]+/g, " ") || "Not Released";
}

function displayUnitStatus(status: string): SamplePlotStatus {
  switch (canonicalStatus(status)) {
    case "Available": return "Available";
    case "Blocked": return "Blocked";
    case "Booked": return "Booked";
    case "Reserved": return "Reserved";
    case "Sold": return "Sold";
    case "Hold": return "Hold";
    case "Investor": return "Investor";
    case "Registered": return "Registered";
    case "Not Released": return "Not Released";
    default: return "Not Released";
  }
}

export function createIllustrativeProjectPlots(
  projectId: string,
  units: ProjectLayoutUnit[],
): SampleLandPlot[] {
  const slots = createMasterPlanPlotSlots(units.length);

  return units.map((unit, index) => {
    const slot = slots[index];
    return {
      id: unit.id,
      plotNumber: unit.unitNumber,
      projectId,
      ...slot,
      area: unit.area,
      unitType: unit.type,
      price: unit.price,
      facing: "Not configured",
      status: displayUnitStatus(unit.status),
    };
  });
}
