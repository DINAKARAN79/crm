import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const projectReadProfiles = ['SVC', 'Sales Executive', 'Manager', 'Sales'];
const unitReadProfiles = ['Sales Executive', 'Manager', 'Sales'];

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'dct-re' },
    select: { id: true },
  });
  if (!tenant) throw new Error('Tenant dct-re not found');

  const projectPermission = await prisma.permission.upsert({
    where: { name: 'PROJECT_READ' },
    update: {},
    create: {
      name: 'PROJECT_READ',
      label: 'View Project',
      module: 'PROJECT',
      action: 'READ',
    },
    select: { id: true },
  });
  const unitPermission = await prisma.permission.upsert({
    where: { name: 'UNIT_READ' },
    update: {},
    create: {
      name: 'UNIT_READ',
      label: 'View Unit',
      module: 'UNIT',
      action: 'READ',
    },
    select: { id: true },
  });

  const profiles = await prisma.profile.findMany({
    where: {
      tenantId: tenant.id,
      name: { in: [...new Set([...projectReadProfiles, ...unitReadProfiles])] },
    },
    select: { id: true, name: true },
  });

  for (const profile of profiles) {
    if (projectReadProfiles.includes(profile.name)) {
      await prisma.userProfilePermission.upsert({
        where: { profileId_permissionId: { profileId: profile.id, permissionId: projectPermission.id } },
        update: {},
        create: { profileId: profile.id, permissionId: projectPermission.id },
      });
      console.log(`Granted Project read access to ${profile.name}`);
    }
    if (unitReadProfiles.includes(profile.name)) {
      await prisma.userProfilePermission.upsert({
        where: { profileId_permissionId: { profileId: profile.id, permissionId: unitPermission.id } },
        update: {},
        create: { profileId: profile.id, permissionId: unitPermission.id },
      });
      console.log(`Granted Unit read access to ${profile.name}`);
    }
  }
}

main()
  .catch((error) => {
    console.error('Failed to grant Sales workflow read access:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });