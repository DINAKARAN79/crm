import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

const testState = vi.hoisted(() => ({
  leadGet: vi.fn(),
  pushToSVC: vi.fn(),
  updateLead: vi.fn(),
  scheduleSiteVisit: vi.fn(),
  projectList: vi.fn(),
  layout: null as any,
  fieldList: [] as any[],
  getActivityHistory: vi.fn(),
  getAuditHistory: vi.fn(),
  getNotes: vi.fn(),
  profile: { name: "Presales" },
  leadUpdatePermission: true,
  effectivePermissions: [] as string[],
  toast: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "lead-1" }),
  useRouter: () => testState.router,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    profile: testState.profile,
    user: { id: "presales-1" },
    isLoading: false,
    isAdmin: false,
    isSuperAdmin: false,
    hasPermission: (_objectName: string, action?: string) => action !== "edit" || testState.leadUpdatePermission,
    hasEffectivePermission: (permission: string) => testState.effectivePermissions.includes(permission),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: testState.toast }),
}));

vi.mock("@/lib/api", () => ({
  leadApi: {
    get: testState.leadGet,
    pushToSVC: testState.pushToSVC,
    update: testState.updateLead,
    scheduleSiteVisit: testState.scheduleSiteVisit,
    getActivityHistory: testState.getActivityHistory,
    getAuditHistory: testState.getAuditHistory,
  },
  objectManagerApi: {
    getDefaultLayout: vi.fn().mockImplementation(() => Promise.resolve({ data: { data: testState.layout } })),
    listFields: vi.fn().mockImplementation(() => Promise.resolve({ data: { data: testState.fieldList } })),
  },
  projectApi: { listAll: testState.projectList },
  unitApi: { list: vi.fn() },
  siteVisitApi: {},
  notesApi: { get: testState.getNotes },
  activityApi: {},
  taskApi: {},
  followUpApi: {},
}));

vi.mock("@/components/admin/layout-driven-form", () => ({
  default: (props: any) => {
    const customField = props.fields?.find((field: any) => field.name === "sf_Area_preferred_to_buy_a_plot__c");
    const projectEditButton = React.createElement(
      "button",
      { type: "button", onClick: () => props.onBeginEdit?.("projectId") },
      "Edit Project",
    );
    if (!customField) return projectEditButton;
    const fieldName = customField.name;
    return React.createElement(
      "div",
      null,
      projectEditButton,
      React.createElement("span", null, String(props.data[fieldName] ?? "")),
      React.createElement("button", { type: "button", onClick: () => props.onBeginEdit(fieldName) }, "Edit Area"),
      props.editingField === fieldName
        ? React.createElement(
            "div",
            null,
            React.createElement("input", {
              "aria-label": customField.label,
              value: props.data[fieldName] ?? "",
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => props.onChange(fieldName, event.target.value),
            }),
            React.createElement("button", { type: "button", onClick: props.onSaveField }, "Save Area"),
          )
        : null,
    );
  },
}));

import LeadDetailPage from "../app/(dashboard)/leads/[id]/page";

const incomingLead = {
  id: "lead-1",
  leadNumber: "L-001",
  firstName: "Taylor",
  lastName: "Customer",
  phone: "555-0100",
  company: "Customer Co",
  projectId: "project-1",
  project: { id: "project-1", name: "North Tower" },
  customFields: {},
  status: "INCOMING",
  ownerId: "presales-1",
  owner: { id: "presales-1", firstName: "Pre", lastName: "Sales" },
  siteVisits: [],
  activities: [],
  tasks: [],
  followUps: [],
  auditLogs: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  testState.profile.name = "Presales";
  testState.leadUpdatePermission = true;
  testState.effectivePermissions = [];
  testState.layout = { sections: [] };
  testState.fieldList = [];
  testState.projectList.mockResolvedValue([
    { id: "project-1", name: "North Tower", isActive: true },
  ]);
  testState.getActivityHistory.mockResolvedValue({ data: { success: true, data: [] } });
  testState.getAuditHistory.mockResolvedValue({ data: { success: true, data: [] } });
  testState.getNotes.mockResolvedValue({ data: { success: true, data: { notes: "" } } });
  testState.leadGet
    .mockResolvedValueOnce({ data: { success: true, data: incomingLead } })
    .mockRejectedValue({ response: { status: 403, data: { error: "You do not have access to this lead" } } });
});

async function fillProspectForm() {
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Project Interested *" })).toBeEnabled());
  fireEvent.click(screen.getByRole("combobox", { name: "Project Interested *" }));
  fireEvent.click(await screen.findByRole("option", { name: "North Tower" }));
  fireEvent.change(screen.getByLabelText("Call Summary/Remarks *"), {
    target: { value: "Customer is interested in a family home" },
  });

  fireEvent.click(screen.getByRole("combobox", { name: "Minimum Budget *" }));
  fireEvent.click(await screen.findByRole("option", { name: "50 lakhs" }));
  fireEvent.click(screen.getByRole("combobox", { name: "Maximum Budget *" }));
  fireEvent.click(await screen.findByRole("option", { name: "1 crore" }));
  fireEvent.click(screen.getByRole("button", { name: "3 BHK" }));
  fireEvent.click(screen.getByRole("button", { name: "Apartment" }));
}

