BEGIN;

-- =============================================================================
-- RADAR / VÍDEOS — GATE 2 — TEXTO ORIGINAL PRESERVADO
--
-- MODELO HÍBRIDO, como a auditoria do Gate 0 recomendou.
--
--   GCS          o artefato bruto (mídia, legenda ou transcrição original),
--                sob prefixo DURÁVEL — nunca `temporary/`.
--   PostgreSQL   identidade, estado, idioma, hashes, o texto e os segmentos.
--
-- POR QUE O TEXTO FICA NO POSTGRES, e não só no Storage: é ele que a aplicação
-- consulta. O que NÃO pode acontecer é o texto entrar em
-- `editorial_workflow_items.payload`, que é lido INTEIRO a cada render da
-- planilha — os campos do contrato de análise são limitados a 600–4000
-- caracteres exatamente por isso. Uma transcrição de uma hora ali degradaria
-- toda a tela.
--
-- O ORIGINAL NUNCA É SOBRESCRITO — §5. Tradução é camada derivada e não existe
-- nesta fase; quando existir, será outra linha, nunca um UPDATE desta.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.radar_video_source_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  video_source_id uuid NOT NULL,

  -- Qual camada este registro é. `ORIGINAL_TRANSCRIPT` é a única desta fase;
  -- o enum nasce com o nome para que a tradução futura não precise migrar a
  -- semântica da coluna.
  content_kind text NOT NULL DEFAULT 'ORIGINAL_TRANSCRIPT'
    CHECK (content_kind IN ('ORIGINAL_TRANSCRIPT')),

  -- POR QUAL CAMINHO LEGÍTIMO O TEXTO CHEGOU.
  --
  -- Corrigido no Gate 2.1, ANTES da aplicação: a lista anterior aceitava
  -- 'MEDIA_DOWNLOAD_THEN_SPEECH' e 'LICENSED_TRANSCRIPT_PROVIDER', que
  -- pressupunham um downloader e um provider externo. Nenhum dos dois existe
  -- nem será usado — a decisão vigente é operar sobre as Connections Google
  -- que a Plataforma já tem.
  --
  -- A proveniência importa: um texto que o humano forneceu NÃO pode ser
  -- gravado como se tivesse vindo da API.
  source_method text NOT NULL CHECK (source_method IN (
    'USER_PROVIDED_TRANSCRIPT',
    'OWNED_YOUTUBE_CAPTION',
    'MEDIA_FILE_TO_SPEECH',
    'STORED_AUDIO_TO_SPEECH'
  )),
  provider text CHECK (provider IS NULL OR char_length(btrim(provider)) BETWEEN 1 AND 80),

  -- O IDIOMA ORIGINAL, preservado. Nada é traduzido nesta fase, e quando for,
  -- o original continua sendo esta linha.
  language_code text CHECK (language_code IS NULL OR char_length(btrim(language_code)) BETWEEN 2 AND 20),

  transcript_text text NOT NULL CHECK (char_length(transcript_text) > 0),

  -- Trechos com tempo REAL do provider. `[]` quando não houve tempo: o
  -- `has_timestamps` diz qual dos dois casos é, e nenhum tempo é estimado.
  segments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(segments) = 'array'),
  has_timestamps boolean NOT NULL DEFAULT false,

  -- O artefato bruto no Storage durável, quando existe.
  original_asset_uri text,
  content_hash text NOT NULL CHECK (char_length(btrim(content_hash)) BETWEEN 1 AND 128),
  processing_version integer NOT NULL DEFAULT 1 CHECK (processing_version >= 1),

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_radar_video_text_source_brand
    FOREIGN KEY (brand_id, video_source_id)
    REFERENCES public.radar_video_sources (brand_id, id)
    ON DELETE RESTRICT,

  -- APPEND-ONLY POR VERSÃO DE PROCESSAMENTO: reprocessar cria uma linha nova,
  -- não sobrescreve a anterior. O original de ontem continua auditável.
  CONSTRAINT uq_radar_video_text_version UNIQUE (video_source_id, content_kind, processing_version)
);

