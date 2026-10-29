import { prisma } from '@dct-crm/db';

const normalizePhone = (raw: string): string => raw.replace(/\s+/g, '');

async function main() {
  const emptied = await prisma.$executeRawUnsafe(`
    UPDATE "Lead"
    SET "phone" = NULL
    WHERE "phone" IS NOT NULL AND TRIM("phone") = ''
  `);
  console.log('Empty-string phones set to NULL:', emptied);

  const all = await prisma.lead.findMany({
    select: {
      id: true,
      tenantId: true,
      leadNumber: true,
      phone: true,
      createdAt: true,
      firstName: true,
      lastName: true,
    },
    orderBy: [{ createdAt: 'asc' }, { leadNumber: 'asc' }],
  });

  const groups = new Map<string, typeof all>();
  for (const lead of all) {
    if (!lead.phone || !lead.phone.trim()) continue;
    const key = `${lead.tenantId}::${normalizePhone(lead.phone)}`;
    const arr = groups.get(key) || [];
    arr.push(lead);
    groups.set(key, arr);
  }

  let cleared = 0;
  const clearedLog: any[] = [];
  const keptLog: any[] = [];

  for (const [key, leads] of groups) {
    if (leads.length < 2) continue;
    const sorted = [...leads].sort((a, b) => {
      const an = a.leadNumber || '';
      const bn = b.leadNumber || '';
      if (an !== bn) return an < bn ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const keep = sorted[0];
    const drop = sorted.slice(1);
    keptLog.push({
      key,
      kept: { id: keep.id, leadNumber: keep.leadNumber, phone: keep.phone },
      clearedCount: drop.length,
    });
    for (const d of drop) {
      await prisma.lead.update({ where: { id: d.id }, data: { phone: null } });
      clearedLog.push({
        tenantId: d.tenantId,
        phone: d.phone,
        leadNumber: d.leadNumber,
        id: d.id,
        name: `${d.firstName || ''} ${d.lastName}`.trim(),
        keptLeadNumber: keep.leadNumber,
      });
      cleared += 1;
    }
  }

  console.log('KEPT (older phone remains):', JSON.stringify(keptLog, null, 2));
  console.log('CLEARED (newer duplicate phone set to NULL):', cleared);
  console.log(JSON.stringify(clearedLog, null, 2));

  const after = await prisma.lead.findMany({
    select: { tenantId: true, phone: true, leadNumber: true },
  });
  const afterGroups = new Map<string, string[]>();
  let nullOrEmpty = 0;
  for (const lead of after) {
    if (!lead.phone || !lead.phone.trim()) {
      nullOrEmpty += 1;
      continue;
    }
    const key = `${lead.tenantId}::${normalizePhone(lead.phone)}`;
    const arr = afterGroups.get(key) || [];
    arr.push(lead.leadNumber || lead.phone);
    afterGroups.set(key, arr);
  }
  let remaining = 0;
  const remainingDetail: any[] = [];
  for (const [key, lns] of afterGroups) {
    if (lns.length > 1) {
      remaining += 1;
      remainingDetail.push({ key, count: lns.length, leads: lns });
    }
  }
  const emptyRemaining = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM "Lead" WHERE "phone" IS NOT NULL AND TRIM("phone") = ''`
  );
  console.log('REMAINING DUPLICATE GROUPS:', remaining, JSON.stringify(remainingDetail));
  console.log('NULL/EMPTY PHONES AFTER RESOLUTION:', nullOrEmpty);
  console.log('EMPTY STRING REMAINING:', JSON.stringify(emptyRemaining));
  if (remaining > 0) {
    throw new Error('Duplicate phones still present — aborting before unique constraint');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
