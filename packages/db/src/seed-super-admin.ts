import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 12);

  // Create a dedicated platform tenant for Super Admin
  let platformTenant = await prisma.tenant.findUnique({ where: { slug: 'platform' } });
  if (!platformTenant) {
    platformTenant = await prisma.tenant.create({
      data: {
        name: 'Platform',
        slug: 'platform',
        companyCode: 'PLATFORM',
        settings: { type: 'platform' },
      },
    });
    console.log('Created platform tenant');
  }

  const superAdmin = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: platformTenant.id,
        email: 'superadmin@dctcrm.com',
      },
    },
    update: {
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      isSuperAdmin: true,
      isActive: true,
    },
    create: {
      tenantId: platformTenant.id,
      email: 'superadmin@dctcrm.com',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      isSuperAdmin: true,
      isActive: true,
    },
  });

  console.log(`Super Admin ready: ${superAdmin.email} (ID: ${superAdmin.id})`);
  console.log('Login credentials: superadmin@dctcrm.com / password123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());