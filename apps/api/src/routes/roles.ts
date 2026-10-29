import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';

const router = Router();

router.use(authenticate);

const roleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentRoleId: z.string().nullable().optional(),
  permissionSetIds: z.array(z.string()).optional(),
});

const updateRoleSchema = roleSchema.partial();

router.get('/', authorize('Role', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { tenantId: req.tenantId! };
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [roles, total] = await Promise.all([
      prisma.role.findMany({
        where,
        include: {
          permissionSets: {
            include: {
              permissionSet: { select: { id: true, name: true, objectName: true, permissions: true } },
            },
          },
          parentRole: { select: { id: true, name: true } },
          users: {
            select: {
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          _count: { select: { users: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.role.count({ where }),
    ]);

    res.json({
      success: true,
      data: roles,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
});

router.get('/:id', authorize('Role', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        permissionSets: {
          include: {
            permissionSet: { select: { id: true, name: true, objectName: true, permissions: true } },
          },
        },
        parentRole: { select: { id: true, name: true } },
        childRoles: { select: { id: true, name: true } },
        users: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    res.json({ success: true, data: role });
  } catch (error) {
    console.error('Get role error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch role' });
  }
});

router.post('/', authorize('Role', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = roleSchema.parse(req.body);

    const existingRole = await prisma.role.findFirst({
      where: { tenantId: req.tenantId!, name: data.name },
    });

    if (existingRole) {
      return res.status(409).json({ success: false, error: 'Role with this name already exists' });
    }

    if (data.parentRoleId) {
      const parentRole = await prisma.role.findFirst({
        where: { id: data.parentRoleId, tenantId: req.tenantId! },
        select: { id: true },
      });
      if (!parentRole) {
        return res.status(400).json({ success: false, error: 'Parent role not found in this tenant' });
      }

    }

    if (data.permissionSetIds?.length) {
      const permissionSetIds = [...new Set(data.permissionSetIds)];
      const permissionSetCount = await prisma.permissionSet.count({ where: { id: { in: permissionSetIds }, tenantId: req.tenantId! } });
      if (permissionSetCount !== permissionSetIds.length) return res.status(400).json({ success: false, error: 'One or more permission sets were not found in this tenant' });
    }

    const role = await prisma.role.create({
      data: {
        tenantId: req.tenantId!,
        name: data.name,
        description: data.description,
        parentRoleId: data.parentRoleId || undefined,
        permissionSets: data.permissionSetIds
          ? { create: data.permissionSetIds.map((permissionSetId) => ({ permissionSetId })) }
          : undefined,
      },
      include: {
        permissionSets: {
          include: {
            permissionSet: { select: { id: true, name: true, objectName: true } },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CREATE',
        objectType: 'Role',
        objectId: role.id,
        newValues: { name: data.name, description: data.description },
      },
    });

    res.status(201).json({ success: true, data: role });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create role error:', error);
    res.status(500).json({ success: false, error: 'Failed to create role' });
  }
});

router.put('/:id', authorize('Role', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingRole = await prisma.role.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingRole) {
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    if (existingRole.isSystem) {
      return res.status(400).json({ success: false, error: 'Cannot modify system role' });
    }

    const data = updateRoleSchema.parse(req.body);

    if (data.name && data.name !== existingRole.name) {
      const duplicateRole = await prisma.role.findFirst({
        where: { tenantId: req.tenantId!, name: data.name, id: { not: req.params.id } },
      });

      if (duplicateRole) {
        return res.status(409).json({ success: false, error: 'Role with this name already exists' });
      }
    }

    if (data.parentRoleId === req.params.id) {
      return res.status(400).json({ success: false, error: 'A role cannot be its own parent' });
    }

    if (data.parentRoleId) {
      const parentRole = await prisma.role.findFirst({
        where: { id: data.parentRoleId, tenantId: req.tenantId! },
        select: { id: true },
      });
      if (!parentRole) {
        return res.status(400).json({ success: false, error: 'Parent role not found in this tenant' });
      }

      const descendants = new Set<string>();
      let pending = [req.params.id];
      while (pending.length > 0) {
        const children = await prisma.role.findMany({
          where: { tenantId: req.tenantId!, parentRoleId: { in: pending } },
          select: { id: true },
        });
        pending = children.map((child) => child.id).filter((id) => !descendants.has(id));
        pending.forEach((id) => descendants.add(id));
      }
      if (descendants.has(data.parentRoleId)) {
        return res.status(400).json({ success: false, error: 'A role cannot be placed under one of its descendants' });
      }
    }

    if (data.permissionSetIds?.length) {
      const permissionSetIds = [...new Set(data.permissionSetIds)];
      const permissionSetCount = await prisma.permissionSet.count({ where: { id: { in: permissionSetIds }, tenantId: req.tenantId! } });
      if (permissionSetCount !== permissionSetIds.length) return res.status(400).json({ success: false, error: 'One or more permission sets were not found in this tenant' });
    }

    const updateData: any = { ...data };
    delete updateData.permissionSetIds;

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        permissionSets: {
          include: {
            permissionSet: { select: { id: true, name: true, objectName: true } },
          },
        },
      },
    });

    if (data.permissionSetIds) {
      await prisma.permissionSetRole.deleteMany({ where: { roleId: req.params.id } });
      if (data.permissionSetIds.length > 0) {
        await prisma.permissionSetRole.createMany({
          data: data.permissionSetIds.map((permissionSetId) => ({ roleId: req.params.id, permissionSetId })),
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'Role',
        objectId: role.id,
        oldValues: existingRole,
        newValues: data,
      },
    });

    res.json({ success: true, data: role });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update role error:', error);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
});

router.delete('/:id', authorize('Role', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const existingRole = await prisma.role.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingRole) {
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    if (existingRole.isSystem) {
      return res.status(400).json({ success: false, error: 'Cannot delete system role' });
    }

    const userCount = await prisma.user.count({
      where: {
        tenantId: req.tenantId!,
        OR: [
          { roleId: req.params.id },
          { roles: { some: { roleId: req.params.id } } },
        ],
      },
    });
    if (userCount > 0) {
      return res.status(400).json({ success: false, error: `Cannot delete role assigned to ${userCount} user(s). Reassign users first.` });
    }

    await prisma.permissionSetRole.deleteMany({ where: { roleId: req.params.id } });
    await prisma.role.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'Role',
        objectId: req.params.id,
        oldValues: existingRole,
      },
    });

    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete role' });
  }
});

export { router as roleRoutes };