"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import {
  Plus,
  Settings,
  Trash2,
  Database,
  ChevronRight,
  Layers,
} from "lucide-react";
import { objectManagerApi } from "@/lib/api";

export default function ObjectManagerPage() {
  const { isSuperAdmin } = useAuth();
  const [objects, setObjects] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [deleteObject, setDeleteObject] = React.useState<any>(null);
  const [newObject, setNewObject] = React.useState({
    name: "",
    label: "",
    pluralLabel: "",
    description: "",
    icon: "database",
  });

  React.useEffect(() => {
    loadObjects();
  }, []);

  const loadObjects = async () => {
    setIsLoading(true);
    try {
      const res = await objectManagerApi.listObjects(true);
      setObjects(res.data.data || []);
    } catch (error) {
      console.error("Failed to load objects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await objectManagerApi.createObject(newObject);
      setShowCreateDialog(false);
      setNewObject({ name: "", label: "", pluralLabel: "", description: "", icon: "database" });
      loadObjects();
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to create object");
    }
  };

  const handleDelete = async () => {
    if (!deleteObject) return;
    try {
      await objectManagerApi.deleteObject(deleteObject.name);
      setDeleteObject(null);
      loadObjects();
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to delete object");
    }
  };

  const generateName = (label: string) => {
    return label.replace(/[^a-zA-Z0-9]/g, "").replace(/^./, (c) => c.toUpperCase());
  };
  const visibleObjects = objects.filter((object) =>
    isSuperAdmin || !["company", "companiesapi"].includes(String(object.name).toLowerCase()),
  );

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
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Object Manager</h1>
          <p className="text-muted-foreground">
            View and manage all CRM objects, including Enquiries, Leads, Site Visits, and more.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Object
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleObjects.map((obj) => (
          <Card
            key={obj.id}
            className="transition-shadow hover:shadow-md"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    <Link
                      href={`/admin/object-manager/${obj.name.toLowerCase()}`}
                      className="rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {obj.pluralLabel}
                    </Link>
                  </CardTitle>
                  <Link
                    href={`/admin/object-manager/${obj.name.toLowerCase()}`}
                    className="text-xs text-muted-foreground hover:text-primary hover:underline"
                  >
                    {obj.name}
                  </Link>
                </div>
              </div>
              <Badge variant={obj.objectType === "standard" ? "secondary" : "default"}>
                {obj.objectType}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {obj.description || "No description"}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{obj._count?.fields || 0} fields</span>
                  <span>{obj._count?.records || 0} records</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                  >
                    <Link
                      href={`/admin/object-manager/${obj.name.toLowerCase()}`}
                      aria-label={`Settings for ${obj.pluralLabel}`}
                      title={`Settings for ${obj.pluralLabel}`}
                    >
                      <Settings className="h-4 w-4" />
                    </Link>
                  </Button>
                  {obj.objectType === "custom" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteObject(obj)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {visibleObjects.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No CRM objects are configured for this tenant.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
          <DialogHeader>
            <DialogTitle>Create New Object</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Object Label</Label>
              <Input
                id="label"
                value={newObject.label}
                onChange={(e) => {
                  const label = e.target.value;
                  setNewObject({
                    ...newObject,
                    label,
                    name: generateName(label),
                    pluralLabel: label ? `${label}s` : "",
                  });
                }}
                placeholder="e.g., Property"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Object Name (API)</Label>
              <Input
                id="name"
                value={newObject.name}
                onChange={(e) =>
                  setNewObject({ ...newObject, name: e.target.value })
                }
                placeholder="e.g., Property"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pluralLabel">Plural Label</Label>
              <Input
                id="pluralLabel"
                value={newObject.pluralLabel}
                onChange={(e) =>
                  setNewObject({ ...newObject, pluralLabel: e.target.value })
                }
                placeholder="e.g., Properties"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newObject.description}
                onChange={(e) =>
                  setNewObject({ ...newObject, description: e.target.value })
                }
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!newObject.name || !newObject.label || !newObject.pluralLabel}
            >
              Create Object
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteObject} onOpenChange={() => setDeleteObject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Object?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the {deleteObject?.label} object and all its
              fields, layouts, and records. This action cannot be undone.
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