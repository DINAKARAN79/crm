import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';

const router = Router();
router.use(authenticate);

const homepageSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  layout: z.array(z.union([
    z.string(),
    z.object({
      id: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    }),
  ])),
  profileIds: z.array(z.string()).min(1),
});

function getTenantId(req: AuthRequest): string {
  const requestedTenantId = req.query.tenantId;
  return req.user!.isSuperAdmin && typeof requestedTenantId === 'string'
    ? requestedTenantId
    : req.tenantId!;
}

router.get('/', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const homepages = await prisma.dashboard.findMany({
      where: { tenantId },
      include: {
        sharedProfiles: {
          where: { profile: { tenantId } },
          include: { profile: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, data: homepages });
  } catch (error) {
    console.error('Get homepages error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch home pages' });
  }
});

router.get('/assigned', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { profileId: true } });
    const homepage = user?.profileId
      ? await prisma.dashboard.findFirst({
              where: { tenantId: req.tenantId!, isActive: true, sharedProfiles: { some: { profileId: user.profileId } } },
          include: { sharedProfiles: { include: { profile: { select: { id: true, name: true } } } } },
          orderBy: { updatedAt: 'desc' },
        })
      : null;
    res.json({ success: true, data: homepage });
  } catch (error) {
    console.error('Get assigned homepage error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assigned home page' });
  }
});

router.get('/:id', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const homepage = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        sharedProfiles: {
          where: { profile: { tenantId } },
          include: { profile: { select: { id: true, name: true } } },
        },
      },
    });
    if (!homepage) return res.status(404).json({ success: false, error: 'Home page not found' });
    res.json({ success: true, data: homepage });
  } catch (error) {
    console.error('Get homepage error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch home page' });
  }
});

router.patch('/:id/status', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const status = z.object({ isActive: z.boolean() }).parse(req.body);
    const existing = await prisma.dashboard.findFirst({ where: { id: req.params.id, tenantId: getTenantId(req) } });
    if (!existing) return res.status(404).json({ success: false, error: 'Home page not found' });

    const homepage = await prisma.dashboard.update({
      where: { id: existing.id },
      data: { isActive: status.isActive },
    });
    res.json({
      success: true,
      data: homepage,
      message: status.isActive ? 'Home page activated successfully' : 'Home page deactivated successfully',
    });
  } catch (error: any) {
    if (error.name === 'ZodError') return res.status(400).json({ success: false, error: error.errors[0].message });
    console.error('Update homepage status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update home page status' });
  }
});

router.post('/', authorize('Dashboard', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = homepageSchema.parse(req.body);
    const tenantId = getTenantId(req);
    const profiles = await prisma.profile.findMany({
      where: { tenantId, id: { in: data.profileIds } },
      select: { id: true },
    });
    if (profiles.length !== data.profileIds.length) {
      return res.status(400).json({ success: false, error: 'One or more selected profiles are invalid' });
    }

    const homepage = await prisma.dashboard.create({
      data: {
        tenantId,
        createdBy: req.user!.id,
        name: data.name,
        description: data.description || undefined,
        layout: data.layout,
        sharedProfiles: { create: data.profileIds.map((profileId) => ({ profileId })) },
      },
      include: {
        sharedProfiles: {
          where: { profile: { tenantId } },
          include: { profile: { select: { id: true, name: true } } },
        },
      },
    });
    res.status(201).json({ success: true, data: homepage, message: 'Home page created successfully' });
  } catch (error: any) {
    if (error.name === 'ZodError') return res.status(400).json({ success: false, error: error.errors[0].message });
    if (error.code === 'P2002') return res.status(409).json({ success: false, error: 'A home page with this name already exists' });
    console.error('Create homepage error:', error);
    res.status(500).json({ success: false, error: 'Failed to create home page' });
  }
});

router.put('/:id', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const data = homepageSchema.parse(req.body);
    const tenantId = getTenantId(req);
    const existing = await prisma.dashboard.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Home page not found' });
    const profiles = await prisma.profile.findMany({ where: { tenantId, id: { in: data.profileIds } }, select: { id: true } });
    if (profiles.length !== data.profileIds.length) return res.status(400).json({ success: false, error: 'One or more selected profiles are invalid' });

    const homepage = await prisma.$transaction(async (transaction) => {
      await transaction.dashboardProfileShare.deleteMany({ where: { dashboardId: existing.id } });
      return transaction.dashboard.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          description: data.description ?? undefined,
          layout: data.layout,
          sharedProfiles: { create: data.profileIds.map((profileId) => ({ profileId })) },
        },
        include: {
          sharedProfiles: {
            where: { profile: { tenantId } },
            include: { profile: { select: { id: true, name: true } } },
          },
        },
      });
    });
    res.json({ success: true, data: homepage, message: 'Home page saved successfully' });
  } catch (error: any) {
    if (error.name === 'ZodError') return res.status(400).json({ success: false, error: error.errors[0].message });
    if (error.code === 'P2002') return res.status(409).json({ success: false, error: 'A home page with this name already exists' });
    console.error('Update homepage error:', error);
    res.status(500).json({ success: false, error: 'Failed to save home page' });
  }
});

router.delete('/:id', authorize('Dashboard', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: getTenantId(req) },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Home page not found' });

    await prisma.dashboard.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Home page deleted successfully' });
  } catch (error) {
    console.error('Delete homepage error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete home page' });
  }
});

export { router as homepageRoutes };