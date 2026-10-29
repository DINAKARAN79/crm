ALTER TABLE "Booking"
ADD COLUMN "applicantDetails" JSONB;

UPDATE "Booking"
SET
  "applicantDetails" = (
    substring("notes" from length('BOOKING_FORM_DATA:') + 1)::jsonb
      - ARRAY['aadhaarNumber', 'panNumber', 'secondAadhaarNumber', 'secondPanNumber']::text[]
  ),
  "notes" = NULL
WHERE "notes" LIKE 'BOOKING_FORM_DATA:%';
