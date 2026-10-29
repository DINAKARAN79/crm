ALTER TABLE "CallDetail"
DROP CONSTRAINT IF EXISTS "CallDetail_opportunityId_fkey";

DROP INDEX IF EXISTS "CallDetail_tenantId_opportunityId_idx";

ALTER TABLE "CallDetail"
DROP COLUMN IF EXISTS "opportunityId",
DROP COLUMN IF EXISTS "parentUrl",
DROP COLUMN IF EXISTS "recordingFile";

INSERT INTO "ObjectDefinition" (
  "id", "tenantId", "name", "label", "pluralLabel", "description", "icon",
  "objectType", "isActive", "isAvailableInNavigation", "isAvailableInReports",
  "createdBy", "createdAt", "updatedAt"
)
SELECT
  'call_detail_object_' || tenant."id",
  tenant."id",
  'CallDetail',
  'Call Detail',
  'Call Details',
  'Track inbound and outbound calls',
  'phone',
  'standard',
  TRUE,
  FALSE,
  TRUE,
  creator."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
JOIN LATERAL (
  SELECT "id"
  FROM "User"
  WHERE "tenantId" = tenant."id"
  ORDER BY "createdAt" ASC
  LIMIT 1
) AS creator ON TRUE
ON CONFLICT ("tenantId", "name") DO NOTHING;

INSERT INTO "FieldDefinition" (
  "id", "tenantId", "objectId", "name", "label", "fieldType",
  "required", "searchable", "sortable", "filterable", "visible", "editable",
  "isActive", "isSystemField", "isCustomField", "isStandardField",
  "displayOrder", "lookupObject", "createdBy", "createdAt", "updatedAt"
)
SELECT
  'call_detail_field_' || object."id" || '_' || field."name",
  object."tenantId",
  object."id",
  field."name",
  field."label",
  field."fieldType",
  field."required",
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  field."editable",
  TRUE,
  field."systemField",
  FALSE,
  TRUE,
  field."displayOrder",
  field."lookupObject",
  object."createdBy",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ObjectDefinition" AS object
CROSS JOIN (VALUES
  ('name', 'Call Name', 'autoNumber', FALSE, FALSE, TRUE, NULL::TEXT, 0),
  ('callId', 'Call ID', 'text', TRUE, FALSE, FALSE, NULL::TEXT, 1),
  ('callFrom', 'Call From', 'phone', FALSE, FALSE, TRUE, NULL::TEXT, 2),
  ('callTo', 'Call To', 'phone', FALSE, FALSE, TRUE, NULL::TEXT, 3),
  ('callType', 'Call Type', 'picklist', TRUE, FALSE, TRUE, NULL::TEXT, 4),
  ('caseId', 'Case', 'lookup', FALSE, FALSE, TRUE, 'Lead', 5),
  ('createdById', 'Created By', 'lookup', TRUE, TRUE, FALSE, 'User', 6),
  ('duration', 'Duration', 'number', TRUE, TRUE, FALSE, NULL::TEXT, 7),
  ('endAt', 'End Time', 'dateTime', TRUE, TRUE, FALSE, NULL::TEXT, 8),
  ('executiveContactNo', 'Executive Contact No', 'phone', FALSE, FALSE, TRUE, NULL::TEXT, 9),
  ('landingNumber', 'Landing Number', 'phone', FALSE, FALSE, TRUE, NULL::TEXT, 10),
  ('lastModifiedById', 'Last Modified By', 'lookup', FALSE, TRUE, FALSE, 'User', 11),
  ('leadId', 'Lead', 'lookup', TRUE, FALSE, TRUE, 'Lead', 12),
  ('ownerId', 'Owner', 'lookup', FALSE, FALSE, TRUE, 'User', 13),
  ('parentId', 'Parent ID', 'text', FALSE, FALSE, TRUE, NULL::TEXT, 14),
  ('startAt', 'Start Time', 'dateTime', TRUE, TRUE, FALSE, NULL::TEXT, 15),
  ('status', 'Status', 'picklist', TRUE, FALSE, TRUE, NULL::TEXT, 16),
  ('notes', 'Notes', 'longText', FALSE, FALSE, TRUE, NULL::TEXT, 17)
) AS field("name", "label", "fieldType", "systemField", "required", "editable", "lookupObject", "displayOrder")
WHERE object."name" = 'CallDetail'
  AND NOT EXISTS (
    SELECT 1
    FROM "FieldDefinition" AS existing
    WHERE existing."objectId" = object."id"
      AND existing."name" = field."name"
  );

INSERT INTO "PageLayout" (
  "id", "tenantId", "objectId", "name", "isDefault", "sections", "createdBy", "createdAt", "updatedAt"
)
SELECT
  'call_detail_layout_' || object."id",
  object."tenantId",
  object."id",
  'Default Layout',
  TRUE,
  '[{"name":"Call Information","fields":["name","callId","callType","callFrom","callTo","startAt","endAt","duration","status"]},{"name":"Related Records","fields":["leadId","caseId","ownerId","createdById","lastModifiedById","parentId"]},{"name":"Details","fields":["executiveContactNo","landingNumber","notes"]}]'::JSONB,
  object."createdBy",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ObjectDefinition" AS object
WHERE object."name" = 'CallDetail'
ON CONFLICT ("objectId", "name") DO NOTHING;

INSERT INTO "PicklistValue" (
  "id", "tenantId", "fieldId", "label", "value", "isActive", "isDefault", "displayOrder", "createdAt"
)
SELECT
  'call_detail_picklist_' || field."id" || '_' || option."value",
  field."tenantId",
  field."id",
  option."label",
  option."value",
  TRUE,
  option."isDefault",
  option."displayOrder",
  CURRENT_TIMESTAMP
FROM "FieldDefinition" AS field
JOIN "ObjectDefinition" AS object ON object."id" = field."objectId"
CROSS JOIN (VALUES
  ('callType', 'Inbound', 'INBOUND', TRUE, 0),
  ('callType', 'Outbound', 'OUTBOUND', FALSE, 1),
  ('status', 'Completed', 'COMPLETED', TRUE, 0),
  ('status', 'No Answer', 'NO_ANSWER', FALSE, 1),
  ('status', 'Busy', 'BUSY', FALSE, 2),
  ('status', 'Voicemail', 'VOICEMAIL', FALSE, 3),
  ('status', 'Cancelled', 'CANCELLED', FALSE, 4)
) AS option("fieldName", "label", "value", "isDefault", "displayOrder")
WHERE object."name" = 'CallDetail'
  AND field."name" = option."fieldName"
ON CONFLICT ("fieldId", "value") DO NOTHING;
