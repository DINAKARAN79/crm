"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight, Eye, FileUp, Loader2, Move, PenTool, RotateCcw, Save, Search, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { companyApi, projectLayoutsApi } from "@/lib/api";
import { clientToNormalizedPoint, detectGreenRegions, type DetectedGreenRegion } from "@/lib/project-layout-segmentation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface TenantOption { id: string; name: string }
interface ProjectOption { id: string; name: string; description?: string }
interface LayoutUnit {
  id: string;
  number: string;
  type: string | null;
  block: string | null;
  floor: number | null;
  area: number | null;
  price: number | null;
  status: string;
}
interface RectangleGeometry { x: number; y: number; width: number; height: number }
interface PolygonGeometry { points: Array<{ x: number; y: number }> }
type LayoutShape =
  | { id: string; kind: "RECTANGLE"; unitId: string | null; unit?: LayoutUnit | null; geometry: RectangleGeometry }
  | { id: string; kind: "POLYGON"; unitId: string | null; unit?: LayoutUnit | null; geometry: PolygonGeometry };
interface LayoutDraftSummary {
  id: string;
  name: string;
  originalFilename: string;
  mimeType: string;
  selectedPage: number;
  status: "DRAFT" | "PUBLISHED";
  updatedAt: string;
  _count: { shapes: number };
}
interface LayoutListItem extends LayoutDraftSummary {
  tenantId: string;
  projectId: string;
  tenant: { name: string };
  project: { name: string };
  mappedUnits: number;
  unmappedUnits: number;
}
interface LayoutDraft extends LayoutDraftSummary {
  tenantId: string;
  projectId: string;
  storageKey: string;
  shapes: LayoutShape[];
}
interface DrawingSize { width: number; height: number }
interface ViewTransform { zoom: number; x: number; y: number }
type EditorTool = "SELECT" | "RECTANGLE" | "POLYGON";
type DragAction =
  | { kind: "draw"; id: string; start: { x: number; y: number }; last: { x: number; y: number }; hasMoved: boolean }
  | { kind: "move"; id: string; start: { x: number; y: number }; initial: LayoutShape }
  | { kind: "resize-rectangle"; id: string; corner: number; initial: LayoutShape & { kind: "RECTANGLE" } }
  | { kind: "move-point"; id: string; point: number; initial: LayoutShape & { kind: "POLYGON" } }
  | { kind: "pan"; startX: number; startY: number; originX: number; originY: number };

function messageFromError(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return fallback;
}

function unitLabel(unit: LayoutUnit): string {
  const details = [unit.type, unit.block && `Block ${unit.block}`, unit.floor != null && `Floor ${unit.floor}`]
    .filter(Boolean).join(" · ");
  return details ? `${unit.number} · ${details}` : unit.number;
}

function coordinatesToPoints(shape: LayoutShape): string {
  if (shape.kind === "POLYGON") return shape.geometry.points.map((point) => `${point.x},${point.y}`).join(" ");
  const { x, y, width, height } = shape.geometry;
  return `${x},${y} ${x + width},${y} ${x + width},${y + height} ${x},${y + height}`;
}

function shapeCenter(shape: LayoutShape): { x: number; y: number } {
  if (shape.kind === "POLYGON") {
    const totals = shape.geometry.points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
    return { x: totals.x / shape.geometry.points.length, y: totals.y / shape.geometry.points.length };
  }
  return { x: shape.geometry.x + shape.geometry.width / 2, y: shape.geometry.y + shape.geometry.height / 2 };
}

