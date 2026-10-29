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

    const permissions = await prisma.objectPermission.findMany({
      where: { objectId: object.id },
      include: {
        role: { select: { id: true, name: true } },
      },
    });

    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Get object permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch permissions' });
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

    const { roleId, canCreate, canRead, canUpdate, canDelete, viewAll, modifyAll } = req.body;
    if (!roleId) {
      return res.status(400).json({ success: false, error: 'Role ID is required' });
    }

    const role = await prisma.role.findFirst({
      where: { id: roleId, tenantId: req.tenantId! },
    });
    if (!role) {
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    const existing = await prisma.objectPermission.findUnique({
      where: { roleId_objectId: { roleId, objectId: object.id } },
    });

    let permission;
    if (existing) {
      permission = await prisma.objectPermission.update({
        where: { id: existing.id },
        data: {
          canCreate: canCreate ?? existing.canCreate,
          canRead: canRead ?? existing.canRead,
          canUpdate: canUpdate ?? existing.canUpdate,
          canDelete: canDelete ?? existing.canDelete,
          viewAll: viewAll ?? existing.viewAll,
          modifyAll: modifyAll ?? existing.modifyAll,
        },
      });
    } else {
      permission = await prisma.objectPermission.create({
        data: {
          tenantId: req.tenantId!,
          roleId,
          objectId: object.id,
          canCreate: canCreate || false,
          canRead: canRead || false,
          canUpdate: canUpdate || false,
          canDelete: canDelete || false,
          viewAll: viewAll || false,
          modifyAll: modifyAll || false,
        },
      });
    }

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, data: permission });
  } catch (error) {
    console.error('Set object permission error:', error);
    res.status(500).json({ success: false, error: 'Failed to set permission' });
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
      const { roleId, canCreate, canRead, canUpdate, canDelete, viewAll, modifyAll } = perm;
      if (!roleId) continue;

      const role = await prisma.role.findFirst({
        where: { id: roleId, tenantId: req.tenantId! },
        select: { id: true },
      });
      if (!role) continue;

      const existing = await prisma.objectPermission.findUnique({
        where: { roleId_objectId: { roleId, objectId: object.id } },
      });

      if (existing) {
        const updated = await prisma.objectPermission.update({
          where: { id: existing.id },
          data: {
            canCreate: canCreate ?? existing.canCreate,
            canRead: canRead ?? existing.canRead,
            canUpdate: canUpdate ?? existing.canUpdate,
            canDelete: canDelete ?? existing.canDelete,
            viewAll: viewAll ?? existing.viewAll,
            modifyAll: modifyAll ?? existing.modifyAll,
          },
        });
        results.push(updated);
      } else {
        const created = await prisma.objectPermission.create({
          data: {
            tenantId: req.tenantId!,
            roleId,
            objectId: object.id,
            canCreate: canCreate || false,
            canRead: canRead || false,
            canUpdate: canUpdate || false,
            canDelete: canDelete || false,
            viewAll: viewAll || false,
            modifyAll: modifyAll || false,
          },
        });
        results.push(created);
      }
    }

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Bulk set permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to set permissions' });
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

    const existing = await prisma.objectPermission.findFirst({
      where: { id: req.params.permissionId, objectId: object.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Permission not found' });
    }

    await prisma.objectPermission.delete({ where: { id: req.params.permissionId } });

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, message: 'Permission deleted successfully' });
  } catch (error) {
    console.error('Delete permission error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete permission' });
  }
});

export { router as objectPermissionRoutes };