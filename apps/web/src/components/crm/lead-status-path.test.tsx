import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    leadStatuses: [
      { statusId: "1", status: "NEW", label: "New", enabled: true },
      { statusId: "2", status: "INCOMING", label: "Incoming", enabled: true },
      { statusId: "3", status: "PROSPECT", label: "Prospect", enabled: true },
      { statusId: "4", status: "SITE_VISIT_SCHEDULED", label: "Site Visit Scheduled", enabled: true },
      { statusId: "5", status: "SITE_VISIT_HAPPENED", label: "Site Visit Happened", enabled: true },
      { statusId: "6", status: "BOOKED", label: "Booked", enabled: true },
      { statusId: "7", status: "LOST", label: "Lost", enabled: true },
    ],
    getLeadStatusLabel: (status: string) => ({
      NEW: "New",
      INCOMING: "Incoming",
      PROSPECT: "Prospect",
      SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
      SITE_VISIT_HAPPENED: "Site Visit Happened",
      BOOKED: "Booked",
      LOST: "Lost",
    }[status] || status),
  }),
}));

import { LeadStatusPath } from "./lead-status-path";

describe("LeadStatusPath", () => {
  it("shows the current stage and ignores click, double-click, and keyboard activation", () => {
    render(<LeadStatusPath status="INCOMING" />);

    const bar = screen.getByRole("list", { name: "Lead status: Incoming" });
    const current = screen.getByRole("listitem", { current: "step" });
    expect(current).toHaveTextContent("Incoming");
    expect(bar.querySelectorAll("button, a, [role='button'], [tabindex]")).toHaveLength(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const prospect = screen.getByText("Prospect");
    fireEvent.click(prospect);
    fireEvent.doubleClick(prospect);
    fireEvent.keyDown(prospect, { key: "Enter" });
    fireEvent.keyDown(prospect, { key: " " });
    fireEvent.keyDown(bar, { key: "Enter" });
    fireEvent.keyDown(bar, { key: " " });

    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Incoming");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bar.querySelectorAll("button, a, input, select, textarea, [tabindex], [role='button']")).toHaveLength(0);
    expect(bar).toHaveAttribute("title", "Status updates automatically.");
  });

  it("highlights Lost when that is the current stage", () => {
    render(<LeadStatusPath status="LOST" />);
    expect(screen.getByRole("list", { name: "Lead status: Lost" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Lost");
  });
});
