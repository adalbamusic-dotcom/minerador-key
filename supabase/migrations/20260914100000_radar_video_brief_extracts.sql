BEGIN;

-- =============================================================================
-- RADAR / VÍDEOS — GATE 3 — O CASAMENTO ENTRE PAUTA E CONTEÚDO
--
-- TRÊS CAMADAS, e esta tabela é a terceira:
--
--   FONTE       pertence à MARCA            radar_video_sources
--   CONTEÚDO    pertence à FONTE            radar_video_source_texts
--   CASAMENTO   pertence ao ARTIGO          esta tabela
--
-- O transcript é reutilizado por todos os artigos que selecionarem a fonte. O
-- RECORTE não é: ele depende das PAUTAS, e as pautas vêm da investigação
-- congelada de um artigo específico. A mesma palestra serve a dez artigos com
-- dez recortes diferentes, sem retranscrever nada.
--
-- POR QUE TABELA PRÓPRIA, e não uma existente:
--
--   `radar_video_source_texts`    é da FONTE; o recorte é do ARTIGO.
--   `editorial_artifact_versions` é o livro dos artefatos canônicos
--                                 (article_dna, content_plan…), com ciclo de
--                                 aprovação próprio. Recorte de vídeo não é
--                                 artefato canônico e não participa dele.
--   `editorial_workflow_items.payload` — inflá-lo é o que este projeto já
--                                 decidiu não fazer.
--
-- NADA AQUI GUARDA TEXTO INVENTADO. `original_text` é a concatenação exata de
-- segmentos gravados, e os tempos são os deles: o domínio recusa qualquer
-- trecho que não ancore em segmento existente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · A EXECUÇÃO DO CASAMENTO
--
-- Recortar de novo NÃO sobrescreve o recorte anterior (§8): cria uma execução
-- nova e marca a anterior como superada. O histórico continua auditável, e
-- nenhuma evidência muda de conteúdo debaixo de quem já a leu.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.radar_video_brief_extract_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) BETWEEN 1 AND 256),

  -- A INVESTIGAÇÃO CONGELADA QUE ORIGINOU AS PAUTAS.
  --
  -- Sem isto o recorte flutuaria: uma investigação nova mudaria as pautas e o
  -- trecho antigo passaria a responder a uma pergunta que ninguém fez.
  frozen_bundle_id text NOT NULL CHECK (char_length(btrim(frozen_bundle_id)) BETWEEN 1 AND 256),
  frozen_bundle_hash text NOT NULL CHECK (char_length(btrim(frozen_bundle_hash)) BETWEEN 1 AND 256),

  -- A IMPRESSÃO DIGITAL DA ENTRADA: fontes selecionadas + versão do transcript
  -- de cada uma. É ela que responde "isto já foi casado com este material?".
  input_fingerprint text NOT NULL CHECK (char_length(btrim(input_fingerprint)) BETWEEN 1 AND 512),

  -- NULL = execução corrente. Preenchido = superada por outra, e preservada.
  superseded_at timestamptz,
  superseded_by uuid REFERENCES public.radar_video_brief_extract_runs(id) ON DELETE RESTRICT,

  matched_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_brief_extract_run_brand_id UNIQUE (brand_id, id)
);

