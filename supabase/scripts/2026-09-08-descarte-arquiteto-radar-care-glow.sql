-- =====================================================================
-- DESCARTE DEFINITIVO — Arquiteto e Radar da Care Glow
-- =====================================================================
--
-- SQL PostgreSQL puro. Copiar e colar no editor SQL do Supabase e executar.
-- Sem \set, sem placeholder, sem substituição manual. A marca já está fixa.
--
-- ---------------------------------------------------------------------
-- NATUREZA E AUTORIZAÇÃO
--
-- Descarte DEFINITIVO de dados de teste, autorizado pelo responsável pela
-- marca. Backup foi dispensado por decisão explícita: não há restauração.
--
-- Isto NÃO é saneamento de defeito. A auditoria de 2026-09-06 provou os
-- registros íntegros e a continuidade entre sessões validada. A regra
-- "proibido limpar dados para corrigir problema de interface" permanece
-- válida e não é revogada — ela não se aplica porque não há problema de
-- interface a corrigir.
--
-- ---------------------------------------------------------------------
-- COMO EXECUTAR — DUAS VEZES
--
--   1ª execução: deixe v_simular := true  (linha marcada abaixo).
--      Percorre tudo, imprime o manifesto e ABORTA de propósito.
--      Nada é apagado. Leia o manifesto.
--
--   2ª execução: mude para v_simular := false.
--      Apaga de verdade.
--
--   3ª execução (depois): volte para true. Sobre estado já vazio deve
--      passar por todas as verificações — prova de idempotência.
--
-- O bloco inteiro roda em UMA transação implícita: qualquer exceção
-- desfaz tudo, inclusive o estado dos gatilhos.
-- =====================================================================

DO $descarte$
DECLARE
  -- ↓↓↓ A ÚNICA LINHA A MUDAR ↓↓↓
  v_simular  boolean := true;
  -- ↑↑↑ true = ensaia e desfaz · false = apaga de verdade ↑↑↑

  v_alvo     uuid := '09762023-d0d4-4c24-b34e-d0fdfd43f891';  -- Care Glow

  v_marca         record;
  v_workflow      uuid[];
  v_artefatos     uuid[];
  v_snapshots     uuid[];
  v_revisoes      uuid[];
  v_articles      text[];
  v_bloqueios     text[];
  v_manifesto     jsonb;
  v_antes         jsonb;
  v_depois        jsonb;
  v_n             bigint;
  v_estados       jsonb := '{}'::jsonb;
  v_par           record;
  v_acao          text;

  -- Os gatilhos append-only que impedem DELETE nestas tabelas.
  v_gatilhos text[][] := ARRAY[
    ARRAY['editorial_artifact_versions',     'editorial_artifact_versions_append_only_trg'],
    ARRAY['editorial_version_status_events', 'editorial_version_status_events_append_only_trg'],
    ARRAY['editorial_decision_events',       'editorial_decision_events_append_only_trg'],
    ARRAY['editorial_serp_snapshots',        'editorial_serp_snapshots_append_only_trg'],
    ARRAY['editorial_serp_reviews',          'editorial_serp_reviews_append_only_trg']
  ];
BEGIN

-- =====================================================================
-- 1 · IDENTIDADE
-- =====================================================================

SELECT id, nome, status INTO v_marca FROM public.marcas WHERE id = v_alvo;
IF NOT FOUND THEN
  RAISE EXCEPTION 'MARCA_INEXISTENTE: % nao existe neste projeto. Nada foi apagado.', v_alvo;
END IF;
RAISE NOTICE 'ALVO: % (%) status=%', v_marca.nome, v_marca.id, v_marca.status;

-- =====================================================================
-- 2 · CONJUNTO — condições positivas, nunca "tudo da marca"
-- =====================================================================
--
-- `stage = 'architect'` cobre TODOS os subject_type do Arquiteto:
-- territory, territorial_ai_review, territorial_serp_assessment,
-- architecture_analysis, article_formation_analysis,
-- article_formation_serp_assessment, silo_working_copy,
-- arquiteto_homologation_round — e os itens de artigo.
--
-- `brand_dna` e `content_plan` NAO entram: sao Marca e Planejador.

SELECT array_agg(id), array_agg(DISTINCT article_id) FILTER (WHERE article_id IS NOT NULL)
INTO v_workflow, v_articles
FROM public.editorial_workflow_items
WHERE marca_id = v_alvo AND stage IN ('architect', 'radar');

