"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { leadApi, projectApi, siteVisitApi, taskApi, unitApi, userApi } from "@/lib/api";

type WhatIdType = "SiteVisit" | "Project" | "Unit";
type SelectOption = { id: string; label: string };
type TaskFormValues = {
  subject: string;
  description: string;
  dueDate: string;
  completedAt: string;
  ownerId: string;
  leadId: string;
  whatIdType: WhatIdType | "";
  whatId: string;
  status: string;
  priority: string;
  salesforceStatus: string;
  salesforcePriority: string;
  callDurationInSeconds: string;
  callObject: string;
  callDisposition: string;
  callType: string;
  isRecurrence: boolean;
  recurrenceInterval: string;
  email: string;
  phone: string;
  isVisibleInSelfService: boolean;
  isReminderSet: boolean;
  recurrenceRegeneratedType: string;
  taskSubtype: string;
  taskType: string;
};

const relatedToFields: Record<WhatIdType, string> = {
  SiteVisit: "siteVisitId",
  Project: "projectId",
  Unit: "unitId",
};

const emptyValues: TaskFormValues = {
  subject: "",
  description: "",
  dueDate: "",
  completedAt: "",
  ownerId: "",
  leadId: "",
  whatIdType: "",
  whatId: "",
  status: "PENDING",
  priority: "MEDIUM",
  salesforceStatus: "",
  salesforcePriority: "",
  callDurationInSeconds: "",
  callObject: "",
  callDisposition: "",
  callType: "",
  isRecurrence: false,
  recurrenceInterval: "",
  email: "",
  phone: "",
  isVisibleInSelfService: false,
  isReminderSet: false,
  recurrenceRegeneratedType: "",
  taskSubtype: "",
  taskType: "",
};

