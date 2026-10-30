import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { getAllFieldDefinitions, invalidateCache } from '../services/metadata';
import { denyUnlessUserObjectAdmin, isUserObjectName } from '../services/userObjectAccess';
import { isHiddenUserField } from '../services/userObject';

const router = Router();
router.use(authenticate);
router.use('/:objectName', (req: AuthRequest, res: Response, next) => {
  if (denyUnlessUserObjectAdmin(req, res)) return;
  next();
});

const VALID_FIELD_TYPES = [
  'text', 'longText', 'richText', 'number', 'integer', 'decimal',
  'currency', 'percentage', 'date', 'dateTime', 'time',
  'boolean', 'email', 'phone', 'url',
  'picklist', 'multiPicklist', 'lookup', 'relationship',
];

const RESERVED_NAMES = [
  'id', 'record_number', 'created_by', 'created_at', 'updated_at',
  'is_active', 'owner', 'tenant', 'object',
];

function validateFieldName(name: string): { valid: boolean; error?: string } {
  if (!name) return { valid: false, error: 'Field name is required' };
  if (RESERVED_NAMES.includes(name.toLowerCase())) {
    return { valid: false, error: `"${name}" is a reserved system field name` };
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
    return { valid: false, error: 'Field name must start with a letter and contain only letters, numbers, and underscores' };
  }
  if (name.length > 60) {
    return { valid: false, error: 'Field name must be 60 characters or less' };
  }
  return { valid: true };
}

function generateApiName(label: string): string {
  return label
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

router.get('/:objectName', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const { includeSystem, includeInactive } = req.query;
    const allFields = await getAllFieldDefinitions(req.tenantId!, object.id, object.name);
    let fields: any[] = allFields;
    if (includeSystem !== 'true') fields = fields.filter((field: any) => !field.isSystemField);
    if (includeInactive !== 'true') fields = fields.filter((field: any) => field.isActive);

    res.json({ success: true, data: fields });
  } catch (error) {
    console.error('Get fields error:', error);
    res.status(500).json({ success: false, error: 'Unable to load fields. Please try again.' });
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

    const {
      name, label, fieldType, description, helpText,
      required, unique, defaultValue,
      searchable, sortable, filterable,
      visible, editable,
      lookupObject, lookupField,
      validationRules, displayOrder,
      minLength, maxLength, minValue, maxValue, precision, scale,
      picklistValues,
    } = req.body;

    if (!label || !fieldType) {
      return res.status(400).json({ success: false, error: 'Label and field type are required' });
    }

    const fieldName = name || generateApiName(label);
    const nameCheck = validateFieldName(fieldName);
    if (!nameCheck.valid) {
      return res.status(400).json({ success: false, error: nameCheck.error });
    }
    if (isUserObjectName(object.name) && isHiddenUserField(fieldName)) {
      return res.status(400).json({ success: false, error: 'This field cannot be added to the User object.' });
    }

    if (!VALID_FIELD_TYPES.includes(fieldType)) {
      return res.status(400).json({ success: false, error: `Invalid field type. Supported types: ${VALID_FIELD_TYPES.join(', ')}` });
    }

    if ((fieldType === 'lookup' || fieldType === 'relationship') && !lookupObject) {
      return res.status(400).json({ success: false, error: 'Related object is required for lookup/relationship fields' });
    }

    const existingField = await prisma.fieldDefinition.findFirst({
      where: { tenantId: req.tenantId!, objectId: object.id, name: fieldName },
    });
    if (existingField) {
      return res.status(409).json({ success: false, error: `A field named "${fieldName}" already exists on this object` });
    }

    const maxOrder = await prisma.fieldDefinition.aggregate({
      where: { tenantId: req.tenantId!, objectId: object.id },
      _max: { displayOrder: true },
    });

    const field = await prisma.fieldDefinition.create({
      data: {
        tenantId: req.tenantId!,
        objectId: object.id,
        name: fieldName,
        label,
        fieldType,
        description: description || null,
        helpText: helpText || null,
        required: required || false,
        unique: unique || false,
        defaultValue: defaultValue || null,
        searchable: searchable || false,
        sortable: sortable || false,
        filterable: filterable || false,
        visible: visible !== false,
        editable: editable !== false,
        isActive: true,
        isSystemField: false,
        isCustomField: true,
        displayOrder: displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
        minLength: minLength ?? null,
        maxLength: maxLength ?? null,
        minValue: minValue ?? null,
        maxValue: maxValue ?? null,
        precision: precision ?? null,
        scale: scale ?? null,
        lookupObject: lookupObject || null,
        lookupField: lookupField || null,
        validationRules: validationRules || null,
        createdBy: req.user!.id,
      },
      include: {
        picklistValues: true,
      },
    });

    if ((fieldType === 'picklist' || fieldType === 'multiPicklist') && picklistValues && Array.isArray(picklistValues)) {
      for (let i = 0; i < picklistValues.length; i++) {
        const pv = picklistValues[i];
        const pvValue = pv.value || pv.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        await prisma.picklistValue.create({
          data: {
            tenantId: req.tenantId!,
            fieldId: field.id,
            label: pv.label,
            value: pvValue,
            isActive: pv.isActive !== false,
            isDefault: pv.isDefault || false,
            displayOrder: pv.displayOrder ?? i,
          },
        });
      }
    }

    const defaultLayout = await prisma.pageLayout.findFirst({
      where: { tenantId: req.tenantId!, objectId: object.id, isDefault: true },
    });
    if (defaultLayout) {
      const sections = JSON.parse(defaultLayout.sections as string) as any[];
      const fieldExists = sections.some((section: any) =>
        section.fields && Array.isArray(section.fields) && section.fields.includes(fieldName)
      );
      if (!fieldExists) {
        if (sections.length === 0) {
          sections.push({ name: 'More Information', fields: [fieldName] });
        } else {
          const lastSection = sections[sections.length - 1];
          if (!lastSection.fields || !Array.isArray(lastSection.fields)) {
            lastSection.fields = [];
          }
          lastSection.fields.push(fieldName);
        }
        await prisma.pageLayout.update({
          where: { id: defaultLayout.id },
          data: { sections: JSON.stringify(sections) },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'FIELD_CREATED',
        objectType: 'FieldDefinition',
        objectId: field.id,
        newValues: { name: fieldName, label, fieldType, objectName: object.name },
      },
    });

    invalidateCache(req.tenantId!, object.name);
    res.status(201).json({ success: true, data: field });
  } catch (error: any) {
    console.error('Create field error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create field' });
  }
});

