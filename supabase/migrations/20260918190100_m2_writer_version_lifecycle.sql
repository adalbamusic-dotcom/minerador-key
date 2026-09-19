-- =============================================================================
-- M2 — LIFECYCLE DAS VERSÕES PRODUZIDAS NO REDATOR
-- =============================================================================
-- Data: 2026-09-18
-- Base: invariantes.md §65-69; sdd-remocao-planejador-e-retencao-48h-2026-09-18.md
--
-- NÃO APLICADA. Arquivo escrito para revisão.
--
-- ================== A REGRA QUE ESTE ARQUIVO TORNA ESTRUTURAL ==================
--
--   PURGE_BY_AGE_ONLY = NO
--   ONLY_AFTER_CONFIRMED_REPLACEMENT = YES
--   RECOVERY_WINDOW_AFTER_REPLACEMENT = 48H
--   DNA_AND_RADAR_RETENTION = OUT_OF_SCOPE
--
-- Idade não apaga nada. `purge_after` é derivado de `superseded_at`, nunca de
-- `created_at`, e o CHECK abaixo RECUSA `purge_after` sem substituição
-- declarada. A regra deixa de depender de o código acertar.
--
-- ================== O QUE ESTE ARQUIVO NÃO TOCA ==================
--
-- `editorial_artifact_versions` — ArticleDNA, KeywordDNA, SiloDNA, SiloPage e
-- artefatos de keyword — fica INTEIRA fora. Ela compartilha a função
-- `pipeline_editorial_protect_append_only` com as duas tabelas do Redator, e é
-- por isso que esta migration **não altera essa função**: cria uma nova e troca
-- o gatilho apenas nas duas tabelas do corte. A proteção append-only do DNA
-- continua exatamente como está, byte por byte.
--
-- Também não toca SERP, evidências, trilhas de decisão nem eventos MCP.
--
-- ================== IMPACTO EM LINHAS ATUAIS ==================
--
-- content_document_versions    0 linhas    → colunas novas, nenhuma preenchida
-- writer_deliverable_versions  0 linhas    → idem
-- writer_deliverables          0 linhas    → backfill de current_version_id no-op
-- content_documents            1 linha     → NÃO é alterada por esta migration
--
-- Nenhuma linha entra em janela de purge pela aplicação desta migration:
-- `superseded_at` nasce NULL em todas, e sem ele não existe `purge_after`.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. `current_version_id` EXPLÍCITO EM `writer_deliverables`
-- =============================================================================
-- `content_documents` já tem a coluna. `writer_deliverables` não tinha, e a
-- versão corrente seria deduzida por `max(version_number)` — frágil exatamente
-- na operação que APAGA as outras: uma leitura errada apagaria a versão viva.
--
-- A FK é DEFERRABLE INITIALLY DEFERRED de propósito: permite que
-- `writer_save_deliverable` grave a linha e a versão na MESMA transação sem
-- precisar de um segundo UPDATE só para apontar o ponteiro — e um segundo
-- UPDATE dispararia o gatilho de `lock_version` de novo, fazendo o readback do
-- cliente divergir do recibo da função.
-- -----------------------------------------------------------------------------
ALTER TABLE public.writer_deliverables
  ADD COLUMN current_version_id uuid;

