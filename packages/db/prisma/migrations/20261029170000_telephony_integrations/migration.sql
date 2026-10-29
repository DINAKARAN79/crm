CREATE TABLE IF NOT EXISTS "telephony_integrations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "ipAllowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 120,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telephony_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "telephony_integrations_keyHash_key" ON "telephony_integrations"("keyHash");
CREATE INDEX IF NOT EXISTS "telephony_integrations_tenantId_idx" ON "telephony_integrations"("tenantId");
CREATE INDEX IF NOT EXISTS "telephony_integrations_tenantId_revokedAt_idx" ON "telephony_integrations"("tenantId", "revokedAt");

CREATE TABLE IF NOT EXISTS "telephony_call_receipts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "providerCallId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "callDetailId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telephony_call_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "telephony_call_receipts_tenantId_providerCallId_key" ON "telephony_call_receipts"("tenantId", "providerCallId");
CREATE INDEX IF NOT EXISTS "telephony_call_receipts_integrationId_idx" ON "telephony_call_receipts"("integrationId");
CREATE INDEX IF NOT EXISTS "telephony_call_receipts_leadId_idx" ON "telephony_call_receipts"("leadId");
