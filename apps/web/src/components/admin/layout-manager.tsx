"use client";

import * as React from "react";
import api, { objectManagerApi } from "@/lib/api";
import { emptyLayoutDocument, ensureRequiredFields, layoutSectionsForForm, type LayoutDocument } from "@dct-crm/shared";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  LayoutList,
  RotateCcw,
  Star,
} from "lucide-react";
import LayoutEditor from "@/components/admin/layout-editor";
import PageLayoutAssignment from "@/components/admin/page-layout-assignment";

interface LayoutManagerProps {
  objectName: string;
  fields: any[];
}

export default function LayoutManager({ objectName, fields }: LayoutManagerProps) {
  const { toast } = useToast();
  const [layouts, setLayouts] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editingLayout, setEditingLayout] = React.useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [newLayoutName, setNewLayoutName] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<any>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const [assignPrompt, setAssignPrompt] = React.useState<{ id: string; name: string } | null>(null);
  const [promptProfiles, setPromptProfiles] = React.useState<{ id: string; name: string }[]>([]);
  const [promptSelected, setPromptSelected] = React.useState<string[]>([]);

  const loadLayouts = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await objectManagerApi.listLayouts(objectName);
      setLayouts(res.data.data || []);
    } catch {
      toast({ title: "Error", description: "Failed to load layouts", variant: "destructive" as any });
    } finally {
      setIsLoading(false);
    }
  }, [objectName, toast]);

  React.useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  const starterDocument = (layoutName: string) => ensureRequiredFields(emptyLayoutDocument(layoutName), fields, objectName);

  const handleCreateLayout = async () => {
    if (!newLayoutName.trim()) return;
    try {
      await objectManagerApi.createLayout(objectName, {
        name: newLayoutName.trim(),
        isDefault: layouts.length === 0,
        sections: starterDocument(newLayoutName.trim()),
      });
      toast({ title: "Success", description: "Layout created" });
      setShowCreateDialog(false);
      setNewLayoutName("");
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to create layout", variant: "destructive" as any });
    }
  };

  const handleSaveLayout = async (payload: { name: string; document: LayoutDocument }, options?: { stay?: boolean }) => {
    if (!editingLayout) return;
    setIsSaving(true);
    try {
      const response = await objectManagerApi.updateLayout(objectName, editingLayout.id, {
        name: payload.name,
        sections: payload.document,
      });
      const savedLayout = response.data?.data || { ...editingLayout, name: payload.name, sections: payload.document };
      setEditingLayout(savedLayout);
      if (!options?.stay) {
        setEditingLayout(null);
        setAssignPrompt({ id: editingLayout.id, name: payload.name });
        const profiles = await api.get("/api/layout-assignments", { params: { object: objectName } });
        setPromptProfiles(profiles.data?.data?.profiles || []);
        setPromptSelected([]);
      }
      toast({ title: "Success", description: options?.stay ? "Layout saved." : "Layout saved." });
      await loadLayouts();
    } catch (error) {
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLayout = async () => {
    if (!deleteTarget) return;
    try {
      await objectManagerApi.deleteLayout(objectName, deleteTarget.id);
      toast({ title: "Success", description: "Layout deleted" });
      setDeleteTarget(null);
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to delete layout", variant: "destructive" as any });
    }
  };

  const handleSetDefault = async (layout: any) => {
    try {
      await objectManagerApi.updateLayout(objectName, layout.id, {
        isDefault: true,
      });
      toast({ title: "Success", description: `"${layout.name}" set as default` });
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to set default", variant: "destructive" as any });
    }
  };

  const handleResetToDefault = async (layout: any) => {
    try {
      await objectManagerApi.updateLayout(objectName, layout.id, {
        sections: starterDocument(layout.name),
      });
      toast({ title: "Success", description: "Layout reset to default" });
      await loadLayouts();
    } catch {
      toast({ title: "Error", description: "Failed to reset layout", variant: "destructive" as any });
    }
  };

  if (editingLayout) {
    const parsedSections = typeof editingLayout.sections === "string"
      ? JSON.parse(editingLayout.sections)
      : editingLayout.sections;

    return (
      <div className="fixed inset-0 z-50 bg-background">
        <LayoutEditor
          objectName={objectName}
          layout={{ ...editingLayout, sections: parsedSections }}
          fields={fields}
          onSave={handleSaveLayout}
          onCancel={() => setEditingLayout(null)}
          onAssign={() => {
            setEditingLayout(null);
            setAssigning(true);
          }}
        />
      </div>
    );
  }

  if (assigning) {
    return <PageLayoutAssignment objectName={objectName} onClose={() => setAssigning(false)} />;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading layouts...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Page Layouts</h3>
          <p className="text-sm text-muted-foreground">
            Arrange sections, fields, buttons, and related lists. Profiles without an assignment use the default layout.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAssigning(true)}>Assign Layout</Button>
          <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Layout
          </Button>
        </div>
      </div>

      {layouts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutList className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No layouts yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a layout to define how fields appear on this object
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Layout Name</TableHead>
                <TableHead>Sections</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {layouts.map((layout) => {
                const sections = layoutSectionsForForm(layout.sections, layout.name);
                const totalFields = sections.reduce((acc, section) => acc + section.fields.length, 0);

                return (
                  <TableRow key={layout.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <LayoutList className="h-4 w-4 text-muted-foreground" />
                        {layout.name}
                      </div>
                    </TableCell>
                    <TableCell>{sections.length}</TableCell>
                    <TableCell>{totalFields}</TableCell>
                    <TableCell>
                      {layout.isDefault ? (
                        <Badge variant="default" className="bg-green-600">
                          <Star className="h-3 w-3 mr-1" />
                          Default
                        </Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingLayout(layout)}
                          title="Edit Layout"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!layout.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(layout)}
                            title="Set as Default"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetToDefault(layout)}
                          title="Reset to Default"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        {!layout.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(layout)}
                            title="Delete Layout"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Layout</DialogTitle>
            <DialogDescription>
              Give your layout a name. Required fields are placed in an Information section.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Layout name..."
            value={newLayoutName}
            onChange={(e) => setNewLayoutName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateLayout(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setNewLayoutName(""); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateLayout} disabled={!newLayoutName.trim()}>
              Create Layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Layout</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteLayout}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignPrompt} onOpenChange={(open) => !open && setAssignPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign this layout to profiles now?</DialogTitle>
            <DialogDescription>
              {assignPrompt?.name} can be used by the profiles you select. Other profiles keep their current layout.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {promptProfiles.map((profile) => (
              <label key={profile.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={promptSelected.includes(profile.id)}
                  onChange={() => setPromptSelected((current) => current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id])}
                />
                {profile.name}
              </label>
            ))}
            {!promptProfiles.length && <p className="text-sm text-muted-foreground">No profiles were returned.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignPrompt(null)}>Not now</Button>
            <Button
              disabled={!promptSelected.length || !assignPrompt}
              onClick={async () => {
                if (!assignPrompt) return;
                try {
                  await api.put("/api/layout-assignments", {
                    object: objectName,
                    assignments: promptSelected.map((profileId) => ({ profileId, recordTypeKey: "MASTER", layoutId: assignPrompt.id })),
                  });
                  toast({ title: "Layout assigned", description: `${assignPrompt.name} is assigned to ${promptSelected.length} profile${promptSelected.length === 1 ? "" : "s"}.` });
                  setAssignPrompt(null);
                } catch (error: any) {
                  toast({ title: "Unable to assign layout", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any });
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}