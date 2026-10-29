ALTER TABLE "CallDetail"
ADD COLUMN "opportunityId" TEXT,
ADD COLUMN "parentUrl" VARCHAR(255),
ADD COLUMN "recordingFile" VARCHAR(255);

CREATE INDEX "CallDetail_tenantId_opportunityId_idx"
ON "CallDetail"("tenantId", "opportunityId");

ALTER TABLE "CallDetail"
ADD CONSTRAINT "CallDetail_opportunityId_fkey"
FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
  FALSE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  FALSE,
  FALSE,
  TRUE,
  field."displayOrder",
  field."lookupObject",
  object."createdBy",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ObjectDefinition" AS object
CROSS JOIN (VALUES
  ('opportunityId', 'Opportunity', 'lookup', 'Opportunity', 13),
  ('parentUrl', 'Parent URL', 'url', NULL::TEXT, 16),
  ('recordingFile', 'Recording File', 'url', NULL::TEXT, 17)
) AS field("name", "label", "fieldType", "lookupObject", "displayOrder")
WHERE object."name" = 'CallDetail'
  AND NOT EXISTS (
    SELECT 1
    FROM "FieldDefinition" AS existing
    WHERE existing."objectId" = object."id"
      AND existing."name" = field."name"
  );

UPDATE "FieldDefinition" AS field
SET
  "label" = CASE field."name"
    WHEN 'name' THEN 'Call Details Name'
    ELSE field."label"
  END,
  "displayOrder" = CASE field."name"
    WHEN 'name' THEN 0
    WHEN 'callFrom' THEN 1
    WHEN 'callId' THEN 2
    WHEN 'callTo' THEN 3
    WHEN 'callType' THEN 4
    WHEN 'caseId' THEN 5
    WHEN 'createdById' THEN 6
    WHEN 'duration' THEN 7
    WHEN 'endAt' THEN 8
    WHEN 'executiveContactNo' THEN 9
    WHEN 'landingNumber' THEN 10
    WHEN 'lastModifiedById' THEN 11
    WHEN 'leadId' THEN 12
    WHEN 'opportunityId' THEN 13
    WHEN 'ownerId' THEN 14
    WHEN 'parentId' THEN 15
    WHEN 'parentUrl' THEN 16
    WHEN 'recordingFile' THEN 17
    WHEN 'startAt' THEN 18
    WHEN 'status' THEN 19
    WHEN 'notes' THEN 20
    ELSE field."displayOrder"
  END,
  "fieldType" = CASE field."name"
    WHEN 'parentUrl' THEN 'url'
    WHEN 'recordingFile' THEN 'url'
    WHEN 'callFrom' THEN 'text'
    WHEN 'callTo' THEN 'text'
    WHEN 'executiveContactNo' THEN 'text'
    WHEN 'landingNumber' THEN 'text'
    ELSE field."fieldType"
  END,
  "lookupObject" = CASE field."name"
    WHEN 'opportunityId' THEN 'Opportunity'
    ELSE field."lookupObject"
  END
FROM "ObjectDefinition" AS object
WHERE field."objectId" = object."id"
  AND object."name" = 'CallDetail';

UPDATE "PageLayout" AS layout
SET "sections" = '[{"name":"Call Information","fields":["name","callFrom","callId","callTo","callType","duration","startAt","endAt","status"]},{"name":"Related Records","fields":["caseId","createdById","lastModifiedById","leadId","opportunityId","ownerId","parentId","parentUrl"]},{"name":"Details","fields":["executiveContactNo","landingNumber","recordingFile","notes"]}]'::JSONB
FROM "ObjectDefinition" AS object
WHERE layout."objectId" = object."id"
  AND object."name" = 'CallDetail'
  AND layout."name" = 'Default Layout';
