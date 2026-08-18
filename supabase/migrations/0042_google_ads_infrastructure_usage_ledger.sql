-- Google Ads e infraestrutura fixa da Plataforma no ledger append-only.
-- Altera somente a nullability de connection_id e adiciona a idempotencia
-- parcial para eventos sem Connection. Nao toca eventos historicos, FKs,
-- RLS, policies, ACL, owner, trigger append-only ou a unique existente.

BEGIN;

ALTER TABLE public.integration_usage_events
  ALTER COLUMN connection_id DROP NOT NULL;

CREATE UNIQUE INDEX uq_integration_usage_events_infrastructure_idempotency_0042
  ON public.integration_usage_events (provider_id, environment, idempotency_key)
  WHERE connection_id IS NULL;

COMMIT;
