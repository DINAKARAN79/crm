import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.$queryRaw<Array<{ status: string; c: bigint }>>`
    SELECT status::text as status, COUNT(*) as c FROM "SiteVisit" GROUP BY status
  `;
  console.log('BEFORE', JSON.stringify(counts, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));

  // Map removed enum values to the 3 allowed statuses
  await prisma.$executeRaw`UPDATE "SiteVisit" SET status = 'SCHEDULED' WHERE status::text IN ('CONFIRMED','RESCHEDULED')`;
  await prisma.$executeRaw`UPDATE "SiteVisit" SET status = 'CANCELLED' WHERE status::text = 'NO_SHOW'`;

  const after = await prisma.$queryRaw<Array<{ status: string; c: bigint }>>`
    SELECT status::text as status, COUNT(*) as c FROM "SiteVisit" GROUP BY status
  `;
  console.log('AFTER', JSON.stringify(after, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
