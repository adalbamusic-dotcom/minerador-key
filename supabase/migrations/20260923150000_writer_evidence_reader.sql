-- ---------------------------------------------------------------------------
-- Leitor de evidencias do Redator: manifesto, fatias e divergencias.
--
-- ESTADO: NAO APLICADA. Escrita em 2026-09-23 pela SDD
-- `docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md`
-- (secoes 4.1, 5, 6 e 10) e pelo adendo de decisoes
-- `docs/07-redator/propostas/adendo-leitor-evidencias-decisoes-2026-09-23.md`.
-- Obedece a SDD de egress (`docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md`,
-- R1-R24): o banco mede e pagina, a aplicacao nunca baixa MB para medir.
--
-- COMO APLICAR (usuario, manualmente):
--
--   npx supabase db query --linked -f supabase/migrations/20260923150000_writer_evidence_reader.sql
--   npx supabase migration repair --status applied 20260923150000 --linked
--
-- NUNCA `supabase db push`: so parte das migrations consta no historico
-- remoto e o push tentaria reaplicar a cadeia inteira.
--
-- O QUE ESTA MIGRATION CRIA
--
--   1. `writer_evidence_manifest(p_brand_id, p_document_id)`: so leitura.
--      Devolve, por caminho, `octet_length(x::text)` e `jsonb_array_length`
--      do documento (bundle congelado do Radar ate o 3o nivel de `observed`),
--      do elemento de `analysisVersions` da versao entregue, da corrida dessa
--      versao em `radar_analysis_runs`, dos snapshots SERP do artigo, das
--      versoes de DNA referenciadas pelo documento, das versoes de BrandDNA
--      e de Skill da marca, do parecer SERP de formacao do ArticleDNA fixado e das
--      transcricoes dos videos do bundle. Nenhum valor de payload sai: so
--      tamanho, contagem, hash, versao, data e status.
--   2. `writer_evidence_slice(...)`: so leitura. Pagina array com
--      `jsonb_array_elements ... WITH ORDINALITY`, fatia objeto por chave e
--      texto longo por faixa de caracteres, com teto de bytes por pagina.
--      Cobre `content_documents`, `radar_analysis_runs`,
--      `radar_video_source_texts`, `editorial_artifact_versions` e o elemento
--      de `analysisVersions` por `versionId`.
--   3. `writer_evidence_divergences`: registro de divergencia entre evidencia
--      e DNA. RLS por marca; insercao so pelo service_role (rota do servidor);
--      a IA so cria registro `aberta`; status muda so por decisao humana;
--      nada e apagado.
--
-- ISOLAMENTO (SDD secao 6; AGENTS.md secao 5; SDD de egress R4)
--
-- O service_role ignora RLS. Por isso as duas funcoes recebem `p_brand_id`
-- OBRIGATORIO e filtram marca E documento/artigo em TODA consulta. Todo id
-- secundario (item do Radar, versao de analise, corrida, snapshot, versao de
-- DNA, video) e resolvido DENTRO da funcao a partir da linha do documento;
-- o chamador escolhe so a fonte e o caminho. Marca errada devolve vazio.
-- `SECURITY INVOKER`; `EXECUTE` revogado de PUBLIC, anon e authenticated e
-- concedido so ao service_role.
--
-- O QUE ELA NAO FAZ
--
-- Nao altera nenhuma tabela existente, nenhum dado, nenhuma policy, nenhum
-- escopo MCP (`writer_mcp_grants.scopes` segue com o mesmo CHECK: opcao A da
-- SDD) e nenhum gatilho existente. Nao liga nada: enquanto o codigo nao
-- chamar as funcoes, elas ficam inertes.
--
-- CATALOGO CONFERIDO EM 2026-09-23 (consulta agregada a information_schema,
-- pg_proc, pg_indexes, pg_class, pg_policies; nenhum dado de cliente lido):
-- PostgreSQL 17.6; colunas das 9 tabelas usadas batem com as referencias
-- abaixo; nenhuma funcao `writer_evidence_*` e nenhuma tabela
-- `writer_evidence_divergences` existiam; o service_role tem SELECT nas 8
-- tabelas lidas; `canonical_actor_can_access_brand(uuid, uuid)` existe.
-- ---------------------------------------------------------------------------

BEGIN;

-- 0. Pre-condicoes -----------------------------------------------------------
-- Se o banco divergir do que foi conferido, a migration para aqui em vez de
-- criar funcoes que leriam colunas inexistentes.
DO $pre$
DECLARE
  faltando text;
BEGIN
  SELECT string_agg(esperado.tabela || '.' || esperado.coluna, ', ')
    INTO faltando
    FROM (VALUES
      ('content_documents', 'id'), ('content_documents', 'marca_id'), ('content_documents', 'article_id'),
      ('content_documents', 'article_dna_version_id'), ('content_documents', 'content_hash'),
      ('content_documents', 'status'), ('content_documents', 'payload'), ('content_documents', 'updated_at'),
      ('editorial_workflow_items', 'id'), ('editorial_workflow_items', 'marca_id'), ('editorial_workflow_items', 'subject_type'),
      ('editorial_workflow_items', 'subject_id'), ('editorial_workflow_items', 'article_id'), ('editorial_workflow_items', 'stage'),
      ('editorial_workflow_items', 'state'), ('editorial_workflow_items', 'payload'), ('editorial_workflow_items', 'updated_at'),
      ('editorial_artifact_versions', 'version_id'), ('editorial_artifact_versions', 'entity_id'),
      ('editorial_artifact_versions', 'marca_id'), ('editorial_artifact_versions', 'artifact_type'),
      ('editorial_artifact_versions', 'version_number'), ('editorial_artifact_versions', 'status'),
      ('editorial_artifact_versions', 'content_hash'), ('editorial_artifact_versions', 'payload'),
      ('editorial_artifact_versions', 'created_at'),
      ('radar_analysis_runs', 'workflow_item_id'), ('radar_analysis_runs', 'version_id'), ('radar_analysis_runs', 'marca_id'),
      ('radar_analysis_runs', 'article_id'), ('radar_analysis_runs', 'payload'), ('radar_analysis_runs', 'updated_at'),
      ('radar_video_source_texts', 'brand_id'), ('radar_video_source_texts', 'video_source_id'),
      ('radar_video_source_texts', 'content_kind'), ('radar_video_source_texts', 'transcript_text'),
      ('radar_video_source_texts', 'segments'), ('radar_video_source_texts', 'content_hash'),
      ('radar_video_source_texts', 'processing_version'), ('radar_video_source_texts', 'language_code'),
      ('radar_video_source_texts', 'created_at'),
      ('radar_article_video_sources', 'brand_id'), ('radar_article_video_sources', 'article_id'),
      ('radar_article_video_sources', 'video_source_id'), ('radar_article_video_sources', 'status'),
      ('editorial_serp_snapshots', 'id'), ('editorial_serp_snapshots', 'marca_id'), ('editorial_serp_snapshots', 'article_id'),
      ('editorial_serp_snapshots', 'snapshot_version'), ('editorial_serp_snapshots', 'content_hash'),
      ('editorial_serp_snapshots', 'status'), ('editorial_serp_snapshots', 'payload'), ('editorial_serp_snapshots', 'created_at'),
      ('editorial_serp_reviews', 'marca_id'), ('editorial_serp_reviews', 'article_id'), ('editorial_serp_reviews', 'snapshot_id'),
      ('editorial_serp_reviews', 'status'), ('editorial_serp_reviews', 'created_at'),
      ('writer_mcp_grants', 'id'), ('writer_mcp_grants', 'marca_id'), ('writer_mcp_grants', 'actor_user_id'),
      ('writer_mcp_grants', 'status'), ('writer_mcp_grants', 'scopes')
    ) AS esperado(tabela, coluna)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns AS c
      WHERE c.table_schema = 'public' AND c.table_name = esperado.tabela AND c.column_name = esperado.coluna
   );
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'writer_evidence_reader: colunas esperadas ausentes: %', faltando;
  END IF;

  IF to_regprocedure('public.canonical_actor_can_access_brand(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'writer_evidence_reader: canonical_actor_can_access_brand(uuid, uuid) ausente.';
  END IF;

  IF to_regclass('public.writer_evidence_divergences') IS NOT NULL THEN
    RAISE EXCEPTION 'writer_evidence_reader: writer_evidence_divergences ja existe; esta migration nao reescreve.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc AS p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('writer_evidence_manifest', 'writer_evidence_slice',
                         'writer_evidence_divergences_guard_insert', 'writer_evidence_divergences_guard_update',
                         'writer_evidence_divergences_refuse_delete')
  ) THEN
    RAISE EXCEPTION 'writer_evidence_reader: funcoes writer_evidence_* ja existem; esta migration nao reescreve.';
  END IF;
