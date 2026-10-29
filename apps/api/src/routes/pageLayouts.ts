import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { getAllFieldDefinitions, getPageLayout, invalidateCache } from '../services/metadata';
import { countLayoutAssignments, validateIncomingSections, writeLayoutAudit } from '../services/layoutAccess';

const router = Router();
router.use(authenticate);

router.get('/:objectName', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const layouts = await prisma.pageLayout.findMany({
      where: { tenantId: req.tenantId!, objectId: object.id },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: layouts });
  } catch (error) {
    console.error('Get layouts error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch layouts' });
  }
});

router.get('/:objectName/default', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const layout = await getPageLayout(req.tenantId!, object.id);
    if (!layout) {
      return res.status(404).json({ success: false, error: 'No layout found' });
    }

    let responseLayout = layout;
    if (object.name.toLowerCase() === 'lead') {
      const rawSections = typeof layout.sections === 'string'
        ? JSON.parse(layout.sections)
        : layout.sections;
      const sections = Array.isArray(rawSections)
        ? rawSections as Array<{ name?: string; fields?: string[] }>
        : [];
      if (sections.some((section) => section.name === 'Prospect Information')) {
        const configuredFields = new Set(sections.flatMap((section) => section.fields || []));
        const visibleFields = (await getAllFieldDefinitions(req.tenantId!, object.id, object.name))
          .filter((field) => field.isActive && field.visible);
        const missingFields = visibleFields
          .map((field) => field.name)
          .filter((name) => !configuredFields.has(name));
        if (missingFields.length) {
          const leadInformation = sections.find(
            (section) => section.name === 'Lead Information' || section.name === 'Lead Details',
          );
          if (leadInformation) {
            leadInformation.fields = [...new Set([...(leadInformation.fields || []), ...missingFields])];
          } else {
            sections.unshift({ name: 'Lead Information', fields: missingFields });
          }
          responseLayout = await prisma.pageLayout.update({
            where: { id: layout.id },
            data: { sections: JSON.stringify(sections) },
          });
          invalidateCache(req.tenantId!, object.name);
        }
      }
    }

    res.json({ success: true, data: responseLayout });
  } catch (error) {
    console.error('Get default layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch default layout' });
  }
});

router.post('/:objectName', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const { name, isDefault, sections } = req.body;
    if (!name || !sections) {
      return res.status(400).json({ success: false, error: 'Name and sections are required' });
    }

    if (isDefault) {
      await prisma.pageLayout.updateMany({
        where: { tenantId: req.tenantId!, objectId: object.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const invalid = await validateIncomingSections(req.tenantId!, object.id, object.name, sections);
    if (invalid) {
      return res.status(400).json({ success: false, error: invalid });
    }

    const layout = await prisma.pageLayout.create({
      data: {
        tenantId: req.tenantId!,
        objectId: object.id,
        name,
        isDefault: isDefault || false,
        sections: JSON.stringify(sections),
        createdBy: req.user!.id,
      },
    });

    await writeLayoutAudit(req.tenantId!, req.user?.id, 'CREATE', layout.id, null, { name, sections });
    invalidateCache(req.tenantId!, object.name);
    res.status(201).json({ success: true, data: layout });
  } catch (error) {
    console.error('Create layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to create layout' });
  }
});

router.put('/:objectName/:layoutId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existing = await prisma.pageLayout.findFirst({
      where: { id: req.params.layoutId, tenantId: req.tenantId!, objectId: object.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Layout not found' });
    }

    const { name, isDefault, sections } = req.body;

    if (sections !== undefined) {
      const invalid = await validateIncomingSections(req.tenantId!, object.id, object.name, sections);
      if (invalid) {
        return res.status(400).json({ success: false, error: invalid });
      }
    }

    if (isDefault) {
      await prisma.pageLayout.updateMany({
        where: { tenantId: req.tenantId!, objectId: object.id, isDefault: true, id: { not: req.params.layoutId } },
        data: { isDefault: false },
      });
    }

    const layout = await prisma.pageLayout.update({
      where: { id: req.params.layoutId },
      data: {
        ...(name !== undefined && { name }),
        ...(isDefault !== undefined && { isDefault }),
        ...(sections !== undefined && { sections: JSON.stringify(sections) }),
        updatedBy: req.user!.id,
      },
    });

    await writeLayoutAudit(
      req.tenantId!,
      req.user?.id,
      'UPDATE',
      layout.id,
      { name: existing.name, sections: existing.sections },
      { name: layout.name, sections: layout.sections },
    );
    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, data: layout });
  } catch (error) {
    console.error('Update layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to update layout' });
  }
});

router.delete('/:objectName/:layoutId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existing = await prisma.pageLayout.findFirst({
      where: { id: req.params.layoutId, tenantId: req.tenantId!, objectId: object.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Layout not found' });
    }

    if (existing.isDefault) {
      return res.status(400).json({ success: false, error: 'Cannot delete the default layout' });
    }

    const assigned = await countLayoutAssignments(existing.id);
    if (assigned > 0) {
      return res.status(400).json({ success: false, error: 'This layout is assigned to a profile. Reassign it before deleting.' });
    }

    await prisma.pageLayout.delete({ where: { id: req.params.layoutId } });
    await writeLayoutAudit(req.tenantId!, req.user?.id, 'DELETE', existing.id, { name: existing.name }, null);

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, message: 'Layout deleted successfully' });
  } catch (error) {
    console.error('Delete layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete layout' });
  }
});

export { router as pageLayoutRoutes };