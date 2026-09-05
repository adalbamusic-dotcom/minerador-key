-- Fundação local de entradas Telegram e processamento externo.
-- NÃO aplicar remotamente nesta etapa.
-- Não cria secrets, bucket, webhook ou dados de homologação.

BEGIN;

DO $$
DECLARE
  existing_check_name text;
BEGIN
  IF to_regclass('public.integration_capabilities') IS NULL THEN
    RAISE EXCEPTION 'TELEGRAM_FOUNDATION_INTEGRATIONS_CAPABILITIES_MISSING';
  END IF;

  SELECT conname
    INTO existing_check_name
    FROM pg_constraint
   WHERE conrelid = 'public.integration_capabilities'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%operation_kind%'
   ORDER BY CASE
     WHEN conname = 'ck_integration_capabilities_operation_kind_google_cloud_media' THEN 0
     ELSE 1
   END
   LIMIT 1;

  IF existing_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.integration_capabilities DROP CONSTRAINT %I', existing_check_name);
  END IF;

  ALTER TABLE public.integration_capabilities
    ADD CONSTRAINT ck_integration_capabilities_operation_kind_telegram
    CHECK (operation_kind IN (
      'ai_generation',
      'keyword_discovery',
      'keyword_metrics',
      'allintitle',
      'transactional_email',
      'serp_compatibility',
      'speech_transcription',
      'storage_media',
      'youtube_video_metadata',
      'telegram_message_send',
      'telegram_file_fetch'
    ));
END
$$;

CREATE TABLE public.brand_experts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 160),
  specialty text CHECK (specialty IS NULL OR char_length(btrim(specialty)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, id)
);

CREATE INDEX ix_brand_experts_brand_status
  ON public.brand_experts (brand_id, status, display_name);

