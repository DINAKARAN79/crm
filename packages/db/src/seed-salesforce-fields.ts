import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ENQUIRY_SOURCE_API_NAMES } from './enquiry-source-fields';

const prisma = new PrismaClient();

interface ExportedField {
  label: string;
  apiName: string;
  sourceType: string;
}

const leadFields = JSON.parse(
  readFileSync(join(__dirname, 'salesforce-lead-fields.json'), 'utf8'),
) as ExportedField[];
const siteVisitFields = JSON.parse(
  readFileSync(join(__dirname, 'salesforce-site-visit-fields.json'), 'utf8'),
) as ExportedField[];
const taskFields = JSON.parse(
  readFileSync(join(__dirname, 'salesforce-task-fields.json'), 'utf8'),
) as ExportedField[];

const standardObjects = [
  { name: 'Lead', label: 'Lead', pluralLabel: 'Leads', icon: 'user', description: 'Manage sales leads' },
  { name: 'Enquiry', label: 'Enquiry', pluralLabel: 'Enquiries', icon: 'inbox', description: 'Manage lead enquiries' },
  { name: 'SiteVisit', label: 'Site Visit', pluralLabel: 'Site Visits', icon: 'map-pin', description: 'Site visit scheduling' },
  { name: 'Project', label: 'Project', pluralLabel: 'Projects', icon: 'folder-kanban', description: 'Project management' },
  { name: 'Unit', label: 'Unit', pluralLabel: 'Units', icon: 'building', description: 'Manage project units' },
  { name: 'Company', label: 'Company', pluralLabel: 'Companies', icon: 'building', description: 'Manage companies' },
  { name: 'Booking', label: 'Booking', pluralLabel: 'Bookings', icon: 'book-open-check', description: 'Plot bookings created from quotations' },
  { name: 'FollowUp', label: 'Follow-up', pluralLabel: 'Follow-ups', icon: 'phone', description: 'Manage lead follow-ups' },
  { name: 'Activity', label: 'Activity', pluralLabel: 'Activities', icon: 'activity', description: 'Track CRM activities' },
  { name: 'CallDetail', label: 'Call Detail', pluralLabel: 'Call Details', icon: 'phone', description: 'Track inbound and outbound calls', isAvailableInNavigation: false },
];

const mappedLeadFields = new Set([
  'Salutation', 'FirstName', 'LastName', 'Title', 'Company', 'Street', 'City',
  'State', 'PostalCode', 'Country', 'Address', 'Phone', 'MobilePhone', 'Fax',
  'Email', 'Website', 'Description', 'LeadSource', 'Status', 'Industry',
  'Rating', 'AnnualRevenue', 'NumberOfEmployees', 'OwnerId', 'CreatedById',
  'CreatedDate', 'LastModifiedById', 'LastModifiedDate', 'SystemModstamp',
  'LastActivityDate', 'LastViewedDate', 'LastReferencedDate', 'IsConverted',
  'ConvertedDate', 'ConvertedAccountId', 'ConvertedContactId',
  'ConvertedOpportunityId', 'IsUnreadByOwner', 'HasOptedOutOfEmail',
  'HasOptedOutOfFax', 'DoNotCall', 'Jigsaw',
]);

const enquirySourceApiNames = new Set<string>(ENQUIRY_SOURCE_API_NAMES);

const mappedSiteVisitFields = new Set([
  'Name', 'Lead__c', 'Projects__c', 'Date__c', 'Status__c', 'Feedback__c',
  'Visit_Notes__c', 'Site_Visit_Rating__c', 'CreatedById', 'LastModifiedById',
  'OwnerId',
]);

