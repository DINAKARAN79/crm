import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { invalidateCache } from '../services/metadata';

const router = Router();
router.use(authenticate);

router.get('/:fieldId', async (req: AuthRequest, res: Response) => {
  try {
    const field = await prisma.fieldDefinition.findFirst({
      where: { id: req.params.fieldId },
      include: {
        object: { select: { tenantId: true } },
      },
    });
    if (!field || field.object.tenantId !== req.tenantId) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    const values = await prisma.picklistValue.findMany({
      where: { fieldId: req.params.fieldId },
      orderBy: { displayOrder: 'asc' },
    });

    res.json({ success: true, data: values });
  } catch (error) {
    console.error('Get picklist values error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch picklist values' });
  }
});

router.post('/:fieldId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const field = await prisma.fieldDefinition.findFirst({
      where: { id: req.params.fieldId },
      include: { object: true },
    });
    if (!field || field.object.tenantId !== req.tenantId) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    if (field.fieldType !== 'picklist' && field.fieldType !== 'multiPicklist') {
      return res.status(400).json({ success: false, error: 'Picklist values can only be added to picklist or multi-picklist fields' });
    }

    const { label, value, isDefault, displayOrder } = req.body;
    if (!label) {
      return res.status(400).json({ success: false, error: 'Label is required' });
    }

    const pvValue = value || label.toUpperCase().replace(/\s+/g, '_');

    const existing = await prisma.picklistValue.findFirst({
      where: { fieldId: req.params.fieldId, value: pvValue },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'A picklist value with this value already exists' });
    }

    if (isDefault) {
      await prisma.picklistValue.updateMany({
        where: { fieldId: req.params.fieldId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const maxOrder = await prisma.picklistValue.aggregate({
      where: { fieldId: req.params.fieldId },
      _max: { displayOrder: true },
    });

    const picklistValue = await prisma.picklistValue.create({
      data: {
        tenantId: req.tenantId!,
        fieldId: req.params.fieldId,
        label,
        value: pvValue,
        isDefault: isDefault || false,
        displayOrder: displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });

    invalidateCache(req.tenantId!, field.object.name);
    res.status(201).json({ success: true, data: picklistValue });
  } catch (error) {
    console.error('Create picklist value error:', error);
    res.status(500).json({ success: false, error: 'Failed to create picklist value' });
  }
});

router.put('/:fieldId/:valueId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const field = await prisma.fieldDefinition.findFirst({
      where: { id: req.params.fieldId },
      include: { object: true },
    });
    if (!field || field.object.tenantId !== req.tenantId) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    const existing = await prisma.picklistValue.findFirst({
      where: { id: req.params.valueId, fieldId: req.params.fieldId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Picklist value not found' });
    }

    const { label, value, isActive, isDefault, displayOrder } = req.body;

    if (isDefault) {
      await prisma.picklistValue.updateMany({
        where: { fieldId: req.params.fieldId, isDefault: true, id: { not: req.params.valueId } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.picklistValue.update({
      where: { id: req.params.valueId },
      data: {
        ...(label !== undefined && { label }),
        ...(value !== undefined && { value }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault }),
        ...(displayOrder !== undefined && { displayOrder }),
      },
    });

    invalidateCache(req.tenantId!, field.object.name);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update picklist value error:', error);
    res.status(500).json({ success: false, error: 'Failed to update picklist value' });
  }
});

router.delete('/:fieldId/:valueId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const field = await prisma.fieldDefinition.findFirst({
      where: { id: req.params.fieldId },
      include: { object: true },
    });
    if (!field || field.object.tenantId !== req.tenantId) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    const existing = await prisma.picklistValue.findFirst({
      where: { id: req.params.valueId, fieldId: req.params.fieldId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Picklist value not found' });
    }

    await prisma.picklistValue.delete({ where: { id: req.params.valueId } });

    invalidateCache(req.tenantId!, field.object.name);
    res.json({ success: true, message: 'Picklist value deleted successfully' });
  } catch (error) {
    console.error('Delete picklist value error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete picklist value' });
  }
});

export { router as picklistValueRoutes };
