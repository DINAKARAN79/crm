import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PROFILE_DEFINITIONS = [
  {
    name: 'Admin',
    description: 'Administrative profile with full platform access',
    isAdmin: true,
    isDefault: false,
  },
  {
    name: 'Sales Manager',
    description: 'Sales leadership profile with team oversight',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Sales Executive',
    description: 'Sales profile for leads and own-record updates',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Sales',
    description: 'Sales profile for site visit completion and lead handling',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Presales',
    description: 'Presales profile for site visits and project support',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'SVC',
    description: 'Service and site visit profile',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'CRM',
    description: 'CRM lead management profile',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Manager',
    description: 'Manager profile with team oversight',
    isAdmin: false,
    isDefault: false,
  },
  {
    name: 'Recovery',
    description: 'Recovery profile for lost lead follow-up',
    isAdmin: false,
    isDefault: false,
  },
] as const;

const PROFILE_PERMISSIONS: Record<string, string[]> = {
  Admin: ['FULL_SYSTEM_ACCESS'],
  'Sales Manager': [
    'LEAD_READ',
    'LEAD_UPDATE',
    'LEAD_ASSIGN',
    'LEAD_CONVERT',
    'SITE_VISIT_READ',
    'SITE_VISIT_UPDATE',
    'REPORT_VIEW',
    'DASHBOARD_READ',
    'TASK_READ',
    'TASK_CREATE',
    'TASK_UPDATE',
  ],
  'Sales Executive': [
    'LEAD_READ',
    'LEAD_UPDATE',
    'PROJECT_READ',
    'UNIT_READ',
    'SITE_VISIT_READ',
    'SITE_VISIT_UPDATE',
    'TASK_READ',
    'TASK_CREATE',
    'TASK_UPDATE',
    'REPORT_VIEW',
    'DASHBOARD_READ',
  ],
  Sales: [
    'LEAD_READ',
    'LEAD_UPDATE',
    'PROJECT_READ',
    'UNIT_READ',
    'SITE_VISIT_READ',
    'SITE_VISIT_CREATE',
    'SITE_VISIT_UPDATE',
    'ACTIVITY_READ',
    'ACTIVITY_CREATE',
    'ACTIVITY_UPDATE',
    'FOLLOW_UP_READ',
    'FOLLOW_UP_CREATE',
    'FOLLOW_UP_UPDATE',
    'AUDIT_READ',
    'AUDIT_CREATE',
    'AUDIT_UPDATE',
    'DASHBOARD_READ',
    'NOTIFICATION_READ',
    'NOTIFICATION_CREATE',
    'NOTIFICATION_UPDATE',
  ],
  Presales: [
    'LEAD_READ',
    'LEAD_CREATE',
    'LEAD_UPDATE',
    'SITE_VISIT_READ',
    'SITE_VISIT_CREATE',
    'SITE_VISIT_UPDATE',
    'ACTIVITY_READ',
    'ACTIVITY_CREATE',
    'ACTIVITY_UPDATE',
    'FOLLOW_UP_READ',
    'FOLLOW_UP_CREATE',
    'FOLLOW_UP_UPDATE',
    'AUDIT_READ',
    'AUDIT_CREATE',
    'AUDIT_UPDATE',
    'DASHBOARD_READ',
    'NOTIFICATION_READ',
    'NOTIFICATION_CREATE',
    'NOTIFICATION_UPDATE',
  ],
  SVC: [
    'LEAD_READ',
    'LEAD_UPDATE',
    'PROJECT_READ',
    'SITE_VISIT_READ',
    'SITE_VISIT_CREATE',
    'SITE_VISIT_UPDATE',
    'ACTIVITY_READ',
    'ACTIVITY_CREATE',
    'ACTIVITY_UPDATE',
    'FOLLOW_UP_READ',
    'FOLLOW_UP_CREATE',
    'FOLLOW_UP_UPDATE',
    'AUDIT_READ',
    'AUDIT_CREATE',
    'AUDIT_UPDATE',
    'DASHBOARD_READ',
    'NOTIFICATION_READ',
    'NOTIFICATION_CREATE',
    'NOTIFICATION_UPDATE',
  ],
  CRM: [
    'LEAD_READ',
    'SITE_VISIT_READ',
    'PROJECT_READ',
    'TASK_READ',
    'DASHBOARD_READ',
    'CRM_RECEIPT_CREATE',
    'CRM_WELCOME_CALL_COMPLETE',
  ],
  Manager: [
    'LEAD_READ',
    'LEAD_UPDATE',
    'LEAD_ASSIGN',
    'PROJECT_READ',
    'UNIT_READ',
    'SITE_VISIT_READ',
    'SITE_VISIT_UPDATE',
    'REPORT_VIEW',
    'DASHBOARD_READ',
  ],
  Recovery: [
    'LEAD_READ',
    'LEAD_UPDATE',
    'REPORT_VIEW',
    'DASHBOARD_READ',
  ],
};

