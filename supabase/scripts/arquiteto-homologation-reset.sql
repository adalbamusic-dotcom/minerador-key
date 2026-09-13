-- ARQUITETO — RESET ADMINISTRATIVO DA HOMOLOGAÇÃO — versão 2026-09-08-v1
--
-- Apaga o estado editorial do ARQUITETO de UMA marca. Uma transação só.
--
-- POR QUE ISTO É UM .sql E NÃO UM SCRIPT DA APLICAÇÃO:
--
-- O cliente da aplicação fala PostgREST. Ele não abre transação, não roda DDL
-- e não desabilita trigger. Um reset feito por chamadas REST seria uma
-- sequência de deletes sem atomicidade — exatamente o "reset pela metade" que
-- o §4 proíbe. Por isso ele vive aqui, no mesmo lugar que
-- `development-data-reset-real.sql`, e roda no editor SQL.
--
-- O QUE ELE NÃO FAZ:
--
--   * não dá DROP em função nem em trigger;
--   * não enfraquece o append-only da plataforma: cada trigger é desabilitado
--     e devolvido ao estado ORIGINAL (`tgenabled`) dentro da mesma transação;
--   * não apaga nada fora da lista de permissão;
--   * não toca em Minerador, Brand, memberships nem em `stage` de outro módulo.
--
-- Se qualquer contagem do readback não bater, ele levanta exceção e a
-- transação inteira volta atrás — inclusive os triggers.
--
-- ANTES DE EXECUTAR: confirme o projeto de homologação e faça backup.
-- Substitua apenas `reset_ack` pelo literal aprovado.

BEGIN;

DO $$
DECLARE
  reset_ack constant text := 'ARQUITETO_HOMOLOGATION_RESET_CONFIRMED_2026_09_08';
  target_brand constant uuid := '09762023-d0d4-4c24-b34e-d0fdfd43f891';

  -- Só estes tipos saem de `editorial_artifact_versions`. A mesma tabela
  -- guarda, sob a mesma marca, artefatos do Minerador e da Brand; um delete
  -- por `marca_id` destruiria o trabalho deles junto.
  arquiteto_artifact_types constant text[] := ARRAY[
    'article_dna', 'silo_dna', 'silo_page', 'article_architecture_ai_review'
  ];
  preserved_artifact_types constant text[] := ARRAY[
    'keyword_semantic_qualification', 'keyword_contextual_presentation', 'brand_skill'
  ];

  -- Estado de trabalho da mesa, em `stage = 'architect'`.
  arquiteto_subject_types constant text[] := ARRAY[
    'keyword', 'territory', 'silo_working_copy',
    'architecture_analysis', 'article_formation_analysis',
    'territorial_serp_assessment', 'article_formation_serp_assessment',
    'territorial_ai_review', 'arquiteto_homologation_round',
    -- Status operacional do artigo (PRONTO_PARA_RADAR / ENVIADO_AO_RADAR),
    -- gravado em `stage = 'architect'`. O item do Radar usa a MESMA
    -- subject_type em `stage = 'radar'` e NÃO é tocado: o delete filtra por
    -- stage, e o pré-voo continua barrando o que é do Radar.
    'article'
  ];

  -- O que o RADAR escreve em `editorial_decision_events`. Estas linhas
  -- apontam para ArticleDNA desta mesa, mas o dono delas e outro modulo.
  radar_event_types constant text[] := ARRAY['import_radar'];

  -- APAGAR TAMBÉM OS DADOS DE HOMOLOGAÇÃO DO RADAR QUE APONTAM PARA ESTA MESA.
  --
  -- Fora daqui, o Radar é intocável: com `false`, o reset PARA e devolve
  -- esses registros ao dono deles. Está `true` porque o Planejador autorizou
  -- em 2026-09-08 ("podemos apagar os artigos do radar para zerar mesmo"),
  -- e o escopo é o mínimo que destrava: SÓ as linhas do Radar que referenciam
  -- uma versão do Arquiteto que está saindo. O resto do Radar continua fora.
  delete_radar_homologation constant boolean := true;

  protection record;
  protected_triggers jsonb := '[]'::jsonb;

  removed_versions integer := 0;
  removed_events integer := 0;
  removed_workflow integer := 0;
  removed_graphs integer := 0;
  removed_serp integer := 0;
  removed_decisions integer := 0;
  rodada integer := 0;

  left_versions integer;
  left_workflow integer;
  left_graphs integer;
  left_serp integer;
  kept_other_types integer;
  kept_other_stage integer;
  kept_minerador_keywords integer;
  radar_blocking_items integer;
  radar_blocking_events integer;
  removed_radar integer := 0;
  unexpected_subject text;
