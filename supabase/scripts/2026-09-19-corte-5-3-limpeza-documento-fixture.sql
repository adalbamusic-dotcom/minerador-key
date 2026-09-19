-- =====================================================================
-- LIMPEZA FINAL DA FIXTURE DO CORTE 5.2 — o documento órfão
-- =====================================================================
--
-- Remove UMA linha de `content_documents`: `fixture-purge-52-doc`, criada para
-- a homologação da purga e hoje sem nenhum ativo, versão, entregável ou
-- registro de publicação apontando para ela.
--
-- Não é purga de retenção e não usa a autoridade da M2/M3: documento não tem
-- janela. É limpeza administrativa de dado de teste, por id literal, uma vez.
--
-- Nenhuma API, RPC ou mecanismo genérico foi criado para isto — e nem deveria:
-- um caminho reutilizável para apagar documento seria arma carregada.
--
-- As seis dependências foram DESCOBERTAS no catálogo, não presumidas: cinco FKs
-- (`content_document_user_states`, `content_document_versions`,
-- `publication_records`, `writer_deliverables`, `writer_media_assets`) e
-- `writer_mcp_call_events`, que tem `document_id` sem FK e por isso não seria
-- barrada pelo banco.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_doc text := 'fixture-purge-52-doc';
  v_marca_fixture uuid := '4a737e74-e35d-4a49-8284-87b3f964e495';
  v_marca_usuario uuid := '09762023-d0d4-4c24-b34e-d0fdfd43f891';
  v_linha public.content_documents%ROWTYPE;
  v_dependentes integer;
  v_apagadas integer;
BEGIN
  SELECT * INTO v_linha FROM public.content_documents WHERE id = v_doc FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fixture_nao_encontrada: %', v_doc;
  END IF;

  -- Guarda 1: precisa ser da marca de fixture, e nunca da marca do usuário.
  IF v_linha.marca_id <> v_marca_fixture OR v_linha.marca_id = v_marca_usuario THEN
    RAISE EXCEPTION 'fixture_fora_da_marca_esperada: %', v_linha.marca_id;
  END IF;

  -- Guarda 2: precisa ser reconhecivelmente a fixture, não um documento real
  -- que por acaso tenha id parecido.
  IF v_linha.article_id <> 'fixture-purge-52-article' OR v_linha.title <> 'FIXTURE PURGE 5.2' THEN
    RAISE EXCEPTION 'fixture_nao_confere: article=% title=%', v_linha.article_id, v_linha.title;
  END IF;

  -- Guarda 3: órfã de verdade, nas seis dependências descobertas no catálogo.
  SELECT
      (SELECT count(*) FROM public.writer_media_assets        WHERE document_id = v_doc)
    + (SELECT count(*) FROM public.content_document_versions  WHERE document_id = v_doc)
    + (SELECT count(*) FROM public.writer_deliverables        WHERE document_id = v_doc)
    + (SELECT count(*) FROM public.publication_records        WHERE document_id = v_doc)
    + (SELECT count(*) FROM public.content_document_user_states WHERE document_id = v_doc)
    + (SELECT count(*) FROM public.writer_mcp_call_events     WHERE document_id = v_doc)
  INTO v_dependentes;

  IF v_dependentes > 0 THEN
    RAISE EXCEPTION 'fixture_nao_esta_orfa: % dependente(s)', v_dependentes;
  END IF;

  -- Guarda 4: o próprio documento não pode declarar versão corrente.
  IF v_linha.current_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'fixture_com_current_version_id: %', v_linha.current_version_id;
  END IF;

  DELETE FROM public.content_documents
   WHERE id = v_doc AND marca_id = v_marca_fixture AND article_id = 'fixture-purge-52-article';
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  -- Guarda 5: exatamente uma. Qualquer outro número é escopo vazando.
  IF v_apagadas <> 1 THEN
    RAISE EXCEPTION 'affected_rows_inesperado: %', v_apagadas;
  END IF;

  RAISE NOTICE 'AFFECTED_ROWS=%', v_apagadas;
END $$;

COMMIT;

-- =====================================================================
-- READBACK
-- =====================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'FIXTURE_DOCUMENT_REMAINING', (SELECT count(*) FROM public.content_documents
    WHERE id = 'fixture-purge-52-doc'),
  'documentos_na_marca_de_fixture', (SELECT count(*) FROM public.content_documents
    WHERE marca_id = '4a737e74-e35d-4a49-8284-87b3f964e495'),
  'assets_na_marca_de_fixture', (SELECT count(*) FROM public.writer_media_assets
    WHERE marca_id = '4a737e74-e35d-4a49-8284-87b3f964e495'),
  'objetos_de_fixture_no_storage', (SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'writer-media' AND name LIKE '4a737e74%'),

  'REAL_USER_DOCUMENTS', (SELECT count(*) FROM public.content_documents
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'),
  'REAL_REDACTOR_ASSETS', (SELECT count(*) FROM public.writer_media_assets
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'),
  'REAL_CURRENT_ASSETS', (SELECT count(*) FROM public.writer_media_assets
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
      AND anchor_kind IS NOT NULL AND superseded_at IS NULL),
  'REAL_WINDOW_OPEN_ASSETS', (SELECT count(*) FROM public.writer_media_assets
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND superseded_at IS NOT NULL),
  'REAL_STORAGE_OBJECTS', (SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'writer-media' AND name LIKE '09762023%'),
  'REAL_DELIVERABLES', (SELECT count(*) FROM public.writer_deliverables
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'),

  'DNA_intacto', (SELECT count(*) FROM public.editorial_artifact_versions),
  'total_content_documents', (SELECT count(*) FROM public.content_documents)
)) AS fechamento_final;
