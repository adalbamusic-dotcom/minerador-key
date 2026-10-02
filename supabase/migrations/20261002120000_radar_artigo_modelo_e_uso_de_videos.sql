-- =============================================================================
-- ARTIGO-MODELO DO RADAR (IA + aprovação humana) E MODO DE USO DOS VÍDEOS
-- =============================================================================
--
-- SDD: docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md, Adendos A e B
-- (aprovados pelo dono em 2026-10-02, D5 e D6).
--
-- 1. `radar_article_blueprints` — o artigo-modelo de cada artigo: versões
--    append-only, presas ao hash do pacote congelado (`bundle_hash`). A IA gera
--    um rascunho (origin 'ai'); a edição humana gera outra versão
--    (origin 'human_edit'); a aprovação marca a versão uma vez só e ela não muda
--    mais. Só a versão APROVADA do pacote vigente vai ao CSV e ao Redator.
--
-- 2. `radar_article_video_sources.usage` — como o artigo usa cada vídeo
--    selecionado: contexto, sugestão de pauta, apoio, citação, incorporar ou
--    não usar. Nula = comportamento de antes.
--
-- RLS: leitura por quem acessa a marca; escrita só pelo servidor (service_role),
-- como as outras tabelas do Radar.
--
-- APLICAÇÃO: pelo dono, com `npx supabase db query --linked -f <este arquivo>`
-- seguido de `npx supabase migration repair --status applied 20261002120000 --linked`.
-- Nunca `supabase db push`. O código do artigo-modelo só vai ao ar depois disto.
-- Rollback: supabase/rollback/20261002120000_radar_artigo_modelo_e_uso_de_videos.rollback.sql
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.radar_article_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) BETWEEN 1 AND 256),
  bundle_hash text NOT NULL CHECK (char_length(btrim(bundle_hash)) BETWEEN 1 AND 512),
  version_number integer NOT NULL CHECK (version_number >= 1),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT', 'APPROVED')),
  origin text NOT NULL CHECK (origin IN ('ai', 'human_edit')),
  payload jsonb NOT NULL,
  -- O que o validador do servidor corrigiu ou avisa nesta versão.
  validation jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  CONSTRAINT uq_radar_article_blueprint_version UNIQUE (brand_id, article_id, version_number),
  CONSTRAINT ck_radar_article_blueprint_approval CHECK (
    (state = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (state = 'DRAFT' AND approved_by IS NULL AND approved_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_radar_article_blueprints_article
  ON public.radar_article_blueprints (brand_id, article_id, version_number DESC);

ALTER TABLE public.radar_article_blueprints ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.radar_article_blueprints FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.radar_article_blueprints TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.radar_article_blueprints TO service_role;

DROP POLICY IF EXISTS radar_article_blueprints_select ON public.radar_article_blueprints;
CREATE POLICY radar_article_blueprints_select
  ON public.radar_article_blueprints FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

-- A versão aprovada não muda mais: só DRAFT → APPROVED, uma vez.
CREATE OR REPLACE FUNCTION public.radar_article_blueprints_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'APPROVED' THEN
    RAISE EXCEPTION 'radar_article_blueprint_approved_is_immutable';
  END IF;
  IF NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.bundle_hash IS DISTINCT FROM OLD.bundle_hash
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
     OR NEW.article_id IS DISTINCT FROM OLD.article_id THEN
    RAISE EXCEPTION 'radar_article_blueprint_content_is_append_only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_radar_article_blueprints_guard ON public.radar_article_blueprints;
CREATE TRIGGER trg_radar_article_blueprints_guard
  BEFORE UPDATE ON public.radar_article_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.radar_article_blueprints_guard();

ALTER TABLE public.radar_article_video_sources
  ADD COLUMN IF NOT EXISTS usage text,
  ADD COLUMN IF NOT EXISTS usage_note text;

ALTER TABLE public.radar_article_video_sources
  DROP CONSTRAINT IF EXISTS radar_article_video_sources_usage_check;
ALTER TABLE public.radar_article_video_sources
  ADD CONSTRAINT radar_article_video_sources_usage_check
  CHECK (usage IS NULL OR usage IN ('CONTEXT', 'TOPIC_SUGGESTION', 'SUPPORT', 'QUOTE', 'EMBED', 'NOT_USED'));

ALTER TABLE public.radar_article_video_sources
  DROP CONSTRAINT IF EXISTS radar_article_video_sources_usage_note_check;
ALTER TABLE public.radar_article_video_sources
  ADD CONSTRAINT radar_article_video_sources_usage_note_check
  CHECK (usage_note IS NULL OR char_length(usage_note) <= 2000);

COMMIT;
