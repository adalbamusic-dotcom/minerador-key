-- =====================================================================
-- M3 · SMOKE DE ROLLBACK — A SUBSTITUIÇÃO INVÁLIDA NÃO MOVE NADA
-- =====================================================================
--
-- Transacional, fixture próprio, nenhuma linha do usuário como sujeito.
--
-- A pergunta: quando a substituição falha, o predecessor continua atual? A
-- resposta tem que ser sim para TODA falha, porque a alternativa — predecessor
-- já em janela e sucessor sem assumir — deixaria a posição sem imagem e um
-- relógio correndo sobre a única cópia boa.
--
-- Cada tentativa roda dentro de um bloco com EXCEPTION, que cria um savepoint
-- implícito: a falha desfaz o que aquela tentativa escreveu e a transação
-- externa continua, permitindo reler o estado depois.
-- =====================================================================

BEGIN;

INSERT INTO public.content_documents (id, marca_id, article_id, status, title, slug, content_hash, created_by, updated_by)
VALUES ('smoke-m3-rollback-doc', '09762023-d0d4-4c24-b34e-d0fdfd43f891', 'smoke-m3-rollback-article',
        'escrevendo', 'FIXTURE ROLLBACK M3', 'fixture-rollback-m3', 'sha256:fixture',
        'd67ebbad-a590-45f8-8bb5-a19c6241ac1b', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

-- PREDECESSOR ATUAL: com arquivo e ancorado.
INSERT INTO public.writer_media_assets
  (id, marca_id, document_id, role, status, objective, prompt, alt_text, aspect_ratio,
   storage_path, mime_type, file_hash, anchor_kind, anchor_ref, created_by, updated_by)
VALUES ('00000000-0000-4000-8000-00000000e001', '09762023-d0d4-4c24-b34e-d0fdfd43f891',
        'smoke-m3-rollback-doc', 'article_block', 'uploaded', 'fixture', 'fixture',
        '', '16:9', 'fixture/atual.png', 'image/png', 'hash-atual',
        'article_block', 'bloco-rollback-1',
        'd67ebbad-a590-45f8-8bb5-a19c6241ac1b', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

-- CANDIDATO SEM ARQUIVO: só um prompt. Não pode substituir imagem.
INSERT INTO public.writer_media_assets
  (id, marca_id, document_id, role, status, objective, prompt, alt_text, aspect_ratio, created_by, updated_by)
VALUES ('00000000-0000-4000-8000-00000000e002', '09762023-d0d4-4c24-b34e-d0fdfd43f891',
        'smoke-m3-rollback-doc', 'article_block', 'prompt_ready', 'fixture', 'fixture',
        '', '16:9', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

-- CANDIDATO DE OUTRO DOCUMENTO: com arquivo, mas fora do escopo.
INSERT INTO public.content_documents (id, marca_id, article_id, status, title, slug, content_hash, created_by, updated_by)
VALUES ('smoke-m3-rollback-doc2', '09762023-d0d4-4c24-b34e-d0fdfd43f891', 'smoke-m3-rollback-article2',
        'escrevendo', 'FIXTURE ROLLBACK M3 B', 'fixture-rollback-m3-b', 'sha256:fixture',
        'd67ebbad-a590-45f8-8bb5-a19c6241ac1b', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

INSERT INTO public.writer_media_assets
  (id, marca_id, document_id, role, status, objective, prompt, alt_text, aspect_ratio,
   storage_path, mime_type, file_hash, created_by, updated_by)
VALUES ('00000000-0000-4000-8000-00000000e003', '09762023-d0d4-4c24-b34e-d0fdfd43f891',
        'smoke-m3-rollback-doc2', 'article_block', 'uploaded', 'fixture', 'fixture',
        '', '16:9', 'fixture/outro.png', 'image/png', 'hash-outro',
        'd67ebbad-a590-45f8-8bb5-a19c6241ac1b', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

CREATE TEMP TABLE rollback_tentativas (caso text, erro text) ON COMMIT DROP;

DO $$
DECLARE
  v_marca uuid := '09762023-d0d4-4c24-b34e-d0fdfd43f891';
  v_ator  uuid := 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b';
  v_atual uuid := '00000000-0000-4000-8000-00000000e001';
BEGIN
  -- Sucessor sem arquivo confirmado.
  BEGIN
    PERFORM public.writer_replace_media_asset(v_marca, v_atual, '00000000-0000-4000-8000-00000000e002', v_ator);
    INSERT INTO rollback_tentativas VALUES ('sucessor_sem_arquivo', 'NAO_FALHOU');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rollback_tentativas VALUES ('sucessor_sem_arquivo', SQLERRM);
  END;

  -- Sucessor de outro documento.
  BEGIN
    PERFORM public.writer_replace_media_asset(v_marca, v_atual, '00000000-0000-4000-8000-00000000e003', v_ator);
    INSERT INTO rollback_tentativas VALUES ('sucessor_de_outro_documento', 'NAO_FALHOU');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rollback_tentativas VALUES ('sucessor_de_outro_documento', SQLERRM);
  END;

  -- Substituir por si mesmo.
  BEGIN
    PERFORM public.writer_replace_media_asset(v_marca, v_atual, v_atual, v_ator);
    INSERT INTO rollback_tentativas VALUES ('substituir_por_si_mesmo', 'NAO_FALHOU');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rollback_tentativas VALUES ('substituir_por_si_mesmo', SQLERRM);
  END;

  -- Marca errada: o ativo não é alcançável por outra marca.
  BEGIN
    PERFORM public.writer_replace_media_asset(
      (SELECT id FROM public.marcas WHERE id <> v_marca LIMIT 1),
      v_atual, '00000000-0000-4000-8000-00000000e003', v_ator);
    INSERT INTO rollback_tentativas VALUES ('marca_errada', 'NAO_FALHOU');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rollback_tentativas VALUES ('marca_errada', SQLERRM);
  END;
END $$;

SELECT jsonb_pretty(jsonb_build_object(
  'tentativas', (SELECT jsonb_object_agg(caso, erro) FROM rollback_tentativas),
  'todas_recusadas', (SELECT CASE WHEN count(*) FILTER (WHERE erro = 'NAO_FALHOU') = 0 THEN 'YES' ELSE 'NO' END
                        FROM rollback_tentativas),
  'predecessor_apos_as_falhas', (
    SELECT jsonb_build_object(
      'anchor_kind', anchor_kind, 'anchor_ref', anchor_ref,
      'superseded_at', superseded_at, 'purge_after', purge_after,
      'replaced_by_asset_id', replaced_by_asset_id,
      'PREDECESSOR_CONTINUA_ATUAL', CASE WHEN superseded_at IS NULL AND purge_after IS NULL
                                          AND replaced_by_asset_id IS NULL
                                          AND anchor_kind = 'article_block' AND anchor_ref = 'bloco-rollback-1'
                                         THEN 'YES' ELSE 'NO' END)
      FROM public.writer_media_assets WHERE id = '00000000-0000-4000-8000-00000000e001'),
  'candidato_sem_arquivo_nao_ancorou', (
    SELECT CASE WHEN anchor_kind IS NULL THEN 'YES' ELSE 'NO' END
      FROM public.writer_media_assets WHERE id = '00000000-0000-4000-8000-00000000e002'),
  'candidato_de_outro_doc_nao_ancorou', (
    SELECT CASE WHEN anchor_kind IS NULL THEN 'YES' ELSE 'NO' END
      FROM public.writer_media_assets WHERE id = '00000000-0000-4000-8000-00000000e003')
)) AS rollback_smoke;

ROLLBACK;
