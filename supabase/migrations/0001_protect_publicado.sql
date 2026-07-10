-- ============================================================================
-- Migration: 0001_protect_publicado.sql
-- Projeto:    Minerador Key (Adalba)
-- Data:       30/06/2026
-- Objetivo:   Blinda dados com status = 'publicado' no nivel do banco.
--             Regra absoluta: NENHUM dado publicado pode ser apagado,
--             rebaixado ou alterado estruturalmente em nenhuma instancia.
--
-- Idempotente: pode ser re-executada com seguranca (DROP IF EXISTS antes de CREATE).
-- Resiliente: protege colunas estruturais apenas SE existirem no schema
--             (via checagem to_jsonb(OLD) ? 'coluna'), sem quebrar se faltarem.
--
-- COMO APLICAR: cole este arquivo inteiro no SQL Editor do dashboard do Supabase
-- e rode. Nao requer CLI.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Coluna de qualidade de origem do volume (para o fix do KGR fallback)
-- ----------------------------------------------------------------------------
-- Permite distinguir volume real (API) de volume estimado (fallback).
-- Nao quebra se ja existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'volume_source'
  ) THEN
    ALTER TABLE public.keywords_kgr ADD COLUMN volume_source text NOT NULL DEFAULT 'real';
  END IF;
END $$;

COMMENT ON COLUMN public.keywords_kgr.volume_source IS
  'Origem do dado de volume: real (API externa) ou estimado (fallback).';


-- ============================================================================
-- 1. keywords_kgr — protege DELETE, rebaixamento e campos estruturais
-- ============================================================================
-- Campos estruturais imutaveis quando publicado:
--   keyword, lista_id, location, slug, canonical (estes 3 ultimos so se existirem)
-- Campos editoriais continuam editaveis: intent, analise_semantica, nicho,
--   volume_search, results_allintitle, kgr_score, volume_source.

CREATE OR REPLACE FUNCTION public.protect_published_keyword()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  structural_changed boolean := false;
  old_json jsonb;
  new_json jsonb;
BEGIN
  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  -- DELETE: bloqueia se a keyword estiver publicada
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'publicado' THEN
      RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: keywords publicadas nao podem ser apagadas.';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: so aplica regras se o registro JA estava publicado (OLD.status)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'publicado' THEN
      -- 1) Rebaixamento de status e proibido
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: status publicado nao pode ser rebaixado.';
      END IF;

      -- 2) Campos estruturais imutaveis (sempre existem)
      IF NEW.keyword IS DISTINCT FROM OLD.keyword THEN
        structural_changed := true;
      END IF;
      IF NEW.lista_id IS DISTINCT FROM OLD.lista_id THEN
        structural_changed := true;
      END IF;

      -- 3) Campos estruturais opcionais (so checa se a coluna existir no registro)
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

DROP TRIGGER IF EXISTS trg_protect_published_keyword ON public.keywords_kgr;
CREATE TRIGGER trg_protect_published_keyword
  BEFORE DELETE OR UPDATE ON public.keywords_kgr
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_keyword();


-- ============================================================================
-- 2. listas_kgr — protege DELETE e campos estruturais se houver publicado
-- ============================================================================
-- Campos estruturais: nome, marca_id (slug se existir).
-- Bloqueia operacao destrutiva quando existe keyword publicada ligada a lista.

CREATE OR REPLACE FUNCTION public.protect_published_lista()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  has_published boolean;
  old_json jsonb;
  new_json jsonb;
  structural_changed boolean := false;
BEGIN
  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  -- Verifica se existe keyword publicada ligada a esta lista
  SELECT EXISTS (
    SELECT 1 FROM public.keywords_kgr
    WHERE lista_id = OLD.id AND status = 'publicado'
  ) INTO has_published;

  IF NOT has_published THEN
    -- Nao ha publicado: operacao livre
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Ha publicado: bloqueia DELETE
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: esta lista/silo possui keywords publicadas e nao pode ser apagada.';
  END IF;

  -- UPDATE: protege campos estruturais
  IF TG_OP = 'UPDATE' THEN
    IF NEW.nome IS DISTINCT FROM OLD.nome THEN
      structural_changed := true;
    END IF;
    IF NEW.marca_id IS DISTINCT FROM OLD.marca_id THEN
      structural_changed := true;
    END IF;
    IF old_json ? 'slug' AND (new_json->>'slug') IS DISTINCT FROM (old_json->>'slug') THEN
      structural_changed := true;
    END IF;

    IF structural_changed THEN
      RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: campos estruturais de lista com keywords publicadas nao podem ser alterados.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_published_lista ON public.listas_kgr;
