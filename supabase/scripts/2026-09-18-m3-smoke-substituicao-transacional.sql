-- =====================================================================
-- M3 · SMOKE DA SUBSTITUIÇÃO — TRANSACIONAL, NÃO DEIXA DADO
-- =====================================================================
--
-- Tudo roda dentro de BEGIN ... ROLLBACK. O fixture é próprio, com ids
-- declaradamente falsos, e NENHUMA linha do usuário é lida, alterada ou usada
-- como sujeito. A marca e o usuário reais entram só para satisfazer FK — e o
-- ROLLBACK devolve o banco ao estado anterior.
--
-- O que este smoke NÃO exercita: o upload ao Storage e o readback do arquivo.
-- Isso é caminho de aplicação (`uploadWriterMediaAsset`), não de SQL, e a M3
-- não o altera. O que o SQL confere é o RASTRO que aquele caminho deixa —
-- status `uploaded` com `storage_path` e `file_hash` preenchidos —, que é
-- exatamente o que a RPC exige.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- FIXTURE
-- ---------------------------------------------------------------------
INSERT INTO public.content_documents (id, marca_id, article_id, status, title, slug, content_hash, created_by, updated_by)
VALUES ('smoke-m3-fixture-doc', '09762023-d0d4-4c24-b34e-d0fdfd43f891', 'smoke-m3-fixture-article',
        'escrevendo', 'FIXTURE SMOKE M3', 'fixture-smoke-m3', 'sha256:fixture',
        'd67ebbad-a590-45f8-8bb5-a19c6241ac1b', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

-- PREDECESSOR: já tem arquivo, ainda sem âncora.
INSERT INTO public.writer_media_assets
  (id, marca_id, document_id, role, status, objective, prompt, alt_text, aspect_ratio,
   storage_path, mime_type, file_hash, created_by, updated_by)
VALUES ('00000000-0000-4000-8000-00000000f001', '09762023-d0d4-4c24-b34e-d0fdfd43f891',
        'smoke-m3-fixture-doc', 'article_block', 'uploaded', 'fixture', 'fixture',
        '', '16:9', 'fixture/predecessor.png', 'image/png', 'hash-predecessor',
        'd67ebbad-a590-45f8-8bb5-a19c6241ac1b', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

-- 1. BRIEFING DO SUCESSOR — SEM ÂNCORA E SEM ARQUIVO.
INSERT INTO public.writer_media_assets
  (id, marca_id, document_id, role, status, objective, prompt, alt_text, aspect_ratio, created_by, updated_by)
VALUES ('00000000-0000-4000-8000-00000000f002', '09762023-d0d4-4c24-b34e-d0fdfd43f891',
        'smoke-m3-fixture-doc', 'article_block', 'prompt_ready', 'fixture', 'fixture',
        '', '16:9', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b', 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

CREATE TEMP TABLE smoke_etapas (etapa text, resultado jsonb) ON COMMIT DROP;

INSERT INTO smoke_etapas
SELECT '1_sucessor_nasce_sem_ancora', jsonb_build_object(
  'anchor_kind', anchor_kind, 'anchor_ref', anchor_ref, 'status', status,
  'storage_path', storage_path, 'file_hash', file_hash,
  'veredito', CASE WHEN anchor_kind IS NULL AND anchor_ref IS NULL
                    AND status = 'prompt_ready' AND storage_path IS NULL AND file_hash IS NULL
                   THEN 'PASS' ELSE 'FAIL' END)
FROM public.writer_media_assets WHERE id = '00000000-0000-4000-8000-00000000f002';

-- 2. "UPLOAD" — o rastro que `uploadWriterMediaAsset` deixa após subir,
--    baixar de volta e conferir o sha256.
UPDATE public.writer_media_assets
   SET status = 'uploaded', storage_path = 'fixture/sucessor.png',
       mime_type = 'image/png', file_hash = 'hash-sucessor'
 WHERE id = '00000000-0000-4000-8000-00000000f002';

INSERT INTO smoke_etapas
SELECT '2_upload_confirmado_sem_ancora', jsonb_build_object(
  'status', status, 'file_hash', file_hash, 'anchor_kind', anchor_kind,
  'veredito', CASE WHEN status = 'uploaded' AND file_hash IS NOT NULL AND anchor_kind IS NULL
                   THEN 'PASS' ELSE 'FAIL (upload não pode ancorar)' END)
FROM public.writer_media_assets WHERE id = '00000000-0000-4000-8000-00000000f002';

-- 3. ANCORAR O PREDECESSOR — primeira ocupação, sem predecessor, sem janela.
UPDATE public.writer_media_assets
   SET anchor_kind = 'article_block', anchor_ref = 'bloco-fixture-7'
 WHERE id = '00000000-0000-4000-8000-00000000f001';

-- 4. SUBSTITUIR — a operação atômica.
INSERT INTO smoke_etapas
SELECT '4_recibo_da_rpc', public.writer_replace_media_asset(
  '09762023-d0d4-4c24-b34e-d0fdfd43f891',
  '00000000-0000-4000-8000-00000000f001',
  '00000000-0000-4000-8000-00000000f002',
  'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

-- 5. RELER AS DUAS LINHAS E JULGAR.
INSERT INTO smoke_etapas
SELECT '5_veredito', jsonb_build_object(
  'SUCCESSOR_HAS_ANCHOR', CASE WHEN n.anchor_kind = 'article_block' AND n.anchor_ref = 'bloco-fixture-7' THEN 'YES' ELSE 'NO' END,
  'PREDECESSOR_KEEPS_HISTORICAL_ANCHOR', CASE WHEN o.anchor_kind = 'article_block' AND o.anchor_ref = 'bloco-fixture-7' THEN 'YES' ELSE 'NO' END,
  'PREDECESSOR_SUPERSEDED', CASE WHEN o.superseded_at IS NOT NULL THEN 'YES' ELSE 'NO' END,
  'PREDECESSOR_REPLACED_BY_SUCCESSOR', CASE WHEN o.replaced_by_asset_id = n.id THEN 'YES' ELSE 'NO' END,
  'PURGE_AFTER_EQUALS_SUPERSEDED_PLUS_48H', CASE WHEN o.purge_after = o.superseded_at + interval '48 hours' THEN 'YES' ELSE 'NO' END,
  'SUCCESSOR_NOT_SUPERSEDED', CASE WHEN n.superseded_at IS NULL AND n.purge_after IS NULL THEN 'YES' ELSE 'NO' END,
  'UPDATED_BY_REGISTRA_O_ATOR', CASE WHEN o.updated_by = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'
                                       AND n.updated_by = 'd67ebbad-a590-45f8-8bb5-a19c6241ac1b' THEN 'YES' ELSE 'NO' END,
  'EXACTLY_ONE_CURRENT_ASSET_PER_ANCHOR', (
    SELECT CASE WHEN count(*) = 1 THEN 'YES' ELSE 'NO (' || count(*) || ')' END
      FROM public.writer_media_assets a
     WHERE a.marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
       AND a.document_id = 'smoke-m3-fixture-doc'
       AND a.anchor_kind = 'article_block' AND a.anchor_ref = 'bloco-fixture-7'
       AND a.superseded_at IS NULL AND a.status IN ('uploaded','reviewed')))
FROM public.writer_media_assets o, public.writer_media_assets n
WHERE o.id = '00000000-0000-4000-8000-00000000f001'
  AND n.id = '00000000-0000-4000-8000-00000000f002';

-- 6. IDEMPOTÊNCIA — repetir o MESMO par não move a janela.
INSERT INTO smoke_etapas
SELECT '6_repeticao_idempotente', public.writer_replace_media_asset(
  '09762023-d0d4-4c24-b34e-d0fdfd43f891',
  '00000000-0000-4000-8000-00000000f001',
  '00000000-0000-4000-8000-00000000f002',
  'd67ebbad-a590-45f8-8bb5-a19c6241ac1b');

SELECT jsonb_pretty(jsonb_object_agg(etapa, resultado)) AS smoke FROM smoke_etapas;

ROLLBACK;
