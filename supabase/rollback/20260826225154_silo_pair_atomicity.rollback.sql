-- Rollback local preparado para a RPC de atomicidade SiloDNA/SiloPage.
-- Artefato de segurança: não executar automaticamente e não usar CASCADE.
BEGIN;

DROP FUNCTION IF EXISTS public.persist_silo_pair_atomic(uuid, uuid, text, jsonb, jsonb, text, text);

COMMIT;
