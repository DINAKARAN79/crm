UPDATE "FieldDefinition" AS field
SET
  "isSystemField" = CASE
    WHEN field."name" IN ('name', 'callId', 'createdById', 'duration', 'lastModifiedById') THEN TRUE
    ELSE FALSE
  END,
  "required" = field."name" IN ('callType', 'endAt', 'leadId', 'startAt'),
  "editable" = field."name" NOT IN ('name', 'callId', 'createdById', 'duration', 'lastModifiedById', 'leadId')
FROM "ObjectDefinition" AS object
WHERE field."objectId" = object."id"
  AND object."name" = 'CallDetail';
