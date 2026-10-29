import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { auditLog } from '../middleware/audit';
import {
  deleteFile,
  generateProjectLayoutFilename,
  getProjectLayoutPath,
  PROJECT_LAYOUT_UPLOAD_DIR,
} from '../services/fileUpload';

const router = Router();
const MAX_DRAWING_SIZE = 25 * 1024 * 1024;
const allowedDrawingTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

router.use(authenticate, requireSuperAdmin);

const drawingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, PROJECT_LAYOUT_UPLOAD_DIR),
    filename: (_req, file, callback) => callback(null, generateProjectLayoutFilename(file.originalname)),
  }),
  limits: { fileSize: MAX_DRAWING_SIZE, files: 1, fields: 0 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedDrawingTypes[extension] || allowedDrawingTypes[extension] !== file.mimetype) {
      callback(new Error('Upload a PNG, JPG/JPEG, or PDF file'));
      return;
    }
    callback(null, true);
  },
});

const selectedTenantProjectSchema = z.object({
  tenantId: z.string().min(1).max(100),
  projectId: z.string().min(1).max(100),
});
const pageSchema = z.coerce.number().int().min(1).max(10_000);
const pointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
}).strict();
const rectangleSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.literal('RECTANGLE'),
  unitId: z.string().min(1).max(100).nullable(),
  geometry: z.object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().gt(0).max(1),
    height: z.number().finite().gt(0).max(1),
  }).strict(),
}).strict();
const polygonSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.literal('POLYGON'),
  unitId: z.string().min(1).max(100).nullable(),
  geometry: z.object({ points: z.array(pointSchema).min(3).max(250) }).strict(),
}).strict();
const saveLayoutSchema = z.object({
  selectedPage: pageSchema,
  finalize: z.boolean().optional(),
  shapes: z.array(z.discriminatedUnion('kind', [rectangleSchema, polygonSchema])).max(5000),
}).strict().superRefine(({ shapes }, context) => {
  const unitIds = new Set<string>();
  const shapeIds = new Set<string>();
  shapes.forEach((shape, index) => {
    if (shapeIds.has(shape.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shapes', index, 'id'],
        message: 'Shape identifiers must be unique in a layout',
      });
    }
    shapeIds.add(shape.id);
    if (shape.kind === 'RECTANGLE' && (shape.geometry.x + shape.geometry.width > 1 || shape.geometry.y + shape.geometry.height > 1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shapes', index, 'geometry'],
        message: 'Rectangle coordinates must fit within the drawing',
      });
    }
    if (shape.unitId && unitIds.has(shape.unitId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shapes', index, 'unitId'],
        message: 'A unit can only be mapped once in a layout',
      });
    }
    if (shape.unitId) unitIds.add(shape.unitId);
  });
});

function handleDrawingUpload(req: AuthRequest, res: Response, next: NextFunction) {
  drawingUpload.single('drawing')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: 'Drawing exceeds the 25 MB upload limit' });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: `Upload failed (${error.code})` });
    }
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload a PNG, JPG/JPEG, or PDF file',
    });
  });
}

async function tenantProjectExists(tenantId: string, projectId: string): Promise<boolean> {
  const [tenant, project] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
    prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } }),
  ]);
  return Boolean(tenant && project);
}

function hasValidFileSignature(filePath: string, extension: string): boolean {
  const header = Buffer.alloc(8);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (extension === '.png') return header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg' || extension === '.jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (extension === '.pdf') return header.subarray(0, 5).toString('ascii') === '%PDF-';
  return false;
}

