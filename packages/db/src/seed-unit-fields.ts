import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { unitFieldTags } from './unit-field-tags';

const prisma = new PrismaClient();

type UnitFieldRow = [string, string, string, boolean, string];

const rows = JSON.parse(
  readFileSync(join(__dirname, 'salesforce-unit-fields.json'), 'utf8'),
) as UnitFieldRow[];

const statusValues = ['AVAILABLE', 'RESERVED', 'BOOKED', 'HOLD', 'SOLD', 'BLOCKED'];
const typeValues = ['Apartment', 'Plot', 'Villa'];

const picklists: Record<string, string[]> = {
  Status__c: statusValues,
  Unit_Type__c: typeValues,
};

function describe(sourceType: string) {
  if (sourceType === 'Auto Number') return { fieldType: 'text', maxLength: 80, editable: false, readOnly: true };
  if (sourceType.startsWith('Formula')) {
    const inner = sourceType.replace(/^Formula \((.+)\)$/, '$1');
    const fieldType = inner === 'Currency' ? 'currency' : inner === 'Number' ? 'number' : 'text';
    return { fieldType, maxLength: undefined as number | undefined, editable: false, readOnly: true };
  }
  if (sourceType.startsWith('Lookup')) {
    const target = sourceType.replace(/^Lookup\((.+)\)$/, '$1');
    return { fieldType: 'lookup', maxLength: undefined as number | undefined, editable: true, readOnly: false, lookupObject: target };
  }
  if (sourceType === 'Picklist') return { fieldType: 'picklist', maxLength: undefined as number | undefined, editable: true, readOnly: false };
  if (sourceType === 'Date/Time') return { fieldType: 'dateTime', maxLength: undefined as number | undefined, editable: true, readOnly: false };
  const sized = /^(Currency|Number|Text)\((\d+)(?:,\s*(\d+))?\)$/.exec(sourceType);
  if (sized?.[1] === 'Text') return { fieldType: 'text', maxLength: Number(sized[2]), editable: true, readOnly: false };
  if (sized?.[1] === 'Currency') return { fieldType: 'currency', maxLength: undefined as number | undefined, precision: Number(sized[2]), scale: sized[3] ? Number(sized[3]) : 0, editable: true, readOnly: false };
  if (sized?.[1] === 'Number') return { fieldType: 'number', maxLength: undefined as number | undefined, precision: Number(sized[2]), scale: sized[3] ? Number(sized[3]) : 0, editable: true, readOnly: false };
  return { fieldType: 'text', maxLength: undefined as number | undefined, editable: true, readOnly: false };
}

async function main() {
  const names = rows.map((row) => row[1]);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length) throw new Error(`Duplicate Unit field names: ${duplicates.join(', ')}`);

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const tenant of tenants) {
    const admin = await prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      console.warn(`Skipping ${tenant.name}: no active user`);
      continue;
    }

    const existing = await prisma.objectDefinition.findFirst({
      where: { tenantId: tenant.id, name: 'Unit' },
      select: { id: true },
    });
    const object = existing ?? await prisma.objectDefinition.create({
      data: {
        tenantId: tenant.id,
        name: 'Unit',
        label: 'Unit',
        pluralLabel: 'Units',
        icon: 'building',
        description: 'Manage project units',
        objectType: 'standard',
        createdBy: admin.id,
        updatedBy: admin.id,
      },
      select: { id: true },
    });

    const removed = await prisma.fieldDefinition.deleteMany({ where: { objectId: object.id } });

    for (const [index, [label, name, sourceType, required]] of rows.entries()) {
      const described = describe(sourceType);
      await prisma.fieldDefinition.create({
        data: {
          tenantId: tenant.id,
          objectId: object.id,
          name,
          label,
          fieldType: described.fieldType,
          description: sourceType,
          helpText: described.readOnly
            ? `Calculated from the unit record. Salesforce type: ${sourceType}.`
            : `Salesforce type: ${sourceType}.`,
          required,
          maxLength: described.maxLength,
          precision: 'precision' in described ? described.precision : undefined,
          scale: 'scale' in described ? described.scale : undefined,
          lookupObject: 'lookupObject' in described ? described.lookupObject : undefined,
          visible: true,
          editable: described.editable,
          isActive: true,
          isSystemField: name === 'Name' || name === 'CreatedById' || name === 'LastModifiedById',
          isCustomField: name.endsWith('__c') || name === 'OwnerId',
          isStandardField: !name.endsWith('__c') && name !== 'OwnerId',
          searchable: true,
          sortable: !described.readOnly,
          filterable: described.fieldType === 'picklist' || described.fieldType === 'dateTime',
          displayOrder: index,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      });
    }

    const createdFields = await prisma.fieldDefinition.findMany({
      where: { objectId: object.id },
      select: { id: true, name: true },
    });
    for (const field of createdFields) {
      const values = picklists[field.name];
      if (!values) continue;
      for (const [optionIndex, value] of values.entries()) {
        await prisma.picklistValue.create({
          data: {
            tenantId: tenant.id,
            fieldId: field.id,
            label: value,
            value,
            isActive: true,
            isDefault: optionIndex === 0 && field.name === 'Status__c',
            displayOrder: optionIndex,
          },
        });
      }
    }

    const sections = ['Unit Information', 'Area', 'Pricing', 'System'].map((section) => ({
      name: section,
      fields: rows.filter((row) => row[4] === section).map((row) => row[1]),
    })).filter((section) => section.fields.length > 0);

    const layouts = await prisma.pageLayout.findMany({ where: { objectId: object.id }, select: { id: true } });
    if (layouts.length === 0) {
      await prisma.pageLayout.create({
        data: {
          tenantId: tenant.id,
          objectId: object.id,
          name: 'Default Layout',
          isDefault: true,
          sections,
          createdBy: admin.id,
        },
      });
    } else {
      await prisma.pageLayout.updateMany({
        where: { objectId: object.id },
        data: { sections: sections as Prisma.InputJsonValue, updatedBy: admin.id },
      });
    }

    const units = await prisma.unit.findMany({
      where: { tenantId: tenant.id },
      include: {
        project: { select: { name: true } },
        bookings: { select: { status: true, lead: { select: { source: true } } } },
      },
    });
    for (const unit of units) {
      const activeBooking = unit.bookings.find((booking) => booking.status !== 'CANCELLED');
      const stored = unit.customFields && typeof unit.customFields === 'object' && !Array.isArray(unit.customFields)
        ? unit.customFields as Record<string, unknown>
        : {};
      await prisma.unit.update({
        where: { id: unit.id },
        data: {
          customFields: {
            ...stored,
            ...unitFieldTags({
              ...unit,
              projectName: unit.project?.name ?? null,
              bookingSource: activeBooking?.lead?.source ?? null,
            }),
          } as Prisma.InputJsonValue,
        },
      });
    }

    console.log(`${tenant.name}: removed ${removed.count} Unit fields, created ${rows.length}, tagged ${units.length} units`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
