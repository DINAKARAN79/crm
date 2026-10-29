# Merge Integration and Final Verification

## Summary

The merge integration pass addressed verified cross-layer mismatches while preserving the existing worktree changes:

- Permission reconciliation now applies enabled grants and retains flags outside the current permission catalog; effective permissions also include legacy profile-linked permission sets.
- Opportunity responses include the latest completed GRE registration snapshot across the supported GRE model families.
- Lead creation continues when no eligible Pre Sales round-robin member exists and returns an explicit warning; other assignment errors still propagate.
- The homepage selector uses the configured homepage data and preserves dashboard routing and Admin Home fallback behavior.
- Round-robin Prisma member type/default and uniqueness now match the member-level routing migration.
- Added the missing nullable coordinate prerequisite migration and corrected the location setup guide to match the actual backfill script.
- Updated affected regression tests and resolved lint errors in touched code.

## Verification

| Check | Result |
|---|---|
| Prisma Client generation (`npm run db:generate`) | Passed |
| Prisma schema validation (`prisma validate`, using a placeholder `DATABASE_URL`) | Passed; no database connection was made |
| Workspace typecheck (`npm run typecheck`) | Passed for API, CP Portal, web, DB, and shared packages |
| Focused round-robin API tests | Passed: 33 tests across the service and route suites |
| Full workspace tests | Passed after the final schema adjustment: API 124/124 and web 89/89 |
| Workspace lint | Passed after the final changes with 0 errors; existing warnings remain |
| Workspace production build (`npm run build`) | Passed after Prisma Client regeneration |

## Database and release boundary

The location schema migration sequence is `20261005_add_project_coordinates.sql` followed by `20261009_project_map_url_and_decimal_coordinates.sql`. No migration was applied, no database was inspected or modified, and migration behavior against a live database remains unverified. The backfill script was documented but not run.

No commit, push, or deployment was performed. This report records code-level checks only; it is not a claim that a production rollout or a dedicated vulnerability scan was completed.
