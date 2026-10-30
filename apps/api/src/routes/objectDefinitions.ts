import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import {
  getObjectDefinitions,
  getObjectDefinition,
  invalidateCache,
} from '../services/metadata';
import { denyUnlessUserObjectAdmin, isUserObjectName } from '../services/userObjectAccess';

const router = Router();
router.use(authenticate);
router.use('/:name', (req: AuthRequest, res: Response, next) => {
  if (denyUnlessUserObjectAdmin(req, res)) return;
  next();
});

const SUPER_ADMIN_ONLY_OBJECTS = new Set(['company', 'companiesapi']);

function isSuperAdminOnlyObject(name: string): boolean {
  return SUPER_ADMIN_ONLY_OBJECTS.has(name.toLowerCase());
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { includeInactive } = req.query;
    const objects = await getObjectDefinitions(req.tenantId!, includeInactive === 'true');
    const visibleObjects = objects.filter((object: { name: string }) => {
      if (!req.user!.isSuperAdmin && isSuperAdminOnlyObject(object.name)) return false;
      if (isUserObjectName(object.name) && !req.user!.isSuperAdmin && !req.user!.isAdmin) return false;
      return true;
    });
    res.json({ success: true, data: visibleObjects });
  } catch (error) {
    console.error('Get objects error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch objects' });
  }
});

router.get('/:name', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user!.isSuperAdmin && isSuperAdminOnlyObject(req.params.name)) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const object = await getObjectDefinition(req.tenantId!, req.params.name);
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }
    res.json({ success: true, data: object });
  } catch (error) {
    console.error('Get object error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch object' });
  }
});

router.post('/', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, label, pluralLabel, description, icon, isAvailableInNavigation, isAvailableInReports } = req.body;

    if (!name || !label || !pluralLabel) {
      return res.status(400).json({ success: false, error: 'Name, label, and plural label are required' });
    }

    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      return res.status(400).json({ success: false, error: 'Object name must start with a letter and contain only letters and numbers' });
    }

    const existing = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Object with this name already exists' });
    }

    const { object, defaultLayout } = await prisma.$transaction(async (transaction) => {
      const createdObject = await transaction.objectDefinition.create({
        data: {
          tenantId: req.tenantId!,
          name,
          label,
          pluralLabel,
          description: description || null,
          icon: icon || null,
          objectType: 'custom',
          isAvailableInNavigation: isAvailableInNavigation !== false,
          isAvailableInReports: isAvailableInReports !== false,
          createdBy: req.user!.id,
          updatedBy: req.user!.id,
        },
      });

      const systemFields = [
        { name: 'id', label: 'ID', fieldType: 'autoNumber', isSystemField: true, isCustomField: false, displayOrder: 0, required: true, searchable: true, sortable: true, filterable: true, editable: false },
        { name: 'record_number', label: 'Record Number', fieldType: 'autoNumber', isSystemField: true, isCustomField: false, displayOrder: 1, required: false, searchable: true, sortable: true, filterable: true, editable: false },
        { name: 'owner', label: 'Owner', fieldType: 'lookup', lookupObject: 'User', isSystemField: true, isCustomField: false, displayOrder: 2, required: false, searchable: true, sortable: true, filterable: true, editable: true },
        { name: 'created_by', label: 'Created By', fieldType: 'lookup', lookupObject: 'User', isSystemField: true, isCustomField: false, displayOrder: 3, required: false, searchable: false, sortable: true, filterable: false, editable: false },
        { name: 'created_at', label: 'Created Date', fieldType: 'dateTime', isSystemField: true, isCustomField: false, displayOrder: 4, required: false, searchable: false, sortable: true, filterable: true, editable: false },
        { name: 'updated_at', label: 'Updated Date', fieldType: 'dateTime', isSystemField: true, isCustomField: false, displayOrder: 5, required: false, searchable: false, sortable: true, filterable: false, editable: false },
        { name: 'is_active', label: 'Is Active', fieldType: 'boolean', isSystemField: true, isCustomField: false, displayOrder: 6, required: false, searchable: false, sortable: true, filterable: true, editable: false },
      ];

      for (const sf of systemFields) {
        await transaction.fieldDefinition.create({
          data: {
            tenantId: req.tenantId!,
            objectId: createdObject.id,
            ...sf,
            createdBy: req.user!.id,
          },
        });
      }

      const createdLayout = await transaction.pageLayout.create({
        data: {
          tenantId: req.tenantId!,
          objectId: createdObject.id,
          name: 'Default Layout',
          isDefault: true,
          sections: JSON.stringify([
            { name: `${label} Information`, fields: ['record_number', 'owner'] },
            { name: 'Details', fields: [] },
          ]),
          createdBy: req.user!.id,
        },
      });

      await transaction.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          action: 'CREATE',
          objectType: 'ObjectDefinition',
          objectId: createdObject.id,
          newValues: { name, label, pluralLabel },
        },
      });

      return { object: createdObject, defaultLayout: createdLayout };
    });

    invalidateCache(req.tenantId!);

    res.status(201).json({ success: true, data: { ...object, layout: defaultLayout } });
  } catch (error) {
    console.error('Create object error:', error);
    res.status(500).json({ success: false, error: 'Failed to create object' });
  }
});

router.put('/:name', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.name, mode: 'insensitive' } },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    if (existing.objectType === 'standard') {
      return res.status(400).json({ success: false, error: 'Cannot modify standard object definition' });
    }

    const { label, pluralLabel, description, icon, isActive, isAvailableInNavigation, isAvailableInReports } = req.body;

    const object = await prisma.objectDefinition.update({
      where: { id: existing.id },
      data: {
        ...(label && { label }),
        ...(pluralLabel && { pluralLabel }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
        ...(isActive !== undefined && { isActive }),
        ...(isAvailableInNavigation !== undefined && { isAvailableInNavigation }),
        ...(isAvailableInReports !== undefined && { isAvailableInReports }),
        updatedBy: req.user!.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'ObjectDefinition',
        objectId: object.id,
        oldValues: { label: existing.label, pluralLabel: existing.pluralLabel },
        newValues: { label: object.label, pluralLabel: object.pluralLabel },
      },
    });

    invalidateCache(req.tenantId!, req.params.name);
    res.json({ success: true, data: object });
  } catch (error) {
    console.error('Update object error:', error);
    res.status(500).json({ success: false, error: 'Failed to update object' });
  }
});

router.delete('/:name', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.name, mode: 'insensitive' } },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    if (existing.objectType === 'standard') {
      return res.status(400).json({ success: false, error: 'Cannot delete standard object' });
    }

    const recordCount = await prisma.customRecord.count({
      where: { objectId: existing.id },
    });
    if (recordCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete object with ${recordCount} records. Delete all records first.`,
      });
    }

    await prisma.objectDefinition.delete({ where: { id: existing.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'ObjectDefinition',
        objectId: existing.id,
        oldValues: { name: existing.name, label: existing.label },
      },
    });

    invalidateCache(req.tenantId!, req.params.name);
    res.json({ success: true, message: 'Object deleted successfully' });
  } catch (error) {
    console.error('Delete object error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete object' });
  }
});

export { router as objectDefinitionRoutes };