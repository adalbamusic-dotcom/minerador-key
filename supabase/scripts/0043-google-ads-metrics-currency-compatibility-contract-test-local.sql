-- Teste PostgreSQL local e reversível do contrato da 0043.
-- Usa tabela temporária e ROLLBACK; não toca dados da aplicação.

BEGIN;

CREATE TEMP TABLE metrics_currency_0043_contract (
  currency_code text CHECK (currency_code ~ '^[A-Z]{3}$')
) ON COMMIT DROP;

INSERT INTO metrics_currency_0043_contract (currency_code) VALUES (NULL);
INSERT INTO metrics_currency_0043_contract (currency_code) VALUES ('BRL');

DO $$
BEGIN
  BEGIN
    INSERT INTO metrics_currency_0043_contract (currency_code) VALUES ('brl');
    RAISE EXCEPTION '0043_INVALID_CURRENCY_WAS_ACCEPTED';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM metrics_currency_0043_contract) <> 2 THEN
    RAISE EXCEPTION '0043_REVERSIBLE_CONTRACT_TEST_FAILED';
  END IF;
END;
$$;

ROLLBACK;
