import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
const searchApiMock = vi.hoisted(() => ({
  quick: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/api", () => ({
  searchApi: searchApiMock,
}));

import { GlobalSearch } from "./global-search";

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchApiMock.quick.mockResolvedValue({
      data: {
        data: {
          leads: [{
            id: "lead-1",
            firstName: "Geeta",
            lastName: "Menon",
            status: "INCOMING",
            url: "/leads/lead-1",
          }],
          tasks: [],
        },
      },
    });
  });

  it("shows matching inline results and opens the selected record", async () => {
    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("combobox", { name: "Search CRM records" }), {
      target: { value: "77" },
    });

    const result = await screen.findByRole("option", { name: /Geeta Menon.*Lead - INCOMING/ });
    expect(searchApiMock.quick).toHaveBeenCalledWith("77");

    fireEvent.click(result);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/leads/lead-1"));
  });

  it("filters suggestions by the selected category", async () => {
    searchApiMock.quick.mockResolvedValue({
      data: {
        data: {
          leads: [{
            id: "lead-1",
            firstName: "Geeta",
            lastName: "Menon",
            url: "/leads/lead-1",
          }],
          tasks: [{
            id: "task-1",
            title: "Call Geeta",
            status: "PENDING",
            url: "/tasks/task-1",
          }],
        },
      },
    });

    render(<GlobalSearch />);
    fireEvent.change(screen.getByRole("combobox", { name: "Search CRM records" }), {
      target: { value: "Geeta" },
    });
    await screen.findByRole("option", { name: /Geeta Menon/ });
    fireEvent.change(screen.getByRole("combobox", { name: "Search category" }), {
      target: { value: "tasks" },
    });

    expect(screen.queryByRole("option", { name: /Geeta Menon/ })).toBeNull();
    expect(screen.getByRole("option", { name: /Call Geeta/ })).toBeTruthy();
  });
});
