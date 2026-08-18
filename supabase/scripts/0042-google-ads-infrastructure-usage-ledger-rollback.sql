-- Rollback guarded da 0042. Nao executar automaticamente.
-- Eventos append-only sem Connection nao podem ser reescritos para permitir
-- rollback: a presenca de qualquer um deles bloqueia a operacao.

BEGIN;

LOCK TABLE public.integration_usage_events IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.integration_usage_events
    WHERE connection_id IS NULL
  ) THEN
    RAISE EXCEPTION 'GOOGLE_ADS_INFRASTRUCTURE_USAGE_ROLLBACK_BLOCKED: infrastructure usage events exist';
  END IF;
END;
$$;

DROP INDEX public.uq_integration_usage_events_infrastructure_idempotency_0042;

ALTER TABLE public.integration_usage_events
  ALTER COLUMN connection_id SET NOT NULL;

COMMIT;
