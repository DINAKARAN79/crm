import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isLoading: false,
  isSuperAdmin: false,
  companyList: vi.fn(),
  companyStatistics: vi.fn(),
  layoutListAll: vi.fn(),
  layoutList: vi.fn(),
  layoutUnits: vi.fn(),
  layoutGet: vi.fn(),
  layoutDrawing: vi.fn(),
  layoutDelete: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ isLoading: state.isLoading, isSuperAdmin: state.isSuperAdmin }),
}));

vi.mock("@/lib/api", () => ({
  companyApi: {
    list: state.companyList,
    statistics: state.companyStatistics,
  },
  projectLayoutsApi: {
    all: state.layoutListAll,
    list: state.layoutList,
    units: state.layoutUnits,
    get: state.layoutGet,
    drawing: state.layoutDrawing,
    delete: state.layoutDelete,
  },
}));

import CustomProjectLayoutsPage from "@/app/(dashboard)/admin/custom-project-layouts/page";

describe("Custom Project Layouts access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    state.isLoading = false;
    state.isSuperAdmin = false;
    state.layoutListAll.mockResolvedValue({ data: { data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } } });
    state.layoutList.mockResolvedValue({ data: { data: [] } });
    state.layoutUnits.mockResolvedValue({ data: { data: [], pagination: { totalPages: 1 } } });
    state.layoutDelete.mockResolvedValue({ data: { success: true } });
  });

  it("blocks tenant users before requesting company data", () => {
    render(<CustomProjectLayoutsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Super Admin access is required");
    expect(state.companyList).not.toHaveBeenCalled();
  });

  it("loads the company selector for a Super Admin", async () => {
    state.isSuperAdmin = true;
    state.companyList.mockResolvedValue({
      data: { data: [{ id: "tenant-a", name: "Northstar Realty" }], pagination: { totalPages: 1 } },
    });
    render(<CustomProjectLayoutsPage />);

    await waitFor(() => expect(state.companyList).toHaveBeenCalledWith({
      page: 1,
      limit: 100,
      sortBy: "name",
      sortOrder: "asc",
    }));
    const companySelector = screen.getByRole("combobox", { name: "Company" });
    fireEvent.keyDown(companySelector, { key: "Enter" });
    expect(await screen.findByRole("option", { name: "Northstar Realty" })).toBeInTheDocument();
  });

  it("shows saved layouts across projects by default and opens a selected layout with its mappings", async () => {
    state.isSuperAdmin = true;
    state.companyList.mockResolvedValue({
      data: { data: [{ id: "tenant-a", name: "Northstar Realty" }], pagination: { totalPages: 1 } },
    });
    state.layoutListAll.mockResolvedValue({
      data: {
        data: [{
          id: "layout-a",
          tenantId: "tenant-a",
          projectId: "project-a",
          name: "Garden Site Plan",
          originalFilename: "garden.png",
          mimeType: "image/png",
          selectedPage: 1,
          status: "PUBLISHED",
          updatedAt: "2026-10-25T12:00:00.000Z",
          _count: { shapes: 1 },
          mappedUnits: 1,
          unmappedUnits: 0,
          tenant: { name: "Northstar Realty" },
          project: { name: "North Gardens" },
        }],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      },
    });
    state.companyStatistics.mockResolvedValue({
      data: { data: [{ id: "project-a", name: "North Gardens" }], pagination: { totalPages: 1 } },
    });
    state.layoutUnits.mockResolvedValue({
      data: {
        data: [{ id: "unit-a", number: "U-101", type: "Villa", block: null, floor: 1, area: 1200, price: 1000, status: "AVAILABLE" }],
        pagination: { totalPages: 1 },
      },
    });
    state.layoutGet.mockResolvedValue({
      data: {
        data: {
          id: "layout-a",
          tenantId: "tenant-a",
          projectId: "project-a",
          name: "Garden Site Plan",
          originalFilename: "garden.png",
          mimeType: "image/png",
          selectedPage: 1,
          status: "PUBLISHED",
          updatedAt: "2026-10-25T12:00:00.000Z",
          _count: { shapes: 1 },
          storageKey: "layout-key",
          shapes: [{
            id: "shape-a",
            kind: "RECTANGLE",
            unitId: "unit-a",
            geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            unit: { id: "unit-a", number: "U-101", type: "Villa", block: null, floor: 1, area: 1200, price: 1000, status: "AVAILABLE" },
          }],
        },
      },
    });
    state.layoutDrawing.mockResolvedValue(new Blob(["image data"], { type: "image/png" }));
    render(<CustomProjectLayoutsPage />);

    expect(await screen.findByText("Garden Site Plan")).toBeInTheDocument();
    expect(screen.getByText("Northstar Realty")).toBeInTheDocument();
    expect(screen.getByText("North Gardens")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    const layoutRow = screen.getByRole("row", { name: /Garden Site Plan/ });
    expect(within(layoutRow).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(expect.arrayContaining(["1", "0"]));

    fireEvent.change(screen.getByRole("textbox", { name: "Search layouts" }), { target: { value: "North" } });
    await waitFor(() => expect(state.layoutListAll).toHaveBeenCalledWith(expect.objectContaining({ search: "North" })));
    fireEvent.click(screen.getByRole("button", { name: "Open or edit Garden Site Plan" }));
    await waitFor(() => expect(state.layoutGet).toHaveBeenCalledWith("layout-a", "tenant-a", "project-a"));
    expect(await screen.findByAltText("Original site plan garden.png")).toBeInTheDocument();
    expect(await screen.findByText("Mapped · U-101")).toBeInTheDocument();
    expect(screen.getByText("Shapes (1)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Garden Site Plan" }));
    expect(await screen.findByText("Delete this custom layout?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete layout" }));
    await waitFor(() => expect(state.layoutDelete).toHaveBeenCalledWith("layout-a", "tenant-a", "project-a"));
  });
});
