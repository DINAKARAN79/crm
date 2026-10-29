import { Prisma, PrismaClient } from '@prisma/client';
import { ENQUIRY_SOURCE_FIELD_NAMES, enquirySourceFieldNameSet } from './enquiry-source-fields';
import { seedEnquiryFields } from './seed-salesforce-fields';

const prisma = new PrismaClient();

function parsedSections(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function withoutEnquiryFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((section) => {
      if (!section || typeof section !== 'object') return section;
      const row = section as { fields?: unknown; items?: unknown };
      return {
        ...row,
        ...(Array.isArray(row.fields)
          ? { fields: row.fields.filter((name) => typeof name !== 'string' || !enquirySourceFieldNameSet.has(name)) }
          : {}),
        ...(Array.isArray(row.items)
          ? {
              items: row.items.filter((item) => {
                if (!item || typeof item !== 'object') return true;
                const fieldName = (item as { fieldApiName?: unknown }).fieldApiName;
                return typeof fieldName !== 'string' || !enquirySourceFieldNameSet.has(fieldName);
              }),
            }
          : {}),
      };
    });
  }
  if (value && typeof value === 'object' && Array.isArray((value as { sections?: unknown }).sections)) {
    const document = value as { sections: unknown };
    return { ...document, sections: withoutEnquiryFields(document.sections) };
  }
  return value;
}

function countFieldRefs(value: unknown): number {
  const text = JSON.stringify(value);
  return ENQUIRY_SOURCE_FIELD_NAMES.reduce(
    (count, name) => count + (text.includes(`"${name}"`) ? 1 : 0),
    0,
  );
}

async function moveTenant(tenantId: string) {
  const [lead, enquiry, user] = await Promise.all([
    prisma.objectDefinition.findFirst({ where: { tenantId, name: 'Lead' }, select: { id: true } }),
    prisma.objectDefinition.findFirst({ where: { tenantId, name: 'Enquiry' }, select: { id: true } }),
    prisma.user.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }),
  ]);
  if (!lead || !enquiry || !user) {
    return { tenantId, moved: 0, created: 0, layouts: 0, skipped: true };
  }

  const existing = await prisma.fieldDefinition.findMany({
    where: { objectId: lead.id, name: { in: [...ENQUIRY_SOURCE_FIELD_NAMES] } },
    select: { id: true, name: true },
  });
  let moved = 0;
  for (const field of existing) {
    const conflict = await prisma.fieldDefinition.findFirst({
      where: { objectId: enquiry.id, name: field.name },
      select: { id: true },
    });
    if (conflict) continue;
    await prisma.fieldDefinition.update({
      where: { id: field.id },
      data: { objectId: enquiry.id },
    });
    moved += 1;
  }

  const created = await seedEnquiryFields(tenantId, user.id);
  const layouts = await prisma.pageLayout.findMany({
    where: { objectId: lead.id },
    select: { id: true, sections: true },
  });
  let layoutUpdates = 0;
  for (const layout of layouts) {
    const original = parsedSections(layout.sections);
    const next = withoutEnquiryFields(original);
    if (JSON.stringify(original) === JSON.stringify(next)) continue;
    const sections = typeof layout.sections === 'string' ? JSON.stringify(next) : next;
    await prisma.pageLayout.update({
      where: { id: layout.id },
      data: { sections: sections as Prisma.InputJsonValue },
    });
    layoutUpdates += 1;
  }

  const enquiryLayout = await prisma.pageLayout.findFirst({
    where: { objectId: enquiry.id, isDefault: true },
    select: { id: true, sections: true },
  });
  if (enquiryLayout && countFieldRefs(parsedSections(enquiryLayout.sections)) === 0) {
    const fields = await prisma.fieldDefinition.findMany({
      where: { objectId: enquiry.id, name: { in: [...ENQUIRY_SOURCE_FIELD_NAMES] } },
      select: { name: true },
      orderBy: { displayOrder: 'asc' },
    });
    await prisma.pageLayout.update({
      where: { id: enquiryLayout.id },
      data: {
        sections: [{ name: 'Enquiry Information', fields: fields.map((field) => field.name) }],
      },
    });
  }

  return { tenantId, moved, created, layouts: layoutUpdates, skipped: false };
}

async function main() {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  for (const tenant of tenants) {
    const result = await moveTenant(tenant.id);
    const [leadCount, enquiryCount] = await Promise.all([
      prisma.fieldDefinition.count({
        where: { tenantId: tenant.id, object: { name: 'Lead' }, name: { in: [...ENQUIRY_SOURCE_FIELD_NAMES] } },
      }),
      prisma.fieldDefinition.count({
        where: { tenantId: tenant.id, object: { name: 'Enquiry' }, name: { in: [...ENQUIRY_SOURCE_FIELD_NAMES] } },
      }),
    ]);
    console.log(JSON.stringify({ tenant: tenant.name, ...result, leadRemaining: leadCount, enquiryFields: enquiryCount }));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
