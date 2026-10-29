import { prisma } from '@dct-crm/db';
import {
  blankLayoutValue,
  isVersion2Layout,
  layoutFieldRules,
  parseLayoutDocument,
  validateLayoutDocument,
  type LayoutFieldRef,
} from '@dct-crm/shared';
import type { AuthRequest } from '../middleware/auth';
import { getAllFieldDefinitions } from './metadata';

type AssignmentDelegate = {
  findMany: (args: any) => Promise<any[]>;
  findFirst: (args: any) => Promise<any>;
  count: (args: any) => Promise<number>;
  deleteMany: (args: any) => Promise<unknown>;
  upsert: (args: any) => Promise<unknown>;
};

function assignments(): AssignmentDelegate | null {
  return (prisma as { layoutAssignment?: AssignmentDelegate }).layoutAssignment || null;
}

export async function layoutFieldCatalog(tenantId: string, objectId: string, objectName: string): Promise<LayoutFieldRef[]> {
  const fields = await getAllFieldDefinitions(tenantId, objectId, objectName);
  return fields.map((field: any) => ({
    name: field.name,
    label: field.label,
    required: field.required === true,
    isSystemField: field.isSystemField === true,
    editable: field.editable !== false,
  }));
}

export async function validateIncomingSections(tenantId: string, objectId: string, objectName: string, sections: unknown) {
  const parsed = typeof sections === 'string' ? JSON.parse(sections) : sections;
  if (!isVersion2Layout(parsed)) return null;
  const fields = await layoutFieldCatalog(tenantId, objectId, objectName);
  return validateLayoutDocument(parseLayoutDocument(parsed, objectName), fields, objectName);
}

export async function writeLayoutAudit(
  tenantId: string,
  userId: string | undefined,
  action: string,
  objectId: string,
  oldValues: unknown,
  newValues: unknown,
) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        objectType: 'PageLayout',
        objectId,
        oldValues: oldValues as object,
        newValues: newValues as object,
      },
    });
  } catch (error) {
    console.error('Layout audit log failed:', error);
  }
}

export async function countLayoutAssignments(layoutId: string) {
  const table = assignments();
  if (!table) return 0;
  try {
    return await table.count({ where: { layoutId } });
  } catch (error) {
    console.error('Layout assignment count failed:', error);
    return 0;
  }
}

async function findObject(tenantId: string, objectName: string) {
  return prisma.objectDefinition.findFirst({
    where: { tenantId, name: { equals: objectName, mode: 'insensitive' } },
  });
}

