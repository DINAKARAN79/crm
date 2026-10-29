import { prisma } from '@dct-crm/db';

const VALID_STATUSES = ['NEW', 'INCOMING', 'PROSPECT', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_HAPPENED', 'LOST'] as const;
const LEGACY_STATUSES = ['SALES', 'OPPORTUNITY', 'QUOTATION', 'APPROVAL', 'BOOKING', 'BOOKED', 'DUPLICATE'];

async function renameField(objectName: string, from: string, to: string) {
  const fields = await prisma.fieldDefinition.findMany({
    where: { object: { name: { equals: objectName, mode: 'insensitive' } } },
    select: { id: true, name: true, tenantId: true },
  });
  const fromFields = fields.filter((f) => f.name === from);
  const toByTenant = new Map(fields.filter((f) => f.name === to).map((f) => [f.tenantId, f]));

  for (const fromField of fromFields) {
    const existingTo = toByTenant.get(fromField.tenantId);
    if (existingTo && existingTo.id !== fromField.id) {
      await prisma.picklistValue.deleteMany({ where: { fieldId: fromField.id } });
      await prisma.fieldDefinition.delete({ where: { id: fromField.id } });
      console.log(`Deleted duplicate ${objectName}.${from} for tenant (kept existing ${to})`);
      continue;
    }
    await prisma.fieldDefinition.update({ where: { id: fromField.id }, data: { name: to } });
    console.log(`Renamed FieldDefinition ${objectName}.${from} → ${to} (tenant ${fromField.tenantId})`);
  }
  if (fromFields.length === 0) {
    console.log(`${objectName}.${from} not found (already renamed?)`);
  }
}

async function main() {
  await renameField('Lead', 'leadStatus', 'status');
  await renameField('Lead', 'leadSource', 'source');

  const leadStatusFields = await prisma.fieldDefinition.findMany({
    where: { name: 'status', object: { name: { equals: 'Lead', mode: 'insensitive' } } },
    select: { id: true },
  });
  const fieldIds = leadStatusFields.map((f) => f.id);

  if (fieldIds.length === 0) {
    console.log('No status FieldDefinitions found');
  } else {
    const deleted = await prisma.picklistValue.deleteMany({
      where: { fieldId: { in: fieldIds }, value: { in: LEGACY_STATUSES } },
    });
    console.log(`Deleted legacy status PicklistValues: ${deleted.count}`);

    for (const fieldId of fieldIds) {
      for (let i = 0; i < VALID_STATUSES.length; i++) {
        await prisma.picklistValue.updateMany({
          where: { fieldId, value: VALID_STATUSES[i] },
          data: { displayOrder: i, isActive: true },
        });
      }
    }
    console.log('Normalized displayOrder/isActive for 6 valid statuses');
  }

  const profiles = await prisma.profile.findMany({
    select: { id: true, name: true, leadStatusAccess: true },
  });
  let profilesUpdated = 0;
  for (const profile of profiles) {
    const access = profile.leadStatusAccess as any;
    if (!access || Array.isArray(access)) continue;
    const statuses = Array.isArray(access.statuses) ? access.statuses : null;
    if (!statuses) continue;
    const filtered = statuses.filter((s: string) => (VALID_STATUSES as readonly string[]).includes(s));
    if (JSON.stringify(filtered) !== JSON.stringify(statuses)) {
      await prisma.profile.update({
        where: { id: profile.id },
        data: { leadStatusAccess: { ...access, statuses: filtered } },
      });
      profilesUpdated++;
    }
  }
  console.log(`Profiles with legacy leadStatusAccess statuses cleaned: ${profilesUpdated}`);

  const layoutRows = await prisma.pageLayout.findMany({
    where: { object: { name: { equals: 'Lead', mode: 'insensitive' } } },
    select: { id: true, name: true, sections: true },
  });
  let layoutsUpdated = 0;
  for (const layout of layoutRows) {
    const raw = typeof layout.sections === 'string' ? JSON.parse(layout.sections) : layout.sections;
    if (!Array.isArray(raw)) continue;
    let changed = false;
    const next = raw.map((section: any) => {
      if (!section || !Array.isArray(section.fields)) return section;
      const fields = section.fields.map((name: string) => {
        if (name === 'leadStatus') { changed = true; return 'status'; }
        if (name === 'leadSource') { changed = true; return 'source'; }
        return name;
      });
      return { ...section, fields };
    });
    if (changed) {
      await prisma.pageLayout.update({
        where: { id: layout.id },
        data: { sections: next },
      });
      layoutsUpdated++;
    }
  }
  console.log(`Lead PageLayouts remapped leadStatus/leadSource → status/source: ${layoutsUpdated}`);

  const leadCounts = await prisma.$queryRawUnsafe(
    'SELECT DISTINCT status, COUNT(*)::int as count FROM "Lead" GROUP BY status ORDER BY status'
  );
  console.log('Lead status counts:', JSON.stringify(leadCounts));

  const remainingPicklist = await prisma.picklistValue.findMany({
    where: {
      field: { name: 'status', object: { name: { equals: 'Lead', mode: 'insensitive' } } },
    },
    select: { value: true, displayOrder: true, isActive: true },
    orderBy: { displayOrder: 'asc' },
  });
  console.log('status picklist after cleanup:', JSON.stringify(remainingPicklist));

  const remainingLegacy = await prisma.picklistValue.findMany({
    where: { value: { in: LEGACY_STATUSES } },
    select: {
      value: true,
      field: { select: { name: true, object: { select: { name: true } } } },
    },
  });
  console.log('Remaining legacy picklist values (any object):', JSON.stringify(remainingLegacy));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