END
$pre$;

-- 1. Manifesto ---------------------------------------------------------------
--
-- Uma linha por fonte ou caminho. Colunas fixas:
--
--   source          document | analysis_version | radar_run | serp_snapshot |
--                   artifact_version | architect_formation | video_text
--   ref_id          id da linha de origem (documento, versao, corrida,
--                   snapshot, versao de DNA, item do parecer, video)
--   kind            papel da linha (ex.: bundle, article_dna, delivered,
--                   latest, transcript_text, segments)
--   json_path       caminho dentro do payload daquela origem; e o caminho que
--                   `writer_evidence_slice` aceita para a mesma `source`
--   value_type      jsonb_typeof do valor, ou 'text' para coluna texto
--   bytes           octet_length do texto JSON (bytes reais, nao caracteres)
--   items           jsonb_array_length para array; numero de chaves para objeto
--   content_hash, version_number, observed_at, status, note: metadados da
--                   origem; `note` leva um identificador curto (bundleId,
--                   serpSnapshotId, status da revisao humana, subject_id,
--                   maior versao existente da mesma entidade, idioma)
--
-- Ids que nao sao uuid valido nunca sao convertidos: a comparacao usa CASE
-- com a expressao regular antes do cast, para nao depender da ordem de
-- avaliacao de AND.
CREATE FUNCTION public.writer_evidence_manifest(p_brand_id uuid, p_document_id text)
RETURNS TABLE (
  source text,
  ref_id text,
  kind text,
  json_path text[],
  value_type text,
  bytes bigint,
  items integer,
  content_hash text,
  version_number integer,
  observed_at timestamptz,
  status text,
  note text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  WITH
  doc AS (
    SELECT d.id,
           d.article_id,
           d.content_hash,
           d.updated_at,
           d.status,
           d.article_dna_version_id,
           d.payload AS pl,
           d.payload -> 'importedContext' -> 'dossier' AS dossie,
           d.payload -> 'importedContext' -> 'dossier' -> 'bundle' AS bundle,
           d.payload -> 'radarOrigin' ->> 'radarItemId' AS radar_item_txt,
           d.payload -> 'radarOrigin' ->> 'analysisVersionId' AS analysis_version_id
      FROM public.content_documents AS d
     WHERE p_brand_id IS NOT NULL
       AND d.marca_id = p_brand_id
       AND d.id = p_document_id
  ),
  radar_item AS (
    SELECT w.id, w.payload -> 'analysisVersions' AS versoes, doc.analysis_version_id, doc.article_id
      FROM doc
      JOIN public.editorial_workflow_items AS w
        ON w.marca_id = p_brand_id
       AND w.stage = 'radar'
       AND w.article_id = doc.article_id
       AND w.id = CASE WHEN doc.radar_item_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       THEN doc.radar_item_txt::uuid END
  ),
  versao AS (
    SELECT ri.id AS item_id, e.valor, e.ordem
      FROM radar_item AS ri
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ri.versoes) = 'array' THEN ri.versoes ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(valor, ordem)
     WHERE e.valor ->> 'versionId' = ri.analysis_version_id
     ORDER BY e.ordem DESC
     LIMIT 1
  ),
  corrida AS (
    SELECT r.version_id, r.payload AS pl, r.updated_at
      FROM doc
      JOIN radar_item AS ri ON true
      JOIN public.radar_analysis_runs AS r
        ON r.marca_id = p_brand_id
       AND r.workflow_item_id = ri.id
       AND r.version_id = doc.analysis_version_id
       AND r.article_id = doc.article_id
  ),
  -- O `serpSnapshotId` da versao entregue NAO e o uuid da linha: e o id do
  -- registro dentro do payload (`payload.id` ou `payload.research.id`).
  -- Medido em 2026-09-23 (agregado): 2 de 2 versoes entregues com id nao-uuid,
  -- 0 casando pelo uuid, 1 de 1 casando pelo payload em cada artigo. E a mesma
  -- regra de `SerpSnapshotRepository.findRemoteSnapshot` (Radar). Comparacao
  -- em texto: nenhum cast de uuid sobre id que nao e uuid.
  snapshot_entregue AS (
    SELECT s.id, s.snapshot_version, s.content_hash, s.status, s.created_at, s.payload
      FROM doc
      JOIN versao AS v ON true
      JOIN public.editorial_serp_snapshots AS s
        ON s.marca_id = p_brand_id
       AND s.article_id = doc.article_id
       AND (s.id::text = (v.valor -> 'payload' ->> 'serpSnapshotId')
            OR s.payload ->> 'id' = (v.valor -> 'payload' ->> 'serpSnapshotId')
            OR s.payload -> 'research' ->> 'id' = (v.valor -> 'payload' ->> 'serpSnapshotId'))
     ORDER BY s.snapshot_version DESC
     LIMIT 1
  ),
  snapshot_recente AS (
    SELECT s.id, s.snapshot_version, s.content_hash, s.status, s.created_at, s.payload
      FROM doc
      CROSS JOIN LATERAL (
        SELECT x.id, x.snapshot_version, x.content_hash, x.status, x.created_at, x.payload
          FROM public.editorial_serp_snapshots AS x
         WHERE x.marca_id = p_brand_id
           AND x.article_id = doc.article_id
         ORDER BY x.snapshot_version DESC
         LIMIT 1
      ) AS s
     WHERE NOT EXISTS (SELECT 1 FROM snapshot_entregue AS se WHERE se.id = s.id)
  ),
  refs AS (
    SELECT x.version_id, string_agg(DISTINCT x.papel, ',') AS papeis
      FROM doc
      CROSS JOIN LATERAL (
        SELECT doc.pl -> 'articleDnaRef' ->> 'versionId', 'article_ref'
        UNION ALL
        SELECT doc.article_dna_version_id, 'article_column'
        UNION ALL
        SELECT doc.pl -> 'siloDnaRef' ->> 'versionId', 'silo_ref'
        UNION ALL
        SELECT k.ref ->> 'versionId', 'keyword_ref'
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(doc.pl -> 'keywordDnaRefs') = 'array' THEN doc.pl -> 'keywordDnaRefs' ELSE '[]'::jsonb END
          ) AS k(ref)
      ) AS x(version_id, papel)
     WHERE x.version_id IS NOT NULL
     GROUP BY x.version_id
  ),
  artefatos AS (
    SELECT e.version_id, e.artifact_type, e.entity_id, e.version_number, e.status, e.content_hash, e.created_at,
           octet_length(e.payload::text)::bigint AS bytes,
           refs.papeis,
           (SELECT max(n.version_number)
              FROM public.editorial_artifact_versions AS n
             WHERE n.marca_id = p_brand_id
               AND n.artifact_type = e.artifact_type
               AND n.entity_id = e.entity_id) AS maior_versao
      FROM refs
      JOIN public.editorial_artifact_versions AS e
        ON e.marca_id = p_brand_id
       AND e.version_id = refs.version_id
  ),
  -- Contexto da Marca: BrandDNA e Skills da Marca (`brand_skill`). Medido em
  -- 2026-09-23: nenhuma linha `brand_dna` no remoto e uma `brand_skill` de
  -- 44.510 B, que e o "BrandDNA de 44 kB" da SDD. As duas saem rotuladas
  -- "nao fixada no documento"; a vigente e decidida no servidor.
  marca_dna AS (
    SELECT e.version_id, e.artifact_type, e.version_number, e.status, e.content_hash, e.created_at,
           octet_length(e.payload::text)::bigint AS bytes
      FROM doc
      CROSS JOIN LATERAL (
        SELECT x.version_id, x.artifact_type, x.version_number, x.status, x.content_hash, x.created_at, x.payload
          FROM public.editorial_artifact_versions AS x
         WHERE x.marca_id = p_brand_id
           AND x.artifact_type IN ('brand_dna', 'brand_skill')
         ORDER BY x.version_number DESC
         LIMIT 10
      ) AS e
  ),
  -- `serpAssessmentRef.entityId` e o id do PARECER (`payload.assessment.id`),
  -- nao o `subject_id` da linha (que e o candidateRef). Medido em 2026-09-23
  -- (agregado): nos 2 documentos, 0 casando por `subject_id` e 1 casando por
  -- `payload.assessment.id` (e pelo `contentHash`). Parecer refeito troca o id:
  -- a referencia antiga deixa de casar e a ausencia e declarada.
  formacao AS (
    SELECT w.id, w.subject_id, w.state, w.updated_at, w.payload
      FROM doc
      JOIN public.editorial_artifact_versions AS a
        ON a.marca_id = p_brand_id
       AND a.artifact_type = 'article_dna'
       AND a.version_id = coalesce(doc.pl -> 'articleDnaRef' ->> 'versionId', doc.article_dna_version_id)
      JOIN public.editorial_workflow_items AS w
        ON w.marca_id = p_brand_id
       AND w.subject_type = 'article_formation_serp_assessment'
       AND w.stage = 'architect'
       AND w.payload -> 'assessment' ->> 'id' = coalesce(a.payload -> 'payload' -> 'serpAssessmentRef' ->> 'entityId',
                                                        a.payload -> 'serpAssessmentRef' ->> 'entityId')
  ),
  fontes_video AS (
    SELECT f.valor ->> 'videoSourceId' AS video_txt,
           CASE WHEN (f.valor ->> 'processingVersion') ~ '^[0-9]{1,9}$'
                THEN (f.valor ->> 'processingVersion')::integer END AS versao_texto,
           CASE WHEN (f.valor ->> 'videoSourceId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (f.valor ->> 'videoSourceId')::uuid END AS video_id,
           doc.article_id
      FROM doc
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(doc.bundle -> 'video' -> 'sources') = 'array' THEN doc.bundle -> 'video' -> 'sources' ELSE '[]'::jsonb END
      ) AS f(valor)
  ),
  videos AS (
    SELECT fv.video_txt, fv.versao_texto, t.content_hash, t.created_at, t.language_code,
           octet_length(t.transcript_text)::bigint AS bytes_texto,
           octet_length(t.segments::text)::bigint AS bytes_segmentos,
           jsonb_array_length(t.segments) AS segmentos,
           CASE
             WHEN fv.video_id IS NULL OR fv.versao_texto IS NULL THEN 'invalid_reference'
             WHEN l.video_source_id IS NULL THEN 'not_selected'
             WHEN l.status <> 'ACTIVE' THEN 'removed_after_delivery'
             WHEN t.video_source_id IS NULL THEN 'text_version_missing'
             ELSE 'available'
           END AS situacao
      FROM fontes_video AS fv
      LEFT JOIN public.radar_article_video_sources AS l
        ON l.brand_id = p_brand_id
       AND l.article_id = fv.article_id
       AND l.video_source_id = fv.video_id
      LEFT JOIN public.radar_video_source_texts AS t
        ON t.brand_id = p_brand_id
       AND t.video_source_id = fv.video_id
       AND t.content_kind = 'ORIGINAL_TRANSCRIPT'
       AND t.processing_version = fv.versao_texto
  )

  -- documento: raiz e blocos
  SELECT 'document'::text, doc.id, 'payload'::text, ARRAY[]::text[], jsonb_typeof(doc.pl),
         octet_length(doc.pl::text)::bigint, NULL::integer, doc.content_hash, NULL::integer, doc.updated_at, doc.status, NULL::text
    FROM doc
  UNION ALL
  SELECT 'document', doc.id, 'blocks', ARRAY['blocks'], jsonb_typeof(doc.pl -> 'blocks'),
         octet_length((doc.pl -> 'blocks')::text)::bigint,
         CASE WHEN jsonb_typeof(doc.pl -> 'blocks') = 'array' THEN jsonb_array_length(doc.pl -> 'blocks') END,
         NULL, NULL, NULL, NULL, NULL
    FROM doc
  UNION ALL
  -- bundle congelado: raiz
  SELECT 'document', doc.id, 'bundle', ARRAY['importedContext', 'dossier', 'bundle'], jsonb_typeof(doc.bundle),
         octet_length(doc.bundle::text)::bigint, NULL, doc.dossie ->> 'bundleHash', NULL, NULL, 'frozen', doc.dossie ->> 'bundleId'
    FROM doc
   WHERE doc.bundle IS NOT NULL
  UNION ALL
  -- bundle: 1o nivel
  SELECT 'document', doc.id, 'bundle', ARRAY['importedContext', 'dossier', 'bundle', c1.k], jsonb_typeof(c1.v),
         octet_length(c1.v::text)::bigint,
         CASE jsonb_typeof(c1.v) WHEN 'array' THEN jsonb_array_length(c1.v)
                                 WHEN 'object' THEN (SELECT count(*)::integer FROM jsonb_object_keys(c1.v)) END,
         doc.dossie ->> 'bundleHash', NULL, NULL, 'frozen', NULL
    FROM doc
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(doc.bundle) = 'object' THEN doc.bundle ELSE '{}'::jsonb END) AS c1(k, v)
  UNION ALL
  -- bundle: 2o nivel, sob cada objeto do 1o nivel
  SELECT 'document', doc.id, 'bundle', ARRAY['importedContext', 'dossier', 'bundle', c1.k, c2.k], jsonb_typeof(c2.v),
         octet_length(c2.v::text)::bigint,
         CASE jsonb_typeof(c2.v) WHEN 'array' THEN jsonb_array_length(c2.v)
                                 WHEN 'object' THEN (SELECT count(*)::integer FROM jsonb_object_keys(c2.v)) END,
         doc.dossie ->> 'bundleHash', NULL, NULL, 'frozen', NULL
    FROM doc
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(doc.bundle) = 'object' THEN doc.bundle ELSE '{}'::jsonb END) AS c1(k, v)
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(c1.v) = 'object' THEN c1.v ELSE '{}'::jsonb END) AS c2(k, v)
  UNION ALL
  -- bundle: 3o nivel so sob `observed` (evidence.semantic, externalSources...)
  SELECT 'document', doc.id, 'bundle', ARRAY['importedContext', 'dossier', 'bundle', 'observed', c2.k, c3.k], jsonb_typeof(c3.v),
         octet_length(c3.v::text)::bigint,
         CASE jsonb_typeof(c3.v) WHEN 'array' THEN jsonb_array_length(c3.v)
                                 WHEN 'object' THEN (SELECT count(*)::integer FROM jsonb_object_keys(c3.v)) END,
         doc.dossie ->> 'bundleHash', NULL, NULL, 'frozen', NULL
    FROM doc
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(doc.bundle -> 'observed') = 'object' THEN doc.bundle -> 'observed' ELSE '{}'::jsonb END) AS c2(k, v)
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(c2.v) = 'object' THEN c2.v ELSE '{}'::jsonb END) AS c3(k, v)
  UNION ALL
  -- elemento de analysisVersions da versao entregue: raiz e 1o nivel do payload
  SELECT 'analysis_version', v.valor ->> 'versionId', 'version', ARRAY[]::text[], jsonb_typeof(v.valor),
         octet_length(v.valor::text)::bigint, NULL,
         NULL,
         CASE WHEN (v.valor ->> 'versionNumber') ~ '^[0-9]{1,9}$' THEN (v.valor ->> 'versionNumber')::integer END,
         NULL, v.valor -> 'payload' ->> 'status', v.valor -> 'payload' ->> 'serpSnapshotId'
    FROM versao AS v
  UNION ALL
  SELECT 'analysis_version', v.valor ->> 'versionId', 'version', ARRAY['payload', c1.k], jsonb_typeof(c1.v),
         octet_length(c1.v::text)::bigint,
         CASE jsonb_typeof(c1.v) WHEN 'array' THEN jsonb_array_length(c1.v)
                                 WHEN 'object' THEN (SELECT count(*)::integer FROM jsonb_object_keys(c1.v)) END,
         NULL, NULL, NULL, NULL, NULL
    FROM versao AS v
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(v.valor -> 'payload') = 'object' THEN v.valor -> 'payload' ELSE '{}'::jsonb END) AS c1(k, v)
  UNION ALL
  -- corrida da versao entregue: raiz, 1o e 2o nivel
  SELECT 'radar_run', r.version_id, 'run', ARRAY[]::text[], jsonb_typeof(r.pl),
         octet_length(r.pl::text)::bigint, NULL, NULL, NULL, r.updated_at, NULL, NULL
    FROM corrida AS r
  UNION ALL
  SELECT 'radar_run', r.version_id, 'run', ARRAY[c1.k], jsonb_typeof(c1.v),
         octet_length(c1.v::text)::bigint,
         CASE jsonb_typeof(c1.v) WHEN 'array' THEN jsonb_array_length(c1.v)
                                 WHEN 'object' THEN (SELECT count(*)::integer FROM jsonb_object_keys(c1.v)) END,
         NULL, NULL, r.updated_at, NULL, NULL
    FROM corrida AS r
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(r.pl) = 'object' THEN r.pl ELSE '{}'::jsonb END) AS c1(k, v)
  UNION ALL
  SELECT 'radar_run', r.version_id, 'run', ARRAY[c1.k, c2.k], jsonb_typeof(c2.v),
         octet_length(c2.v::text)::bigint,
         CASE jsonb_typeof(c2.v) WHEN 'array' THEN jsonb_array_length(c2.v)
                                 WHEN 'object' THEN (SELECT count(*)::integer FROM jsonb_object_keys(c2.v)) END,
         NULL, NULL, r.updated_at, NULL, NULL
    FROM corrida AS r
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(r.pl) = 'object' THEN r.pl ELSE '{}'::jsonb END) AS c1(k, v)
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(c1.v) = 'object' THEN c1.v ELSE '{}'::jsonb END) AS c2(k, v)
  UNION ALL
  -- snapshots SERP do Radar: o da versao entregue e o mais recente, quando diferente
  SELECT 'serp_snapshot', s.id::text, 'delivered', ARRAY[]::text[], jsonb_typeof(s.payload),
         octet_length(s.payload::text)::bigint, NULL, s.content_hash, s.snapshot_version, s.created_at, s.status,
         (SELECT rv.status FROM public.editorial_serp_reviews AS rv, doc
           WHERE rv.marca_id = p_brand_id AND rv.article_id = doc.article_id AND rv.snapshot_id = s.id
           ORDER BY rv.created_at DESC LIMIT 1)
    FROM snapshot_entregue AS s
  UNION ALL
  SELECT 'serp_snapshot', s.id::text, 'latest', ARRAY[]::text[], jsonb_typeof(s.payload),
         octet_length(s.payload::text)::bigint, NULL, s.content_hash, s.snapshot_version, s.created_at, s.status,
         (SELECT rv.status FROM public.editorial_serp_reviews AS rv, doc
           WHERE rv.marca_id = p_brand_id AND rv.article_id = doc.article_id AND rv.snapshot_id = s.id
           ORDER BY rv.created_at DESC LIMIT 1)
    FROM snapshot_recente AS s
  UNION ALL
  -- versoes de DNA referenciadas pelo documento
  SELECT 'artifact_version', a.version_id, a.artifact_type, ARRAY[]::text[], 'object',
         a.bytes, NULL, a.content_hash, a.version_number, a.created_at, a.status,
         a.papeis || ';maior_versao=' || coalesce(a.maior_versao::text, '?')
    FROM artefatos AS a
  UNION ALL
  -- BrandDNA e Skills da marca (a vigente e decidida pelos eventos de status, no servidor)
  SELECT 'artifact_version', m.version_id, m.artifact_type, ARRAY[]::text[], 'object',
         m.bytes, NULL, m.content_hash, m.version_number, m.created_at, m.status, 'nao_fixada_no_documento'
    FROM marca_dna AS m
  UNION ALL
  -- parecer SERP de formacao do ArticleDNA fixado
  SELECT 'architect_formation', f.id::text, 'formation', ARRAY[]::text[], jsonb_typeof(f.payload),
         octet_length(f.payload::text)::bigint, NULL, NULL, NULL, f.updated_at, f.state, f.subject_id
    FROM formacao AS f
  UNION ALL
  SELECT 'architect_formation', f.id::text, 'formation', ARRAY[c1.k], jsonb_typeof(c1.v),
         octet_length(c1.v::text)::bigint,
         CASE jsonb_typeof(c1.v) WHEN 'array' THEN jsonb_array_length(c1.v)
                                 WHEN 'object' THEN (SELECT count(*)::integer FROM jsonb_object_keys(c1.v)) END,
         NULL, NULL, f.updated_at, f.state, f.subject_id
    FROM formacao AS f
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(f.payload) = 'object' THEN f.payload ELSE '{}'::jsonb END) AS c1(k, v)
  UNION ALL
  -- transcricoes dos videos do bundle: so a versao de texto que sustentou o bundle
  SELECT 'video_text', vd.video_txt, 'transcript_text', ARRAY['transcript_text'], 'text',
         CASE WHEN vd.situacao = 'available' THEN vd.bytes_texto END, NULL,
         CASE WHEN vd.situacao = 'available' THEN vd.content_hash END, vd.versao_texto,
         CASE WHEN vd.situacao = 'available' THEN vd.created_at END, vd.situacao,
         CASE WHEN vd.situacao = 'available' THEN vd.language_code END
    FROM videos AS vd
  UNION ALL
  SELECT 'video_text', vd.video_txt, 'segments', ARRAY['segments'], 'array',
         vd.bytes_segmentos, vd.segmentos, vd.content_hash, vd.versao_texto, vd.created_at, vd.situacao, vd.language_code
    FROM videos AS vd
   WHERE vd.situacao = 'available';
