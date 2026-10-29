import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

export type ProfileSecurityObjectPermission = {
  objectId: string;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  viewAll: boolean;
  modifyAll: boolean;
};

export function reconcilePermissionIdsForObjectPermissions(
  objectPermissions: ProfileSecurityObjectPermission[] = [],
  permissionIds: string[] = [],
  permissionCatalog: Array<{ id: string; name: string }> = [],
  objectNameMap: Record<string, string> = {},
): string[] {
  const removedNames = new Set<string>();
  const enabledNames = new Set<string>();

  for (const permission of objectPermissions) {
    const objectName = objectNameMap[permission.objectId];
    if (!objectName) continue;

    const normalizedName = objectName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
    const actionMap = {
      canCreate: `${normalizedName}_CREATE`,
      canRead: `${normalizedName}_READ`,
      canUpdate: `${normalizedName}_UPDATE`,
      canDelete: `${normalizedName}_DELETE`,
      viewAll: `${normalizedName}_VIEW_ALL`,
      modifyAll: `${normalizedName}_MODIFY_ALL`,
    } as const;

    for (const [key, permissionName] of Object.entries(actionMap)) {
      const value = permission[key as keyof ProfileSecurityObjectPermission];
      if (value) enabledNames.add(permissionName);
      else removedNames.add(permissionName);
    }
  }

  const catalogById = new Map(permissionCatalog.map((permission) => [permission.id, permission.name]));
  const idByName = new Map(permissionCatalog.map((permission) => [permission.name, permission.id]));
  const reconciled = permissionIds.filter((id) => {
    const permissionName = catalogById.get(id);
    return !permissionName || !removedNames.has(permissionName);
  });
  const reconciledIds = new Set(reconciled);
  for (const permissionName of enabledNames) {
    const id = idByName.get(permissionName);
    if (id && !reconciledIds.has(id)) {
      reconciled.push(id);
      reconciledIds.add(id);
    }
  }
  return reconciled;
}

export function reconcileObjectPermissionsForPermissionIds(
  objectPermissions: ProfileSecurityObjectPermission[] = [],
  permissionIds: string[] = [],
  permissionCatalog: Array<{ id: string; name: string }> = [],
  objectNameMap: Record<string, string> = {},
): ProfileSecurityObjectPermission[] {
  const allowedNames = new Set<string>();
  const catalogById = new Map(permissionCatalog.map((permission) => [permission.id, permission.name]));

  for (const permissionId of permissionIds) {
    const permissionName = catalogById.get(permissionId);
    if (permissionName) allowedNames.add(permissionName);
  }

  return objectPermissions.map((permission) => {
    const objectName = objectNameMap[permission.objectId];
    if (!objectName) return permission;

    const normalizedName = objectName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
    const actionMap = {
      canCreate: `${normalizedName}_CREATE`,
      canRead: `${normalizedName}_READ`,
      canUpdate: `${normalizedName}_UPDATE`,
      canDelete: `${normalizedName}_DELETE`,
      viewAll: `${normalizedName}_VIEW_ALL`,
      modifyAll: `${normalizedName}_MODIFY_ALL`,
    } as const;
    const catalogNames = new Set(permissionCatalog.map((item) => item.name));

    const next = { ...permission };
    for (const [key, permissionName] of Object.entries(actionMap)) {
      const value = permission[key as keyof ProfileSecurityObjectPermission];
      if (value && catalogNames.has(permissionName) && !allowedNames.has(permissionName)) {
        next[key as Exclude<keyof ProfileSecurityObjectPermission, 'objectId'>] = false;
      }
    }

    return next;
  });
}

const router = Router();
router.use(authenticate);

function getProfileScope(req: AuthRequest, profileId: string) {
  const tenantId = req.user!.isSuperAdmin && typeof req.query.tenantId === 'string'
    ? req.query.tenantId
    : req.tenantId!;
  return req.user!.isSuperAdmin && typeof req.query.tenantId === 'string'
    ? { id: profileId, tenantId }
    : { id: profileId, OR: [{ tenantId }, { isGlobal: true }] };
}

const updateSecuritySchema = z.object({
  objectPermissions: z.array(z.object({
    objectId: z.string(),
    canCreate: z.boolean(),
    canRead: z.boolean(),
    canUpdate: z.boolean(),
    canDelete: z.boolean(),
    viewAll: z.boolean(),
    modifyAll: z.boolean(),
  })).optional(),
  fieldPermissions: z.array(z.object({
    fieldId: z.string(),
    canRead: z.boolean(),
    canEdit: z.boolean(),
  })).optional(),
  recordAccess: z.record(z.enum(['OWN', 'TEAM', 'ALL'])).optional(),
  permissionIds: z.array(z.string()).optional(),
});