-- ---------------------------------------------------------------------------
-- POR QUE NÃO EXISTE UM ÍNDICE ÚNICO DE "EXECUÇÃO CORRENTE".
--
-- A tentação é um índice parcial sobre `superseded_at IS NULL`. Ele forçaria
-- SUPERAR ANTES DE INSERIR — e aí, se a inserção falhasse no meio, o artigo
-- ficaria sem execução corrente NENHUMA: a tela mostraria zero trechos tendo o
-- recorte anterior inteiro gravado ali do lado. Trocar evidência legível por
-- nada é o pior desfecho possível para uma falha transitória.
--
-- Sem o índice, a ordem passa a ser inserir e depois superar. Uma falha entre
-- as duas deixa DUAS correntes, e a leitura resolve isso sozinha pegando a
-- mais nova — que é exatamente a certa. A invariante que importa nunca é
-- violada: sempre há uma execução corrente legível.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_brief_extract_runs_current
  ON public.radar_video_brief_extract_runs (brand_id, article_id, frozen_bundle_id, created_at DESC)
  WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_brief_extract_runs_article
  ON public.radar_video_brief_extract_runs (brand_id, article_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2 · OS TRECHOS DA EXECUÇÃO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.radar_video_brief_extracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,

  video_brief_id text NOT NULL CHECK (char_length(btrim(video_brief_id)) BETWEEN 1 AND 256),
  video_source_id uuid NOT NULL,

  -- A VERSÃO DO TRANSCRIPT de onde este trecho saiu. Fica na linha, e não só na
  -- execução, porque é dela que a proveniência depende.
  processing_version integer NOT NULL CHECK (processing_version >= 1),

  -- A ÂNCORA: os índices dos segmentos reais que originaram o trecho.
  segment_indexes jsonb NOT NULL
    CHECK (jsonb_typeof(segment_indexes) = 'array' AND jsonb_array_length(segment_indexes) > 0),
  start_ms integer NOT NULL CHECK (start_ms >= 0),
  end_ms integer NOT NULL CHECK (end_ms >= start_ms),

  -- O ORIGINAL, no idioma original. Nada é traduzido nesta fase; quando for, o
  -- original continua sendo esta coluna.
  original_text text NOT NULL CHECK (char_length(original_text) > 0),
  source_language text CHECK (source_language IS NULL OR char_length(btrim(source_language)) BETWEEN 2 AND 20),

  reason_for_relevance text NOT NULL CHECK (char_length(btrim(reason_for_relevance)) > 0),
  matched_questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(matched_questions) = 'array'),
  matched_entities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(matched_entities) = 'array'),

  support_type text NOT NULL CHECK (support_type IN ('ANSWERS_QUESTION', 'MENTIONS_ENTITY', 'COVERS_TOPIC')),
  confidence numeric(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(limitations) = 'array'),

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_brief_extract_run
    FOREIGN KEY (brand_id, run_id)
    REFERENCES public.radar_video_brief_extract_runs (brand_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_brief_extract_source_brand
    FOREIGN KEY (brand_id, video_source_id)
    REFERENCES public.radar_video_sources (brand_id, id)
    ON DELETE RESTRICT,

  -- Dentro de UMA execução, uma janela por pauta+fonte+início. Uma pauta pode
  -- ter várias janelas na mesma fonte, e cada uma é um trecho legítimo.
  CONSTRAINT uq_brief_extract_window UNIQUE (run_id, video_brief_id, video_source_id, start_ms)
);

CREATE INDEX IF NOT EXISTS ix_brief_extracts_run
  ON public.radar_video_brief_extracts (brand_id, run_id, video_brief_id);
CREATE INDEX IF NOT EXISTS ix_brief_extracts_source
  ON public.radar_video_brief_extracts (brand_id, video_source_id);

-- ---------------------------------------------------------------------------
-- 3 · SEGURANÇA — o mesmo padrão das demais tabelas editoriais.
--
-- Sem DELETE em lugar nenhum: recorte superado é histórico, não lixo. E sem
-- UPDATE nos trechos — só a execução muda de estado, para ser superada.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_video_brief_extract_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_video_brief_extracts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.radar_video_brief_extract_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.radar_video_brief_extracts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.radar_video_brief_extract_runs TO authenticated;
GRANT SELECT ON TABLE public.radar_video_brief_extracts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.radar_video_brief_extract_runs TO service_role;
GRANT SELECT, INSERT ON TABLE public.radar_video_brief_extracts TO service_role;

DROP POLICY IF EXISTS radar_video_brief_extract_runs_select ON public.radar_video_brief_extract_runs;
CREATE POLICY radar_video_brief_extract_runs_select
  ON public.radar_video_brief_extract_runs FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS radar_video_brief_extracts_select ON public.radar_video_brief_extracts;
CREATE POLICY radar_video_brief_extracts_select
  ON public.radar_video_brief_extracts FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

COMMENT ON TABLE public.radar_video_brief_extracts IS
  'Trechos de transcript que respondem a uma pauta de video de UM artigo, sob UMA investigacao congelada. O transcript e da fonte e e compartilhado; o recorte e do artigo. Todo trecho e ancorado em segmentos reais: start_ms, end_ms e original_text vem do transcript gravado, nunca de geracao.';

COMMENT ON TABLE public.radar_video_brief_extract_runs IS
  'Uma execucao do casamento pauta x conteudo. Recortar de novo supera a execucao anterior em vez de sobrescreve-la: o historico continua auditavel e nenhuma evidencia muda debaixo de quem ja a leu.';

COMMIT;
