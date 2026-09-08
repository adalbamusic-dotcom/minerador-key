-- =====================================================================
-- ZERAR ARQUITETO E RADAR — SOMENTE DA MARCA ALVO
-- =====================================================================
--
-- NATUREZA DESTA OPERAÇÃO
--
-- Isto NÃO é saneamento de defeito. A auditoria de 2026-09-06 provou que os
-- registros estavam íntegros (3/3 itens do Radar, 100/100 versões, 111/111
-- eventos, 5/5 snapshots) e a continuidade entre sessões foi validada. Este
-- script é DESCARTE DELIBERADO de trabalho, autorizado explicitamente pelo
-- responsável pela marca.
--
-- A regra "proibido limpar dados para corrigir problema de interface"
-- permanece válida e NÃO é revogada por este script. Ela não se aplica aqui
-- porque não há problema de interface a corrigir.
--
-- ---------------------------------------------------------------------
-- O QUE ESTE SCRIPT FAZ
--
--   apaga  : trabalho do Arquiteto e do Radar da MARCA ALVO
--   preserva: Marca, Minerador, Planejador, Redator, Publicações,
--             usuários, permissões, integrações e TODAS as outras marcas
--
-- ---------------------------------------------------------------------
-- COMO EXECUTAR
--
--   1. Rodar com :alvo apontando para a marca. NADA é apagado sem isso.
--   2. O bloco roda inteiro em UMA transação. Qualquer divergência das
--      verificações levanta exceção e desfaz tudo.
--   3. Ler o manifesto emitido ANTES de commitar. Se o SQL editor commita
--      automaticamente, executar primeiro com :simular = true.
--
-- \set alvo '09762023-d0d4-4c24-b34e-d0fdfd43f891'
-- \set simular true    -- true = levanta exceção no fim e desfaz tudo
--
-- Sem psql, substituir :'alvo' pelo UUID e :simular por true/false.
-- =====================================================================

BEGIN;

-- Impede escrita concorrente no conjunto afetado enquanto a transação corre.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';

DO $purga$
DECLARE
  v_alvo          uuid := :'alvo';
  v_simular       boolean := :simular;
  v_marca         record;
  v_manifesto     jsonb := '{}'::jsonb;
  v_preservado    jsonb := '{}'::jsonb;
  v_depois        jsonb := '{}'::jsonb;
  v_bloqueios     text[] := ARRAY[]::text[];
  v_n             bigint;
  v_gatilho       text;
  v_gatilhos      text[] := ARRAY[
    'editorial_artifact_versions_append_only_trg',
    'editorial_version_status_events_append_only_trg',
    'editorial_decision_events_append_only_trg',
    'editorial_serp_snapshots_append_only_trg',
    'editorial_serp_reviews_append_only_trg'
  ];
  v_tabelas       text[] := ARRAY[
    'editorial_artifact_versions',
    'editorial_version_status_events',
    'editorial_decision_events',
    'editorial_serp_snapshots',
    'editorial_serp_reviews'
  ];
BEGIN

-- =====================================================================
-- 1 · IDENTIDADE DO ALVO
-- =====================================================================

IF v_alvo IS NULL THEN
  RAISE EXCEPTION 'ALVO_AUSENTE: defina :alvo com o UUID da marca. Nada foi apagado.';
END IF;

SELECT id, nome, status, owner_user_id INTO v_marca
FROM public.marcas WHERE id = v_alvo;

IF NOT FOUND THEN
  RAISE EXCEPTION 'MARCA_INEXISTENTE: % nao existe. Nada foi apagado.', v_alvo;
END IF;

RAISE NOTICE 'ALVO CONFIRMADO: % (%) status=%', v_marca.nome, v_marca.id, v_marca.status;

-- =====================================================================
-- 2 · CONJUNTO A REMOVER — nomeado explicitamente, nunca "tudo da marca"
-- =====================================================================
--
-- `stage <> 'architect'` foi substituido por condicoes POSITIVAS. Excluir
-- pelo complemento apagaria qualquer estagio futuro que ninguem revisou.

CREATE TEMP TABLE _alvo_workflow ON COMMIT DROP AS
SELECT id, subject_type, subject_id, stage, article_id, source_entity_id
FROM public.editorial_workflow_items
WHERE marca_id = v_alvo
  AND stage IN ('architect', 'radar');

