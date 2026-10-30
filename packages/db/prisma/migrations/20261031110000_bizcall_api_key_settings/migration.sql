ALTER TABLE "telephony_settings" ADD COLUMN IF NOT EXISTS "callerId" TEXT;

ALTER TABLE "telephony_settings"
  ALTER COLUMN "clickToCallUrl" SET DEFAULT 'https://bizcall.cxteletech.com/api/integration/click2call',
  ALTER COLUMN "authHeaderName" SET DEFAULT 'X-API-KEY',
  ALTER COLUMN "useBearerPrefix" SET DEFAULT false,
  ALTER COLUMN "callIdFieldPath" SET DEFAULT 'originateUuid';

UPDATE "telephony_settings"
SET "clickToCallUrl" = split_part("clickToCallUrl", '?', 1)
WHERE "clickToCallUrl" ~* '[?&]api_key=';

UPDATE "telephony_settings"
SET "clickToCallUrl" = 'https://bizcall.cxteletech.com/api/integration/click2call'
WHERE "clickToCallUrl" = 'https://bizcall.cxteletech.com/api/dialer/click2call';

UPDATE "telephony_settings"
SET "authHeaderName" = 'X-API-KEY', "useBearerPrefix" = false
WHERE "authHeaderName" = 'Authorization'
  AND "clickToCallUrl" IN (
    'https://bizcall.cxteletech.com/api/dialer/click2call',
    'https://bizcall.cxteletech.com/api/integration/click2call'
  );
