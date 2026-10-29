import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { listOrderBy, listViewConstraint, mergeListWhere } from '../services/listViewService';
import { Response } from 'express';
import { authorize, authorizeAny } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import { PaginatedResponse } from '../types';
import { Prisma } from '@prisma/client';
import { ProjectLocationError, reverseGeocodeProjectLocation } from '../services/googleMapsGeocoding';
import { parseGoogleMapsUrl, projectMapUrl, resolveLocationForProjectWrite } from '../services/projectLocation';
import { buildQuoteUnitFacets, classifyQuoteUnit, quoteUnitMatches } from '@dct-crm/shared';

const router = Router();

const projectFields = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  allowedRadiusMeters: z.number().int().min(1).max(5000).optional(),
  totalUnits: z.number().int().min(0).optional(),
});

const coordinatesArePaired = (value: { latitude?: number | null; longitude?: number | null }) =>
  (value.latitude === undefined) === (value.longitude === undefined);
export const projectSchema = projectFields.refine(coordinatesArePaired, {
  message: 'Latitude and longitude must be provided together',
});
export const updateProjectSchema = projectFields.partial().refine(coordinatesArePaired, {
  message: 'Latitude and longitude must be provided together',
});
const projectMapUrlSchema = z.object({ url: z.string().url().max(2048) });
const projectGeocodeSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

function withLocationUrl<T extends { latitude: unknown; longitude: unknown; mapUrl?: string | null }>(project: T) {
  const latitude = project.latitude == null ? null : Number(project.latitude);
  const longitude = project.longitude == null ? null : Number(project.longitude);
  return {
    ...project,
    latitude,
    longitude,
    mapUrl: latitude != null && longitude != null
      ? projectMapUrl(latitude, longitude)
      : null,
    locationUrl: project.mapUrl || (latitude != null && longitude != null
      ? projectMapUrl(latitude, longitude)
      : null),
  };
}

router.get('/', authenticate, authorizeAny([['Project', 'read'], ['SiteVisit', 'create']]), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { page = 1, limit = 50, search, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    if (isActive !== undefined && isActive !== 'true' && isActive !== 'false') {
      return res.status(400).json({ success: false, error: 'Invalid project active filter' });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const where: Prisma.ProjectWhereInput = {
      tenantId,
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
      ...(search && {
        OR: [
          { name: { contains: search as string, mode: 'insensitive' } },
          { address: { contains: search as string, mode: 'insensitive' } },
          { city: { contains: search as string, mode: 'insensitive' } },
        ],
      }),
    };
    const viewConstraint = await listViewConstraint(req, 'PROJECT');
    if (!viewConstraint.ok) return res.status(viewConstraint.status).json({ success: false, error: viewConstraint.error });
    mergeListWhere(where, viewConstraint.where);
    const sorted = listOrderBy('PROJECT', sortBy, sortOrder);
    if (!sorted.ok) return res.status(400).json({ success: false, error: sorted.error });

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: sorted.orderBy as { createdAt: 'asc' | 'desc' },
        include: {
          _count: { select: { units: true, siteVisits: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    const response: PaginatedResponse<typeof projects[0]> = {
      success: true,
      data: projects.map(withLocationUrl),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});

router.get('/:id', authenticate, authorize('Project', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, tenantId },
      include: {
        units: { 
          select: { id: true, number: true, type: true, floor: true, price: true, status: true },
          orderBy: { floor: 'asc' },
        },
        _count: { select: { siteVisits: true } },
      },
    });

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    res.json({ success: true, data: withLocationUrl(project) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch project' });
  }
});

const quoteUnitSelect = {
  id: true,
  number: true,
  type: true,
  block: true,
  floor: true,
  area: true,
  price: true,
  status: true,
} as const;

function presentQuoteUnit(unit: {
  id: string;
  number: string;
  type: string | null;
  block: string | null;
  floor: number | null;
  area: number | null;
  price: number | null;
  status: string;
}) {
  const classified = classifyQuoteUnit(unit.type);
  return { ...unit, propertyType: classified.propertyType, configuration: classified.configuration };
}

router.get('/:id/unit-facets', authenticate, authorize('Unit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const units = await prisma.unit.findMany({
      where: { tenantId: req.tenantId!, projectId: project.id },
      select: { type: true, floor: true, block: true, status: true, area: true },
    });
    res.json({ success: true, data: buildQuoteUnitFacets(units) });
  } catch (error) {
    console.error('Failed to load unit facets:', error);
    res.status(500).json({ success: false, error: 'Failed to load unit choices' });
  }
});

