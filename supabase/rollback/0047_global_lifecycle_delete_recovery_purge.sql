-- Artefato local de rollback técnico de 0047.
-- NÃO executar automaticamente. Antes de usar, confirmar que nenhum tombstone
-- foi criado e que o snapshot pré-0047 está disponível.

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.minerador_keywords WHERE deleted_at IS NOT NULL OR purge_after IS NOT NULL OR deleted_by IS NOT NULL) THEN
    RAISE EXCEPTION 'LIFECYCLE_0047_ROLLBACK_BLOCKED: tombstones já existem';
  END IF;
END $$;

-- Funções de compatibilidade também são removidas somente porque foram
-- criadas por 0047. Não usar CASCADE e não restaurar definições históricas
-- automaticamente; o catálogo/snapshot deve ser revisado por humano.
DROP FUNCTION IF EXISTS public.lifecycle_purge_minerador_keywords(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.lifecycle_restore_minerador_keywords(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.lifecycle_preview_minerador_keywords(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.lifecycle_keyword_deletion_impact(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.lifecycle_keyword_is_published(uuid, uuid);
DROP FUNCTION IF EXISTS public.purge_minerador_keywords(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.restore_minerador_keyword(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.recover_minerador_keywords(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.delete_minerador_keyword(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_minerador_keywords(uuid, uuid[], uuid, boolean);

DROP INDEX IF EXISTS public.minerador_keywords_global_recoverable_idx;
ALTER TABLE public.minerador_keywords DROP CONSTRAINT IF EXISTS minerador_keywords_global_lifecycle_check;
ALTER TABLE public.minerador_keywords DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE public.minerador_keywords DROP COLUMN IF EXISTS purge_after;
ALTER TABLE public.minerador_keywords DROP COLUMN IF EXISTS deleted_at;

COMMIT;