export async function resolveAssignedLayout(tenantId: string, profileId: string | undefined, objectName: string) {
  const object = await findObject(tenantId, objectName);
  if (!object) return null;
  const table = assignments();
  if (table && profileId) {
    try {
      const assignment = await table.findFirst({
        where: { tenantId, objectName: object.name, profileId, recordTypeKey: 'MASTER' },
      });
      if (assignment?.layoutId) {
        const assigned = await prisma.pageLayout.findFirst({
          where: { id: assignment.layoutId, tenantId, objectId: object.id },
        });
        if (assigned) return assigned;
      }
    } catch (error) {
      console.error('Layout resolve failed:', error);
    }
  }
  return prisma.pageLayout.findFirst({
    where: { tenantId, objectId: object.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function layoutAssignmentMatrix(tenantId: string, objectName: string) {
  const object = await findObject(tenantId, objectName);
  if (!object) return null;
  const [profiles, layouts] = await Promise.all([
    prisma.profile.findMany({
      where: { OR: [{ tenantId }, { isGlobal: true }] },
      select: { id: true, name: true, isAdmin: true },
      orderBy: { name: 'asc' },
    }),
    prisma.pageLayout.findMany({
      where: { tenantId, objectId: object.id },
      select: { id: true, name: true, isDefault: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const table = assignments();
  let rows: any[] = [];
  if (table) {
    try {
      rows = await table.findMany({ where: { tenantId, objectName: object.name } });
    } catch (error) {
      console.error('Layout assignment matrix failed:', error);
    }
  }
  const defaultLayout = layouts.find((layout) => layout.isDefault) || layouts[0] || null;
  return {
    objectName: object.name,
    recordTypes: [{ key: 'MASTER', label: 'Master' }],
    profiles,
    layouts,
    defaultLayoutId: defaultLayout?.id || null,
    assignments: rows.map((row) => ({
      profileId: row.profileId,
      recordTypeKey: row.recordTypeKey || 'MASTER',
      layoutId: row.layoutId,
    })),
  };
}

export async function saveLayoutAssignments(
  tenantId: string,
  userId: string | undefined,
  objectName: string,
  incoming: { profileId: string; recordTypeKey?: string; layoutId: string }[],
) {
  const matrix = await layoutAssignmentMatrix(tenantId, objectName);
  if (!matrix) return { error: 'Object not found' as const };
  const table = assignments();
  if (!table) return { error: 'Layout assignments are not available' as const };
  const profileIds = new Set(matrix.profiles.map((profile) => profile.id));
  const layoutIds = new Set(matrix.layouts.map((layout) => layout.id));
  const before = matrix.assignments;
  const next = incoming.map((row) => ({
    profileId: row.profileId,
    recordTypeKey: row.recordTypeKey || 'MASTER',
    layoutId: row.layoutId,
  }));
  for (const row of next) {
    if (!profileIds.has(row.profileId)) return { error: 'Choose a profile from this company' as const };
    if (!layoutIds.has(row.layoutId)) return { error: 'Choose a layout for this object' as const };
    if (row.recordTypeKey !== 'MASTER') return { error: 'This object has no record types' as const };
  }
  await prisma.$transaction(async (tx) => {
    const writer = (tx as { layoutAssignment?: AssignmentDelegate }).layoutAssignment;
    if (!writer) throw new Error('Layout assignments are not available');
    for (const row of next) {
      await writer.upsert({
        where: {
          tenantId_objectName_profileId_recordTypeKey: {
            tenantId,
            objectName: matrix.objectName,
            profileId: row.profileId,
            recordTypeKey: row.recordTypeKey,
          },
        },
        update: { layoutId: row.layoutId },
        create: {
          tenantId,
          objectName: matrix.objectName,
          profileId: row.profileId,
          recordTypeKey: row.recordTypeKey,
          layoutId: row.layoutId,
        },
      });
    }
  });
  await writeLayoutAudit(tenantId, userId, 'ASSIGN', matrix.objectName, { assignments: before }, { assignments: next });
  return { objectName: matrix.objectName };
}

function readIncoming(body: Record<string, unknown>, name: string) {
  if (Object.prototype.hasOwnProperty.call(body, name)) return body[name];
  const custom = body.customFields;
  if (custom && typeof custom === 'object' && !Array.isArray(custom) && Object.prototype.hasOwnProperty.call(custom, name)) {
    return (custom as Record<string, unknown>)[name];
  }
  return undefined;
}

function readExisting(existing: Record<string, unknown> | undefined, name: string) {
  if (!existing) return undefined;
  if (existing[name] !== undefined) return existing[name];
  const custom = existing.customFields;
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    return (custom as Record<string, unknown>)[name];
  }
  return undefined;
}

export async function layoutWriteError(
  req: AuthRequest,
  objectName: string,
  body: Record<string, unknown>,
  existing?: Record<string, unknown>,
) {
  if (!req.tenantId) return null;
  try {
    const layout = await resolveAssignedLayout(req.tenantId, req.user?.profileId, objectName);
    if (!layout) return null;
    const raw = typeof layout.sections === 'string' ? JSON.parse(layout.sections) : layout.sections;
    if (!isVersion2Layout(raw)) return null;
    const rules = layoutFieldRules(parseLayoutDocument(raw, layout.name));
    for (const [name, rule] of rules) {
      const incoming = readIncoming(body, name);
      if (incoming === undefined) {
        if (!existing && rule.required) return `${name} is required on this page layout`;
        continue;
      }
      if (rule.readOnly && existing) {
        const current = readExisting(existing, name);
        if (String(incoming ?? '') !== String(current ?? '') && !(blankLayoutValue(incoming) && blankLayoutValue(current))) {
          return `${name} is read-only on this page layout`;
        }
      }
      if (rule.required && blankLayoutValue(incoming)) return `${name} is required on this page layout`;
    }
    return null;
  } catch (error) {
    console.error('Layout field check skipped:', error);
    return null;
  }
}