CREATE TEMP TABLE _alvo_artefatos ON COMMIT DROP AS
SELECT version_id, entity_id, artifact_type
FROM public.editorial_artifact_versions
WHERE marca_id = v_alvo
  AND artifact_type IN ('article_dna', 'silo_dna', 'silo_page');

CREATE TEMP TABLE _alvo_snapshots ON COMMIT DROP AS
SELECT id FROM public.editorial_serp_snapshots WHERE marca_id = v_alvo;

CREATE TEMP TABLE _alvo_revisoes ON COMMIT DROP AS
SELECT id FROM public.editorial_serp_reviews WHERE marca_id = v_alvo;

-- =====================================================================
-- 3 · DEPENDÊNCIAS QUE INTERROMPEM — FK e dentro dos payloads
-- =====================================================================
--
-- Planejador, Redator ou Publicacoes referenciando este conjunto significa
-- que apagar deixaria a jusante orfa. Isso ABORTA, mostrando os ids.

-- 3.1 · Planejador apontando para artigo do conjunto
SELECT array_agg(format('planner:%s(article=%s)', w.id, w.article_id))
INTO v_bloqueios
FROM public.editorial_workflow_items w
WHERE w.marca_id = v_alvo AND w.stage = 'planner'
  AND w.article_id IN (SELECT article_id FROM _alvo_workflow WHERE article_id IS NOT NULL);

IF v_bloqueios IS NOT NULL AND array_length(v_bloqueios, 1) > 0 THEN
  RAISE EXCEPTION 'DEPENDENCIA_PLANEJADOR: % item(ns) do Planejador dependem do conjunto: %',
    array_length(v_bloqueios, 1), array_to_string(v_bloqueios, ', ');
END IF;

-- 3.2 · ContentPlan referenciando artigo do conjunto (payload)
SELECT array_agg(format('content_plan:%s', a.version_id))
INTO v_bloqueios
FROM public.editorial_artifact_versions a
WHERE a.marca_id = v_alvo AND a.artifact_type = 'content_plan'
  AND EXISTS (
    SELECT 1 FROM _alvo_workflow t
    WHERE t.article_id IS NOT NULL
      AND a.payload::text LIKE '%' || t.article_id || '%'
  );

IF v_bloqueios IS NOT NULL AND array_length(v_bloqueios, 1) > 0 THEN
  RAISE EXCEPTION 'DEPENDENCIA_CONTENT_PLAN: % plano(s) referenciam o conjunto: %',
    array_length(v_bloqueios, 1), array_to_string(v_bloqueios, ', ');
END IF;

-- 3.3 · Documentos do Redator
SELECT array_agg(format('document:%s', d.id))
INTO v_bloqueios
FROM public.content_documents d
WHERE d.marca_id = v_alvo
  AND EXISTS (
    SELECT 1 FROM _alvo_workflow t
    WHERE t.article_id IS NOT NULL AND d.article_id = t.article_id
  );

IF v_bloqueios IS NOT NULL AND array_length(v_bloqueios, 1) > 0 THEN
  RAISE EXCEPTION 'DEPENDENCIA_REDATOR: % documento(s) dependem do conjunto: %',
    array_length(v_bloqueios, 1), array_to_string(v_bloqueios, ', ');
END IF;

-- 3.4 · Publicações
SELECT array_agg(format('publication:%s', p.id))
INTO v_bloqueios
FROM public.publication_records p
WHERE p.marca_id = v_alvo
  AND EXISTS (
    SELECT 1 FROM _alvo_workflow t
    WHERE t.article_id IS NOT NULL AND p.article_id = t.article_id
  );

IF v_bloqueios IS NOT NULL AND array_length(v_bloqueios, 1) > 0 THEN
  RAISE EXCEPTION 'DEPENDENCIA_PUBLICACOES: % publicacao(oes) dependem do conjunto: %',
    array_length(v_bloqueios, 1), array_to_string(v_bloqueios, ', ');
END IF;

-- 3.5 · Vazamento para OUTRA marca
SELECT array_agg(format('%s(marca=%s)', a.version_id, a.marca_id))
INTO v_bloqueios
FROM public.editorial_artifact_versions a
WHERE a.marca_id <> v_alvo
  AND a.entity_id IN (SELECT entity_id FROM _alvo_artefatos);

