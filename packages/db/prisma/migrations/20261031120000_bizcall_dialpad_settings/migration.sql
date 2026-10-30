ALTER TABLE "telephony_settings"
  ADD COLUMN IF NOT EXISTS "dialpadUrl" TEXT NOT NULL DEFAULT 'https://bizcall.cxteletech.com/embed/dialpad',
  ADD COLUMN IF NOT EXISTS "dialpadMode" TEXT NOT NULL DEFAULT 'DOCKED',
  ADD COLUMN IF NOT EXISTS "callMethod" TEXT NOT NULL DEFAULT 'SERVER_API',
  ADD COLUMN IF NOT EXISTS "defaultDockState" TEXT NOT NULL DEFAULT 'COLLAPSED',
  ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'CRM',
  ADD COLUMN IF NOT EXISTS "productionOrigin" TEXT,
  ADD COLUMN IF NOT EXISTS "duplicateGuardSeconds" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "callsPerMinute" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "maskNumbers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blockDnc" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dncNumbers" TEXT NOT NULL DEFAULT '';

ALTER TABLE "telephony_settings"
  ADD COLUMN IF NOT EXISTS "updatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "keyLast4" TEXT;

CREATE TABLE IF NOT EXISTS "telephony_agent_permissions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "canUse" BOOLEAN NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telephony_agent_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "telephony_agent_permissions_tenantId_userId_key" UNIQUE ("tenantId", "userId")
);

CREATE INDEX IF NOT EXISTS "telephony_agent_permissions_tenantId_idx"
  ON "telephony_agent_permissions"("tenantId");