$function$;

COMMENT ON FUNCTION public.writer_evidence_manifest(uuid, text) IS
  'Leitor de evidencias do Redator: tamanhos, contagens, hashes e status por caminho do documento e das fontes que ele referencia. Nao devolve valores de payload. Marca errada devolve vazio. So service_role.';

REVOKE ALL ON FUNCTION public.writer_evidence_manifest(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.writer_evidence_manifest(uuid, text) TO service_role;

-- 2. Fatia -------------------------------------------------------------------
--
-- p_source      document | analysis_version | radar_run | artifact_version |
--               video_text
-- p_path        caminho dentro da origem (o mesmo `json_path` do manifesto)
-- p_ref         so para artifact_version (version_id) e video_text
--               (videoSourceId). Aceito apenas se for referencia do proprio
--               documento (ou versao de BrandDNA ou Skill da mesma marca). Os demais
--               ids sao resolvidos aqui dentro, a partir do documento.
-- p_offset      indice 0-based do primeiro item (array), da primeira chave em
--               ordem "C" (objeto) ou do primeiro caractere (texto)
-- p_limit       itens por pagina, 1..200 (ignorado para texto)
-- p_max_bytes   teto de bytes de valor por pagina, 1024..32768
-- p_fields      so para itens objeto: mantem apenas estas chaves
-- p_exclude_keys chaves omitidas (ex.: observedLinks nas extracoes)
--
-- Saida: uma linha por item. `omitted = true` quando o item estouraria o teto
-- acumulado da pagina; o valor sai NULL e `bytes` diz quanto ele tem. O
-- proximo cursor e o `ordinal` da primeira linha omitida (ou ordinal + span
-- da ultima). Se a PRIMEIRA linha ja vier omitida, o item e maior que a
-- pagina: o chamador desce um nivel (p_path || ordinal/chave).
-- Texto: uma linha com o pedaco que cabe no teto; `span` = caracteres.
-- Caminho ausente: uma linha `container_type = 'absent'`.
-- Documento de outra marca, fonte nao resolvida, video removido do artigo
-- ou versao de texto diferente da do bundle: nenhuma linha.
CREATE FUNCTION public.writer_evidence_slice(
  p_brand_id uuid,
  p_document_id text,
  p_source text,
  p_path text[] DEFAULT ARRAY[]::text[],
  p_ref text DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 20,
  p_max_bytes integer DEFAULT 16384,
  p_fields text[] DEFAULT NULL,
  p_exclude_keys text[] DEFAULT NULL
)
RETURNS TABLE (
  source text,
  ref_id text,
  json_path text[],
  container_type text,
  total integer,
  ordinal integer,
  span integer,
  item_key text,
  value_type text,
  bytes integer,
  omitted boolean,
  value jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  c_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 200);
  v_max integer := least(greatest(coalesce(p_max_bytes, 16384), 1024), 32768);
  v_path text[] := coalesce(p_path, ARRAY[]::text[]);
  v_article_id text;
  v_radar_item text;
  v_analysis_version text;
  v_ref text;
  v_base jsonb;
  v_tipo text;
  v_texto text;
  v_len integer;
  v_peca jsonb;
  v_found boolean := false;
BEGIN
  IF p_brand_id IS NULL OR p_document_id IS NULL OR btrim(p_document_id) = '' THEN
    RAISE EXCEPTION 'writer_evidence_slice: p_brand_id e p_document_id sao obrigatorios' USING ERRCODE = '22023';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('document', 'analysis_version', 'radar_run', 'artifact_version', 'video_text') THEN
    RAISE EXCEPTION 'writer_evidence_slice: fonte desconhecida' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_path) > 12
     OR EXISTS (SELECT 1 FROM unnest(v_path) AS s(seg) WHERE s.seg IS NULL OR s.seg = '' OR length(s.seg) > 200) THEN
    RAISE EXCEPTION 'writer_evidence_slice: caminho invalido' USING ERRCODE = '22023';
  END IF;

  SELECT d.article_id,
         d.payload -> 'radarOrigin' ->> 'radarItemId',
         d.payload -> 'radarOrigin' ->> 'analysisVersionId'
    INTO v_article_id, v_radar_item, v_analysis_version
    FROM public.content_documents AS d
   WHERE d.marca_id = p_brand_id
     AND d.id = p_document_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_source = 'document' THEN
    v_ref := p_document_id;
    SELECT d.payload #> v_path
      INTO v_base
      FROM public.content_documents AS d
     WHERE d.marca_id = p_brand_id
       AND d.id = p_document_id;
    v_found := FOUND;

  ELSIF p_source = 'analysis_version' THEN
    IF v_radar_item IS NULL OR v_radar_item !~ c_uuid OR v_analysis_version IS NULL THEN
      RETURN;
    END IF;
    v_ref := v_analysis_version;
    SELECT e.valor #> v_path
      INTO v_base
      FROM public.editorial_workflow_items AS w
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(w.payload -> 'analysisVersions') = 'array' THEN w.payload -> 'analysisVersions' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(valor, ordem)
     WHERE w.marca_id = p_brand_id
       AND w.id = v_radar_item::uuid
       AND w.stage = 'radar'
       AND w.article_id = v_article_id
       AND e.valor ->> 'versionId' = v_analysis_version
     ORDER BY e.ordem DESC
     LIMIT 1;
    v_found := FOUND;

  ELSIF p_source = 'radar_run' THEN
    IF v_radar_item IS NULL OR v_radar_item !~ c_uuid OR v_analysis_version IS NULL THEN
      RETURN;
    END IF;
    v_ref := v_analysis_version;
    SELECT r.payload #> v_path
      INTO v_base
      FROM public.radar_analysis_runs AS r
     WHERE r.marca_id = p_brand_id
       AND r.workflow_item_id = v_radar_item::uuid
       AND r.version_id = v_analysis_version
       AND r.article_id = v_article_id;
    v_found := FOUND;

  ELSIF p_source = 'artifact_version' THEN
    IF p_ref IS NULL OR btrim(p_ref) = '' THEN
      RAISE EXCEPTION 'writer_evidence_slice: p_ref obrigatorio para artifact_version' USING ERRCODE = '22023';
    END IF;
    v_ref := p_ref;
    SELECT e.payload #> v_path
      INTO v_base
      FROM public.editorial_artifact_versions AS e
      JOIN public.content_documents AS d
        ON d.marca_id = p_brand_id
       AND d.id = p_document_id
     WHERE e.marca_id = p_brand_id
       AND e.version_id = p_ref
       AND (
         e.artifact_type IN ('brand_dna', 'brand_skill')
         OR e.version_id = d.article_dna_version_id
         OR e.version_id = d.payload -> 'articleDnaRef' ->> 'versionId'
         OR e.version_id = d.payload -> 'siloDnaRef' ->> 'versionId'
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(d.payload -> 'keywordDnaRefs') = 'array' THEN d.payload -> 'keywordDnaRefs' ELSE '[]'::jsonb END
             ) AS k(ref)
            WHERE k.ref ->> 'versionId' = e.version_id
         )
       );
    v_found := FOUND;

  ELSE
    IF p_ref IS NULL OR p_ref !~ c_uuid THEN
      RETURN;
    END IF;
    IF cardinality(v_path) = 0 OR v_path[1] NOT IN ('transcript_text', 'segments')
       OR (v_path[1] = 'transcript_text' AND cardinality(v_path) > 1) THEN
      RAISE EXCEPTION 'writer_evidence_slice: video_text aceita transcript_text ou segments' USING ERRCODE = '22023';
    END IF;
    v_ref := p_ref;
    SELECT CASE WHEN v_path[1] = 'transcript_text' THEN to_jsonb(t.transcript_text)
                ELSE t.segments #> v_path[2:] END
      INTO v_base
      FROM public.content_documents AS d
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(d.payload #> '{importedContext,dossier,bundle,video,sources}') = 'array'
             THEN d.payload #> '{importedContext,dossier,bundle,video,sources}' ELSE '[]'::jsonb END
      ) AS s(fonte)
      JOIN public.radar_article_video_sources AS l
        ON l.brand_id = p_brand_id
       AND l.article_id = d.article_id
       AND l.video_source_id = p_ref::uuid
       AND l.status = 'ACTIVE'
      JOIN public.radar_video_source_texts AS t
        ON t.brand_id = p_brand_id
       AND t.video_source_id = p_ref::uuid
       AND t.content_kind = 'ORIGINAL_TRANSCRIPT'
       AND t.processing_version = CASE WHEN (s.fonte ->> 'processingVersion') ~ '^[0-9]{1,9}$'
                                       THEN (s.fonte ->> 'processingVersion')::integer END
     WHERE d.marca_id = p_brand_id
       AND d.id = p_document_id
       AND lower(s.fonte ->> 'videoSourceId') = lower(p_ref)
     LIMIT 1;
    v_found := FOUND;
  END IF;

  IF NOT v_found THEN
    RETURN;
  END IF;

  v_tipo := coalesce(jsonb_typeof(v_base), 'absent');

  IF v_tipo = 'absent' THEN
    RETURN QUERY SELECT p_source, v_ref, v_path, 'absent'::text, 0, v_offset, 0, NULL::text, NULL::text, 0, false, NULL::jsonb;
    RETURN;
  END IF;

  IF v_tipo = 'array' THEN
    RETURN QUERY
    WITH el AS (
      SELECT e.valor, (e.ordem - 1)::integer AS idx
        FROM jsonb_array_elements(v_base) WITH ORDINALITY AS e(valor, ordem)
       WHERE e.ordem > v_offset
       ORDER BY e.ordem
       LIMIT v_limit
    ),
    proj AS (
      SELECT el.idx,
             CASE
               WHEN jsonb_typeof(el.valor) <> 'object' THEN el.valor
               ELSE (
                 CASE WHEN p_fields IS NULL THEN el.valor
                      ELSE (SELECT coalesce(jsonb_object_agg(c.k, c.v), '{}'::jsonb)
                              FROM jsonb_each(el.valor) AS c(k, v)
                             WHERE c.k = ANY (p_fields))
                 END
               ) - coalesce(p_exclude_keys, ARRAY[]::text[])
             END AS v
        FROM el
    ),
    med AS (
      SELECT proj.idx, proj.v,
             octet_length(proj.v::text) AS b,
             sum(octet_length(proj.v::text)) OVER (ORDER BY proj.idx) AS acum
        FROM proj
    )
    SELECT p_source, v_ref, v_path, 'array'::text, jsonb_array_length(v_base), med.idx, 1, NULL::text,
           jsonb_typeof(med.v), med.b, med.acum > v_max,
           CASE WHEN med.acum > v_max THEN NULL ELSE med.v END
      FROM med
     ORDER BY med.idx;
    RETURN;
  END IF;

  IF v_tipo = 'object' THEN
    RETURN QUERY
    WITH ch AS (
      SELECT c.k, c.v
        FROM jsonb_each(v_base) AS c(k, v)
       WHERE (p_fields IS NULL OR c.k = ANY (p_fields))
         AND (p_exclude_keys IS NULL OR NOT (c.k = ANY (p_exclude_keys)))
    ),
    tot AS (
      SELECT count(*)::integer AS n FROM ch
    ),
    ordenado AS (
      SELECT ch.k, ch.v, (row_number() OVER (ORDER BY ch.k COLLATE "C") - 1)::integer AS idx
        FROM ch
    ),
    sel AS (
      SELECT o.k, o.v, o.idx
        FROM ordenado AS o
       WHERE o.idx >= v_offset
       ORDER BY o.idx
       LIMIT v_limit
    ),
    med AS (
      SELECT sel.k, sel.v, sel.idx,
             octet_length(sel.v::text) AS b,
             sum(octet_length(sel.v::text)) OVER (ORDER BY sel.idx) AS acum
        FROM sel
    )
    SELECT p_source, v_ref, v_path, 'object'::text, tot.n, med.idx, 1, med.k,
           jsonb_typeof(med.v), med.b, med.acum > v_max,
           CASE WHEN med.acum > v_max THEN NULL ELSE med.v END
      FROM med
     CROSS JOIN tot
     ORDER BY med.idx;
    RETURN;
  END IF;

  IF v_tipo = 'string' THEN
    v_texto := v_base #>> '{}';
    v_len := least(v_max, greatest(char_length(v_texto) - v_offset, 0));
    LOOP
      v_peca := to_jsonb(substr(v_texto, v_offset + 1, v_len));
      EXIT WHEN v_len <= 1 OR octet_length(v_peca::text) <= v_max;
      v_len := greatest(1, (v_len::bigint * v_max / octet_length(v_peca::text))::integer - 1);
    END LOOP;
    RETURN QUERY SELECT p_source, v_ref, v_path, 'string'::text, char_length(v_texto), v_offset, v_len, NULL::text,
                        'string'::text, octet_length(v_peca::text), false, v_peca;
    RETURN;
  END IF;

  RETURN QUERY SELECT p_source, v_ref, v_path, v_tipo, 1, 0, 1, NULL::text, v_tipo,
                      octet_length(v_base::text), octet_length(v_base::text) > v_max,
                      CASE WHEN octet_length(v_base::text) > v_max THEN NULL ELSE v_base END;
