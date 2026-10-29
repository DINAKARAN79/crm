import type { Prisma } from '@prisma/client';
import {
  PROSPECT_BEDROOM_OPTIONS,
  PROSPECT_BUDGET_OPTIONS,
  PROSPECT_PROPERTY_TYPE_OPTIONS,
  SITE_VISIT_RATING_OPTIONS,
  SITE_VISIT_TRANSPORT_OPTIONS,
} from '@dct-crm/shared';

const picklist = (values: readonly string[]) => values.map((label) => ({ label, value: label }));

const scheduleFieldDefinitions = [
  { name: 'schedule_call_summary_remarks', label: 'Call Summary/Remarks', fieldType: 'text', maxLength: 5000 },
  { name: 'schedule_minimum_budget', label: 'Minimum Budget', fieldType: 'picklist', values: picklist(PROSPECT_BUDGET_OPTIONS) },
  { name: 'schedule_maximum_budget', label: 'Maximum Budget', fieldType: 'picklist', values: picklist(PROSPECT_BUDGET_OPTIONS) },
  { name: 'schedule_property_type', label: 'Property Type', fieldType: 'multiPicklist', values: picklist(PROSPECT_PROPERTY_TYPE_OPTIONS) },
  { name: 'schedule_bedroom_preference', label: 'Bedroom Preference', fieldType: 'multiPicklist', values: picklist(PROSPECT_BEDROOM_OPTIONS) },
  { name: 'schedule_rating', label: 'Rating', fieldType: 'picklist', values: picklist(SITE_VISIT_RATING_OPTIONS) },
  { name: 'schedule_transport', label: 'Transport Arrangement', fieldType: 'picklist', values: picklist(SITE_VISIT_TRANSPORT_OPTIONS) },
] as const;

export async function ensureSiteVisitScheduleFields(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
) {
  let object = await tx.objectDefinition.findFirst({
    where: { tenantId, name: 'SiteVisit' },
    select: { id: true },
  });
  if (!object) {
    object = await tx.objectDefinition.create({
      data: {
        tenantId,
        name: 'SiteVisit',
        label: 'Site Visit',
        pluralLabel: 'Site Visits',
        objectType: 'standard',
        isAvailableInNavigation: false,
        createdBy: actorId,
      },
      select: { id: true },
    });
  }

  let displayOrder = await tx.fieldDefinition.aggregate({
    where: { tenantId, objectId: object.id },
    _max: { displayOrder: true },
  }).then((result) => (result._max.displayOrder ?? 0) + 1);

  for (const definition of scheduleFieldDefinitions) {
    let field = await tx.fieldDefinition.findFirst({
      where: { tenantId, objectId: object.id, name: definition.name },
      select: { id: true, fieldType: true },
    });
    if (!field) {
      field = await tx.fieldDefinition.create({
        data: {
          tenantId,
          objectId: object.id,
          name: definition.name,
          label: definition.label,
          fieldType: definition.fieldType,
          required: false,
          searchable: true,
          filterable: true,
          visible: true,
          editable: true,
          isActive: true,
          isSystemField: false,
          isCustomField: true,
          isStandardField: false,
          displayOrder: displayOrder++,
          maxLength: 'maxLength' in definition ? definition.maxLength : null,
          createdBy: actorId,
        },
        select: { id: true, fieldType: true },
      });
    }
    if (field.fieldType !== definition.fieldType) {
      throw new Error(`SITE_VISIT_FIELD_TYPE_MISMATCH: Site Visit field "${definition.name}" has an incompatible field type`);
    }
    await tx.fieldDefinition.update({
      where: { id: field.id },
      data: { isActive: true, visible: true, editable: true },
    });

    if ('values' in definition) {
      const existingValues = await tx.picklistValue.findMany({
        where: { fieldId: field.id },
        select: { id: true, value: true, isActive: true },
      });
      const existingValueSet = new Set(existingValues.map((item) => item.value));
      const missingValues = definition.values.filter((option) => !existingValueSet.has(option.value));
      const inactiveValues = existingValues.filter(
        (item) => definition.values.some((option) => option.value === item.value) && !item.isActive,
      );
      if (inactiveValues.length) {
        await tx.picklistValue.updateMany({
          where: { id: { in: inactiveValues.map((item) => item.id) } },
          data: { isActive: true },
        });
      }
      if (missingValues.length) {
        await tx.picklistValue.createMany({
          data: missingValues.map((option, index) => ({
            tenantId,
            fieldId: field.id,
            label: option.label,
            value: option.value,
            displayOrder: index,
          })),
        });
      }
    }
  }

  const layout = await tx.pageLayout.findFirst({
    where: { tenantId, objectId: object.id, isDefault: true },
    select: { id: true, sections: true },
  });
  const scheduleFieldNames = scheduleFieldDefinitions.map((field) => field.name);
  if (layout) {
    const sections = Array.isArray(layout.sections)
      ? layout.sections as Array<{ name?: string; fields?: string[] }>
      : [];
    const section = sections.find((item) => item.name === 'Site Visit Schedule Details');
    if (section) {
      section.fields = [...new Set([...(section.fields || []), ...scheduleFieldNames])];
    } else {
      sections.push({ name: 'Site Visit Schedule Details', fields: scheduleFieldNames });
    }
    await tx.pageLayout.update({ where: { id: layout.id }, data: { sections } });
  } else {
    const visibleFields = await tx.fieldDefinition.findMany({
      where: { tenantId, objectId: object.id, isActive: true, visible: true },
      select: { name: true },
      orderBy: { displayOrder: 'asc' },
    });
    await tx.pageLayout.create({
      data: {
        tenantId,
        objectId: object.id,
        name: 'Default Site Visit Layout',
        isDefault: true,
        sections: [
          { name: 'Site Visit Schedule Details', fields: scheduleFieldNames },
          { name: 'Site Visit Information', fields: visibleFields.map((field) => field.name) },
        ],
        createdBy: actorId,
      },
    });
  }
}