IF v_bloqueios IS NOT NULL AND array_length(v_bloqueios, 1) > 0 THEN
  RAISE EXCEPTION 'VAZAMENTO_ENTRE_MARCAS: entidades do conjunto aparecem em outra marca: %',
    array_to_string(v_bloqueios, ', ');
END IF;

-- =====================================================================
-- 4 · MANIFESTO — contagens e IDs, antes de remover
-- =====================================================================

SELECT jsonb_build_object(
  'executadoEm',      now(),
  'marcaId',          v_alvo,
  'marcaNome',        v_marca.nome,
  'simulacao',        v_simular,
  'workflowItems',    (SELECT count(*) FROM _alvo_workflow),
  'workflowIds',      (SELECT coalesce(jsonb_agg(id), '[]'::jsonb) FROM _alvo_workflow),
  'artefatos',        (SELECT count(*) FROM _alvo_artefatos),
  'artefatoIds',      (SELECT coalesce(jsonb_agg(version_id), '[]'::jsonb) FROM _alvo_artefatos),
  'snapshotsSerp',    (SELECT count(*) FROM _alvo_snapshots),
  'revisoesSerp',     (SELECT count(*) FROM _alvo_revisoes),
  'eventosDeStatus',  (SELECT count(*) FROM public.editorial_version_status_events
                       WHERE version_id IN (SELECT version_id FROM _alvo_artefatos)),
  'eventosDeDecisao', (SELECT count(*) FROM public.editorial_decision_events
                       WHERE marca_id = v_alvo
                         AND workflow_item_id IN (SELECT id FROM _alvo_workflow))
) INTO v_manifesto;

RAISE NOTICE 'MANIFESTO: %', jsonb_pretty(v_manifesto);

-- Estado do que DEVE sobreviver, por ID e conteúdo — não só contagem.
SELECT jsonb_build_object(
  'mineradorKeywords',   (SELECT count(*) FROM public.minerador_keywords WHERE brand_id = v_alvo),
  'mineradorHash',       (SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), ''))
                          FROM public.minerador_keywords WHERE brand_id = v_alvo),
  'listasMinerador',     (SELECT count(*) FROM public.minerador_keyword_lists WHERE marca_id = v_alvo),
  'contentPlans',        (SELECT count(*) FROM public.editorial_artifact_versions
                          WHERE marca_id = v_alvo AND artifact_type = 'content_plan'),
  'documentos',          (SELECT count(*) FROM public.content_documents WHERE marca_id = v_alvo),
  'publicacoes',         (SELECT count(*) FROM public.publication_records WHERE marca_id = v_alvo),
  'workflowOutrasEtapas',(SELECT count(*) FROM public.editorial_workflow_items
                          WHERE marca_id = v_alvo AND stage NOT IN ('architect','radar')),
  'outrasMarcasWorkflow',(SELECT count(*) FROM public.editorial_workflow_items WHERE marca_id <> v_alvo),
  'outrasMarcasHash',    (SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), ''))
                          FROM public.editorial_workflow_items WHERE marca_id <> v_alvo),
  'outrasMarcasArtefato',(SELECT count(*) FROM public.editorial_artifact_versions WHERE marca_id <> v_alvo),
  'outrasArtefatoHash',  (SELECT md5(coalesce(string_agg(version_id::text, ',' ORDER BY version_id), ''))
                          FROM public.editorial_artifact_versions WHERE marca_id <> v_alvo)
) INTO v_preservado;

RAISE NOTICE 'A PRESERVAR: %', jsonb_pretty(v_preservado);

-- =====================================================================
-- 5 · SUSPENSÃO DOS GATILHOS APPEND-ONLY — nomeados, restaurados no fim
-- =====================================================================
--
-- Somente estes cinco. Nenhuma funcao, FK ou validacao de integridade e
-- removida: os gatilhos sao DESABILITADOS e reabilitados na mesma transacao.

FOREACH v_gatilho IN ARRAY v_gatilhos LOOP
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = v_gatilho AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'GATILHO_INESPERADO: % nao existe. O banco nao esta no estado previsto.', v_gatilho;
  END IF;
