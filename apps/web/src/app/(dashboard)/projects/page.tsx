"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, MoreHorizontal, Eye, Edit, Trash2, Building2, MapPin, MapPinned } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { projectApi } from "@/lib/api";
import { useListView } from "@/components/crm/list-view-control";
import { ListPageHeader, listPageActionClassName } from "@/components/crm/list-page-header";
import { formatDate } from "@/lib/date-format";
import { projectLocationLabel } from "@/lib/project-location";
import { ProjectLocationFields } from "@/components/projects/project-location-fields";
import { ProjectMap } from "@/components/projects/project-map";

interface Project {
  id: string;
  name: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  type: "residential" | "commercial" | "mixed";
  totalUnits: number;
  soldUnits: number;
  status: "planning" | "under-construction" | "completed";
  completionPercentage: number;
  startDate: string;
  expectedCompletion: string;
}

const statusColors: Record<string, string> = {
  planning: "bg-yellow-100 text-yellow-800",
  "under-construction": "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
};

const typeColors: Record<string, string> = {
  residential: "bg-purple-100 text-purple-800",
  commercial: "bg-orange-100 text-orange-800",
  mixed: "bg-indigo-100 text-indigo-800",
};

function mapProject(item: any): Project {
  const statusMap: Record<string, Project["status"]> = {
    PLANNING: "planning",
    PLANNED: "planning",
    UNDER_CONSTRUCTION: "under-construction",
    "UNDER-CONSTRUCTION": "under-construction",
    ONGOING: "under-construction",
    COMPLETED: "completed",
    ACTIVE: "under-construction",
  };
  const total = item.totalUnits ?? item._count?.units ?? 0;
  return {
    id: item.id,
    name: item.name || "Project",
    location: projectLocationLabel(item),
    latitude: item.latitude == null ? null : Number(item.latitude),
    longitude: item.longitude == null ? null : Number(item.longitude),
    type: "residential",
    totalUnits: total,
    soldUnits: item.soldUnits ?? 0,
    status: statusMap[(item.status || "").toUpperCase()] || "planning",
    completionPercentage: item.completionPercentage ?? 0,
    startDate: item.startDate || item.createdAt,
    expectedCompletion: item.expectedCompletion || item.endDate || item.createdAt,
  };
}

