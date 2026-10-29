import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  listUsers: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  userApi: { list: testState.listUsers },
}));

import { UserLookup } from "@/components/crm/user-lookup";

describe("UserLookup", () => {
  it("shows user options as an overlay and closes after selection", () => {
    const onChange = vi.fn();
    render(
      <UserLookup
        id="owner"
        ariaLabel="Owner"
        users={[{ id: "user-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isActive: true }]}
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "Owner" }));
    const listbox = screen.getByRole("listbox");
    expect(listbox.className).toContain("z-[60]");
    expect(document.body).toContainElement(listbox);
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) expect(dialog).not.toContainElement(listbox);

    fireEvent.click(screen.getByRole("option", { name: /Ada Lovelace/ }));

    expect(onChange).toHaveBeenCalledWith("user-1");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters eligible users locally when remote search is disabled", () => {
    render(
      <UserLookup
        id="eligible-owner"
        ariaLabel="New Owner"
        users={[
          { id: "user-1", firstName: "Taylor", lastName: "User", email: "taylor@example.com", profile: { name: "Presales" }, isActive: true },
          { id: "user-2", firstName: "Grace", lastName: "Hopper", email: "grace@example.com", isActive: true },
        ]}
        value=""
        onChange={vi.fn()}
        localSearch
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "New Owner" }));
    fireEvent.change(screen.getByRole("combobox", { name: "New Owner" }), { target: { value: "presales" } });

    expect(screen.getByRole("option", { name: /Taylor User/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Grace Hopper/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Show more results/)).not.toBeInTheDocument();
    expect(testState.listUsers).not.toHaveBeenCalled();
  });

  it("keeps at least three matching users visible in the search list", () => {
    render(
      <UserLookup
        id="three-results"
        ariaLabel="New Owner"
        users={[
          { id: "user-1", firstName: "Alex", lastName: "One", email: "alex1@example.com", isActive: true },
          { id: "user-2", firstName: "Alex", lastName: "Two", email: "alex2@example.com", isActive: true },
          { id: "user-3", firstName: "Alex", lastName: "Three", email: "alex3@example.com", isActive: true },
          { id: "user-4", firstName: "Alex", lastName: "Four", email: "alex4@example.com", isActive: true },
        ]}
        value=""
        onChange={vi.fn()}
        localSearch
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "New Owner" }));
    fireEvent.change(screen.getByRole("combobox", { name: "New Owner" }), { target: { value: "alex" } });

    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("listbox").className).toContain("min-h-[min(15rem,50vh)]");
  });
});
