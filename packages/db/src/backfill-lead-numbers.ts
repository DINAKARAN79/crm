import { prisma } from '@dct-crm/db';

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const tenant of tenants) {
    const [missing, numbered, sequence] = await Promise.all([
      prisma.lead.findMany({
        where: {
          tenantId: tenant.id,
          OR: [{ leadNumber: null }, { leadNumber: '' }],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      prisma.lead.findMany({
        where: { tenantId: tenant.id, leadNumber: { not: null } },
        select: { leadNumber: true },
      }),
      prisma.sequence.findUnique({
        where: { tenantId_type: { tenantId: tenant.id, type: 'LEAD' } },
      }),
    ]);

    const highestExistingNumber = numbered.reduce((highest, lead) => {
      const match = lead.leadNumber?.match(/^LN(\d+)$/);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    let nextValue = Math.max(sequence?.nextValue ?? 0, highestExistingNumber);

    for (const lead of missing) {
      nextValue += 1;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { leadNumber: `LN${String(nextValue).padStart(6, '0')}` },
      });
    }

    if (sequence) {
      if (sequence.nextValue !== nextValue) {
        await prisma.sequence.update({
          where: { id: sequence.id },
          data: { nextValue },
        });
      }
    } else if (nextValue > 0) {
      await prisma.sequence.create({
        data: { tenantId: tenant.id, type: 'LEAD', nextValue },
      });
    }

    console.log(`Tenant ${tenant.id}: backfilled ${missing.length} Lead Numbers`);
  }

  const remaining = await prisma.lead.count({
    where: { OR: [{ leadNumber: null }, { leadNumber: '' }] },
  });
  console.log(`Remaining Leads without a number: ${remaining}`);
}

main()
  .catch((error) => {
    console.error('Lead Number backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });