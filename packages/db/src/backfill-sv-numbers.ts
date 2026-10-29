import { prisma } from '@dct-crm/db';

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of tenants) {
    const missing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "SiteVisit"
      WHERE "tenantId" = ${t.id} AND "siteVisitNumber" IS NULL
      ORDER BY "createdAt" ASC
    `;
    console.log(`Tenant ${t.id}: ${missing.length} missing numbers`);
    if (missing.length === 0) continue;

    let seq = await prisma.sequence.findUnique({
      where: { tenantId_type: { tenantId: t.id, type: 'SITE_VISIT' } },
    });
    if (!seq) {
      seq = await prisma.sequence.create({
        data: { tenantId: t.id, type: 'SITE_VISIT', nextValue: 0 },
      });
    }

    let next = seq.nextValue;
    for (const row of missing) {
      next += 1;
      await prisma.siteVisit.update({
        where: { id: row.id },
        data: { siteVisitNumber: `SV${String(next).padStart(6, '0')}` },
      });
    }
    await prisma.sequence.update({
      where: { id: seq.id },
      data: { nextValue: next },
    });
    console.log(`  Backfilled ${missing.length}, sequence now SV${String(next).padStart(6, '0')}`);
  }

  const remaining = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "SiteVisit" WHERE "siteVisitNumber" IS NULL
  `;
  console.log(`Remaining null: ${Number(remaining[0]?.c ?? 0)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
