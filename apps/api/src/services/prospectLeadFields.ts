import type { Prisma } from '@prisma/client';
import {
  PROSPECT_BEDROOM_OPTIONS,
  PROSPECT_BUDGET_OPTIONS,
  PROSPECT_POSSESSION_OPTIONS,
  PROSPECT_PROPERTY_TYPE_OPTIONS,
  PROSPECT_REASON_TO_BUY_OPTIONS,
} from '@dct-crm/shared';

const picklist = (values: readonly string[]) => values.map((label) => ({ label, value: label }));

const prospectFieldDefinitions = [
  { name: 'svc_call_summary_remarks', label: 'Call Summary/Remarks', fieldType: 'text', maxLength: 5000 },
  { name: 'svc_minimum_budget', label: 'Minimum Budget', fieldType: 'picklist', values: picklist(PROSPECT_BUDGET_OPTIONS) },
  { name: 'svc_maximum_budget', label: 'Maximum Budget', fieldType: 'picklist', values: picklist(PROSPECT_BUDGET_OPTIONS) },
  {
    name: 'svc_bedroom_preference',
    label: 'Bedroom Preference',
    fieldType: 'multiPicklist',
    values: picklist(PROSPECT_BEDROOM_OPTIONS),
  },
  {
    name: 'svc_property_type',
    label: 'Property Type',
    fieldType: 'multiPicklist',
    values: picklist(PROSPECT_PROPERTY_TYPE_OPTIONS),
  },
  {
    name: 'svc_possession',
    label: 'Possession',
    fieldType: 'picklist',
    values: picklist(PROSPECT_POSSESSION_OPTIONS),
  },
  {
    name: 'svc_reason_to_buy',
    label: 'Reason to Buy',
    fieldType: 'picklist',
    values: picklist(PROSPECT_REASON_TO_BUY_OPTIONS),
  },
] as const;

export type ProspectLeadDetails = {
  callSummaryRemarks: string;
  minimumBudget: string;
  maximumBudget: string;
  bedroomPreference: string[];
  propertyType: string[];
  possession?: string;
  reasonToBuy?: string;
};

export async function ensureProspectLeadFields(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
) {
  let leadObject = await tx.objectDefinition.findFirst({
    where: { tenantId, name: 'Lead' },
    select: { id: true },
  });
  if (!leadObject) {
    leadObject = await tx.objectDefinition.create({
      data: {
        tenantId,
        name: 'Lead',
        label: 'Lead',
        pluralLabel: 'Leads',
        objectType: 'standard',
        isAvailableInNavigation: false,
        createdBy: actorId,
      },
      select: { id: true },
    });
  }

  let displayOrder = await tx.fieldDefinition.aggregate({
    where: { tenantId, objectId: leadObject.id },
    _max: { displayOrder: true },
  }).then((result) => (result._max.displayOrder ?? 0) + 1);

  const addedFields: { id: string; name: string; label: string }[] = [];
  for (const definition of prospectFieldDefinitions) {
    let field = await tx.fieldDefinition.findFirst({
      where: { tenantId, objectId: leadObject.id, name: definition.name },
      select: { id: true, fieldType: true, isActive: true, visible: true, editable: true },
    });
    if (!field) {
      field = await tx.fieldDefinition.create({
        data: {
          tenantId,
          objectId: leadObject.id,
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
        select: { id: true, fieldType: true, isActive: true, visible: true, editable: true },
      });
      addedFields.push({ id: field.id, name: definition.name, label: definition.label });
    }
    if (field.fieldType !== definition.fieldType) {
      throw new Error(`PROSPECT_FIELD_TYPE_MISMATCH: Lead field "${definition.name}" has an incompatible field type`);
    }
    if (!field.isActive || !field.visible || !field.editable) {
      field = await tx.fieldDefinition.update({
        where: { id: field.id },
        data: { isActive: true, visible: true, editable: true },
        select: { id: true, fieldType: true, isActive: true, visible: true, editable: true },
      });
    }

    if ('values' in definition) {
      const existingValues = await tx.picklistValue.findMany({
        where: { fieldId: field.id },
        select: { id: true, value: true, isActive: true },
      });
      const existingValueSet = new Set(existingValues.map((item) => item.value));
      const inactiveValues = existingValues.filter((item) => definition.values.some((option) => option.value === item.value) && !item.isActive);
      for (const item of inactiveValues) {
        await tx.picklistValue.update({
          where: { id: item.id },
          data: { isActive: true },
        });
      }
      const missingValues = definition.values.filter((item) => !existingValueSet.has(item.value));
      if (missingValues.length) {
        await tx.picklistValue.createMany({
          data: missingValues.map((item, index) => ({
            tenantId,
            fieldId: field.id,
            label: item.label,
            value: item.value,
            displayOrder: index,
          })),
        });
      }
    }
  }

  const prospectFieldNames = prospectFieldDefinitions.map((field) => field.name);
  const prospectFieldNameSet = new Set<string>(prospectFieldNames);
  const visibleLeadFields = await tx.fieldDefinition.findMany({
    where: { tenantId, objectId: leadObject.id, isActive: true, visible: true },
    select: { name: true, displayOrder: true },
    orderBy: { displayOrder: 'asc' },
  });
  const layout = await tx.pageLayout.findFirst({
    where: { tenantId, objectId: leadObject.id, isDefault: true },
    select: { id: true, sections: true },
  });
  if (layout) {
    const sections = Array.isArray(layout.sections)
      ? layout.sections as Array<{ name?: string; fields?: string[] }>
      : [];
    const configuredFields = new Set(sections.flatMap((section) => section.fields || []));
    const missingLeadFields = visibleLeadFields
      .map((field) => field.name)
      .filter((name) => !prospectFieldNameSet.has(name) && !configuredFields.has(name));
    const leadInformation = sections.find(
      (section) => section.name === 'Lead Information' || section.name === 'Lead Details',
    );
    let layoutChanged = false;
    if (missingLeadFields.length) {
      if (leadInformation) {
        leadInformation.fields = [...new Set([...(leadInformation.fields || []), ...missingLeadFields])];
      } else {
        sections.unshift({ name: 'Lead Information', fields: missingLeadFields });
      }
      layoutChanged = true;
    }
    const prospectSection = sections.find((section) => section.name === 'Prospect Information');
    if (prospectSection) {
      const existingNames = prospectSection.fields || [];
      const completeNames = [...new Set([...existingNames, ...prospectFieldNames])];
      if (completeNames.length !== existingNames.length) {
        prospectSection.fields = completeNames;
        layoutChanged = true;
      }
    } else {
      sections.push({ name: 'Prospect Information', fields: prospectFieldNames });
      layoutChanged = true;
    }
    if (layoutChanged) {
      await tx.pageLayout.update({
        where: { id: layout.id },
        data: { sections },
      });
    }
  } else {
    await tx.pageLayout.create({
      data: {
        tenantId,
        objectId: leadObject.id,
        name: 'Default Lead Layout',
        isDefault: true,
        sections: [
          {
            name: 'Lead Information',
            fields: visibleLeadFields
              .map((field) => field.name)
              .filter((name) => !prospectFieldNameSet.has(name)),
          },
          { name: 'Prospect Information', fields: prospectFieldNames },
        ],
        createdBy: actorId,
      },
    });
  }

  for (const field of addedFields) {
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action: 'FIELD_CREATED',
        objectType: 'FieldDefinition',
        objectId: field.id,
        newValues: { name: field.name, label: field.label, objectName: 'Lead' },
      },
    });
  }
}
