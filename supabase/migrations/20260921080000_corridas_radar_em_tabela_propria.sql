-- ---------------------------------------------------------------------------
-- As corridas brutas do Radar saem de dentro da linha do workflow.
--
-- O PROBLEMA DE ESQUEMA, MEDIDO EM 2026-09-21
--
-- `editorial_workflow_items.payload.analysisVersions[i].payload` carrega as
-- corridas cruas dos providers. A maior linha tem 8032 kB; a media das tres
-- linhas de estagio 'radar' e 3528 kB.
--
-- Isso nao pesa so na listagem (ja resolvida por view em 20260921060000 e
-- 20260921070000). Pesa no CAMINHO DE ESCRITA: `appendRadarAnalysis` le a
-- linha inteira, acrescenta UMA versao e regrava tudo. Cada nova analise
-- custa ~8 MB de descida mais ~8 MB de subida, e cresce a cada rodada.
--
-- O proprio codigo ja registrava isto, em `appendRadarAnalysis`:
--   "Isto NAO resolve o crescimento do payload -- so para de pagar duas vezes
--    por ele. O crescimento e decisao de esquema, e esta reportado."
--
-- Esta e a decisao de esquema.
--
-- O QUE MUDA E O QUE NAO MUDA
--
-- Os quatro campos pesados de cada versao passam a morar aqui. Sao os MESMOS
-- quatro que `pruneRadarAnalysisHistory` ja trata como descartaveis na
-- leitura -- nao e criterio novo, e o criterio que o sistema ja usava:
--
--   extractions, competitiveReport, youtubeSearch, amazonSearch
--
-- O contrato em TS nao muda de forma: `analysisVersions` continua sendo um
-- array no payload, com esses campos vazios. Quem precisa deles recebe a
-- versao reidratada na fronteira do repositorio, e os ~20 modulos que os leem
-- seguem sem alteracao.
--
-- ESTA MIGRATION NAO MUDA COMPORTAMENTO
--
-- Cria a tabela e nada mais. Nada escreve nela, nada le dela ainda; o
-- preenchimento e a troca do repositorio vem em passos proprios, para que
-- cada um possa ser conferido sozinho. A linha do workflow continua intacta.
--
-- RLS espelha `editorial_workflow_items`: SELECT para `authenticated` pela
-- mesma funcao de acesso a marca, escrita pelo service_role.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.radar_analysis_runs (
  workflow_item_id uuid NOT NULL REFERENCES public.editorial_workflow_items(id) ON DELETE CASCADE,
  version_id text NOT NULL,
  marca_id uuid NOT NULL,
  article_id text,
  -- Os quatro campos pesados, com os nomes que tem no contrato. Guardar como
  -- um objeto so -- em vez de quatro colunas -- mantem a reidratacao sendo uma
  -- fusao de chaves, sem traducao de nomes em cada ponta.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (workflow_item_id, version_id)
);

COMMENT ON TABLE public.radar_analysis_runs IS
  'Corridas brutas de cada versao de analise do Radar, fora da linha do workflow. Reidratadas na fronteira do repositorio.';

COMMENT ON COLUMN public.radar_analysis_runs.payload IS
  'Objeto com extractions, competitiveReport, youtubeSearch e amazonSearch -- os mesmos quatro que pruneRadarAnalysisHistory trata como descartaveis na leitura.';

-- A busca por versao acontece sem o item em mao (uma rota recebe o
-- versionId e procura dentro do artigo), entao o version_id tambem indexa.
CREATE INDEX IF NOT EXISTS radar_analysis_runs_version_idx
  ON public.radar_analysis_runs (version_id);

CREATE INDEX IF NOT EXISTS radar_analysis_runs_marca_artigo_idx
  ON public.radar_analysis_runs (marca_id, article_id);

ALTER TABLE public.radar_analysis_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS radar_analysis_runs_select_policy ON public.radar_analysis_runs;
CREATE POLICY radar_analysis_runs_select_policy
  ON public.radar_analysis_runs
  FOR SELECT
  TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

GRANT SELECT ON public.radar_analysis_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.radar_analysis_runs TO service_role;