function responseRows(response: any): any[] {
  if (Array.isArray(response)) return response;
  const body = response?.data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function fullName(record: any): string {
  return [record.firstName, record.lastName].filter(Boolean).join(" ").trim();
}

function optionFor(type: string, record: any): SelectOption {
  const label = type === "Lead"
    ? fullName(record) || record.phone || record.id
    : type === "SiteVisit"
      ? record.siteVisitNumber || record.name || record.id
      : type === "Project"
        ? record.name || record.id
        : type === "Unit"
          ? [record.number, record.project?.name].filter(Boolean).join(" - ") || record.id
          : fullName(record) || record.email || record.id;
  return { id: record.id, label };
}

function initialWhatId(task: any): { type: WhatIdType | ""; id: string; label: string } {
  const related: Array<[WhatIdType, any]> = [
    ["SiteVisit", task.siteVisit],
    ["Project", task.project],
    ["Unit", task.unit],
  ];
  const match = related.find(([, record]) => record);
  if (!match) return { type: "", id: "", label: "" };
  const [type, record] = match;
  return { type, id: record.id, label: optionFor(type, record).label };
}

export function TaskForm({ editing = false }: { editing?: boolean }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const taskId = editing ? params.id : undefined;
  const [values, setValues] = React.useState<TaskFormValues>({
    ...emptyValues,
    ownerId: user?.id || "",
  });
  const [whoOptions, setWhoOptions] = React.useState<SelectOption[]>([]);
  const [whatOptions, setWhatOptions] = React.useState<SelectOption[]>([]);
  const [ownerOptions, setOwnerOptions] = React.useState<SelectOption[]>([]);
  const [selectedWhatLabel, setSelectedWhatLabel] = React.useState("");
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(Boolean(taskId));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (!taskId) return () => { active = false; };
    taskApi.get(taskId)
      .then((response) => {
        const task = response.data.data;
        if (!active || !task) return;
        const related = initialWhatId(task);
        setSelectedWhatLabel(related.label);
        setValues({
          ...emptyValues,
          subject: task.subject || task.title || "",
          description: task.description || "",
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "",
          completedAt: task.completedAt ? new Date(task.completedAt).toISOString().slice(0, 16) : "",
          ownerId: task.ownerId || user?.id || "",
          leadId: task.leadId || "",
          whatIdType: related.type,
          whatId: related.id,
          status: task.status || "PENDING",
          priority: task.priority || "MEDIUM",
          salesforceStatus: task.salesforceStatus || "",
          salesforcePriority: task.salesforcePriority || "",
          callDurationInSeconds: task.callDurationInSeconds == null ? "" : String(task.callDurationInSeconds),
          callObject: task.callObject || "",
          callDisposition: task.callDisposition || "",
          callType: task.callType || "",
          isRecurrence: Boolean(task.isRecurrence),
          recurrenceInterval: task.recurrenceInterval == null ? "" : String(task.recurrenceInterval),
          email: task.email || "",
          phone: task.phone || "",
          isVisibleInSelfService: Boolean(task.isVisibleInSelfService),
          isReminderSet: Boolean(task.isReminderSet),
          recurrenceRegeneratedType: task.recurrenceRegeneratedType || "",
          taskSubtype: task.taskSubtype || "",
          taskType: task.taskType || "",
        });
      })
      .catch(() => {
        if (active) toast({ title: "Error", description: "Could not load this task.", variant: "destructive" });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [taskId, toast, user?.id]);

  React.useEffect(() => {
    let active = true;
    userApi.list({ page: 1, limit: 100 })
      .then((response) => {
        if (active) setOwnerOptions(responseRows(response).map((record) => optionFor("User", record)));
      })
      .catch(() => {
        if (active) setOwnerOptions(user?.id ? [{ id: user.id, label: "Me" }] : []);
      });
    return () => { active = false; };
  }, [user?.id]);

  React.useEffect(() => {
    let active = true;
    setLookupError(null);
    if (!values.whatIdType) {
      setWhatOptions([]);
      return () => { active = false; };
    }
    const loadWhatOptions = async () => {
      try {
        let result: any;
        switch (values.whatIdType) {
          case "SiteVisit": result = await siteVisitApi.list({ page: 1, limit: 100 }); break;
          case "Project": result = await projectApi.listAll(); break;
          case "Unit": result = await unitApi.list({ page: 1, limit: 100 }); break;
        }
        if (!active) return;
        const options = responseRows(result).map((record) => optionFor(values.whatIdType!, record));
        if (values.whatId && !options.some((option) => option.id === values.whatId) && selectedWhatLabel) {
          options.unshift({ id: values.whatId, label: selectedWhatLabel });
        }
        setWhatOptions(options);
      } catch {
        if (active) {
          setWhatOptions(values.whatId && selectedWhatLabel
            ? [{ id: values.whatId, label: selectedWhatLabel }]
            : []);
          setLookupError(`Could not load ${values.whatIdType} records. Check your access and try another related-record type.`);
        }
      }
    };
    void loadWhatOptions();
    return () => { active = false; };
  }, [values.whatIdType, values.whatId, selectedWhatLabel]);

  React.useEffect(() => {
    let active = true;
    leadApi.list({ page: 1, limit: 100 })
      .then((response) => {
        if (active) setWhoOptions(responseRows(response).map((record) => optionFor("Lead", record)));
      })
      .catch(() => {
        if (active) setLookupError("Could not load Leads for the Name relationship.");
      });
    return () => { active = false; };
  }, []);

  const setValue = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values.whatIdType || !values.whatId) {
      setLookupError("Choose a supported Related To record.");
      return;
    }
    if (!values.leadId) {
      setLookupError("Choose a Lead for the Name relationship. Contact is not configured in this CRM.");
      return;
    }
    setSaving(true);
    const relatedField = relatedToFields[values.whatIdType];
    const payload = {
      title: values.subject.trim(),
      subject: values.subject.trim(),
      description: values.description,
      dueDate: values.dueDate,
      completedAt: values.completedAt ? new Date(values.completedAt).toISOString() : undefined,
      ownerId: values.ownerId || user?.id,
      leadId: values.leadId,
      siteVisitId: "",
      projectId: "",
      unitId: "",
      [relatedField]: values.whatId,
      status: values.status,
      priority: values.priority,
      salesforceStatus: values.salesforceStatus || undefined,
      salesforcePriority: values.salesforcePriority || undefined,
      callDurationInSeconds: values.callDurationInSeconds ? Number(values.callDurationInSeconds) : undefined,
      callObject: values.callObject || undefined,
      callDisposition: values.callDisposition || undefined,
      callType: values.callType || undefined,
      isRecurrence: values.isRecurrence,
      recurrenceInterval: values.recurrenceInterval ? Number(values.recurrenceInterval) : undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      isVisibleInSelfService: values.isVisibleInSelfService,
      isReminderSet: values.isReminderSet,
      recurrenceRegeneratedType: values.recurrenceRegeneratedType || undefined,
      taskSubtype: values.taskSubtype || undefined,
      taskType: values.taskType || undefined,
    };
    try {
      const response = editing
        ? await taskApi.update(taskId!, payload)
        : await taskApi.create(payload);
      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || "Task could not be saved.");
      }
      toast({ title: "Success", description: editing ? "Task updated." : "Task created." });
      router.push(`/follow-ups/${response.data.data.id}`);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Task could not be saved.";
      setLookupError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof TaskFormValues, type = "text", required = false) => (
    <label className="block space-y-1 text-sm font-medium text-[#1479a8]" key={key}>
      <span>{label}{required ? " *" : ""}</span>
      <Input
        type={type}
        value={String(values[key] ?? "")}
        required={required}
        onChange={(event) => setValue(key, event.target.value as never)}
      />
    </label>
  );

  const checkbox = (label: string, key: "isRecurrence" | "isVisibleInSelfService" | "isReminderSet") => (
    <label key={key} className="flex items-center gap-2 text-sm text-[#075d91]">
      <input
        type="checkbox"
        checked={values[key]}
        onChange={(event) => setValue(key, event.target.checked)}
      />
      {label}
    </label>
  );

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading task…</div>;

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button type="button" variant="ghost" onClick={() => router.back()} className="mb-2 -ml-3">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="text-xl font-bold tracking-tight text-[#075d91]">{editing ? "Edit Task" : "New Task"}</h1>
          <p className="text-[12px] text-[#1479a8]">Task fields mapped from the supplied Salesforce definition.</p>
        </div>
        <Button type="submit" disabled={saving} className="bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-200 hover:from-blue-700 hover:to-blue-600">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "Saving…" : "Save Task"}
        </Button>
      </div>

      <Card className="rounded-xl border-sky-100 bg-[#f5fbff] shadow-sm [&_input:not([type=checkbox])]:border-sky-200 [&_input:not([type=checkbox])]:bg-white [&_textarea]:border-sky-200 [&_textarea]:bg-white">
        <CardHeader><CardTitle className="text-base text-[#075d91]">Task details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {field("Subject", "subject", "text", true)}
          {field("Due Date", "dueDate", "date", true)}
          <label className="block space-y-1 text-sm font-medium text-[#1479a8]">
            <span>Assigned To (User)</span>
            <select className="h-9 w-full rounded-md border border-sky-200 bg-white px-3 text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" value={values.ownerId} onChange={(event) => setValue("ownerId", event.target.value)}>
              <option value={user?.id || ""}>Me</option>
              {ownerOptions.filter((option) => option.id !== user?.id).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">Calendar and Group owners are not configured in this CRM.</span>
          </label>
          <label className="block space-y-1 text-sm font-medium text-[#1479a8]">
            <span>Name (Lead)</span>
            <select className="h-9 w-full rounded-md border border-sky-200 bg-white px-3 text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" required value={values.leadId} onChange={(event) => setValue("leadId", event.target.value)}>
              <option value="">Select a Lead</option>
              {whoOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium text-[#1479a8]">
            <span>Related To type</span>
            <select
              className="h-9 w-full rounded-md border border-sky-200 bg-white px-3 text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              required
              value={values.whatIdType}
              onChange={(event) => {
                const nextType = event.target.value as WhatIdType | "";
                setSelectedWhatLabel("");
                setValues((current) => ({ ...current, whatIdType: nextType, whatId: "" }));
              }}
            >
              <option value="">Select a record type</option>
              <option value="SiteVisit">Site Visit</option>
              <option value="Project">Project</option>
              <option value="Unit">Unit</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium text-[#1479a8]">
            <span>Related To record</span>
            <select
              className="h-9 w-full rounded-md border border-sky-200 bg-white px-3 text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              required
              value={values.whatId}
              onChange={(event) => {
                const option = whatOptions.find((item) => item.id === event.target.value);
                setValue("whatId", event.target.value);
                setSelectedWhatLabel(option?.label || "");
              }}
              disabled={!values.whatIdType}
            >
              <option value="">Select a record</option>
              {whatOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            {lookupError && <span role="alert" className="text-xs text-destructive">{lookupError}</span>}
          </label>
          <label className="block space-y-1 text-sm font-medium text-[#1479a8]">
            <span>CRM Status</span>
            <select className="h-9 w-full rounded-md border border-sky-200 bg-white px-3 text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" value={values.status} onChange={(event) => setValue("status", event.target.value)}>
              <option value="PENDING">Pending</option><option value="IN_PROGRESS">In Progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          {field("Salesforce Status", "salesforceStatus")}
          <label className="block space-y-1 text-sm font-medium text-[#1479a8]">
            <span>CRM Priority</span>
            <select className="h-9 w-full rounded-md border border-sky-200 bg-white px-3 text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" value={values.priority} onChange={(event) => setValue("priority", event.target.value)}>
              <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
            </select>
          </label>
          {field("Salesforce Priority", "salesforcePriority")}
          <div className="md:col-span-2">
            <label className="block space-y-1 text-sm font-medium text-[#1479a8]">
              <span>Comments</span>
              <Textarea value={values.description} maxLength={32000} onChange={(event) => setValue("description", event.target.value)} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-sky-100 bg-[#f5fbff] shadow-sm [&_input:not([type=checkbox])]:border-sky-200 [&_input:not([type=checkbox])]:bg-white [&_textarea]:border-sky-200 [&_textarea]:bg-white">
        <CardHeader><CardTitle className="text-base text-[#075d91]">Call and contact details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {field("Call Duration (seconds)", "callDurationInSeconds", "number")}
          {field("Call Object Identifier", "callObject")}
          {field("Call Result", "callDisposition")}
          {field("Call Type", "callType")}
          {field("Completed Date/Time", "completedAt", "datetime-local")}
          {field("Email", "email", "email")}
          {field("Phone", "phone", "tel")}
          {field("Repeat This Task", "recurrenceRegeneratedType")}
          {field("Task Subtype", "taskSubtype")}
          {field("Type", "taskType")}
          <p className="md:col-span-2 text-xs text-muted-foreground">
            Salesforce picklist values were not included in the field export, so the supplied values are entered as text.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-sky-100 bg-[#f5fbff] shadow-sm [&_input:not([type=checkbox])]:border-sky-200 [&_input:not([type=checkbox])]:bg-white [&_textarea]:border-sky-200 [&_textarea]:bg-white">
        <CardHeader><CardTitle className="text-base text-[#075d91]">Recurrence, reminder, and visibility</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {field("Recurrence Interval", "recurrenceInterval", "number")}
          </div>
          <div className="flex flex-wrap gap-6">
            {checkbox("Create recurring series", "isRecurrence")}
            {checkbox("Reminder set", "isReminderSet")}
            {checkbox("Public / visible in self-service", "isVisibleInSelfService")}
          </div>
          <p className="text-xs text-muted-foreground">Recurrence and reminder preferences are stored. Automatic task generation and reminder delivery are not configured.</p>
        </CardContent>
      </Card>
    </form>
  );
}