ALTER TABLE public.writer_deliverables
  ADD CONSTRAINT writer_deliverables_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES public.writer_deliverable_versions(version_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON COLUMN public.writer_deliverables.current_version_id
  IS 'Versão corrente do entregável. RESTRICT: a corrente nunca é purgada. Espelha content_documents.current_version_id.';

-- Backfill defensivo. Hoje são 0 linhas; escrito assim mesmo porque a migration
-- pode ser aplicada num ambiente que já tenha entregáveis.
UPDATE public.writer_deliverables d
   SET current_version_id = v.version_id
  FROM (
    SELECT DISTINCT ON (deliverable_id) deliverable_id, version_id
      FROM public.writer_deliverable_versions
     ORDER BY deliverable_id, version_number DESC
  ) v
 WHERE v.deliverable_id = d.id
   AND d.current_version_id IS DISTINCT FROM v.version_id;

-- =============================================================================
-- 2. COLUNAS DE RETENÇÃO + O CHECK QUE TORNA A REGRA ESTRUTURAL
-- =============================================================================
ALTER TABLE public.content_document_versions
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by_version_id text REFERENCES public.content_document_versions(version_id) ON DELETE RESTRICT,
  ADD COLUMN purge_after timestamptz;

ALTER TABLE public.content_document_versions
  ADD CONSTRAINT content_document_versions_retention_check CHECK (
    (superseded_at IS NULL AND superseded_by_version_id IS NULL AND purge_after IS NULL)
    OR (superseded_at IS NOT NULL AND superseded_by_version_id IS NOT NULL
        AND purge_after = superseded_at + interval '48 hours')
  );

ALTER TABLE public.writer_deliverable_versions
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by_version_id uuid REFERENCES public.writer_deliverable_versions(version_id) ON DELETE RESTRICT,
  ADD COLUMN purge_after timestamptz;

ALTER TABLE public.writer_deliverable_versions
  ADD CONSTRAINT writer_deliverable_versions_retention_check CHECK (
    (superseded_at IS NULL AND superseded_by_version_id IS NULL AND purge_after IS NULL)
    OR (superseded_at IS NOT NULL AND superseded_by_version_id IS NOT NULL
        AND purge_after = superseded_at + interval '48 hours')
  );

-- Índices parciais: a varredura do purge só olha o que já foi substituído.
CREATE INDEX content_document_versions_purge_idx
  ON public.content_document_versions (purge_after)
  WHERE superseded_at IS NOT NULL;

CREATE INDEX writer_deliverable_versions_purge_idx
  ON public.writer_deliverable_versions (purge_after)
  WHERE superseded_at IS NOT NULL;

COMMENT ON COLUMN public.content_document_versions.purge_after
  IS 'Fim da janela de recuperação: superseded_at + 48h. Só existe com substituição declarada — o CHECK recusa o contrário. Idade sozinha nunca cria este valor.';
COMMENT ON COLUMN public.writer_deliverable_versions.purge_after
  IS 'Fim da janela de recuperação: superseded_at + 48h. Só existe com substituição declarada — o CHECK recusa o contrário.';

-- =============================================================================
-- 3. `previous_version_id`: RESTRICT → SET NULL, SÓ NAS DUAS TABELAS DO CORTE
-- =============================================================================
-- A cadeia `previous_version_id` descreve o histórico — e o histórico é
-- exatamente o que deixou de ser permanente. `SET NULL` registra "havia algo
-- aqui, não está mais" em vez de impedir a política.
--
-- `content_documents.current_version_id` e `writer_deliverables.current_version_id`
-- PERMANECEM `RESTRICT`: são a garantia de que a versão corrente nunca é apagada.
-- -----------------------------------------------------------------------------
-- O nome da FK é DESCOBERTO, não assumido.
--
-- As duas foram declaradas inline (`previous_version_id ... REFERENCES ...`), o
-- que faz o Postgres gerar o nome. O padrão seria `<tabela>_<coluna>_fkey`, mas
-- eu li a AÇÃO dessas FKs no catálogo, não o NOME delas — e uma migration que
-- erra o nome de uma constraint falha no meio, depois de já ter alterado outras
-- coisas. O bloco abaixo encontra a FK pela coluna e pelo alvo.
DO $$
DECLARE
  v_tabela text;
  v_nome text;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['content_document_versions', 'writer_deliverable_versions'] LOOP
    SELECT con.conname INTO v_nome
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = src.relnamespace
      JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = con.conkey[1]
     WHERE ns.nspname = 'public' AND src.relname = v_tabela
       AND con.contype = 'f' AND a.attname = 'previous_version_id'
       AND cardinality(con.conkey) = 1;

    IF v_nome IS NULL THEN
      RAISE EXCEPTION 'M2_ABORTADA: FK de previous_version_id não encontrada em %', v_tabela;
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_tabela, v_nome);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (previous_version_id) '
      'REFERENCES public.%I(version_id) ON DELETE SET NULL',
      v_tabela, v_nome, v_tabela);
  END LOOP;
