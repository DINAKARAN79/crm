import { prisma } from '@dct-crm/db';

async function main() {
  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'Lead'
    ORDER BY indexname
  `);
  console.log('Lead indexes:', JSON.stringify(indexes, null, 2));

  const emptyStr = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM "Lead" WHERE "phone" IS NOT NULL AND TRIM("phone") = ''`
  );
  console.log('Empty string phones:', JSON.stringify(emptyStr));

  const dups = await prisma.$queryRawUnsafe(`
    SELECT "tenantId", "phone", COUNT(*)::int as cnt, array_agg("leadNumber") as leads
    FROM "Lead"
    WHERE "phone" IS NOT NULL
    GROUP BY "tenantId", "phone"
    HAVING COUNT(*) > 1
  `);
  console.log('Exact duplicate groups:', JSON.stringify(dups));

  const normDups = await prisma.lead.findMany({
    select: { tenantId: true, phone: true, leadNumber: true },
  });
  const map = new Map<string, string[]>();
  for (const l of normDups) {
    if (!l.phone || !l.phone.trim()) continue;
    const k = `${l.tenantId}::${l.phone.replace(/\s+/g, '')}`;
    const a = map.get(k) || [];
    a.push(l.leadNumber || '?');
    map.set(k, a);
  }
  const remaining = [...map.entries()].filter(([, v]) => v.length > 1);
  console.log('Normalized remaining dups:', remaining.length, JSON.stringify(remaining));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
