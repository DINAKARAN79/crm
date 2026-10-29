import { prisma } from '@dct-crm/db';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function splitSqlStatements(sql: string): string[] {
  const cleaned = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements: string[] = [];
  let current = '';
  let inDollar = false;
  const dollarTag = '$$';

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (!inDollar && ch === '$' && next === '$') {
      inDollar = true;
      current += dollarTag;
      i++;
      continue;
    }
    if (inDollar && ch === '$' && next === '$') {
      inDollar = false;
      current += dollarTag;
      i++;
      continue;
    }

    if (!inDollar && ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt + ';');
      current = '';
      continue;
    }

    current += ch;
  }

  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

async function main() {
  const sqlPath = resolve(__dirname, '../migrations/remove-customer-property-account-salesforce.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const statements = splitSqlStatements(sql);
  console.log(`Applying migration: ${sqlPath}`);
  console.log(`Statements: ${statements.length}`);

  for (const [i, stmt] of statements.entries()) {
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 120);
    console.log(`[${i + 1}/${statements.length}] ${preview}`);
    await prisma.$executeRawUnsafe(stmt);
  }

  console.log('Migration applied successfully.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