function pointInPolygon(point: { x: number; y: number }, points: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
    const a = points[current];
    const b = points[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y) &&
    point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function matchesDetectedRegion(shape: LayoutShape, region: DetectedGreenRegion): boolean {
  if (shape.kind === "POLYGON" && shape.geometry.points.length === region.points.length &&
    shape.geometry.points.every((point, index) =>
    Math.abs(point.x - region.points[index].x) < 0.002 &&
    Math.abs(point.y - region.points[index].y) < 0.002,
    )) return true;
  return pointInPolygon(shapeCenter(shape), region.points);
}

function isDrawingSurfaceTarget(target: EventTarget, svg: SVGSVGElement): boolean {
  return target === svg || (
    target instanceof Element &&
    target.getAttribute("data-layout-canvas") === "true"
  );
}

export default function CustomProjectLayoutsPage() {
  const { isLoading: authLoading, isSuperAdmin } = useAuth();
  const [tenants, setTenants] = React.useState<TenantOption[]>([]);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [units, setUnits] = React.useState<LayoutUnit[]>([]);
  const [layouts, setLayouts] = React.useState<LayoutDraftSummary[]>([]);
  const [allLayouts, setAllLayouts] = React.useState<LayoutListItem[]>([]);
  const [allLayoutsLoading, setAllLayoutsLoading] = React.useState(false);
  const [allLayoutsError, setAllLayoutsError] = React.useState("");
  const [layoutSearch, setLayoutSearch] = React.useState("");
  const [layoutFilterTenantId, setLayoutFilterTenantId] = React.useState("");
  const [layoutFilterProjectId, setLayoutFilterProjectId] = React.useState("");
  const [layoutFilterStatus, setLayoutFilterStatus] = React.useState("");
  const [layoutFilterProjects, setLayoutFilterProjects] = React.useState<ProjectOption[]>([]);
  const [layoutPage, setLayoutPage] = React.useState(1);
  const [layoutPagination, setLayoutPagination] = React.useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [layoutListReload, setLayoutListReload] = React.useState(0);
  const [deleteTarget, setDeleteTarget] = React.useState<LayoutListItem | null>(null);
  const [deletingLayoutId, setDeletingLayoutId] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [layout, setLayout] = React.useState<LayoutDraft | null>(null);
  const [selectedShapeId, setSelectedShapeId] = React.useState("");
  const [shapes, setShapes] = React.useState<LayoutShape[]>([]);
  const [activeMappingUnitId, setActiveMappingUnitId] = React.useState("");
  const [tool, setTool] = React.useState<EditorTool>("SELECT");
  const [pendingPolygon, setPendingPolygon] = React.useState<Array<{ x: number; y: number }>>([]);
  const [unitSearch, setUnitSearch] = React.useState("");
  const [drawingUrl, setDrawingUrl] = React.useState("");
  const [pdfBytes, setPdfBytes] = React.useState<Uint8Array | null>(null);
  const [drawingSize, setDrawingSize] = React.useState<DrawingSize | null>(null);
  const [detectedRegions, setDetectedRegions] = React.useState<DetectedGreenRegion[]>([]);
  const [editingShapeId, setEditingShapeId] = React.useState("");
  const [redrawingShapeId, setRedrawingShapeId] = React.useState("");
  const [detectionMessage, setDetectionMessage] = React.useState("");
  const [pdfPageCount, setPdfPageCount] = React.useState(0);
  const [selectedPage, setSelectedPage] = React.useState(1);
  const [transform, setTransform] = React.useState<ViewTransform>({ zoom: 1, x: 0, y: 0 });
  const [tenantsLoading, setTenantsLoading] = React.useState(false);
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [editorLoading, setEditorLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [unitQuery, setUnitQuery] = React.useState("");
  const [preview, setPreview] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const svgRef = React.useRef<SVGSVGElement>(null);
  const pdfCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const selectionPanelRef = React.useRef<HTMLDivElement>(null);
  const editorPanelRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragAction | null>(null);
  const selectionRef = React.useRef({ tenantId: "", projectId: "" });

  const selectedShape = shapes.find((shape) => shape.id === selectedShapeId) || null;

  const clearEditor = React.useCallback(() => {
    setLayout(null);
    setShapes([]);
    setActiveMappingUnitId("");
    setSelectedShapeId("");
    setEditingShapeId("");
    setRedrawingShapeId("");
    setDrawingSize(null);
    setDetectedRegions([]);
    setDetectionMessage("");
    setPdfBytes(null);
    setPdfPageCount(0);
    setSelectedPage(1);
    setPendingPolygon([]);
    setPreview(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setUnitQuery("");
    setDrawingUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }, []);

  React.useEffect(() => () => {
    if (drawingUrl) URL.revokeObjectURL(drawingUrl);
  }, [drawingUrl]);

  React.useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    let cancelled = false;
    const loadTenants = async () => {
      try {
        setTenantsLoading(true);
        const first = await companyApi.list({ page: 1, limit: 100, sortBy: "name", sortOrder: "asc" });
        const allTenants = [...(first.data.data || [])] as TenantOption[];
        const totalPages = first.data.pagination?.totalPages || 1;
        const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
          companyApi.list({ page: index + 2, limit: 100, sortBy: "name", sortOrder: "asc" }),
        ));
        allTenants.push(...rest.flatMap((response) => (response.data.data || []) as TenantOption[]));
        if (!cancelled) setTenants(allTenants);
      } catch (loadError) {
        if (!cancelled) setError(messageFromError(loadError, "Could not load companies."));
      } finally {
        if (!cancelled) setTenantsLoading(false);
      }
    };
    void loadTenants();
    return () => { cancelled = true; };
  }, [authLoading, isSuperAdmin]);

  React.useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    let cancelled = false;
    const loadAllLayouts = async () => {
      try {
        setAllLayoutsLoading(true);
        setAllLayoutsError("");
        const response = await projectLayoutsApi.all({
          page: layoutPage,
          limit: 25,
          ...(layoutSearch.trim() ? { search: layoutSearch.trim() } : {}),
          ...(layoutFilterTenantId ? { tenantId: layoutFilterTenantId } : {}),
          ...(layoutFilterProjectId ? { projectId: layoutFilterProjectId } : {}),
          ...(layoutFilterStatus ? { status: layoutFilterStatus } : {}),
        });
        if (cancelled) return;
        setAllLayouts((response.data.data || []) as LayoutListItem[]);
        setLayoutPagination(response.data.pagination || { page: layoutPage, limit: 25, total: 0, totalPages: 0 });
      } catch (loadError) {
        if (!cancelled) setAllLayoutsError(messageFromError(loadError, "Could not load saved project layouts."));
      } finally {
        if (!cancelled) setAllLayoutsLoading(false);
      }
    };
    void loadAllLayouts();
    return () => { cancelled = true; };
  }, [authLoading, isSuperAdmin, layoutPage, layoutSearch, layoutFilterTenantId, layoutFilterProjectId, layoutFilterStatus, layoutListReload]);

  React.useEffect(() => {
    if (!layoutFilterTenantId || !isSuperAdmin) {
      setLayoutFilterProjects([]);
      return;
    }
    let cancelled = false;
    const loadFilterProjects = async () => {
      try {
        const first = await companyApi.statistics(layoutFilterTenantId, "projects", { page: 1, limit: 100 });
        const options = [...(first.data.data || [])] as ProjectOption[];
        const totalPages = first.data.pagination?.totalPages || 1;
        const remaining = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
          companyApi.statistics(layoutFilterTenantId, "projects", { page: index + 2, limit: 100 }),
        ));
        options.push(...remaining.flatMap((result) => (result.data.data || []) as ProjectOption[]));
        if (!cancelled) setLayoutFilterProjects(options);
      } catch (loadError) {
        if (!cancelled) setAllLayoutsError(messageFromError(loadError, "Could not load projects for the selected company filter."));
      }
    };
    void loadFilterProjects();
    return () => { cancelled = true; };
  }, [layoutFilterTenantId, isSuperAdmin]);

  React.useEffect(() => {
    if (!tenantId || !isSuperAdmin) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    const loadProjects = async () => {
      try {
        setProjectsLoading(true);
        setError("");
        const first = await companyApi.statistics(tenantId, "projects", { page: 1, limit: 100 });
        const allProjects = [...(first.data.data || [])] as ProjectOption[];
        const totalPages = first.data.pagination?.totalPages || 1;
        const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
          companyApi.statistics(tenantId, "projects", { page: index + 2, limit: 100 }),
        ));
        allProjects.push(...rest.flatMap((response) => (response.data.data || []) as ProjectOption[]));
        if (!cancelled) setProjects(allProjects);
      } catch (loadError) {
        if (!cancelled) setError(messageFromError(loadError, "Could not load projects for this company."));
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };
    void loadProjects();
    return () => { cancelled = true; };
  }, [tenantId, isSuperAdmin]);

  React.useEffect(() => {
    if (!tenantId || !projectId || !isSuperAdmin) {
      setUnits([]);
      setLayouts([]);
      return;
    }
    let cancelled = false;
    const loadProjectData = async () => {
      try {
        setError("");
        const [unitFirst, layoutResponse] = await Promise.all([
          projectLayoutsApi.units(tenantId, projectId, { page: 1, limit: 100 }),
          projectLayoutsApi.list(tenantId, projectId),
        ]);
        const allUnits = [...(unitFirst.data.data || [])] as LayoutUnit[];
        const totalPages = unitFirst.data.pagination?.totalPages || 1;
        const unitPages = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
          projectLayoutsApi.units(tenantId, projectId, { page: index + 2, limit: 100 }),
        ));
        allUnits.push(...unitPages.flatMap((response) => (response.data.data || []) as LayoutUnit[]));
        if (!cancelled) {
          setUnits(allUnits);
          setLayouts((layoutResponse.data.data || []) as LayoutDraftSummary[]);
        }
      } catch (loadError) {
        if (!cancelled) setError(messageFromError(loadError, "Could not load this project's units and drafts."));
      }
    };
    void loadProjectData();
    return () => { cancelled = true; };
  }, [tenantId, projectId, isSuperAdmin]);

  React.useEffect(() => {
    if (!pdfBytes || !pdfCanvasRef.current) return;
    let cancelled = false;
    let destroyLoadingTask: (() => Promise<void>) | undefined;
    let pdfWorker: import("pdfjs-dist/legacy/build/pdf.mjs").PDFWorker | undefined;
    const renderPdfPage = async () => {
      try {
        setEditorLoading(true);
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const worker = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
        pdfWorker = pdfjs.PDFWorker.fromPort({ port: worker });
        const data = new Uint8Array(pdfBytes);
        const loadingTask = pdfjs.getDocument({
          data,
          worker: pdfWorker,
          isEvalSupported: false,
          maxImageSize: 20_000_000,
        });
        destroyLoadingTask = () => loadingTask.destroy();
        const document = await loadingTask.promise;
        if (cancelled) return;
        setPdfPageCount(document.numPages);
        if (selectedPage > document.numPages) {
          setSelectedPage(1);
          return;
        }
        const page = await document.getPage(selectedPage);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(1.8, 1400 / baseViewport.width, 2000 / baseViewport.height),
        });
        const canvas = pdfCanvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser cannot render the selected PDF page.");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        setDrawingSize({ width: canvas.width, height: canvas.height });
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (renderError) {
        if (!cancelled) setError(messageFromError(renderError, "Could not render this PDF page."));
      } finally {
        if (!cancelled) setEditorLoading(false);
      }
    };
    void renderPdfPage();
    return () => {
      cancelled = true;
      if (destroyLoadingTask) void destroyLoadingTask();
      pdfWorker?.destroy();
    };
  }, [pdfBytes, selectedPage]);

  const loadLayout = async (
    layoutId: string,
    requestedTenantId = tenantId,
    requestedProjectId = projectId,
    openInPreview = false,
  ) => {
    const isCurrentSelection = () =>
      selectionRef.current.tenantId === requestedTenantId &&
      selectionRef.current.projectId === requestedProjectId;
    try {
      setEditorLoading(true);
      setError("");
      clearEditor();
      const [detailResponse, drawingResponse] = await Promise.all([
        projectLayoutsApi.get(layoutId, requestedTenantId, requestedProjectId),
        projectLayoutsApi.drawing(layoutId, requestedTenantId, requestedProjectId),
      ]);
      if (!isCurrentSelection()) return;
      const loaded = detailResponse.data.data as LayoutDraft;
      const fileBlob = drawingResponse.data;
      setLayout(loaded);
      setShapes(loaded.shapes.map((shape) => ({ ...shape })));
      setSelectedPage(loaded.selectedPage);
      setTool("SELECT");
      if (openInPreview) setPreview(true);
      if (loaded.mimeType === "application/pdf") {
        setDrawingSize({ width: 1, height: 1 });
        const bytes = new Uint8Array(await fileBlob.arrayBuffer());
        if (isCurrentSelection()) setPdfBytes(bytes);
      } else {
        setDrawingSize({ width: 1, height: 1 });
        const objectUrl = URL.createObjectURL(fileBlob);
        setDrawingUrl(objectUrl);
      }
    } catch (loadError) {
      if (isCurrentSelection()) setError(messageFromError(loadError, "Could not open this draft."));
    } finally {
      if (isCurrentSelection()) setEditorLoading(false);
    }
  };

  const openLayoutFromList = async (item: LayoutListItem, openInPreview = false) => {
    selectionRef.current = { tenantId: item.tenantId, projectId: item.projectId };
    setTenantId(item.tenantId);
    setProjectId(item.projectId);
    setProjects([]);
    setUnits([]);
    setError("");
    setNotice("");
    clearEditor();
    try {
      setProjectsLoading(true);
      const [projectFirst, unitFirst] = await Promise.all([
        companyApi.statistics(item.tenantId, "projects", { page: 1, limit: 100 }),
        projectLayoutsApi.units(item.tenantId, item.projectId, { page: 1, limit: 100 }),
      ]);
      const availableProjects = [...(projectFirst.data.data || [])] as ProjectOption[];
      const availableUnits = [...(unitFirst.data.data || [])] as LayoutUnit[];
      const projectPages = projectFirst.data.pagination?.totalPages || 1;
      const unitPages = unitFirst.data.pagination?.totalPages || 1;
      const [moreProjects, moreUnits] = await Promise.all([
        Promise.all(Array.from({ length: projectPages - 1 }, (_, index) =>
          companyApi.statistics(item.tenantId, "projects", { page: index + 2, limit: 100 }),
        )),
        Promise.all(Array.from({ length: unitPages - 1 }, (_, index) =>
          projectLayoutsApi.units(item.tenantId, item.projectId, { page: index + 2, limit: 100 }),
        )),
      ]);
      availableProjects.push(...moreProjects.flatMap((response) => (response.data.data || []) as ProjectOption[]));
      availableUnits.push(...moreUnits.flatMap((response) => (response.data.data || []) as LayoutUnit[]));
      if (selectionRef.current.tenantId !== item.tenantId || selectionRef.current.projectId !== item.projectId) return;
      setProjects(availableProjects);
      setUnits(availableUnits);
      await loadLayout(item.id, item.tenantId, item.projectId, openInPreview);
      editorPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (loadError) {
      setError(messageFromError(loadError, "Could not open this saved layout."));
    } finally {
      setProjectsLoading(false);
    }
  };

  const deleteLayout = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      setDeletingLayoutId(target.id);
      setAllLayoutsError("");
      await projectLayoutsApi.delete(target.id, target.tenantId, target.projectId);
      if (layout?.id === target.id) clearEditor();
      setLayouts((current) => current.filter((saved) => saved.id !== target.id));
      setDeleteTarget(null);
      setNotice(`Layout "${target.name}" deleted.`);
      setLayoutPage((current) => current > 1 && allLayouts.length === 1 ? current - 1 : current);
      setLayoutListReload((current) => current + 1);
    } catch (deleteError) {
      setAllLayoutsError(messageFromError(deleteError, "Could not delete this layout."));
    } finally {
      setDeletingLayoutId("");
    }
  };

  const startUploadWorkflow = () => {
    selectionPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleTenantChange = (value: string) => {
    selectionRef.current = { tenantId: value, projectId: "" };
    setTenantId(value);
    setProjectId("");
    setProjects([]);
    setUnits([]);
    setLayouts([]);
    setError("");
    setNotice("");
    clearEditor();
  };

  const handleProjectChange = (value: string) => {
    selectionRef.current = { tenantId, projectId: value };
    setProjectId(value);
    setUnits([]);
    setLayouts([]);
    setError("");
    setNotice("");
    clearEditor();
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tenantId || !projectId) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["png", "jpg", "jpeg", "pdf"].includes(extension || "")) {
      setError("Choose a PNG, JPG/JPEG, or PDF drawing.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Drawing must be 25 MB or smaller.");
      return;
    }
    try {
      const requestedTenantId = tenantId;
      const requestedProjectId = projectId;
      setUploading(true);
      setError("");
      const response = await projectLayoutsApi.upload(requestedTenantId, requestedProjectId, file);
      const uploaded = response.data.data as LayoutDraft;
      if (selectionRef.current.tenantId !== requestedTenantId || selectionRef.current.projectId !== requestedProjectId) return;
      setNotice("Original drawing uploaded and saved as a draft.");
      await loadLayout(uploaded.id);
      const drafts = await projectLayoutsApi.list(requestedTenantId, requestedProjectId);
      if (selectionRef.current.tenantId === requestedTenantId && selectionRef.current.projectId === requestedProjectId) {
        setLayouts((drafts.data.data || []) as LayoutDraftSummary[]);
        setLayoutListReload((current) => current + 1);
      }
    } catch (uploadError) {
      setError(messageFromError(uploadError, "Could not upload the drawing."));
    } finally {
      setUploading(false);
    }
  };

  const setShapeUnit = (shapeId: string, unitId: string) => {
    const unit = units.find((candidate) => candidate.id === unitId);
    setActiveMappingUnitId("");
    setShapes((current) => current.map((shape) => shape.id === shapeId
      ? { ...shape, unitId: unitId || null, unit: unit || null } as LayoutShape
      : shape));
  };

  const handleDrawingImageLoad = (image: HTMLImageElement) => {
    setDrawingSize({ width: image.naturalWidth, height: image.naturalHeight });
    setDetectedRegions([]);
    setDetectionMessage("");
    try {
      const scale = Math.min(1, 1200 / image.naturalWidth, 1200 / image.naturalHeight);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas pixel access is unavailable.");
      context.drawImage(image, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);
      const regions = detectGreenRegions(data, width, height, Math.max(96, Math.floor(width * height * 0.0001)));
      setDetectedRegions(regions);
      if (!regions.length) {
        setDetectionMessage("No separate green units were detected. Use Rectangle or Polygon to map units manually.");
      }
    } catch (detectionError) {
      const reason = detectionError instanceof Error ? detectionError.message : "Unknown image processing error.";
      setDetectionMessage(`Automatic green-unit detection failed: ${reason} Use Rectangle or Polygon to map units manually.`);
    }
  };

  const selectDetectedRegion = (region: DetectedGreenRegion) => {
    if (tool !== "SELECT" || preview) return;
    const existing = shapes.find((shape) => matchesDetectedRegion(shape, region));
    if (existing) {
      setSelectedShapeId(existing.id);
      setEditingShapeId("");
      setRedrawingShapeId("");
    } else {
      const id = crypto.randomUUID();
      setShapes((current) => [...current, {
        id,
        kind: "POLYGON",
        unitId: null,
        geometry: { points: region.points },
      }]);
      setSelectedShapeId(id);
      setEditingShapeId("");
      setRedrawingShapeId("");
    }
    setActiveMappingUnitId("");
    setUnitQuery("");
    setTool("SELECT");
    setError("");
  };

  const saveDraft = async (finalize = false) => {
    if (!layout) return;
    if (finalize && shapes.length === 0) {
      setError("Draw and map at least one unit shape before finalizing this layout.");
      return;
    }
    if (finalize && shapes.some((shape) => !shape.unitId)) {
      setError("Map every shape to one unit before finalizing this layout.");
      return;
    }
    const duplicateUnit = shapes.find((shape, index) => shapes.findIndex((candidate) => candidate.unitId === shape.unitId) !== index);
    if (duplicateUnit) {
      setError("Each unit can only be mapped once in this layout.");
      return;
    }
    if (layout.mimeType === "application/pdf" && (!pdfPageCount || selectedPage > pdfPageCount)) {
      setError("Select a valid page from the uploaded PDF.");
      return;
    }
    try {
      const requestedTenantId = tenantId;
      const requestedProjectId = projectId;
      setSaving(true);
      setError("");
      const response = await projectLayoutsApi.save(layout.id, requestedTenantId, requestedProjectId, {
        selectedPage,
        finalize,
        shapes: shapes.map(({ id, kind, unitId, geometry }) => ({ id, kind, unitId: unitId || null, geometry })),
      });
      if (selectionRef.current.tenantId !== requestedTenantId || selectionRef.current.projectId !== requestedProjectId) return;
      const saved = response.data.data as LayoutDraft;
      setLayout(saved);
      setShapes(saved.shapes);
      setNotice(finalize
        ? "Layout finalized. All unit mappings are saved and available in quotations. You can reopen and update this layout later."
        : saved.status === "PUBLISHED"
          ? "Published layout changes saved. The unit mappings remain available in quotations."
          : "Draft saved. The original drawing and unit mappings are preserved.");
      const drafts = await projectLayoutsApi.list(requestedTenantId, requestedProjectId);
      if (selectionRef.current.tenantId === requestedTenantId && selectionRef.current.projectId === requestedProjectId) {
        setLayouts((drafts.data.data || []) as LayoutDraftSummary[]);
        setLayoutListReload((current) => current + 1);
      }
    } catch (saveError) {
      setError(messageFromError(saveError, "Could not save this draft. Your editor work is still here; retry when ready."));
    } finally {
      setSaving(false);
    }
  };

  const addPointer = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const matrix = svg && typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
    if (svg && matrix && typeof svg.createSVGPoint === "function") {
      const pointer = svg.createSVGPoint();
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const point = pointer.matrixTransform(matrix.inverse());
      return {
        x: Math.min(1, Math.max(0, point.x)),
        y: Math.min(1, Math.max(0, point.y)),
      };
    }
    const bounds = svg?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return clientToNormalizedPoint(event.clientX, event.clientY, bounds);
  };

  const startDrawRectangle = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!activeMappingUnitId) {
      setError("Choose a unit in Unit Mapping before drawing its shape.");
      return;
    }
    const start = addPointer(event);
    const id = crypto.randomUUID();
    setShapes((current) => [...current, {
      id, kind: "RECTANGLE", unitId: activeMappingUnitId, geometry: { x: start.x, y: start.y, width: 0.0001, height: 0.0001 },
    }]);
    setActiveMappingUnitId("");
    setSelectedShapeId(id);
    dragRef.current = { kind: "draw", id, start, last: start, hasMoved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateShape = (shapeId: string, updater: (shape: LayoutShape) => LayoutShape) => {
    setShapes((current) => current.map((shape) => shape.id === shapeId ? updater(shape) : shape));
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingSize || preview) return;
    if (tool === "RECTANGLE") {
      startDrawRectangle(event);
      return;
    }
    const drawingSurfaceTarget = isDrawingSurfaceTarget(event.target, event.currentTarget);
    if (tool === "SELECT" && drawingSurfaceTarget && activeMappingUnitId) {
      startDrawRectangle(event);
      setTool("SELECT");
      return;
    }
    if (tool === "SELECT" && drawingSurfaceTarget) {
      dragRef.current = { kind: "pan", startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const action = dragRef.current;
    if (!action) return;
    const point = addPointer(event);
    if (action.kind === "draw") {
      action.last = point;
      action.hasMoved ||= Math.hypot(point.x - action.start.x, point.y - action.start.y) >= 0.003;
      updateShape(action.id, (shape) => {
        if (shape.kind !== "RECTANGLE") return shape;
        const x = Math.min(point.x, action.start.x);
        const y = Math.min(point.y, action.start.y);
        return { ...shape, geometry: { x, y, width: Math.abs(point.x - action.start.x), height: Math.abs(point.y - action.start.y) } };
      });
    } else if (action.kind === "move") {
      const dx = point.x - action.start.x;
      const dy = point.y - action.start.y;
      updateShape(action.id, (shape) => {
        if (shape.kind !== action.initial.kind) return shape;
        if (shape.kind === "RECTANGLE" && action.initial.kind === "RECTANGLE") {
          const { width, height } = action.initial.geometry;
          return { ...shape, geometry: {
            ...action.initial.geometry,
            x: Math.min(1 - width, Math.max(0, action.initial.geometry.x + dx)),
            y: Math.min(1 - height, Math.max(0, action.initial.geometry.y + dy)),
          } };
        }
        if (shape.kind === "POLYGON" && action.initial.kind === "POLYGON") {
          const minX = Math.min(...action.initial.geometry.points.map((vertex) => vertex.x));
          const maxX = Math.max(...action.initial.geometry.points.map((vertex) => vertex.x));
          const minY = Math.min(...action.initial.geometry.points.map((vertex) => vertex.y));
          const maxY = Math.max(...action.initial.geometry.points.map((vertex) => vertex.y));
          const shiftX = Math.min(1 - maxX, Math.max(-minX, dx));
          const shiftY = Math.min(1 - maxY, Math.max(-minY, dy));
          return { ...shape, geometry: { points: action.initial.geometry.points.map((vertex) => ({ x: vertex.x + shiftX, y: vertex.y + shiftY })) } };
        }
        return shape;
      });
    } else if (action.kind === "resize-rectangle") {
      const { x, y, width, height } = action.initial.geometry;
      const opposite = [
        { x: x + width, y: y + height },
        { x, y: y + height },
        { x, y },
        { x: x + width, y },
      ][action.corner];
      updateShape(action.id, (shape) => shape.kind === "RECTANGLE" ? {
        ...shape,
        geometry: {
          x: Math.min(1 - Math.max(0.002, Math.abs(point.x - opposite.x)), Math.min(opposite.x, point.x)),
          y: Math.min(1 - Math.max(0.002, Math.abs(point.y - opposite.y)), Math.min(opposite.y, point.y)),
          width: Math.min(1, Math.max(0.002, Math.abs(point.x - opposite.x))),
          height: Math.min(1, Math.max(0.002, Math.abs(point.y - opposite.y))),
        },
      } : shape);
    } else if (action.kind === "move-point") {
      updateShape(action.id, (shape) => shape.kind === "POLYGON" ? {
        ...shape,
        geometry: { points: shape.geometry.points.map((vertex, index) => index === action.point ? point : vertex) },
      } : shape);
    } else if (action.kind === "pan") {
      setPan({ x: action.originX + event.clientX - action.startX, y: action.originY + event.clientY - action.startY });
    }
  };

  const finishPointerAction = () => {
    const action = dragRef.current;
    dragRef.current = null;
    if (action?.kind === "draw") {
      const rectangle = shapes.find((shape) => shape.id === action.id);
      if (rectangle?.kind !== "RECTANGLE") return;
      if (!action.hasMoved) {
        const drawing = drawingSize;
        if (!drawing) return;
        const size = Math.min(drawing.width, drawing.height) * 0.08;
        const width = Math.min(1, size / drawing.width);
        const height = Math.min(1, size / drawing.height);
        updateShape(action.id, (shape) => shape.kind === "RECTANGLE" ? {
          ...shape,
          geometry: {
            x: Math.min(1 - width, Math.max(0, action.start.x - width / 2)),
            y: Math.min(1 - height, Math.max(0, action.start.y - height / 2)),
            width,
            height,
          },
        } : shape);
        setTool("SELECT");
      } else if (rectangle.geometry.width < 0.003 || rectangle.geometry.height < 0.003) {
        setShapes((current) => current.filter((shape) => shape.id !== action.id));
        setSelectedShapeId("");
      } else {
        setTool("SELECT");
      }
    }
  };

  const handlePolygonClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const targetIsShape = event.target instanceof Element && event.target.tagName.toLowerCase() === "polygon";
    if (tool !== "POLYGON" || !drawingSize || (!isDrawingSurfaceTarget(event.target, event.currentTarget) && !targetIsShape)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPendingPolygon((points) => [...points, clientToNormalizedPoint(event.clientX, event.clientY, bounds)]);
  };

  const finishPolygon = () => {
    if (pendingPolygon.length < 3) {
      setError("A polygon needs at least three points.");
      return;
    }
    if (!activeMappingUnitId && !redrawingShapeId) {
      setError("Choose a unit in Unit Mapping before finishing its shape.");
      return;
    }
    if (redrawingShapeId) {
      setShapes((current) => current.map((shape) => shape.id === redrawingShapeId
        ? { ...shape, kind: "POLYGON", geometry: { points: pendingPolygon } }
        : shape));
      setSelectedShapeId(redrawingShapeId);
    } else {
      const id = crypto.randomUUID();
      setShapes((current) => [...current, { id, kind: "POLYGON", unitId: activeMappingUnitId, geometry: { points: pendingPolygon } }]);
      setSelectedShapeId(id);
    }
    setActiveMappingUnitId("");
    setEditingShapeId("");
    setRedrawingShapeId("");
    setPendingPolygon([]);
    setTool("SELECT");
    setError("");
  };

  const beginShapeDrag = (event: React.PointerEvent<SVGElement>, shape: LayoutShape) => {
    if (tool !== "SELECT" || preview) return;
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    if (selectedShapeId !== shape.id) {
      setEditingShapeId("");
      setRedrawingShapeId("");
    }
    setSelectedShapeId(shape.id);
    setActiveMappingUnitId("");
    dragRef.current = { kind: "move", id: shape.id, start: addPointer(event), initial: shape };
  };

  const beginResize = (event: React.PointerEvent<SVGCircleElement>, action: DragAction) => {
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = action;
  };

  const removeSelectedShape = () => {
    if (!selectedShape) return;
    setShapes((current) => current.filter((shape) => shape.id !== selectedShape.id));
    setSelectedShapeId("");
    setEditingShapeId("");
    setRedrawingShapeId("");
  };

  const openDraftForPreview = () => {
    setPreview(true);
    setTool("SELECT");
  };

  const activeUnitIds = new Set(shapes.filter((shape) => shape.id !== selectedShape?.id).map((shape) => shape.unitId).filter(Boolean));
  const filteredUnits = units.filter((unit) => `${unit.number} ${unit.type || ""} ${unit.block || ""} ${unit.floor ?? ""}`.toLowerCase().includes(unitQuery.toLowerCase()));
  const mappedShapeCount = shapes.filter((shape) => Boolean(shape.unitId)).length;
  const mappedUnitIds = new Set(shapes.map((shape) => shape.unitId).filter(Boolean));
  const availableMappingUnits = units.filter((unit) => !mappedUnitIds.has(unit.id));
  const allShapesMapped = shapes.length > 0 && shapes.every((shape) => Boolean(shape.unitId));
  const uniqueMappedUnits = new Set(shapes.map((shape) => shape.unitId).filter(Boolean)).size === mappedShapeCount;
  const canFinalize = allShapesMapped && uniqueMappedUnits && !saving && !editorLoading;
  const layoutListHasFilters = Boolean(layoutSearch.trim() || layoutFilterTenantId || layoutFilterProjectId || layoutFilterStatus);

  if (authLoading) {
    return <div className="w-full min-w-0 p-6 text-sm text-muted-foreground">Checking access…</div>;
  }
  if (!isSuperAdmin) {
    return <div role="alert" className="w-full min-w-0 p-6 text-sm text-destructive">Super Admin access is required to manage project layouts.</div>;
  }

  const drawingIsPdf = layout?.mimeType === "application/pdf";

  return (
    <main className="w-full min-w-0 space-y-5 px-4 py-5 lg:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Custom Project Layouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">Overlay and map each shape to an existing unit. Save a draft while working, then finalize to publish its permanent mappings to quotation unit selection. Finalized layouts can be reopened and updated.</p>
        </div>
        <Button type="button" onClick={startUploadWorkflow}><FileUp className="h-4 w-4" />Upload New Layout</Button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Saved custom layouts</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {layoutPagination.total} layout{layoutPagination.total === 1 ? "" : "s"} across all companies and projects
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(170px,0.7fr)_minmax(170px,0.7fr)_minmax(150px,0.6fr)]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search layouts"
                placeholder="Search layout, company, or project"
                value={layoutSearch}
                onChange={(event) => { setLayoutSearch(event.target.value); setLayoutPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={layoutFilterTenantId || "all"} onValueChange={(value) => {
              setLayoutFilterTenantId(value === "all" ? "" : value);
              setLayoutFilterProjectId("");
              setLayoutPage(1);
            }}>
              <SelectTrigger aria-label="Filter by company"><SelectValue placeholder="All companies" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={layoutFilterProjectId || "all"} onValueChange={(value) => {
              setLayoutFilterProjectId(value === "all" ? "" : value);
              setLayoutPage(1);
            }} disabled={!layoutFilterTenantId}>
              <SelectTrigger aria-label="Filter by project"><SelectValue placeholder="All projects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {layoutFilterProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={layoutFilterStatus || "all"} onValueChange={(value) => {
              setLayoutFilterStatus(value === "all" ? "" : value);
              setLayoutPage(1);
            }}>
              <SelectTrigger aria-label="Filter by layout status"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PUBLISHED">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {allLayoutsLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 rounded-lg border bg-slate-50 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading saved layouts…
            </div>
          ) : allLayoutsError ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p>{allLayoutsError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setLayoutListReload((current) => current + 1)}>Try again</Button>
            </div>
          ) : allLayouts.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-slate-50 p-8 text-center">
              <p className="font-medium text-slate-800">{layoutListHasFilters ? "No layouts match these filters." : "No custom project layouts have been uploaded yet."}</p>
              <p className="mt-1 text-sm text-muted-foreground">Upload a layout to start mapping project units.</p>
              <Button type="button" className="mt-4" onClick={startUploadWorkflow}><FileUp className="h-4 w-4" />Upload New Layout</Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Layout Name</th>
                    <th className="px-3 py-3 font-semibold">Company</th>
                    <th className="px-3 py-3 font-semibold">Project</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Total Shapes</th>
                    <th className="px-3 py-3 font-semibold">Mapped Units</th>
                    <th className="px-3 py-3 font-semibold">Unmapped Units</th>
                    <th className="px-3 py-3 font-semibold">Last Updated</th>
                    <th className="px-3 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allLayouts.map((item) => (
                    <tr key={item.id} className="bg-white hover:bg-slate-50/70">
                      <td className="px-3 py-3 font-medium text-slate-900">{item.name}</td>
                      <td className="px-3 py-3">{item.tenant.name}</td>
                      <td className="px-3 py-3">{item.project.name}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {item.status === "PUBLISHED" ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{item._count.shapes}</td>
                      <td className="px-3 py-3">{item.mappedUnits}</td>
                      <td className="px-3 py-3">{item.unmappedUnits}</td>
                      <td className="whitespace-nowrap px-3 py-3">{new Date(item.updatedAt).toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button type="button" size="sm" variant="outline" onClick={() => void openLayoutFromList(item)} aria-label={`Open or edit ${item.name}`}>Open/Edit</Button>
                          <Button type="button" size="icon" variant="ghost" onClick={() => void openLayoutFromList(item, true)} aria-label={`Preview ${item.name}`} title="Preview"><Eye className="h-4 w-4" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(item)} disabled={deletingLayoutId === item.id} aria-label={`Delete ${item.name}`} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {layoutPagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Showing {(layoutPage - 1) * layoutPagination.limit + 1}–{Math.min(layoutPage * layoutPagination.limit, layoutPagination.total)} of {layoutPagination.total}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setLayoutPage((page) => Math.max(1, page - 1))} disabled={layoutPage <= 1 || allLayoutsLoading}><ChevronLeft className="h-4 w-4" />Previous</Button>
                <span className="inline-flex items-center px-2 text-sm text-muted-foreground">Page {layoutPage} of {layoutPagination.totalPages}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setLayoutPage((page) => Math.min(layoutPagination.totalPages, page + 1))} disabled={layoutPage >= layoutPagination.totalPages || allLayoutsLoading}>Next<ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div ref={selectionPanelRef}>
      <Card>
        <CardHeader><CardTitle className="text-base">Select company and project</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="layout-tenant">Company</Label>
            <Select value={tenantId} onValueChange={handleTenantChange} disabled={tenantsLoading}>
              <SelectTrigger id="layout-tenant"><SelectValue placeholder={tenantsLoading ? "Loading companies…" : "Select a company"} /></SelectTrigger>
              <SelectContent>{tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="layout-project">Project</Label>
            <Select value={projectId} onValueChange={handleProjectChange} disabled={!tenantId || projectsLoading}>
              <SelectTrigger id="layout-project"><SelectValue placeholder={projectsLoading ? "Loading projects…" : "Select a project"} /></SelectTrigger>
              <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      </div>

      {!projectId ? (
        <div className="rounded-xl border border-dashed bg-slate-50 p-10 text-center text-sm text-muted-foreground">
          Select a company and one of its projects to upload or edit a layout.
        </div>
      ) : (
        <div ref={editorPanelRef} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="min-w-0">
            <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Drawing editor</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{layout ? layout.originalFilename : "Select an existing draft or upload a site plan."}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="layout-upload" className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  Upload drawing
                </Label>
                <input id="layout-upload" type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" className="sr-only" disabled={uploading} onChange={(event) => void handleUpload(event)} />
                {layout && (
                  <>
                    <Button type="button" variant="outline" size="icon" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value / 1.25))}><ZoomOut /></Button>
                    <Button type="button" variant="outline" size="icon" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(4, value * 1.25))}><ZoomIn /></Button>
                    <Button type="button" variant="outline" size="icon" aria-label="Fit to view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw /></Button>
                    {preview ? (
                      <Button type="button" variant="outline" onClick={() => setPreview(false)}>Back to editor</Button>
                    ) : (
                      <Button type="button" variant="outline" onClick={openDraftForPreview}><Eye className="h-4 w-4" />Preview</Button>
                    )}
                    <Button type="button" onClick={() => void saveDraft()} disabled={saving || editorLoading}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {layout.status === "PUBLISHED" ? "Save changes" : "Save Draft"}
                    </Button>
                    {layout.status === "DRAFT" ? (
                      <Button type="button" variant="secondary" onClick={() => void saveDraft(true)} disabled={!canFinalize}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save All &amp; Finalize Layout
                      </Button>
                    ) : (
                      <span className="inline-flex h-9 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-800">
                        Finalized · quotation enabled
                      </span>
                    )}
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {drawingIsPdf && layout && (
                <div className="flex items-center gap-3">
                  <Label htmlFor="pdf-page">PDF page</Label>
                  <Input
                    id="pdf-page"
                    type="number"
                    min={1}
                    max={Math.min(pdfPageCount || 10_000, 10_000)}
                    value={selectedPage}
                    className="w-24"
                    onChange={(event) => setSelectedPage(Math.min(10_000, Math.max(1, Number(event.target.value))))}
                  />
                  <span className="text-xs text-muted-foreground">{pdfPageCount ? `of ${pdfPageCount}` : "Loading page count…"}</span>
                </div>
              )}
              {layout && !preview && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant={tool === "SELECT" ? "default" : "outline"} size="sm" onClick={() => { setPendingPolygon([]); setRedrawingShapeId(""); setTool("SELECT"); }}><Move />Select / move</Button>
                  <Button type="button" variant={tool === "RECTANGLE" ? "default" : "outline"} size="sm" disabled={!activeMappingUnitId} onClick={() => { setPendingPolygon([]); setEditingShapeId(""); setRedrawingShapeId(""); setTool("RECTANGLE"); }}>Rectangle</Button>
                  <Button type="button" variant={tool === "POLYGON" ? "default" : "outline"} size="sm" disabled={!activeMappingUnitId && !redrawingShapeId} onClick={() => { setPendingPolygon([]); if (!redrawingShapeId) setEditingShapeId(""); setTool("POLYGON"); }}><PenTool />Polygon</Button>
                  {tool === "POLYGON" && (
                    <Button type="button" variant="secondary" size="sm" disabled={pendingPolygon.length < 3 || (!activeMappingUnitId && !redrawingShapeId)} onClick={finishPolygon}><Check />Finish polygon ({pendingPolygon.length})</Button>
                  )}
                  {selectedShape && <Button type="button" variant="destructive" size="sm" onClick={removeSelectedShape}><Trash2 />Delete shape</Button>}
                  {selectedShape && !redrawingShapeId && (
                    <>
                      <Button type="button" variant={editingShapeId === selectedShape.id ? "default" : "outline"} size="sm" onClick={() => setEditingShapeId((current) => current === selectedShape.id ? "" : selectedShape.id)}>
                        {editingShapeId === selectedShape.id ? "Done editing" : "Edit boundary"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        setPendingPolygon([]);
                        setEditingShapeId("");
                        setRedrawingShapeId(selectedShape.id);
                        setTool("POLYGON");
                      }}>Redraw boundary</Button>
                    </>
                  )}
                  {redrawingShapeId && <Button type="button" variant="outline" size="sm" onClick={() => { setRedrawingShapeId(""); setPendingPolygon([]); setTool("SELECT"); }}>Cancel redraw</Button>}
                  <span className="text-xs text-muted-foreground">{tool === "POLYGON" ? "Click points on the drawing, then finish the polygon." : tool === "RECTANGLE" ? "Drag over the unit to draw a rectangle; a click places a starter box you can resize." : "Click a detected green unit to select its boundary. Select any overlay to map, move, or resize it; draw manually to correct missed regions."}</span>
                </div>
              )}

              {detectionMessage && layout?.mimeType !== "application/pdf" && (
                <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{detectionMessage}</p>
              )}
              {detectedRegions.length > 0 && !preview && (
                <p className="text-xs text-muted-foreground" role="status">
                  Detected {detectedRegions.length} green region{detectedRegions.length === 1 ? "" : "s"} — click a region to create/select its editable boundary.
                </p>
              )}

              {editorLoading && <div role="status" className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading drawing…</div>}
              {!layout && !editorLoading && (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed bg-slate-50 p-8 text-center">
                  <FileUp className="mb-2 h-8 w-8 text-slate-400" />
                  <p className="font-medium">No drawing selected</p>
                  <p className="mt-1 text-sm text-muted-foreground">Upload an original PNG, JPG/JPEG, or PDF after choosing a project.</p>
                </div>
              )}

              {layout && (
                <>
                  <div className="max-h-[75vh] min-h-64 overflow-auto rounded-lg border bg-slate-800 p-3">
                    {drawingSize && (
                      <div
                        className="relative mx-auto max-w-full origin-center bg-white shadow-lg"
                        style={{
                          width: `min(100%, ${Math.min(1200, drawingSize.width)}px)`,
                          aspectRatio: `${drawingSize.width} / ${drawingSize.height}`,
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        }}
                      >
                        {drawingIsPdf ? (
                          <canvas ref={pdfCanvasRef} className="absolute inset-0 h-full w-full" />
                        ) : (
                          <img
                            src={drawingUrl}
                            alt={`Original site plan ${layout.originalFilename}`}
                            className="absolute inset-0 h-full w-full select-none"
                            style={{ objectFit: "fill" }}
                            draggable={false}
                            onLoad={(event) => handleDrawingImageLoad(event.currentTarget)}
                          />
                        )}
                        <svg
                          ref={svgRef}
                          viewBox="0 0 1 1"
                          preserveAspectRatio="none"
                          className={`absolute inset-0 h-full w-full ${tool === "POLYGON" ? "cursor-crosshair" : tool === "RECTANGLE" ? "cursor-crosshair" : "cursor-default"}`}
                          onPointerDown={handlePointerDown}
                          onPointerMove={handlePointerMove}
                          onPointerUp={finishPointerAction}
                          onPointerCancel={finishPointerAction}
                          onClick={handlePolygonClick}
                        >
                          <rect data-layout-canvas="true" x="0" y="0" width="1" height="1" fill="transparent" pointerEvents="all" />
                          {!preview && tool === "SELECT" && detectedRegions
                            .map((region, index) => ({ region, index }))
                            .filter(({ region }) => !shapes.some((shape) => matchesDetectedRegion(shape, region)))
                            .map(({ region, index }) => (
                            <polygon
                              key={region.id}
                              points={region.points.map((point) => `${point.x},${point.y}`).join(" ")}
                              fill="transparent"
                              stroke="#10b981"
                              strokeWidth="2"
                              strokeDasharray="0.004 0.003"
                              vectorEffect="non-scaling-stroke"
                              role="button"
                              tabIndex={0}
                              aria-label={`Detected green unit region ${index + 1}`}
                              className="cursor-pointer"
                              onClick={(event) => {
                                event.stopPropagation();
                                selectDetectedRegion(region);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  selectDetectedRegion(region);
                                }
                              }}
                            />
                          ))}
                          {shapes.map((shape) => {
                            const selected = selectedShapeId === shape.id;
                            const unit = units.find((candidate) => candidate.id === shape.unitId) || shape.unit;
                            return (
                              <g key={shape.id}>
                                <polygon
                                  points={coordinatesToPoints(shape)}
                                  fill="transparent"
                                  stroke={selected ? "#1d4ed8" : "#10b981"}
                                  strokeWidth={selected ? 2.5 : 1.5}
                                  vectorEffect="non-scaling-stroke"
                                  role="button"
                                  tabIndex={preview ? -1 : 0}
                                  aria-label={`Shape ${shape.kind.toLowerCase()}${unit ? ` mapped to unit ${unit.number}` : ", not mapped"}`}
                                  aria-pressed={selected}
                                  className={tool === "SELECT" && !preview ? "cursor-pointer" : ""}
                                  onPointerDown={(event) => beginShapeDrag(event, shape)}
                                  onClick={() => {
                                    if (preview) return;
                                    if (tool === "POLYGON") return;
                                    setSelectedShapeId(shape.id);
                                    setEditingShapeId("");
                                    setRedrawingShapeId("");
                                    setActiveMappingUnitId("");
                                    setTool("SELECT");
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setSelectedShapeId(shape.id);
                                      setActiveMappingUnitId("");
                                      setTool("SELECT");
                                    }
                                  }}
                                />
                                {unit && (
                                  <text
                                    x={shapeCenter(shape).x}
                                    y={shapeCenter(shape).y}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize="0.018"
                                    fill="#0f172a"
                                    stroke="white"
                                    strokeWidth="0.003"
                                    paintOrder="stroke"
                                    pointerEvents="none"
                                  >{unit.number}</text>
                                )}
                                {selected && editingShapeId === shape.id && !preview && tool === "SELECT" && shape.kind === "RECTANGLE" && [
                                  { x: shape.geometry.x, y: shape.geometry.y },
                                  { x: shape.geometry.x + shape.geometry.width, y: shape.geometry.y },
                                  { x: shape.geometry.x + shape.geometry.width, y: shape.geometry.y + shape.geometry.height },
                                  { x: shape.geometry.x, y: shape.geometry.y + shape.geometry.height },
                                ].map((point, corner) => (
                                  <circle key={corner} cx={point.x} cy={point.y} r="0.009" fill="white" stroke="#1d4ed8" strokeWidth="2" className="cursor-nwse-resize"
                                    onPointerDown={(event) => beginResize(event, { kind: "resize-rectangle", id: shape.id, corner, initial: shape })} />
                                ))}
                                {selected && editingShapeId === shape.id && !preview && tool === "SELECT" && shape.kind === "POLYGON" && shape.geometry.points.map((point, index) => (
                                  <circle key={index} cx={point.x} cy={point.y} r="0.009" fill="white" stroke="#1d4ed8" strokeWidth="0.003" className="cursor-crosshair"
                                    onPointerDown={(event) => beginResize(event, { kind: "move-point", id: shape.id, point: index, initial: shape })} />
                                ))}
                              </g>
                            );
                          })}
                          {pendingPolygon.length > 0 && <polyline points={pendingPolygon.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="0.003" />}
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Original file is retained unchanged. Shape positions are stored as normalized drawing coordinates; mappings only reference existing units.</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Unit mapping</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="layout-draft">Open saved layout</Label>
                <Select value={layout?.id || ""} onValueChange={(value) => void loadLayout(value)} disabled={!layouts.length || editorLoading}>
                  <SelectTrigger id="layout-draft"><SelectValue placeholder={layouts.length ? "Select a saved layout" : "No saved layouts"} /></SelectTrigger>
                  <SelectContent>{layouts.map((draft) => <SelectItem key={draft.id} value={draft.id}>{draft.name} · {draft.status === "PUBLISHED" ? "Finalized" : "Draft"} ({draft._count.shapes} shapes)</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{layouts.length} saved layout{layouts.length === 1 ? "" : "s"} for this project.</p>
              </div>

              {layout && !preview && (
                <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
                  <div>
                    <h3 className="text-sm font-semibold text-indigo-950">Unit Mapping</h3>
                    <p className="text-xs text-indigo-900">
                      {selectedShape
                        ? "Choose an existing project unit to map it to the selected shape."
                        : "Choose an existing project unit first, then draw a rectangle or polygon around it on the plan."}
                    </p>
                  </div>
                  <div aria-label="Unit mapping progress" className="grid grid-cols-3 gap-2 rounded-md bg-white p-2 text-center text-xs">
                    <div><span className="block text-muted-foreground">Total shapes</span><strong>{shapes.length}</strong></div>
                    <div><span className="block text-muted-foreground">Mapped units</span><strong>{mappedShapeCount}</strong></div>
                    <div><span className="block text-muted-foreground">Unmapped units</span><strong>{shapes.length - mappedShapeCount}</strong></div>
                  </div>
                  {selectedShape ? (
                    <div className="space-y-2">
                      <Label htmlFor="unit-map-search">Find a unit</Label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input id="unit-map-search" value={unitQuery} onChange={(event) => setUnitQuery(event.target.value)} placeholder="Search number, block, floor…" className="pl-8" />
                      </div>
                      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border bg-white p-1">
                        {filteredUnits.map((unit) => {
                          const mappedElsewhere = activeUnitIds.has(unit.id);
                          return (
                            <button
                              key={unit.id}
                              type="button"
                              disabled={mappedElsewhere}
                              onClick={() => setShapeUnit(selectedShape.id, unit.id)}
                              className={`w-full rounded px-2 py-2 text-left text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 ${selectedShape.unitId === unit.id ? "bg-emerald-50 ring-1 ring-emerald-500" : ""}`}
                            >
                              <span className="block font-semibold">{unitLabel(unit)}</span>
                              <span className="mt-0.5 block text-muted-foreground">
                                {unit.area != null ? `${unit.area.toLocaleString()} sq.ft · ` : ""}
                                {unit.price != null ? `₹${unit.price.toLocaleString("en-IN")} · ` : ""}
                                {unit.status}
                                {mappedElsewhere ? " · mapped already" : ""}
                              </span>
                            </button>
                          );
                        })}
                        {!filteredUnits.length && <p className="p-3 text-xs text-muted-foreground">{units.length ? "No units match this search." : "This project has no units to map."}</p>}
                      </div>
                      {selectedShape.unitId && (
                        <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-100 p-2 text-xs text-emerald-950">
                          <span>Mapped to {units.find((unit) => unit.id === selectedShape.unitId)?.number || selectedShape.unit?.number}</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setShapeUnit(selectedShape.id, "")}>Unmap</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="unit-to-map">Unit to map to next shape</Label>
                      <Select
                        value={activeMappingUnitId}
                        onValueChange={(unitId) => {
                          setActiveMappingUnitId(unitId);
                          setError("");
                          setTool("SELECT");
                        }}
                        disabled={!availableMappingUnits.length}
                      >
                        <SelectTrigger id="unit-to-map" className="bg-white">
                          <SelectValue placeholder={availableMappingUnits.length ? "Select an unmapped unit" : "All units are mapped"} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMappingUnits.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>{unitLabel(unit)} · {unit.status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-indigo-900">
                        Each unit can be mapped only once. Selecting a unit enables the Rectangle and Polygon drawing tools.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selectedShape && !preview && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">Selected shape</h3>
                      <p className="text-xs text-muted-foreground">{selectedShape.kind === "RECTANGLE" ? "Rectangle" : "Polygon"} · normalized coordinates</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => { setSelectedShapeId(""); setEditingShapeId(""); setRedrawingShapeId(""); setPendingPolygon([]); setActiveMappingUnitId(""); setUnitQuery(""); setTool("SELECT"); }}>
                      Map another unit
                    </Button>
                  </div>
                </div>
              )}

              {layout && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Shapes ({shapes.length})</h3>
                    {!preview && <Button type="button" variant="ghost" size="sm" onClick={() => { setShapes([]); setSelectedShapeId(""); }}>Clear shapes</Button>}
                  </div>
                  {!shapes.length && <p className="rounded-md bg-slate-50 p-3 text-xs text-muted-foreground">No shapes yet. Choose Rectangle or Polygon and draw over the site plan.</p>}
                  {shapes.map((shape, index) => {
                    const unit = units.find((candidate) => candidate.id === shape.unitId) || shape.unit;
                    return (
                      <button type="button" key={shape.id} onClick={() => { setSelectedShapeId(shape.id); setEditingShapeId(""); setRedrawingShapeId(""); setActiveMappingUnitId(""); setTool("SELECT"); }}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-xs ${selectedShapeId === shape.id ? "border-indigo-400 bg-indigo-50" : "bg-white"}`}>
                        <span className="truncate">{index + 1}. {shape.kind === "RECTANGLE" ? "Rectangle" : "Polygon"}</span>
                        <span className={`truncate font-medium ${unit ? "text-emerald-800" : "text-amber-700"}`}>
                          {unit ? `Mapped · ${unit.number}` : "Not mapped · assign unit"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deletingLayoutId) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this custom layout?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.name}” and its saved shape mappings will be permanently deleted. The original drawing file will also be removed.`
                : "This layout and its mappings will be permanently deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingLayoutId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void deleteLayout(); }}
              disabled={Boolean(deletingLayoutId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingLayoutId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete layout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