describe("Push to SVC", () => {
  it("shows SVC scheduling action with site-visit permission alone", async () => {
    testState.profile.name = "SVC";
    testState.leadUpdatePermission = false;
    testState.effectivePermissions = ["SITE_VISIT_CREATE"];
    testState.leadGet.mockReset();
    testState.leadGet.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          ...incomingLead,
          status: "PROSPECT",
          ownerId: "svc-1",
          owner: { id: "svc-1", firstName: "SVC", lastName: "Coordinator" },
        },
      },
    });

    render(<LeadDetailPage />);

    expect(await screen.findByRole("button", { name: "Schedule Site Visit" })).toBeInTheDocument();
  });

  it("shows success and updates local owner/status without refetching inaccessible Lead data", async () => {
    testState.leadGet.mockReset().mockResolvedValueOnce({
      data: { success: true, data: incomingLead },
    });
    testState.pushToSVC.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...incomingLead,
          status: "PROSPECT",
          ownerId: "svc-1",
          owner: { id: "svc-1", firstName: "Sam", lastName: "Coordinator" },
        },
      },
    });

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Push to SVC" }));
    await fillProspectForm();
    fireEvent.click(screen.getByRole("button", { name: "Save & Push to SVC" }));

    await waitFor(() => {
      expect(testState.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Success",
          description: "Lead pushed to SVC successfully.",
        }),
      );
    });

    expect(testState.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Error" }),
    );
    expect(testState.leadGet).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText("Prospect")).length).toBeGreaterThan(0);
    expect(screen.getByText("Sam Coordinator")).toBeInTheDocument();
  });

  it("saves edited Lead Information through the lead update API before pushing", async () => {
    testState.updateLead.mockResolvedValue({
      data: {
        success: true,
        data: { ...incomingLead, lastName: "Updated", phone: "555-0101" },
      },
    });
    testState.pushToSVC.mockResolvedValue({
      data: { success: true, data: { ...incomingLead, lastName: "Updated", status: "PROSPECT" } },
    });

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Push to SVC" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Last Name *"), { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(testState.updateLead).toHaveBeenCalledWith("lead-1", expect.objectContaining({
        lastName: "Updated",
        projectId: "project-1",
      }));
      expect(testState.toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "Success",
        description: "Lead information updated successfully.",
      }));
    });

    await fillProspectForm();
    fireEvent.click(screen.getByRole("button", { name: "Save & Push to SVC" }));
    await waitFor(() => expect(testState.pushToSVC).toHaveBeenCalledWith("lead-1", {
      reason: "Customer is interested in a family home",
      projectId: "project-1",
      prospectDetails: {
        callSummaryRemarks: "Customer is interested in a family home",
        minimumBudget: "50 lakhs",
        maximumBudget: "1 crore",
        bedroomPreference: ["3 BHK"],
        propertyType: ["Apartment"],
      },
    }));
    expect(testState.updateLead.mock.invocationCallOrder[0]).toBeLessThan(testState.pushToSVC.mock.invocationCallOrder[0]);
  });

  it("saves imported custom fields through the customFields API payload", async () => {
    const fieldName = "sf_Area_preferred_to_buy_a_plot__c";
    const leadWithCustomField = {
      ...incomingLead,
      customFields: { [fieldName]: "Coastal" },
    };
    testState.layout = { sections: [] };
    testState.fieldList = [{
      name: fieldName,
      label: "Preferred Area",
      editable: true,
      isStandardField: false,
      isSystemField: false,
      fieldType: "text",
    }];
    testState.leadGet
      .mockReset()
      .mockResolvedValueOnce({ data: { success: true, data: leadWithCustomField } })
      .mockResolvedValue({ data: { success: true, data: leadWithCustomField } });
    testState.updateLead.mockResolvedValue({
      data: {
        success: true,
        data: { ...leadWithCustomField, customFields: { [fieldName]: "Mountain" } },
      },
    });

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Area" }));
    fireEvent.change(screen.getByLabelText("Preferred Area"), { target: { value: "Mountain" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Area" }));

    await waitFor(() => {
      expect(testState.updateLead).toHaveBeenCalledWith("lead-1", {
        customFields: { [fieldName]: "Mountain" },
      });
    });
  });

  it("loads project choices when opening the inline Project editor", async () => {
    testState.layout = { sections: [] };
    testState.projectList.mockResolvedValue([
      { id: "project-2", name: "DCT Heights", isActive: true },
    ]);

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Project" }));

    await waitFor(() => {
      expect(testState.projectList).toHaveBeenCalledWith({ isActive: true });
    });
  });

  it("keeps genuine Push API failures visible as errors", async () => {
    testState.leadGet.mockReset().mockResolvedValueOnce({
      data: { success: true, data: incomingLead },
    });
    testState.pushToSVC.mockRejectedValue({
      response: { data: { error: "No active SVC Round Robin members configured" } },
    });

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Push to SVC" }));
    await fillProspectForm();
    fireEvent.click(screen.getByRole("button", { name: "Save & Push to SVC" }));

    await waitFor(() => {
      expect(testState.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "No active SVC Round Robin members configured",
        }),
      );
    });
    expect(testState.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Success" }),
    );
    expect(testState.leadGet).toHaveBeenCalledTimes(1);
  });
});

