-- =============================================================================
-- M6 — O SAVE DE RASCUNHO DO ARTIGO VIA MCP NÃO CRIA HISTÓRICO
-- =============================================================================
--
-- ================== O DEFEITO QUE ESTA MIGRATION FECHA ==================
--
-- `writer_save_article_draft` — a RPC por trás da ferramenta MCP
-- `save_writer_draft` — insere em `content_document_versions` a CADA save
-- alterado, com `change_reason = 'Rascunho salvo via MCP.'`, e move
-- `current_version_id` junto. O wrapper TypeScript então chama
-- `markArticlePredecessorSuperseded`, abrindo janela de 48h sobre o predecessor.
--
-- Salvar rascunho passa a criar histórico e a condenar versão à exclusão.
--
-- ================== A INVARIANTE QUE JÁ VALIA ==================
--
--   AUTOSAVE_CREATES_HISTORY = NO
--   SAVE_DRAFT_CREATES_HISTORY = NO
--   FINALIZATION_CREATES_HISTORY = YES
--
-- O caminho da TELA já obedece: `PATCH /api/editorial/documents` só versiona
-- quando `createVersion` é true, e isso só acontece em `requestStatus`, que é o
-- que o botão "Finalizar artigo" chama. Evidência lida em 2026-09-19:
-- `content_documents.lock_version = 22` com **zero** linhas em
-- `content_document_versions`. Vinte e duas gravações, nenhuma versão.
--
-- A M6 põe o caminho MCP no mesmo trilho. É a mesma correção que a M4 fez para
-- `writer_save_deliverable`, aplicada ao artigo.
--
-- ================== O QUE ELA NÃO FAZ ==================
--
-- * NÃO altera a finalização do Artigo. A autoridade que cria versão de artigo
--   continua sendo `ContentDocumentRepository.createVersion`, chamada pela rota
--   da tela quando `createVersion` é true. Nada aqui a toca.
-- * NÃO transforma `save_writer_draft` em finalize implícito: a guarda
--   `p_payload->>'status' = 'escrevendo'` continua, e o MCP segue sem poder
--   aprovar documento.
-- * NÃO cria autoridade nova de finalização para o MCP. Se um dia a ferramenta
--   precisar finalizar, isso reusa a autoridade canônica do artigo — e é outra
--   rodada, porque mexe no lifecycle do Artigo.
-- * NÃO apaga nem reescreve histórico. Linhas com 'Rascunho salvo via MCP.' que
--   porventura existam ficam exatamente onde estão.
-- * Não cria, altera ou remove tabela, coluna, enum, índice, constraint ou
--   trigger. Substitui UMA função.
--
-- ================== O QUE MUDA NO CORPO ==================
--
-- Saem três coisas, as mesmas que saíram do save do entregável na M4:
--
--   * o SELECT da última versão (que buscava a predecessora)
--   * o INSERT em `content_document_versions`
--   * o `current_version_id = v_version_id` no UPDATE
--
-- E o recibo passa a devolver `versionId` = a corrente que JÁ existia, em vez
-- de uma versão recém-criada. Isso preserva a conferência de readback do
-- chamador e lhe dá um significado melhor: **o save não mexeu no ponteiro**.
--
-- ================== SEGURANÇA ==================
--
-- Mesma assinatura, mesmo SECURITY DEFINER, mesmo search_path, mesmos
-- REVOKE/GRANT — só `service_role` executa.
--
-- Rollback: supabase/scripts/2026-09-19-m6-rollback-writer-save-article-draft.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. PRÉ-FLIGHT
-- =============================================================================
-- A M6 não escreve dado. As guardas abaixo recusam um mundo diferente do
-- auditado — não porque a substituição seja perigosa, mas porque a decisão de
-- "não versionar" foi tomada olhando um banco sem histórico de MCP. Se esse
-- histórico existir, alguém precisa decidir o que fazer com ele ANTES de mudar
-- o comportamento que o produziu.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_fn integer;
  v_mcp integer;
BEGIN
  -- Guarda 1: a função tem que existir com a assinatura conhecida. Sem isso,
  -- CREATE OR REPLACE criaria uma função nova em vez de corrigir a que existe.
  SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'writer_save_article_draft'
     AND p.oid::regprocedure::text = 'writer_save_article_draft(uuid,text,jsonb,text,integer,uuid)';
  IF v_fn <> 1 THEN
    RAISE EXCEPTION 'm6_preflight_funcao_ausente: encontrada % vez(es) com a assinatura esperada', v_fn;
  END IF;

  -- Guarda 2: nenhuma versão criada pelo caminho MCP pode existir. Zero foi o
  -- que a auditoria de 2026-09-19 leu, e é o que torna esta correção uma
  -- prevenção, não uma limpeza. Se aparecer alguma, a ferramenta foi usada e há
  -- histórico indevido para decidir — possivelmente com retenção aberta.
  SELECT count(*) INTO v_mcp FROM public.content_document_versions
   WHERE change_reason = 'Rascunho salvo via MCP.';
  IF v_mcp > 0 THEN
    RAISE EXCEPTION 'm6_preflight_ha_historico_de_mcp: % versao(oes) com change_reason=''Rascunho salvo via MCP.''; decidir o destino delas antes de mudar o comportamento', v_mcp;
  END IF;

  RAISE NOTICE 'M6 preflight OK';