function fieldTypeFor(sourceType: string): {
  fieldType: string;
  readOnly: boolean;
  maxLength?: number;
  helpText?: string;
} {
  const formula = /^Formula \((.+)\)$/.exec(sourceType);
  const type = formula?.[1] || sourceType;
  const length = /\((\d+)(?:,\s*\d+)?\)/.exec(type);
  const maxLength = length ? Number(length[1]) : undefined;

  if (formula || type === 'Auto Number') {
    return {
      fieldType: type.includes('Checkbox') ? 'boolean'
        : type.includes('Date/Time') ? 'dateTime'
          : type.includes('Date') ? 'date'
            : type.includes('Number') || type.includes('Currency') ? 'number'
              : 'text',
      readOnly: true,
    };
  }
  if (type === 'Checkbox') return { fieldType: 'boolean', readOnly: false };
  if (type === 'Date') return { fieldType: 'date', readOnly: false };
  if (type === 'Date/Time') return { fieldType: 'dateTime', readOnly: false };
  if (type === 'Time') return { fieldType: 'time', readOnly: false };
  if (type === 'Email') return { fieldType: 'email', readOnly: false };
  if (type.startsWith('URL')) return { fieldType: 'url', readOnly: false, maxLength };
  if (type.startsWith('Phone')) return { fieldType: 'phone', readOnly: false, maxLength };
  if (type.startsWith('Currency')) return { fieldType: 'currency', readOnly: false };
  if (type.startsWith('Number')) return { fieldType: 'number', readOnly: false };
  if (type.startsWith('Long Text Area') || type.startsWith('Text Area')) {
    return { fieldType: 'longText', readOnly: false, maxLength };
  }
  if (type.startsWith('Rich Text Area')) {
    return { fieldType: 'richText', readOnly: false, maxLength };
  }
  if (type === 'Picklist') {
    return {
      fieldType: 'text',
      readOnly: false,
      helpText: 'Salesforce picklist choices were not included in the export; enter a value as text.',
    };
  }
  if (type.startsWith('Lookup(')) {
    return {
      fieldType: 'text',
      readOnly: false,
      helpText: `Salesforce lookup target ${type.slice(7, -1)} is stored as text because the CRM does not have that relationship configured.`,
    };
  }
  if (type === 'Address') {
    return { fieldType: 'longText', readOnly: false };
  }
  return { fieldType: 'text', readOnly: false, maxLength };
}

function toFieldDefinitions(
  rows: ExportedField[],
  objectName: 'Lead' | 'SiteVisit',
  createdBy: string,
) {
  const mappedFields = objectName === 'Lead' ? mappedLeadFields : mappedSiteVisitFields;
  const uniqueRows = new Map(rows.map((field) => [field.apiName, field]));

  return [...uniqueRows.values()]
    .filter((field) => !mappedFields.has(field.apiName))
    .filter((field) => objectName !== 'Lead' || !enquirySourceApiNames.has(field.apiName))
    .map((field, index) => {
      const inferred = fieldTypeFor(field.sourceType);
      const lifecycleTypeField = objectName === 'Lead' && field.apiName === 'Lead_Type__c';
      const name = `sf_${field.apiName}`;
      return {
        name,
        label: field.label,
        fieldType: lifecycleTypeField ? 'picklist' : inferred.fieldType,
        helpText: lifecycleTypeField ? null : inferred.helpText,
        maxLength: inferred.maxLength,
        visible: !inferred.readOnly,
        editable: !inferred.readOnly,
        isSystemField: inferred.readOnly,
        isCustomField: !inferred.readOnly,
        isStandardField: inferred.readOnly,
        searchable: false,
        sortable: false,
        filterable: false,
        displayOrder: 1000 + index,
        createdBy,
      };
    });
}