END LOOP;

FOR i IN 1 .. array_length(v_tabelas, 1) LOOP
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', v_tabelas[i], v_gatilhos[i]);
END LOOP;

RAISE NOTICE 'GATILHOS SUSPENSOS: %', array_to_string(v_gatilhos, ', ');

-- =====================================================================
-- 6 · REMOÇÃO — dependentes antes das origens
-- =====================================================================
--
-- Nenhum UPDATE anulando referencia para contornar validacao.

DELETE FROM public.editorial_decision_events
WHERE marca_id = v_alvo AND workflow_item_id IN (SELECT id FROM _alvo_workflow);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'decision_events: %', v_n;

DELETE FROM public.editorial_serp_reviews WHERE id IN (SELECT id FROM _alvo_revisoes);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'serp_reviews: %', v_n;

DELETE FROM public.editorial_serp_snapshots WHERE id IN (SELECT id FROM _alvo_snapshots);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'serp_snapshots: %', v_n;

DELETE FROM public.editorial_version_status_events
WHERE version_id IN (SELECT version_id FROM _alvo_artefatos);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'version_status_events: %', v_n;

DELETE FROM public.editorial_workflow_items WHERE id IN (SELECT id FROM _alvo_workflow);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'workflow_items: %', v_n;

DELETE FROM public.editorial_artifact_versions
WHERE version_id IN (SELECT version_id FROM _alvo_artefatos);
GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'artifact_versions: %', v_n;

-- =====================================================================
-- 7 · RESTAURAÇÃO DOS GATILHOS — antes de qualquer verificação
-- =====================================================================

FOR i IN 1 .. array_length(v_tabelas, 1) LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', v_tabelas[i], v_gatilhos[i]);
END LOOP;

FOREACH v_gatilho IN ARRAY v_gatilhos LOOP
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = v_gatilho AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'GATILHO_NAO_RESTAURADO: % continua desabilitado. Rollback.', v_gatilho;
  END IF;
END LOOP;

RAISE NOTICE 'GATILHOS RESTAURADOS';

-- =====================================================================
-- 8 · VERIFICAÇÃO — divergência aborta tudo
-- =====================================================================

SELECT jsonb_build_object(
  'workflowArquitetoRadar', (SELECT count(*) FROM public.editorial_workflow_items
                             WHERE marca_id = v_alvo AND stage IN ('architect','radar')),
  'artefatosArquiteto',     (SELECT count(*) FROM public.editorial_artifact_versions
                             WHERE marca_id = v_alvo
                               AND artifact_type IN ('article_dna','silo_dna','silo_page')),
  'snapshotsSerp',          (SELECT count(*) FROM public.editorial_serp_snapshots WHERE marca_id = v_alvo),
  'revisoesSerp',           (SELECT count(*) FROM public.editorial_serp_reviews WHERE marca_id = v_alvo),
  'mineradorKeywords',      (SELECT count(*) FROM public.minerador_keywords WHERE brand_id = v_alvo),
  'mineradorHash',          (SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), ''))
                             FROM public.minerador_keywords WHERE brand_id = v_alvo),
  'contentPlans',           (SELECT count(*) FROM public.editorial_artifact_versions
                             WHERE marca_id = v_alvo AND artifact_type = 'content_plan'),
  'documentos',             (SELECT count(*) FROM public.content_documents WHERE marca_id = v_alvo),
  'publicacoes',            (SELECT count(*) FROM public.publication_records WHERE marca_id = v_alvo),
  'workflowOutrasEtapas',   (SELECT count(*) FROM public.editorial_workflow_items
                             WHERE marca_id = v_alvo AND stage NOT IN ('architect','radar')),
  'outrasMarcasWorkflow',   (SELECT count(*) FROM public.editorial_workflow_items WHERE marca_id <> v_alvo),
  'outrasMarcasHash',       (SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id), ''))
                             FROM public.editorial_workflow_items WHERE marca_id <> v_alvo),
  'outrasMarcasArtefato',   (SELECT count(*) FROM public.editorial_artifact_versions WHERE marca_id <> v_alvo),
  'outrasArtefatoHash',     (SELECT md5(coalesce(string_agg(version_id::text, ',' ORDER BY version_id), ''))
                             FROM public.editorial_artifact_versions WHERE marca_id <> v_alvo)
) INTO v_depois;