END;
$function$;

COMMENT ON FUNCTION public.writer_evidence_slice(uuid, text, text, text[], text, integer, integer, integer, text[], text[]) IS
  'Leitor de evidencias do Redator: pagina array, fatia objeto por chave e texto por caracteres, com teto de bytes por pagina (max 32768). Ids resolvidos a partir do documento; marca errada devolve vazio. So service_role.';

REVOKE ALL ON FUNCTION public.writer_evidence_slice(uuid, text, text, text[], text, integer, integer, integer, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.writer_evidence_slice(uuid, text, text, text[], text, integer, integer, integer, text[], text[]) TO service_role;

-- 3. Divergencias -------------------------------------------------------------
--
-- SDD secao 5. Tabela propria, e nao `editorial_workflow_items`: linhas de
-- estagio 'writer' com article_id derrubariam `findByArticleRaw` e
-- `importItem` (maybeSingle/single sem filtro de subject_type) e poluiriam
-- `list`/`listByStage`.
--
-- A IA (MCP ou interna) so CRIA registro `aberta`, por rota do servidor com
-- service_role. Nao edita, nao resolve, nao marca bloqueante e nao escreve em
-- DNA. Mudanca de status e marcacao de bloqueante sao decisoes humanas, pela
-- rota do painel, com o ator registrado. Nada e apagado: descarte e status.
CREATE TABLE public.writer_evidence_divergences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  document_id text NOT NULL REFERENCES public.content_documents(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) BETWEEN 1 AND 256),
  dedupe_key text NOT NULL CHECK (char_length(btrim(dedupe_key)) BETWEEN 1 AND 200),

  target_kind text NOT NULL CHECK (target_kind IN ('article_dna', 'keyword_dna', 'silo_dna', 'brand_dna', 'radar_bundle')),
  target_entity_id text NOT NULL CHECK (char_length(btrim(target_entity_id)) BETWEEN 1 AND 300),
  target_version_id text NOT NULL CHECK (char_length(btrim(target_version_id)) BETWEEN 1 AND 300),
  target_content_hash text CHECK (target_content_hash IS NULL OR char_length(btrim(target_content_hash)) BETWEEN 1 AND 300),

  dna_claim_path text NOT NULL CHECK (char_length(btrim(dna_claim_path)) BETWEEN 1 AND 500),
  dna_claim_summary text NOT NULL CHECK (char_length(btrim(dna_claim_summary)) BETWEEN 1 AND 2000),

  evidence_source_key text NOT NULL CHECK (char_length(btrim(evidence_source_key)) BETWEEN 1 AND 300),
  evidence_path text CHECK (evidence_path IS NULL OR char_length(evidence_path) <= 500),
  evidence_etag text CHECK (evidence_etag IS NULL OR char_length(evidence_etag) <= 300),
  evidence_hierarchy_level text NOT NULL CHECK (evidence_hierarchy_level IN (
    'ARTICLE_INVARIANT', 'PRIMARY_FACTUAL_EVIDENCE', 'QUALIFIED_SPECIALIST', 'CURRENT_SUFFICIENT_SERP',
    'OTHER_RADAR_EVIDENCE', 'ARTICLE_DNA_HYPOTHESIS', 'AI_INTERPRETATION', 'DETERMINISTIC_HEURISTIC',
    'GENERIC_EDITORIAL_SUGGESTION'
  )),
  evidence_frozen boolean NOT NULL,
  evidence_observed_at timestamptz,
  evidence_posterior_ao_pacote boolean NOT NULL DEFAULT false,

  severity text NOT NULL CHECK (severity IN ('info', 'alerta', 'bloqueante')),
  suggested_owner text NOT NULL CHECK (suggested_owner IN ('arquiteto', 'radar', 'minerador', 'marca')),
  origin text NOT NULL CHECK (origin IN ('ia_mcp', 'ia_interna', 'humano')),
  mcp_grant_id uuid REFERENCES public.writer_mcp_grants(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'reconhecida', 'enviada_ao_dono', 'resolvida', 'descartada')),
  status_reason text CHECK (status_reason IS NULL OR char_length(btrim(status_reason)) BETWEEN 1 AND 2000),
  status_changed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  status_changed_via text CHECK (status_changed_via IS NULL OR status_changed_via = 'painel_humano'),
  status_changed_at timestamptz,
  blocking_marked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  blocking_marked_at timestamptz,
  resolution_ref text CHECK (resolution_ref IS NULL OR char_length(btrim(resolution_ref)) BETWEEN 1 AND 300),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT writer_evidence_divergences_dedupe_unique UNIQUE (marca_id, document_id, dedupe_key),
  CONSTRAINT writer_evidence_divergences_mcp_grant_check CHECK ((origin = 'ia_mcp') = (mcp_grant_id IS NOT NULL)),
  CONSTRAINT writer_evidence_divergences_hierarchy_check CHECK (
    evidence_frozen OR evidence_hierarchy_level IN (
      'OTHER_RADAR_EVIDENCE', 'ARTICLE_DNA_HYPOTHESIS', 'AI_INTERPRETATION', 'DETERMINISTIC_HEURISTIC',
      'GENERIC_EDITORIAL_SUGGESTION'
    )
  ),
  CONSTRAINT writer_evidence_divergences_frozen_check CHECK (
    NOT evidence_frozen OR (evidence_source_key LIKE 'radar.bundle.%' AND NOT evidence_posterior_ao_pacote)
  ),
  CONSTRAINT writer_evidence_divergences_blocking_check CHECK (
    (severity = 'bloqueante') = (blocking_marked_by IS NOT NULL)
    AND (blocking_marked_by IS NULL) = (blocking_marked_at IS NULL)
  ),
  CONSTRAINT writer_evidence_divergences_status_actor_check CHECK (
    (status = 'aberta') = (status_changed_by IS NULL)
    AND (status_changed_by IS NULL) = (status_changed_at IS NULL)
    AND (status_changed_by IS NULL) = (status_changed_via IS NULL)
  ),
  CONSTRAINT writer_evidence_divergences_closing_reason_check CHECK (
    status NOT IN ('resolvida', 'descartada') OR status_reason IS NOT NULL
  )
);