async function seedObjectFields(
  tenantId: string,
  createdBy: string,
  objectName: 'Lead' | 'SiteVisit',
  rows: ExportedField[],
) {
  const existingObject = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: objectName },
    select: { id: true, isActive: true },
  });
  if (existingObject && !existingObject.isActive) {
    console.warn(`  ${objectName} object metadata is inactive; skipping it.`);
    return 0;
  }
  const object = existingObject ?? await prisma.objectDefinition.create({
    data: {
      tenantId,
      name: objectName,
      label: objectName === 'Lead' ? 'Lead' : 'Site Visit',
      pluralLabel: objectName === 'Lead' ? 'Leads' : 'Site Visits',
      icon: objectName === 'Lead' ? 'user' : 'map-pin',
      description: objectName === 'Lead' ? 'Manage sales leads' : 'Site visit scheduling',
      objectType: 'standard',
      isActive: true,
      createdBy,
    },
    select: { id: true, isActive: true },
  });

  const definitions = toFieldDefinitions(rows, objectName, createdBy);
  const importedNames = definitions
    .filter((field) => field.isCustomField)
    .map((field) => field.name);

  const created = await prisma.fieldDefinition.createMany({
    data: definitions.map((field) => ({ ...field, tenantId, objectId: object.id })),
    skipDuplicates: true,
  });

  if (objectName === 'Lead') {
    const leadTypeField = await prisma.fieldDefinition.findFirst({
      where: { tenantId, objectId: object.id, name: 'sf_Lead_Type__c' },
      select: { id: true },
    });
    if (leadTypeField) {
      await prisma.fieldDefinition.update({
        where: { id: leadTypeField.id },
        data: { fieldType: 'picklist', helpText: null, visible: true, editable: true },
      });
      const lifecycleTypes = [
        { label: 'Fresh', value: 'Fresh', displayOrder: 0, isDefault: true },
        { label: 'Re-Opened', value: 'Re-Opened', displayOrder: 1, isDefault: false },
        { label: 'Re-Engaged', value: 'Re-Engaged', displayOrder: 2, isDefault: false },
      ];
      await prisma.picklistValue.updateMany({
        where: { tenantId, fieldId: leadTypeField.id, value: { notIn: lifecycleTypes.map(({ value }) => value) } },
        data: { isActive: false },
      });
      for (const option of lifecycleTypes) {
        await prisma.picklistValue.upsert({
          where: { fieldId_value: { fieldId: leadTypeField.id, value: option.value } },
          create: { tenantId, fieldId: leadTypeField.id, ...option, isActive: true },
          update: { ...option, isActive: true },
        });
      }
    }
  }

  const existingLayout = await prisma.pageLayout.findFirst({
    where: { objectId: object.id, name: 'Default Layout' },
  });
  const rawSections = existingLayout
    ? (typeof existingLayout.sections === 'string'
      ? JSON.parse(existingLayout.sections)
      : existingLayout.sections) as { name: string; fields: string[] }[]
    : [];
  const sections = Array.isArray(rawSections) ? rawSections : [];
  let updatedSections: { name: string; fields: string[] }[];
  if (objectName === 'Lead') {
    const legacyImportedSection = sections.find(
      (section) => section.name === 'Imported Salesforce Lead Fields',
    );
    const retainedSections = sections.filter(
      (section) => section.name !== 'Imported Salesforce Lead Fields',
    );
    const leadInformationIndex = retainedSections.findIndex(
      (section) => section.name === 'Lead Information' || section.name === 'Lead Details',
    );

    if (leadInformationIndex >= 0) {
      updatedSections = retainedSections.map((section, index) =>
        index === leadInformationIndex
          ? {
              name: 'Lead Information',
              fields: [...new Set([
                ...section.fields,
                'projectId',
                ...(legacyImportedSection?.fields ?? []),
                ...importedNames,
              ])],
            }
          : section,
      );
    } else {
      updatedSections = [
        ...retainedSections,
        {
          name: 'Lead Information',
          fields: [...new Set(['projectId', ...(legacyImportedSection?.fields ?? []), ...importedNames])],
        },
      ];
    }
  } else {
    const sectionName = 'Imported Salesforce Site Visit Fields';
    updatedSections = [
      ...sections.filter((section) => section.name !== sectionName),
      { name: sectionName, fields: importedNames },
    ];
  }

  if (existingLayout) {
    await prisma.pageLayout.update({
      where: { id: existingLayout.id },
      data: { sections: JSON.stringify(updatedSections), updatedBy: createdBy },
    });
  } else {
    await prisma.pageLayout.create({
      data: {
        tenantId,
        objectId: object.id,
        name: 'Default Layout',
        isDefault: true,
        sections: JSON.stringify(updatedSections),
        createdBy,
      },
    });
  }

  return created.count;
}

