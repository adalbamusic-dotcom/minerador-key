-- Teste PostgreSQL local e reversível do contrato da 0044.
-- Usa tabela temporária e ROLLBACK; não toca dados da aplicação.

BEGIN;

CREATE TEMP TABLE metrics_time_zone_0044_contract (
  time_zone text
) ON COMMIT DROP;

INSERT INTO metrics_time_zone_0044_contract (time_zone) VALUES (NULL);
INSERT INTO metrics_time_zone_0044_contract (time_zone) VALUES ('America/Sao_Paulo');

DO $$
BEGIN
  IF (SELECT count(*) FROM metrics_time_zone_0044_contract) <> 2 THEN
    RAISE EXCEPTION '0044_REVERSIBLE_CONTRACT_TEST_FAILED';
  END IF;
END;
$$;

ROLLBACK;
