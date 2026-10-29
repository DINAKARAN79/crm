"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { newPermissionSetApi, permissionApi, userApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Shield,
  Search,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const PERMISSION_MODULES = [
  "SYSTEM",
  "LEAD",
  "REQUIREMENT",
  "SITE_VISIT",
  "OPPORTUNITY",
  "PROPOSAL",
  "QUOTATION",
  "BOOKING",
  "PAYMENT",
  "FINANCE",
  "REPORT",
  "CONTACT",
  "ACCOUNT",
  "CUSTOMER",
  "PROJECT",
  "TASK",
  "FOLLOW_UP",
  "USER",
  "PROFILE",
  "PERMISSION_SET",
  "USER_PERMISSION",
  "DASHBOARD",
  "DATA",
  "WORKFLOW",
  "AUDIT",
];

interface Permission {
  id: string;
  name: string;
  label: string;
  module: string;
  action: string;
}

interface PermissionSetItem {
  id: string;
  permission: Permission;
}

interface UserAssignment {
  id: string;
  userId: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
  };
}

interface AssignableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
}

interface PermissionSet {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  items?: PermissionSetItem[];
  userAssignments?: UserAssignment[];
  _count?: {
    items: number;
    userAssignments: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PermissionByModule {
  [module: string]: Permission[];
}

export default function PermissionSetsPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const { toast } = useToast();

  const [permissionSets, setPermissionSets] = useState<PermissionSet[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [permissionsByModule, setPermissionsByModule] = useState<PermissionByModule>({});

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [selectedPermissionSet, setSelectedPermissionSet] = useState<PermissionSet | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
    permissionIds: [] as string[],
  });