SELECT array_agg(version_id) INTO v_artefatos
FROM public.editorial_artifact_versions
WHERE marca_id = v_alvo AND artifact_type IN ('article_dna', 'silo_dna', 'silo_page');

SELECT array_agg(id) INTO v_snapshots
FROM public.editorial_serp_snapshots WHERE marca_id = v_alvo;

SELECT array_agg(id) INTO v_revisoes
FROM public.editorial_serp_reviews WHERE marca_id = v_alvo;

v_workflow  := coalesce(v_workflow,  ARRAY[]::uuid[]);
v_artefatos := coalesce(v_artefatos, ARRAY[]::uuid[]);
v_snapshots := coalesce(v_snapshots, ARRAY[]::uuid[]);
v_revisoes  := coalesce(v_revisoes,  ARRAY[]::uuid[]);
v_articles  := coalesce(v_articles,  ARRAY[]::text[]);

-- =====================================================================
-- 3 · DEPENDÊNCIAS QUE ABORTAM — com os identificadores à vista
-- =====================================================================

SELECT array_agg(format('planner:%s(article=%s)', id, article_id)) INTO v_bloqueios
FROM public.editorial_workflow_items
WHERE marca_id = v_alvo AND stage = 'planner' AND article_id = ANY(v_articles);
IF coalesce(array_length(v_bloqueios,1),0) > 0 THEN
  RAISE EXCEPTION 'DEPENDENCIA_PLANEJADOR: %', array_to_string(v_bloqueios, ', ');
END IF;

SELECT array_agg(format('content_plan:%s', a.version_id)) INTO v_bloqueios
FROM public.editorial_artifact_versions a
WHERE a.marca_id = v_alvo AND a.artifact_type = 'content_plan'
  AND EXISTS (SELECT 1 FROM unnest(v_articles) art WHERE a.payload::text LIKE '%' || art || '%');
IF coalesce(array_length(v_bloqueios,1),0) > 0 THEN
  RAISE EXCEPTION 'DEPENDENCIA_CONTENT_PLAN: %', array_to_string(v_bloqueios, ', ');
END IF;

SELECT array_agg(format('document:%s', id)) INTO v_bloqueios
FROM public.content_documents WHERE marca_id = v_alvo AND article_id = ANY(v_articles);
IF coalesce(array_length(v_bloqueios,1),0) > 0 THEN
  RAISE EXCEPTION 'DEPENDENCIA_REDATOR: %', array_to_string(v_bloqueios, ', ');
END IF;

SELECT array_agg(format('publication:%s', id)) INTO v_bloqueios
FROM public.publication_records WHERE marca_id = v_alvo AND article_id = ANY(v_articles);
IF coalesce(array_length(v_bloqueios,1),0) > 0 THEN
  RAISE EXCEPTION 'DEPENDENCIA_PUBLICACOES: %', array_to_string(v_bloqueios, ', ');
END IF;

SELECT array_agg(format('%s(marca=%s)', version_id, marca_id)) INTO v_bloqueios
FROM public.editorial_artifact_versions
WHERE marca_id <> v_alvo AND entity_id IN (
  SELECT entity_id FROM public.editorial_artifact_versions WHERE version_id = ANY(v_artefatos)
);
IF coalesce(array_length(v_bloqueios,1),0) > 0 THEN
  RAISE EXCEPTION 'VAZAMENTO_ENTRE_MARCAS: %', array_to_string(v_bloqueios, ', ');
END IF;

-- =====================================================================
-- 4 · MANIFESTO E ESTADO A PRESERVAR
-- =====================================================================

SELECT jsonb_build_object(
  'marca', v_marca.nome, 'marcaId', v_alvo, 'simulacao', v_simular,
  'workflowTotal',   array_length(v_workflow, 1),
  'workflowPorTipo', (SELECT coalesce(jsonb_object_agg(t, n), '{}'::jsonb) FROM (
                        SELECT subject_type || '/' || stage AS t, count(*) AS n
                        FROM public.editorial_workflow_items
                        WHERE id = ANY(v_workflow) GROUP BY 1) s),
  'artefatosPorTipo',(SELECT coalesce(jsonb_object_agg(artifact_type, n), '{}'::jsonb) FROM (
                        SELECT artifact_type, count(*) AS n
                        FROM public.editorial_artifact_versions
                        WHERE version_id = ANY(v_artefatos) GROUP BY 1) s),
  'snapshotsSerp',   array_length(v_snapshots, 1),
  'revisoesSerp',    array_length(v_revisoes, 1),
  'eventosDeStatus', (SELECT count(*) FROM public.editorial_version_status_events
                      WHERE version_id = ANY(v_artefatos)),
  'eventosDeDecisao',(SELECT count(*) FROM public.editorial_decision_events
                      WHERE marca_id = v_alvo AND workflow_item_id = ANY(v_workflow))
) INTO v_manifesto;
RAISE NOTICE 'MANIFESTO: %', jsonb_pretty(v_manifesto);

