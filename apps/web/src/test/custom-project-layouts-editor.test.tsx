import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isLoading: false,
  isSuperAdmin: true,
  companyList: vi.fn(),
  companyStatistics: vi.fn(),
  units: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  drawing: vi.fn(),
  save: vi.fn(),
  savedShapes: [] as Array<{
    id: string;
    kind: "RECTANGLE" | "POLYGON";
    unitId: string | null;
    geometry: object;
  }>,
  detectedPixels: new Uint8ClampedArray(100 * 100 * 4),
  unitRows: [] as Array<{
    id: string;
    number: string;
    type: string | null;
    block: string | null;
    floor: number | null;
    area: number | null;
    price: number | null;
    status: string;
  }>,
}));

const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ isLoading: state.isLoading, isSuperAdmin: state.isSuperAdmin }),
}));

vi.mock("@/lib/api", () => {
  const readLayout = () => ({
    id: "layout-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    name: "Site plan",
    originalFilename: "site-plan.png",
    storageKey: "site-plan.png",
    mimeType: "image/png",
    fileSize: 8,
    selectedPage: 1,
    status: "DRAFT",
    updatedAt: "2026-10-26T10:00:00.000Z",
    _count: { shapes: state.savedShapes.length },
    shapes: state.savedShapes.map((shape) => ({
      ...shape,
      unit: state.unitRows.find((unit) => unit.id === shape.unitId) || null,
    })),
  });
  return {
    companyApi: {
      list: state.companyList,
      statistics: state.companyStatistics,
    },
    projectLayoutsApi: {
      units: state.units,
      list: state.list,
      get: state.get,
      drawing: state.drawing,
      save: state.save,
    },
  };
});

import CustomProjectLayoutsPage from "@/app/(dashboard)/admin/custom-project-layouts/page";