const DATA_ADMINISTRATION_PERMISSIONS = [
  'DATA_IMPORT',
  'DATA_EXPORT',
  'DUPLICATE_MANAGEMENT',
  'RECYCLE_BIN',
];

async function main() {
  console.log('Seeding CRM profiles and profile permissions...');

  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'dct-re' },
    select: { id: true, name: true },
  });

  if (!tenant) {
    throw new Error('Tenant dct-re not found. Run the DB seed first.');
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { maxTotalUsers: 50, maxAdminUsers: 10 },
  });

  const createdProfiles: Record<string, { id: string; name: string }> = {};

  for (const profile of PROFILE_DEFINITIONS) {
    const existing = await prisma.profile.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name: profile.name } },
      select: { id: true, name: true },
    });

    if (existing) {
      const updated = await prisma.profile.update({
        where: { id: existing.id },
        data: {
          description: profile.description,
          isAdmin: profile.isAdmin,
          isDefault: profile.isDefault,
        },
        select: { id: true, name: true },
      });
      createdProfiles[profile.name] = updated;
      console.log(`Profile already exists (updated): ${profile.name}`);
      continue;
    }

    const created = await prisma.profile.create({
      data: {
        tenantId: tenant.id,
        name: profile.name,
        description: profile.description,
        isAdmin: profile.isAdmin,
        isDefault: profile.isDefault,
      },
      select: { id: true, name: true },
    });

    createdProfiles[profile.name] = created;
    console.log(`Created profile: ${created.name}`);
  }

  const allPermissionNames = new Set<string>();
  for (const name of DATA_ADMINISTRATION_PERMISSIONS) allPermissionNames.add(name);
  for (const names of Object.values(PROFILE_PERMISSIONS)) {
    for (const name of names) allPermissionNames.add(name);
  }

  for (const permissionName of allPermissionNames) {
    const module = DATA_ADMINISTRATION_PERMISSIONS.includes(permissionName)
      ? 'DATA'
      : permissionName.split('_')[0];
    await prisma.permission.upsert({
      where: { name: permissionName },
      // Keep module refreshed on re-run (pre-merge behavior); label/action
      // stay untouched for rows that already exist.
      update: { module },
      create: {
        name: permissionName,
        label: permissionName.replace(/_/g, ' '),
        module,
        action: permissionName.split('_').slice(1).join('_') || 'READ',
      },
    });
  }

  for (const [profileName, permissionNames] of Object.entries(PROFILE_PERMISSIONS)) {
    const profile = createdProfiles[profileName];
    if (!profile) {
      console.warn(`Missing profile for permission assignment: ${profileName}`);
      continue;
    }

    if (profileName === 'Admin') {
    const objectNames = ['Lead', 'SiteVisit', 'Project', 'Task', 'FollowUp', 'Activity'];
    const denied = { create: false, read: false, edit: false, delete: false, viewAll: false, modifyAll: false };
    const permissions = (create = false, read = false, edit = false) => ({
      create,
      read,
      edit,
      delete: false,
      viewAll: false,
      modifyAll: false,
    });
    const objectPermissions: Record<string, Record<string, Record<string, boolean>>> = {
      Admin: Object.fromEntries(objectNames.map((objectName) => [objectName, { create: true, read: true, edit: true, delete: true, viewAll: true, modifyAll: true }])),
      Presales: {
        Lead: permissions(true, true, true),
        SiteVisit: permissions(true, true, true),
        Activity: permissions(true, true, true),
        FollowUp: permissions(true, true, true),
      },
      SVC: {
        Lead: permissions(false, true, false),
        SiteVisit: permissions(true, true, true),
        Activity: permissions(true, true, true),
        FollowUp: permissions(true, true, true),
      },
      Sales: {
        Lead: permissions(false, true, true),
        SiteVisit: permissions(true, true, true),
        Activity: permissions(true, true, true),
        FollowUp: permissions(true, true, true),
      },
      CRM: {
        Lead: permissions(false, true, false),
        SiteVisit: permissions(false, true, false),
        Project: permissions(false, true, false),
        Task: permissions(false, true, false),
      },
      Manager: {
        Lead: permissions(false, true, true),
        SiteVisit: permissions(false, true, true),
        Task: permissions(true, true, true),
        Report: permissions(false, true, false),
      },
      Recovery: {
        Lead: permissions(false, true, true),
      },
    };
    const roleByProfile = new Map<string, { id: string }>();
    for (const profileName of Object.keys(objectPermissions)) {
      const role = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: `Test ${profileName}` } },
        update: {},
        create: {
          tenantId: tenant.id,
          name: `Test ${profileName}`,
          description: `Seeded test role for ${profileName}`,
          isSystem: false,
        },
        select: { id: true },
      });
      roleByProfile.set(profileName, role);
      const profileObjectPermissions = objectPermissions[profileName];
      for (const objectName of objectNames) {
        const objectPermission = profileObjectPermissions[objectName] || denied;
        const permissionSet = await prisma.permissionSet.upsert({
          where: { tenantId_profileId_objectName: { tenantId: tenant.id, profileId: createdProfiles[profileName].id, objectName } },
          update: { permissions: objectPermission },
          create: {
            tenantId: tenant.id,
            profileId: createdProfiles[profileName].id,
            name: `Test ${profileName} - ${objectName}`,
            objectName,
            permissions: objectPermission,
          },
          select: { id: true },
        });
        await prisma.permissionSetRole.upsert({
          where: { permissionSetId_roleId: { permissionSetId: permissionSet.id, roleId: role.id } },
          update: {},
          create: { permissionSetId: permissionSet.id, roleId: role.id },
        });
      }
    }

    const testPassword = 'DctTest@123';
    const passwordHash = await bcrypt.hash(testPassword, 12);
    const profileUsers = [
      ['Admin', 'admin.test'], ['Presales', 'presales.test'], ['SVC', 'svc.test'],
      ['Sales', 'sales.test'], ['CRM', 'crm.test'],
      ['Manager', 'manager.test'], ['Recovery', 'recovery.test'],
    ] as const;
    const seededUsers = new Map<string, { id: string; profileName: string }>();
    for (const [profileName, prefix] of profileUsers) {
      const profile = createdProfiles[profileName];
      const role = roleByProfile.get(profileName);
      if (!profile || !role) throw new Error(`Missing seeded profile or role: ${profileName}`);
      for (let index = 1; index <= 3; index += 1) {
        const email = `${prefix}${index}@dctcrm.com`;
        const user = await prisma.user.upsert({
          where: { tenantId_email: { tenantId: tenant.id, email } },
          update: {
            passwordHash,
            firstName: prefix.split('.')[0].replace(/^./, (value) => value.toUpperCase()),
            lastName: `Test${index}`,
            isActive: true,
            profileId: profile.id,
            roleId: role.id,
          },
          create: {
            tenantId: tenant.id,
            email,
            passwordHash,
            firstName: prefix.split('.')[0].replace(/^./, (value) => value.toUpperCase()),
            lastName: `Test${index}`,
            isActive: true,
            profileId: profile.id,
            roleId: role.id,
          },
          select: { id: true },
        });
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: {},
          create: { userId: user.id, roleId: role.id },
        });
        seededUsers.set(email, { id: user.id, profileName });
      }
    }

    for (const pool of ['PRESALES', 'SVC', 'SALES'] as const) {
      const profileName = pool === 'PRESALES' ? 'Presales' : pool === 'SVC' ? 'SVC' : 'Sales';
      const config = await prisma.roundRobinConfig.upsert({
        where: { tenantId_poolType: { tenantId: tenant.id, poolType: pool } },
        update: { isActive: true, profileName },
        create: {
          tenantId: tenant.id,
          poolType: pool,
          name: `${profileName} Test Round Robin`,
          description: `Seeded ${profileName} test assignment pool`,
          profileName,
          isActive: true,
        },
      });
      void config;
      for (let index = 1; index <= 3; index += 1) {
        const email = `${profileName.toLowerCase()}.test${index}@dctcrm.com`;
        const user = seededUsers.get(email);
        if (!user) throw new Error(`Missing Round Robin test user: ${email}`);
        await prisma.roundRobinMember.upsert({
          where: { tenantId_userId_poolType: { tenantId: tenant.id, userId: user.id, poolType: pool } },
          update: { isActive: true },
          create: { tenantId: tenant.id, userId: user.id, poolType: pool, isActive: true },
        });
      }
    }

    console.log(`Seeded ${seededUsers.size} deterministic test users with password ${testPassword}`);
    }

    const permissionIds = await prisma.permission.findMany({
      where: { name: { in: permissionNames } },
      select: { id: true, name: true },
    });

    const permissionIdMap = new Map(permissionIds.map((p) => [p.name, p.id]));
    const validIds = permissionNames
      .map((p) => permissionIdMap.get(p))
      .filter((id): id is string => Boolean(id));

    await prisma.userProfilePermission.deleteMany({ where: { profileId: profile.id } });
    if (validIds.length > 0) {
      await prisma.userProfilePermission.createMany({
        data: validIds.map((permissionId) => ({ profileId: profile.id, permissionId })),
      });
    }

    console.log(`Assigned ${validIds.length} permissions to ${profileName}`);
  }

  const matrixProfileNames = ['Presales', 'SVC', 'Sales', 'CRM'];
  const matrixRoleIds = new Map<string, string>();
  for (const profileName of matrixProfileNames) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: `Test ${profileName}` } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: `Test ${profileName}`,
        description: `Seeded test role for ${profileName}`,
        isSystem: false,
      },
      select: { id: true },
    });
    matrixRoleIds.set(profileName, role.id);
  }

  const matrixUsers = await prisma.user.findMany({
    where: { tenantId: tenant.id, profile: { name: { in: matrixProfileNames } } },
    select: { id: true, email: true, profile: { select: { name: true } } },
    orderBy: { email: 'asc' },
  });

  for (const user of matrixUsers) {
    const profileName = user.profile?.name;
    const targetRoleId = profileName ? matrixRoleIds.get(profileName) : undefined;
    if (!profileName || !targetRoleId) continue;
    await prisma.userRole.deleteMany({ where: { userId: user.id, roleId: { not: targetRoleId } } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: targetRoleId } },
      update: {},
      create: { userId: user.id, roleId: targetRoleId },
    });
    console.log(`Reconciled role: ${user.email} -> Test ${profileName}`);
  }

  const leftover = await prisma.permission.deleteMany({
    where: {
      OR: [
        { name: { startsWith: 'CONTACT_' } },
        { name: { startsWith: 'CUSTOMER_' } },
        { name: { startsWith: 'ACCOUNT_' } },
        { module: { in: ['CONTACT', 'CUSTOMER', 'ACCOUNT'] } },
      ],
    },
  });
  console.log(`Removed ${leftover.count} leftover Contact/Customer/Account permissions`);

  const usersToAssign = [
    { email: 'admin@dctcrm.com', profileName: 'Admin' },
    { email: 'salesmanager@dctcrm.com', profileName: 'Sales Manager' },
    { email: 'priya@dctcrm.com', profileName: 'Sales Executive' },
    { email: 'amit@dctcrm.com', profileName: 'Sales Executive' },
    { email: 'neha@dctcrm.com', profileName: 'Presales' },
  ] as const;

  for (const assignment of usersToAssign) {
    const profile = createdProfiles[assignment.profileName];
    if (!profile) {
      console.warn(`Missing profile for assignment: ${assignment.profileName}`);
      continue;
    }

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: assignment.email },
      select: { id: true, email: true, profileId: true },
    });

    if (!user) {
      console.warn(`User not found for assignment: ${assignment.email}`);
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { profileId: profile.id },
    });

    console.log(`Assigned ${assignment.email} -> ${assignment.profileName}`);
  }

  console.log('Profile seeding complete.');
}

main()
  .catch((error) => {
    console.error('Failed to seed CRM profiles:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });