import { prisma } from '@dct-crm/db';
import { EffectivePermissionService } from './effectivePermissions';
import { REPORT_OBJECTS } from '../reports/report-metadata';

const metadataCache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(tenantId: string, key: string) {
  return `${tenantId}:${key}`;
}

function getCached(tenantId: string, key: string) {
  const cacheKey = getCacheKey(tenantId, key);
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  metadataCache.delete(cacheKey);
  return null;
}

function setCache(tenantId: string, key: string, data: any) {
  const cacheKey = getCacheKey(tenantId, key);
  metadataCache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });
}

function getVirtualStandardFields(object: { id: string; name: string }) {
  const config = REPORT_OBJECTS[object.name];
  if (!config) return [];
  return Object.entries(config.fields).map(([name, field], displayOrder) => ({
    id: `standard-${object.id}-${name}`,
    objectId: object.id,
    name,
    label: field.label,
    fieldType: field.type === 'number' ? 'number' : field.type === 'date' ? 'dateTime' : field.type === 'enum' ? 'picklist' : 'text',
    required: false,
    unique: false,
    searchable: true,
    sortable: true,
    filterable: true,
    visible: true,
    editable: true,
    isActive: true,
    isSystemField: false,
    isCustomField: true,
    isStandardField: false,
    displayOrder,
    picklistValues: [],
  }));
}

export function invalidateCache(tenantId: string, objectName?: string) {
  if (objectName) {
    const keys = Array.from(metadataCache.keys()).filter(k => k.startsWith(tenantId));
    keys.forEach(k => metadataCache.delete(k));
  } else {
    const keys = Array.from(metadataCache.keys()).filter(k => k.startsWith(tenantId));
    keys.forEach(k => metadataCache.delete(k));
  }
}

export async function getObjectDefinitions(tenantId: string, includeInactive = false) {
  const cacheKey = `objects:${includeInactive}`;
  const cached = getCached(tenantId, cacheKey);
  if (cached) return cached;

  const where: any = { tenantId };
  if (!includeInactive) where.isActive = true;

  const objects = await prisma.objectDefinition.findMany({
    where,
    include: {
      _count: { select: { fields: true, records: true } },
    },
    orderBy: { label: 'asc' },
  });

  const callDetailCount = objects.some((object) => object.name === 'CallDetail')
    ? await prisma.callDetail.count({ where: { tenantId } })
    : null;
  const normalized = objects.map((object) => ({
    ...object,
    _count: {
      ...object._count,
      ...(object._count.fields === 0 ? { fields: getVirtualStandardFields(object).length } : {}),
      ...(object.name === 'CallDetail' && callDetailCount !== null ? { records: callDetailCount } : {}),
    },
  }));
  setCache(tenantId, cacheKey, normalized);
  return normalized;
}

export async function getObjectDefinition(tenantId: string, objectName: string) {
  const cacheKey = `object:${objectName}`;
  const cached = getCached(tenantId, cacheKey);
  if (cached) return cached;

  const object = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: { equals: objectName, mode: 'insensitive' } },
    include: {
      fields: {
        orderBy: { displayOrder: 'asc' },
        include: {
          picklistValues: {
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
      },
      layouts: { orderBy: { name: 'asc' } },
      _count: { select: { records: true } },
    },
  });

  if (!object) return object;
  const normalized = {
    ...object,
    ...(object.fields.length === 0 ? { fields: getVirtualStandardFields(object) } : {}),
    ...(object.name === 'CallDetail'
      ? { _count: { ...object._count, records: await prisma.callDetail.count({ where: { tenantId } }) } }
      : {}),
  };
  setCache(tenantId, cacheKey, normalized);
  return normalized;
}

export async function getFieldDefinitions(tenantId: string, objectId: string) {
  const cacheKey = `fields:${objectId}`;
  const cached = getCached(tenantId, cacheKey);
  if (cached) return cached;

  const fields = await prisma.fieldDefinition.findMany({
    where: { tenantId, objectId, visible: true },
    include: {
      picklistValues: {
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      },
    },
    orderBy: { displayOrder: 'asc' },
  });

  if (fields.length === 0) {
    const object = await prisma.objectDefinition.findFirst({ where: { id: objectId, tenantId }, select: { id: true, name: true } });
    const virtualFields = object ? getVirtualStandardFields(object) : [];
    setCache(tenantId, cacheKey, virtualFields);
    return virtualFields;
  }
  setCache(tenantId, cacheKey, fields);
  return fields;
}

