import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { bootstrapTenant } from '../services/tenantBootstrap';

const router = Router();

router.use(authenticate);

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  companyCode: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, 'Company code must be alphanumeric'),
  domain: z.string().optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().optional(),
  logo: z.string().optional(),
  settings: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

router.get('/tenants', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, isActive, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { slug: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { users: true, roles: true, reports: true, dashboards: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.tenant.count({ where }),
    ]);

    res.json({
      success: true,
      data: tenants,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tenants' });
  }
});

router.get('/tenants/:id', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { users: true, roles: true, reports: true, dashboards: true, workflows: true, automations: true },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    res.json({ success: true, data: tenant });
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tenant' });
  }
});

router.post('/tenants', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = createTenantSchema.parse(req.body);

    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: data.slug },
    });

    if (existingTenant) {
      return res.status(409).json({ success: false, error: 'Tenant with this slug already exists' });
    }

    const tenant = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          companyCode: data.companyCode,
          domain: data.domain,
          timezone: 'UTC',
          currency: 'INR',
          settings: { timezone: 'UTC', currency: 'INR', dateFormat: 'DD/MM/YYYY' },
        },
      });
      await bootstrapTenant(tx, createdTenant.id, req.user!.id);
      await tx.auditLog.create({
        data: {
          tenantId: createdTenant.id,
          userId: req.user!.id,
          action: 'CREATE',
          objectType: 'Tenant',
          objectId: createdTenant.id,
          newValues: { name: createdTenant.name, slug: createdTenant.slug },
        },
      });
      return createdTenant;
    });

    res.status(201).json({ success: true, data: tenant });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create tenant error:', error);
    res.status(500).json({ success: false, error: 'Failed to create tenant' });
  }
});

router.put('/tenants/:id', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const existingTenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });

    if (!existingTenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const data = updateTenantSchema.parse(req.body);

    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.params.id,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'Tenant',
        objectId: tenant.id,
        oldValues: existingTenant,
        newValues: data,
      },
    });

    res.json({ success: true, data: tenant });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update tenant error:', error);
    res.status(500).json({ success: false, error: 'Failed to update tenant' });
  }
});

router.put('/tenants/:id/deactivate', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.params.id,
        userId: req.user!.id,
        action: 'STATUS_CHANGE',
        objectType: 'Tenant',
        objectId: tenant.id,
        oldValues: { isActive: true },
        newValues: { isActive: false },
      },
    });

    res.json({ success: true, data: updatedTenant });
  } catch (error) {
    console.error('Deactivate tenant error:', error);
    res.status(500).json({ success: false, error: 'Failed to deactivate tenant' });
  }
});

router.put('/tenants/:id/activate', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.params.id,
        userId: req.user!.id,
        action: 'STATUS_CHANGE',
        objectType: 'Tenant',
        objectId: tenant.id,
        oldValues: { isActive: false },
        newValues: { isActive: true },
      },
    });

    res.json({ success: true, data: updatedTenant });
  } catch (error) {
    console.error('Activate tenant error:', error);
    res.status(500).json({ success: false, error: 'Failed to activate tenant' });
  }
});

router.delete('/tenants/:id', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } },
    });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    if (tenant._count.users > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete tenant with active users. Deactivate instead.' });
    }

    await prisma.tenant.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete tenant' });
  }
});

router.get('/stats', requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const [totalTenants, activeTenants, totalUsers, activeUsers] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
    ]);

    const tenantStats = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        _count: {
          select: {
            users: true,
            leads: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        totalTenants,
        activeTenants,
        totalUsers,
        activeUsers,
        tenants: tenantStats,
      },
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch admin stats' });
  }
});

export { router as adminRoutes };
