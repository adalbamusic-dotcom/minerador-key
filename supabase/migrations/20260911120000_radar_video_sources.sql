BEGIN;

-- =============================================================================
-- RADAR / ÁREA VÍDEOS — GATE 1 — FONTES DELIBERADAS PERSISTENTES
--
-- O QUE ESTA MIGRATION RESOLVE.
--
-- Até aqui, "registrar material" na área Vídeos escrevia num `useState` do
-- React e em mais lugar nenhum. A auditoria do Gate 0 mostrou que um F5 apagava
-- tudo — e que a garantia "o RESET da Pesquisa não apaga os vídeos" era
-- verdadeira pelo motivo errado: o reset não os alcançava porque eles já não
-- existiam.
--
-- IDENTIDADE PRÓPRIA, DE PROPÓSITO.
--
-- O invariante 24 separa `Pesquisa → YouTube` (motor competitivo) da área
-- Vídeos (ingestão deliberada). Esta tabela NÃO referencia
-- `YouTubeCompetitiveReference`, referência de SERP ou research reference: o
-- mesmo vídeo pode existir nos dois papéis, e colapsá-los faria "este vídeo
-- concorre comigo" e "decidi usar este vídeo" virarem a mesma afirmação.
--
-- TAMBÉM NÃO É `expert_contributions`. Aquela tabela é contribuição de um
-- especialista, por Telegram, para uma pauta de especialista — `provider` tem
-- CHECK fixo em 'telegram' e as FKs para `brand_experts`/`expert_briefs` são
-- obrigatórias. Um vídeo escolhido pela marca não tem nem especialista nem
-- pauta de especialista.
--
-- ESCOPO. Uma tabela, seus índices e suas policies. NENHUMA outra tabela,
-- NENHUMA alteração em `external_processing_jobs`, NENHUM bucket, NENHUM job.
-- Transcript, arquivo bruto e VideoEvidence ficam explicitamente fora: o shape
-- deles depende do contrato de aquisição textual, que é o Gate 2.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.radar_video_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) BETWEEN 1 AND 256),

  -- Extensível por desenho, fechado por enquanto: a UI deste gate só aceita
  -- YouTube, e oferecer um tipo que o produto não processa seria pior que não
  -- oferecer nenhum.
  source_kind text NOT NULL DEFAULT 'YOUTUBE' CHECK (source_kind IN ('YOUTUBE')),

  -- O que o usuário colou, preservado para ele se reconhecer na lista.
  original_url text NOT NULL CHECK (char_length(btrim(original_url)) BETWEEN 1 AND 2048),
  -- A forma canônica para a qual youtu.be, shorts, embed, live e watch?v
  -- convergem. É ela que a unicidade enxerga.
  normalized_url text NOT NULL CHECK (char_length(btrim(normalized_url)) BETWEEN 1 AND 2048),
  normalized_url_hash text NOT NULL CHECK (char_length(btrim(normalized_url_hash)) BETWEEN 1 AND 128),

  youtube_video_id text CHECK (youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  display_name text CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 300),

  registration_status text NOT NULL DEFAULT 'REGISTERED'
    CHECK (registration_status IN ('REGISTERED', 'ARCHIVED')),

  registered_by uuid,

  -- PROVENIÊNCIA, NÃO AUTORIDADE. Diz de qual fundamento o registro partiu; não
  -- expira a fonte quando o ArticleDNA evolui. Uma decisão deliberada do humano
  -- não caduca porque o artigo ganhou uma versão.
  registration_article_dna_version_id text,
  registration_article_dna_content_hash text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- DEDUPE: marca + artigo + identidade normalizada.
-- A MESMA URL EM OUTRO ARTIGO É OUTRO USO DELIBERADO e continua permitida — a
-- decisão "quero este vídeo neste artigo" é por artigo, não por marca.
CREATE UNIQUE INDEX IF NOT EXISTS uq_radar_video_source_identity
  ON public.radar_video_sources (brand_id, article_id, normalized_url_hash);

CREATE INDEX IF NOT EXISTS ix_radar_video_sources_article
  ON public.radar_video_sources (brand_id, article_id, created_at ASC);

-- FK composta: o padrão do projeto para impedir que uma linha filha aponte
-- para outra marca.
ALTER TABLE public.radar_video_sources
  DROP CONSTRAINT IF EXISTS uq_radar_video_sources_brand_id;
ALTER TABLE public.radar_video_sources
  ADD CONSTRAINT uq_radar_video_sources_brand_id UNIQUE (brand_id, id);

-- ---------------------------------------------------------------------------
-- SEGURANÇA — o mesmo padrão da fundação Telegram/Expert.
--
-- Leitura pelo usuário autenticado, restrita por `can_access_brand`. Escrita
-- somente por `service_role`, que é como as rotas editoriais do projeto
-- gravam depois de checar acesso E permissão de módulo do ator.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_video_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.radar_video_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.radar_video_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.radar_video_sources TO service_role;

DROP POLICY IF EXISTS radar_video_sources_select ON public.radar_video_sources;
CREATE POLICY radar_video_sources_select
  ON public.radar_video_sources FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

COMMENT ON TABLE public.radar_video_sources IS
  'Fontes de vídeo escolhidas deliberadamente pelo humano para um artigo do Radar. Identidade separada da Pesquisa YouTube competitiva (invariante 24). Não guarda transcript, arquivo nem evidência.';

COMMIT;