async function materializeEditableCatalogFields(
  tenantId: string,
  objectId: string,
  objectName: string,
  existingNames: string[],
) {
  const config = REPORT_OBJECTS[objectName];
  if (!config) return false;

  const names = new Set(existingNames);
  const missing = Object.entries(config.fields).filter(([name]) => !names.has(name));
  if (missing.length === 0) return false;

  await prisma.fieldDefinition.createMany({
    data: missing.map(([name, field], displayOrder) => ({
      tenantId,
      objectId,
      name,
      label: field.label,
      fieldType: field.type === 'number' ? 'number' : field.type === 'date' ? 'dateTime' : field.type === 'enum' ? 'picklist' : 'text',
      required: false,
      searchable: true,
      sortable: true,
      filterable: true,
      visible: true,
      editable: true,
      isActive: true,
      isSystemField: false,
      isCustomField: true,
      isStandardField: false,
      displayOrder: existingNames.length + displayOrder,
      createdBy: 'system',
    })),
    skipDuplicates: true,
  });
  invalidateCache(tenantId, objectName);
  return true;
}

export async function getAllFieldDefinitions(tenantId: string, objectId: string, objectName?: string) {
  const loadFields = () => prisma.fieldDefinition.findMany({
    where: { tenantId, objectId },
    include: {
      picklistValues: {
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      },
    },
    orderBy: { displayOrder: 'asc' },
  });
  let fields = await loadFields();
  if (fields.length === 0 || objectName?.toLowerCase() === 'lead') {
    const resolvedName = objectName || (await prisma.objectDefinition.findFirst({
      where: { id: objectId, tenantId },
      select: { name: true },
    }))?.name;
    if (resolvedName && await materializeEditableCatalogFields(tenantId, objectId, resolvedName, fields.map((field) => field.name))) {
      fields = await loadFields();
    }
  }
  if (fields.length > 0 && objectName?.toLowerCase() !== 'lead') return fields;

  const object = await prisma.objectDefinition.findFirst({ where: { id: objectId, tenantId }, select: { id: true, name: true } });
  if (!object) return fields;

  const virtualFields = getVirtualStandardFields(object);
  if (fields.length === 0) return virtualFields;
  if (object.name.toLowerCase() !== 'lead') return fields;

  const fieldNames = new Set(fields.map((field) => field.name));
  return [
    ...fields,
    ...virtualFields.filter((field) => !fieldNames.has(field.name)),
  ];
}

export async function getPageLayout(tenantId: string, objectId: string, layoutName?: string) {
  const where: any = { tenantId, objectId };
  if (layoutName) {
    where.name = layoutName;
  } else {
    where.isDefault = true;
  }

  let layout = await prisma.pageLayout.findFirst({ where });

  if (!layout && !layoutName) {
    layout = await prisma.pageLayout.findFirst({
      where: { tenantId, objectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  return layout;
}

export async function getObjectPermissions(tenantId: string, roleId: string, objectId: string) {
  return prisma.objectPermission.findFirst({
    where: { tenantId, roleId, objectId },
  });
}

export async function getFieldPermissions(tenantId: string, roleId: string, objectId: string) {
  const fields = await prisma.fieldDefinition.findMany({
    where: { tenantId, objectId },
    include: {
      fieldPerms: {
        where: { roleId },
      },
    },
  });

  return fields.map(f => ({
    fieldId: f.id,
    fieldName: f.name,
    canRead: f.fieldPerms[0]?.canRead ?? true,
    canEdit: f.fieldPerms[0]?.canEdit ?? true,
  }));
}

export async function getUserObjectPermissions(tenantId: string, userId: string, objectName: string, cacheOwner?: object) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { isSuperAdmin: true } });
  if (user?.isSuperAdmin) {
    return { canCreate: true, canRead: true, canUpdate: true, canDelete: true, viewAll: true, modifyAll: true };
  }

  const moduleName = objectName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
  const permissions = cacheOwner
    ? await EffectivePermissionService.getEffectivePermissionsCached(cacheOwner, userId)
    : await EffectivePermissionService.getEffectivePermissions(userId);
  const has = (action: string) => permissions.some((permission) => permission.name === `${moduleName}_${action}`);

  if (!has('READ') && !has('CREATE') && !has('UPDATE') && !has('DELETE')) return null;

  return {
    canCreate: has('CREATE'),
    canRead: has('READ'),
    canUpdate: has('UPDATE'),
    canDelete: has('DELETE'),
    viewAll: has('VIEW_ALL'),
    modifyAll: has('MODIFY_ALL'),
  };
}

export async function getUserFieldPermissions(tenantId: string, userId: string, objectId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, isSuperAdmin: true },
  });

  if (!user) return [];

  if (user.isSuperAdmin) {
    const fields = await prisma.fieldDefinition.findMany({
      where: { tenantId, objectId },
      select: { id: true, name: true },
    });

    return fields.map((field) => ({
      fieldId: field.id,
      fieldName: field.name,
      canRead: true,
      canEdit: true,
    }));
  }

  const effectivePermissions = await EffectivePermissionService.getEffectiveFieldPermissions(userId, objectId);

  return effectivePermissions.map((permission) => ({
    fieldId: permission.fieldId,
    fieldName: permission.fieldName,
    canRead: permission.canRead,
    canEdit: permission.canEdit,
  }));
}