export async function seedEnquiryFields(tenantId: string, createdBy: string) {
  const object = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: 'Enquiry', isActive: true },
    select: { id: true },
  });
  if (!object) return 0;
  const rows = leadFields.filter((field) => enquirySourceApiNames.has(field.apiName));
  const definitions = rows.map((field, index) => {
    const inferred = fieldTypeFor(field.sourceType);
    return {
      tenantId,
      objectId: object.id,
      name: `sf_${field.apiName}`,
      label: field.label,
      fieldType: inferred.fieldType,
      helpText: inferred.helpText,
      maxLength: inferred.maxLength,
      visible: !inferred.readOnly,
      editable: !inferred.readOnly,
      isSystemField: inferred.readOnly,
      isCustomField: !inferred.readOnly,
      isStandardField: inferred.readOnly,
      searchable: false,
      sortable: false,
      filterable: false,
      displayOrder: index,
      createdBy,
    };
  });
  const created = await prisma.fieldDefinition.createMany({ data: definitions, skipDuplicates: true });
  return created.count;
}

async function seedTaskFields(tenantId: string, createdBy: string) {
  const object = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: 'Task', isActive: true },
    select: { id: true },
  });
  if (!object) return 0;

  const prismaFields: Record<string, string> = {
    OwnerId: 'ownerId (DCT User only)',
    CallDurationInSeconds: 'callDurationInSeconds',
    CallObject: 'callObject',
    CallDisposition: 'callDisposition',
    CallType: 'callType',
    Description: 'description',
    CompletedDateTime: 'completedAt',
    IsRecurrence: 'isRecurrence (configuration only; no recurrence scheduler)',
    CreatedById: 'createdById (local creator; Salesforce User ID resolution is not implemented)',
    ActivityDate: 'dueDate',
    Email: 'email',
    LastModifiedById: 'lastModifiedById (local modifier; Salesforce User ID resolution is not implemented)',
    WhoId: 'leadId for Lead; Contact relationship is not available',
    Phone: 'phone',
    Priority: 'salesforcePriority (DCT priority is stored separately)',
    IsVisibleInSelfService: 'isVisibleInSelfService',
    RecurrenceInterval: 'recurrenceInterval',
    WhatId: 'siteVisitId, projectId, or unitId; other Salesforce targets are not implemented',
    IsReminderSet: 'isReminderSet (no reminder delivery scheduler)',
    RecurrenceRegeneratedType: 'recurrenceRegeneratedType',
    Status: 'salesforceStatus (DCT workflow status is stored separately)',
    Subject: 'subject (kept in sync with DCT title)',
    TaskSubtype: 'taskSubtype',
    Type: 'taskType',
  };
  const readOnlyFields = new Set(['CreatedById', 'LastModifiedById']);
  const requiredFields = new Set(['OwnerId', 'ActivityDate', 'WhoId', 'WhatId', 'Status', 'Subject']);
  const definitions = taskFields.map((field, index) => {
    const inferred = fieldTypeFor(field.sourceType);
    const lookup = /^Lookup\((.+)\)$/.exec(field.sourceType);
    const numeric = /^(?:Number|Currency)\((\d+)(?:,\s*(\d+))?\)$/.exec(field.sourceType);
    const picklistHelp = field.sourceType === 'Picklist'
      ? ' Salesforce picklist values were not included; the value is stored as text.'
      : '';
    return {
      tenantId,
      objectId: object.id,
      name: `sf_${field.apiName}`,
      label: field.label,
      fieldType: inferred.fieldType,
      helpText: `Salesforce API: ${field.apiName}; source type: ${field.sourceType}; DCT mapping: Task.${prismaFields[field.apiName]}.${picklistHelp}`,
      maxLength: numeric ? undefined : inferred.maxLength,
      precision: numeric ? Number(numeric[1]) : undefined,
      scale: numeric?.[2] ? Number(numeric[2]) : undefined,
      required: requiredFields.has(field.apiName),
      lookupObject: lookup?.[1],
      visible: true,
      editable: !readOnlyFields.has(field.apiName),
      isSystemField: readOnlyFields.has(field.apiName),
      isCustomField: false,
      isStandardField: true,
      searchable: false,
      sortable: false,
      filterable: false,
      displayOrder: 1000 + index,
      createdBy,
    };
  });
  const created = await prisma.fieldDefinition.createMany({ data: definitions, skipDuplicates: true });
  const existingLayout = await prisma.pageLayout.findFirst({
    where: { objectId: object.id, name: 'Default Layout' },
  });
  const rawSections = existingLayout
    ? (typeof existingLayout.sections === 'string'
      ? JSON.parse(existingLayout.sections)
      : existingLayout.sections) as { name: string; fields: string[] }[]
    : [];
  const sectionName = 'Salesforce Task Fields';
  const sections = [
    ...rawSections.filter((section) => section.name !== sectionName),
    { name: sectionName, fields: definitions.map((field) => field.name) },
  ];
  if (existingLayout) {
    await prisma.pageLayout.update({
      where: { id: existingLayout.id },
      data: { sections: JSON.stringify(sections), updatedBy: createdBy },
    });
  } else {
    await prisma.pageLayout.create({
      data: {
        tenantId,
        objectId: object.id,
        name: 'Default Layout',
        isDefault: true,
        sections: JSON.stringify(sections),
        createdBy,
      },
    });
  }
  return created.count;
}