const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "name",
    header: "Project Name",
    cell: ({ row }) => (
      <Link href={`/projects/${row.original.id}`} className="font-semibold text-[#075d91] hover:underline">
        {row.getValue("name")}
      </Link>
    ),
  },
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => (
      <div className="min-w-48">
        <span className="font-medium text-[#1479a8]">{row.original.location}</span>
      </div>
    ),
  },
  {
    id: "mapPoint",
    header: "Map",
    cell: ({ row }) => {
      const project = row.original;
      const hasPoint = project.latitude != null && project.longitude != null;
      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!hasPoint} aria-label={`Show map point for ${project.name}`} title={hasPoint ? "Show exact map point" : "Coordinates not set"}>
              <MapPin className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          {hasPoint && (
            <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
              <DialogHeader className="shrink-0 pr-6">
                <DialogTitle>{project.name}</DialogTitle>
                <DialogDescription>{project.location} · {project.latitude?.toFixed(6)}, {project.longitude?.toFixed(6)}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-scroll pr-1">
                <ProjectMap latitude={project.latitude!} longitude={project.longitude!} title={project.location || project.name} className="h-80 w-full" />
                <a className="mt-3 inline-block text-sm text-primary hover:underline" href={`https://www.google.com/maps?q=${project.latitude},${project.longitude}`} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
              </div>
            </DialogContent>
          )}
        </Dialog>
      );
    },
  },
  {
    accessorKey: "type",
    enableSorting: false,
    header: "Type",
    cell: ({ row }) => {
      const type = row.getValue("type") as string;
      return (
        <Badge className={typeColors[type] || "bg-gray-100 text-gray-800"}>
          {type}
        </Badge>
      );
    },
  },
  {
    accessorKey: "totalUnits",
    header: "Units",
    cell: ({ row }) => {
      const project = row.original;
      return (
        <span>
          {project.soldUnits}/{project.totalUnits}
        </span>
      );
    },
  },
  {
    accessorKey: "completionPercentage",
    enableSorting: false,
    header: "Progress",
    cell: ({ row }) => {
      const percentage = row.getValue("completionPercentage") as number;
      return (
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-sm">{percentage}%</span>
        </div>
      );
    },
  },
  {
    accessorKey: "startDate",
    header: "Start",
    cell: ({ row }) => formatDate(row.getValue("startDate") as string),
  },
  {
    accessorKey: "status",
    enableSorting: false,
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status] || "bg-gray-100 text-gray-800"}>
          {status.replace("-", " ")}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const project = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Inventory
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}?editLocation=1`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit project / location
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function ProjectsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const listViews = useListView("PROJECT");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [projectName, setProjectName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [latitude, setLatitude] = React.useState("");
  const [longitude, setLongitude] = React.useState("");
  const [radius, setRadius] = React.useState("100");
  const [totalUnits, setTotalUnits] = React.useState("0");

  const resetCreateForm = () => {
    setProjectName("");
    setAddress("");
    setCity("");
    setState("");
    setLatitude("");
    setLongitude("");
    setRadius("100");
    setTotalUnits("0");
  };

  const createProject = async () => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedRadius = Number(radius);
    const parsedTotalUnits = Number(totalUnits);
    if (!projectName.trim() || !address.trim() ||
        !latitude.trim() || !longitude.trim() ||
        !Number.isFinite(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90 ||
        !Number.isFinite(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180 ||
        !Number.isInteger(parsedRadius) || parsedRadius < 1 || parsedRadius > 5000 ||
        !Number.isInteger(parsedTotalUnits) || parsedTotalUnits < 0) {
      toast({
        title: "Check project details",
        description: "Enter a project name, exact location, valid map coordinates, an allowed radius from 1 to 5000 meters, and a non-negative whole number of units.",
        variant: "destructive" as any,
      });
      return;
    }

    try {
      setIsCreating(true);
      const response = await projectApi.create({
        name: projectName.trim(),
        address: address.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        allowedRadiusMeters: parsedRadius,
        totalUnits: parsedTotalUnits,
      });
      const created = response.data?.data;
      if (!response.data?.success || !created?.id) {
        throw new Error(response.data?.error || "The project was not created.");
      }

      setCreateDialogOpen(false);
      resetCreateForm();
      toast({
        title: "Upcoming project created",
        description: response.data.warning || `${created.name} is ready with its saved map location.`,
        variant: response.data.warning ? "destructive" as any : undefined,
      });
      router.push(`/projects/${created.id}`);
    } catch (error: any) {
      toast({
        title: "Unable to create project",
        description: error?.response?.data?.error || error?.message || "Try again.",
        variant: "destructive" as any,
      });
    } finally {
      setIsCreating(false);
    }
  };

  React.useEffect(() => {
    const fetchProjects = async () => {
      if (!listViews.ready) return;
      try {
        setIsLoading(true);
        const res = await projectApi.list({ page: currentPage, limit: 100, ...listViews.params });
        if (res.data.success && res.data.data) {
          const mapped = res.data.data.map(mapProject);
          setProjects(mapped);
          setTotalItems(res.data.pagination?.total ?? mapped.length);
        } else {
          setProjects([]);
          setTotalItems(0);
        }
      } catch {
        toast({ title: "Error", description: "Failed to load projects", variant: "destructive" as any });
        setProjects([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [currentPage, listViews.ready, listViews.queryKey, toast]);

  return (
    <div className="space-y-6">
      <ListPageHeader
        icon={<Building2 className="h-6 w-6" />}
        title="Projects"
        subtitle="Manage your real estate projects and inventory"
        view={listViews.control}
        actions={(
          <>
            <Button asChild variant="outline" className={`${listPageActionClassName} border-sky-200 bg-white text-[#075d91] hover:bg-sky-50 dark:border-sky-800 dark:bg-slate-950 dark:text-sky-100 dark:hover:bg-slate-900`}>
              <Link href="/projects/sample-layout">
                <MapPinned className="h-4 w-4" />
                Sample Land Layout
              </Link>
            </Button>
            {hasEffectivePermission("PROJECT_CREATE") && (
              <Button className={`${listPageActionClassName} bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-200 hover:from-blue-700 hover:to-blue-600`} onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            )}
          </>
        )}
      />

      {listViews.dialog}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="relative overflow-hidden rounded-xl border-sky-100 bg-gradient-to-br from-white to-sky-50 shadow-sm">
          <div className="pointer-events-none absolute -bottom-6 -right-4 h-16 w-32 rounded-full bg-blue-300 opacity-60 blur-sm" />
          <CardContent className="relative p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-100 p-3">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-[#1479a8]">Total Projects</p>
                <p className="text-2xl font-bold text-[#0b2a5b]">{totalItems}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden rounded-xl border-sky-100 bg-gradient-to-br from-white to-emerald-50 shadow-sm">
          <div className="pointer-events-none absolute -bottom-6 -right-4 h-16 w-32 rounded-full bg-teal-300 opacity-60 blur-sm" />
          <CardContent className="relative p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-3">
                <Building2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-[#1479a8]">Total Units</p>
                <p className="text-2xl font-bold text-[#0b2a5b]">
                  {projects.reduce((sum, p) => sum + p.totalUnits, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden rounded-xl border-sky-100 bg-gradient-to-br from-white to-sky-50 shadow-sm">
          <div className="pointer-events-none absolute -bottom-6 -right-4 h-16 w-32 rounded-full bg-blue-300 opacity-60 blur-sm" />
          <CardContent className="relative p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-orange-100 p-3">
                <Building2 className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-[#1479a8]">Units Sold</p>
                <p className="text-2xl font-bold text-[#0b2a5b]">
                  {projects.reduce((sum, p) => sum + p.soldUnits, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="[&_th]:bg-sky-50 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:text-[#1479a8] [&_input]:border-sky-200 [&_input]:bg-white [&_tbody_td]:text-[#075d91]">
      <DataTable
        columns={columns}
        data={projects}
        searchKey="name"
        searchPlaceholder="Search projects..."
          totalItems={totalItems}
          currentPage={currentPage}
          pageSize={100}
          onPageChange={setCurrentPage}
          serverPagination
          sorting={listViews.sorting ? [listViews.sorting] : []}
          onSortingChange={(next) => {
            listViews.onSortingChange(next[0] || null);
            setCurrentPage(1);
          }}
        />
      </div>

      <Dialog open={createDialogOpen} onOpenChange={(open) => {
          if (!isCreating) {
            setCreateDialogOpen(open);
            if (!open) resetCreateForm();
          }
      }}>
          <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden">
            <DialogHeader className="shrink-0 pr-6">
              <DialogTitle>Create Upcoming Project</DialogTitle>
              <DialogDescription>Add the project’s exact location and map coordinates now. It will be available for leads and site visits while the project is being planned.</DialogDescription>
            </DialogHeader>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-scroll py-2 pr-1 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="new-project-name">Project name *</Label>
                <Input id="new-project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={200} />
              </div>
              <div className="sm:col-span-2">
                <ProjectLocationFields
                  idPrefix="new-project"
                  address={address}
                  city={city}
                  state={state}
                  latitude={latitude}
                  longitude={longitude}
                  onAddressChange={setAddress}
                  onCityChange={setCity}
                  onStateChange={setState}
                  onLatitudeChange={setLatitude}
                  onLongitudeChange={setLongitude}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-project-radius">Allowed site-visit radius (meters)</Label>
                <Input id="new-project-radius" type="number" min="1" max="5000" step="1" value={radius} onChange={(event) => setRadius(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-project-units">Planned units</Label>
                <Input id="new-project-units" type="number" min="0" step="1" value={totalUnits} onChange={(event) => setTotalUnits(event.target.value)} />
              </div>
            </div>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={isCreating}>Cancel</Button>
              <Button className="bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600" onClick={createProject} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create upcoming project"}
              </Button>
            </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}