-- `ADD CONSTRAINT` não aceita IF NOT EXISTS, e esta migration vai ser aplicada
-- FORA DE ORDEM: `20260912100000` já rodou neste banco. Sem o guarda, uma
-- segunda execução morreria nesta linha sem dizer nada sobre o que falta —
-- exatamente o que já aconteceu uma vez aqui. Mesmo padrão de `0005`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.radar_video_source_texts'::regclass
       AND conname = 'uq_radar_video_source_texts_brand_id'
  ) THEN
    ALTER TABLE public.radar_video_source_texts
      ADD CONSTRAINT uq_radar_video_source_texts_brand_id UNIQUE (brand_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_radar_video_texts_source
  ON public.radar_video_source_texts (brand_id, video_source_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- O ESTADO DO TEXTO VIVE NA FONTE — autoridade única (§11).
--
-- A UI não deduz estado pela existência de uma string de transcript: ela lê
-- esta coluna. Sem isso, "tem texto" e "está pronto" seriam a mesma pergunta,
-- e um processamento a meio caminho pareceria concluído.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_video_sources
  ADD COLUMN IF NOT EXISTS text_state text NOT NULL DEFAULT 'REGISTERED';

ALTER TABLE public.radar_video_sources
  DROP CONSTRAINT IF EXISTS ck_radar_video_source_text_state;
ALTER TABLE public.radar_video_sources
  ADD CONSTRAINT ck_radar_video_source_text_state CHECK (text_state IN (
    'REGISTERED',
    -- Metadados públicos obtidos; o texto continua não existindo. São coisas
    -- diferentes, e um estado só não conseguiria dizer as duas.
    'METADATA_READY',
    -- NÃO É FALHA: é a configuração atual não ter via autorizada de aquisição,
    -- sabido ANTES de tentar. Como FAILED_*, o retry o traria de volta para
    -- sempre por algo que nunca teve caminho.
    'TEXT_ACQUISITION_UNAVAILABLE',
    'QUEUED', 'PROCESSING', 'TEXT_READY',
    'FAILED_RETRYABLE', 'FAILED_FINAL'
  ));

ALTER TABLE public.radar_video_sources
  ADD COLUMN IF NOT EXISTS text_state_reason text;

-- ---------------------------------------------------------------------------
-- OS METADADOS PÚBLICOS — §7.
--
-- É o que a YouTube Data API alcança com a API key atual, e é obtido por AÇÃO
-- EXPLÍCITA: nenhuma coleta acontece no F5. Obter metadado não inicia
-- transcrição, e as colunas ficam na PRÓPRIA fonte porque descrevem a fonte,
-- não um processamento dela.
--
-- `metadata_fetched_at` é a autoridade de "já foi obtido": um título nulo pode
-- significar tanto "não buscamos" quanto "o vídeo não tem", e as duas coisas
-- exigem respostas diferentes na tela.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_video_sources
  ADD COLUMN IF NOT EXISTS metadata_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_title text,
  ADD COLUMN IF NOT EXISTS channel_id text,
  ADD COLUMN IF NOT EXISTS channel_title text,
  ADD COLUMN IF NOT EXISTS video_description text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration text,
  ADD COLUMN IF NOT EXISTS thumbnails jsonb;

-- ---------------------------------------------------------------------------
-- A MÍDIA QUE A MARCA ENVIOU — §4 do Gate 2.2.
--
-- Guarda o `gs://` do objeto no prefixo DURÁVEL, e é ela que faz a capability
-- `MEDIA_FILE_TO_SPEECH` existir para uma fonte. O arquivo em si fica no
-- Storage; aqui mora a identidade dele.
--
-- Nenhum download: esta coluna só é preenchida quando um humano envia o
-- arquivo deliberadamente.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_video_sources
  ADD COLUMN IF NOT EXISTS uploaded_media_uri text,
  ADD COLUMN IF NOT EXISTS uploaded_media_content_type text,
  ADD COLUMN IF NOT EXISTS uploaded_media_checksum text,
  ADD COLUMN IF NOT EXISTS uploaded_media_at timestamptz;

ALTER TABLE public.radar_video_sources
  DROP CONSTRAINT IF EXISTS ck_radar_video_source_uploaded_media;
ALTER TABLE public.radar_video_sources
  ADD CONSTRAINT ck_radar_video_source_uploaded_media
    -- O objeto durável nunca mora em temporary/: aquele prefixo é descartável
    -- por desenho, e o original de uma fonte deliberada precisa sobreviver.
    CHECK (uploaded_media_uri IS NULL OR uploaded_media_uri LIKE 'gs://%/brand/%/radar/videos/%');

ALTER TABLE public.radar_video_sources
  DROP CONSTRAINT IF EXISTS ck_radar_video_source_thumbnails;
ALTER TABLE public.radar_video_sources
  ADD CONSTRAINT ck_radar_video_source_thumbnails
    CHECK (thumbnails IS NULL OR jsonb_typeof(thumbnails) = 'object');

-- ---------------------------------------------------------------------------
-- A FILA EXISTENTE APRENDE VÍDEO — a MENOR evolução possível (§10).
--
-- Nenhuma segunda fila. O claim com `FOR UPDATE SKIP LOCKED`, o lease, o
-- heartbeat, o retry e o backoff continuam sendo os mesmos, provados pela
-- fundação do Especialista.
--
-- O vínculo é com `radar_video_sources`, NUNCA com `expert_contributions`:
-- vídeo deliberado e contribuição de especialista são entidades semânticas
-- diferentes, e acoplá-las faria a fila mentir sobre o que está processando.
-- ---------------------------------------------------------------------------
ALTER TABLE public.external_processing_jobs
  ADD COLUMN IF NOT EXISTS video_source_id uuid;

ALTER TABLE public.external_processing_jobs
  DROP CONSTRAINT IF EXISTS fk_external_job_video_source_brand;
ALTER TABLE public.external_processing_jobs
  ADD CONSTRAINT fk_external_job_video_source_brand
    FOREIGN KEY (brand_id, video_source_id)
    REFERENCES public.radar_video_sources (brand_id, id)
    ON DELETE RESTRICT;

ALTER TABLE public.external_processing_jobs
  DROP CONSTRAINT IF EXISTS external_processing_jobs_job_kind_check;
ALTER TABLE public.external_processing_jobs
  ADD CONSTRAINT external_processing_jobs_job_kind_check CHECK (job_kind IN (
    'telegram_media_preservation',
    'speech_transcription',
    'document_extraction',
    'radar_video_text_acquisition'
  ));

-- IDEMPOTÊNCIA (§12): a fila do Especialista dedupe por `contribution_id`; a de
-- vídeo precisa do mesmo por fonte. Parcial e por versão de processamento, para
-- que um reprocessamento deliberado continue possível.
CREATE UNIQUE INDEX IF NOT EXISTS uq_external_job_video_source_active
  ON public.external_processing_jobs (video_source_id, job_kind)
  WHERE video_source_id IS NOT NULL
    AND status IN ('RECEIVED', 'PENDING_LOCAL_PROCESSING', 'PROCESSING', 'FAILED_RETRYABLE');

-- Um job de vídeo aponta para a fonte; um job do Especialista, para a
-- contribuição. Nunca os dois, nunca nenhum.
ALTER TABLE public.external_processing_jobs
  DROP CONSTRAINT IF EXISTS ck_external_job_subject;
ALTER TABLE public.external_processing_jobs
  ADD CONSTRAINT ck_external_job_subject CHECK (
    (job_kind = 'radar_video_text_acquisition' AND video_source_id IS NOT NULL AND contribution_id IS NULL)
    OR (job_kind <> 'radar_video_text_acquisition' AND video_source_id IS NULL)
  );

-- ---------------------------------------------------------------------------
-- SEGURANÇA — o mesmo padrão das demais tabelas editoriais.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_video_source_texts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.radar_video_source_texts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.radar_video_source_texts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.radar_video_source_texts TO service_role;

DROP POLICY IF EXISTS radar_video_source_texts_select ON public.radar_video_source_texts;
CREATE POLICY radar_video_source_texts_select
  ON public.radar_video_source_texts FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

COMMENT ON TABLE public.radar_video_source_texts IS
  'Texto original preservado de uma fonte de video do Radar, obtido por caminho legitimo (transcricao fornecida pelo humano, legenda do proprio canal, ou Speech sobre midia da marca no Storage). Append-only por processing_version: o original nunca e sobrescrito, e traducao sera camada derivada propria.';

COMMIT;
