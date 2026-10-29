/* eslint-disable no-console */
// ============================================================
// TEMP SECOND-TENANT PROVISIONER - used ONLY by test_lead_convert.ps1
// (F-section real cross-tenant tests). Safe to delete the temp tenant
// at any time; NEVER touches any tenant other than slug "zz-temp-t2".
//
// WHY this exists: every tenant-scoped API route writes req.tenantId
// from the CALLER's JWT (apps/api/src/middleware/auth.ts), so a
// superadmin (bound to tenant A) cannot create Profiles/Users inside
// tenant B through the API. The tenant row itself is created by the
// suite via POST /api/admin/tenants (superadmin route); this script
// provisions the minimum tenant-B auth data (Admin profile +
// FULL_SYSTEM_ACCESS permission + admin user) at the DB level,
// mirroring the existing packages/db/src/repair-admin-access.ts pattern.
//
// Usage (from monorepo root):
//   node test_cross_tenant_setup.js up      # provision (idempotent)
//   node test_cross_tenant_setup.js down    # delete ONLY zz-temp-t2 data
// ============================================================
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const SLUG = 'zz-temp-t2';
const EMAIL = 't2.admin@zztemp.test';
const PASSWORD = 'T2TempPass!234';

async function up() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) throw new Error(`tenant ${SLUG} not found - create it via POST /api/admin/tenants first`);

  let perm = await prisma.permission.findUnique({ where: { name: 'FULL_SYSTEM_ACCESS' } });
  if (!perm) {
    perm = await prisma.permission.create({
      data: { name: 'FULL_SYSTEM_ACCESS', label: 'Full System Access', module: 'System', action: 'ACCESS' },
    });
  }

  const profile = await prisma.profile.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Admin' } },
    update: { isAdmin: true },
    create: {
      tenantId: tenant.id,
      name: 'Admin',
      description: 'Temp tenant admin (cross-tenant verification)',
      isAdmin: true,
    },
  });

  await prisma.userProfilePermission.upsert({
    where: { profileId_permissionId: { profileId: profile.id, permissionId: perm.id } },
    update: {},
    create: { profileId: profile.id, permissionId: perm.id },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: EMAIL } },
    update: { profileId: profile.id, isActive: true },
    create: {
      tenantId: tenant.id,
      email: EMAIL,
      passwordHash,
      firstName: 'Temp',
      lastName: 'TenantAdmin',
      isActive: true,
      profileId: profile.id,
    },
  });

  console.log(JSON.stringify({ ok: true, tenantId: tenant.id, userId: user.id, profileId: profile.id }));
}

async function down() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.log(JSON.stringify({ ok: true, note: 'tenant already absent' }));
    return;
  }

  // UserRole has no tenantId column - clear it first for tenant-B users.
  const bUsers = await prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
  if (bUsers.length > 0) {
    await prisma.userRole.deleteMany({ where: { userId: { in: bUsers.map((u) => u.id) } } }).catch(() => {});
  }

  const cols = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'",
  );
  const tables = [...new Set(cols.map((c) => c.table_name))].filter((t) => t.toLowerCase() !== 'tenant');
  const deleted = {};

  // Iterative passes tolerate FK ordering between tenant-scoped tables.
  for (let pass = 0; pass < 8; pass += 1) {
    let progressed = false;
    for (const t of tables) {
      try {
        const n = await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenant.id);
        if (n > 0) {
          deleted[t] = (deleted[t] || 0) + n;
          progressed = true;
        }
      } catch (e) {
        // FK not yet deletable - retry on next pass
      }
    }
    if (!progressed) break;
  }

  let leftover = 0;
  const leftoverTables = [];
  for (const t of tables) {
    try {
      const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS c FROM "${t}" WHERE "tenantId" = $1`, tenant.id);
      if (rows[0].c > 0) {
        leftover += rows[0].c;
        leftoverTables.push(`${t}:${rows[0].c}`);
      }
    } catch (e) {
      // table unreadable - ignore
    }
  }
  if (leftover > 0) {
    console.error(JSON.stringify({ ok: false, leftover, leftoverTables, deleted }));
    process.exitCode = 1;
    return;
  }

  try {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: `tenant delete blocked: ${e.message}`, deleted }));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ ok: true, tenantId: tenant.id, deleted }));
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'up') await up();
  else if (mode === 'down') await down();
  else {
    console.error('usage: node test_cross_tenant_setup.js up|down');
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: e.message }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