CREATE TRIGGER trg_protect_published_lista
  BEFORE DELETE OR UPDATE ON public.listas_kgr
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_lista();


-- ============================================================================
-- 3. marcas — protege DELETE se houver qualquer publicado relacionado
-- ============================================================================
-- Caminho: marcas -> listas_kgr (marca_id) -> keywords_kgr (lista_id, publicado)
-- Tambem considera briefings_artigos publicados ligados a listas da marca.

CREATE OR REPLACE FUNCTION public.protect_marca_with_published()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  has_published boolean;
BEGIN
  -- Verifica keywords publicadas em qualquer lista da marca
  SELECT EXISTS (
    SELECT 1
    FROM public.keywords_kgr kw
    JOIN public.listas_kgr l ON l.id = kw.lista_id
    WHERE l.marca_id = OLD.id AND kw.status = 'publicado'
  ) INTO has_published;

  -- Se nao achou por keywords, tenta por briefings publicados ligados a listas da marca
  IF NOT has_published THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.briefings_artigos b
      JOIN public.listas_kgr l ON l.id = b.silo_id
      WHERE l.marca_id = OLD.id AND b.status = 'publicado'
    ) INTO has_published;
  END IF;

  -- Tabela briefings pode nao ter coluna status; se falhar, ignora
  IF NOT has_published THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: esta marca possui conteudo publicado e nao pode ser apagada.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_marca_with_published ON public.marcas;
CREATE TRIGGER trg_protect_marca_with_published
  BEFORE DELETE ON public.marcas
  FOR EACH ROW EXECUTE FUNCTION public.protect_marca_with_published();


-- ============================================================================
-- 4. briefings_artigos — protege publicado (se a tabela existir)
-- ============================================================================
-- Campos imutaveis quando publicado: keyword_principal, slug_sugerido, silo_id.
-- Bloqueia DELETE, rebaixamento de status e alteracao estrutural.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'briefings_artigos'
  ) THEN
    -- Funcao do trigger
    EXECUTE $f$ CREATE OR REPLACE FUNCTION public.protect_published_briefing()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $b$
    DECLARE
      structural_changed boolean := false;
      old_json jsonb;
      new_json jsonb;
    BEGIN
      old_json := to_jsonb(OLD);
      new_json := to_jsonb(NEW);

      IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'publicado' THEN
          RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: briefings publicados nao podem ser apagados.';
        END IF;
        RETURN OLD;
      END IF;

      IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'publicado' THEN
          IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: status de briefing publicado nao pode ser rebaixado.';
          END IF;

          IF NEW.keyword_principal IS DISTINCT FROM OLD.keyword_principal THEN
            structural_changed := true;
          END IF;
          IF NEW.slug_sugerido IS DISTINCT FROM OLD.slug_sugerido THEN
            structural_changed := true;
          END IF;
          IF NEW.silo_id IS DISTINCT FROM OLD.silo_id THEN
            structural_changed := true;
          END IF;

          IF structural_changed THEN
            RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: campos estruturais de briefing publicado nao podem ser alterados.';
          END IF;
        END IF;
        RETURN NEW;
      END IF;

      RETURN NULL;
    END;
    $b$ $f$;

    -- Trigger
    EXECUTE 'DROP TRIGGER IF EXISTS trg_protect_published_briefing ON public.briefings_artigos';
    EXECUTE 'CREATE TRIGGER trg_protect_published_briefing '
            || 'BEFORE DELETE OR UPDATE ON public.briefings_artigos '
            || 'FOR EACH ROW EXECUTE FUNCTION public.protect_published_briefing()';
  ELSE
    RAISE NOTICE 'Tabela briefings_artigos nao existe; trigger de briefing ignorado.';
  END IF;
END $$;


-- ============================================================================
-- Fim da migration.
-- Para reverter (caso precise), rode:
--   DROP TRIGGER IF EXISTS trg_protect_published_keyword ON public.keywords_kgr;
--   DROP TRIGGER IF EXISTS trg_protect_published_lista ON public.listas_kgr;
--   DROP TRIGGER IF EXISTS trg_protect_marca_with_published ON public.marcas;
--   DROP TRIGGER IF EXISTS trg_protect_published_briefing ON public.briefings_artigos;
--   DROP FUNCTION IF EXISTS public.protect_published_keyword();
--   DROP FUNCTION IF EXISTS public.protect_published_lista();
--   DROP FUNCTION IF EXISTS public.protect_marca_with_published();
--   DROP FUNCTION IF EXISTS public.protect_published_briefing();
-- ============================================================================
