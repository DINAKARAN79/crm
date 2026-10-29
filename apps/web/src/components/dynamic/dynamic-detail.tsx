"use client";

import * as React from "react";
import { RecordPageHeader } from "@/components/crm/record-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldDisplay, FieldDefinition } from "./field-renderer";
import {
  Trash2,
  FileText,
  History,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageLayout {
  name: string;
  sections: { name: string; fields: string[] }[];
}

interface DynamicDetailProps {
  objectName: string;
  objectLabel: string;
  pluralLabel: string;
  fields: FieldDefinition[];
  layout?: PageLayout;
  record: any;
  isLoading?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  canUpdate?: boolean;
  canDelete?: boolean;
  basePath?: string;
  relatedLists?: {
    name: string;
    label: string;
    objectName: string;
    foreignKey: string;
  }[];
}

export function DynamicDetail({
  objectName,
  objectLabel,
  pluralLabel,
  fields,
  layout,
  record,
  isLoading = false,
  onEdit,
  onDelete,
  canUpdate = false,
  canDelete = false,
  basePath,
  relatedLists,
}: DynamicDetailProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Record not found</p>
      </div>
    );
  }

  const displayFields = fields.filter(
    (f) =>
      f.visible &&
      !["id", "is_active", "created_by", "updated_at"].includes(f.name)
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

  const sections = parsedSections.length > 0 ? parsedSections : [
    {
      name: "Details",
      fields: displayFields.filter(
        (f) =>
          !["record_number", "owner", "created_at"].includes(f.name)
      ).map((f) => f.name),
    },
    {
      name: "System Information",
      fields: ["record_number", "owner", "created_at"],
    },
  ];

  const systemFields = fields.filter(
    (f) =>
      f.isSystemField ||
      ["record_number", "owner", "created_by", "created_at", "updated_at"].includes(f.name)
  );

  const customFields = fields.filter(
    (f) =>
      !f.isSystemField &&
      !["id", "record_number", "owner", "created_by", "created_at", "updated_at", "is_active"].includes(f.name)
  );

  const getFieldByName = (name: string) =>
    displayFields.find((field) => field.name === name);

  const renderSection = (section: { name: string; fields: string[] }) => {
    const sectionFields = section.fields
      .map(getFieldByName)
      .filter((f): f is FieldDefinition => !!f && !f.isSystemField);

    if (sectionFields.length === 0) return null;

    return (
      <Card key={section.name}>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {section.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-x-8 md:grid-cols-2">
            {sectionFields.map((field) => (
              <div
                key={field.id}
                className={`flex min-w-0 items-start justify-between gap-3 border-b py-2 ${
                  field.fieldType === "longText" || field.fieldType === "richText"
                    ? "md:col-span-2"
                    : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <FieldDisplay
                    field={field}
                    value={record.data?.[field.name] ?? record[field.name]}
                  />
                </div>
                {canUpdate && onEdit && field.editable !== false && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                    aria-label={`Edit ${field.label}`}
                    onClick={onEdit}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const recordTitle =
    record.data?.name ||
    record.data?.title ||
    record.data?.label ||
    record.recordNumber ||
    record.id;

  return (
    <div className="space-y-4">
      <RecordPageHeader
        objectLabel={objectLabel}
        title={String(recordTitle)}
        subtitle={record.recordNumber || record.data?.recordNumber}
        backHref={basePath}
        actions={
          <>
            {canUpdate && <Button variant="outline" onClick={onEdit}>Edit</Button>}
            {canDelete && (
              <Button variant="destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          {relatedLists && relatedLists.length > 0 && (
            <TabsTrigger value="related" className="gap-2">
              <History className="h-4 w-4" />
              Related
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          {sections.map((section) => renderSection(section))}
        </TabsContent>

        {relatedLists && relatedLists.length > 0 && (
          <TabsContent value="related" className="space-y-6">
            {relatedLists.map((rl) => (
              <Card key={rl.name}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    {rl.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Related records will be displayed here
                  </p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}