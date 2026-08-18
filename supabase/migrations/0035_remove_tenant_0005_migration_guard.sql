-- 0035: remove the historical migration 0005 guard table.
-- Apply manually only after the cleanup preflight has passed.
-- Migration 0005 remains immutable and is not rerun or rolled back here.

BEGIN;

DROP TABLE public.tenant_0005_migration_guard;

COMMIT;
