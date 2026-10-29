"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  PROSPECT_BEDROOM_OPTIONS,
  PROSPECT_BUDGET_OPTIONS,
  PROSPECT_PROPERTY_TYPE_OPTIONS,
  SITE_VISIT_RATING_OPTIONS,
} from "@dct-crm/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CompleteSiteVisitForm = {
  completedAt: string;
  rating: string;
  feedback: string;
  minimumBudget: string;
  maximumBudget: string;
  propertyType: string;
  bedroomPreference: string;
};

function localDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function emptyCompleteSiteVisitForm(current?: {
  rating?: string;
  minimumBudget?: string;
  maximumBudget?: string;
  propertyType?: string;
  bedroomPreference?: string;
}): CompleteSiteVisitForm {
  return {
    completedAt: localDateTimeValue(),
    rating: current?.rating && (SITE_VISIT_RATING_OPTIONS as readonly string[]).includes(current.rating) ? current.rating : "",
    feedback: "",
    minimumBudget: current?.minimumBudget || "",
    maximumBudget: current?.maximumBudget || "",
    propertyType: current?.propertyType || "",
    bedroomPreference: current?.bedroomPreference || "",
  };
}

export function completeSiteVisitFormError(form: CompleteSiteVisitForm, now = new Date()) {
  if (!form.completedAt) return "Completed date and time are required";
  const completedAt = new Date(form.completedAt);
  if (Number.isNaN(completedAt.getTime())) return "Completed date and time are invalid";
  if (completedAt.getTime() > now.getTime()) return "Completed date and time cannot be in the future";
  if (!(SITE_VISIT_RATING_OPTIONS as readonly string[]).includes(form.rating)) return "Rating is required";
  const feedback = form.feedback.trim();
  if (!feedback) return "Feedback is required";
  if (feedback.length > 2000) return "Feedback must be 2000 characters or fewer";
  return "";
}

function withCurrent(options: readonly string[], current: string) {
  return current && !options.includes(current) ? [current, ...options] : [...options];
}

export function CompleteSiteVisitDialog({
  open,
  form,
  saving,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  form: CompleteSiteVisitForm;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: CompleteSiteVisitForm) => void;
  onSubmit: () => void;
}) {
  const error = completeSiteVisitFormError(form);
  const maxCompletedAt = localDateTimeValue();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete Site Visit</DialogTitle>
          <DialogDescription>Record when the visit happened, the rating, and the feedback.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="complete-site-visit-at">Completed Date & Time *</Label>
            <Input
              id="complete-site-visit-at"
              type="datetime-local"
              max={maxCompletedAt}
              value={form.completedAt}
              onChange={(event) => onChange({ ...form, completedAt: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="complete-site-visit-rating">Rating *</Label>
            <Select value={form.rating} onValueChange={(rating) => onChange({ ...form, rating })}>
              <SelectTrigger id="complete-site-visit-rating"><SelectValue placeholder="Select rating" /></SelectTrigger>
              <SelectContent>
                {SITE_VISIT_RATING_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="complete-site-visit-feedback">Feedback / Remarks *</Label>
            <Textarea
              id="complete-site-visit-feedback"
              value={form.feedback}
              maxLength={2000}
              rows={4}
              onChange={(event) => onChange({ ...form, feedback: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">{form.feedback.trim().length}/2000</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="complete-site-visit-min-budget">Minimum Budget</Label>
              <Select value={form.minimumBudget} onValueChange={(minimumBudget) => onChange({ ...form, minimumBudget })}>
                <SelectTrigger id="complete-site-visit-min-budget"><SelectValue placeholder="Select budget" /></SelectTrigger>
                <SelectContent>
                  {withCurrent(PROSPECT_BUDGET_OPTIONS, form.minimumBudget).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="complete-site-visit-max-budget">Maximum Budget</Label>
              <Select value={form.maximumBudget} onValueChange={(maximumBudget) => onChange({ ...form, maximumBudget })}>
                <SelectTrigger id="complete-site-visit-max-budget"><SelectValue placeholder="Select budget" /></SelectTrigger>
                <SelectContent>
                  {withCurrent(PROSPECT_BUDGET_OPTIONS, form.maximumBudget).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="complete-site-visit-property">Property Type</Label>
              <Select value={form.propertyType} onValueChange={(propertyType) => onChange({ ...form, propertyType })}>
                <SelectTrigger id="complete-site-visit-property"><SelectValue placeholder="Select property type" /></SelectTrigger>
                <SelectContent>
                  {withCurrent(PROSPECT_PROPERTY_TYPE_OPTIONS, form.propertyType).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="complete-site-visit-bedroom">Bedroom Preference</Label>
              <Select value={form.bedroomPreference} onValueChange={(bedroomPreference) => onChange({ ...form, bedroomPreference })}>
                <SelectTrigger id="complete-site-visit-bedroom"><SelectValue placeholder="Select bedrooms" /></SelectTrigger>
                <SelectContent>
                  {withCurrent(PROSPECT_BEDROOM_OPTIONS, form.bedroomPreference).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && form.feedback.trim().length > 2000 ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={onSubmit} disabled={Boolean(error) || saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Saving..." : "Mark as Completed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
