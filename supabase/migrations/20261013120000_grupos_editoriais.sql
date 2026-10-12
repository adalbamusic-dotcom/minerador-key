-- =============================================================================
-- GRUPOS EDITORIAIS (etiquetas por cor) — M1
-- SDD: docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md, §7.1
-- (aprovada pelo dono em 2026-10-12; fase F1, dono do módulo: Minerador).
--
-- ESTADO: NÃO APLICADA. O código da F1 funciona sem ela (a tela esconde o
-- seletor de grupo e o Minerador lê como antes); ela só liga o recurso.
--
-- APLICAÇÃO (somente pelo dono, nesta ordem):
--
--   1. Ensaio (não grava nada): copie este arquivo, troque o `COMMIT;` do fim
--      por `RAISE EXCEPTION 'ENSAIO';` dentro de um DO $$ BEGIN … END $$; e rode
--      a cópia com `npx supabase db query --linked -f <copia>`. O erro 'ENSAIO'
--      prova que guardas, criação e pós-checagem passaram; tudo é desfeito.
--   2. npx supabase db query --linked -f supabase/migrations/20261013120000_grupos_editoriais.sql
--   3. npx supabase migration repair --status applied 20261013120000 --linked
--
-- Nunca `supabase db push` (só parte das migrations consta no histórico remoto).
-- Rollback: supabase/rollback/20261013120000_grupos_editoriais.rollback.sql
--
-- O QUE FAZ
--   - editorial_groups (nome + cor + origem + status + plano do Silo, F4);
--   - editorial_group_articles (grupo de um artigo; preenchida na F2);
--   - editorial_group_events (histórico append-only do grupo);
--   - minerador_keywords.group_id (a etiqueta da keyword), com FK composta
--     (group_id, brand_id) → editorial_groups(id, marca_id): grupo de outra
--     marca é recusado pelo banco;
--   - minerador_keywords_listagem ganha group_id NO FIM (CREATE OR REPLACE);
--   - editorial_group_summary (contagens para o seletor, sem payload).
--
-- O QUE NÃO FAZ
--   Não muda nenhum dado existente (group_id nasce nulo = "Sem grupo"), não
--   mexe em analise_semantica (o grupo fica FORA do hash do pacote aprovado),
--   não muda RLS nem grants de minerador_keywords, não cria gatilho nela.
--   Escrita nas tabelas novas: só service_role (servidor, depois da
--   autorização da rota). `authenticated` só lê, pela RLS da marca.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.can_access_brand(uuid)') IS NULL THEN
    RAISE EXCEPTION 'GRUPOS_PRE: public.can_access_brand(uuid) ausente.';
  END IF;
  IF to_regclass('public.editorial_groups') IS NOT NULL THEN
    RAISE EXCEPTION 'GRUPOS_PRE: editorial_groups já existe (migration aplicada?).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'minerador_keywords' AND column_name = 'group_id') THEN
    RAISE EXCEPTION 'GRUPOS_PRE: minerador_keywords.group_id já existe.';
  END IF;
  -- Conferido por SELECT em 2026-10-12: 16 colunas, sem row_version.
  IF (SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'minerador_keywords_listagem')
     IS DISTINCT FROM ARRAY['id','keyword','location','results_allintitle','volume_search','kgr_score','intent',
       'status','created_at','lista_id','analise_semantica','volume_source','brand_id','deleted_at','purge_after','deleted_by'] THEN
    RAISE EXCEPTION 'GRUPOS_PRE: colunas de minerador_keywords_listagem divergem do esperado.';
  END IF;
  -- A poda das quatro séries (MEASUREMENT_SERIES_PATHS) tem de estar na view:
  -- recriá-la daqui sem a poda apagaria a economia de 20260921030000.
  IF position('{allintitle_measurement_history}' IN pg_get_viewdef('public.minerador_keywords_listagem'::regclass, true)) = 0 THEN
    RAISE EXCEPTION 'GRUPOS_PRE: a poda de séries da view mudou; recriar a view daqui apagaria a mudança.';
  END IF;
END $$;