CREATE TABLE public.telegram_expert_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  expert_id uuid NOT NULL,
  bot_key text NOT NULL DEFAULT 'platform' CHECK (bot_key = 'platform'),
  telegram_user_id text NOT NULL CHECK (char_length(btrim(telegram_user_id)) BETWEEN 1 AND 80),
  telegram_chat_id text NOT NULL CHECK (char_length(btrim(telegram_chat_id)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'suspended')),
  verified_at timestamptz,
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, id),
  CONSTRAINT fk_telegram_binding_expert_brand
    FOREIGN KEY (brand_id, expert_id)
    REFERENCES public.brand_experts (brand_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_telegram_binding_active_user
  ON public.telegram_expert_bindings (bot_key, telegram_user_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX uq_telegram_binding_active_chat
  ON public.telegram_expert_bindings (bot_key, telegram_chat_id)
  WHERE status = 'active';
CREATE INDEX ix_telegram_binding_brand_expert
  ON public.telegram_expert_bindings (brand_id, expert_id, status);

CREATE TABLE public.telegram_onboarding_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  expert_id uuid NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT fk_telegram_onboarding_expert_brand
    FOREIGN KEY (brand_id, expert_id)
    REFERENCES public.brand_experts (brand_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT ck_telegram_onboarding_token_state
    CHECK (expires_at > created_at AND NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_telegram_onboarding_token_hash
  ON public.telegram_onboarding_tokens (token_hash);
CREATE INDEX ix_telegram_onboarding_lookup
  ON public.telegram_onboarding_tokens (brand_id, expert_id, expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE public.expert_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  expert_id uuid NOT NULL,
  article_id text CHECK (article_id IS NULL OR char_length(btrim(article_id)) BETWEEN 1 AND 256),
  article_dna_version_id text CHECK (article_dna_version_id IS NULL OR char_length(btrim(article_dna_version_id)) BETWEEN 1 AND 256),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  radar_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(radar_context) = 'object'),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_to_send', 'awaiting_expert', 'receiving', 'awaiting_review', 'reviewed', 'blocked', 'cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, id),
  CONSTRAINT fk_expert_brief_expert_brand
    FOREIGN KEY (brand_id, expert_id)
    REFERENCES public.brand_experts (brand_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX ix_expert_briefs_brand_status
  ON public.expert_briefs (brand_id, status, updated_at DESC);
CREATE INDEX ix_expert_briefs_expert_status
  ON public.expert_briefs (brand_id, expert_id, status, updated_at DESC);

ALTER TABLE public.telegram_expert_bindings
  ADD COLUMN selected_brief_id uuid;

ALTER TABLE public.telegram_expert_bindings
  ADD CONSTRAINT fk_telegram_binding_selected_brief_brand
  FOREIGN KEY (brand_id, selected_brief_id)
  REFERENCES public.expert_briefs (brand_id, id)
  ON DELETE RESTRICT;

CREATE TABLE public.telegram_brief_selection_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  binding_id uuid NOT NULL REFERENCES public.telegram_expert_bindings(id) ON DELETE RESTRICT,
  brief_id uuid NOT NULL,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CONSTRAINT fk_telegram_selection_binding_brand
    FOREIGN KEY (brand_id, binding_id)
    REFERENCES public.telegram_expert_bindings (brand_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_telegram_selection_brief_brand
    FOREIGN KEY (brand_id, brief_id)
    REFERENCES public.expert_briefs (brand_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT ck_telegram_selection_token_state
    CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX uq_telegram_brief_selection_token_hash
  ON public.telegram_brief_selection_tokens (token_hash);
CREATE INDEX ix_telegram_brief_selection_lookup
  ON public.telegram_brief_selection_tokens (binding_id, expires_at)
  WHERE used_at IS NULL;

CREATE TABLE public.expert_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  expert_id uuid NOT NULL,
  brief_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'telegram' CHECK (provider = 'telegram'),
  bot_key text NOT NULL DEFAULT 'platform' CHECK (bot_key = 'platform'),
  external_update_id text NOT NULL CHECK (char_length(btrim(external_update_id)) BETWEEN 1 AND 80),
  external_message_id text CHECK (external_message_id IS NULL OR char_length(btrim(external_message_id)) BETWEEN 1 AND 80),
  source_type text NOT NULL CHECK (source_type IN ('TEXT', 'VOICE', 'AUDIO', 'DOCUMENT')),
  original_text text,
  telegram_file_id text,
  telegram_file_unique_id text,
  original_file_name text,
  original_content_type text,
  original_file_size bigint CHECK (original_file_size IS NULL OR original_file_size >= 0),
  original_duration_seconds integer CHECK (original_duration_seconds IS NULL OR original_duration_seconds >= 0),
  original_checksum text,
  original_asset_uri text,
  original_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(original_metadata) = 'object'),
  processing_status text NOT NULL DEFAULT 'RECEIVED' CHECK (processing_status IN ('RECEIVED', 'PENDING_LOCAL_PROCESSING', 'PROCESSING', 'EXTRACTED', 'FAILED_RETRYABLE', 'FAILED_FINAL')),
  transcript_text text,
  extraction_payload jsonb CHECK (extraction_payload IS NULL OR jsonb_typeof(extraction_payload) = 'object'),
  organization_payload jsonb CHECK (organization_payload IS NULL OR jsonb_typeof(organization_payload) = 'object'),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_expert_contribution_expert_brand
    FOREIGN KEY (brand_id, expert_id)
    REFERENCES public.brand_experts (brand_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_expert_contribution_brief_brand
    FOREIGN KEY (brand_id, brief_id)
    REFERENCES public.expert_briefs (brand_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT ck_expert_contribution_original_presence
    CHECK (original_text IS NOT NULL OR telegram_file_id IS NOT NULL)
);

CREATE UNIQUE INDEX uq_expert_contribution_update
  ON public.expert_contributions (provider, bot_key, external_update_id);
ALTER TABLE public.expert_contributions
  ADD CONSTRAINT uq_expert_contribution_brand_id UNIQUE (brand_id, id);
CREATE INDEX ix_expert_contributions_brief_received
  ON public.expert_contributions (brand_id, brief_id, received_at ASC);

CREATE TABLE public.external_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  brief_id uuid,
  contribution_id uuid,
  job_kind text NOT NULL CHECK (job_kind IN ('telegram_media_preservation', 'speech_transcription', 'document_extraction')),
  status text NOT NULL DEFAULT 'PENDING_LOCAL_PROCESSING' CHECK (status IN ('RECEIVED', 'PENDING_LOCAL_PROCESSING', 'PROCESSING', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'BLOCKED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_external_job_brief_brand
    FOREIGN KEY (brand_id, brief_id)
    REFERENCES public.expert_briefs (brand_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_external_job_contribution_brand
    FOREIGN KEY (brand_id, contribution_id)
    REFERENCES public.expert_contributions (brand_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT ck_external_job_claim_state
    CHECK ((status = 'PROCESSING' AND claimed_by IS NOT NULL) OR status <> 'PROCESSING')
);

CREATE UNIQUE INDEX uq_external_job_contribution_kind
  ON public.external_processing_jobs (contribution_id, job_kind)
  WHERE contribution_id IS NOT NULL;
CREATE INDEX ix_external_jobs_claimable
  ON public.external_processing_jobs (status, available_at, created_at)
  WHERE status IN ('RECEIVED', 'PENDING_LOCAL_PROCESSING', 'FAILED_RETRYABLE');

CREATE OR REPLACE FUNCTION public.claim_external_processing_job(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.external_processing_jobs
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH candidate AS (
    SELECT j.id
      FROM public.external_processing_jobs AS j
     WHERE j.status IN ('RECEIVED', 'PENDING_LOCAL_PROCESSING', 'FAILED_RETRYABLE')
       AND j.available_at <= now()
       AND (j.lease_expires_at IS NULL OR j.lease_expires_at < now())
       AND j.attempts < j.max_attempts
     ORDER BY j.available_at ASC, j.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  UPDATE public.external_processing_jobs AS j
     SET status = 'PROCESSING',
         claimed_by = NULLIF(btrim(p_worker_id), ''),
         claimed_at = now(),
         heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 3600))),
         attempts = j.attempts + 1,
         updated_at = now()
    FROM candidate
   WHERE j.id = candidate.id
     AND NULLIF(btrim(p_worker_id), '') IS NOT NULL
  RETURNING j.*;
$$;

REVOKE ALL ON FUNCTION public.claim_external_processing_job(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_external_processing_job(text, integer) TO service_role;

CREATE TABLE public.telegram_inbound_updates (
  bot_key text NOT NULL DEFAULT 'platform' CHECK (bot_key = 'platform'),
  external_update_id text NOT NULL CHECK (char_length(btrim(external_update_id)) BETWEEN 1 AND 80),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  telegram_user_id text,
  telegram_chat_id text,
  binding_id uuid REFERENCES public.telegram_expert_bindings(id) ON DELETE RESTRICT,
  brief_id uuid REFERENCES public.expert_briefs(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  PRIMARY KEY (bot_key, external_update_id)
);

CREATE INDEX ix_telegram_updates_received
  ON public.telegram_inbound_updates (received_at DESC);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'brand_experts',
    'telegram_expert_bindings',
    'telegram_onboarding_tokens',
    'expert_briefs',
    'telegram_brief_selection_tokens',
    'expert_contributions',
    'external_processing_jobs',
    'telegram_inbound_updates'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

CREATE POLICY brand_experts_select_telegram_foundation
  ON public.brand_experts FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));
CREATE POLICY telegram_bindings_select_telegram_foundation
  ON public.telegram_expert_bindings FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));
CREATE POLICY expert_briefs_select_telegram_foundation
  ON public.expert_briefs FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));
CREATE POLICY expert_contributions_select_telegram_foundation
  ON public.expert_contributions FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));
CREATE POLICY external_jobs_select_telegram_foundation
  ON public.external_processing_jobs FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

REVOKE ALL PRIVILEGES ON TABLE
  public.telegram_onboarding_tokens,
  public.telegram_brief_selection_tokens,
  public.telegram_inbound_updates
FROM authenticated;

COMMENT ON TABLE public.brand_experts IS 'Especialista de domínio da Marca; não exige login e não é membership de usuário.';
COMMENT ON TABLE public.telegram_expert_bindings IS 'Binding explícito e tenant-safe entre o Bot Telegram global e um especialista da Marca.';
COMMENT ON TABLE public.expert_contributions IS 'Entradas originais do especialista; transcrição e organização são camadas derivadas.';
COMMENT ON TABLE public.external_processing_jobs IS 'Fila durável para Local Worker; webhook não executa processamento pesado.';

COMMIT;