COMMENT ON TABLE public.writer_evidence_divergences IS
  'Divergencias entre evidencia e DNA registradas no Redator. A IA so cria abertas; status e bloqueante so por decisao humana; resolucao acontece no modulo dono, com nova versao. Nada e apagado.';

CREATE INDEX writer_evidence_divergences_document_idx
  ON public.writer_evidence_divergences (marca_id, document_id, status, created_at DESC);

CREATE INDEX writer_evidence_divergences_brand_status_idx
  ON public.writer_evidence_divergences (marca_id, status, created_at DESC);

-- 3.1 Guarda de insercao: nasce aberta, sem decisao humana, e o alvo precisa
-- ser referencia do proprio documento da mesma marca e artigo.
CREATE FUNCTION public.writer_evidence_divergences_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_article_id text;
  v_article_column text;
  v_article_ref jsonb;
  v_silo_ref jsonb;
  v_keyword_refs jsonb;
  v_bundle_id text;
  v_bundle_hash text;
  v_ok boolean := false;
BEGIN
  IF NEW.status IS DISTINCT FROM 'aberta' THEN
    RAISE EXCEPTION 'writer_evidence_divergences: registro nasce aberto' USING ERRCODE = '23514';
  END IF;
  IF NEW.severity = 'bloqueante' OR NEW.blocking_marked_by IS NOT NULL OR NEW.blocking_marked_at IS NOT NULL THEN
    RAISE EXCEPTION 'writer_evidence_divergences: bloqueante so por decisao humana posterior' USING ERRCODE = '23514';
  END IF;
  IF NEW.status_changed_by IS NOT NULL OR NEW.status_changed_via IS NOT NULL OR NEW.status_changed_at IS NOT NULL
     OR NEW.status_reason IS NOT NULL OR NEW.resolution_ref IS NOT NULL THEN
    RAISE EXCEPTION 'writer_evidence_divergences: registro novo nao traz decisao' USING ERRCODE = '23514';
  END IF;

  -- Com service_role o banco nao ve quem chamou: o vinculo com o grant e
  -- conferido aqui, e nao so na rota. O grant precisa ser da mesma marca,
  -- ativo, do mesmo ator e com o escopo de escrita (adendo D3, opcao A).
  IF NEW.mcp_grant_id IS NOT NULL THEN
    IF NEW.origin IS DISTINCT FROM 'ia_mcp' THEN
      RAISE EXCEPTION 'writer_evidence_divergences: grant MCP so com origem ia_mcp' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.writer_mcp_grants AS g
       WHERE g.id = NEW.mcp_grant_id
         AND g.marca_id = NEW.marca_id
         AND g.status = 'active'
         AND 'writer.draft.write' = ANY (g.scopes)
         AND g.actor_user_id = NEW.created_by
    ) THEN
      RAISE EXCEPTION 'writer_evidence_divergences: grant MCP invalido para esta marca, ator ou escopo' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT d.article_id,
         d.article_dna_version_id,
         d.payload -> 'articleDnaRef',
         d.payload -> 'siloDnaRef',
         d.payload -> 'keywordDnaRefs',
         d.payload -> 'importedContext' -> 'dossier' ->> 'bundleId',
         d.payload -> 'importedContext' -> 'dossier' ->> 'bundleHash'
    INTO v_article_id, v_article_column, v_article_ref, v_silo_ref, v_keyword_refs, v_bundle_id, v_bundle_hash
    FROM public.content_documents AS d
   WHERE d.marca_id = NEW.marca_id
     AND d.id = NEW.document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'writer_evidence_divergences: documento nao pertence a marca' USING ERRCODE = '23503';
  END IF;
  IF v_article_id IS DISTINCT FROM NEW.article_id THEN
    RAISE EXCEPTION 'writer_evidence_divergences: artigo diferente do documento' USING ERRCODE = '23514';
  END IF;

  IF NEW.target_kind = 'article_dna' THEN
    v_ok := (NEW.target_version_id = v_article_ref ->> 'versionId'
             AND NEW.target_entity_id = v_article_ref ->> 'entityId'
             AND (NEW.target_content_hash IS NULL OR NEW.target_content_hash = v_article_ref ->> 'contentHash'))
         OR (v_article_ref IS NULL AND NEW.target_version_id = v_article_column);
  ELSIF NEW.target_kind = 'silo_dna' THEN
    v_ok := NEW.target_version_id = v_silo_ref ->> 'versionId'
        AND NEW.target_entity_id = v_silo_ref ->> 'entityId'
        AND (NEW.target_content_hash IS NULL OR NEW.target_content_hash = v_silo_ref ->> 'contentHash');
  ELSIF NEW.target_kind = 'keyword_dna' THEN
    v_ok := EXISTS (
      SELECT 1
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_keyword_refs) = 'array' THEN v_keyword_refs ELSE '[]'::jsonb END) AS k(ref)
       WHERE k.ref ->> 'versionId' = NEW.target_version_id
         AND k.ref ->> 'entityId' = NEW.target_entity_id
         AND (NEW.target_content_hash IS NULL OR NEW.target_content_hash = k.ref ->> 'contentHash')
    );
  ELSIF NEW.target_kind = 'radar_bundle' THEN
    v_ok := NEW.target_version_id = v_bundle_id
        AND NEW.target_content_hash = v_bundle_hash;
  ELSIF NEW.target_kind = 'brand_dna' THEN
    v_ok := EXISTS (
      SELECT 1
        FROM public.editorial_artifact_versions AS e
       WHERE e.marca_id = NEW.marca_id
         AND e.artifact_type IN ('brand_dna', 'brand_skill')
         AND e.version_id = NEW.target_version_id
         AND (NEW.target_content_hash IS NULL OR NEW.target_content_hash = e.content_hash)
    );
  END IF;
  IF NOT coalesce(v_ok, false) THEN
    RAISE EXCEPTION 'writer_evidence_divergences: o alvo nao e referencia do documento' USING ERRCODE = '23514';
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- 3.2 Guarda de atualizacao: o registro e imutavel; so status (transicao
-- valida, ator humano registrado) e a marcacao de bloqueante (ator humano)
-- mudam. Encerrado nao muda mais.
CREATE FUNCTION public.writer_evidence_divergences_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF (NEW.id, NEW.marca_id, NEW.document_id, NEW.article_id, NEW.dedupe_key,
      NEW.target_kind, NEW.target_entity_id, NEW.target_version_id, NEW.target_content_hash,
      NEW.dna_claim_path, NEW.dna_claim_summary,
      NEW.evidence_source_key, NEW.evidence_path, NEW.evidence_etag, NEW.evidence_hierarchy_level,
      NEW.evidence_frozen, NEW.evidence_observed_at, NEW.evidence_posterior_ao_pacote,
      NEW.suggested_owner, NEW.origin, NEW.mcp_grant_id, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.marca_id, OLD.document_id, OLD.article_id, OLD.dedupe_key,
      OLD.target_kind, OLD.target_entity_id, OLD.target_version_id, OLD.target_content_hash,
      OLD.dna_claim_path, OLD.dna_claim_summary,
      OLD.evidence_source_key, OLD.evidence_path, OLD.evidence_etag, OLD.evidence_hierarchy_level,
      OLD.evidence_frozen, OLD.evidence_observed_at, OLD.evidence_posterior_ao_pacote,
      OLD.suggested_owner, OLD.origin, OLD.mcp_grant_id, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'writer_evidence_divergences: o conteudo do registro e imutavel' USING ERRCODE = '23514';
  END IF;

  IF OLD.status IN ('resolvida', 'descartada') THEN
    RAISE EXCEPTION 'writer_evidence_divergences: registro encerrado' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'aberta' AND NEW.status IN ('reconhecida', 'descartada'))
      OR (OLD.status = 'reconhecida' AND NEW.status IN ('enviada_ao_dono', 'descartada'))
      OR (OLD.status = 'enviada_ao_dono' AND NEW.status IN ('resolvida', 'descartada'))
    ) THEN
      RAISE EXCEPTION 'writer_evidence_divergences: transicao % -> % invalida', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
    IF NEW.status_changed_by IS NULL OR NEW.status_changed_via IS DISTINCT FROM 'painel_humano' THEN
      RAISE EXCEPTION 'writer_evidence_divergences: status muda so por decisao humana no painel' USING ERRCODE = '23514';
    END IF;
    NEW.status_changed_at := now();
  ELSIF (NEW.status_changed_by, NEW.status_changed_via, NEW.status_reason, NEW.resolution_ref)
        IS DISTINCT FROM (OLD.status_changed_by, OLD.status_changed_via, OLD.status_reason, OLD.resolution_ref) THEN
    RAISE EXCEPTION 'writer_evidence_divergences: campos de decisao so mudam junto com o status' USING ERRCODE = '23514';
  ELSE
    NEW.status_changed_at := OLD.status_changed_at;
  END IF;

  IF NEW.severity IS DISTINCT FROM OLD.severity THEN
    IF NEW.severity <> 'bloqueante' OR NEW.blocking_marked_by IS NULL THEN
      RAISE EXCEPTION 'writer_evidence_divergences: severidade so muda para bloqueante, por ator humano' USING ERRCODE = '23514';
    END IF;
    NEW.blocking_marked_at := now();
  ELSIF NEW.blocking_marked_by IS DISTINCT FROM OLD.blocking_marked_by THEN
    RAISE EXCEPTION 'writer_evidence_divergences: marcacao de bloqueante so junto com a severidade' USING ERRCODE = '23514';
  ELSE
    NEW.blocking_marked_at := OLD.blocking_marked_at;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- 3.3 Nada e apagado: descartar e status.
