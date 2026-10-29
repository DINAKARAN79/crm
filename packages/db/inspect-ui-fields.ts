import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } });
  for (const tenant of tenants) {
    console.log('=== TENANT', tenant.id, tenant.name, '===');
    const objects = await prisma.objectDefinition.findMany({
      where: { tenantId: tenant.id, name: { in: ['Lead'] } },
      include: {
        fields: { orderBy: { displayOrder: 'asc' } },
      },
    });
    for (const obj of objects) {
      console.log('--- Object', obj.name, obj.id);
      console.log(
        'Fields:',
        obj.fields.map((f) => `${f.name}(${f.label}|active=${f.isActive}|vis=${'visible' in f ? (f as any).visible : 'n/a'})`).join(', '),
      );
      const layouts = await prisma.pageLayout.findMany({ where: { objectId: obj.id } });
      for (const layout of layouts) {
        console.log('Layout', layout.name, layout.sections);
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
