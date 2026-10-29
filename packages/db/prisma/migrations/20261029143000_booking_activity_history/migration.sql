ALTER TABLE "Activity"
ADD COLUMN IF NOT EXISTS "bookingId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Activity_bookingId_fkey'
  ) THEN
    ALTER TABLE "Activity"
    ADD CONSTRAINT "Activity_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Activity_bookingId_idx" ON "Activity"("bookingId");
