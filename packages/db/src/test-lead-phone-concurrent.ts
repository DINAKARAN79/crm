import { prisma } from '@dct-crm/db';

async function main() {
  const nulls = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count FROM "Lead" WHERE "phone" IS NULL
  `);
  console.log('NULL phones (unchanged legacy):', JSON.stringify(nulls));

  const phoneIdx = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(`
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'Lead' AND indexname = 'Lead_tenantId_phone_idx'
  `);
  console.log('Phone lookup index:', JSON.stringify(phoneIdx));

  // Shared phone numbers are allowed; the CRM intake matcher handles review.
  const tenant = await prisma.tenant.findFirstOrThrow();
  const creator = await prisma.user.findFirstOrThrow({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  });
  const phone = `+91-9${Date.now().toString().slice(-10)}`;
  const make = (lastName: string) =>
    prisma.lead.create({
      data: {
        tenantId: tenant.id,
        creatorId: creator.id,
        lastName,
        company: 'RaceDb',
        phone,
        source: 'OTHER',
        status: 'NEW',
      },
      select: { id: true },
    });

  const settled = await Promise.allSettled([make('One'), make('Two')]);
  const ok = settled.filter((s) => s.status === 'fulfilled').length;
  const rejected = settled.filter((s) => s.status === 'rejected');
  const createdIds = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value.id] : [],
  );
  if (createdIds.length) {
    await prisma.lead.deleteMany({ where: { id: { in: createdIds } } });
    console.log('Cleaned shared-phone test leads', createdIds);
  }
  if (ok !== 2 || rejected.length !== 0 || phoneIdx.length === 0) {
    throw new Error(`Expected two Leads to share one phone with a lookup index, got ok=${ok} rejected=${rejected.length}`);
  }
  console.log('DB shared-phone handling OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