router.get('/tenants/:tenantId/projects/:projectId/units', async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, projectId } = req.params;
    if (!(await tenantProjectExists(tenantId, projectId))) {
      return res.status(404).json({ success: false, error: 'Project not found for the selected company' });
    }
    const page = Number(req.query.page ?? 1);
    const limit = Math.min(100, Number(req.query.limit ?? 100));
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1) {
      return res.status(400).json({ success: false, error: 'Invalid unit pagination' });
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const where = {
      tenantId,
      projectId,
      ...(search ? { OR: [
        { number: { contains: search, mode: 'insensitive' as const } },
        { type: { contains: search, mode: 'insensitive' as const } },
        { block: { contains: search, mode: 'insensitive' as const } },
      ] } : {}),
    };
    const [units, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        select: { id: true, number: true, type: true, block: true, floor: true, area: true, price: true, status: true },
        orderBy: [{ block: 'asc' }, { floor: 'asc' }, { number: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.unit.count({ where }),
    ]);
    return res.json({ success: true, data: units, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch {
    console.error('Project layout unit list failed');
    return res.status(500).json({ success: false, error: 'Could not load units for this project' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : '';
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    if (req.query.tenantId !== undefined && (!tenantId || tenantId.length > 100)) {
      return res.status(400).json({ success: false, error: 'Select a valid company' });
    }
    if (req.query.projectId !== undefined && (!projectId || projectId.length > 100)) {
      return res.status(400).json({ success: false, error: 'Select a valid project' });
    }

    if (tenantId && projectId && req.query.overview !== 'true') {
      if (!(await tenantProjectExists(tenantId, projectId))) {
        return res.status(404).json({ success: false, error: 'Project not found for the selected company' });
      }
      const layouts = await prisma.projectLayout.findMany({
        where: { tenantId, projectId, status: { in: ['DRAFT', 'PUBLISHED'] } },
        select: { id: true, name: true, originalFilename: true, mimeType: true, selectedPage: true, status: true, updatedAt: true, _count: { select: { shapes: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      return res.json({ success: true, data: layouts });
    }

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 25);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ success: false, error: 'Invalid layout pagination' });
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status && status !== 'DRAFT' && status !== 'PUBLISHED') {
      return res.status(400).json({ success: false, error: 'Invalid layout status filter' });
    }
    if (projectId && tenantId && !(await tenantProjectExists(tenantId, projectId))) {
      return res.status(404).json({ success: false, error: 'Project not found for the selected company' });
    }
    if (projectId && !tenantId) {
      const project = await prisma.project.findFirst({ where: { id: projectId }, select: { id: true } });
      if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    }
    const where = {
      status: status ? { equals: status } : { in: ['DRAFT', 'PUBLISHED'] },
      ...(tenantId ? { tenantId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { tenant: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
          { project: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
        ],
      } : {}),
    };
    const [layouts, total] = await Promise.all([
      prisma.projectLayout.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          projectId: true,
          name: true,
          originalFilename: true,
          mimeType: true,
          selectedPage: true,
          status: true,
          updatedAt: true,
          tenant: { select: { name: true } },
          project: { select: { name: true } },
          _count: { select: { shapes: true } },
          shapes: { select: { unitId: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.projectLayout.count({ where }),
    ]);
    const data = layouts.map((layout) => {
      const { shapes, ...summary } = layout;
      const mappedUnits = shapes.filter((shape) => Boolean(shape.unitId)).length;
      return { ...summary, mappedUnits, unmappedUnits: shapes.length - mappedUnits };
    });
    return res.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    console.error('Project layout list failed');
    return res.status(500).json({ success: false, error: 'Could not load project layouts' });
  }
});

router.delete('/:layoutId', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = selectedTenantProjectSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Select the company and project for this layout' });
    const existing = await prisma.projectLayout.findFirst({
      where: {
        id: req.params.layoutId,
        tenantId: parsed.data.tenantId,
        projectId: parsed.data.projectId,
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
      select: { id: true, tenantId: true, projectId: true, name: true, storageKey: true },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Project layout not found' });
    await prisma.projectLayout.delete({ where: { id: existing.id } });
    const drawingPath = getProjectLayoutPath(existing.storageKey);
    if (fs.existsSync(drawingPath) && !deleteFile(drawingPath)) {
      console.error(`Project layout drawing cleanup failed for layout ${existing.id}`);
    }
    await auditLog(existing.tenantId, req.user!.id, 'DELETE', 'ProjectLayout', existing.id, {
      projectId: existing.projectId,
      name: existing.name,
    }, undefined, req.ip);
    return res.json({ success: true, message: 'Project layout deleted' });
  } catch {
    console.error('Project layout delete failed');
    return res.status(500).json({ success: false, error: 'Could not delete this project layout' });
  }
});

router.get('/:layoutId', async (req: AuthRequest, res: Response) => {
  try {
    const selected = selectedTenantProjectSchema.safeParse(req.query);
    if (!selected.success) return res.status(400).json({ success: false, error: 'Select a company and project to open this draft' });
    const layout = await prisma.projectLayout.findFirst({
      where: { id: req.params.layoutId, tenantId: selected.data.tenantId, projectId: selected.data.projectId, status: { in: ['DRAFT', 'PUBLISHED'] } },
      include: {
        shapes: {
          select: { id: true, kind: true, geometry: true, unitId: true, unit: { select: { id: true, number: true, type: true, block: true, floor: true, area: true, price: true, status: true } } },
        },
      },
    });
    if (!layout) return res.status(404).json({ success: false, error: 'Project layout not found' });
    return res.json({ success: true, data: layout });
  } catch {
    console.error('Project layout read failed');
    return res.status(500).json({ success: false, error: 'Could not load this draft layout' });
  }
});

router.get('/:layoutId/drawing', async (req: AuthRequest, res: Response) => {
  try {
    const selected = selectedTenantProjectSchema.safeParse(req.query);
    if (!selected.success) return res.status(400).json({ success: false, error: 'Select a company and project to view this drawing' });
    const layout = await prisma.projectLayout.findFirst({
      where: {
        id: req.params.layoutId,
        tenantId: selected.data.tenantId,
        projectId: selected.data.projectId,
      },
      select: { storageKey: true, mimeType: true, originalFilename: true },
    });
    if (!layout) return res.status(404).json({ success: false, error: 'Drawing not found' });
    const drawingPath = getProjectLayoutPath(layout.storageKey);
    if (!fs.existsSync(drawingPath)) return res.status(404).json({ success: false, error: 'Drawing file is unavailable' });
    res.setHeader('Content-Type', layout.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(layout.originalFilename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(drawingPath);
  } catch {
    console.error('Project layout drawing read failed');
    return res.status(500).json({ success: false, error: 'Could not load the drawing file' });
  }
});

router.post(
  '/tenants/:tenantId/projects/:projectId/upload',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { tenantId, projectId } = req.params;
      if (!(await tenantProjectExists(tenantId, projectId))) {
        return res.status(404).json({ success: false, error: 'Project not found for the selected company' });
      }
      return handleDrawingUpload(req, res, next);
    } catch {
      console.error('Project layout upload validation failed');
      return res.status(500).json({ success: false, error: 'Could not validate the selected project' });
    }
  },
  async (req: AuthRequest, res: Response) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'Choose a drawing to upload' });
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (!hasValidFileSignature(req.file.path, extension)) {
      deleteFile(req.file.path);
      return res.status(400).json({ success: false, error: 'The drawing contents do not match its file type' });
    }
    const originalFilename = Array.from(path.basename(req.file.originalname.replace(/\\/g, '/')))
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('')
      .slice(0, 255);
    if (!originalFilename) {
      deleteFile(req.file.path);
      return res.status(400).json({ success: false, error: 'Invalid drawing filename' });
    }
    const { tenantId, projectId } = req.params;
    try {
      const layout = await prisma.projectLayout.create({
        data: {
          tenantId,
          projectId,
          name: path.basename(originalFilename, extension).slice(0, 200) || 'Project layout',
          originalFilename,
          storageKey: path.basename(req.file.filename),
          mimeType: allowedDrawingTypes[extension],
          fileSize: req.file.size,
          createdById: req.user!.id,
          updatedById: req.user!.id,
        },
      });
      await auditLog(tenantId, req.user!.id, 'CREATE', 'ProjectLayout', layout.id, undefined, {
        projectId,
        mimeType: layout.mimeType,
        fileSize: layout.fileSize,
      }, req.ip);
      return res.status(201).json({ success: true, data: layout });
    } catch {
      deleteFile(req.file.path);
      console.error('Project layout upload save failed');
      return res.status(500).json({ success: false, error: 'Could not save the uploaded draft' });
    }
  },
);

router.put('/:layoutId', async (req: AuthRequest, res: Response) => {
  const selected = selectedTenantProjectSchema.safeParse(req.query);
  if (!selected.success) return res.status(400).json({ success: false, error: 'Select a company and project before editing this draft' });
  const parsed = saveLayoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid layout draft' });
  }
  if (parsed.data.finalize && parsed.data.shapes.length === 0) {
    return res.status(400).json({ success: false, error: 'Draw and map at least one unit shape before finalizing this layout' });
  }
  if (parsed.data.finalize && parsed.data.shapes.some((shape) => !shape.unitId)) {
    return res.status(400).json({ success: false, error: 'Map every shape to a unit before finalizing this layout' });
  }
  try {
    const existing = await prisma.projectLayout.findFirst({
      where: {
        id: req.params.layoutId,
        tenantId: selected.data.tenantId,
        projectId: selected.data.projectId,
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
      select: { id: true, tenantId: true, projectId: true, selectedPage: true, status: true },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Draft layout not found' });
    const shapeIds = parsed.data.shapes.map((shape) => shape.id);
    const conflictingShapes = shapeIds.length ? await prisma.projectLayoutShape.findMany({
      where: { id: { in: shapeIds }, layoutId: { not: existing.id } },
      select: { id: true },
    }) : [];
    if (conflictingShapes.length) {
      return res.status(400).json({ success: false, error: 'A shape identifier is already used by another layout' });
    }
    const unitIds = parsed.data.shapes.flatMap((shape) => shape.unitId ? [shape.unitId] : []);
    const validUnitCount = unitIds.length ? await prisma.unit.count({
      where: { id: { in: unitIds }, tenantId: existing.tenantId, projectId: existing.projectId },
    }) : 0;
    if (validUnitCount !== unitIds.length) {
      return res.status(400).json({ success: false, error: 'Every shape must map to a unit in this project and company' });
    }
    const layout = await prisma.$transaction(async (transaction) => {
      await transaction.projectLayoutShape.deleteMany({ where: { layoutId: existing.id } });
      if (parsed.data.shapes.length) {
        await transaction.projectLayoutShape.createMany({
          data: parsed.data.shapes.map((shape) => ({
            layoutId: existing.id,
            id: shape.id,
            unitId: shape.unitId,
            kind: shape.kind,
            geometry: shape.geometry,
          })),
        });
      }
      const hasUnmappedShapes = parsed.data.shapes.length === 0 ||
        parsed.data.shapes.some((shape) => !shape.unitId);
      return transaction.projectLayout.update({
        where: { id: existing.id },
        data: {
          selectedPage: parsed.data.selectedPage,
          status: parsed.data.finalize
            ? 'PUBLISHED'
            : existing.status === 'PUBLISHED' && hasUnmappedShapes
              ? 'DRAFT'
              : existing.status,
          updatedById: req.user!.id,
        },
        include: {
          shapes: {
            select: { id: true, kind: true, geometry: true, unitId: true, unit: { select: { id: true, number: true, type: true, block: true, floor: true, area: true, price: true, status: true } } },
          },
        },
      });
    });
    await auditLog(existing.tenantId, req.user!.id, 'UPDATE', 'ProjectLayout', layout.id,
      { selectedPage: existing.selectedPage },
      { selectedPage: layout.selectedPage, shapeCount: layout.shapes.length, status: layout.status }, req.ip);
    return res.json({ success: true, data: layout });
  } catch {
    console.error('Project layout draft save failed');
    return res.status(500).json({ success: false, error: 'Could not save this draft. Your changes were not applied.' });
  }
});

export default router;
