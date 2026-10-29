import { Router, Response, NextFunction } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

const requireProfileCreateAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.isAdmin) return next();
  return requirePermission('PROFILE_CREATE')(req, res, next);
};

const requireProfileDeleteAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.isAdmin) return next();
  return requirePermission('PROFILE_DELETE')(req, res, next);
};

const leadStatusAccessSchema = z.union([
  z.array(z.string()).transform((statuses) => ({ statuses })),
  z.object({
    statuses: z.array(z.string()).optional(),
    recordAccess: z.record(z.enum(['OWN', 'TEAM', 'ALL'])).optional(),
  }),
]).optional();

const profileSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  permissionSetIds: z.array(z.string()).optional(),
  leadStatusAccess: leadStatusAccessSchema,
});

const createProfileSchema = profileSchema.extend({
  tenantId: z.string().optional(),
});

const updateProfileSchema = profileSchema.partial();

function getRequestedTenantId(req: AuthRequest): string {
  return req.user!.isSuperAdmin && typeof req.query.tenantId === 'string'
    ? req.query.tenantId
    : req.tenantId!;
}

function getProfileWhere(req: AuthRequest, profileId: string) {
  const tenantId = getRequestedTenantId(req);
  return req.user!.isSuperAdmin && typeof req.query.tenantId === 'string'
    ? { id: profileId, tenantId }
    : { id: profileId, OR: [{ tenantId }, { isGlobal: true }] };
}

router.get('/', requirePermission('PROFILE_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const tenantId = getRequestedTenantId(req);
    const isCompanyScopedSuperAdmin = req.user!.isSuperAdmin && typeof req.query.tenantId === 'string';
    const where: any = isCompanyScopedSuperAdmin
      ? { tenantId }
      : { OR: [{ tenantId }, { isGlobal: true }] };
    if (search) {
      where.AND = [{
        OR: [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ],
      }];
    }

    const [profiles, total] = await Promise.all([
      prisma.profile.findMany({
        where,
        include: {
          permissionSets: { where: { tenantId } },
          _count: { select: { users: { where: { tenantId } } } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.profile.count({ where }),
    ]);

    res.json({
      success: true,
      data: profiles,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profiles' });
  }
});

router.get('/:id', requirePermission('PROFILE_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.profile.findFirst({
      where: getProfileWhere(req, req.params.id),
      include: {
        permissionSets: { where: { tenantId: getRequestedTenantId(req) } },
        users: {
          where: { tenantId: getRequestedTenantId(req) },
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { users: { where: { tenantId: getRequestedTenantId(req) } } } },
      },
    });

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    res.json({ success: true, data: profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

router.post('/', requireProfileCreateAccess, async (req: AuthRequest, res: Response) => {
  try {
    const data = createProfileSchema.parse(req.body);
    const tenantId = req.user!.isSuperAdmin && data.tenantId
      ? data.tenantId
      : req.tenantId!;

    if (data.isAdmin === true && !req.user!.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only Super Admin can change administrator status' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const existingProfile = await prisma.profile.findFirst({
      where: req.user!.isSuperAdmin
        ? { tenantId, name: data.name }
        : { name: data.name, OR: [{ tenantId: req.tenantId! }, { isGlobal: true }] },
    });

    if (existingProfile) {
      return res.status(409).json({ success: false, error: 'Profile with this name already exists' });
    }

    const profile = await prisma.profile.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        isDefault: data.isDefault ?? false,
        isAdmin: data.isAdmin ?? false,
        isGlobal: false,
        leadStatusAccess: data.leadStatusAccess ?? undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: req.user!.id,
        action: 'CREATE',
        objectType: 'Profile',
        objectId: profile.id,
        newValues: { name: data.name, description: data.description },
      },
    });

    res.status(201).json({ success: true, data: profile });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to create profile' });
  }
});

router.put('/:id', requirePermission('PROFILE_UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const existingProfile = await prisma.profile.findFirst({
      where: getProfileWhere(req, req.params.id),
    });

    if (!existingProfile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    if (existingProfile.isGlobal && !req.user!.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only Super Admin can modify a shared profile' });
    }

    if (existingProfile.isDefault) {
      return res.status(400).json({ success: false, error: 'Cannot modify default profile' });
    }

    const data = updateProfileSchema.parse(req.body);

    if (data.isAdmin !== undefined && !req.user!.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only Super Admin can change administrator status' });
    }

    if (data.name && data.name !== existingProfile.name) {
      const duplicateProfile = await prisma.profile.findFirst({
        where: existingProfile.isGlobal
          ? { name: data.name, id: { not: req.params.id } }
          : {
              name: data.name,
              id: { not: req.params.id },
              ...(req.user!.isSuperAdmin && typeof req.query.tenantId === 'string'
                ? { tenantId: getRequestedTenantId(req) }
                : { OR: [{ tenantId: req.tenantId! }, { isGlobal: true }] }),
            },
      });

      if (duplicateProfile) {
        return res.status(409).json({ success: false, error: 'Profile with this name already exists' });
      }
    }

    const updateData: any = { ...data };
    delete updateData.permissionSetIds;

    if (data.leadStatusAccess !== undefined) {
      const existingAccess = existingProfile.leadStatusAccess &&
        typeof existingProfile.leadStatusAccess === 'object' &&
        !Array.isArray(existingProfile.leadStatusAccess)
        ? existingProfile.leadStatusAccess as Record<string, unknown>
        : {};
      updateData.leadStatusAccess = { ...existingAccess, ...data.leadStatusAccess };
    }

    const profile = await prisma.profile.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: existingProfile.tenantId,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'Profile',
        objectId: profile.id,
        oldValues: existingProfile,
        newValues: data,
      },
    });

    res.json({ success: true, data: profile });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

router.delete('/:id', requireProfileDeleteAccess, async (req: AuthRequest, res: Response) => {
  try {
    const existingProfile = await prisma.profile.findFirst({
      where: getProfileWhere(req, req.params.id),
    });

    if (!existingProfile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    if (existingProfile.isGlobal && !req.user!.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Only Super Admin can delete a shared profile' });
    }

    if (existingProfile.isDefault) {
      return res.status(400).json({ success: false, error: 'Cannot delete default profile' });
    }

    const userCount = await prisma.user.count({ where: { profileId: req.params.id } });
    if (userCount > 0) {
      return res.status(400).json({ success: false, error: `Cannot delete profile assigned to ${userCount} user(s). Reassign users first.` });
    }

    await prisma.profile.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: existingProfile.tenantId,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'Profile',
        objectId: req.params.id,
        oldValues: existingProfile,
      },
    });

    res.json({ success: true, message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete profile' });
  }
});

export { router as profileRoutes };