describe("Presales site visit create", () => {
  it("shows Schedule Site Visit on a prospect lead", async () => {
    testState.profile.name = "pre sales";
    testState.leadUpdatePermission = true;
    testState.effectivePermissions = ["SITE_VISIT_CREATE", "LEAD_UPDATE"];
    testState.leadGet.mockReset().mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          ...incomingLead,
          status: "PROSPECT",
        },
      },
    });

    render(<LeadDetailPage />);

    expect(await screen.findByRole("button", { name: "Schedule Site Visit" })).toBeInTheDocument();
  });

  it("shows the site visit create option on an incoming lead", async () => {
    testState.profile.name = "Presales";
    testState.leadGet.mockReset().mockResolvedValueOnce({
      data: { success: true, data: incomingLead },
    });

    render(<LeadDetailPage />);

    expect(await screen.findByRole("button", { name: "Schedule Site Visit" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Site Visit/i })).toBeInTheDocument();
  });
});

describe("SVC Site Visit project selection", () => {
  const prospectLead = {
    ...incomingLead,
    status: "PROSPECT",
    ownerId: "svc-1",
    owner: { id: "svc-1", firstName: "Sam", lastName: "Coordinator" },
  };

  beforeEach(() => {
    testState.profile.name = "SVC";
    testState.leadGet.mockReset().mockResolvedValueOnce({
      data: { success: true, data: prospectLead },
    });
  });

  it("loads active tenant project choices once and updates the page from schedule success", async () => {
    const project = { id: "project-1", name: "North Tower", isActive: true };
    // projectApi.listAll() resolves to a flat, de-duplicable array of projects.
    testState.projectList.mockResolvedValue([project, project]);
    testState.scheduleSiteVisit.mockResolvedValue({
      data: {
        success: true,
        data: {
          lead: {
            ...prospectLead,
            status: "SITE_VISIT_SCHEDULED",
            owner: { id: "sales-1", firstName: "Sal", lastName: "Executive" },
          },
          siteVisit: {
            id: "visit-1",
            projectId: "project-1",
            project,
            status: "SCHEDULED",
            scheduledAt: "2026-10-01T09:00:00.000Z",
          },
        },
      },
    });

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Schedule Site Visit" }));
    expect(testState.projectList).toHaveBeenCalledWith({ isActive: true });

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Project Interested *" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Project Interested *" }));
    fireEvent.click(await screen.findByRole("option", { name: "North Tower" }));
    expect(screen.getByRole("combobox", { name: "Project Interested *" })).toHaveTextContent("North Tower");

    fireEvent.click(screen.getByRole("combobox", { name: "Site Visit Type *" }));
    fireEvent.click(await screen.findByRole("option", { name: "Site Visit" }));
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2027-06-15" },
    });
    fireEvent.change(screen.getByLabelText("Time"), {
      target: { value: "14:30" },
    });
    fireEvent.change(screen.getByLabelText("Call Summary/Remarks"), {
      target: { value: "Customer requested a site visit" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Minimum Budget *" }));
    fireEvent.click(await screen.findByRole("option", { name: "20 lakhs" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Maximum Budget *" }));
    fireEvent.click(await screen.findByRole("option", { name: "30 lakhs" }));
    fireEvent.change(screen.getByRole("listbox", { name: "Property Type * available" }), {
      target: { value: "Apartment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Property Type *" }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule Visit" }));

    await waitFor(() => {
      expect(testState.scheduleSiteVisit).toHaveBeenCalledWith(
        "lead-1",
        expect.objectContaining({
          projectId: "project-1",
          visitType: "Site Visit",
          callSummaryRemarks: "Customer requested a site visit",
          minimumBudget: "20 lakhs",
          maximumBudget: "30 lakhs",
          propertyType: ["Apartment"],
          bedroomPreference: [],
          rating: null,
          transport: null,
        }),
      );
      expect(testState.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Success",
          description: "Site visit scheduled successfully.",
        }),
      );
    });

    expect(testState.projectList).toHaveBeenCalledTimes(1);
    expect(testState.leadGet).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText("Site Visit Scheduled")).length).toBeGreaterThan(0);
    expect(screen.getByText("Sal Executive")).toBeInTheDocument();
  });

  it("shows project-load errors inline and retries without an unhandled rejection", async () => {
    testState.projectList
      .mockRejectedValueOnce({
        response: { data: { error: "Insufficient permissions for Project:read" } },
      })
      .mockResolvedValueOnce([]);

    render(<LeadDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Schedule Site Visit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient permissions for Project:read");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No projects available for this company.")).toBeInTheDocument();
    expect(testState.projectList).toHaveBeenCalledTimes(2);
    expect(testState.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Error" }),
    );
  });
});