SELECT jsonb_build_object(
  'mineradorKeywords', (SELECT count(*) FROM public.minerador_keywords WHERE brand_id = v_alvo),
  'mineradorHash',     (SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), ''))
                        FROM public.minerador_keywords WHERE brand_id = v_alvo),
  'listasMinerador',   (SELECT count(*) FROM public.minerador_keyword_lists WHERE marca_id = v_alvo),
  'brandDna',          (SELECT count(*) FROM public.editorial_artifact_versions
                        WHERE marca_id = v_alvo AND artifact_type = 'brand_dna'),
  'contentPlans',      (SELECT count(*) FROM public.editorial_artifact_versions
                        WHERE marca_id = v_alvo AND artifact_type = 'content_plan'),
  'documentos',        (SELECT count(*) FROM public.content_documents WHERE marca_id = v_alvo),
  'publicacoes',       (SELECT count(*) FROM public.publication_records WHERE marca_id = v_alvo),
  'outrasEtapas',      (SELECT count(*) FROM public.editorial_workflow_items
                        WHERE marca_id = v_alvo AND stage NOT IN ('architect','radar')),
  'outrasMarcasWf',    (SELECT count(*) FROM public.editorial_workflow_items WHERE marca_id <> v_alvo),
  'outrasMarcasWfHash',(SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), ''))
                        FROM public.editorial_workflow_items WHERE marca_id <> v_alvo),
  'outrasMarcasArt',   (SELECT count(*) FROM public.editorial_artifact_versions WHERE marca_id <> v_alvo),
  'outrasMarcasArtHash',(SELECT md5(coalesce(string_agg(version_id::text, ',' ORDER BY version_id), ''))
                        FROM public.editorial_artifact_versions WHERE marca_id <> v_alvo)
) INTO v_antes;
RAISE NOTICE 'A PRESERVAR: %', jsonb_pretty(v_antes);

-- =====================================================================
-- 5 · GATILHOS — estado REAL capturado, restaurado exatamente
-- =====================================================================
--
-- `ENABLE TRIGGER` sempre grava 'O'. Se o gatilho estivesse em replica,
-- always ou já desabilitado, reabilitar assim MUDARIA o estado dele. Por
-- isso o valor de `tgenabled` e lido antes e reposto tal como estava.

FOR v_par IN SELECT v_gatilhos[i][1] AS tabela, v_gatilhos[i][2] AS gatilho
             FROM generate_subscripts(v_gatilhos, 1) AS i LOOP
  SELECT t.tgenabled INTO v_acao
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE t.tgname = v_par.gatilho AND c.relname = v_par.tabela AND NOT t.tgisinternal;

  IF v_acao IS NULL THEN
    RAISE EXCEPTION 'GATILHO_AUSENTE: %.% nao existe. O banco nao esta no estado previsto.',
      v_par.tabela, v_par.gatilho;
  END IF;

  v_estados := v_estados || jsonb_build_object(v_par.gatilho, v_acao);
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', v_par.tabela, v_par.gatilho);
END LOOP;

RAISE NOTICE 'GATILHOS SUSPENSOS. Estados originais: %', v_estados;

-- =====================================================================
-- 6 · REMOÇÃO — dependentes antes das origens
-- =====================================================================

DELETE FROM public.editorial_decision_events
WHERE marca_id = v_alvo AND workflow_item_id = ANY(v_workflow);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'decision_events: %', v_n;

DELETE FROM public.editorial_serp_reviews WHERE id = ANY(v_revisoes);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'serp_reviews: %', v_n;

DELETE FROM public.editorial_serp_snapshots WHERE id = ANY(v_snapshots);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'serp_snapshots: %', v_n;

DELETE FROM public.editorial_version_status_events WHERE version_id = ANY(v_artefatos);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'version_status_events: %', v_n;

DELETE FROM public.editorial_workflow_items WHERE id = ANY(v_workflow);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'workflow_items: %', v_n;