END $$;

-- =============================================================================
-- 4. PROTEÇÃO APPEND-ONLY CIENTE DA RETENÇÃO — FUNÇÃO NOVA, NÃO ALTERADA
-- =============================================================================
-- `pipeline_editorial_protect_append_only` continua EXATAMENTE como está:
--
--   BEGIN RAISE EXCEPTION 'append-only editorial record cannot be changed'; END;
--
-- Ela protege também `editorial_artifact_versions`, que está fora desta reforma.
-- Afrouxá-la afrouxaria o DNA junto — por isso a nova função é outra, e o
-- gatilho é trocado só nas duas tabelas do Redator.
--
-- A nova permite exatamente três coisas, e recusa todo o resto:
--   a) DELETE de linha já elegível (`purge_after <= now()`);
--   b) UPDATE que mexe só nos três campos de retenção;
--   c) UPDATE que só QUEBRA o elo `previous_version_id` (valor → NULL), que é
--      o que a FK `ON DELETE SET NULL` faz quando o elo anterior é purgado.
--
-- A comparação é por jsonb porque a função é compartilhada por duas tabelas com
-- tipos diferentes de `version_id` (text e uuid).
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.pipeline_editorial_protect_retention_aware()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb;
  v_purge_after timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_purge_after := (v_old->>'purge_after')::timestamptz;
    IF v_purge_after IS NULL THEN
      RAISE EXCEPTION 'append-only: versão sem substituição declarada não pode ser apagada';
    END IF;
    IF v_purge_after > now() THEN
      RAISE EXCEPTION 'append-only: versão ainda dentro da janela de recuperação (até %)', v_purge_after;
    END IF;
    RETURN OLD;
  END IF;

  v_new := to_jsonb(NEW);

  -- Tudo que NÃO for retenção nem quebra de elo precisa estar idêntico.
  IF (v_new - 'superseded_at' - 'superseded_by_version_id' - 'purge_after' - 'previous_version_id')
     IS DISTINCT FROM
     (v_old - 'superseded_at' - 'superseded_by_version_id' - 'purge_after' - 'previous_version_id')
  THEN
    RAISE EXCEPTION 'append-only editorial record cannot be changed';
  END IF;

  -- O elo só pode ser QUEBRADO, nunca reescrito para outro valor.
  IF (v_new->>'previous_version_id') IS DISTINCT FROM (v_old->>'previous_version_id')
     AND (v_new->>'previous_version_id') IS NOT NULL
  THEN
    RAISE EXCEPTION 'append-only: previous_version_id só pode ser anulado pela purga do elo anterior';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pipeline_editorial_protect_retention_aware()
  IS 'Append-only com exceção estreita para a retenção de 48h. Usada SOMENTE por content_document_versions e writer_deliverable_versions. editorial_artifact_versions segue em pipeline_editorial_protect_append_only, inalterada.';

DROP TRIGGER content_document_versions_append_only_trg ON public.content_document_versions;
CREATE TRIGGER content_document_versions_append_only_trg
  BEFORE UPDATE OR DELETE ON public.content_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_retention_aware();

DROP TRIGGER writer_deliverable_versions_append_only_trg ON public.writer_deliverable_versions;
CREATE TRIGGER writer_deliverable_versions_append_only_trg
  BEFORE UPDATE OR DELETE ON public.writer_deliverable_versions
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_retention_aware();

