"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { DynamicDetail } from "@/components/dynamic/dynamic-detail";
import { useAuth } from "@/contexts/auth-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

export default function ObjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const objectName = params.objectName as string;
  const recordId = params.id as string;

  const [metadata, setMetadata] = React.useState<ObjectMetadata | null>(null);
  const [record, setRecord] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRecordLoading, setIsRecordLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [recordError, setRecordError] = React.useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

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
    setLoadError(null);
    try {
      const res = await objectManagerApi.getObject(objectName);
      setMetadata(res.data.data);
    } catch (error) {
      console.error("Failed to load object metadata:", error);
      setLoadError(error instanceof Error ? error.message : "Object metadata could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecord = async () => {
    setIsRecordLoading(true);
    setRecordError(null);
    try {
      const res = await dynamicRecordApi.get(objectName, recordId);
      setRecord(res.data.data);
    } catch (error) {
      console.error("Failed to load record:", error);
      setRecord(null);
      setRecordError(error instanceof Error ? error.message : "Record could not be loaded.");
    } finally {
      setIsRecordLoading(false);
    }
  };

  const handleEdit = () => {
    router.push(`/objects/${objectName}/${recordId}/edit`);
  };

  const handleDelete = async () => {
    await dynamicRecordApi.delete(objectName, recordId);
    setShowDeleteDialog(false);
    router.push(`/objects/${objectName}`);
  };

  if (isLoading) {
    return (
      <DynamicDetail
        objectName={objectName}
        objectLabel={objectName}
        pluralLabel={objectName}
        fields={[]}
        record={null}
        isLoading={true}
      />
    );
  }

  if (!metadata) {
    return <p role="alert" className="py-8 text-center text-sm text-destructive">{loadError || "Object metadata could not be loaded."}</p>;
  }

  return (
    <>
      {recordError && <p role="alert" className="text-sm text-destructive">{recordError}</p>}
      <DynamicDetail
        objectName={metadata.name}
        objectLabel={metadata.label}
        pluralLabel={metadata.pluralLabel}
        fields={metadata.fields}
        layout={metadata.layouts?.[0]}
        record={record}
        isLoading={isRecordLoading}
        onEdit={handleEdit}
        onDelete={() => setShowDeleteDialog(true)}
        canUpdate={hasPermission(metadata.name, "edit")}
        canDelete={hasPermission(metadata.name, "delete")}
        basePath={`/objects/${objectName}`}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}