import { createMasterPlanPlotSlots } from "./land-layout-geometry";

export type SamplePlotStatus =
  | "Available"
  | "Blocked"
  | "Booked"
  | "Investor"
  | "Registered"
  | "Not Released"
  | "Hold"
  | "Reserved"
  | "Sold";

export interface SampleLandPlot {
  id: string;
  plotNumber: string;
  projectId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  area: number;
  unitType?: string;
  price?: number;
  facing: string;
  block: string;
  phase: string;
  status: SamplePlotStatus;
}

export const sampleLandProject = {
  id: "sample-project-aurora",
  name: "Aurora Grove Estates",
  location: "Willowbrook, Sample County",
  tagline: "A fictional plotted community",
};

const facings: SampleLandPlot["facing"][] = ["North", "East", "South", "West"];
const sampleSlots = createMasterPlanPlotSlots(100);
const sampleStatusOverrides: Record<number, SamplePlotStatus> = {
  4: "Booked",
  9: "Blocked",
  14: "Investor",
  19: "Registered",
  24: "Not Released",
};

export const sampleLandPlots: SampleLandPlot[] = sampleSlots.map((slot, index) => ({
  id: `aurora-${slot.block.slice(-1).toLowerCase()}-${String(index + 1).padStart(3, "0")}`,
  plotNumber: `AG-${slot.block.slice(-1)}${String(index + 1).padStart(3, "0")}`,
  projectId: sampleLandProject.id,
  ...slot,
  area: 1800 + ((index * 137) % 1250),
  unitType: index % 7 === 0 ? "Garden villa" : "Residential plot",
  facing: facings[index % facings.length],
  status: sampleStatusOverrides[index % 25] ?? "Available",
}));

export const samplePlotStatusColors: Record<SamplePlotStatus, string> = {
  Available: "#00EE00",
  Blocked: "#FFFF00",
  Booked: "#FF0000",
  Investor: "#FF7F27",
  Registered: "#9874ED",
  "Not Released": "#269CFF",
  Hold: "#FFFF00",
  Reserved: "#FF7F27",
  Sold: "#FF7F27",
};

export const samplePlotStatuses: SamplePlotStatus[] = [
  "Available",
  "Blocked",
  "Booked",
  "Investor",
  "Registered",
  "Not Released",
];