-- =============================================================================
-- 5. `writer_save_deliverable` PASSA A MANTER `current_version_id`
-- =============================================================================
-- Reescrita da 20260918053018 com UMA diferença: a versão é inserida ANTES da
-- gravação da linha, e a linha grava `current_version_id` no mesmo UPDATE.
-- Um segundo UPDATE só para o ponteiro dispararia o gatilho de `lock_version`
-- outra vez, e o recibo devolvido divergiria do readback do cliente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.writer_save_deliverable(
  p_brand_id uuid,
  p_document_id text,
  p_kind text,
  p_payload jsonb,
  p_content_hash text,
  p_expected_lock integer,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_document public.content_documents%ROWTYPE;
  v_current public.writer_deliverables%ROWTYPE;
  v_previous_version_id uuid;
  v_version_id uuid;
  v_version_number integer;
BEGIN
  SELECT * INTO v_document FROM public.content_documents
    WHERE id = p_document_id AND marca_id = p_brand_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'writer_document_not_found' USING ERRCODE = 'P0001'; END IF;
  IF p_kind NOT IN ('video_script', 'carousel')
    OR p_payload->>'kind' IS DISTINCT FROM p_kind
    OR p_payload->>'documentId' IS DISTINCT FROM p_document_id
    OR p_payload->>'sourceDocumentHash' IS DISTINCT FROM v_document.content_hash
    OR nullif(btrim(p_payload->>'title'), '') IS NULL
    OR nullif(btrim(p_content_hash), '') IS NULL THEN
    RAISE EXCEPTION 'writer_payload_invalid_or_stale' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_current FROM public.writer_deliverables
    WHERE marca_id = p_brand_id AND document_id = p_document_id AND kind = p_kind FOR UPDATE;

  IF FOUND THEN
    IF v_current.status = 'approved' THEN RAISE EXCEPTION 'writer_approved_immutable' USING ERRCODE = 'P0001'; END IF;
    IF v_current.content_hash = p_content_hash THEN
      RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
        'lockVersion', v_current.lock_version, 'updatedAt', v_current.updated_at,
        'versionId', v_current.current_version_id, 'unchanged', true);
    END IF;
    IF p_expected_lock IS DISTINCT FROM v_current.lock_version THEN
      RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001';
    END IF;

    SELECT version_id, version_number INTO v_previous_version_id, v_version_number
      FROM public.writer_deliverable_versions WHERE deliverable_id = v_current.id
      ORDER BY version_number DESC LIMIT 1;
    v_version_number := coalesce(v_version_number, 0) + 1;

    INSERT INTO public.writer_deliverable_versions (deliverable_id, version_number,
      previous_version_id, payload, content_hash, change_reason, created_by)
    VALUES (v_current.id, v_version_number, v_previous_version_id, p_payload,
      p_content_hash, 'Revisão do rascunho.', p_actor_id)
    RETURNING version_id INTO v_version_id;

    UPDATE public.writer_deliverables SET title = p_payload->>'title', payload = p_payload,
      content_hash = p_content_hash, source_document_hash = v_document.content_hash,
      current_version_id = v_version_id,
      updated_by = p_actor_id WHERE id = v_current.id RETURNING * INTO v_current;
  ELSE
    IF p_expected_lock IS NOT NULL THEN RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001'; END IF;
    v_version_id := gen_random_uuid();
    v_version_number := 1;
    -- FK DEFERRABLE: o ponteiro entra junto e é conferido no COMMIT.
    INSERT INTO public.writer_deliverables (marca_id, document_id, kind, title,
      source_document_hash, payload, content_hash, current_version_id, created_by, updated_by)
    VALUES (p_brand_id, p_document_id, p_kind, p_payload->>'title', v_document.content_hash,
      p_payload, p_content_hash, v_version_id, p_actor_id, p_actor_id) RETURNING * INTO v_current;

    INSERT INTO public.writer_deliverable_versions (version_id, deliverable_id, version_number,
      previous_version_id, payload, content_hash, change_reason, created_by)
    VALUES (v_version_id, v_current.id, v_version_number, NULL, p_payload,
      p_content_hash, 'Rascunho inicial.', p_actor_id);
  END IF;

  RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
    'lockVersion', v_current.lock_version, 'updatedAt', v_current.updated_at,
    'versionId', v_version_id, 'versionNumber', v_version_number, 'unchanged', false);
END;
$$;

