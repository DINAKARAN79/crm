# Project Location Setup

Project coordinates and the canonical `map_url` are stored in the `Project` table. Apply `packages/db/migrations/20261005_add_project_coordinates.sql` followed by `packages/db/migrations/20261009_project_map_url_and_decimal_coordinates.sql` before deploying the API. The first migration adds nullable coordinates; the second converts them to `DECIMAL(10, 7)`, adds `map_url`, and backfills map links for existing projects with coordinates.

Reverse geocoding uses Nominatim server-side, so no Google Maps API key is required. Set `NOMINATIM_CONTACT_EMAIL` to an address that identifies this application in the request User-Agent. Requests are serialized to no more than one per second per API process.

To refresh location names for projects that already have coordinates, run the script from the repository root with the API environment and database connection configured:

```powershell
npx tsx apps/api/src/scripts/backfillProjectLocationNames.ts
```

The script processes every project with valid coordinates, updating its address from reverse geocoding and refreshing its map URL. It does not change coordinates or select projects by name. It exits with a failure status if any reverse-geocoding updates fail.