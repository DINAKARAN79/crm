import { prisma } from '@dct-crm/db';

async function main() {
  const result = await prisma.fieldDefinition.updateMany({
    where: {
      name: 'phone',
      object: { name: { equals: 'Lead', mode: 'insensitive' } },
    },
    data: { required: true },
  });
  console.log(`FieldDefinition phone required=true updated: ${result.count} row(s)`);

  const missing = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) as count FROM "Lead" WHERE "phone" IS NULL OR TRIM("phone") = \'\''
  );
  console.log('Existing leads missing phone (unchanged):', JSON.stringify(missing, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));

  const total = await prisma.lead.count();
  console.log('Total leads:', total);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
