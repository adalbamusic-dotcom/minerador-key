-- LOCAL ROLLBACK ARTIFACT ONLY - NOT FOR EXECUTION.
--
-- Migration 0005 is immutable and its rollback is not authorized.
-- The guard row contains historical snapshot data that is not reproduced here.
-- Recreating an empty guard would not restore the 0005 rollback contract.
-- Any recovery requires a separately approved restoration plan based on an
-- independently preserved snapshot; do not rerun or rollback migration 0005.

SELECT
  'ROLLBACK_NOT_AUTHORIZED'::text AS status,
  'public.tenant_0005_migration_guard'::text AS object_name,
  'No automatic restoration SQL is provided.'::text AS reason;
