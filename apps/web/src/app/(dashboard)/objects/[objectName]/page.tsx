"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DynamicTable } from "@/components/dynamic/dynamic-table";
import { DynamicForm } from "@/components/dynamic/dynamic-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Upload, Download } from "lucide-react";
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

export default function ObjectListPage() {
  const params = useParams();
  const router = useRouter();
  const objectName = params.objectName as string;

  const [metadata, setMetadata] = React.useState<ObjectMetadata | null>(null);
  const [records, setRecords] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDataLoading, setIsDataLoading] = React.useState(true);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [showEditDialog, setShowEditDialog] = React.useState(false);
  const [editingRecord, setEditingRecord] = React.useState<any>(null);
  const [deleteRecord, setDeleteRecord] = React.useState<any>(null);
  const [permissions, setPermissions] = React.useState({
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
  });

  React.useEffect(() => {
    loadMetadata();
  }, [objectName]);

  React.useEffect(() => {
    if (metadata) {
      loadRecords();
    }
  }, [metadata, currentPage]);

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

  const loadRecords = async () => {
    setIsDataLoading(true);
    try {
      const res = await dynamicRecordApi.list(objectName, {
        page: currentPage,
        limit: 20,
      });
      setRecords(res.data.data || []);
      setTotalItems(res.data.pagination?.total || 0);
    } catch (error) {
      console.error("Failed to load records:", error);
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleCreate = async (data: Record<string, any>) => {
    await dynamicRecordApi.create(objectName, data);
    setShowCreateDialog(false);
    loadRecords();
  };

  const handleEdit = async (data: Record<string, any>) => {
    if (!editingRecord) return;
    await dynamicRecordApi.update(objectName, editingRecord.id, data);
    setShowEditDialog(false);
    setEditingRecord(null);
    loadRecords();
  };

  const handleDelete = async () => {
    if (!deleteRecord) return;
    await dynamicRecordApi.delete(objectName, deleteRecord.id);
    setDeleteRecord(null);
    loadRecords();
  };

  const handleView = (record: any) => {
    router.push(`/objects/${objectName}/${record.id}`);
  };

  const handleEditClick = (record: any) => {
    setEditingRecord(record);
    setShowEditDialog(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Object not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{metadata.pluralLabel}</h1>
          <p className="text-muted-foreground">
            Manage your {metadata.pluralLabel.toLowerCase()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          {permissions.canCreate && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add {metadata.label}
            </Button>
          )}
        </div>
      </div>

      <DynamicTable
        objectName={metadata.name}
        objectLabel={metadata.label}
        pluralLabel={metadata.pluralLabel}
        fields={metadata.fields}
        data={records}
        isLoading={isDataLoading}
        totalItems={totalItems}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onView={handleView}
        onEdit={handleEditClick}
        onDelete={setDeleteRecord}
        canCreate={permissions.canCreate}
        canUpdate={permissions.canUpdate}
        canDelete={permissions.canDelete}
        basePath={`/objects/${objectName}`}
      />

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create {metadata.label}</DialogTitle>
          </DialogHeader>
          <DynamicForm
            fields={metadata.fields}
            layout={metadata.layouts?.[0]}
            onSubmit={handleCreate}
            onCancel={() => setShowCreateDialog(false)}
            title={`Create ${metadata.label}`}
            submitLabel={`Create ${metadata.label}`}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {metadata.label}</DialogTitle>
          </DialogHeader>
          {editingRecord && (
            <DynamicForm
              fields={metadata.fields}
              layout={metadata.layouts?.[0]}
              initialData={editingRecord.data}
              onSubmit={handleEdit}
              onCancel={() => {
                setShowEditDialog(false);
                setEditingRecord(null);
              }}
              title={`Edit ${metadata.label}`}
              submitLabel={`Save ${metadata.label}`}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRecord} onOpenChange={() => setDeleteRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the record.
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
    </div>
  );
}