-- =====================================================================
-- ARQUITETO — RELATÓRIO ÚNICO DO ESTADO REMOTO
--
-- Uma consulta, uma leitura. Somente SELECT: nada é escrito, nada é
-- alterado, nenhuma permissão é tocada.
--
-- Responde, em uma tabela só:
--   1. quantos ArticleDNA vigentes declaram `siloId` (contrato CORRENTE)
--      e quantos ainda não declaram (LEGADO hidratável);
--   2. o status efetivo de cada SiloDNA e de cada SiloPage;
--   3. o status e o tamanho de cada InternalLinkGraph;
--   4. se a base de cada grafo aprovado ainda aponta para as versões
--      VIGENTES dos ArticleDNA — é isto que fica stale quando a fase
--      Artigos cria sucessoras.
--
-- Trocar apenas o :marca_id.
-- =====================================================================

WITH params AS (
  SELECT '09762023-d0d4-4c24-b34e-d0fdfd43f891'::uuid AS marca_id
),

-- Versão VIGENTE de cada artefato: a de maior version_number por entidade.
vigentes AS (
  SELECT DISTINCT ON (v.artifact_type, v.entity_id)
    v.artifact_type, v.entity_id, v.version_id, v.version_number,
    v.previous_version_id, v.content_hash, v.payload
  FROM public.editorial_artifact_versions v, params p
  WHERE v.marca_id = p.marca_id
  ORDER BY v.artifact_type, v.entity_id, v.version_number DESC
),

-- Status efetivo: o último evento registrado para aquela versão.
status_vigente AS (
  SELECT DISTINCT ON (e.version_id) e.version_id, e.status, e.occurred_at
  FROM public.editorial_version_status_events e
  JOIN vigentes vg ON vg.version_id = e.version_id
  ORDER BY e.version_id, e.occurred_at DESC
),

artefatos AS (
  SELECT
    vg.artifact_type,
    vg.entity_id,
    vg.version_id,
    vg.version_number,
    COALESCE(sv.status, 'sem evento') AS status,
    CASE vg.artifact_type
      WHEN 'article_dna' THEN
        CASE
          WHEN NULLIF(btrim(COALESCE(vg.payload->>'siloId', '')), '') IS NOT NULL
           AND NULLIF(btrim(COALESCE(vg.payload->>'territoryRef', '')), '') IS NOT NULL
            THEN 'CURRENT'
          WHEN NULLIF(btrim(COALESCE(vg.payload->>'territoryRef', '')), '') IS NOT NULL
            THEN 'LEGACY_HYDRATABLE'
          ELSE 'LEGACY_UNRESOLVED'
        END
      ELSE NULL
    END AS contrato_silo,
    vg.payload->>'siloId'       AS silo_id,
    vg.payload->>'territoryRef' AS territory_ref,
    vg.payload->>'slug'         AS slug,
    vg.payload->>'canonical'    AS canonical,
    -- Retrato terminal das classificações. Ausente = ArticleDNA anterior ao
    -- contrato: a tela mostrava "Pendente" porque não havia o que ler, e isso
    -- é falta de registro, não incerteza.
    CASE WHEN vg.artifact_type = 'article_dna' THEN
      COALESCE(vg.payload#>>'{classification,intent,value}', 'AUSENTE')
    END AS intent,
    CASE WHEN vg.artifact_type = 'article_dna' THEN
      COALESCE(vg.payload#>>'{classification,funnel,value}', 'AUSENTE')
    END AS funnel,
    CASE WHEN vg.artifact_type = 'article_dna' THEN
      COALESCE(vg.payload#>>'{classification,kgr,value}', 'AUSENTE')
    END AS kgr,
    CASE WHEN vg.artifact_type = 'article_dna' THEN
      COALESCE(vg.payload#>>'{classification,kgrApplicability,value}', 'AUSENTE')
    END AS kgr_applicability,
    CASE WHEN vg.artifact_type = 'article_dna' THEN
      COALESCE(vg.payload#>>'{classification,compatibility,value}', 'AUSENTE')
    END AS compatibility
  FROM vigentes vg
  LEFT JOIN status_vigente sv ON sv.version_id = vg.version_id
)

-- ---------------------------------------------------------------- 1..3
SELECT
  artifact_type                          AS escopo,
  entity_id,
  version_id,
  version_number                         AS versao,
  status,
  contrato_silo,
  silo_id,
  territory_ref,
  slug,
  canonical,
  intent,
  funnel,
  kgr,
  kgr_applicability,
  compatibility,
  NULL::bigint                           AS arestas,
  NULL::text                             AS base_stale
FROM artefatos

UNION ALL

-- --------------------------------------------------------------- 4
-- Grafo aprovado cuja base aponta para versão de ArticleDNA que já não é
-- a vigente: é exatamente o que uma sucessora provoca.
SELECT
  'internal_link_graph'                  AS escopo,
  g.graph_id                             AS entity_id,
  g.graph_version_id                     AS version_id,
  g.version_number                       AS versao,
  g.workflow_status                      AS status,
  NULL                                   AS contrato_silo,
  g.silo_id,
  NULL                                   AS territory_ref,
  NULL                                   AS slug,
  NULL                                   AS canonical,
  NULL, NULL, NULL, NULL, NULL,
  (SELECT count(*) FROM public.internal_link_graph_edges e
    WHERE e.graph_version_id = g.graph_version_id) AS arestas,
  -- A base do grafo é a lista de referências participantes, e cada referência
  -- carrega entityId + versionId + contentHash. É por isso que uma sucessora
  -- de ArticleDNA invalida a base: ela muda versionId e contentHash mantendo
  -- o mesmo entityId.
  CASE WHEN EXISTS (
    SELECT 1
    FROM jsonb_array_elements(g.participating_article_dna_version_refs) AS ref
    JOIN vigentes va
      ON va.artifact_type = 'article_dna'
     AND va.entity_id = ref->>'entityId'
    WHERE ref->>'versionId' <> va.version_id
  ) THEN 'STALE: participante não é mais a versão vigente'
    ELSE 'base coerente com as versões vigentes'
  END AS base_stale
FROM public.internal_link_graphs g, params p
WHERE g.marca_id = p.marca_id

ORDER BY escopo, entity_id, versao;