async function chooseOption(label: string, option: string | RegExp) {
  if (label === "Company") {
    await waitFor(() => expect(state.companyList).toHaveBeenCalled());
  } else if (label === "Project") {
    await waitFor(() => expect(state.companyStatistics).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Project" })).not.toBeDisabled());
  } else if (label === "Open saved layout") {
    await waitFor(() => expect(state.list).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("combobox", { name: label })).not.toBeDisabled());
  } else if (label === "Unit to map to next shape") {
    await waitFor(() => expect(state.units).toHaveBeenCalled());
  }
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

async function openSelectedLayout() {
  await waitFor(() => expect(state.list).toHaveBeenCalled());
  await waitFor(() => expect(state.units).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("combobox", { name: "Open saved layout" }));
  fireEvent.click(await screen.findByRole("option", { name: /Site plan/ }));
  await screen.findByRole("img", { name: "Original site plan site-plan.png" });
  const image = screen.getByRole("img", { name: "Original site plan site-plan.png" });
  Object.defineProperty(image, "naturalWidth", { configurable: true, value: 100 });
  Object.defineProperty(image, "naturalHeight", { configurable: true, value: 100 });
  fireEvent.load(image);
  await waitFor(() => expect(document.querySelector('svg[viewBox="0 0 1 1"]')).toBeInTheDocument());
}

function mockDrawingBounds() {
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(SVGElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
}

describe("Custom Project Layout editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    state.isLoading = false;
    state.isSuperAdmin = true;
    state.savedShapes = [];
    state.detectedPixels = new Uint8ClampedArray(100 * 100 * 4);
    state.unitRows = [
      { id: "unit-101", number: "101", type: "2BHK", block: "A", floor: 1, area: 900, price: 100000, status: "AVAILABLE" },
      { id: "unit-102", number: "102", type: "3BHK", block: "A", floor: 2, area: 1200, price: 150000, status: "AVAILABLE" },
    ];
    state.companyList.mockResolvedValue({
      data: { data: [{ id: "tenant-a", name: "Northstar Realty" }], pagination: { totalPages: 1 } },
    });
    state.companyStatistics.mockResolvedValue({
      data: { data: [{ id: "project-a", name: "Riverside" }], pagination: { totalPages: 1 } },
    });
    state.units.mockResolvedValue({
      data: { data: state.unitRows, pagination: { totalPages: 1 } },
    });
    state.list.mockImplementation(async () => ({
      data: { data: [{ ...readLayoutSummary(), _count: { shapes: state.savedShapes.length } }] },
    }));
    state.get.mockImplementation(async () => ({ data: { data: readLayout() } }));
    state.drawing.mockResolvedValue({ data: new Blob(["png"], { type: "image/png" }) });
    state.save.mockImplementation(async (_id, _tenantId, _projectId, payload) => {
      state.savedShapes = payload.shapes;
      return { data: { data: readLayout() } };
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:site-plan"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("Image", class {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      drawImage: vi.fn(),
      getImageData: () => ({ data: state.detectedPixels }),
    } as unknown as CanvasRenderingContext2D));
    mockDrawingBounds();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCreateObjectURL) Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
    else Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:site-plan") });
    if (originalRevokeObjectURL) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
    else Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  it("draws a rectangle, assigns and reassigns a unit, then restores the mapping after remount", async () => {
    const view = render(<CustomProjectLayoutsPage />);
    await chooseOption("Company", "Northstar Realty");
    await chooseOption("Project", "Riverside");
    await openSelectedLayout();

    await chooseOption("Unit to map to next shape", /101/);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    const drawing = document.querySelector('svg[viewBox="0 0 1 1"]') as SVGSVGElement;
    const drawingSurface = drawing.querySelector('[data-layout-canvas="true"]') as SVGRectElement;
    fireEvent.pointerDown(drawingSurface, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(drawingSurface, { pointerId: 1, clientX: 40, clientY: 60 });
    fireEvent.pointerUp(drawingSurface, { pointerId: 1, clientX: 40, clientY: 60 });

    expect(await screen.findByRole("button", { name: "Shape rectangle mapped to unit 101" })).toBeInTheDocument();
    expect(screen.getByText("Mapped · 101")).toBeInTheDocument();
    const rectangleOverlay = drawing.querySelector('polygon[aria-label="Shape rectangle mapped to unit 101"]') as SVGPolygonElement;
    fireEvent.click(rectangleOverlay);
    expect(rectangleOverlay).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Shape rectangle mapped to unit 101" }));
    fireEvent.click(screen.getByRole("button", { name: /102 · 3BHK/ }));
    expect(screen.getByText("Mapped · 102")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit mapping progress")).toHaveTextContent("Total shapes1Mapped units1Unmapped units0");
    expect(screen.getByRole("button", { name: "Save All & Finalize Layout" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Unmap" }));
    expect(screen.getByRole("button", { name: "Save All & Finalize Layout" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /102 · 3BHK/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    const savedRectangle = state.save.mock.calls[0][3].shapes[0];
    expect(savedRectangle).toMatchObject({ id: expect.any(String), kind: "RECTANGLE", unitId: "unit-102" });
    expect(savedRectangle.geometry.x).toBeCloseTo(0.1);
    expect(savedRectangle.geometry.y).toBeCloseTo(0.2);
    expect(savedRectangle.geometry.width).toBeCloseTo(0.3);
    expect(savedRectangle.geometry.height).toBeCloseTo(0.4);

    view.unmount();
    render(<CustomProjectLayoutsPage />);
    await chooseOption("Company", "Northstar Realty");
    await chooseOption("Project", "Riverside");
    await openSelectedLayout();

    expect(screen.getByRole("button", { name: "Shape rectangle mapped to unit 102" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mapped · 102/ })).toBeInTheDocument();
  });

  it("converts scaled screen coordinates when click-placing a mapped starter rectangle", async () => {
    render(<CustomProjectLayoutsPage />);
    await chooseOption("Company", "Northstar Realty");
    await chooseOption("Project", "Riverside");
    await openSelectedLayout();
    await chooseOption("Unit to map to next shape", /101/);
    const drawing = document.querySelector('svg[viewBox="0 0 1 1"]') as SVGSVGElement;
    Object.defineProperty(drawing, "getScreenCTM", {
      configurable: true,
      value: () => ({ inverse: () => ({}) }),
    });

    Object.defineProperty(drawing, "createSVGPoint", {
      configurable: true,
      value: () => {
        let pointX = 0;
        let pointY = 0;
        return Object.defineProperties({
          matrixTransform: () => ({ x: pointX / 200, y: pointY / 200 }),
        }, {
          x: { get: () => pointX, set: (value: number) => { pointX = value; } },
          y: { get: () => pointY, set: (value: number) => { pointY = value; } },
        }) as SVGPoint;
      },
    });
    const drawingSurface = drawing.querySelector('[data-layout-canvas="true"]') as SVGRectElement;
    fireEvent.pointerDown(drawingSurface, { pointerId: 7, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(drawingSurface, { pointerId: 7, clientX: 100, clientY: 100 });

    expect(await screen.findByRole("button", { name: "Shape rectangle mapped to unit 101" })).toBeInTheDocument();
    expect(screen.getByLabelText("Unit mapping progress")).toHaveTextContent("Total shapes1Mapped units1Unmapped units0");
    expect(screen.getByText("Mapped · 101")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    const geometry = state.save.mock.calls[0][3].shapes[0].geometry;
    expect(geometry.x).toBeCloseTo(0.46);
    expect(geometry.y).toBeCloseTo(0.46);
  });

  it("clicks two detected green units, maps them independently, and restores both mappings", async () => {
    for (const region of [
      { x: 10, y: 10, width: 20, height: 20 },
      { x: 60, y: 60, width: 20, height: 20 },
    ]) {
      for (let y = region.y; y < region.y + region.height; y += 1) {
        for (let x = region.x; x < region.x + region.width; x += 1) {
          const offset = (y * 100 + x) * 4;
          state.detectedPixels[offset] = 20;
          state.detectedPixels[offset + 1] = 180;
          state.detectedPixels[offset + 2] = 40;
          state.detectedPixels[offset + 3] = 255;
        }
      }
    }

    const view = render(<CustomProjectLayoutsPage />);
    await chooseOption("Company", "Northstar Realty");
    await chooseOption("Project", "Riverside");
    await openSelectedLayout();
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    expect(await screen.findByText(/Detected 2 green regions/)).toBeInTheDocument();
    expect(screen.getByLabelText("Unit mapping progress")).toHaveTextContent("Total shapes0Mapped units0Unmapped units0");
    const originalImage = screen.getByRole("img", { name: "Original site plan site-plan.png" });
    expect(originalImage).toHaveAttribute("src", "blob:site-plan");
    expect(originalImage).toHaveStyle({ objectFit: "fill" });
    const drawing = document.querySelector('svg[viewBox="0 0 1 1"]') as SVGSVGElement;
    expect(drawing.querySelectorAll('polygon[aria-label^="Detected green unit region"]')).toHaveLength(2);
    expect(drawing.querySelectorAll('polygon[aria-label^="Shape "]')).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Detected green unit region 1" }));
    const firstShape = screen.getByRole("button", { name: "Shape polygon, not mapped" });
    expect(firstShape).toHaveAttribute("fill", "transparent");
    expect(firstShape).toHaveAttribute("stroke", "#1d4ed8");
    expect(drawing.querySelectorAll("circle")).toHaveLength(0);
    expect(screen.getByLabelText("Unit mapping progress")).toHaveTextContent("Total shapes1Mapped units0Unmapped units1");
    expect(drawing.querySelectorAll('polygon[aria-label^="Detected green unit region"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /101 · 2BHK/ }));
    expect(screen.getByText("Mapped · 101")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit mapping progress")).toHaveTextContent("Total shapes1Mapped units1Unmapped units0");

    fireEvent.click(screen.getByRole("button", { name: "Detected green unit region 2" }));
    fireEvent.click(screen.getByRole("button", { name: /102 · 3BHK/ }));
    expect(screen.getByLabelText("Unit mapping progress")).toHaveTextContent("Total shapes2Mapped units2Unmapped units0");
    expect(drawing.querySelectorAll('polygon[aria-label^="Detected green unit region"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /1\. Polygon/ }));
    const redrawTarget = drawing.querySelector('polygon[aria-label="Shape polygon mapped to unit 101"]') as SVGPolygonElement;
    fireEvent.click(screen.getByRole("button", { name: "Redraw boundary" }));
    fireEvent.click(redrawTarget, { clientX: 12, clientY: 12 });
    fireEvent.click(redrawTarget, { clientX: 27, clientY: 12 });
    fireEvent.click(redrawTarget, { clientX: 20, clientY: 27 });
    fireEvent.click(screen.getByRole("button", { name: "Finish polygon (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    const savedShapes = state.save.mock.calls[0][3].shapes as Array<{ unitId: string | null; kind: string; geometry: object }>;
    expect(savedShapes).toHaveLength(2);
    expect(savedShapes.map((shape) => shape.unitId)).toEqual(["unit-101", "unit-102"]);
    expect(savedShapes.every((shape) => shape.kind === "POLYGON")).toBe(true);
    expect(savedShapes[0].geometry).toEqual({
      points: [
        { x: 0.12, y: 0.12 },
        { x: 0.27, y: 0.12 },
        { x: 0.2, y: 0.27 },
      ],
    });
    view.unmount();

    render(<CustomProjectLayoutsPage />);
    await chooseOption("Company", "Northstar Realty");
    await chooseOption("Project", "Riverside");
    await openSelectedLayout();
    expect(screen.getByRole("button", { name: "Shape polygon mapped to unit 101" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shape polygon mapped to unit 102" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Shape polygon mapped to unit 101" }));
    expect(screen.getByRole("button", { name: "Shape polygon mapped to unit 101" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Shape polygon mapped to unit 101" })).toHaveAttribute("stroke", "#1d4ed8");
    expect(screen.getByRole("button", { name: "Shape polygon mapped to unit 101" })).toHaveAttribute("fill", "transparent");
    fireEvent.click(screen.getByRole("button", { name: "Edit boundary" }));
    expect(document.querySelectorAll('svg[viewBox="0 0 1 1"] circle')).toHaveLength(3);
    expect(screen.getByLabelText("Unit mapping progress")).toHaveTextContent("Total shapes2Mapped units2Unmapped units0");
  });

  it("draws polygon overlays and prevents assigning a unit already mapped to another shape", async () => {
    state.savedShapes = [{
      id: "shape-existing",
      kind: "RECTANGLE",
      unitId: "unit-101",
      geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    }];
    const view = render(<CustomProjectLayoutsPage />);
    await chooseOption("Company", "Northstar Realty");
    await chooseOption("Project", "Riverside");
    await openSelectedLayout();

    fireEvent.click(screen.getByRole("button", { name: /1\. Rectangle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Map another unit" }));
    await chooseOption("Unit to map to next shape", /102/);
    fireEvent.click(screen.getByRole("button", { name: "Polygon" }));
    const drawing = document.querySelector('svg[viewBox="0 0 1 1"]') as SVGSVGElement;
    const drawingSurface = drawing.querySelector('[data-layout-canvas="true"]') as SVGRectElement;
    fireEvent.click(drawingSurface, { clientX: 20, clientY: 20 });
    fireEvent.click(drawingSurface, { clientX: 70, clientY: 20 });
    fireEvent.click(drawingSurface, { clientX: 60, clientY: 70 });
    fireEvent.click(screen.getByRole("button", { name: "Finish polygon (3)" }));

    expect(await screen.findByRole("button", { name: "Shape polygon mapped to unit 102" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Shape polygon mapped to unit 102" }));
    expect(screen.getByRole("button", { name: /101 · 2BHK/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    const savedShapes = state.save.mock.calls[0][3].shapes;
    expect(savedShapes[0]).toMatchObject({ id: "shape-existing", unitId: "unit-101" });
    expect(savedShapes[1]).toMatchObject({ id: expect.any(String), kind: "POLYGON", unitId: "unit-102" });
    if (savedShapes[1].geometry && "points" in savedShapes[1].geometry) {
      expect(savedShapes[1].geometry.points).toEqual([
        expect.objectContaining({ x: expect.closeTo(0.2), y: expect.closeTo(0.2) }),
        expect.objectContaining({ x: expect.closeTo(0.7), y: expect.closeTo(0.2) }),
        expect.objectContaining({ x: expect.closeTo(0.6), y: expect.closeTo(0.7) }),
      ]);
    } else {
      throw new Error("Expected persisted polygon points");
    }
    view.unmount();

    render(<CustomProjectLayoutsPage />);
    await chooseOption("Company", "Northstar Realty");
    await chooseOption("Project", "Riverside");
    await openSelectedLayout();
    expect(screen.getByRole("button", { name: "Shape rectangle mapped to unit 101" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shape polygon mapped to unit 102" })).toBeInTheDocument();
    expect(screen.getByLabelText("Unit mapping progress")).toHaveTextContent("Total shapes2Mapped units2Unmapped units0");
    fireEvent.click(screen.getByRole("button", { name: "Shape polygon mapped to unit 102" }));
    expect(screen.getByRole("button", { name: "Shape polygon mapped to unit 102" })).toHaveAttribute("aria-pressed", "true");
  });

  it("resizes and moves a selected rectangle before saving its updated geometry", async () => {
    state.savedShapes = [{
      id: "shape-edit",
      kind: "RECTANGLE",
      unitId: "unit-101",
      geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    }];
    const view = render(<CustomProjectLayoutsPage />);
    await chooseOption("Company", "Northstar Realty");
    await chooseOption("Project", "Riverside");
    await openSelectedLayout();
    fireEvent.click(screen.getByRole("button", { name: /1\. Rectangle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit boundary" }));

    const svg = document.querySelector('svg[viewBox="0 0 1 1"]') as SVGSVGElement;
    const resizeHandle = svg.querySelector("circle") as SVGCircleElement;
    fireEvent.pointerDown(resizeHandle, { pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 20, clientY: 20 });

    const polygon = svg.querySelector('polygon[aria-label="Shape rectangle mapped to unit 101"]') as SVGPolygonElement;
    fireEvent.pointerDown(polygon, { pointerId: 3, clientX: 25, clientY: 25 });
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: 35, clientY: 40 });
    fireEvent.pointerUp(svg, { pointerId: 3, clientX: 35, clientY: 40 });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());

    const edited = state.save.mock.calls[0][3].shapes[0];
    expect(edited).toMatchObject({ id: "shape-edit", kind: "RECTANGLE", unitId: "unit-101" });
    expect(edited.geometry.x).toBeCloseTo(0.3);
    expect(edited.geometry.y).toBeCloseTo(0.35);
    expect(edited.geometry.width).toBeCloseTo(0.1);
    expect(edited.geometry.height).toBeCloseTo(0.1);
    fireEvent.click(screen.getByRole("button", { name: "Delete shape" }));
    expect(screen.getByText("Shapes (0)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
    expect(state.save.mock.calls[1][3].shapes).toEqual([]);
    view.unmount();
  });
});

function readLayoutSummary() {
  return {
    id: "layout-a",
    name: "Site plan",
    originalFilename: "site-plan.png",
    mimeType: "image/png",
    selectedPage: 1,
    status: "DRAFT",
    updatedAt: "2026-10-26T10:00:00.000Z",
  };
}

function readLayout() {
  return {
    ...readLayoutSummary(),
    tenantId: "tenant-a",
    projectId: "project-a",
    storageKey: "site-plan.png",
    fileSize: 8,
    shapes: state.savedShapes.map((shape) => ({
      ...shape,
      unit: state.unitRows.find((unit) => unit.id === shape.unitId) || null,
    })),
  };
}