CREATE TABLE public.editorial_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  color text NOT NULL CHECK (color IN ('amarelo', 'azul', 'verde', 'lima', 'laranja')),
  origin text NOT NULL CHECK (origin IN ('declared_plan', 'manual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  plan jsonb CHECK (plan IS NULL OR jsonb_typeof(plan) = 'object'),
  plan_version integer NOT NULL DEFAULT 0 CHECK (plan_version >= 0),
  plan_hash text CHECK (plan_hash IS NULL OR char_length(plan_hash) BETWEEN 1 AND 128),
  silo_id text CHECK (silo_id IS NULL OR char_length(btrim(silo_id)) BETWEEN 1 AND 256),
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_editorial_groups_id_marca UNIQUE (id, marca_id),
  CONSTRAINT ck_editorial_groups_plan_origin CHECK (plan IS NULL OR origin = 'declared_plan')
);
CREATE UNIQUE INDEX uq_editorial_groups_active_name
  ON public.editorial_groups (marca_id, lower(btrim(name))) WHERE status = 'active';
CREATE UNIQUE INDEX uq_editorial_groups_silo
  ON public.editorial_groups (marca_id, silo_id) WHERE silo_id IS NOT NULL;
COMMENT ON TABLE public.editorial_groups IS
  'Grupo editorial (etiqueta por cor) da marca. Organização, não significado: mudar nome, cor ou grupo não muda hash de pacote nem gera versão. SDD 2026-10-12 (plano declarado e grupos).';

CREATE TABLE public.editorial_group_articles (
  marca_id uuid NOT NULL,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) BETWEEN 1 AND 256),
  group_id uuid NOT NULL,
  origin text NOT NULL CHECK (origin IN ('subject', 'principal', 'keywords', 'human')),
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marca_id, article_id),
  CONSTRAINT fk_editorial_group_articles_group
    FOREIGN KEY (group_id, marca_id) REFERENCES public.editorial_groups(id, marca_id) ON DELETE RESTRICT
);
CREATE INDEX ix_editorial_group_articles_group ON public.editorial_group_articles (marca_id, group_id);