DELETE FROM public.editorial_artifact_versions WHERE version_id = ANY(v_artefatos);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'artifact_versions: %', v_n;

-- =====================================================================
-- 7 · GATILHOS DE VOLTA — ao estado exato de antes
-- =====================================================================

FOR v_par IN SELECT v_gatilhos[i][1] AS tabela, v_gatilhos[i][2] AS gatilho
             FROM generate_subscripts(v_gatilhos, 1) AS i LOOP
  v_acao := v_estados->>v_par.gatilho;
  EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I', v_par.tabela,
    CASE v_acao
      WHEN 'O' THEN 'ENABLE'
      WHEN 'D' THEN 'DISABLE'
      WHEN 'R' THEN 'ENABLE REPLICA'
      WHEN 'A' THEN 'ENABLE ALWAYS'
      ELSE 'ENABLE'
    END, v_par.gatilho);

  SELECT t.tgenabled INTO v_acao
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE t.tgname = v_par.gatilho AND c.relname = v_par.tabela;

  IF v_acao IS DISTINCT FROM (v_estados->>v_par.gatilho) THEN
    RAISE EXCEPTION 'GATILHO_NAO_RESTAURADO: %.% esta em % e era %. Rollback.',
      v_par.tabela, v_par.gatilho, v_acao, v_estados->>v_par.gatilho;
  END IF;
END LOOP;
RAISE NOTICE 'GATILHOS RESTAURADOS AO ESTADO ORIGINAL';

-- =====================================================================
-- 8 · VERIFICAÇÃO — divergência desfaz tudo
-- =====================================================================

SELECT jsonb_build_object(
  'wfArquitetoRadar', (SELECT count(*) FROM public.editorial_workflow_items
                       WHERE marca_id = v_alvo AND stage IN ('architect','radar')),
  'artefatosArq',     (SELECT count(*) FROM public.editorial_artifact_versions
                       WHERE marca_id = v_alvo AND artifact_type IN ('article_dna','silo_dna','silo_page')),
  'snapshotsSerp',    (SELECT count(*) FROM public.editorial_serp_snapshots WHERE marca_id = v_alvo),
  'revisoesSerp',     (SELECT count(*) FROM public.editorial_serp_reviews WHERE marca_id = v_alvo),
  'mineradorKeywords',(SELECT count(*) FROM public.minerador_keywords WHERE brand_id = v_alvo),
  'mineradorHash',    (SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), ''))
                       FROM public.minerador_keywords WHERE brand_id = v_alvo),
  'listasMinerador',  (SELECT count(*) FROM public.minerador_keyword_lists WHERE marca_id = v_alvo),
  'brandDna',         (SELECT count(*) FROM public.editorial_artifact_versions
                       WHERE marca_id = v_alvo AND artifact_type = 'brand_dna'),
  'contentPlans',     (SELECT count(*) FROM public.editorial_artifact_versions
                       WHERE marca_id = v_alvo AND artifact_type = 'content_plan'),
  'documentos',       (SELECT count(*) FROM public.content_documents WHERE marca_id = v_alvo),
  'publicacoes',      (SELECT count(*) FROM public.publication_records WHERE marca_id = v_alvo),
  'outrasEtapas',     (SELECT count(*) FROM public.editorial_workflow_items
                       WHERE marca_id = v_alvo AND stage NOT IN ('architect','radar')),
  'outrasMarcasWf',   (SELECT count(*) FROM public.editorial_workflow_items WHERE marca_id <> v_alvo),
  'outrasMarcasWfHash',(SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), ''))
                       FROM public.editorial_workflow_items WHERE marca_id <> v_alvo),
  'outrasMarcasArt',  (SELECT count(*) FROM public.editorial_artifact_versions WHERE marca_id <> v_alvo),
  'outrasMarcasArtHash',(SELECT md5(coalesce(string_agg(version_id::text, ',' ORDER BY version_id), ''))
                       FROM public.editorial_artifact_versions WHERE marca_id <> v_alvo)
) INTO v_depois;
RAISE NOTICE 'DEPOIS: %', jsonb_pretty(v_depois);

IF (v_depois->>'wfArquitetoRadar')::bigint <> 0 OR (v_depois->>'artefatosArq')::bigint <> 0
   OR (v_depois->>'snapshotsSerp')::bigint <> 0 OR (v_depois->>'revisoesSerp')::bigint <> 0 THEN
  RAISE EXCEPTION 'CONJUNTO_NAO_ZERADO: sobrou registro. Rollback. %', v_depois;
