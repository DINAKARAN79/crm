CREATE TABLE "ProjectLayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "selectedPage" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectLayout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectLayoutShape" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectLayoutShape_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectLayout_storageKey_key" ON "ProjectLayout"("storageKey");
CREATE INDEX "ProjectLayout_tenantId_projectId_status_idx" ON "ProjectLayout"("tenantId", "projectId", "status");
CREATE UNIQUE INDEX "ProjectLayoutShape_layoutId_unitId_key" ON "ProjectLayoutShape"("layoutId", "unitId");
CREATE INDEX "ProjectLayoutShape_unitId_idx" ON "ProjectLayoutShape"("unitId");

ALTER TABLE "ProjectLayout"
  ADD CONSTRAINT "ProjectLayout_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectLayout"
  ADD CONSTRAINT "ProjectLayout_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectLayoutShape"
  ADD CONSTRAINT "ProjectLayoutShape_layoutId_fkey"
  FOREIGN KEY ("layoutId") REFERENCES "ProjectLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectLayoutShape"
  ADD CONSTRAINT "ProjectLayoutShape_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
