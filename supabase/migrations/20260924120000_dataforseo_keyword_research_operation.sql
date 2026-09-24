-- Pesquisa por Assunto (SDD docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md, F1b.8 e seção 6).
--
-- Catálogo do ledger, e só isso:
--   1. amplia o CHECK de public.integration_capabilities.operation_kind com
--      'keyword_research' (os 11 valores vigentes + 1 = 12);
--   2. insere a capability 'dataforseo.keyword_research' (production, request,
--      active) com ON CONFLICT (capability_key) DO NOTHING.
-- Nenhuma tabela, coluna, RLS, credencial ou dado de keyword muda.
--
-- ORDEM: aplicar ANTES do deploy do código da F1b. Com o código no ar e sem
-- esta migration, o bootstrap do Admin tenta inserir a capability nova, o
-- CHECK recusa com 23514 e o bootstrap aborta. Aplicação pelo procedimento
-- vigente do usuário (db query -f + migration repair). Nunca db push.
--
-- VERIFICAÇÃO (somente leitura, depois de aplicar):
--   SELECT capability_key, operation_kind, environment, unit_name, status
--     FROM public.integration_capabilities
--    WHERE capability_key = 'dataforseo.keyword_research';
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.integration_capabilities'::regclass
--      AND contype = 'c'
--      AND pg_get_constraintdef(oid) ILIKE '%operation_kind%';
--   Esperado: uma linha 'dataforseo.keyword_research' / 'keyword_research' /
--   'production' / 'request' / 'active', e UM CHECK de operation_kind, com
--   'keyword_research' entre os 12 valores.
--
-- ROLLBACK (só DEPOIS do rollback do código — o modo homologação não confere o
-- status da capability, então com o código no ar os eventos continuam sendo
-- gravados): a capability NUNCA é apagada, porque os eventos append-only de
-- integration_usage_events apontam para ela por capability_id. Ela passa a
-- 'disabled', um dos três valores aceitos pelo CHECK de status:
--   UPDATE public.integration_capabilities
--      SET status = 'disabled', updated_at = now()
--    WHERE capability_key = 'dataforseo.keyword_research';
-- O CHECK ampliado de operation_kind fica e é inofensivo; voltar a 11 valores
-- exigiria que nenhuma linha usasse 'keyword_research'.

BEGIN;

DO $$
DECLARE
  existing_check record;
BEGIN
  IF to_regclass('public.integration_capabilities') IS NULL THEN
    RAISE EXCEPTION 'INTEGRATIONS_CAPABILITIES_TABLE_MISSING';
  END IF;

  -- Remove todo CHECK de operation_kind antes de recriar: nenhum resto de
  -- CHECK antigo pode continuar recusando o valor novo.
  FOR existing_check IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.integration_capabilities'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%operation_kind%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.integration_capabilities DROP CONSTRAINT %I',
      existing_check.conname
    );
  END LOOP;

  ALTER TABLE public.integration_capabilities
    ADD CONSTRAINT ck_integration_capabilities_operation_kind_keyword_research
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
      'telegram_file_fetch',
      'keyword_research'
    ));
END
$$;

INSERT INTO public.integration_capabilities (capability_key, operation_kind, environment, unit_name, status)
VALUES ('dataforseo.keyword_research', 'keyword_research', 'production', 'request', 'active')
ON CONFLICT (capability_key) DO NOTHING;

COMMIT;
