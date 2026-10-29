import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Leads still stored as NEW (database value "1") that already have a call log.
 * Run with --apply only after the count is confirmed.
 */
async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT l.id
    FROM "Lead" l
    WHERE l.status = '1'
      AND EXISTS (
        SELECT 1
        FROM "CallDetail" c
        WHERE c."leadId" = l.id
          AND c."tenantId" = l."tenantId"
      )
  `;

  console.log(`New leads that already have a call log: ${rows.length}`);
  if (!apply) {
    console.log('Count only. Re-run with --apply to set these leads to Incoming.');
    return;
  }

  const updated = await prisma.lead.updateMany({
    where: { id: { in: rows.map((row) => row.id) }, status: 'NEW' },
    data: { status: 'INCOMING' },
  });
  console.log(`Updated ${updated.count} leads from New to Incoming.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
