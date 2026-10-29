"use client";

import * as React from "react";
import {
  crmDateTimeInputValue,
  crmLocalDateTimeToDate,
  PROSPECT_BEDROOM_OPTIONS,
  PROSPECT_BUDGET_OPTIONS,
  PROSPECT_PROPERTY_TYPE_OPTIONS,
  SITE_VISIT_FUTURE_TIME_ERROR,
  SITE_VISIT_RATING_OPTIONS,
  SITE_VISIT_TRANSPORT_OPTIONS,
  SITE_VISIT_TYPE_OPTIONS,
} from "@dct-crm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface SiteVisitScheduleFormValue {
  projectId: string;
  date: string;
  time: string;
  visitType: string;
  rating: string;
  transport: string;
  callSummaryRemarks: string;
  minimumBudget: string;
  maximumBudget: string;
  propertyType: string[];
  bedroomPreference: string[];
}

interface SiteVisitScheduleFieldsProps {
  idPrefix: string;
  value: SiteVisitScheduleFormValue;
  onChange: (value: SiteVisitScheduleFormValue) => void;
  projects: Array<{ id: string; name: string }>;
  projectsLoading?: boolean;
  projectsError?: string | null;
  onRetryProjects?: () => void;
}

function MultiSelectField({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [availableSelection, setAvailableSelection] = React.useState<string[]>([]);
  const [chosenSelection, setChosenSelection] = React.useState<string[]>([]);
  const available = options.filter((option) => !value.includes(option));

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-available`}>{label}</Label>
      <div className="crm-shuttle">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Available</span>
          <select
            id={`${id}-available`}
            aria-label={`${label} available`}
            multiple
            size={5}
            value={availableSelection}
            onChange={(event) => setAvailableSelection(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
            className="w-full rounded-md border bg-background p-2 text-sm"
          >
            {available.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div className="crm-shuttle-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Add ${label}`}
            disabled={!availableSelection.length}
            onClick={() => {
              onChange([...value, ...availableSelection.filter((option) => !value.includes(option))]);
              setAvailableSelection([]);
            }}
          >
            ›
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Remove ${label}`}
            disabled={!chosenSelection.length}
            onClick={() => {
              onChange(value.filter((option) => !chosenSelection.includes(option)));
              setChosenSelection([]);
            }}
          >
            ‹
          </Button>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Chosen</span>
          <select
            id={`${id}-chosen`}
            aria-label={`${label} chosen`}
            multiple
            size={5}
            value={chosenSelection}
            onChange={(event) => setChosenSelection(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
            className="w-full rounded-md border bg-background p-2 text-sm"
          >
            {value.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

export function SiteVisitScheduleFields({
  idPrefix,
  value,
  onChange,
  projects,
  projectsLoading = false,
  projectsError,
  onRetryProjects,
}: SiteVisitScheduleFieldsProps) {
  const update = <K extends keyof SiteVisitScheduleFormValue>(
    field: K,
    fieldValue: SiteVisitScheduleFormValue[K],
  ) => onChange({ ...value, [field]: fieldValue });
  const earliestValue = crmDateTimeInputValue(new Date(Date.now() + 60_000));
  const minDate = earliestValue.slice(0, 10);
  const minTime = value.date === minDate ? earliestValue.slice(11, 16) : undefined;
  const scheduleTimeError = value.date && value.time && !siteVisitScheduleIsFuture(value)
    ? SITE_VISIT_FUTURE_TIME_ERROR
    : "";

  return (
    <div className="crm-form-grid py-2 [&_legend]:font-semibold [&_legend]:text-[#1479a8] [&_select]:border-sky-200 [&_select]:bg-white [&_span.text-xs]:text-[#1479a8]">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-project`}>Project Interested <span className="text-destructive">*</span></Label>
          <Select value={value.projectId} onValueChange={(projectId) => update("projectId", projectId)}>
            <SelectTrigger id={`${idPrefix}-project`} disabled={projectsLoading || Boolean(projectsError) || projects.length === 0}>
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {projectsLoading && <p role="status" className="text-sm text-muted-foreground">Loading projects...</p>}
          {projectsError && (
            <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive">
              <span>{projectsError}</span>
              {onRetryProjects && <Button type="button" variant="outline" size="sm" onClick={onRetryProjects}>Retry</Button>}
            </div>
          )}
          {!projectsLoading && !projectsError && projects.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">No projects available for this company.</p>
          )}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Site Visit Date <span className="text-destructive">*</span></legend>
          <div className="crm-pair">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-date`}>Date</Label>
              <Input
                id={`${idPrefix}-date`}
                type="date"
                min={minDate}
                value={value.date}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  const earliest = crmDateTimeInputValue(new Date(Date.now() + 60_000));
                  const nextTime = nextDate === earliest.slice(0, 10) && value.time && value.time < earliest.slice(11, 16)
                    ? ""
                    : value.time;
                  onChange({ ...value, date: nextDate, time: nextTime });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-time`}>Time</Label>
              <Input
                id={`${idPrefix}-time`}
                type="time"
                min={minTime}
                value={value.time}
                onChange={(event) => update("time", event.target.value)}
              />
            </div>
          </div>
          {scheduleTimeError ? (
            <p className="text-xs text-destructive">{scheduleTimeError}</p>
          ) : (
            <p className="text-xs text-[#1479a8]">Only a future date and time can be scheduled.</p>
          )}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-type`}>Site Visit Type <span className="text-destructive">*</span></Label>
          <Select value={value.visitType} onValueChange={(visitType) => update("visitType", visitType)}>
            <SelectTrigger id={`${idPrefix}-type`}><SelectValue placeholder="Select site visit type" /></SelectTrigger>
            <SelectContent>
              {SITE_VISIT_TYPE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-minimum-budget`}>Minimum Budget <span className="text-destructive">*</span></Label>
          <Select value={value.minimumBudget} onValueChange={(budget) => update("minimumBudget", budget)}>
            <SelectTrigger id={`${idPrefix}-minimum-budget`}><SelectValue placeholder="Select minimum budget" /></SelectTrigger>
            <SelectContent>
              {PROSPECT_BUDGET_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <MultiSelectField
          id={`${idPrefix}-property-type`}
          label="Property Type *"
          options={PROSPECT_PROPERTY_TYPE_OPTIONS}
          value={value.propertyType}
          onChange={(options) => update("propertyType", options)}
        />
      </div>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-call-summary`}>Call Summary/Remarks</Label>
          <Textarea
            id={`${idPrefix}-call-summary`}
            value={value.callSummaryRemarks}
            onChange={(event) => update("callSummaryRemarks", event.target.value)}
            maxLength={5000}
            rows={4}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-rating`}>Rating</Label>
          <Select value={value.rating} onValueChange={(rating) => update("rating", rating)}>
            <SelectTrigger id={`${idPrefix}-rating`}><SelectValue placeholder="Select rating" /></SelectTrigger>
            <SelectContent>
              {SITE_VISIT_RATING_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-transport`}>Transport Arrangement</Label>
          <Select value={value.transport} onValueChange={(transport) => update("transport", transport)}>
            <SelectTrigger id={`${idPrefix}-transport`}><SelectValue placeholder="Select transport" /></SelectTrigger>
            <SelectContent>
              {SITE_VISIT_TRANSPORT_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-maximum-budget`}>Maximum Budget <span className="text-destructive">*</span></Label>
          <Select value={value.maximumBudget} onValueChange={(budget) => update("maximumBudget", budget)}>
            <SelectTrigger id={`${idPrefix}-maximum-budget`}><SelectValue placeholder="Select maximum budget" /></SelectTrigger>
            <SelectContent>
              {PROSPECT_BUDGET_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <MultiSelectField
          id={`${idPrefix}-bedroom-preference`}
          label="Bedroom Preference"
          options={PROSPECT_BEDROOM_OPTIONS}
          value={value.bedroomPreference}
          onChange={(options) => update("bedroomPreference", options)}
        />
      </div>
    </div>
  );
}

export const emptySiteVisitScheduleFormValue = (): SiteVisitScheduleFormValue => ({
  projectId: "",
  date: "",
  time: "",
  visitType: "",
  rating: "",
  transport: "",
  callSummaryRemarks: "",
  minimumBudget: "",
  maximumBudget: "",
  propertyType: [],
  bedroomPreference: [],
});

export function siteVisitScheduleIsFuture(value: Pick<SiteVisitScheduleFormValue, "date" | "time">, now = new Date()) {
  if (!value.date || !value.time) return false;
  try {
    return crmLocalDateTimeToDate(value.date, value.time).getTime() > now.getTime();
  } catch {
    return false;
  }
}
