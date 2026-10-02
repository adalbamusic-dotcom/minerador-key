-- Rollback de 20261002120000_radar_artigo_modelo_e_uso_de_videos.sql
-- ATENÇÃO: apaga os artigos-modelo gravados e o modo de uso dos vídeos.
-- Só pelo dono, com autorização explícita, depois de tirar o código do ar.

BEGIN;

ALTER TABLE public.radar_article_video_sources DROP CONSTRAINT IF EXISTS radar_article_video_sources_usage_note_check;
ALTER TABLE public.radar_article_video_sources DROP CONSTRAINT IF EXISTS radar_article_video_sources_usage_check;
ALTER TABLE public.radar_article_video_sources DROP COLUMN IF EXISTS usage_note;
ALTER TABLE public.radar_article_video_sources DROP COLUMN IF EXISTS usage;

DROP TRIGGER IF EXISTS trg_radar_article_blueprints_guard ON public.radar_article_blueprints;
DROP FUNCTION IF EXISTS public.radar_article_blueprints_guard();
DROP TABLE IF EXISTS public.radar_article_blueprints;

COMMIT;