router.get('/:id/units', authenticate, authorize('Unit', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const floorQuery = req.query.floor;
    let floor: number | null = null;
    if (floorQuery != null && String(floorQuery) !== '') {
      floor = Number(floorQuery);
      if (!Number.isInteger(floor) || floor < 0) {
        return res.status(400).json({ success: false, error: 'Floor must be a whole number' });
      }
    }
    const statuses = ['AVAILABLE', 'RESERVED', 'BOOKED', 'HOLD', 'SOLD', 'BLOCKED'] as const;
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    if (status && !statuses.includes(status as typeof statuses[number])) {
      return res.status(400).json({ success: false, error: 'Unknown unit status' });
    }
    const tower = typeof req.query.tower === 'string' ? req.query.tower.trim() : '';
    const propertyType = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const config = typeof req.query.config === 'string' ? req.query.config.trim() : '';

    const units = await prisma.unit.findMany({
      where: {
        tenantId: req.tenantId!,
        projectId: project.id,
        ...(floor != null ? { floor } : {}),
        ...(tower ? { block: tower } : {}),
        ...(status ? { status: status as typeof statuses[number] } : {}),
      },
      select: quoteUnitSelect,
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
    const matched = units
      .map(presentQuoteUnit)
      .filter((unit) => quoteUnitMatches(unit, {
        propertyType: propertyType || classifyQuoteUnit(unit.type).propertyType,
        tower,
        floor,
        config,
      }));
    res.json({ success: true, data: matched });
  } catch (error) {
    console.error('Failed to load project units:', error);
    res.status(500).json({ success: false, error: 'Failed to load project units' });
  }
});

router.post('/geocode', authenticate, authorize('Project', 'read'), async (req: AuthRequest, res: Response) => {
  const parsed = projectGeocodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Valid latitude and longitude are required' });
  }

  try {
    const data = await reverseGeocodeProjectLocation(parsed.data.latitude, parsed.data.longitude);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof ProjectLocationError) {
      if (error.statusCode >= 500) console.error('Project reverse geocoding failed:', error.message);
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    console.error('Project reverse geocoding failed:', error);
    return res.status(502).json({ success: false, error: 'Unable to look up this project location' });
  }
});

router.post('/parse-map-url', authenticate, authorize('Project', 'read'), async (req: AuthRequest, res: Response) => {
  const parsed = projectMapUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'A valid Google Maps URL is required' });
  }

  try {
    const data = await parseGoogleMapsUrl(parsed.data.url);
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof ProjectLocationError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    console.error('Project map URL parsing failed:', error);
    return res.status(502).json({ success: false, error: 'Unable to resolve this Google Maps URL' });
  }
});

router.post('/', authenticate, authorize('Project', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = projectSchema.parse(req.body);
    const location = await resolveLocationForProjectWrite(
      data.latitude,
      data.longitude,
      data.address,
      data.city,
      data.state,
    );

    const project = await prisma.project.create({
      data: {
        ...data,
        address: location.address,
        city: location.city,
        state: location.state,
        mapUrl: location.mapUrl,
        tenantId,
      },
    });

    await auditLog(tenantId, userId, 'CREATE', 'Project', project.id, null, { name: data.name, address: data.address });

    res.status(201).json({ success: true, data: withLocationUrl(project), warning: location.warning });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

router.put('/:id', authenticate, authorize('Project', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const existing = await prisma.project.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const existingLatitude = existing.latitude == null ? null : Number(existing.latitude);
    const existingLongitude = existing.longitude == null ? null : Number(existing.longitude);
    const latitude = data.latitude === undefined ? existingLatitude : data.latitude;
    const longitude = data.longitude === undefined ? existingLongitude : data.longitude;
    const coordinatesChanged = data.latitude !== undefined &&
      (data.latitude !== existingLatitude || data.longitude !== existingLongitude);
    const locationFieldsChanged = data.address !== undefined || data.city !== undefined || data.state !== undefined;
    const shouldResolveLocation = coordinatesChanged ||
      (latitude != null && longitude != null && locationFieldsChanged);
    const location = shouldResolveLocation
      ? await resolveLocationForProjectWrite(latitude, longitude, existing.address, existing.city, existing.state)
      : null;

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...data,
        ...(location && {
          address: location.address,
          city: location.city,
          state: location.state,
          mapUrl: location.mapUrl,
        }),
        updatedAt: new Date(),
      },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Project', id, null, data);

    res.json({ success: true, data: withLocationUrl(project), warning: location?.warning });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

router.delete('/:id', authenticate, authorize('Project', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;

    const existing = await prisma.project.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const hasUnits = await prisma.unit.count({ where: { projectId: id } });
    if (hasUnits > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete project with existing units. Remove all units first.' 
      });
    }

    await prisma.project.delete({ where: { id } });

    await auditLog(tenantId, userId, 'DELETE', 'Project', id, { name: existing.name, address: existing.address }, null);

    res.json({ success: true, data: null });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

export default router;