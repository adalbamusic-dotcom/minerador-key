BEGIN;

-- Structural cleanup after the approved read-only preflight.
-- The trigger identifier is the real 63-character catalog name.
-- Unexpected dependencies must abort this migration.

DROP TRIGGER brand_exceptional_operation_execution_events_append_only_trg_00
  ON public.brand_exceptional_operation_execution_events;

DROP TABLE public.brand_exceptional_operation_execution_events;

DROP FUNCTION public.canonical_actor_can_execute_brand_exceptional_operation(uuid, uuid, text);

DROP TABLE public.brand_exceptional_operation_grants;

DROP TABLE public.tenant_0016_agency_role_rollback;

COMMIT;