  const [viewDetails, setViewDetails] = useState<PermissionSet | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);

  const fetchPermissionSets = useCallback(async (page = 1, search = "", status = "all") => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page, limit: 10 };
      if (search) params.search = search;
      if (status !== "all") params.isActive = status === "active" ? "true" : "false";

      const response = await newPermissionSetApi.list(params);
      setPermissionSets(response.data.data);
      if (response.data.pagination) {
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch permission sets:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const response = await permissionApi.list();
      const permissions = Array.isArray(response.data.data) ? response.data.data : [];
      const grouped = permissions.reduce<PermissionByModule>((modules, permission: Permission) => {
        if (!modules[permission.module]) modules[permission.module] = [];
        modules[permission.module].push(permission);
        return modules;
      }, {});
      setPermissionsByModule(grouped);
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
    }
  }, []);

  useEffect(() => {
    fetchPermissionSets();
    fetchPermissions();
  }, [fetchPermissionSets, fetchPermissions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPermissionSets(1, searchQuery, statusFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, fetchPermissionSets]);

  const handlePageChange = (newPage: number) => {
    fetchPermissionSets(newPage, searchQuery, statusFilter);
  };

  const openCreateDialog = () => {
    setFormData({ name: "", description: "", isActive: true, permissionIds: [] });
    setCreateDialogOpen(true);
  };

  const openEditDialog = async (ps: PermissionSet) => {
    setSelectedPermissionSet(ps);
    setFormLoading(true);
    setEditDialogOpen(true);
    try {
      const response = await newPermissionSetApi.get(ps.id);
      const detail = response.data.data;
      setFormData({
        name: detail.name,
        description: detail.description || "",
        isActive: detail.isActive,
        permissionIds: (detail.items || []).map((item: PermissionSetItem) => item.permission.id),
      });
    } catch (error) {
      console.error("Failed to load permission set:", error);
      setEditDialogOpen(false);
    } finally {
      setFormLoading(false);
    }
  };

  const openViewDialog = async (ps: PermissionSet) => {
    setSelectedPermissionSet(ps);
    setViewDialogOpen(true);
    setAssignmentLoading(true);
    try {
      const [permissionSetResponse, usersResponse] = await Promise.all([
        newPermissionSetApi.get(ps.id),
        userApi.list({ limit: 200 }),
      ]);
      const details = permissionSetResponse.data.data;
      const users = Array.isArray(usersResponse.data.data) ? usersResponse.data.data : [];
      setViewDetails(details);
      setAssignableUsers(users);
      setSelectedUserIds((details.userAssignments || []).map((assignment: UserAssignment) => assignment.userId));
    } catch (error: any) {
      console.error("Failed to load permission set details:", error);
      toast({ title: "Unable to load assignments", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setAssignmentLoading(false);
    }
  };

  const saveAssignments = async () => {
    if (!selectedPermissionSet || !viewDetails) return;

    const existingUserIds = (viewDetails.userAssignments || []).map((assignment) => assignment.userId);
    const usersToAssign = selectedUserIds.filter((userId) => !existingUserIds.includes(userId));
    const usersToUnassign = existingUserIds.filter((userId) => !selectedUserIds.includes(userId));

    try {
      setAssignmentSaving(true);
      if (usersToAssign.length > 0) {
        await newPermissionSetApi.assign(selectedPermissionSet.id, usersToAssign);
      }
      await Promise.all(usersToUnassign.map((userId) => newPermissionSetApi.unassign(selectedPermissionSet.id, userId)));
      const response = await newPermissionSetApi.get(selectedPermissionSet.id);
      setViewDetails(response.data.data);
      setSelectedUserIds((response.data.data.userAssignments || []).map((assignment: UserAssignment) => assignment.userId));
      fetchPermissionSets(pagination.page, searchQuery, statusFilter);
      await refreshAuth();
      toast({ title: "Assignments saved", description: "Permission set access was updated." });
    } catch (error: any) {
      toast({ title: "Assignment save failed", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setAssignmentSaving(false);
    }
  };

  const openDeleteDialog = (ps: PermissionSet) => {
    setSelectedPermissionSet(ps);
    setDeleteDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Name required", description: "Enter a permission set name.", variant: "destructive" as any });
      return;
    }
    if (formData.permissionIds.length === 0) {
      toast({ title: "Permission required", description: "Select at least one permission before creating the set.", variant: "destructive" as any });
      return;
    }
    try {
      setSubmitting(true);
      await newPermissionSetApi.create({
        name: formData.name.trim(),
        description: formData.description.trim(),
        permissionIds: formData.permissionIds,
      });
      setCreateDialogOpen(false);
      fetchPermissionSets(pagination.page, searchQuery, statusFilter);
      await refreshAuth();
    } catch (error: any) {
      console.error("Failed to create permission set:", error);
      toast({ title: "Create failed", description: error?.response?.data?.error || "Unable to create permission set.", variant: "destructive" as any });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedPermissionSet || !formData.name.trim()) {
      toast({ title: "Name required", description: "Enter a permission set name.", variant: "destructive" as any });
      return;
    }
    if (formData.permissionIds.length === 0) {
      toast({ title: "Permission required", description: "Select at least one permission before saving the set.", variant: "destructive" as any });
      return;
    }
    try {
      setSubmitting(true);
      await newPermissionSetApi.update(selectedPermissionSet.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        isActive: formData.isActive,
        permissionIds: formData.permissionIds,
      });
      setEditDialogOpen(false);
      fetchPermissionSets(pagination.page, searchQuery, statusFilter);
      await refreshAuth();
    } catch (error: any) {
      console.error("Failed to update permission set:", error);
      toast({ title: "Update failed", description: error?.response?.data?.error || "Unable to update permission set.", variant: "destructive" as any });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPermissionSet) return;
    try {
      setSubmitting(true);
      await newPermissionSetApi.delete(selectedPermissionSet.id);
      setDeleteDialogOpen(false);
      fetchPermissionSets(pagination.page, searchQuery, statusFilter);
      await refreshAuth();
    } catch (error: any) {
      console.error("Failed to delete permission set:", error);
      toast({ title: "Delete failed", description: error?.response?.data?.error || "Unable to delete permission set.", variant: "destructive" as any });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleModuleExpanded = (module: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  };

  const toggleAllModulePermissions = (module: string, checked: boolean) => {
    const modulePermissions = permissionsByModule[module] || [];
    const moduleIds = modulePermissions.map((p) => p.id);
    setFormData((prev) => {
      if (checked) {
        const newIds = [...new Set([...prev.permissionIds, ...moduleIds])];
        return { ...prev, permissionIds: newIds };
      } else {
        return {
          ...prev,
          permissionIds: prev.permissionIds.filter((id) => !moduleIds.includes(id)),
        };
      }
    });
  };

  const togglePermission = (permissionId: string, checked: boolean) => {
    setFormData((prev) => {
      if (checked) {
        return { ...prev, permissionIds: [...prev.permissionIds, permissionId] };
      } else {
        return { ...prev, permissionIds: prev.permissionIds.filter((id) => id !== permissionId) };
      }
    });
  };

  const isModuleFullySelected = (module: string) => {
    const modulePermissions = permissionsByModule[module] || [];
    if (modulePermissions.length === 0) return false;
    return modulePermissions.every((p) => formData.permissionIds.includes(p.id));
  };

  const isModulePartiallySelected = (module: string) => {
    const modulePermissions = permissionsByModule[module] || [];
    const selectedCount = modulePermissions.filter((p) => formData.permissionIds.includes(p.id)).length;
    return selectedCount > 0 && selectedCount < modulePermissions.length;
  };

  const getModuleSelectedCount = (module: string) => {
    const modulePermissions = permissionsByModule[module] || [];
    return modulePermissions.filter((p) => formData.permissionIds.includes(p.id)).length;
  };

  const viewPermissionsByModule = useMemo(() => {
    if (!viewDetails?.items) return {};
    const grouped: { [module: string]: Permission[] } = {};
    for (const item of viewDetails.items) {
      const mod = item.permission.module;
      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push(item.permission);
    }
    return grouped;
  }, [viewDetails]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6" />
            <CardTitle className="text-xl font-bold">Permission Sets</CardTitle>
          </div>
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Permission Set
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search permission sets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : permissionSets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No permission sets found</p>
              <p className="text-sm mt-1">Create your first permission set to get started</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Permissions</TableHead>
                      <TableHead className="text-center">Assigned Users</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permissionSets.map((ps) => (
                      <TableRow key={ps.id}>
                        <TableCell className="font-medium">{ps.name}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">
                          {ps.description || "No description"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">
                            {ps._count?.items ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">
                            <Users className="h-3 w-3 mr-1" />
                            {ps._count?.userAssignments ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={ps.isActive ? "default" : "destructive"}>
                            {ps.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewDialog(ps)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(ps)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openDeleteDialog(ps)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                    {pagination.total} results
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => handlePageChange(pagination.page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => handlePageChange(pagination.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Create Permission Set</DialogTitle>
            <DialogDescription>
              Create a new permission set by selecting the appropriate permissions for each module.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
          <ScrollArea className="h-[60vh] max-h-[60vh] min-h-0 flex-none pr-4">
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Name *</Label>
                <Input
                  id="create-name"
                  placeholder="Enter permission set name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-description">Description</Label>
                <Input
                  id="create-description"
                  placeholder="Enter description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Permission Matrix</Label>
                <p className="text-sm text-muted-foreground">
                  Select permissions for this permission set. Click a module to expand and view
                  individual permissions.
                </p>
                <div className="space-y-2">
                  {PERMISSION_MODULES.map((module) => {
                    const modulePermissions = permissionsByModule[module] || [];
                    const isExpanded = expandedModules.has(module);
                    const fullySelected = isModuleFullySelected(module);
                    const partiallySelected = isModulePartiallySelected(module);
                    const selectedCount = getModuleSelectedCount(module);

                    return (
                      <div key={module} className="border rounded-lg">
                        <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50">
                          <button
                            type="button"
                            onClick={() => toggleModuleExpanded(module)}
                            className="flex items-center gap-2 flex-1 text-left"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="font-medium text-sm">{module.replace(/_/g, " ")}</span>
                            {modulePermissions.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({selectedCount}/{modulePermissions.length})
                              </span>
                            )}
                          </button>
                          <Checkbox
                            checked={fullySelected}
                            ref={(el) => {
                              if (el) {
                                const input = el.querySelector("input") as HTMLInputElement;
                                if (input) {
                                  input.indeterminate = partiallySelected && !fullySelected;
                                }
                              }
                            }}
                            onCheckedChange={(checked) =>
                              toggleAllModulePermissions(module, !!checked)
                            }
                          />
                        </div>
                        {isExpanded && modulePermissions.length > 0 && (
                          <div className="border-t px-4 py-3 grid grid-cols-2 gap-2">
                            {modulePermissions.map((permission) => (
                              <div key={permission.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`create-permission-${permission.id}`}
                                  checked={formData.permissionIds.includes(permission.id)}
                                  onCheckedChange={(checked) =>
                                    togglePermission(permission.id, !!checked)
                                  }
                                />
                                <Label htmlFor={`create-permission-${permission.id}`} className="text-sm font-normal cursor-pointer">
                                  {permission.label || permission.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.name.trim() || formData.permissionIds.length === 0 || submitting}
            >
              {submitting ? "Creating..." : "Create Permission Set"}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Permission Set</DialogTitle>
            <DialogDescription>
              Update the permission set details and permissions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleEdit(); }}>
          {formLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : (
            <>
              <ScrollArea className="h-[60vh] max-h-[60vh] min-h-0 flex-none pr-4">
                <div className="space-y-6 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name *</Label>
                    <Input
                      id="edit-name"
                      placeholder="Enter permission set name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Input
                      id="edit-description"
                      placeholder="Enter description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, description: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-active"
                      checked={formData.isActive}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, isActive: !!checked }))
                      }
                    />
                    <Label htmlFor="edit-active" className="font-medium">
                      Active
                    </Label>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Permission Matrix</Label>
                    <div className="space-y-2">
                      {PERMISSION_MODULES.map((module) => {
                        const modulePermissions = permissionsByModule[module] || [];
                        const isExpanded = expandedModules.has(module);
                        const fullySelected = isModuleFullySelected(module);
                        const partiallySelected = isModulePartiallySelected(module);
                        const selectedCount = getModuleSelectedCount(module);

                        return (
                          <div key={module} className="border rounded-lg">
                            <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50">
                              <button
                                type="button"
                                onClick={() => toggleModuleExpanded(module)}
                                className="flex items-center gap-2 flex-1 text-left"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-medium text-sm">
                                  {module.replace(/_/g, " ")}
                                </span>
                                {modulePermissions.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ({selectedCount}/{modulePermissions.length})
                                  </span>
                                )}
                              </button>
                              <Checkbox
                                checked={fullySelected}
                                onCheckedChange={(checked) =>
                                  toggleAllModulePermissions(module, !!checked)
                                }
                              />
                            </div>
                            {isExpanded && modulePermissions.length > 0 && (
                              <div className="border-t px-4 py-3 grid grid-cols-2 gap-2">
                                {modulePermissions.map((permission) => (
                                  <div key={permission.id} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`edit-permission-${permission.id}`}
                                      checked={formData.permissionIds.includes(permission.id)}
                                      onCheckedChange={(checked) =>
                                        togglePermission(permission.id, !!checked)
                                      }
                                    />
                                    <Label htmlFor={`edit-permission-${permission.id}`} className="text-sm font-normal cursor-pointer">
                                      {permission.label || permission.name}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!formData.name.trim() || formData.permissionIds.length === 0 || submitting}
                >
                  {submitting ? "Updating..." : "Update Permission Set"}
                </Button>
              </DialogFooter>
            </>
          )}
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Permission Set Details</DialogTitle>
            <DialogDescription>
              View the complete details of this permission set.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] max-h-[60vh] min-h-0 flex-none pr-4">
            {viewDetails ? (
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <p className="font-medium">{viewDetails.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <p>
                      <Badge variant={viewDetails.isActive ? "default" : "destructive"}>
                        {viewDetails.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <p className="mt-1">{viewDetails.description || "No description provided"}</p>
                </div>

                <div className="space-y-3">
                  <Label className="text-base font-semibold">
                    Permissions ({viewDetails.items?.length || 0})
                  </Label>
                  {Object.keys(viewPermissionsByModule).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(viewPermissionsByModule).map(([module, permissions]) => (
                        <div key={module} className="border rounded-lg">
                          <div className="px-4 py-3 bg-muted/50 rounded-t-lg">
                            <span className="font-medium text-sm">
                              {module.replace(/_/g, " ")}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({permissions.length})
                            </span>
                          </div>
                          <div className="px-4 py-3 grid grid-cols-2 gap-2">
                            {permissions.map((permission) => (
                              <div key={permission.id} className="flex items-center gap-2">
                                <Checkbox checked disabled />
                                <span className="text-sm">
                                  {permission.label || permission.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No permissions assigned</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-base font-semibold">
                    Assigned Users ({selectedUserIds.length})
                  </Label>
                  {assignmentLoading ? (
                    <p className="text-sm text-muted-foreground">Loading users...</p>
                  ) : assignableUsers.length > 0 ? (
                    <div className="space-y-2">
                      {assignableUsers.map((assignableUser) => (
                        <label key={assignableUser.id} className="flex items-center gap-3 rounded-lg border p-3">
                          <Checkbox
                            checked={selectedUserIds.includes(assignableUser.id)}
                            onCheckedChange={(checked) => setSelectedUserIds((current) => checked ? [...new Set([...current, assignableUser.id])] : current.filter((id) => id !== assignableUser.id))}
                          />
                          <div>
                            <p className="font-medium text-sm">{assignableUser.firstName} {assignableUser.lastName}</p>
                            <p className="text-xs text-muted-foreground">{assignableUser.email}</p>
                          </div>
                          {!assignableUser.isActive && <Badge variant="secondary">Inactive</Badge>}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No users available to assign.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">Loading details...</div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button onClick={saveAssignments} disabled={assignmentLoading || assignmentSaving || !viewDetails}>
              {assignmentSaving ? "Saving assignments..." : "Save assignments"}
            </Button>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the permission set{" "}
              <strong>{selectedPermissionSet?.name}</strong> and remove all user assignments. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}