export function validateFieldValue(fieldDef: any, value: any): { valid: boolean; error?: string } {
  if (value === null || value === undefined || value === '') {
    if (fieldDef.required) return { valid: false, error: `${fieldDef.label} is required` };
    return { valid: true };
  }

  switch (fieldDef.fieldType) {
    case 'text':
    case 'longText':
    case 'richText':
      if (typeof value !== 'string') return { valid: false, error: `${fieldDef.label} must be text` };
      break;
    case 'time':
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(String(value)))
        return { valid: false, error: `${fieldDef.label} must be a valid time` };
      break;
    case 'number':
      if (isNaN(Number(value))) return { valid: false, error: `${fieldDef.label} must be a number` };
      break;
    case 'decimal':
    case 'currency':
    case 'percentage':
      if (isNaN(Number(value))) return { valid: false, error: `${fieldDef.label} must be a valid number` };
      break;
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))
        return { valid: false, error: `${fieldDef.label} must be a valid email` };
      break;
    case 'phone':
      if (!/^[\d\s\-+()]+$/.test(String(value)))
        return { valid: false, error: `${fieldDef.label} must be a valid phone number` };
      break;
    case 'url':
      try { new URL(String(value)); }
      catch { return { valid: false, error: `${fieldDef.label} must be a valid URL` }; }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return { valid: false, error: `${fieldDef.label} must be true or false` };
      break;
    case 'date':
      if (isNaN(Date.parse(String(value)))) return { valid: false, error: `${fieldDef.label} must be a valid date` };
      break;
    case 'dateTime':
      if (isNaN(Date.parse(String(value)))) return { valid: false, error: `${fieldDef.label} must be a valid date/time` };
      break;
    case 'picklist':
      break;
    case 'multiPicklist':
      if (!Array.isArray(value)) return { valid: false, error: `${fieldDef.label} must be an array` };
      break;
  }

  if (fieldDef.validationRules && typeof fieldDef.validationRules === 'object') {
    const rules = fieldDef.validationRules as any;
    if (rules.minLength && String(value).length < rules.minLength)
      return { valid: false, error: `${fieldDef.label} must be at least ${rules.minLength} characters` };
    if (rules.maxLength && String(value).length > rules.maxLength)
      return { valid: false, error: `${fieldDef.label} must be at most ${rules.maxLength} characters` };
    if (rules.min !== undefined && Number(value) < rules.min)
      return { valid: false, error: `${fieldDef.label} must be at least ${rules.min}` };
    if (rules.max !== undefined && Number(value) > rules.max)
      return { valid: false, error: `${fieldDef.label} must be at most ${rules.max}` };
    if (rules.pattern && !new RegExp(rules.pattern).test(String(value)))
      return { valid: false, error: rules.patternMessage || `${fieldDef.label} format is invalid` };
  }

  return { valid: true };
}

export async function generateRecordNumber(tenantId: string, objectName: string): Promise<string> {
  const object = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: { equals: objectName, mode: 'insensitive' } },
  });
  if (!object) throw new Error('Object not found');

  const prefix = objectName.substring(0, 2).toUpperCase();
  const count = await prisma.customRecord.count({
    where: { tenantId, objectId: object.id },
  });

  return `${prefix}-${String(count + 1).padStart(5, '0')}`;
}

export async function applyFieldDefaults(fieldDefs: any[], data: Record<string, any>): Promise<Record<string, any>> {
  const result = { ...data };
  for (const field of fieldDefs) {
    if (result[field.name] === undefined || result[field.name] === null) {
      if (field.defaultValue !== null && field.defaultValue !== undefined) {
        result[field.name] = field.defaultValue;
      }
    }
  }
  return result;
}

export async function getRoleHierarchyUserIds(tenantId: string, userId: string) {
  const [user, roles] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { roleId: true, roles: { select: { roleId: true } } },
    }),
    prisma.role.findMany({
      where: { tenantId },
      select: { id: true, parentRoleId: true },
    }),
  ]);

  if (!user) return [];

  const visibleRoleIds = new Set([
    ...(user.roleId ? [user.roleId] : []),
    ...user.roles.map((role) => role.roleId),
  ]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const role of roles) {
      if (role.parentRoleId && visibleRoleIds.has(role.parentRoleId) && !visibleRoleIds.has(role.id)) {
        visibleRoleIds.add(role.id);
        changed = true;
      }
    }
  }

  const visibleUsers = await prisma.user.findMany({
    where: {
      tenantId,
      OR: [
        { id: userId },
        { roleId: { in: [...visibleRoleIds] } },
        { roles: { some: { roleId: { in: [...visibleRoleIds] } } } },
      ],
    },
    select: { id: true },
  });

  return visibleUsers.map((visibleUser) => visibleUser.id);
}