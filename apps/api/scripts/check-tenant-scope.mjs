import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const schemaPath = path.join(root, 'packages/db/prisma/schema.prisma');
const routeDir = path.join(root, 'apps/api/src/routes');
const routeFiles = [
  'leads.ts',
  'bookings.ts',
  'siteVisits.ts',
  'projects.ts',
  'units.ts',
  'dashboards.ts',
  'reports.ts',
  'followUps.ts',
  'homepages.ts',
  'analytics.ts',
  'quotations.ts',
  'callDetails.ts',
  'activities.ts',
  'users.ts',
  'profiles.ts',
  'objectDefinitions.ts',
  'pageLayouts.ts',
  'dataAdministration.ts',
  'dynamicCrud.ts',
  'search.ts',
];

const schema = fs.readFileSync(schemaPath, 'utf8');
const tenantModels = new Map();
let current = null;
for (const line of schema.split('\n')) {
  const start = line.match(/^model (\w+) \{/);
  if (start) {
    current = start[1];
    tenantModels.set(current, false);
    continue;
  }
  if (current && line.startsWith('}')) current = null;
  if (current && /^\s+tenantId\s+/.test(line)) tenantModels.set(current, true);
}

function modelName(delegate) {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

const listMethods = new Set(['findMany', 'findFirst', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy']);
const findings = [];

for (const file of routeFiles) {
  const full = path.join(routeDir, file);
  if (!fs.existsSync(full)) continue;
  const source = fs.readFileSync(full, 'utf8');
  const pattern = /prisma\.(\w+)\.(findMany|findFirst|findUnique|update|updateMany|delete|deleteMany|count|aggregate|groupBy)\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) {
    const [, delegate, method] = match;
    const model = modelName(delegate);
    if (!tenantModels.get(model)) continue;
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let end = start;
    for (; end < source.length && end < start + 1200; end += 1) {
      const char = source[end];
      if (char === '(') depth += 1;
      else if (char === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const args = source.slice(start, end + 1);
    if (args.includes('tenantId') || args.includes('...where') || args.includes('...scope') || args.includes('leadIdScope') || args.includes('followUpAccessWhere')) {
      continue;
    }
    const names = new Set();
    if (/\bwhere\b/.test(args)) names.add('where');
    for (const named of args.matchAll(/\bwhere\s*:\s*([A-Za-z_][\w]*)/g)) names.add(named[1]);
    const before = source.slice(Math.max(0, match.index - 5000), match.index);
    const scopedByVariable = [...names].some((name) => {
      const assignments = [...before.matchAll(new RegExp(`(?:const|let|var)?\\s*${name}\\b[^=\\n]{0,80}=`, 'g'))];
      const last = assignments[assignments.length - 1];
      if (!last) return false;
      return before.slice(last.index, last.index + 1800).includes('tenantId');
    });
    if (scopedByVariable) continue;
    if (!listMethods.has(method) && !args.includes('where')) continue;
    const line = source.slice(0, match.index).split('\n').length;
    findings.push(`${file}:${line} prisma.${delegate}.${method} has no tenantId`);
  }
}

console.log(`Tenant-scoped models: ${[...tenantModels].filter(([, has]) => has).length}`);
console.log(`Unchecked queries in the company modules: ${findings.length}`);
for (const finding of findings) console.log(finding);
process.exit(findings.length ? 2 : 0);
