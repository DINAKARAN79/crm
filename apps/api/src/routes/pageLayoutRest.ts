import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { parseLayoutDocument } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { invalidateCache } from '../services/metadata';
import {
  countLayoutAssignments,
  layoutFieldCatalog,
  validateIncomingSections,
  writeLayoutAudit,
} from '../services/layoutAccess';

const router = Router();
router.use(authenticate);

async function findObject(tenantId: string, objectName: string) {
  return prisma.objectDefinition.findFirst({
    where: { tenantId, name: { equals: objectName, mode: 'insensitive' } },
  });
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const objectName = String(req.query.object || '').trim();
    if (!objectName) return res.status(400).json({ success: false, error: 'Object is required' });
    const object = await findObject(req.tenantId!, objectName);
    if (!object) return res.status(404).json({ success: false, error: 'Object not found' });
    const layouts = await prisma.pageLayout.findMany({
      where: { tenantId: req.tenantId!, objectId: object.id },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: layouts });
  } catch (error) {
    console.error('List page layouts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch layouts' });
  }
});

router.post('/', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const objectName = String(req.body?.object || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!objectName || !name) return res.status(400).json({ success: false, error: 'Object and name are required' });
    const object = await findObject(req.tenantId!, objectName);
    if (!object) return res.status(404).json({ success: false, error: 'Object not found' });
    const sections = req.body?.sections ?? parseLayoutDocument(null, name);
    const invalid = await validateIncomingSections(req.tenantId!, object.id, object.name, sections);
    if (invalid) return res.status(400).json({ success: false, error: invalid });
    if (req.body?.isDefault) {
      await prisma.pageLayout.updateMany({
        where: { tenantId: req.tenantId!, objectId: object.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    const layout = await prisma.pageLayout.create({
      data: {
        tenantId: req.tenantId!,
        objectId: object.id,
        name,
        isDefault: req.body?.isDefault === true,
        sections: JSON.stringify(sections),
        createdBy: req.user!.id,
      },
    });
    await writeLayoutAudit(req.tenantId!, req.user?.id, 'CREATE', layout.id, null, { name, sections });
    invalidateCache(req.tenantId!, object.name);
    res.status(201).json({ success: true, data: layout });
  } catch (error) {
    console.error('Create page layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to create layout' });
  }
});

router.get('/:id/preview', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const layout = await prisma.pageLayout.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { object: { select: { id: true, name: true } } },
    });
    if (!layout) return res.status(404).json({ success: false, error: 'Layout not found' });
    const profileId = String(req.query.profileId || '').trim();
    const profile = profileId
      ? await prisma.profile.findFirst({
        where: { id: profileId, OR: [{ tenantId: req.tenantId! }, { isGlobal: true }] },
        select: { id: true, name: true },
      })
      : null;
    if (profileId && !profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const permissions: Record<string, { canRead: boolean; canEdit: boolean }> = {};
    if (profile) {
      const rows = await prisma.profileFieldPermission.findMany({
        where: { tenantId: req.tenantId!, profileId: profile.id, field: { objectId: layout.objectId } },
        select: { canRead: true, canEdit: true, field: { select: { name: true } } },
      });
      for (const row of rows) permissions[row.field.name] = { canRead: row.canRead, canEdit: row.canEdit };
    }
    const fields = await layoutFieldCatalog(req.tenantId!, layout.objectId, layout.object.name);
    res.json({
      success: true,
      data: {
        layout,
        document: parseLayoutDocument(layout.sections, layout.name),
        profile,
        permissions,
        fields,
      },
    });
  } catch (error) {
    console.error('Preview page layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to preview layout' });
  }
});

router.post('/:id/clone', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.pageLayout.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { object: { select: { name: true } } },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Layout not found' });
    const name = String(req.body?.name || `Copy of ${existing.name}`).trim();
    const layout = await prisma.pageLayout.create({
      data: {
        tenantId: existing.tenantId,
        objectId: existing.objectId,
        name,
        isDefault: false,
        sections: existing.sections as object,
        createdBy: req.user!.id,
      },
    });
    await writeLayoutAudit(req.tenantId!, req.user?.id, 'CLONE', layout.id, { sourceId: existing.id }, { name });
    invalidateCache(req.tenantId!, existing.object.name);
    res.status(201).json({ success: true, data: layout });
  } catch (error) {
    console.error('Clone page layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to clone layout' });
  }
});

router.put('/:id', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.pageLayout.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { object: { select: { id: true, name: true } } },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Layout not found' });
    if (req.body?.sections !== undefined) {
      const invalid = await validateIncomingSections(req.tenantId!, existing.object.id, existing.object.name, req.body.sections);
      if (invalid) return res.status(400).json({ success: false, error: invalid });
    }
    if (req.body?.isDefault === true) {
      await prisma.pageLayout.updateMany({
        where: { tenantId: req.tenantId!, objectId: existing.objectId, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }
    const layout = await prisma.pageLayout.update({
      where: { id: existing.id },
      data: {
        ...(req.body?.name !== undefined && { name: String(req.body.name).trim() }),
        ...(req.body?.isDefault !== undefined && { isDefault: req.body.isDefault === true }),
        ...(req.body?.sections !== undefined && { sections: JSON.stringify(req.body.sections) }),
        updatedBy: req.user!.id,
      },
    });
    await writeLayoutAudit(req.tenantId!, req.user?.id, 'UPDATE', layout.id, { name: existing.name, sections: existing.sections }, { name: layout.name, sections: layout.sections });
    invalidateCache(req.tenantId!, existing.object.name);
    res.json({ success: true, data: layout });
  } catch (error) {
    console.error('Update page layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to update layout' });
  }
});

router.delete('/:id', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.pageLayout.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { object: { select: { name: true } } },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Layout not found' });
    if (existing.isDefault) return res.status(400).json({ success: false, error: 'Cannot delete the default layout' });
    const assigned = await countLayoutAssignments(existing.id);
    if (assigned > 0) {
      return res.status(400).json({ success: false, error: 'This layout is assigned to a profile. Reassign it before deleting.' });
    }
    await prisma.pageLayout.delete({ where: { id: existing.id } });
    await writeLayoutAudit(req.tenantId!, req.user?.id, 'DELETE', existing.id, { name: existing.name }, null);
    invalidateCache(req.tenantId!, existing.object.name);
    res.json({ success: true, message: 'Layout deleted successfully' });
  } catch (error) {
    console.error('Delete page layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete layout' });
  }
});

export { router as pageLayoutRestRoutes };
