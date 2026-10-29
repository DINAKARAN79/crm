CREATE INDEX IF NOT EXISTS "Unit_tenantId_projectId_type_floor_status_idx"
  ON "Unit"("tenantId", "projectId", "type", "floor", "status");
