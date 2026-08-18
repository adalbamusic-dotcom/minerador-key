-- Preparacao de rollback; nao executar automaticamente.
-- O rollback somente e seguro quando nao houver linhas manual/csv e nenhum
-- consumidor depender das colunas source/source_data.
DO $$
DECLARE
  local_runs bigint;
  local_candidates bigint;
BEGIN
  SELECT count(*) INTO local_runs FROM public.minerador_discovery_runs WHERE source IN ('manual', 'csv');
  SELECT count(*) INTO local_candidates FROM public.minerador_discovery_candidates WHERE source IN ('manual', 'csv');
  IF local_runs > 0 OR local_candidates > 0 THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_MULTI_SOURCE_ROLLBACK_BLOCKED: rows manual/csv exist';
  END IF;
  RAISE NOTICE 'Preflight passed. Review consumers before executing the explicit rollback statements.';
END;
$$;

-- Execute the following statements only after the guard above and a consumer audit:
-- REVOKE ALL PRIVILEGES ON FUNCTION public.persist_minerador_discovery_source_run(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
-- DROP FUNCTION public.persist_minerador_discovery_source_run(jsonb, jsonb);
-- ALTER TABLE public.minerador_discovery_runs DROP CONSTRAINT IF EXISTS minerador_discovery_runs_source_contract_check;
-- ALTER TABLE public.minerador_discovery_runs DROP CONSTRAINT IF EXISTS minerador_discovery_runs_source_check;
-- ALTER TABLE public.minerador_discovery_candidates DROP CONSTRAINT IF EXISTS minerador_discovery_candidates_source_contract_check;
-- ALTER TABLE public.minerador_discovery_candidates DROP CONSTRAINT IF EXISTS minerador_discovery_candidates_source_check;
-- ALTER TABLE public.minerador_discovery_runs DROP COLUMN IF EXISTS source_data, DROP COLUMN IF EXISTS source;
-- ALTER TABLE public.minerador_discovery_candidates DROP COLUMN IF EXISTS source_data, DROP COLUMN IF EXISTS source;
