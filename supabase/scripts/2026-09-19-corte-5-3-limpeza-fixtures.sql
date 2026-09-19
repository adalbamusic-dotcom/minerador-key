-- =====================================================================
-- CORTE 5.3 · LIMPEZA EXPLÍCITA DAS TRÊS FIXTURES DO CORTE 5.2
-- =====================================================================
--
-- ISTO NÃO É PURGA DE RETENÇÃO. Os três ativos são CORRENTES e, por isso,
-- inelegíveis — a purga nunca os tocaria, e é assim que deve ser. Isto é
-- remoção de DADO DE TESTE, por id literal, feita uma vez e com escopo
-- conferido dentro da própria transação.
--
-- Por que SQL direto e não a rota: `writer_media_assets` não tem GRANT de
-- DELETE para os papéis da API — a tentativa por PostgREST devolveu
-- "permission denied for table". Só as funções SECURITY DEFINER da M3 apagam
-- dessa tabela, e elas recusam ativo corrente. A proteção está funcionando; o
-- que falta é uma limpeza administrativa, que é o que este arquivo é.
--
-- Os objetos no Storage JÁ FORAM removidos e a ausência foi confirmada antes
-- desta execução. Apagar a linha depois do arquivo é a mesma ordem da purga.
--
-- Os três ids vêm do relatório do Corte 5.2, literalmente. Nada é descoberto
-- por consulta, e nada fora desta lista é alcançável.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_fixtures uuid[] := ARRAY[
    'f0f03f34-5f2e-4beb-bc35-3d4bd06d43b6',
    'ba077573-8b25-44ac-8815-fb05db9f16fc',
    '0f653609-2c77-4c0e-944f-e4db18c634d9'
  ]::uuid[];
  v_marca_fixture uuid := '4a737e74-e35d-4a49-8284-87b3f964e495';
  v_marca_usuario uuid := '09762023-d0d4-4c24-b34e-d0fdfd43f891';
  v_fora integer;
  v_apagadas integer;
BEGIN
  -- Guarda 1: nenhuma das três pode estar na marca do usuário nem fora do
  -- documento de fixture. Se estiver, a transação inteira aborta.
  SELECT count(*) INTO v_fora
    FROM public.writer_media_assets
   WHERE id = ANY(v_fixtures)
     AND (marca_id <> v_marca_fixture OR document_id <> 'fixture-purge-52-doc');
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'limpeza_fora_do_escopo: % linha(s) nao pertencem a fixture', v_fora;
  END IF;

  -- Guarda 2: nenhuma delas pode ser da marca do usuário, dito de outro jeito.
  IF EXISTS (SELECT 1 FROM public.writer_media_assets
              WHERE id = ANY(v_fixtures) AND marca_id = v_marca_usuario) THEN
    RAISE EXCEPTION 'limpeza_tocaria_marca_do_usuario';
  END IF;

  DELETE FROM public.writer_media_assets
   WHERE id = ANY(v_fixtures)
     AND marca_id = v_marca_fixture
     AND document_id = 'fixture-purge-52-doc';
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  -- Guarda 3: mais de três seria escopo vazando; menos é aceitável apenas se
  -- alguma já tivesse sido removida antes.
  IF v_apagadas > 3 THEN
    RAISE EXCEPTION 'limpeza_apagou_demais: %', v_apagadas;
  END IF;

  RAISE NOTICE 'fixtures removidas: %', v_apagadas;
END $$;

COMMIT;

-- =====================================================================
-- READBACK
-- =====================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'FIXTURE_CURRENT_ASSETS_REMAINING', (SELECT count(*) FROM public.writer_media_assets
    WHERE marca_id = '4a737e74-e35d-4a49-8284-87b3f964e495'),
  'FIXTURE_STORAGE_OBJECTS_REMAINING', (SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'writer-media' AND name LIKE '4a737e74%'),
  'fixtures_por_id', (SELECT count(*) FROM public.writer_media_assets WHERE id IN (
    'f0f03f34-5f2e-4beb-bc35-3d4bd06d43b6',
    'ba077573-8b25-44ac-8815-fb05db9f16fc',
    '0f653609-2c77-4c0e-944f-e4db18c634d9')),
  'documento_de_fixture_remanescente', (SELECT count(*) FROM public.content_documents
    WHERE id = 'fixture-purge-52-doc'),

  'REAL_REDACTOR_ASSETS', (SELECT count(*) FROM public.writer_media_assets
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'),
  'REAL_CURRENT_ASSETS', (SELECT count(*) FROM public.writer_media_assets
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
      AND anchor_kind IS NOT NULL AND superseded_at IS NULL),
  'REAL_WINDOW_OPEN_ASSETS', (SELECT count(*) FROM public.writer_media_assets
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND superseded_at IS NOT NULL),
  'REAL_STORAGE_OBJECTS', (SELECT count(*) FROM storage.objects
    WHERE bucket_id = 'writer-media' AND name LIKE '09762023%'),
  'REAL_4_PREDECESSORES', (SELECT count(*) FROM public.writer_media_assets WHERE id IN (
    'c4e69d77-8151-4742-8ec5-662ac6b78b54','216a832b-07db-49f3-b8a7-80af8188dfd7',
    '74455e67-2c0f-4b71-8c4a-f68acba72677','6ba107e1-de51-4452-9b1f-3ee11707a5de')),
  'janelas_reais_vencem_em', (SELECT jsonb_agg(jsonb_build_object(
      'assetId', left(id::text, 8), 'purge_after', purge_after, 'faltam', purge_after - now()) ORDER BY purge_after)
    FROM public.writer_media_assets
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND purge_after IS NOT NULL),

  'DNA_intacto', (SELECT count(*) FROM public.editorial_artifact_versions)
)) AS fechamento;