END $$;

-- =============================================================================
-- 1. O SAVE DE RASCUNHO VIA MCP — ESTADO CORRENTE, E SÓ
-- =============================================================================
-- Mantém intactas: a busca com FOR UPDATE, a guarda de aprovado, a validação de
-- ESCOPO (o MCP só pode mexer em blocks/editorContent/status), o atalho de hash
-- igual e o optimistic lock. Nada disso é enfraquecido — é justamente por causa
-- deles que esta correção é uma migration e não um desvio no TypeScript.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.writer_save_article_draft(
  p_brand_id uuid,
  p_document_id text,
  p_payload jsonb,
  p_content_hash text,
  p_expected_lock integer,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.content_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_current FROM public.content_documents
    WHERE id = p_document_id AND marca_id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'writer_document_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_current.status = 'approved' OR v_current.payload->>'status' = 'aprovado' THEN
    RAISE EXCEPTION 'writer_approved_immutable' USING ERRCODE = 'P0001';
  END IF;

  -- ESCOPO: o MCP só pode tocar blocks, editorContent e status. Tudo o mais do
  -- payload tem que ser byte a byte o que já está gravado.
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR p_payload->>'id' IS DISTINCT FROM p_document_id
    OR p_payload->>'status' IS DISTINCT FROM 'escrevendo'
    OR nullif(btrim(p_content_hash), '') IS NULL
    OR (p_payload - 'blocks' - 'editorContent' - 'status')
       IS DISTINCT FROM (v_current.payload - 'blocks' - 'editorContent' - 'status') THEN
    RAISE EXCEPTION 'writer_draft_scope_invalid' USING ERRCODE = 'P0001';
  END IF;

  -- Repetir a mesma gravação já concluída é seguro mesmo com o lock antigo.
  IF v_current.content_hash = p_content_hash THEN
    RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
      'lockVersion', v_current.lock_version, 'versionId', v_current.current_version_id,
      'unchanged', true);
  END IF;

  IF p_expected_lock IS DISTINCT FROM v_current.lock_version THEN
    RAISE EXCEPTION 'writer_lock_conflict' USING ERRCODE = 'P0001';
  END IF;

  -- SEM versão, SEM tocar current_version_id. Rascunho é estado corrente.
  UPDATE public.content_documents
     SET payload = p_payload, content_hash = p_content_hash,
         status = 'writing', updated_by = p_actor_id
   WHERE id = p_document_id RETURNING * INTO v_current;

  -- `versionId` é a corrente que JÁ existia — não uma versão nova. O chamador
  -- compara com o readback, e a comparação passa a significar "o save não moveu
  -- o ponteiro", que é exatamente a invariante desta migration.
  RETURN jsonb_build_object('id', v_current.id, 'contentHash', v_current.content_hash,
    'lockVersion', v_current.lock_version, 'versionId', v_current.current_version_id,
    'unchanged', false);
END;
$$;

-- =============================================================================
-- 2. GRANTS — inalterados, reafirmados
-- =============================================================================
REVOKE ALL ON FUNCTION public.writer_save_article_draft(uuid,text,jsonb,text,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.writer_save_article_draft(uuid,text,jsonb,text,integer,uuid)
  TO service_role;

COMMENT ON FUNCTION public.writer_save_article_draft(uuid,text,jsonb,text,integer,uuid)
  IS 'Salva rascunho de artigo pelo MCP: atualiza apenas o estado corrente. NAO cria content_document_versions e NAO move current_version_id. Versao de artigo nasce so na finalizacao, pela rota da tela. Mantem escopo (so blocks/editorContent/status), guarda de aprovado e optimistic lock.';

-- =============================================================================
-- 3. READBACK — para rodar DEPOIS do COMMIT
-- =============================================================================
-- 1) O corpo efetivo não versiona mais (comentários removidos antes de buscar):
--
-- SELECT position('INSERT INTO public.content_document_versions' in
--          regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g')) = 0 AS nao_insere,
--        position('current_version_id = v_version_id' in
--          regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g')) = 0 AS nao_move
--   FROM pg_proc WHERE proname = 'writer_save_article_draft';
-- ESPERADO: t | t
--
-- 2) As guardas continuam:
--
-- writer_document_not_found · writer_approved_immutable ·
-- writer_draft_scope_invalid · writer_lock_conflict   → todas presentes
--
-- 3) Nada de dado mudou:
--
-- SELECT count(*) FROM public.content_document_versions;  -- ESPERADO: 0
-- SELECT status, lock_version FROM public.content_documents;
--
-- 4) Smoke com fixture própria, em transação abortada:
--    save alterado ×2 → 0 versões, current_version_id continua NULL
--    com versão final existente → save do MCP preserva current_version_id
-- =============================================================================

COMMIT;
