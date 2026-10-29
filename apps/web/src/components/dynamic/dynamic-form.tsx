"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FieldRenderer, FieldDefinition } from "./field-renderer";
import { Save, X } from "lucide-react";

interface DynamicFormProps {
  fields: FieldDefinition[];
  layout?: {
    name: string;
    sections: { name: string; fields: string[] }[];
  };
  initialData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  title?: string;
  submitLabel?: string;
  lookupSearchFn?: (fieldName: string, query: string) => Promise<{ id: string; label: string }[]>;
}

export function DynamicForm({
  fields,
  layout,
  initialData = {},
  onSubmit,
  onCancel,
  isLoading = false,
  title = "Record",
  submitLabel = "Save",
  lookupSearchFn,
}: DynamicFormProps) {
  const [formData, setFormData] = React.useState<Record<string, any>>(
    JSON.parse(JSON.stringify(initialData))
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    setFormData(JSON.parse(JSON.stringify(initialData)));
  }, [initialData]);

  const editableFields = fields.filter(
    (f) => f.editable !== false && !f.isSystemField && f.name !== "id" && f.name !== "record_number" && f.name !== "created_by" && f.name !== "created_at" && f.name !== "updated_at" && f.name !== "is_active"
  );

  let parsedSections: { name: string; fields: string[] }[] = [];
  if (layout?.sections) {
    if (Array.isArray(layout.sections)) {
      parsedSections = layout.sections;
    } else if (typeof layout.sections === "string") {
      try {
        const parsed = JSON.parse(layout.sections);
        if (Array.isArray(parsed)) {
          parsedSections = parsed;
        }
      } catch (e) {
        console.warn("Failed to parse layout sections:", e);
      }
    }
  }

  const fieldNamesInLayout = new Set(parsedSections.flatMap((s) => s.fields));
  const missingEditable = editableFields.filter((f) => !fieldNamesInLayout.has(f.name));

  if (parsedSections.length > 0 && missingEditable.length > 0) {
    parsedSections = [
      ...parsedSections,
      { name: "Additional Fields", fields: missingEditable.map((f) => f.name) },
    ];
  }

  const sections = parsedSections.length > 0
    ? parsedSections
    : [{ name: "Details", fields: editableFields.map((f) => f.name) }];

  const handleChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
    if (errors[fieldName]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const field of editableFields) {
      const value = formData[field.name];
      if (field.required && (value === undefined || value === null || value === "")) {
        newErrors[field.name] = `${field.label} is required`;
        continue;
      }

      if (value !== undefined && value !== null && value !== "") {
        let hasTypeError = false;
        switch (field.fieldType) {
          case "email":
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
              newErrors[field.name] = `${field.label} must be a valid email`;
              hasTypeError = true;
            }
            break;
          case "phone":
            if (!/^[\d\s\-+()]+$/.test(String(value))) {
              newErrors[field.name] = `${field.label} must be a valid phone number`;
              hasTypeError = true;
            }
            break;
          case "url":
            try {
              new URL(String(value));
            } catch {
              newErrors[field.name] = `${field.label} must be a valid URL`;
              hasTypeError = true;
            }
            break;
          case "number":
          case "integer":
          case "decimal":
          case "currency":
          case "percentage":
            if (isNaN(Number(value))) {
              newErrors[field.name] = `${field.label} must be a valid number`;
              hasTypeError = true;
            }
            break;
        }

        if (!hasTypeError && field.validationRules && typeof field.validationRules === "object") {
          const rules = field.validationRules as any;
          if (rules.minLength && String(value).length < rules.minLength) {
            newErrors[field.name] = `${field.label} must be at least ${rules.minLength} characters`;
          }
          if (rules.maxLength && String(value).length > rules.maxLength) {
            newErrors[field.name] = `${field.label} must be at most ${rules.maxLength} characters`;
          }
          if (rules.min !== undefined && Number(value) < rules.min) {
            newErrors[field.name] = `${field.label} must be at least ${rules.min}`;
          }
          if (rules.max !== undefined && Number(value) > rules.max) {
            newErrors[field.name] = `${field.label} must be at most ${rules.max}`;
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors((prev) => {
      const next = { ...prev };
      delete next._submit;
      return next;
    });
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (error: any) {
      if (error.message) {
        setErrors({ _submit: error.message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldByName = (name: string) =>
    fields.find((f) => f.name === name);

  const renderSection = (section: { name: string; fields: string[] }) => {
    const sectionFields = section.fields
      .map(getFieldByName)
      .filter((f): f is FieldDefinition => !!f && !f.isSystemField && f.editable !== false);

    if (sectionFields.length === 0) return null;

    return (
      <div key={section.name} className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          {section.name}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {sectionFields.map((field) => (
            <div
              key={field.id}
              className={
                field.fieldType === "longText" ? "md:col-span-2" : ""
              }
            >
              <FieldRenderer
                field={field}
                value={formData[field.name]}
                onChange={(val) => handleChange(field.name, val)}
                error={errors[field.name]}
                lookupSearchFn={
                  lookupSearchFn
                    ? (query) => lookupSearchFn(field.name, query)
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors._submit && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
          {errors._submit}
        </div>
      )}

      {sections.map((section, index) => (
        <React.Fragment key={section.name}>
          {renderSection(section)}
          {index < sections.length - 1 && <Separator />}
        </React.Fragment>
      ))}

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || isLoading}>
          <Save className="mr-2 h-4 w-4" />
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
