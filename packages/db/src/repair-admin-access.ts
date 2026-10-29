import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'admin@dctcrm.com' },
    select: { id: true, tenantId: true },
  });

  if (!user) {
    throw new Error('admin@dctcrm.com was not found');
  }

  const [profile, role] = await Promise.all([
    prisma.profile.upsert({
      where: {
        tenantId_name: {
          tenantId: user.tenantId,
          name: 'System Administrator',
        },
      },
      update: { isAdmin: true },
      create: {
        tenantId: user.tenantId,
        name: 'System Administrator',
        description: 'Full admin profile',
        isAdmin: true,
      },
    }),
    prisma.role.findUnique({
      where: {
        tenantId_name: {
          tenantId: user.tenantId,
          name: 'Admin',
        },
      },
    }),
  ]);

  if (!role) {
    throw new Error('Admin role was not found for the user tenant');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { profileId: profile.id, roleId: role.id },
    }),
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    }),
  ]);

  console.log('Repaired admin access for admin@dctcrm.com');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