router.get('/:profileId/security', requirePermission('PROFILE_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const profile = await prisma.profile.findFirst({
      where: getProfileScope(req, req.params.profileId),
      select: { id: true, name: true, description: true, isAdmin: true, leadStatusAccess: true, tenantId: true },
    });
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

    const [objects, objectPermissions, fieldPermissions, permissions] = await Promise.all([
      prisma.objectDefinition.findMany({
        where: { tenantId: profile.tenantId, isActive: true },
        select: { id: true, name: true, label: true, fields: { where: { isActive: true }, select: { id: true, name: true, label: true, fieldType: true }, orderBy: { displayOrder: 'asc' } } },
        orderBy: { label: 'asc' },
      }),
      prisma.profileObjectPermission.findMany({ where: { profileId: req.params.profileId, tenantId: profile.tenantId } }),
      prisma.profileFieldPermission.findMany({ where: { profileId: req.params.profileId, tenantId: profile.tenantId } }),
      prisma.userProfilePermission.findMany({ where: { profileId: req.params.profileId, permission: { isActive: true } }, include: { permission: true } }),
    ]);

    const objectNameMap = Object.fromEntries(objects.map((objectDefinition) => [objectDefinition.id, objectDefinition.name]));
    const permissionCatalog = await prisma.permission.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const sanitizedObjectPermissions = reconcileObjectPermissionsForPermissionIds(
      objectPermissions,
      permissions.map((item) => item.permissionId),
      permissionCatalog,
      objectNameMap,
    );

    const storedAccess = profile.leadStatusAccess && typeof profile.leadStatusAccess === 'object' && !Array.isArray(profile.leadStatusAccess)
      ? profile.leadStatusAccess as Record<string, any>
      : {};
    res.json({ success: true, data: { profile, objects, objectPermissions: sanitizedObjectPermissions, fieldPermissions, permissions: permissions.map((item) => item.permission), recordAccess: storedAccess.recordAccess || {} } });
  } catch (error) {
    console.error('Get profile security error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile security' });
  }
});

router.put('/:profileId/security', requirePermission('PROFILE_PERMISSION_MANAGE'), async (req: AuthRequest, res: Response) => {
  try {
    const data = updateSecuritySchema.parse(req.body);
    const profile = await prisma.profile.findFirst({
      where: getProfileScope(req, req.params.profileId),
      select: { id: true, leadStatusAccess: true, tenantId: true },
    });
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const tenantId = profile.tenantId;

    if (data.objectPermissions?.length) {
      const objectIds = [...new Set(data.objectPermissions.map((item) => item.objectId))];
      const objectCount = await prisma.objectDefinition.count({ where: { id: { in: objectIds }, tenantId, isActive: true } });
      if (objectCount !== objectIds.length) return res.status(400).json({ success: false, error: 'One or more objects were not found in this tenant' });
    }

    if (data.fieldPermissions?.length) {
      const fieldIds = [...new Set(data.fieldPermissions.map((item) => item.fieldId))];
      const fieldCount = await prisma.fieldDefinition.count({ where: { id: { in: fieldIds }, tenantId, isActive: true } });
      if (fieldCount !== fieldIds.length) return res.status(400).json({ success: false, error: 'One or more fields were not found in this tenant' });
    }

    if (data.permissionIds?.length) {
      const permissionIds = [...new Set(data.permissionIds)];
      const permissionCount = await prisma.permission.count({ where: { id: { in: permissionIds }, isActive: true } });
      if (permissionCount !== permissionIds.length) return res.status(400).json({ success: false, error: 'One or more permissions are invalid or inactive' });
    }

    const objectNameMap = data.objectPermissions?.length
      ? Object.fromEntries(
          (await prisma.objectDefinition.findMany({
            where: { id: { in: [...new Set(data.objectPermissions.map((item) => item.objectId))] }, tenantId, isActive: true },
            select: { id: true, name: true },
          })).map((objectDefinition) => [objectDefinition.id, objectDefinition.name]),
        )
      : {};

    const permissionCatalog = await prisma.permission.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const normalizedPermissionIds = data.objectPermissions?.length
      ? reconcilePermissionIdsForObjectPermissions(
          data.objectPermissions,
          data.permissionIds ?? [],
          permissionCatalog,
          objectNameMap,
        )
      : data.permissionIds ?? [];

    const normalizedObjectPermissions = data.objectPermissions?.length
      ? reconcileObjectPermissionsForPermissionIds(
          data.objectPermissions,
          normalizedPermissionIds,
          permissionCatalog,
          objectNameMap,
        )
      : data.objectPermissions ?? [];

    await prisma.$transaction(async (tx) => {
      if (data.objectPermissions) {
        await tx.profileObjectPermission.deleteMany({ where: { profileId: profile.id } });
        if (normalizedObjectPermissions.length) await tx.profileObjectPermission.createMany({ data: normalizedObjectPermissions.map((item) => ({ ...item, profileId: profile.id, tenantId })) });
      }
      if (data.fieldPermissions) {
        await tx.profileFieldPermission.deleteMany({ where: { profileId: profile.id } });
        if (data.fieldPermissions.length) await tx.profileFieldPermission.createMany({ data: data.fieldPermissions.map((item) => ({ ...item, profileId: profile.id, tenantId })) });
      }
      if (data.permissionIds) {
        await tx.userProfilePermission.deleteMany({ where: { profileId: profile.id } });
        if (normalizedPermissionIds.length) await tx.userProfilePermission.createMany({ data: normalizedPermissionIds.map((permissionId) => ({ profileId: profile.id, permissionId })) });
      }
      if (data.recordAccess) {
        const current = profile.leadStatusAccess && typeof profile.leadStatusAccess === 'object' && !Array.isArray(profile.leadStatusAccess) ? profile.leadStatusAccess as Record<string, any> : {};
        await tx.profile.update({ where: { id: profile.id }, data: { leadStatusAccess: { ...current, recordAccess: data.recordAccess } } });
      }
    });

    res.json({ success: true, message: 'Profile security updated' });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid security data' });
    console.error('Update profile security error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile security' });
  }
});

export default router;