-- =============================================================================
-- 6. MARCAR SUBSTITUIÇÃO — O ATO QUE ABRE A JANELA
-- =============================================================================
-- Separado da gravação de propósito: o readback só existe DEPOIS do commit da
-- gravação. Estas funções são chamadas pela rota server-side apenas quando o
-- readback bateu.
--
-- Se elas nunca forem chamadas, o predecessor fica sem `purge_after` e NUNCA é
-- apagado. O modo de falha é guardar demais.
--
-- São idempotentes e NÃO movem `purge_after` na repetição: repetir uma chamada
-- não pode encurtar a janela de ninguém.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.writer_mark_document_version_superseded(
  p_brand_id uuid,
  p_document_id text,
  p_version_id text,
  p_successor_version_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc public.content_documents%ROWTYPE;
  v_row public.content_document_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_doc FROM public.content_documents
    WHERE id = p_document_id AND marca_id = p_brand_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention_document_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_doc.current_version_id IS DISTINCT FROM p_successor_version_id THEN
    RAISE EXCEPTION 'retention_successor_not_current' USING ERRCODE = 'P0001';
  END IF;
  IF p_version_id = p_successor_version_id THEN
    RAISE EXCEPTION 'retention_self_supersede' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.content_document_versions
    WHERE version_id = p_version_id AND document_id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention_version_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_row.superseded_at IS NOT NULL THEN
    IF v_row.superseded_by_version_id = p_successor_version_id THEN
      -- Repetição: devolve o estado, sem mexer na janela.
      RETURN jsonb_build_object('versionId', v_row.version_id, 'supersededAt', v_row.superseded_at,
        'purgeAfter', v_row.purge_after, 'unchanged', true);
    END IF;
    RAISE EXCEPTION 'retention_already_superseded_by_other' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.content_document_versions
     SET superseded_at = v_now,
         superseded_by_version_id = p_successor_version_id,
         purge_after = v_now + interval '48 hours'
   WHERE version_id = p_version_id RETURNING * INTO v_row;

  RETURN jsonb_build_object('versionId', v_row.version_id, 'supersededAt', v_row.superseded_at,
    'purgeAfter', v_row.purge_after, 'unchanged', false);
END;
$$;

CREATE FUNCTION public.writer_mark_deliverable_version_superseded(
  p_brand_id uuid,
  p_deliverable_id uuid,
  p_version_id uuid,
  p_successor_version_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_deliverable public.writer_deliverables%ROWTYPE;
  v_row public.writer_deliverable_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_deliverable FROM public.writer_deliverables
    WHERE id = p_deliverable_id AND marca_id = p_brand_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention_deliverable_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_deliverable.current_version_id IS DISTINCT FROM p_successor_version_id THEN
    RAISE EXCEPTION 'retention_successor_not_current' USING ERRCODE = 'P0001';
  END IF;
  IF p_version_id = p_successor_version_id THEN
    RAISE EXCEPTION 'retention_self_supersede' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.writer_deliverable_versions
    WHERE version_id = p_version_id AND deliverable_id = p_deliverable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retention_version_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_row.superseded_at IS NOT NULL THEN
    IF v_row.superseded_by_version_id = p_successor_version_id THEN
      RETURN jsonb_build_object('versionId', v_row.version_id, 'supersededAt', v_row.superseded_at,
        'purgeAfter', v_row.purge_after, 'unchanged', true);
    END IF;
    RAISE EXCEPTION 'retention_already_superseded_by_other' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.writer_deliverable_versions
     SET superseded_at = v_now,
         superseded_by_version_id = p_successor_version_id,
         purge_after = v_now + interval '48 hours'
   WHERE version_id = p_version_id RETURNING * INTO v_row;

  RETURN jsonb_build_object('versionId', v_row.version_id, 'supersededAt', v_row.superseded_at,
    'purgeAfter', v_row.purge_after, 'unchanged', false);
END;
$$;

-- =============================================================================
-- 7. PURGA — IDEMPOTENTE, E DISPARADA DE FORA
-- =============================================================================
-- `pg_cron` e `pg_net` NÃO estão instalados neste projeto (confirmado no
-- preflight). Esta migration NÃO configura agendamento: a função é chamada por
-- rota server-side. Deixar um agendador implícito num banco que não o tem seria
-- prometer uma limpeza que nunca acontece.
--
-- Nunca lança por "já feito": reexecução é segura por construção.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.lifecycle_purge_editorial_history(
  p_brand_id uuid,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_documentos integer := 0;
  v_entregaveis integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'retention_invalid_limit' USING ERRCODE = 'P0001';
  END IF;

  WITH elegiveis AS (
    SELECT v.version_id
      FROM public.content_document_versions v
      JOIN public.content_documents d ON d.id = v.document_id
     WHERE d.marca_id = p_brand_id
       AND v.purge_after IS NOT NULL
       AND v.purge_after <= now()
       -- Rede dupla: a FK RESTRICT já impede, e a condição diz o porquê.
       AND d.current_version_id IS DISTINCT FROM v.version_id
     ORDER BY v.purge_after
     LIMIT p_limit
  ), apagadas AS (
    DELETE FROM public.content_document_versions
     WHERE version_id IN (SELECT version_id FROM elegiveis)
    RETURNING 1
  ) SELECT count(*) INTO v_documentos FROM apagadas;

  WITH elegiveis AS (
    SELECT v.version_id
      FROM public.writer_deliverable_versions v
      JOIN public.writer_deliverables e ON e.id = v.deliverable_id
     WHERE e.marca_id = p_brand_id
       AND v.purge_after IS NOT NULL
       AND v.purge_after <= now()
       AND e.current_version_id IS DISTINCT FROM v.version_id
     ORDER BY v.purge_after
     LIMIT p_limit
  ), apagadas AS (
    DELETE FROM public.writer_deliverable_versions
     WHERE version_id IN (SELECT version_id FROM elegiveis)
    RETURNING 1
  ) SELECT count(*) INTO v_entregaveis FROM apagadas;

  RETURN jsonb_build_object('documentVersionsPurged', v_documentos,
    'deliverableVersionsPurged', v_entregaveis, 'purgedAt', now());
END;
$$;

-- =============================================================================
-- 8. GRANTS — só `service_role`, como as demais RPCs do Redator
-- =============================================================================
REVOKE ALL ON FUNCTION public.pipeline_editorial_protect_retention_aware() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.writer_mark_document_version_superseded(uuid,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.writer_mark_deliverable_version_superseded(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lifecycle_purge_editorial_history(uuid,integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.writer_mark_document_version_superseded(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.writer_mark_deliverable_version_superseded(uuid,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_purge_editorial_history(uuid,integer) TO service_role;

-- RLS não é ampliada: as duas tabelas seguem com política de SELECT para
-- `authenticated`, e toda escrita continua sendo por `service_role`.

COMMIT;

-- =============================================================================
-- READBACK PÓS-APLICAÇÃO
-- =============================================================================
-- 1) A coluna e a FK do ponteiro corrente:
-- npx supabase db query --linked "
--   select column_name, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='writer_deliverables'
--      and column_name='current_version_id';
-- "   ESPERADO: 1 linha, is_nullable=YES
--
-- 2) Os CHECKs pareados:
-- npx supabase db query --linked "
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('content_document_versions_retention_check',
--                      'writer_deliverable_versions_retention_check');
-- "   ESPERADO: 2 linhas, ambas exigindo purge_after = superseded_at + '48:00:00'
--
-- 3) O gatilho novo nas DUAS tabelas, e o ANTIGO preservado no DNA:
-- npx supabase db query --linked "
--   select rel.relname, p.proname from pg_trigger tg
--     join pg_class rel on rel.oid=tg.tgrelid
--     join pg_proc p on p.oid=tg.tgfoid
--    where not tg.tgisinternal and p.proname like 'pipeline_editorial_protect%'
--    order by 1;
-- "   ESPERADO:
--     content_document_versions    → pipeline_editorial_protect_retention_aware
--     writer_deliverable_versions  → pipeline_editorial_protect_retention_aware
--     editorial_artifact_versions  → pipeline_editorial_protect_append_only   ← INTACTA
--
-- 4) As FKs de elo agora SET NULL, e as de corrente ainda RESTRICT:
-- npx supabase db query --linked "
--   select conname, case confdeltype when 'r' then 'RESTRICT' when 'n' then 'SET NULL' end as acao
--     from pg_constraint
--    where conname in ('content_document_versions_previous_version_id_fkey',
--                      'writer_deliverable_versions_previous_version_id_fkey',
--                      'content_documents_current_version_fk',
--                      'writer_deliverables_current_version_fk') order by 1;
-- "   ESPERADO: as duas de previous → SET NULL; as duas de current → RESTRICT
--
-- 5) NENHUMA linha entrou em janela pela migration:
-- npx supabase db query --linked "
--   select (select count(*) from public.content_document_versions where purge_after is not null) as docs,
--          (select count(*) from public.writer_deliverable_versions where purge_after is not null) as entregaveis;
-- "   ESPERADO: 0 e 0
-- =============================================================================

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Reversível sem perda enquanto nenhuma linha tiver sido purgada. Depois de uma
-- purga, o rollback devolve a ESTRUTURA — não devolve a versão apagada. Por isso
-- a ordem de homologação é: aplicar, conferir readback, e só então habilitar a
-- rota que chama `lifecycle_purge_editorial_history`.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.lifecycle_purge_editorial_history(uuid,integer);
-- DROP FUNCTION IF EXISTS public.writer_mark_deliverable_version_superseded(uuid,uuid,uuid,uuid);
-- DROP FUNCTION IF EXISTS public.writer_mark_document_version_superseded(uuid,text,text,text);
--
-- DROP TRIGGER content_document_versions_append_only_trg ON public.content_document_versions;
-- CREATE TRIGGER content_document_versions_append_only_trg
--   BEFORE UPDATE OR DELETE ON public.content_document_versions
--   FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();
-- DROP TRIGGER writer_deliverable_versions_append_only_trg ON public.writer_deliverable_versions;
-- CREATE TRIGGER writer_deliverable_versions_append_only_trg
--   BEFORE UPDATE OR DELETE ON public.writer_deliverable_versions
--   FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_protect_append_only();
-- DROP FUNCTION IF EXISTS public.pipeline_editorial_protect_retention_aware();
--
-- -- Mesmo bloco de descoberta, com RESTRICT no lugar de SET NULL:
-- DO $$
-- DECLARE v_tabela text; v_nome text;
-- BEGIN
--   FOREACH v_tabela IN ARRAY ARRAY['content_document_versions', 'writer_deliverable_versions'] LOOP
--     SELECT con.conname INTO v_nome FROM pg_constraint con
--       JOIN pg_class src ON src.oid = con.conrelid
--       JOIN pg_namespace ns ON ns.oid = src.relnamespace
--       JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = con.conkey[1]
--      WHERE ns.nspname='public' AND src.relname=v_tabela AND con.contype='f'
--        AND a.attname='previous_version_id' AND cardinality(con.conkey)=1;
--     EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_tabela, v_nome);
--     EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (previous_version_id) '
--       'REFERENCES public.%I(version_id) ON DELETE RESTRICT', v_tabela, v_nome, v_tabela);
--   END LOOP;
-- END $$;
--
-- DROP INDEX IF EXISTS public.writer_deliverable_versions_purge_idx;
-- DROP INDEX IF EXISTS public.content_document_versions_purge_idx;
-- ALTER TABLE public.writer_deliverable_versions
--   DROP CONSTRAINT writer_deliverable_versions_retention_check,
--   DROP COLUMN purge_after, DROP COLUMN superseded_by_version_id, DROP COLUMN superseded_at;
-- ALTER TABLE public.content_document_versions
--   DROP CONSTRAINT content_document_versions_retention_check,
--   DROP COLUMN purge_after, DROP COLUMN superseded_by_version_id, DROP COLUMN superseded_at;
--
-- ALTER TABLE public.writer_deliverables
--   DROP CONSTRAINT writer_deliverables_current_version_fk, DROP COLUMN current_version_id;
--
-- -- E restaurar writer_save_deliverable da 20260918053018 tal como estava.
-- COMMIT;
-- =============================================================================
