-- 0038: remove a RPC legada de importacao da Descoberta.
-- Aplicar somente depois do preflight read-only 0038.
-- A rota atual usa importKeywordsWithCore e nao depende desta funcao.
-- Sem CASCADE: qualquer dependencia inesperada deve interromper o DROP.

BEGIN;

DROP FUNCTION public.import_minerador_discovery_candidates(
  uuid,
  uuid,
  uuid,
  uuid[]
);

COMMIT;
