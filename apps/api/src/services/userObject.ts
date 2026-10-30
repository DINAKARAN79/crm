import { Prisma, prisma } from '@dct-crm/db';

type Database = Prisma.TransactionClient | typeof prisma;

export const USER_OBJECT = {
  name: 'User',
  label: 'Users',
  pluralLabel: 'Users',
  icon: 'users',
  description: 'Manage CRM users and their profiles',
  isAvailableInNavigation: false,
  isAvailableInReports: false,
} as const;

const HIDDEN_USER_FIELD_NAMES = new Set([
  'password',
  'passwordhash',
  'passwordresettoken',
  'passwordresetexpires',
  'apitoken',
  'accesstoken',
  'refreshtoken',
  'twofactorsecret',
  'totpsecret',
  'mfasecret',
]);

export function isHiddenUserField(name: string): boolean {
  return HIDDEN_USER_FIELD_NAMES.has(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

export function omitHiddenUserFields<T extends { name: string }>(objectName: string | undefined, fields: T[]): T[] {
  if (objectName?.toLowerCase() !== 'user') return fields;
  return fields.filter((field) => !isHiddenUserField(field.name));
}

type UserFieldSeed = {
  name: string;
  label: string;
  fieldType: string;
  required: boolean;
  editable: boolean;
  isSystemField: boolean;
  isStandardField: boolean;
  lookupObject?: string;
};

const system = (field: Omit<UserFieldSeed, 'isSystemField' | 'isStandardField' | 'editable'> & { editable?: boolean }): UserFieldSeed => ({
  editable: false,
  isSystemField: true,
  isStandardField: false,
  ...field,
});

const standard = (field: Omit<UserFieldSeed, 'isSystemField' | 'isStandardField'>): UserFieldSeed => ({
  isSystemField: false,
  isStandardField: true,
  ...field,
});

export const USER_FIELDS: UserFieldSeed[] = [
  system({ name: 'id', label: 'User ID', fieldType: 'text', required: true }),
  system({ name: 'tenantId', label: 'Tenant', fieldType: 'lookup', lookupObject: 'Company', required: true }),
  standard({ name: 'firstName', label: 'First Name', fieldType: 'text', required: true, editable: true }),
  standard({ name: 'lastName', label: 'Last Name', fieldType: 'text', required: false, editable: true }),
  system({ name: 'email', label: 'Email', fieldType: 'email', required: true }),
  standard({ name: 'phone', label: 'Phone', fieldType: 'phone', required: true, editable: true }),
  system({ name: 'profileId', label: 'Profile', fieldType: 'lookup', lookupObject: 'Profile', required: false }),
  standard({ name: 'roleId', label: 'Role', fieldType: 'lookup', lookupObject: 'Role', required: false, editable: true }),
  system({ name: 'isActive', label: 'Status', fieldType: 'boolean', required: true }),
  standard({ name: 'avatar', label: 'Avatar', fieldType: 'url', required: false, editable: true }),
  system({ name: 'isLoggedIn', label: 'Is Logged In', fieldType: 'boolean', required: false }),
  system({ name: 'lastLoginAt', label: 'Last Login', fieldType: 'dateTime', required: false }),
  system({ name: 'lastSeenAt', label: 'Last Seen', fieldType: 'dateTime', required: false }),
  system({ name: 'lastLogoutAt', label: 'Last Logout', fieldType: 'dateTime', required: false }),
  system({ name: 'createdAt', label: 'Created Date', fieldType: 'dateTime', required: false }),
  system({ name: 'updatedAt', label: 'Updated Date', fieldType: 'dateTime', required: false }),
  system({ name: 'isSuperAdmin', label: 'System Admin', fieldType: 'boolean', required: false }),
];

export const USER_LAYOUT_SECTIONS = [
  {
    name: 'User Information',
    fields: ['firstName', 'lastName', 'email', 'phone', 'profileId', 'roleId', 'isActive'],
  },
  {
    name: 'System Information',
    fields: ['id', 'tenantId', 'isLoggedIn', 'lastLoginAt', 'lastSeenAt', 'lastLogoutAt', 'createdAt', 'updatedAt'],
  },
];

const FULL_ACCESS = {
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: true,
  viewAll: true,
  modifyAll: true,
};

function fieldRows(tenantId: string, objectId: string, actorId: string) {
  return USER_FIELDS.map((field, displayOrder) => ({
    tenantId,
    objectId,
    name: field.name,
    label: field.label,
    fieldType: field.fieldType,
    lookupObject: field.lookupObject,
    required: field.required,
    editable: field.editable,
    visible: true,
    searchable: true,
    sortable: true,
    filterable: true,
    isActive: true,
    isSystemField: field.isSystemField,
    isStandardField: field.isStandardField,
    isCustomField: false,
    displayOrder,
    createdBy: actorId,
  }));
}

export async function ensureUserObject(db: Database, tenantId: string, actorId: string) {
  let object = await db.objectDefinition.findFirst({
    where: { tenantId, name: 'User' },
    select: { id: true },
  });
  if (!object) {
    object = await db.objectDefinition.create({
      data: {
        tenantId,
        ...USER_OBJECT,
        objectType: 'standard',
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    });
  }

  const existingPhone = await db.fieldDefinition.findFirst({
    where: { tenantId, objectId: object.id, name: 'phone' },
    select: { id: true, required: true },
  });
  await db.fieldDefinition.createMany({
    data: fieldRows(tenantId, object.id, actorId),
    skipDuplicates: true,
  });
  await db.fieldDefinition.deleteMany({
    where: {
      tenantId,
      objectId: object.id,
      name: { in: ['password', 'passwordHash', 'passwordResetToken', 'passwordResetExpires'] },
    },
  });
  await db.fieldDefinition.updateMany({
    where: { tenantId, objectId: object.id, name: 'phone' },
    data: { required: true, fieldType: 'phone', editable: true, isSystemField: false, isStandardField: true, isCustomField: false },
  });
  for (const field of USER_FIELDS.filter((item) => item.isSystemField)) {
    await db.fieldDefinition.updateMany({
      where: { tenantId, objectId: object.id, name: field.name },
      data: { editable: false, isSystemField: true, isStandardField: false, isCustomField: false, required: field.required },
    });
  }

  const phone = await db.fieldDefinition.findFirst({
    where: { tenantId, objectId: object.id, name: 'phone' },
    select: { id: true, required: true },
  });
  if (phone && (!existingPhone || !existingPhone.required)) {
    await db.auditLog.create({
      data: {
        tenantId,
        userId: actorId === 'system' ? null : actorId,
        action: 'FIELD_UPDATED',
        objectType: 'FieldDefinition',
        objectId: phone.id,
        oldValues: { name: 'phone', required: existingPhone?.required ?? false },
        newValues: { name: 'phone', required: true },
      },
    });
  }

  const layout = await db.pageLayout.findFirst({
    where: { tenantId, objectId: object.id, isDefault: true },
    select: { id: true, sections: true },
  });
  if (!layout) {
    await db.pageLayout.create({
      data: {
        tenantId,
        objectId: object.id,
        name: 'Default Layout',
        isDefault: true,
        sections: USER_LAYOUT_SECTIONS,
        createdBy: actorId,
      },
    });
  } else if (typeof db.pageLayout.update === 'function') {
    const sections = Array.isArray(layout.sections) ? layout.sections as Array<{ name?: string; title?: string; fields?: string[] }> : [];
    const system = sections.find((section) => section.name === 'System Information' || section.title === 'System Information');
    const wanted = USER_LAYOUT_SECTIONS.find((section) => section.name === 'System Information')?.fields || [];
    if (system && wanted.some((name) => !(system.fields || []).includes(name))) {
      system.fields = [...(system.fields || []), ...wanted.filter((name) => !(system.fields || []).includes(name))];
      await db.pageLayout.update({ where: { id: layout.id }, data: { sections } });
    }
  }

  const [adminProfiles, adminRole] = await Promise.all([
    db.profile.findMany({ where: { tenantId, isAdmin: true }, select: { id: true } }),
    db.role.findFirst({ where: { tenantId, name: 'Admin' }, select: { id: true } }),
  ]);
  if (adminProfiles.length > 0) {
    await db.profileObjectPermission.createMany({
      data: adminProfiles.map((profile) => ({
        tenantId,
        profileId: profile.id,
        objectId: object.id,
        ...FULL_ACCESS,
      })),
      skipDuplicates: true,
    });
  }
  if (adminRole) {
    await db.objectPermission.createMany({
      data: [{
        tenantId,
        roleId: adminRole.id,
        objectId: object.id,
        ...FULL_ACCESS,
      }],
      skipDuplicates: true,
    });
  }

  return object.id;
}

const ensuredTenants = new Set<string>();

export function clearUserObjectEnsureCache() {
  ensuredTenants.clear();
}

export async function ensureUserObjectOnce(tenantId: string) {
  if (ensuredTenants.has(tenantId)) return;
  await ensureUserObject(prisma, tenantId, 'system');
  ensuredTenants.add(tenantId);
}