CREATE FUNCTION public.writer_evidence_divergences_refuse_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'writer_evidence_divergences: registro nao e apagado; use status descartada' USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION public.writer_evidence_divergences_guard_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.writer_evidence_divergences_guard_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.writer_evidence_divergences_refuse_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER writer_evidence_divergences_guard_insert_trg
  BEFORE INSERT ON public.writer_evidence_divergences
  FOR EACH ROW EXECUTE FUNCTION public.writer_evidence_divergences_guard_insert();

CREATE TRIGGER writer_evidence_divergences_guard_update_trg
  BEFORE UPDATE ON public.writer_evidence_divergences
  FOR EACH ROW EXECUTE FUNCTION public.writer_evidence_divergences_guard_update();

CREATE TRIGGER writer_evidence_divergences_refuse_delete_trg
  BEFORE DELETE ON public.writer_evidence_divergences
  FOR EACH ROW EXECUTE FUNCTION public.writer_evidence_divergences_refuse_delete();

-- 3.4 RLS e privilegios. Leitura: membro da marca. Escrita: so o servidor,
-- e o UPDATE so alcanca as colunas de decisao.
ALTER TABLE public.writer_evidence_divergences ENABLE ROW LEVEL SECURITY;

CREATE POLICY writer_evidence_divergences_select_policy
  ON public.writer_evidence_divergences
  FOR SELECT
  TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

