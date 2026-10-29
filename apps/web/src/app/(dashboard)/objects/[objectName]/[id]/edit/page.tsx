"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DynamicForm } from "@/components/dynamic/dynamic-form";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { objectManagerApi, dynamicRecordApi } from "@/lib/api";
import { FieldDefinition } from "@/components/dynamic/field-renderer";

interface ObjectMetadata {
  id: string;
  name: string;
  label: string;
  pluralLabel: string;
  icon?: string;
  objectType: string;
  fields: FieldDefinition[];
  layouts: any[];
}

export default function ObjectEditPage() {
  const params = useParams();
  const router = useRouter();
  const objectName = params.objectName as string;
  const recordId = params.id as string;

  const [metadata, setMetadata] = React.useState<ObjectMetadata | null>(null);
  const [record, setRecord] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRecordLoading, setIsRecordLoading] = React.useState(true);

  React.useEffect(() => {
    loadMetadata();
  }, [objectName]);

  React.useEffect(() => {
    if (metadata) {
      loadRecord();
    }
  }, [metadata, recordId]);

  const loadMetadata = async () => {
    setIsLoading(true);
    try {
      const res = await objectManagerApi.getObject(objectName);
      setMetadata(res.data.data);
    } catch (error) {
      console.error("Failed to load object metadata:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecord = async () => {
    setIsRecordLoading(true);
    try {
      const res = await dynamicRecordApi.get(objectName, recordId);
      setRecord(res.data.data);
    } catch (error) {
      console.error("Failed to load record:", error);
    } finally {
      setIsRecordLoading(false);
    }
  };

  const handleSubmit = async (data: Record<string, any>) => {
    await dynamicRecordApi.update(objectName, recordId, data);
    router.push(`/objects/${objectName}/${recordId}`);
  };

  if (isLoading || !metadata || isRecordLoading || !record) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/objects/${objectName}/${recordId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Edit {metadata.label}</h1>
          <p className="text-muted-foreground">
            {record.recordNumber || recordId}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit {metadata.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <DynamicForm
            fields={metadata.fields}
            layout={metadata.layouts?.[0]}
            initialData={record.data}
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/objects/${objectName}/${recordId}`)}
            title={`Edit ${metadata.label}`}
            submitLabel={`Save ${metadata.label}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}