BEGIN
  IF reset_ack IS DISTINCT FROM 'ARQUITETO_HOMOLOGATION_RESET_CONFIRMED_2026_09_08' THEN
    RAISE EXCEPTION 'ARQUITETO_RESET_ACK_MISSING';
  END IF;

  -- Recusa antes de tocar em qualquer coisa: subject_type do Arquiteto que
  -- esta lista não conhece significa que o mapa está velho, e apagar por
  -- omissão é o erro caro.
  SELECT string_agg(DISTINCT w.subject_type, ', ')
    INTO unexpected_subject
    FROM public.editorial_workflow_items w
   WHERE w.marca_id = target_brand
     AND w.stage = 'architect'
     AND NOT (w.subject_type = ANY (arquiteto_subject_types));
  IF unexpected_subject IS NOT NULL THEN
    RAISE EXCEPTION 'ARQUITETO_RESET_UNKNOWN_SUBJECT_TYPE: %', unexpected_subject;
  END IF;

  -- O RADAR APONTA PARA ESTA MESA.
  --
  -- Uma versao anterior soltava a referencia (`source_version_id = NULL`) nos
  -- itens do Radar para o FK deixar o delete passar. Isso nao volta: alterar
  -- linha de outro modulo para facilitar o reset deste mistura os dois.
  --
  -- Ou o Radar sai INTEIRO das linhas que travam (`delete_radar_homologation`),
  -- ou o reset PARA e diz exatamente o que esta no caminho. Nao existe
  -- meio-termo em que a linha fica mas sem apontar para nada.
  SELECT count(*) INTO radar_blocking_items
    FROM public.editorial_workflow_items w
   WHERE w.marca_id = target_brand
     AND w.stage <> 'architect'
     AND w.source_version_id IN (
       SELECT v.version_id FROM public.editorial_artifact_versions v
        WHERE v.marca_id = target_brand
          AND v.artifact_type = ANY (arquiteto_artifact_types)
     );
  SELECT count(*) INTO radar_blocking_events
    FROM public.editorial_decision_events e
   WHERE e.marca_id = target_brand
     AND e.event_type = ANY (radar_event_types)
     AND e.source_version_id IN (
       SELECT v.version_id FROM public.editorial_artifact_versions v
        WHERE v.marca_id = target_brand
          AND v.artifact_type = ANY (arquiteto_artifact_types)
     );
  IF NOT delete_radar_homologation
     AND (radar_blocking_items > 0 OR radar_blocking_events > 0) THEN
    RAISE EXCEPTION 'ARQUITETO_RESET_BLOQUEADO_PELO_RADAR: workflow_items=% decision_events=%. Limpe estes dados de homologacao pelo Radar antes de rodar o reset do Arquiteto.',
      radar_blocking_items, radar_blocking_events;
  END IF;

  ------------------------------------------------------------------ triggers
  -- Descobertos pelo catálogo, não por nome escrito à mão: assim o script
  -- acompanha o schema em vez de divergir dele em silêncio.
  FOR protection IN
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           t.tgname  AS trigger_name,
           t.tgenabled AS original_enabled
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal
       AND n.nspname = 'public'
       AND p.proname IN (
         'pipeline_editorial_protect_append_only',
         'editorial_protect_append_only',
         'internal_link_graph_protect_append_only'
       )
       AND c.relname IN (
         'editorial_artifact_versions', 'editorial_workflow_items',
         'editorial_decision_events',
         'editorial_version_status_events', 'editorial_serp_snapshots', 'editorial_serp_reviews',
         'internal_link_graphs', 'internal_link_graph_nodes', 'internal_link_graph_edges',
         'internal_link_graph_working_copies', 'internal_link_graph_proposals'
       )
  LOOP
    protected_triggers := protected_triggers || jsonb_build_array(jsonb_build_object(
      'schema_name', protection.schema_name,
      'table_name', protection.table_name,
      'trigger_name', protection.trigger_name,
      'original_enabled', protection.original_enabled
    ));
    EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I',
                   protection.schema_name, protection.table_name, protection.trigger_name);
  END LOOP;

  IF jsonb_array_length(protected_triggers) = 0 THEN
    RAISE EXCEPTION 'ARQUITETO_RESET_NO_PROTECTION_FOUND: o mapa de triggers não casou com o schema';
  END IF;

  ------------------------------------------------------------------- deletes
  --
  -- A ORDEM É DITADA PELO GRAFO DE FK, NÃO PELA NARRATIVA.
  --
  -- Tudo que aponta para `editorial_artifact_versions(version_id)` é
  -- ON DELETE RESTRICT. Descobrir isso um erro por vez custou duas execuções;
  -- o mapa completo, medido no acervo, é este:
  --
  --   editorial_version_status_events.version_id            114
  --   editorial_decision_events.source_version_id            10  (e também
  --                                                              aponta para
  --                                                              workflow_items)
  --   editorial_serp_reviews.source_version_id                6
  --   editorial_serp_snapshots.source_version_id              9
  --   editorial_workflow_items.source_version_id              4  (stage=radar,
  --                                                              barrado no
  --                                                              pré-voo)
  --   internal_link_graphs.base_silo_dna_version_id           6
  --   internal_link_graph_nodes.article_dna_version_id       11
  --   editorial_artifact_versions.source_version_id           4  (auto-ref)
  --
  -- RESTRICT é verificado linha a linha e NÃO perdoa nem a auto-referência
  -- dentro do mesmo DELETE: por isso as versões saem por folha, no §7.

  -- 1. Decisões que apontam para versões do Arquiteto.
  --
  --    NÃO por `marca_id`. Esta tabela guarda decisões de mais de um módulo
  --    sob a mesma marca; apagar por marca levaria junto o que não é desta
  --    mesa — o mesmo erro que um delete de versões por marca cometeria.
  --    Sai só o que referencia uma versão do Arquiteto que está saindo, e o
  --    que é do Radar já foi barrado no pré-voo, não é apagado aqui.
  WITH alvo AS (
    DELETE FROM public.editorial_decision_events e
     WHERE e.marca_id = target_brand
       AND (delete_radar_homologation
            OR NOT (e.event_type = ANY (radar_event_types)))
       AND e.source_version_id IN (
         SELECT v.version_id FROM public.editorial_artifact_versions v
          WHERE v.marca_id = target_brand
            AND v.artifact_type = ANY (arquiteto_artifact_types)
       )
    RETURNING 1
  ) SELECT count(*) INTO removed_decisions FROM alvo;

  -- 2. Eventos de status das versões que vão sair.
  WITH alvo AS (
    DELETE FROM public.editorial_version_status_events e
     WHERE e.version_id IN (
       SELECT v.version_id FROM public.editorial_artifact_versions v
        WHERE v.marca_id = target_brand
          AND v.artifact_type = ANY (arquiteto_artifact_types)
     )
    RETURNING 1
  ) SELECT count(*) INTO removed_events FROM alvo;

  -- 3. SERP do Arquiteto: reviews antes dos snapshots.
  WITH alvo AS (DELETE FROM public.editorial_serp_reviews WHERE marca_id = target_brand RETURNING 1)
  SELECT count(*) INTO removed_serp FROM alvo;
  WITH alvo AS (DELETE FROM public.editorial_serp_snapshots WHERE marca_id = target_brand RETURNING 1)
  SELECT count(*) + removed_serp INTO removed_serp FROM alvo;

  -- 4. Grafo: filhos antes dos pais, e o conjunto inteiro antes das versões,
  --    porque nós e grafos apontam para ArticleDNA e SiloDNA.
  WITH alvo AS (DELETE FROM public.internal_link_graph_edges WHERE marca_id = target_brand RETURNING 1)
  SELECT count(*) INTO removed_graphs FROM alvo;
  WITH alvo AS (DELETE FROM public.internal_link_graph_nodes WHERE marca_id = target_brand RETURNING 1)
  SELECT count(*) + removed_graphs INTO removed_graphs FROM alvo;
  WITH alvo AS (DELETE FROM public.internal_link_graph_proposals WHERE marca_id = target_brand RETURNING 1)
  SELECT count(*) + removed_graphs INTO removed_graphs FROM alvo;
  WITH alvo AS (DELETE FROM public.internal_link_graph_working_copies WHERE marca_id = target_brand RETURNING 1)
  SELECT count(*) + removed_graphs INTO removed_graphs FROM alvo;
  WITH alvo AS (DELETE FROM public.internal_link_graphs WHERE marca_id = target_brand RETURNING 1)
  SELECT count(*) + removed_graphs INTO removed_graphs FROM alvo;

  -- 5. Estado de trabalho da mesa.
  WITH alvo AS (
    DELETE FROM public.editorial_workflow_items w
     WHERE w.marca_id = target_brand
       AND w.stage = 'architect'
       AND w.subject_type = ANY (arquiteto_subject_types)
    RETURNING 1
  ) SELECT count(*) INTO removed_workflow FROM alvo;

  -- 6. Itens do Radar que apontam para ArticleDNA desta mesa.
  --    Só estes: `stage <> 'architect'` que referencia versão do Arquiteto.
  --    O Radar que não olha para cá não é tocado.
  IF delete_radar_homologation THEN
    WITH alvo AS (
      DELETE FROM public.editorial_workflow_items w
       WHERE w.marca_id = target_brand
         AND w.stage <> 'architect'
         AND w.source_version_id IN (
           SELECT v.version_id FROM public.editorial_artifact_versions v
            WHERE v.marca_id = target_brand
              AND v.artifact_type = ANY (arquiteto_artifact_types)
         )
      RETURNING 1
    ) SELECT count(*) INTO removed_radar FROM alvo;
  END IF;

  -- 7. As versões, NA ORDEM DA PRÓPRIA REFERÊNCIA.
  --
  --    RESTRICT não perdoa a auto-referência nem quando as duas pontas saem
  --    no mesmo DELETE. A saída óbvia — soltar o vínculo com
  --    `SET source_version_id = NULL` antes de apagar — está errada: ela
  --    bate em `pipeline_editorial_validate_artifact_source()` com P0001
  --    ("silo_page requires a source SiloDNA version"), e a validação tem
  --    razão. Um artefato sem a origem que ele exige é estado inválido, e
  --    não se passa por estado inválido só para chegar ao delete.
  --
  --    Sai quem NINGUÉM referencia, e repete. Cadeias de sucessoras se
  --    desfazem sozinhas, nenhuma validação precisa ser desabilitada, e o
  --    que nunca vira folha fica para o readback reclamar.
  LOOP
    WITH alvo AS (
      DELETE FROM public.editorial_artifact_versions v
       WHERE v.marca_id = target_brand
         AND v.artifact_type = ANY (arquiteto_artifact_types)
         AND NOT EXISTS (
           SELECT 1 FROM public.editorial_artifact_versions f
            WHERE f.source_version_id = v.version_id
         )
      RETURNING 1
    ) SELECT count(*) INTO rodada FROM alvo;
    removed_versions := removed_versions + rodada;
    EXIT WHEN rodada = 0;
  END LOOP;

  ------------------------------------------------------------------ readback
  SELECT count(*) INTO left_versions FROM public.editorial_artifact_versions
   WHERE marca_id = target_brand AND artifact_type = ANY (arquiteto_artifact_types);
  SELECT count(*) INTO left_workflow FROM public.editorial_workflow_items
   WHERE marca_id = target_brand AND stage = 'architect';
  SELECT count(*) INTO left_graphs FROM public.internal_link_graphs WHERE marca_id = target_brand;
  SELECT count(*) INTO left_serp FROM public.editorial_serp_snapshots WHERE marca_id = target_brand;

  SELECT count(*) INTO kept_other_types FROM public.editorial_artifact_versions
   WHERE marca_id = target_brand AND artifact_type = ANY (preserved_artifact_types);
  SELECT count(*) INTO kept_other_stage FROM public.editorial_workflow_items
   WHERE marca_id = target_brand AND stage <> 'architect';
  SELECT count(*) INTO kept_minerador_keywords FROM public.minerador_keywords
   WHERE brand_id = target_brand;

  IF left_versions <> 0 OR left_workflow <> 0 OR left_graphs <> 0 OR left_serp <> 0 THEN
    RAISE EXCEPTION 'ARQUITETO_RESET_INCOMPLETE: versions=% workflow=% graphs=% serp=%',
      left_versions, left_workflow, left_graphs, left_serp;
  END IF;

  -- O que tinha de sobreviver precisa ter sobrevivido. Se os artefatos do
  -- Minerador e da Brand sumiram, o escopo vazou e a transação inteira volta.
  --
  -- As keywords NÃO entram neste guard: apagá-las pelo ciclo de vida canônico
  -- é uma decisão separada e já autorizada, e ela pode acontecer antes deste
  -- reset. Zero keywords aqui é possível sem que nada tenha vazado.
  IF kept_other_types = 0 THEN
    RAISE EXCEPTION 'ARQUITETO_RESET_SCOPE_LEAK: artefatos do Minerador/Brand zerados (=%)', kept_other_types;
  END IF;

  ----------------------------------------------------- devolve as proteções
  FOR protection IN
    SELECT x.schema_name, x.table_name, x.trigger_name, x.original_enabled
      FROM jsonb_to_recordset(protected_triggers)
        AS x(schema_name text, table_name text, trigger_name text, original_enabled text)
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I %s TRIGGER %I',
      protection.schema_name,
      protection.table_name,
      CASE protection.original_enabled
        WHEN 'O' THEN 'ENABLE'
        WHEN 'R' THEN 'ENABLE REPLICA'
        WHEN 'A' THEN 'ENABLE ALWAYS'
        ELSE 'DISABLE'
      END,
      protection.trigger_name
    );
  END LOOP;

  RAISE NOTICE 'ARQUITETO_RESET_OK';
  RAISE NOTICE '  status_events_removidos = %', removed_events;
  RAISE NOTICE '  artifact_versions_removidas = %', removed_versions;
  RAISE NOTICE '  workflow_items_removidos = %', removed_workflow;
  RAISE NOTICE '  internal_link_graph_rows_removidas = %', removed_graphs;
  RAISE NOTICE '  serp_rows_removidas = %', removed_serp;
  RAISE NOTICE '  decision_events_removidos = %', removed_decisions;
  RAISE NOTICE '  MINERADOR_ARTIFACTS_PRESERVED = %', kept_other_types;
  RAISE NOTICE '  MINERADOR_KEYWORDS_PRESERVED = %', kept_minerador_keywords;
  RAISE NOTICE '  RADAR_ITEMS_DELETED = % (só os que apontavam para esta mesa)', removed_radar;
  RAISE NOTICE '  OTHER_STAGE_ITEMS_PRESERVED = %', kept_other_stage;
  RAISE NOTICE '  TRIGGERS_RESTAURADOS = %', jsonb_array_length(protected_triggers);
END;
$$;

COMMIT;

-- Conferência depois do COMMIT (esperado: tudo zero, exceto os preservados).
SELECT
  (SELECT count(*) FROM public.editorial_artifact_versions
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
      AND artifact_type IN ('article_dna','silo_dna','silo_page','article_architecture_ai_review')) AS arquiteto_artifact_versions,
  (SELECT count(*) FROM public.editorial_workflow_items
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND stage = 'architect') AS arquiteto_workflow_state,
  (SELECT count(*) FROM public.internal_link_graphs
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891') AS internal_link_graph,
  (SELECT count(*) FROM public.editorial_serp_snapshots
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891') AS arquiteto_serp,
  (SELECT count(*) FROM public.editorial_artifact_versions
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
      AND artifact_type IN ('keyword_semantic_qualification','keyword_contextual_presentation','brand_skill')) AS minerador_brand_preserved,
  (SELECT count(*) FROM public.minerador_keywords
    WHERE brand_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891') AS minerador_keywords_preserved,
  (SELECT count(*) FROM public.editorial_workflow_items
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND stage <> 'architect') AS radar_items_preserved;