RAISE NOTICE 'DEPOIS: %', jsonb_pretty(v_depois);

-- 8.1 · O conjunto alvo tem de estar vazio
IF (v_depois->>'workflowArquitetoRadar')::bigint <> 0
   OR (v_depois->>'artefatosArquiteto')::bigint <> 0
   OR (v_depois->>'snapshotsSerp')::bigint <> 0
   OR (v_depois->>'revisoesSerp')::bigint <> 0 THEN
  RAISE EXCEPTION 'CONJUNTO_NAO_ZERADO: sobrou registro do Arquiteto/Radar. Rollback. %', v_depois;
END IF;

-- 8.2 · O preservado tem de estar IDÊNTICO — ids, não só contagem
IF v_depois->>'mineradorHash'       IS DISTINCT FROM v_preservado->>'mineradorHash'
   OR v_depois->>'outrasMarcasHash' IS DISTINCT FROM v_preservado->>'outrasMarcasHash'
   OR v_depois->>'outrasArtefatoHash' IS DISTINCT FROM v_preservado->>'outrasArtefatoHash' THEN
  RAISE EXCEPTION 'PRESERVACAO_VIOLADA: conteudo preservado mudou. Rollback. antes=% depois=%',
    v_preservado, v_depois;
END IF;

IF (v_depois->>'mineradorKeywords')::bigint     <> (v_preservado->>'mineradorKeywords')::bigint
   OR (v_depois->>'contentPlans')::bigint       <> (v_preservado->>'contentPlans')::bigint
   OR (v_depois->>'documentos')::bigint         <> (v_preservado->>'documentos')::bigint
   OR (v_depois->>'publicacoes')::bigint        <> (v_preservado->>'publicacoes')::bigint
   OR (v_depois->>'workflowOutrasEtapas')::bigint <> (v_preservado->>'workflowOutrasEtapas')::bigint THEN
  RAISE EXCEPTION 'PRESERVACAO_VIOLADA: contagem preservada mudou. Rollback. antes=% depois=%',
    v_preservado, v_depois;
END IF;

-- 8.3 · Nenhuma referência órfã
SELECT count(*) INTO v_n
FROM public.editorial_version_status_events e
WHERE NOT EXISTS (
  SELECT 1 FROM public.editorial_artifact_versions a WHERE a.version_id = e.version_id
);
IF v_n > 0 THEN
  RAISE EXCEPTION 'ORFAOS_VERSION_STATUS: % evento(s) sem versao. Rollback.', v_n;
END IF;

SELECT count(*) INTO v_n
FROM public.editorial_decision_events d
WHERE d.workflow_item_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.editorial_workflow_items w WHERE w.id = d.workflow_item_id
  );
IF v_n > 0 THEN
  RAISE EXCEPTION 'ORFAOS_DECISION_EVENTS: % evento(s) sem item. Rollback.', v_n;
END IF;

RAISE NOTICE 'VERIFICACAO OK — conjunto zerado, preservado intacto, sem orfaos';

-- =====================================================================
-- 9 · SIMULAÇÃO
-- =====================================================================

IF v_simular THEN
  RAISE EXCEPTION 'SIMULACAO: tudo verificado e DESFEITO de proposito. Manifesto=% Depois=%',
    v_manifesto, v_depois;
END IF;

RAISE NOTICE 'PURGA CONCLUIDA. Revise o manifesto acima antes de encerrar a sessao.';

END
$purga$;

COMMIT;

-- =====================================================================
-- APÓS O COMMIT — verificação que o script NÃO faz por você
-- =====================================================================
--
-- 1. Abrir o Arquiteto e o Radar nas DUAS sessões. Devem vir vazios pelo
--    SERVIDOR — se vier conteudo, é recuperação local, não dado remoto.
-- 2. NÃO limpar localStorage indiscriminadamente. Recuperação local antiga
--    não pode repovoar o servidor: confirmar que nenhuma escrita nova
--    apareceu depois da purga.
-- 3. Reexecutar este script com :simular = true. Sobre estado já vazio ele
--    deve passar por todas as verificações e abortar só na simulação —
--    prova de idempotência.
-- =====================================================================
