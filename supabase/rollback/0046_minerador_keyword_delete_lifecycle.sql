-- ROLLBACK TÉCNICO LOCAL — NÃO EXECUTADO.
-- Só pode ser revisado/aplicado manualmente se 0046 for revertida antes de
-- qualquer tombstone. Não usa CASCADE e não remove dados editoriais.

BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.minerador_keywords') IS NULL
    OR to_regprocedure('public.delete_minerador_keywords(uuid,uuid[],uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'MINERADOR_0046_ROLLBACK_PRECONDITION: 0046 não está aplicada por completo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.minerador_keywords
    WHERE deleted_at IS NOT NULL OR purge_after IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'MINERADOR_0046_ROLLBACK_BLOCKED: existem tombstones; preserve-os e resolva manualmente';
  END IF;
END $$;

-- Reconstitui a proteção histórica antes de remover as colunas do lifecycle.
CREATE OR REPLACE FUNCTION public.protect_published_keyword()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  structural_changed boolean := false;
  old_json jsonb;
  new_json jsonb;
BEGIN
  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'publicado' THEN
      RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: keywords publicadas nao podem ser apagadas.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'publicado' THEN
      IF NEW.status IS DISTINCT FROM OLD.status
        OR NEW.keyword IS DISTINCT FROM OLD.keyword
        OR NEW.lista_id IS DISTINCT FROM OLD.lista_id THEN
        structural_changed := true;
      END IF;
      IF old_json ? 'location' AND (new_json->>'location') IS DISTINCT FROM (old_json->>'location') THEN
        structural_changed := true;
      END IF;
      IF old_json ? 'slug' AND (new_json->>'slug') IS DISTINCT FROM (old_json->>'slug') THEN
        structural_changed := true;
      END IF;
      IF old_json ? 'canonical' AND (new_json->>'canonical') IS DISTINCT FROM (old_json->>'canonical') THEN
        structural_changed := true;
      END IF;
      IF structural_changed THEN
        RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: campos estruturais de keywords publicadas nao podem ser alterados.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.protect_published_keyword() SET search_path TO pg_catalog, public, pg_temp;

DROP FUNCTION IF EXISTS public.purge_minerador_keyword(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.purge_minerador_keywords(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.restore_minerador_keyword(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.recover_minerador_keywords(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS public.delete_minerador_keyword(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_minerador_keywords(uuid, uuid[], uuid, boolean);
DROP FUNCTION IF EXISTS public.minerador_keyword_is_published(text, jsonb);

ALTER TABLE public.minerador_keywords
  DROP CONSTRAINT IF EXISTS minerador_keywords_delete_lifecycle_check;

DROP INDEX IF EXISTS public.minerador_keywords_recoverable_idx;

ALTER TABLE public.minerador_keywords
  DROP COLUMN IF EXISTS purge_after,
  DROP COLUMN IF EXISTS deleted_at;

-- Restore the historical direct-write ACL only as part of this explicitly
-- reviewed rollback; 0046 intentionally revokes it for normal operation.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.minerador_keywords TO authenticated;

COMMIT;