CREATE TABLE public.editorial_group_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL,
  group_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'renamed', 'recolored', 'plan_declared', 'plan_changed',
    'keywords_assigned', 'keywords_unassigned', 'article_assigned', 'silo_linked', 'archived', 'reactivated')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_editorial_group_events_group
    FOREIGN KEY (group_id, marca_id) REFERENCES public.editorial_groups(id, marca_id) ON DELETE RESTRICT
);
CREATE INDEX ix_editorial_group_events_group ON public.editorial_group_events (marca_id, group_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.editorial_group_events_append_only()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'editorial_group_events_is_append_only';
END;
$$;
REVOKE ALL ON FUNCTION public.editorial_group_events_append_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_editorial_group_events_append_only
  BEFORE UPDATE OR DELETE ON public.editorial_group_events
  FOR EACH ROW EXECUTE FUNCTION public.editorial_group_events_append_only();

-- A etiqueta da keyword. Fora de analise_semantica de propósito: não entra no
-- hash do pacote aprovado. FK composta impede grupo de outra marca.
ALTER TABLE public.minerador_keywords ADD COLUMN group_id uuid;
ALTER TABLE public.minerador_keywords
  ADD CONSTRAINT fk_minerador_keywords_group
  FOREIGN KEY (group_id, brand_id) REFERENCES public.editorial_groups(id, marca_id) ON DELETE RESTRICT;
CREATE INDEX ix_minerador_keywords_group
  ON public.minerador_keywords (brand_id, group_id) WHERE deleted_at IS NULL;
COMMENT ON COLUMN public.minerador_keywords.group_id IS
  'Grupo editorial da keyword (etiqueta por cor). Nulo = Sem grupo. Escritor único: assignKeywordGroupWithCore (lib/minerador/keyword-group-core.ts). Não entra no hash do pacote aprovado.';

-- Listagem: mesmas colunas, `group_id` acrescentado no fim (CREATE OR REPLACE
-- aceita coluna nova no fim e preserva dono, grants e comentário).
-- `WITH (security_invoker = true)` é repetido de propósito: o REPLACE troca as
-- opções da view pelas informadas, e sem ele a RLS seria contornada.
CREATE OR REPLACE VIEW public.minerador_keywords_listagem WITH (security_invoker = true) AS
SELECT k.id, k.keyword, k.location, k.results_allintitle, k.volume_search, k.kgr_score, k.intent, k.status,
  k.created_at, k.lista_id,
  (((k.analise_semantica #- '{discovery_import,sourceSnapshot,metrics,monthlySearchVolumes}'::text[])
    #- '{volume_measurement,monthlySearchVolumes}'::text[])
    #- '{dataforseo_keyword_overview_history}'::text[])
    #- '{allintitle_measurement_history}'::text[] AS analise_semantica,
  k.volume_source, k.brand_id, k.deleted_at, k.purge_after, k.deleted_by,
  k.group_id
FROM public.minerador_keywords k;
GRANT SELECT ON public.minerador_keywords_listagem TO authenticated, service_role;

-- Resumo leve para o seletor: contagens, sem payload.
CREATE VIEW public.editorial_group_summary WITH (security_invoker = true) AS
SELECT g.id, g.marca_id, g.name, g.color, g.origin, g.status, g.silo_id, g.plan_version, g.lock_version, g.updated_at,
  (SELECT count(*) FROM public.minerador_keywords k
    WHERE k.group_id = g.id AND k.brand_id = g.marca_id AND k.deleted_at IS NULL) AS keyword_count,
  (SELECT count(*) FROM public.editorial_group_articles a
    WHERE a.group_id = g.id AND a.marca_id = g.marca_id) AS article_count
FROM public.editorial_groups g;

ALTER TABLE public.editorial_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_group_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_group_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.editorial_groups, public.editorial_group_articles,
  public.editorial_group_events FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.editorial_group_summary FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.editorial_groups, public.editorial_group_articles,
  public.editorial_group_events, public.editorial_group_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.editorial_groups, public.editorial_group_articles TO service_role;
GRANT SELECT, INSERT ON TABLE public.editorial_group_events TO service_role;
GRANT SELECT ON TABLE public.editorial_group_summary TO service_role;
GRANT DELETE ON TABLE public.editorial_group_articles TO service_role;

CREATE POLICY editorial_groups_select ON public.editorial_groups
  FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));
CREATE POLICY editorial_group_articles_select ON public.editorial_group_articles
  FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));
CREATE POLICY editorial_group_events_select ON public.editorial_group_events
  FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.editorial_groups', 'SELECT')
     OR has_table_privilege('anon', 'public.editorial_group_summary', 'SELECT')
     OR has_table_privilege('authenticated', 'public.editorial_groups', 'INSERT')
     OR has_table_privilege('authenticated', 'public.editorial_groups', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.editorial_group_events', 'INSERT') THEN
    RAISE EXCEPTION 'GRUPOS_POS: privilégios fora do contrato.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'minerador_keywords_listagem' AND column_name = 'group_id') THEN
    RAISE EXCEPTION 'GRUPOS_POS: listagem sem group_id.';
  END IF;
  IF (SELECT array_to_string(reloptions, ',') FROM pg_class WHERE oid = 'public.minerador_keywords_listagem'::regclass)
     IS DISTINCT FROM 'security_invoker=true' THEN
    RAISE EXCEPTION 'GRUPOS_POS: listagem sem security_invoker.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.editorial_groups'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.editorial_group_articles'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.editorial_group_events'::regclass) THEN
    RAISE EXCEPTION 'GRUPOS_POS: RLS desligada numa tabela de grupo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_minerador_keywords_group'
                 AND conrelid = 'public.minerador_keywords'::regclass) THEN
    RAISE EXCEPTION 'GRUPOS_POS: FK composta de minerador_keywords.group_id ausente.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.minerador_keywords WHERE group_id IS NOT NULL) THEN
    RAISE EXCEPTION 'GRUPOS_POS: keyword com grupo logo após criar a coluna.';
  END IF;
END $$;

COMMIT;
