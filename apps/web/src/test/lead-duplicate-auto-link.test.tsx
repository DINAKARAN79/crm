import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  checkDuplicates: vi.fn(),
  createLead: vi.fn(),
  listProjects: vi.fn(),
  listUsers: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: testState.push }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: testState.toast }),
}));

vi.mock("@/lib/api", () => ({
  leadApi: {
    checkDuplicates: testState.checkDuplicates,
    create: testState.createLead,
  },
  projectApi: { listAll: testState.listProjects },
  userApi: { list: testState.listUsers },
}));

import NewLeadPage from "../app/(dashboard)/leads/new/page";

beforeEach(() => {
  vi.clearAllMocks();
  testState.listProjects.mockResolvedValue([{ id: "project-1", name: "DCT Heights" }]);
  testState.listUsers.mockResolvedValue({ data: { data: [] } });
  testState.createLead.mockResolvedValue({
    data: { success: true, action: "EXISTING_ACTIVE", leadId: "lead-existing" },
  });
});

async function fillRequiredLeadFields() {
  await screen.findByLabelText(/Primary Phone/);
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: "Customer" } });
  fireEvent.change(screen.getByLabelText(/Primary Phone/), { target: { value: "9876543210" } });
  fireEvent.change(screen.getByLabelText(/Lead Source/), { target: { value: "WEBSITE" } });
  fireEvent.change(screen.getByLabelText(/Project Name/), { target: { value: "project-1" } });
  fireEvent.change(screen.getByLabelText(/Lead Interest/), { target: { value: "PROSPECT" } });
  fireEvent.change(screen.getByLabelText((content) => content.replace("*", "").trim() === "Campaign"), { target: { value: "Website" } });
  fireEvent.change(screen.getByLabelText(/Sub Campaign/), { target: { value: "Landing page" } });
}

describe("Create Lead duplicate handling", () => {
  it("automatically creates an enquiry under the single matching Lead", async () => {
    testState.checkDuplicates.mockResolvedValue({
      data: {
        hasDuplicates: true,
        ambiguous: false,
        inaccessibleMatches: false,
        candidates: [{ id: "lead-existing", leadNumber: "LN000123" }],
      },
    });

    render(<NewLeadPage />);
    await fillRequiredLeadFields();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(testState.createLead).toHaveBeenCalledWith(expect.objectContaining({
        lastName: "Customer",
        phone: "9876543210",
        projectId: "project-1",
        linkToLeadId: "lead-existing",
      }));
      expect(testState.push).toHaveBeenCalledWith("/leads/lead-existing");
    });
    expect(screen.queryByText("Link enquiry")).not.toBeInTheDocument();
    expect(testState.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enquiry linked" }));
  });

  it("does not choose arbitrarily when duplicate matches are ambiguous", async () => {
    testState.checkDuplicates.mockResolvedValue({
      data: {
        hasDuplicates: true,
        ambiguous: true,
        inaccessibleMatches: false,
        candidates: [
          { id: "lead-one", leadNumber: "LN000123", name: "First Customer", matchedFields: ["phone"] },
          { id: "lead-two", leadNumber: "LN000124", name: "Second Customer", matchedFields: ["email"] },
        ],
      },
    });

    render(<NewLeadPage />);
    await fillRequiredLeadFields();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/More than one Lead may match/)).toBeInTheDocument();
    expect(testState.createLead).not.toHaveBeenCalled();
    expect(testState.push).not.toHaveBeenCalled();
  });
});
