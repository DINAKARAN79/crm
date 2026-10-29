import { PrismaClient } from '@prisma/client';
import { BOOKING_FIELDS, BOOKING_STAGE_OPTIONS, BOOKING_OBJECT, bookingLayoutSections } from '@dct-crm/shared';

const prisma = new PrismaClient();
const fullAccess = { canCreate: true, canRead: true, canUpdate: true, canDelete: true, viewAll: true, modifyAll: true };

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const tenant of tenants) {
    const admin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true, OR: [{ profile: { isAdmin: true } }, { isSuperAdmin: true }] },
      select: { id: true },
    });
    if (!admin) {
      console.warn(`Skipping ${tenant.name}: no admin user found`);
      continue;
    }

    const existing = await prisma.objectDefinition.findFirst({
      where: { tenantId: tenant.id, name: BOOKING_OBJECT.name },
      select: { id: true },
    });
    const object = existing ?? await prisma.objectDefinition.create({
      data: { tenantId: tenant.id, ...BOOKING_OBJECT, objectType: 'standard', createdBy: admin.id, updatedBy: admin.id },
      select: { id: true },
    });

    await prisma.fieldDefinition.createMany({
      data: BOOKING_FIELDS.map((field, index) => ({
        tenantId: tenant.id,
        objectId: object.id,
        name: field.name,
        label: field.label,
        fieldType: field.fieldType,
        lookupObject: field.lookupObject,
        editable: field.editable !== false,
        isCustomField: true,
        isStandardField: false,
        searchable: true,
        sortable: true,
        filterable: true,
        displayOrder: index,
        createdBy: admin.id,
      })),
      skipDuplicates: true,
    });

    await prisma.fieldDefinition.updateMany({
      where: { tenantId: tenant.id, objectId: object.id },
      data: { isCustomField: true, isStandardField: false },
    });

    await prisma.fieldDefinition.updateMany({
      where: { tenantId: tenant.id, objectId: object.id, name: 'status' },
      data: { label: 'Reservation Status' },
    });
    const stageField = await prisma.fieldDefinition.findFirst({
      where: { tenantId: tenant.id, objectId: object.id, name: 'bookingStage' },
      select: { id: true },
    });
    if (stageField) {
      await prisma.picklistValue.createMany({
        data: BOOKING_STAGE_OPTIONS.map((option, index) => ({
          tenantId: tenant.id,
          fieldId: stageField.id,
          ...option,
          displayOrder: index,
          isDefault: index === 0,
        })),
        skipDuplicates: true,
      });
    }

    const layoutRow = await prisma.pageLayout.findFirst({ where: { objectId: object.id, isDefault: true }, select: { id: true } });
    if (layoutRow) {
      await prisma.pageLayout.update({ where: { id: layoutRow.id }, data: { sections: bookingLayoutSections() } });
    }

    const layout = await prisma.pageLayout.findFirst({ where: { objectId: object.id, isDefault: true }, select: { id: true } });
    if (!layout) {
      await prisma.pageLayout.create({
        data: {
          tenantId: tenant.id,
          objectId: object.id,
          name: 'Default Layout',
          isDefault: true,
          sections: bookingLayoutSections(),
          createdBy: admin.id,
        },
      });
    }

    const adminProfiles = await prisma.profile.findMany({
      where: { tenantId: tenant.id, name: { in: ['Admin', 'CRM', 'CRM Admin'] } },
      select: { id: true },
    });
    for (const profile of adminProfiles) {
      await prisma.profileObjectPermission.upsert({
        where: { profileId_objectId: { profileId: profile.id, objectId: object.id } },
        create: { tenantId: tenant.id, profileId: profile.id, objectId: object.id, ...fullAccess },
        update: fullAccess,
      });
    }
    console.log(`Booking object ready for ${tenant.name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
