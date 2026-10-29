import { prisma } from '@dct-crm/db';

const normalizePhone = (raw: string): string => raw.replace(/\s+/g, '');

async function main() {
  const nullEmpty = await prisma.$queryRawUnsafe(`
    SELECT "tenantId", COUNT(*)::int as count
    FROM "Lead"
    WHERE "phone" IS NULL OR TRIM("phone") = ''
    GROUP BY "tenantId"
    ORDER BY "tenantId"
  `);
  const nullTotal = (nullEmpty as any[]).reduce((s, r) => s + Number(r.count), 0);
  console.log('NULL/EMPTY PHONE BY TENANT:', JSON.stringify(nullEmpty));
  console.log('NULL/EMPTY PHONE TOTAL:', nullTotal);

  const nullSample = await prisma.$queryRawUnsafe(`
    SELECT id, "tenantId", "leadNumber", "firstName", "lastName", phone
    FROM "Lead"
    WHERE "phone" IS NULL OR TRIM("phone") = ''
    LIMIT 20
  `);
  console.log('NULL/EMPTY SAMPLE (up to 20):', JSON.stringify(nullSample, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));

  const all = await prisma.lead.findMany({
    select: { id: true, tenantId: true, leadNumber: true, phone: true, firstName: true, lastName: true },
  });

  const byTenantNorm = new Map<string, typeof all>();
  for (const lead of all) {
    if (!lead.phone || !lead.phone.trim()) continue;
    const key = `${lead.tenantId}::${normalizePhone(lead.phone)}`;
    const arr = byTenantNorm.get(key) || [];
    arr.push(lead);
    byTenantNorm.set(key, arr);
  }

  const dupGroups: any[] = [];
  for (const [key, leads] of byTenantNorm) {
    if (leads.length > 1) {
      const [tenantId, phone] = key.split('::');
      dupGroups.push({
        tenantId,
        phone,
        duplicateCount: leads.length,
        leads: leads.map((l) => ({ id: l.id, leadNumber: l.leadNumber, name: `${l.firstName || ''} ${l.lastName}`.trim() })),
      });
    }
  }

  console.log('DUPLICATE PHONE GROUPS (tenant-scoped, whitespace-normalized):', dupGroups.length);
  console.log(JSON.stringify(dupGroups, null, 2));

  // Also raw exact duplicates without normalization, for comparison
  const byTenantRaw = new Map<string, typeof all>();
  for (const lead of all) {
    if (!lead.phone || !lead.phone.trim()) continue;
    const key = `${lead.tenantId}::${lead.phone}`;
    const arr = byTenantRaw.get(key) || [];
    arr.push(lead);
    byTenantRaw.set(key, arr);
  }
  let rawDupCount = 0;
  for (const leads of byTenantRaw.values()) {
    if (leads.length > 1) rawDupCount++;
  }
  console.log('RAW EXACT DUPLICATE GROUPS (no normalization):', rawDupCount);

  const total = all.length;
  const withPhone = all.filter((l) => l.phone && l.phone.trim()).length;
  console.log('TOTAL LEADS:', total, 'WITH PHONE:', withPhone);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
