BEGIN;

-- A 0009 registra partial quando a resposta atingiu limite/truncamento. A
-- 0011 ainda aceitava somente completed, embora a persistencia desse run ja
-- estivesse consolidada. Este patch substitui somente a funcao existente,
-- preservando a assinatura, os aliases corrigidos e os grants anteriores.
DO $migration$
DECLARE
  function_definition text;
  previous_guard text := $guard$
  IF run.status <> 'completed' THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_RUN_NOT_COMPLETED';
  END IF;
$guard$;
  finalized_guard text := $guard$
  IF run.status NOT IN ('completed', 'partial') OR run.completed_at IS NULL THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_RUN_NOT_COMPLETED status=% completed_at_present=% candidate_count=%',
      coalesce(run.status, 'unknown'), run.completed_at IS NOT NULL, expected_count;
  END IF;
$guard$;
BEGIN
  SELECT pg_get_functiondef(function_oid.oid)
    INTO function_definition
  FROM pg_proc function_oid
  JOIN pg_namespace function_schema ON function_schema.oid = function_oid.pronamespace
  WHERE function_schema.nspname = 'public'
    AND function_oid.proname = 'import_minerador_discovery_candidates'
    AND function_oid.pronargs = 4
    AND function_oid.proargtypes[0] = 'uuid'::regtype::oid
    AND function_oid.proargtypes[1] = 'uuid'::regtype::oid
    AND function_oid.proargtypes[2] = 'uuid'::regtype::oid
    AND function_oid.proargtypes[3] = 'uuid[]'::regtype::oid;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_PATCH_FUNCTION_NOT_FOUND';
  END IF;

  IF position(previous_guard IN function_definition) = 0 THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_PATCH_BASE_MISMATCH';
  END IF;

  function_definition := replace(function_definition, previous_guard, finalized_guard);
  EXECUTE function_definition;
END;
$migration$;

COMMIT;
