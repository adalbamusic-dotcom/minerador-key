-- =============================================================================
-- ROLLBACK de 20261013120000_grupos_editoriais.sql (M1 — grupos editoriais)
-- SDD: docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md, §7.2
--
-- Só pelo dono. ORDEM: primeiro o código volta para antes da F1 (deploy), depois
-- este arquivo. O código da F1 tolera a ausência das tabelas (esconde o
-- seletor), então voltar o banco com o código da F1 no ar também não quebra o
-- Minerador — só some o recurso de grupo.
--
-- ANTES, salve o retrato das etiquetas (só leitura):
--   npx supabase db query --linked --output-format json "SELECT id, group_id FROM public.minerador_keywords WHERE group_id IS NOT NULL"
--   npx supabase db query --linked --output-format json "SELECT * FROM public.editorial_groups"
--   npx supabase db query --linked --output-format json "SELECT * FROM public.editorial_group_articles"
--   npx supabase db query --linked --output-format json "SELECT * FROM public.editorial_group_events"
--
-- APLICAR:
--   npx supabase db query --linked -f supabase/rollback/20261013120000_grupos_editoriais.rollback.sql
--   npx supabase migration repair --status reverted 20261013120000 --linked
--
-- O rollback só é limpo ANTES da Fase B do plano declarado (F4): depois dela,
-- pacotes aprovados guardam `plan.groupId`. Por isso a guarda abaixo recusa se
-- já existir plano declarado gravado em alguma keyword.
-- Apaga grupos, eventos e etiquetas (o retrato acima é a cópia). Não apaga
-- nenhuma keyword, artigo nem versão.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.minerador_keywords
             WHERE analise_semantica #> '{keyword_subject,plan}' IS NOT NULL
                OR analise_semantica ? 'keyword_declared_principal') THEN
    RAISE EXCEPTION 'GRUPOS_ROLLBACK: já existe plano declarado gravado (F4). O rollback da M1 deixaria proveniência apontando para grupo inexistente; volte o código e decida com a SDD §7.2.';
  END IF;
END $$;

DROP VIEW IF EXISTS public.editorial_group_summary;

-- CREATE OR REPLACE não remove coluna: recria a view como era (16 colunas,
-- security_invoker, grants e comentário de 20260921030000).
DROP VIEW IF EXISTS public.minerador_keywords_listagem;
CREATE VIEW public.minerador_keywords_listagem WITH (security_invoker = true) AS
SELECT k.id, k.keyword, k.location, k.results_allintitle, k.volume_search, k.kgr_score, k.intent, k.status,
  k.created_at, k.lista_id,
  (((k.analise_semantica #- '{discovery_import,sourceSnapshot,metrics,monthlySearchVolumes}'::text[])
    #- '{volume_measurement,monthlySearchVolumes}'::text[])
    #- '{dataforseo_keyword_overview_history}'::text[])
    #- '{allintitle_measurement_history}'::text[] AS analise_semantica,
  k.volume_source, k.brand_id, k.deleted_at, k.purge_after, k.deleted_by
FROM public.minerador_keywords k;
REVOKE ALL PRIVILEGES ON TABLE public.minerador_keywords_listagem FROM PUBLIC, anon;
GRANT SELECT ON public.minerador_keywords_listagem TO authenticated, service_role;
COMMENT ON VIEW public.minerador_keywords_listagem IS
  'Mesma forma de linha de minerador_keywords, sem as séries de medição (209 kB/carregamento). O detalhe é hidratado ao expandir. security_invoker: a RLS continua sendo a da tabela.';

ALTER TABLE public.minerador_keywords DROP CONSTRAINT IF EXISTS fk_minerador_keywords_group;
DROP INDEX IF EXISTS public.ix_minerador_keywords_group;
ALTER TABLE public.minerador_keywords DROP COLUMN IF EXISTS group_id;

DROP TABLE IF EXISTS public.editorial_group_events;
DROP FUNCTION IF EXISTS public.editorial_group_events_append_only();
DROP TABLE IF EXISTS public.editorial_group_articles;
DROP TABLE IF EXISTS public.editorial_groups;

DO $$
BEGIN
  IF to_regclass('public.editorial_groups') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'minerador_keywords' AND column_name = 'group_id') THEN
    RAISE EXCEPTION 'GRUPOS_ROLLBACK_POS: sobrou estrutura de grupo.';
  END IF;
  IF (SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'minerador_keywords_listagem')
     IS DISTINCT FROM ARRAY['id','keyword','location','results_allintitle','volume_search','kgr_score','intent',
       'status','created_at','lista_id','analise_semantica','volume_source','brand_id','deleted_at','purge_after','deleted_by'] THEN
    RAISE EXCEPTION 'GRUPOS_ROLLBACK_POS: listagem não voltou às 16 colunas.';
  END IF;
  IF (SELECT array_to_string(reloptions, ',') FROM pg_class WHERE oid = 'public.minerador_keywords_listagem'::regclass)
     IS DISTINCT FROM 'security_invoker=true' THEN
    RAISE EXCEPTION 'GRUPOS_ROLLBACK_POS: listagem sem security_invoker.';
  END IF;
END $$;

COMMIT;
