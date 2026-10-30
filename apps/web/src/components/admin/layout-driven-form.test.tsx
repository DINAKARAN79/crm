import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    leadStatuses: [
      { statusId: "1", status: "NEW", label: "New", enabled: true },
      { statusId: "2", status: "INCOMING", label: "Incoming", enabled: true },
    ],
    getLeadStatusLabel: (status: string) => status === "INCOMING" ? "Incoming" : "New",
  }),
}));

import LayoutDrivenForm from "./layout-driven-form";

const fields = [
  {
    name: "firstName",
    label: "First Name",
    fieldType: "text",
    required: false,
    editable: true,
    visible: true,
    isSystemField: false,
    isStandardField: true,
  },
  {
    name: "status",
    label: "Status",
    fieldType: "picklist",
    required: false,
    editable: true,
    visible: true,
    isSystemField: false,
    isStandardField: true,
    picklistValues: [
      { label: "New", value: "NEW", isActive: true },
      { label: "Incoming", value: "INCOMING", isActive: true },
    ],
  },
];

describe("LayoutDrivenForm inline lead editing", () => {
  it("only opens the selected field for editing", () => {
    const onChange = vi.fn();
    render(
      <LayoutDrivenForm
        objectName="Lead"
        mode="detail"
        editingFieldName="firstName"
        data={{ firstName: "Ada", status: "INCOMING" }}
        onChange={onChange}
        onBeginEdit={() => undefined}
        layout={{ sections: [{ name: "Lead Details", fields: ["firstName", "status"] }] }}
        fields={fields}
      />,
    );

    expect(screen.getByPlaceholderText("First Name")).toHaveValue("Ada");
    expect(screen.getByText("Incoming")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Status" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("First Name"), { target: { value: "Grace" } });
    expect(onChange).toHaveBeenCalledWith("firstName", "Grace");
    expect(onChange).not.toHaveBeenCalledWith("status", "NEW");
  });

  it("shows names on name fields and ids on id fields", () => {
    render(
      <LayoutDrivenForm
        objectName="Lead"
        mode="detail"
        data={{
          ownerId: "user-1",
          ownerName: "Svc Test3",
          owner: { id: "user-1", name: "Svc Test3" },
          rrQueueId: "queue-1",
          rrQueueName: "SVC Queue",
        }}
        layout={{ sections: [{ name: "Lead Details", fields: ["owner", "ownerId", "rrQueueName", "rrQueueId"] }] }}
        fields={[
          { name: "owner", label: "Owner", fieldType: "lookup", required: false, editable: false, visible: true },
          { name: "ownerId", label: "Owner ID", fieldType: "text", required: false, editable: false, visible: true },
          { name: "rrQueueName", label: "Round Robin Queue", fieldType: "text", required: false, editable: false, visible: true },
          { name: "rrQueueId", label: "Round Robin Queue ID", fieldType: "text", required: false, editable: false, visible: true },
        ]}
      />,
    );

    expect(screen.getByText("Svc Test3")).toBeInTheDocument();
    expect(screen.getByText("user-1")).toBeInTheDocument();
    expect(screen.getByText("SVC Queue")).toBeInTheDocument();
    expect(screen.getByText("queue-1")).toBeInTheDocument();
  });
});
