export interface MasterPlanBlock {
  id: string;
  label: string;
  phase: string;
  x: number;
  y: number;
  columns: number;
  rows: number;
  plotWidth: number;
  plotHeight: number;
  pitchX: number;
  pitchY: number;
  rotation: number;
  orientation?: number;
  outline: string;
}

export interface MasterPlanPlotSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  block: string;
  phase: string;
}

export const masterPlanGeometry = {
  width: 1660,
  height: 1200,
  planWidth: 1500,
  planHeight: 1080,
  siteBoundary: "M76 212 Q82 168 142 164 L592 158 Q680 132 759 150 L1004 144 L1327 158 Q1402 168 1408 246 L1390 812 Q1380 899 1292 918 L956 929 Q859 949 752 919 L438 938 L168 918 Q82 905 72 824 L74 610 Q50 526 74 448 Z",
  blocks: [
    {
      id: "A",
      label: "BLOCK A",
      phase: "PHASE 1",
      x: 110,
      y: 192,
      columns: 5,
      rows: 5,
      plotWidth: 58,
      plotHeight: 38,
      pitchX: 70,
      pitchY: 54,
      rotation: 0,
      outline: "M94 204 L440 178 Q462 179 468 204 L456 450 Q453 466 435 470 L111 478 Q91 468 91 448 Z",
    },
    {
      id: "B",
      label: "BLOCK B",
      phase: "PHASE 1",
      x: 978,
      y: 192,
      columns: 5,
      rows: 5,
      plotWidth: 58,
      plotHeight: 38,
      pitchX: 70,
      pitchY: 54,
      rotation: 3,
      outline: "M960 188 Q976 170 1001 174 L1324 192 Q1348 200 1350 224 L1333 448 Q1327 466 1305 471 L982 463 Q959 456 958 435 Z",
    },
    {
      id: "C",
      label: "BLOCK C",
      phase: "PHASE 2",
      x: 110,
      y: 598,
      columns: 5,
      rows: 5,
      plotWidth: 58,
      plotHeight: 38,
      pitchX: 70,
      pitchY: 54,
      rotation: -2,
      outline: "M91 608 Q96 585 119 580 L439 568 Q462 571 466 596 L455 840 Q450 862 430 866 L117 879 Q94 872 91 850 Z",
    },
    {
      id: "D",
      label: "BLOCK D",
      phase: "PHASE 3",
      x: 978,
      y: 598,
      columns: 5,
      rows: 5,
      plotWidth: 52,
      plotHeight: 32,
      pitchX: 70,
      pitchY: 54,
      rotation: 0,
      orientation: 90,
      outline: "M962 599 Q971 577 998 578 L1321 568 Q1344 574 1347 597 L1332 843 Q1328 864 1305 870 L982 863 Q960 854 959 832 Z",
    },
  ] satisfies MasterPlanBlock[],
  roads: [
    { id: "main-east-west", path: "M60 510 H1440", width: 58, label: "40 FEET WIDE LAYOUT ROAD", x: 480, y: 505 },
    { id: "main-north-south", path: "M735 142 V954", width: 62, label: "40 FEET WIDE LAYOUT ROAD", x: 735, y: 300, rotation: -90 },
    { id: "north-east-connector", path: "M735 510 C792 481 835 438 890 408 Q920 391 951 375", width: 42, label: "30 FEET WIDE LAYOUT ROAD", x: 852, y: 445, rotation: -28 },
    { id: "south-east-connector", path: "M735 510 C784 541 831 559 887 556 Q934 554 970 602", width: 36, label: "", x: 0, y: 0 },
  ],
  parks: [
    { id: "west-north-park", x: 500, y: 237, width: 150, height: 158, label: "GARDEN PARK" },
    { id: "east-north-park", x: 808, y: 228, width: 126, height: 158, label: "GREEN" },
    { id: "west-south-park", x: 500, y: 654, width: 150, height: 158, label: "COMMUNITY PARK" },
    { id: "east-south-park", x: 808, y: 664, width: 126, height: 150, label: "OPEN SPACE" },
  ],
  entries: [
    { x: 735, y: 157, label: "NORTH ENTRY" },
    { x: 735, y: 925, label: "SOUTH ACCESS" },
  ],
  legend: { x: 72, y: 982, width: 1244, height: 68 },
  compass: { x: 1390, y: 1012 },
};

const blockSlotCount = (block: MasterPlanBlock) => block.columns * block.rows;

export function createMasterPlanPlotSlots(count: number): MasterPlanPlotSlot[] {
  const capacity = masterPlanGeometry.blocks.reduce((sum, block) => sum + blockSlotCount(block), 0);
  const targetCount = Math.max(0, Math.floor(count));
  if (targetCount > capacity) {
    const columns = 10;
    const slotsPerBlock = Math.floor(targetCount / masterPlanGeometry.blocks.length);
    let extraSlots = targetCount % masterPlanGeometry.blocks.length;

    return masterPlanGeometry.blocks.flatMap((block) => {
      const blockCount = slotsPerBlock + (extraSlots > 0 ? 1 : 0);
      extraSlots = Math.max(0, extraSlots - 1);
      const rows = Math.ceil(blockCount / columns);
      const pitchX = (block.columns * block.pitchX) / columns;
      const pitchY = (block.rows * block.pitchY) / rows;
      const vertical = block.orientation === 90;
      const width = vertical ? pitchY - 4 : pitchX - 4;
      const height = vertical ? pitchX - 4 : pitchY - 4;

      return Array.from({ length: blockCount }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        return {
          x: block.x + column * pitchX,
          y: block.y + row * pitchY,
          width,
          height,
          rotation: (block.orientation ?? 0) + (column === columns - 1 && row % 2 === 0 ? block.rotation : 0),
          block: block.label.replace("BLOCK ", "Block "),
          phase: block.phase,
        };
      });
    });
  }

  const slotsPerBlock = Math.floor(targetCount / masterPlanGeometry.blocks.length);
  let extraSlots = targetCount % masterPlanGeometry.blocks.length;

  return masterPlanGeometry.blocks.flatMap((block) => {
    const blockCount = Math.min(
      blockSlotCount(block),
      slotsPerBlock + (extraSlots > 0 ? 1 : 0),
    );
    extraSlots = Math.max(0, extraSlots - 1);

    return Array.from({ length: blockCount }, (_, index) => {
      const row = Math.floor(index / block.columns);
      const column = index % block.columns;
      const vertical = block.orientation === 90;
      const width = block.plotWidth + (vertical ? 0 : (index % 3) * 2);
      const height = block.plotHeight + (index % 2) * 4;
      const rotation = (block.orientation ?? 0) + (column === block.columns - 1 && row % 2 === 0
        ? block.rotation
        : 0);

      return {
        x: block.x + column * block.pitchX,
        y: block.y + row * block.pitchY,
        width,
        height,
        rotation,
        block: block.label.replace("BLOCK ", "Block "),
        phase: block.phase,
      };
    });
  });
}

export const masterPlanInternalRoads = masterPlanGeometry.blocks.flatMap((block) => (
  Array.from({ length: block.rows - 1 }, (_, index) => ({
    id: `${block.id}-lane-${index + 1}`,
    path: `M${block.x - 5} ${block.y + (index + 1) * block.pitchY - 6} H${block.x + block.columns * block.pitchX - 10}`,
  }))
));