END IF;

-- Preservação por HASH DE IDS, não só contagem.
IF v_depois->>'mineradorHash'        IS DISTINCT FROM v_antes->>'mineradorHash'
   OR v_depois->>'outrasMarcasWfHash'  IS DISTINCT FROM v_antes->>'outrasMarcasWfHash'
   OR v_depois->>'outrasMarcasArtHash' IS DISTINCT FROM v_antes->>'outrasMarcasArtHash' THEN
  RAISE EXCEPTION 'PRESERVACAO_VIOLADA (conteudo). Rollback. antes=% depois=%', v_antes, v_depois;
END IF;

IF (v_depois->>'mineradorKeywords')::bigint <> (v_antes->>'mineradorKeywords')::bigint
   OR (v_depois->>'listasMinerador')::bigint <> (v_antes->>'listasMinerador')::bigint
   OR (v_depois->>'brandDna')::bigint        <> (v_antes->>'brandDna')::bigint
   OR (v_depois->>'contentPlans')::bigint    <> (v_antes->>'contentPlans')::bigint
   OR (v_depois->>'documentos')::bigint      <> (v_antes->>'documentos')::bigint
   OR (v_depois->>'publicacoes')::bigint     <> (v_antes->>'publicacoes')::bigint
   OR (v_depois->>'outrasEtapas')::bigint    <> (v_antes->>'outrasEtapas')::bigint THEN
  RAISE EXCEPTION 'PRESERVACAO_VIOLADA (contagem). Rollback. antes=% depois=%', v_antes, v_depois;
END IF;

SELECT count(*) INTO v_n FROM public.editorial_version_status_events e
WHERE NOT EXISTS (SELECT 1 FROM public.editorial_artifact_versions a WHERE a.version_id = e.version_id);
IF v_n > 0 THEN RAISE EXCEPTION 'ORFAOS_VERSION_STATUS: %. Rollback.', v_n; END IF;

SELECT count(*) INTO v_n FROM public.editorial_decision_events d
WHERE d.workflow_item_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.editorial_workflow_items w WHERE w.id = d.workflow_item_id);
IF v_n > 0 THEN RAISE EXCEPTION 'ORFAOS_DECISION_EVENTS: %. Rollback.', v_n; END IF;

RAISE NOTICE 'VERIFICACAO OK — conjunto zerado, preservado intacto, sem orfaos';

-- =====================================================================
-- 9 · SIMULAÇÃO
-- =====================================================================

IF v_simular THEN
  RAISE EXCEPTION E'SIMULACAO CONCLUIDA — NADA FOI APAGADO.\nManifesto: %\nDepois: %\nPara apagar de verdade, mude v_simular para false.',
    jsonb_pretty(v_manifesto), jsonb_pretty(v_depois);
END IF;

RAISE NOTICE 'DESCARTE CONCLUIDO. Manifesto: %', jsonb_pretty(v_manifesto);

END
$descarte$;

-- =====================================================================
-- CONFERÊNCIA APÓS O DESCARTE — rodar separado, somente leitura
-- =====================================================================
--
-- SELECT jsonb_pretty(jsonb_build_object(
--   'wfArquitetoRadar', (SELECT count(*) FROM public.editorial_workflow_items
--     WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND stage IN ('architect','radar')),
--   'artefatosArq', (SELECT count(*) FROM public.editorial_artifact_versions
--     WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
--       AND artifact_type IN ('article_dna','silo_dna','silo_page')),
--   'serp', (SELECT count(*) FROM public.editorial_serp_snapshots
--     WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'),
--   'mineradorPreservado', (SELECT count(*) FROM public.minerador_keywords
--     WHERE brand_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'),
--   'gatilhos', (SELECT jsonb_object_agg(tgname, tgenabled) FROM pg_trigger
--     WHERE tgname LIKE 'editorial_%_append_only_trg')
-- ));
--
-- Os quatro primeiros devem ser 0, 0, 0 e o número original do Minerador.
-- Todos os gatilhos devem estar em "O".
--
-- Depois: abrir Arquiteto e Radar nas DUAS sessões. Devem vir vazios PELO
-- SERVIDOR. Se vier conteúdo, é recuperação local — não dado remoto, e não
-- pode voltar ao servidor. Não limpar localStorage indiscriminadamente.
-- =====================================================================
