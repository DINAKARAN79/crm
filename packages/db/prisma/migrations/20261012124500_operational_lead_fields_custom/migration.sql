UPDATE "FieldDefinition" AS field
SET
  "isSystemField" = FALSE,
  "isStandardField" = FALSE,
  "isCustomField" = TRUE
FROM "ObjectDefinition" AS object
WHERE field."objectId" = object."id"
  AND object."name" = 'Lead'
  AND field."name" IN ('source', 'status', 'rating', 'description', 'score');

UPDATE "FieldDefinition" AS field
SET "visible" = TRUE
FROM "ObjectDefinition" AS object
WHERE field."objectId" = object."id"
  AND object."name" = 'Lead'
  AND field."name" IN ('source', 'status', 'rating', 'description', 'score');

INSERT INTO "PicklistValue" (
  "id", "tenantId", "fieldId", "label", "value", "isActive", "isDefault", "displayOrder", "createdAt"
)
SELECT
  'custom_lead_source_' || md5(field."id" || value."value"),
  field."tenantId",
  field."id",
  value."label",
  value."value",
  TRUE,
  FALSE,
  value."displayOrder",
  CURRENT_TIMESTAMP
FROM "FieldDefinition" AS field
JOIN "ObjectDefinition" AS object ON object."id" = field."objectId"
CROSS JOIN (VALUES
  ('Facebook', 'FACEBOOK', 1),
  ('Channel Partner', 'CHANNEL_PARTNER', 7)
) AS value("label", "value", "displayOrder")
WHERE object."name" = 'Lead'
  AND field."name" = 'source'
ON CONFLICT ("fieldId", "value") DO UPDATE
SET
  "label" = EXCLUDED."label",
  "isActive" = TRUE,
  "displayOrder" = EXCLUDED."displayOrder";

UPDATE "Lead"
SET "customFields" = COALESCE("customFields", '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'source', "source"::text,
  'status', "status"::text,
  'rating', "rating"::text,
  'description', "description",
  'score', "score"
));