async function ensureStandardObjects(tenantId: string, createdBy: string) {
  for (const object of standardObjects) {
    const existing = await prisma.objectDefinition.findFirst({
      where: { tenantId, name: object.name },
      select: { id: true, isActive: true },
    });
    if (existing) continue;

    const created = await prisma.objectDefinition.create({
      data: {
        tenantId,
        ...object,
        objectType: 'standard',
        createdBy,
        updatedBy: createdBy,
      },
    });
    await prisma.pageLayout.create({
      data: {
        tenantId,
        objectId: created.id,
        name: 'Default Layout',
        isDefault: true,
        sections: JSON.stringify([{ name: `${object.label} Information`, fields: [] }]),
        createdBy,
      },
    });
  }
}

async function seedCallDetailFields(tenantId: string, createdBy: string) {
  const object = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: 'CallDetail', isActive: true },
    select: { id: true },
  });
  if (!object) return;

  const fields: Array<{
    name: string;
    label: string;
    fieldType: string;
    lookupObject?: string;
    isSystemField?: boolean;
    editable?: boolean;
    required?: boolean;
  }> = [
    { name: 'name', label: 'Call Details Name', fieldType: 'autoNumber', isSystemField: true, editable: false },
    { name: 'callFrom', label: 'Call From', fieldType: 'text' },
    { name: 'callId', label: 'Call ID', fieldType: 'text', isSystemField: true, editable: false },
    { name: 'callTo', label: 'Call To', fieldType: 'text' },
    { name: 'callType', label: 'Call Type', fieldType: 'picklist', required: true },
    { name: 'caseId', label: 'Case', fieldType: 'lookup', lookupObject: 'Lead' },
    { name: 'createdById', label: 'Created By', fieldType: 'lookup', lookupObject: 'User', isSystemField: true, editable: false },
    { name: 'duration', label: 'Duration', fieldType: 'number', isSystemField: true, editable: false },
    { name: 'endAt', label: 'End Time', fieldType: 'dateTime', required: true },
    { name: 'executiveContactNo', label: 'Executive Contact No', fieldType: 'text' },
    { name: 'landingNumber', label: 'Landing Number', fieldType: 'text' },
    { name: 'lastModifiedById', label: 'Last Modified By', fieldType: 'lookup', lookupObject: 'User', isSystemField: true, editable: false },
    { name: 'leadId', label: 'Lead', fieldType: 'lookup', lookupObject: 'Lead', required: true, isSystemField: true, editable: false },
    { name: 'ownerId', label: 'Owner', fieldType: 'lookup', lookupObject: 'User' },
    { name: 'parentId', label: 'Parent ID', fieldType: 'text' },
    { name: 'parentUrl', label: 'Parent URL', fieldType: 'url' },
    { name: 'recordingFile', label: 'Recording File', fieldType: 'url' },
    { name: 'startAt', label: 'Start Time', fieldType: 'dateTime', required: true },
    { name: 'status', label: 'Status', fieldType: 'picklist' },
    { name: 'notes', label: 'Notes', fieldType: 'longText' },
  ];
  await prisma.fieldDefinition.createMany({
    data: fields.map((field, displayOrder) => ({
      tenantId,
      objectId: object.id,
      ...field,
      required: field.required ?? false,
      searchable: true,
      sortable: true,
      filterable: true,
      visible: true,
      editable: field.editable ?? true,
      isActive: true,
      isSystemField: field.isSystemField ?? false,
      isCustomField: false,
      isStandardField: true,
      displayOrder,
      createdBy,
    })),
    skipDuplicates: true,
  });

  for (const [fieldName, options] of Object.entries({
    callType: ['INBOUND', 'OUTBOUND'],
    status: ['COMPLETED', 'NO_ANSWER', 'BUSY', 'VOICEMAIL', 'CANCELLED'],
  })) {
    const field = await prisma.fieldDefinition.findUnique({
      where: { objectId_name: { objectId: object.id, name: fieldName } },
      select: { id: true },
    });
    if (!field) continue;
    for (const [displayOrder, value] of options.entries()) {
      await prisma.picklistValue.upsert({
        where: { fieldId_value: { fieldId: field.id, value } },
        create: {
          tenantId,
          fieldId: field.id,
          label: value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
          value,
          isDefault: displayOrder === 0,
          displayOrder,
        },
        update: {
          isActive: true,
          isDefault: displayOrder === 0,
          displayOrder,
        },
      });
    }
  }

  const sections = [
    { name: 'Call Information', fields: ['name', 'callFrom', 'callId', 'callTo', 'callType', 'duration', 'startAt', 'endAt', 'status'] },
    { name: 'Related Records', fields: ['caseId', 'createdById', 'lastModifiedById', 'leadId', 'ownerId', 'parentId', 'parentUrl'] },
    { name: 'Details', fields: ['executiveContactNo', 'landingNumber', 'recordingFile', 'notes'] },
  ];
  await prisma.pageLayout.upsert({
    where: { objectId_name: { objectId: object.id, name: 'Default Layout' } },
    create: {
      tenantId,
      objectId: object.id,
      name: 'Default Layout',
      isDefault: true,
      sections,
      createdBy,
    },
    update: { isDefault: true, sections },
  });
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!user) {
      console.warn(`Skipping ${tenant.name}: no active user is available for metadata ownership.`);
      continue;
    }

    await ensureStandardObjects(tenant.id, user.id);
    await seedCallDetailFields(tenant.id, user.id);
    const [leadCount, enquiryCount, siteVisitCount, taskCount] = await Promise.all([
      seedObjectFields(tenant.id, user.id, 'Lead', leadFields),
      seedEnquiryFields(tenant.id, user.id),
      seedObjectFields(tenant.id, user.id, 'SiteVisit', siteVisitFields),
      seedTaskFields(tenant.id, user.id),
    ]);
    console.log(`${tenant.name}: created ${leadCount} Lead, ${enquiryCount} Enquiry, ${siteVisitCount} Site Visit, and ${taskCount} Task fields.`);
  }
}

const seedEntry = process.argv[1] || '';
if (seedEntry.includes('seed-salesforce-fields')) {
  main()
    .catch((error) => {
      console.error('Salesforce field seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
