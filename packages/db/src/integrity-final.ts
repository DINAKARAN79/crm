import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const forbidden = ['Account', 'Contact', 'Customer', 'Property'];
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'"
  );
  const names = tables.map((t) => t.tablename);
  const forbiddenPresent = forbidden.filter((f) =>
    names.some((n) => n.toLowerCase() === f.toLowerCase() || n.toLowerCase().startsWith(f.toLowerCase() + '_'))
  );

  const required = ['User', 'Profile', 'Permission', 'PermissionSet', 'Lead', 'SiteVisit', 'Project', 'Unit', 'Task', 'Report', 'ReportFolder', 'Tenant'];
  const missingRequired = required.filter((r) => !names.some((n) => n.toLowerCase() === r.toLowerCase()));

  const duplicatePhones = await prisma.$queryRawUnsafe<{ tenantId: string; phone: string; cnt: bigint }[]>(
    `SELECT "tenantId", phone, COUNT(*)::bigint AS cnt FROM "Lead" WHERE phone IS NOT NULL AND phone <> '' GROUP BY "tenantId", phone HAVING COUNT(*) > 1`
  );

  const duplicateLeadNumbers = await prisma.$queryRawUnsafe<{ tenantId: string; leadNumber: string; cnt: bigint }[]>(
    `SELECT "tenantId", "leadNumber", COUNT(*)::bigint AS cnt FROM "Lead" WHERE "leadNumber" IS NOT NULL GROUP BY "tenantId", "leadNumber" HAVING COUNT(*) > 1`
  );

  const validStatuses = ['NEW', 'INCOMING', 'PROSPECT', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_HAPPENED', 'LOST'];
  const invalidStatuses = await prisma.$queryRawUnsafe<{ status: string; cnt: bigint }[]>(
    `SELECT status, COUNT(*)::bigint AS cnt FROM "Lead" WHERE status IS NOT NULL GROUP BY status`
  );
  const invalidStatusList = invalidStatuses.filter((s) => !validStatuses.includes(s.status));

  const orphanLeads = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
    `SELECT COUNT(*)::bigint AS cnt FROM "Lead" l LEFT JOIN "Tenant" t ON l."tenantId" = t.id WHERE t.id IS NULL`
  );

  const orphanUsers = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
    `SELECT COUNT(*)::bigint AS cnt FROM "User" u LEFT JOIN "Tenant" t ON u."tenantId" = t.id WHERE t.id IS NULL`
  );

  const result = {
    forbiddenTablesPresent: forbiddenPresent,
    missingRequiredTables: missingRequired,
    duplicatePhones: duplicatePhones.length,
    duplicatePhoneDetails: duplicatePhones.map((d) => ({ tenantId: d.tenantId, phone: d.phone, count: Number(d.cnt) })),
    duplicateLeadNumbers: duplicateLeadNumbers.length,
    duplicateLeadNumberDetails: duplicateLeadNumbers.map((d) => ({ tenantId: d.tenantId, leadNumber: d.leadNumber, count: Number(d.cnt) })),
    invalidLeadStatuses: invalidStatusList.map((s) => ({ status: s.status, count: Number(s.cnt) })),
    orphanLeads: Number(orphanLeads[0]?.cnt ?? 0),
    orphanUsers: Number(orphanUsers[0]?.cnt ?? 0),
    totalTables: names.length,
  };
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
