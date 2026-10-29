import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseSections(raw: string | unknown): { name: string; fields: string[] }[] {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? (raw as { name: string; fields: string[] }[]) : [];
}

async function main() {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } });

  for (const tenant of tenants) {
    const leadObject = await prisma.objectDefinition.findFirst({
      where: { tenantId: tenant.id, name: { equals: 'Lead', mode: 'insensitive' } },
      include: { fields: true },
    });
    if (!leadObject) continue;

    console.log(`Tenant ${tenant.name} (${tenant.id})`);

    const mobileField = leadObject.fields.find((f) => f.name === 'mobile');
    if (mobileField && mobileField.label !== 'Secondary Phone') {
      await prisma.fieldDefinition.update({
        where: { id: mobileField.id },
        data: { label: 'Secondary Phone' },
      });
      console.log('  mobile label -> Secondary Phone');
    }

    const scoreField = leadObject.fields.find((f) => f.name === 'score');
    if (scoreField && scoreField.visible) {
      await prisma.fieldDefinition.update({
        where: { id: scoreField.id },
        data: { visible: false },
      });
      console.log('  score field visible=false');
    }

    const layouts = await prisma.pageLayout.findMany({ where: { objectId: leadObject.id } });
    for (const layout of layouts) {
      const sections = parseSections(layout.sections);
      let changed = false;
      for (const section of sections) {
        if (!Array.isArray(section.fields)) continue;
        const before = section.fields.length;
        section.fields = section.fields.filter((f) => f !== 'score' && f !== 'website');
        if (section.fields.length !== before) changed = true;
      }
      if (changed) {
        await prisma.pageLayout.update({
          where: { id: layout.id },
          data: { sections: JSON.stringify(sections) },
        });
        console.log(`  layout ${layout.name}: removed score/website`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