router.get('/:objectName/:fieldId', async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const field = await prisma.fieldDefinition.findFirst({
      where: { id: req.params.fieldId, tenantId: req.tenantId!, objectId: object.id },
      include: {
        picklistValues: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!field) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    res.json({ success: true, data: field });
  } catch (error) {
    console.error('Get field error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch field' });
  }
});

router.put('/:objectName/:fieldId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existingField = await prisma.fieldDefinition.findFirst({
      where: { id: req.params.fieldId, tenantId: req.tenantId!, objectId: object.id },
    });
    if (!existingField) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    if (existingField.isSystemField) {
      return res.status(400).json({ success: false, error: 'System fields cannot be modified' });
    }

    if (existingField.isStandardField) {
      return res.status(400).json({ success: false, error: 'Standard fields cannot be modified' });
    }

    const {
      label, description, helpText,
      required, unique, defaultValue,
      searchable, sortable, filterable,
      visible, editable,
      lookupObject, lookupField,
      validationRules, displayOrder,
      minLength, maxLength, minValue, maxValue, precision, scale,
      picklistValues,
    } = req.body;

    const field = await prisma.fieldDefinition.update({
      where: { id: req.params.fieldId },
      data: {
        ...(label !== undefined && { label }),
        ...(description !== undefined && { description }),
        ...(helpText !== undefined && { helpText }),
        ...(required !== undefined && { required }),
        ...(unique !== undefined && { unique }),
        ...(defaultValue !== undefined && { defaultValue }),
        ...(searchable !== undefined && { searchable }),
        ...(sortable !== undefined && { sortable }),
        ...(filterable !== undefined && { filterable }),
        ...(visible !== undefined && { visible }),
        ...(editable !== undefined && { editable }),
        ...(lookupObject !== undefined && { lookupObject }),
        ...(lookupField !== undefined && { lookupField }),
        ...(validationRules !== undefined && { validationRules }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(minLength !== undefined && { minLength }),
        ...(maxLength !== undefined && { maxLength }),
        ...(minValue !== undefined && { minValue }),
        ...(maxValue !== undefined && { maxValue }),
        ...(precision !== undefined && { precision }),
        ...(scale !== undefined && { scale }),
        updatedBy: req.user!.id,
      },
      include: {
        picklistValues: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (picklistValues && Array.isArray(picklistValues) && (field.fieldType === 'picklist' || field.fieldType === 'multiPicklist')) {
      await prisma.picklistValue.deleteMany({ where: { fieldId: field.id } });
      for (let i = 0; i < picklistValues.length; i++) {
        const pv = picklistValues[i];
        const pvValue = pv.value || pv.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        await prisma.picklistValue.create({
          data: {
            tenantId: req.tenantId!,
            fieldId: field.id,
            label: pv.label,
            value: pvValue,
            isActive: pv.isActive !== false,
            isDefault: pv.isDefault || false,
            displayOrder: pv.displayOrder ?? i,
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'FIELD_UPDATED',
        objectType: 'FieldDefinition',
        objectId: field.id,
        oldValues: { label: existingField.label, fieldType: existingField.fieldType, required: existingField.required },
        newValues: { label: field.label, fieldType: field.fieldType, required: field.required },
      },
    });

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, data: field });
  } catch (error: any) {
    console.error('Update field error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update field' });
  }
});

