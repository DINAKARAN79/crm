import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

async function main() {
  const sql = readFileSync(join(__dirname, 'migrations', 'remove-account-contact.sql'), 'utf8');
  // DO blocks contain semicolons; send the whole file as one script via $executeRawUnsafe
  // Prisma prepared statements cannot take multi-command scripts, so split on DO block boundaries carefully.
  const blocks = sql
    .split(/\n(?=DO \$\$|DELETE FROM|-- =+)/)
    .map((s) => s.trim())
    .filter((s) => s && !/^--\s*Remove Account/.test(s));

  for (const block of blocks) {
    const cleaned = block
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
    if (!cleaned) continue;
    await prisma.$executeRawUnsafe(cleaned);
    console.log('OK:', cleaned.split('\n')[0].slice(0, 90));
  }
  console.log('remove-account-contact.sql applied OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
