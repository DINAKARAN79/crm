ALTER TYPE "LeadStatus" RENAME VALUE 'NEW' TO '1';
ALTER TYPE "LeadStatus" RENAME VALUE 'INCOMING' TO '2';
ALTER TYPE "LeadStatus" RENAME VALUE 'PROSPECT' TO '3';
ALTER TYPE "LeadStatus" RENAME VALUE 'SITE_VISIT_SCHEDULED' TO '4';
ALTER TYPE "LeadStatus" RENAME VALUE 'SITE_VISIT_HAPPENED' TO '5';
ALTER TYPE "LeadStatus" RENAME VALUE 'BOOKED' TO '6';
ALTER TYPE "LeadStatus" RENAME VALUE 'LOST' TO '7';

CREATE TABLE "LeadStatusSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "statusId" INTEGER NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeadStatusSetting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadStatusSetting_statusId_check" CHECK ("statusId" BETWEEN 1 AND 7),
    CONSTRAINT "LeadStatusSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LeadStatusSetting_tenantId_statusId_key" ON "LeadStatusSetting"("tenantId", "statusId");
CREATE INDEX "LeadStatusSetting_tenantId_enabled_idx" ON "LeadStatusSetting"("tenantId", "enabled");

INSERT INTO "LeadStatusSetting" ("id", "tenantId", "statusId", "label", "enabled", "createdAt", "updatedAt")
SELECT tenant."id" || '-lead-status-' || status."statusId",
       tenant."id",
       status."statusId",
       status."label",
       true,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
CROSS JOIN (VALUES
    (1, 'New'),
    (2, 'Incoming'),
    (3, 'Prospect'),
    (4, 'Site Visit Scheduled'),
    (5, 'Site Visit Happened'),
    (6, 'Booked'),
    (7, 'Lost')
) AS status("statusId", "label");

CREATE FUNCTION prevent_disabled_lead_status() RETURNS trigger AS $$
DECLARE
    status_id INTEGER;
    status_enabled BOOLEAN;
BEGIN
    status_id := CASE NEW."status"::TEXT
        WHEN '1' THEN 1
        WHEN '2' THEN 2
        WHEN '3' THEN 3
        WHEN '4' THEN 4
        WHEN '5' THEN 5
        WHEN '6' THEN 6
        WHEN '7' THEN 7
        ELSE NULL
    END;

    IF status_id IS NULL THEN
        RAISE EXCEPTION 'Unknown lead status ID: %', NEW."status"::TEXT USING ERRCODE = '23514';
    END IF;

    SELECT "enabled" INTO status_enabled
    FROM "LeadStatusSetting"
    WHERE "tenantId" = NEW."tenantId" AND "statusId" = status_id
    FOR SHARE;

    IF FOUND AND NOT status_enabled THEN
        RAISE EXCEPTION 'Lead status ID % is disabled for this company', status_id USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Lead_status_enabled_guard"
BEFORE INSERT OR UPDATE OF "status", "tenantId" ON "Lead"
FOR EACH ROW EXECUTE FUNCTION prevent_disabled_lead_status();

CREATE FUNCTION prevent_disabling_used_lead_status() RETURNS trigger AS $$
BEGIN
    IF OLD."enabled" AND NOT NEW."enabled" AND EXISTS (
        SELECT 1
        FROM "Lead"
        WHERE "tenantId" = NEW."tenantId"
          AND "status"::TEXT = NEW."statusId"::TEXT
    ) THEN
        RAISE EXCEPTION 'Cannot disable a lead status that is currently in use' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LeadStatusSetting_disable_used_guard"
BEFORE UPDATE OF "enabled" ON "LeadStatusSetting"
FOR EACH ROW EXECUTE FUNCTION prevent_disabling_used_lead_status();