REVOKE ALL ON TABLE public.writer_evidence_divergences FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.writer_evidence_divergences TO authenticated;
GRANT SELECT, INSERT ON TABLE public.writer_evidence_divergences TO service_role;
GRANT UPDATE (status, status_reason, status_changed_by, status_changed_via, status_changed_at,
              severity, blocking_marked_by, blocking_marked_at, resolution_ref, updated_at)
  ON TABLE public.writer_evidence_divergences TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFICACAO (so agregado; nenhum valor de payload; rodar depois de aplicar)
--
-- SELECT jsonb_build_object(
--   'funcoes', (SELECT jsonb_agg(p.proname || ' secdef=' || p.prosecdef || ' vol=' || p.provolatile ORDER BY p.proname)
--                 FROM pg_proc AS p
--                WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'writer_evidence_%'),
--   'manifest_anon', has_function_privilege('anon', 'public.writer_evidence_manifest(uuid, text)', 'EXECUTE'),
--   'manifest_authenticated', has_function_privilege('authenticated', 'public.writer_evidence_manifest(uuid, text)', 'EXECUTE'),
--   'manifest_service_role', has_function_privilege('service_role', 'public.writer_evidence_manifest(uuid, text)', 'EXECUTE'),
--   'slice_anon', has_function_privilege('anon', 'public.writer_evidence_slice(uuid, text, text, text[], text, integer, integer, integer, text[], text[])', 'EXECUTE'),
--   'slice_authenticated', has_function_privilege('authenticated', 'public.writer_evidence_slice(uuid, text, text, text[], text, integer, integer, integer, text[], text[])', 'EXECUTE'),
--   'slice_service_role', has_function_privilege('service_role', 'public.writer_evidence_slice(uuid, text, text, text[], text, integer, integer, integer, text[], text[])', 'EXECUTE'),
--   'tabela_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.writer_evidence_divergences'::regclass),
--   'politicas', (SELECT jsonb_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','))
--                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'writer_evidence_divergences'),
--   'gatilhos', (SELECT jsonb_agg(tgname ORDER BY tgname) FROM pg_trigger
--                 WHERE tgrelid = 'public.writer_evidence_divergences'::regclass AND NOT tgisinternal),
--   'insert_authenticated', has_table_privilege('authenticated', 'public.writer_evidence_divergences', 'INSERT'),
--   'insert_anon', has_table_privilege('anon', 'public.writer_evidence_divergences', 'INSERT'),
--   'delete_service_role', has_table_privilege('service_role', 'public.writer_evidence_divergences', 'DELETE'),
--   'update_colunas_service_role', (SELECT jsonb_agg(column_name ORDER BY column_name) FROM information_schema.column_privileges
--                                    WHERE table_schema = 'public' AND table_name = 'writer_evidence_divergences'
--                                      AND grantee = 'service_role' AND privilege_type = 'UPDATE'),
--   'linhas', (SELECT count(*) FROM public.writer_evidence_divergences),
--   'manifesto_marca_inexistente_vazio', (SELECT count(*) FROM public.writer_evidence_manifest(gen_random_uuid(), 'inexistente')) = 0,
--   'fatia_marca_inexistente_vazia', (SELECT count(*) FROM public.writer_evidence_slice(gen_random_uuid(), 'inexistente', 'document')) = 0
-- ) AS verificacao;
--
-- Esperado: 5 funcoes com secdef=false (manifest 's'; slice 's'); anon e
-- authenticated sem EXECUTE; service_role com EXECUTE; tabela_rls true; uma
-- policy SELECT para authenticated; 3 gatilhos; sem INSERT para anon e
-- authenticated; sem DELETE para service_role; 10 colunas de UPDATE; 0
-- linhas; os dois testes de marca inexistente true.
--
-- SMOKE POR DOCUMENTO (so agregado; o usuario preenche marca e documento):
--
-- SELECT m.source, m.kind, count(*) AS linhas, sum(m.bytes) AS bytes, max(m.bytes) AS maior
--   FROM public.writer_evidence_manifest('<brand_id>'::uuid, '<document_id>') AS m
--  GROUP BY m.source, m.kind ORDER BY m.source, m.kind;
--
-- SELECT count(*) AS linhas, sum(f.bytes) FILTER (WHERE NOT f.omitted) AS bytes_da_pagina,
--        max(f.total) AS total, bool_or(f.omitted) AS houve_omitido
--   FROM public.writer_evidence_slice('<brand_id>'::uuid, '<document_id>', 'document',
--        ARRAY['importedContext', 'dossier', 'bundle', 'observed']) AS f;
--
-- Esperado: bytes_da_pagina <= 16384 no padrao e nunca > 32768.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (usuario, manualmente; nao roda com esta migration)
--
-- A tabela so e removida se estiver vazia: divergencia registrada e decisao
-- editorial, e apagar dado exige autorizacao propria (AGENTS.md secao 15).
--
-- BEGIN;
-- DO $rb$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM public.writer_evidence_divergences) THEN
--     RAISE EXCEPTION 'rollback recusado: ha divergencias registradas; exportar e decidir antes';
--   END IF;
-- END
-- $rb$;
-- DROP TRIGGER writer_evidence_divergences_refuse_delete_trg ON public.writer_evidence_divergences;
-- DROP TRIGGER writer_evidence_divergences_guard_update_trg ON public.writer_evidence_divergences;
-- DROP TRIGGER writer_evidence_divergences_guard_insert_trg ON public.writer_evidence_divergences;
-- DROP TABLE public.writer_evidence_divergences;
-- DROP FUNCTION public.writer_evidence_divergences_refuse_delete();
-- DROP FUNCTION public.writer_evidence_divergences_guard_update();
-- DROP FUNCTION public.writer_evidence_divergences_guard_insert();
-- DROP FUNCTION public.writer_evidence_slice(uuid, text, text, text[], text, integer, integer, integer, text[], text[]);
-- DROP FUNCTION public.writer_evidence_manifest(uuid, text);
-- COMMIT;
--
-- npx supabase migration repair --status reverted 20260923150000 --linked
-- ---------------------------------------------------------------------------
