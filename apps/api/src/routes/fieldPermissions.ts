import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { invalidateCache } from '../services/metadata';

const router = Router();
router.use(authenticate);
router.use(requirePermission('PROFILE_PERMISSION_MANAGE'));

router.get('/:objectName', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const { roleId } = req.query;
    const where: any = {
      field: { objectId: object.id },
    };
    if (roleId) where.roleId = roleId as string;

    const permissions = await prisma.fieldPermission.findMany({
      where,
      include: {
        role: { select: { id: true, name: true } },
        field: { select: { id: true, name: true, label: true } },
      },
    });

    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Get field permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch field permissions' });
  }
});

router.post('/:objectName', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const { roleId, fieldId, canRead, canEdit } = req.body;
    if (!roleId || !fieldId) {
      return res.status(400).json({ success: false, error: 'Role ID and Field ID are required' });
    }

    const field = await prisma.fieldDefinition.findFirst({
      where: { id: fieldId, objectId: object.id },
    });
    if (!field) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    const existing = await prisma.fieldPermission.findUnique({
      where: { roleId_fieldId: { roleId, fieldId } },
    });

    let permission;
    if (existing) {
      permission = await prisma.fieldPermission.update({
        where: { id: existing.id },
        data: {
          canRead: canRead ?? existing.canRead,
          canEdit: canEdit ?? existing.canEdit,
        },
      });
    } else {
      permission = await prisma.fieldPermission.create({
        data: {
          tenantId: req.tenantId!,
          roleId,
          fieldId,
          canRead: canRead ?? true,
          canEdit: canEdit ?? true,
        },
      });
    }

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, data: permission });
  } catch (error) {
    console.error('Set field permission error:', error);
    res.status(500).json({ success: false, error: 'Failed to set field permission' });
  }
});

router.post('/:objectName/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, error: 'Permissions array is required' });
    }

    const results = [];
    for (const perm of permissions) {
      const { roleId, fieldId, canRead, canEdit } = perm;
      if (!roleId || !fieldId) continue;

      const [role, field] = await Promise.all([
        prisma.role.findFirst({
          where: { id: roleId, tenantId: req.tenantId! },
          select: { id: true },
        }),
        prisma.fieldDefinition.findFirst({
          where: { id: fieldId, objectId: object.id, tenantId: req.tenantId! },
          select: { id: true },
        }),
      ]);
      if (!role || !field) continue;

      const existing = await prisma.fieldPermission.findUnique({
        where: { roleId_fieldId: { roleId, fieldId } },
      });

      if (existing) {
        const updated = await prisma.fieldPermission.update({
          where: { id: existing.id },
          data: {
            canRead: canRead ?? existing.canRead,
            canEdit: canEdit ?? existing.canEdit,
          },
        });
        results.push(updated);
      } else {
        const created = await prisma.fieldPermission.create({
          data: {
            tenantId: req.tenantId!,
            roleId,
            fieldId,
            canRead: canRead ?? true,
            canEdit: canEdit ?? true,
          },
        });
        results.push(created);
      }
    }

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Bulk set field permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to set field permissions' });
  }
});

router.delete('/:objectName/:permissionId', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existing = await prisma.fieldPermission.findFirst({
      where: { id: req.params.permissionId, field: { objectId: object.id } },
      include: { field: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Permission not found' });
    }

    await prisma.fieldPermission.delete({ where: { id: req.params.permissionId } });
    res.json({ success: true, message: 'Field permission deleted successfully' });
  } catch (error) {
    console.error('Delete field permission error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete field permission' });
  }
});

export { router as fieldPermissionRoutes };
