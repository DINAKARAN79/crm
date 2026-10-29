import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  getQueue: vi.fn(),
  getOptions: vi.fn(),
  updateQueue: vi.fn(),
  listUsers: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  rrQueueApi: {
    get: testState.getQueue,
    options: testState.getOptions,
    update: testState.updateQueue,
    members: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    member: vi.fn(),
    history: vi.fn(),
    setMemberActive: vi.fn(),
  },
  userApi: { list: testState.listUsers },
}));

vi.mock("@/components/crm/user-lookup", () => ({
  UserLookup: () => <input aria-label="Owner" />,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: testState.toast }),
}));

import RRQueueDetailsPage from "../app/(dashboard)/setup/customization/rrqueues/[id]/page";

const queue = {
  id: "queue-1",
  name: "Website Queue",
  projectId: "project-1",
  project: { id: "project-1", name: "North Tower" },
  active: true,
  leadStatus: [],
  leadSource: [],
  owner: null,
  ownerId: null,
  noOfUsers: 0,
  leadCount: 0,
  previousId: 0,
  members: [],
  history: [],
  createdAt: "2026-10-01T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  testState.getQueue.mockResolvedValue({ data: { data: queue } });
  testState.getOptions.mockResolvedValue({
    data: {
      data: {
        statuses: [{ value: "INCOMING", label: "Incoming" }],
        sources: [{ value: "WEBSITE", label: "Website" }],
        projects: [{ value: "project-1", label: "North Tower" }],
      },
    },
  });
  testState.listUsers.mockResolvedValue({ data: { data: [] } });
  testState.updateQueue.mockResolvedValue({ data: { success: true, data: queue } });
});

describe("Round Robin queue detail", () => {
  it("allows editing the displayed Lead Status field and saves it to the queue API", async () => {
    render(<RRQueueDetailsPage params={{ id: "queue-1" }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Lead Status" }));
    const availableStatuses = screen.getByLabelText("Lead Status available");
    fireEvent.change(availableStatuses, { target: { value: "INCOMING" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Lead Status" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(testState.updateQueue).toHaveBeenCalledWith("queue-1", expect.objectContaining({
        leadStatus: ["INCOMING"],
      }));
    });
  });
});
