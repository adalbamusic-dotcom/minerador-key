BEGIN;

-- =============================================================================
-- RADAR / VÍDEOS — GATE 2.4 — TRANSCRIPT PÚBLICO DO YOUTUBE (BEST EFFORT)
--
-- O QUE MUDA: existe uma via nova de aquisição de texto — o endpoint público de
-- legendas do YouTube, o mesmo que o player do site usa. Ela NÃO é a YouTube
-- Data API, não tem contrato de estabilidade, e por isso tem PROVENIÊNCIA
-- PRÓPRIA. Gravar este texto como `OWNED_YOUTUBE_CAPTION` ou como se tivesse
-- vindo da API mentiria sobre a origem da evidência daqui a dois anos.
--
-- ADITIVA POR OBRIGAÇÃO. `20260911180000` está APLICADA: os dois CHECK que
-- precisam crescer nasceram lá e não são editados aqui. Esta migration os
-- substitui por versões ampliadas, sem tocar em nenhuma linha existente.
--
-- NADA É INVALIDADO. Todo valor aceito antes continua aceito; o que muda é que
-- dois valores novos passam a ser aceitos também.
--
-- REEXECUTÁVEL. Toda DDL é idempotente ou guardada — a lição de 20260912100000.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · A PROVENIÊNCIA DO TEXTO ACEITA A VIA NOVA
--
-- `DROP ... IF EXISTS` seguido de `ADD` é o mesmo padrão que a própria
-- 20260911180000 usa para este CHECK, e é o que torna esta migration segura de
-- repetir.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_video_source_texts
  DROP CONSTRAINT IF EXISTS radar_video_source_texts_source_method_check;
ALTER TABLE public.radar_video_source_texts
  DROP CONSTRAINT IF EXISTS ck_radar_video_text_source_method;
ALTER TABLE public.radar_video_source_texts
  ADD CONSTRAINT ck_radar_video_text_source_method CHECK (source_method IN (
    'USER_PROVIDED_TRANSCRIPT',
    'OWNED_YOUTUBE_CAPTION',
    'MEDIA_FILE_TO_SPEECH',
    'STORED_AUDIO_TO_SPEECH',
    -- Endpoint público de legendas do YouTube. NÃO é API oficial: é best
    -- effort, e o `provider` carrega o pacote e a versão que o obteve.
    'PUBLIC_YOUTUBE_TRANSCRIPT_UNOFFICIAL'
  ));

-- ---------------------------------------------------------------------------
-- 2 · O ESTADO "TENTAMOS E NÃO EXISTE LEGENDA"
--
-- Diferente de `TEXT_ACQUISITION_UNAVAILABLE`, que é saber ANTES de tentar que
-- não há via. Aqui houve tentativa e a resposta foi "este vídeo não tem
-- legenda pública" — e isso NÃO é falha: a fonte continua registrada, e as
-- duas saídas humanas (enviar áudio, informar transcrição) seguem abertas.
--
-- Colapsar isto em `FAILED_*` faria o retry insistir para sempre em algo que
-- não depende de repetir.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_video_sources
  DROP CONSTRAINT IF EXISTS ck_radar_video_source_text_state;
ALTER TABLE public.radar_video_sources
  ADD CONSTRAINT ck_radar_video_source_text_state CHECK (text_state IN (
    'REGISTERED',
    'METADATA_READY',
    'TEXT_ACQUISITION_UNAVAILABLE',
    'PUBLIC_TRANSCRIPT_UNAVAILABLE',
    'QUEUED', 'PROCESSING', 'TEXT_READY',
    'FAILED_RETRYABLE', 'FAILED_FINAL'
  ));

COMMENT ON COLUMN public.radar_video_source_texts.provider IS
  'Quem produziu este texto. Para a via publica do YouTube inclui o pacote e a versao (ex.: youtube-transcript@1.3.1), porque o endpoint nao e oficial e o comportamento muda entre versoes.';

COMMIT;