router.patch('/:objectName/:fieldId/toggle', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existingField = await prisma.fieldDefinition.findFirst({
      where: { id: req.params.fieldId, tenantId: req.tenantId!, objectId: object.id },
    });
    if (!existingField) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    if (existingField.isSystemField) {
      return res.status(400).json({ success: false, error: 'System fields cannot be deactivated' });
    }

    const newActiveState = !existingField.isActive;
    const field = await prisma.fieldDefinition.update({
      where: { id: req.params.fieldId },
      data: { isActive: newActiveState, updatedBy: req.user!.id },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: newActiveState ? 'FIELD_ACTIVATED' : 'FIELD_DEACTIVATED',
        objectType: 'FieldDefinition',
        objectId: field.id,
        oldValues: { isActive: existingField.isActive },
        newValues: { isActive: newActiveState },
      },
    });

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, data: field });
  } catch (error: any) {
    console.error('Toggle field error:', error);
    res.status(500).json({ success: false, error: 'Failed to update field status' });
  }
});

router.patch('/:objectName/reorder', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const { fieldOrders } = req.body;
    if (!Array.isArray(fieldOrders)) {
      return res.status(400).json({ success: false, error: 'fieldOrders must be an array of { id, displayOrder }' });
    }

    const requestedFieldIds = fieldOrders.map((item: { id: string; displayOrder: number }) => item.id);
    if (new Set(requestedFieldIds).size !== requestedFieldIds.length) {
      return res.status(400).json({ success: false, error: 'fieldOrders cannot contain duplicate field IDs' });
    }
    const ownedFields = await prisma.fieldDefinition.findMany({
      where: { tenantId: req.tenantId!, objectId: object.id, id: { in: requestedFieldIds } },
      select: { id: true },
    });
    if (ownedFields.length !== requestedFieldIds.length) {
      return res.status(404).json({ success: false, error: 'One or more fields were not found on this object' });
    }

    const updates = fieldOrders.map((item: { id: string; displayOrder: number }) =>
      prisma.fieldDefinition.updateMany({
        where: { id: item.id, tenantId: req.tenantId!, objectId: object.id },
        data: { displayOrder: item.displayOrder, updatedBy: req.user!.id },
      })
    );

    await prisma.$transaction(updates);

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'FIELD_REORDERED',
        objectType: 'FieldDefinition',
        objectId: object.id,
        newValues: { fieldOrders },
      },
    });

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, message: 'Fields reordered successfully' });
  } catch (error: any) {
    console.error('Reorder fields error:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder fields' });
  }
});

router.delete('/:objectName/:fieldId', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: req.params.objectName, mode: 'insensitive' } },
    });
    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const existingField = await prisma.fieldDefinition.findFirst({
      where: { id: req.params.fieldId, tenantId: req.tenantId!, objectId: object.id },
    });
    if (!existingField) {
      return res.status(404).json({ success: false, error: 'Field not found' });
    }

    if (existingField.isSystemField) {
      return res.status(400).json({ success: false, error: 'System fields cannot be deleted' });
    }

    if (existingField.isStandardField) {
      return res.status(400).json({ success: false, error: 'Standard fields cannot be deleted' });
    }

    const recordCount = await prisma.customRecord.count({
      where: {
        objectId: object.id,
        data: { path: [existingField.name], not: { equals: undefined } },
      },
    });

    if (recordCount > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete "${existingField.label}" because ${recordCount} record(s) contain data in this field. Deactivate the field instead or clear the data first.`,
      });
    }

    await prisma.fieldDefinition.delete({ where: { id: req.params.fieldId } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'FIELD_DELETED',
        objectType: 'FieldDefinition',
        objectId: req.params.fieldId,
        oldValues: { name: existingField.name, label: existingField.label, objectName: object.name },
      },
    });

    invalidateCache(req.tenantId!, object.name);
    res.json({ success: true, message: 'Field deleted successfully' });
  } catch (error: any) {
    console.error('Delete field error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete field' });
  }
});

export { router as fieldDefinitionRoutes };