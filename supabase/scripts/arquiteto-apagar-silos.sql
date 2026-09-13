-- ARQUITETO — APAGAR OS SILOS DE UMA MARCA — versão 2026-09-08-v1
--
-- Isto NÃO é um segundo reset. O reset da homologação continua sendo
-- `arquiteto-homologation-reset.sql`, e hoje ele PARA no pré-voo porque o
-- Radar aponta para ArticleDNA desta mesa. Os silos não têm esse problema:
-- medido no acervo, NADA fora do Arquiteto referencia as versões de silo.
--
--   editorial_decision_events   → 0 referências a silo (as 10 são do Radar e
--                                 apontam só para `article_dna`)
--   editorial_workflow_items    → 0 (nenhum item de outro stage aponta)
--   editorial_serp_*            → 0
--   internal_link_graph*        → 18 (do próprio Arquiteto)
--   auto-referência silo_page   → 3 (SiloPage aponta para SiloDNA)
--
-- Por isso este arquivo existe e roda hoje: é a exclusão que a aba Silos não
-- oferece, no escopo exato dos silos, sem encostar em Radar nem em ArticleDNA.
--
-- O GRAFO DE LINKS INTERNOS SAI JUNTO, e não é escopo extra: cada grafo tem
-- `base_silo_dna_version_id`/`base_silo_page_version_id` apontando para o silo.
-- Um grafo cuja base deixou de existir não é um grafo — é um resto.
--
-- O QUE ELE NÃO FAZ:
--   * não dá DROP em função nem em trigger — cada um é desabilitado e devolvido
--     ao estado ORIGINAL (`tgenabled`) dentro da mesma transação;
--   * não apaga ArticleDNA (o readback exige que a contagem NÃO mude);
--   * não apaga nem altera nada do Radar;
--   * não toca em Minerador, Brand nem memberships.
--
-- ANTES DE EXECUTAR: confirme o projeto de homologação e faça backup.

BEGIN;

DO $$
DECLARE
  target_brand constant uuid := '09762023-d0d4-4c24-b34e-d0fdfd43f891';

  -- Só o que é silo. `article_dna` e `article_architecture_ai_review` ficam.
  silo_artifact_types constant text[] := ARRAY['silo_dna', 'silo_page'];

  -- Estado de trabalho dos silos/territórios em `stage = 'architect'`.
  silo_subject_types constant text[] := ARRAY[
    'territory', 'silo_working_copy',
    'territorial_serp_assessment', 'territorial_ai_review'
  ];

  protection record;
  protected_triggers jsonb := '[]'::jsonb;

  outsiders integer;
  article_dna_antes integer;
  article_dna_depois integer;
  radar_antes integer;
  radar_depois integer;

  removed_versions integer := 0;
  removed_events integer := 0;
  removed_workflow integer := 0;
  removed_graphs integer := 0;
  rodada integer := 0;

  left_versions integer;
  left_workflow integer;
  left_graphs integer;
BEGIN
  ------------------------------------------------------------------- pré-voo
  -- A medição que autoriza este script tem de continuar verdadeira NA HORA.
  -- Se alguém de fora passou a apontar para um silo desde então, este arquivo
  -- perdeu a premissa e não roda.
  SELECT
      (SELECT count(*) FROM public.editorial_decision_events e
        WHERE e.source_version_id IN (
          SELECT v.version_id FROM public.editorial_artifact_versions v
           WHERE v.marca_id = target_brand AND v.artifact_type = ANY (silo_artifact_types)))
    + (SELECT count(*) FROM public.editorial_workflow_items w
        WHERE w.source_version_id IN (
          SELECT v.version_id FROM public.editorial_artifact_versions v
           WHERE v.marca_id = target_brand AND v.artifact_type = ANY (silo_artifact_types)))
    + (SELECT count(*) FROM public.editorial_serp_snapshots s
        WHERE s.source_version_id IN (
          SELECT v.version_id FROM public.editorial_artifact_versions v
           WHERE v.marca_id = target_brand AND v.artifact_type = ANY (silo_artifact_types)))
    + (SELECT count(*) FROM public.editorial_serp_reviews r
        WHERE r.source_version_id IN (
          SELECT v.version_id FROM public.editorial_artifact_versions v
           WHERE v.marca_id = target_brand AND v.artifact_type = ANY (silo_artifact_types)))
    + (SELECT count(*) FROM public.editorial_decision_events e
        WHERE e.workflow_item_id IN (
          SELECT w.id FROM public.editorial_workflow_items w
           WHERE w.marca_id = target_brand AND w.stage = 'architect'
             AND w.subject_type = ANY (silo_subject_types)))
    INTO outsiders;
  IF outsiders > 0 THEN
    RAISE EXCEPTION 'ARQUITETO_SILOS_TEM_DEPENDENTE_EXTERNO: % referência(s). A premissa deste script caiu; refaça a medição antes de apagar.', outsiders;
  END IF;

  -- Contagens que NÃO podem mudar. É assim que "apagar demais" vira exceção.
  SELECT count(*) INTO article_dna_antes FROM public.editorial_artifact_versions
   WHERE marca_id = target_brand AND artifact_type = 'article_dna';
  SELECT count(*) INTO radar_antes FROM public.editorial_workflow_items
   WHERE marca_id = target_brand AND stage <> 'architect';

  ------------------------------------------------------------------ triggers
  -- Descobertos pelo catálogo, não por nome escrito à mão.
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
         'editorial_version_status_events',
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
    RAISE EXCEPTION 'ARQUITETO_SILOS_NO_PROTECTION_FOUND: o mapa de triggers não casou com o schema';
  END IF;

  ------------------------------------------------------------------- deletes
  -- A ordem é a do FK: quem aponta sai antes de quem é apontado.

  -- 1. Grafo de links internos: filhos antes dos pais, e o conjunto antes das
  --    versões, porque grafos e nós apontam para SiloDNA e SiloPage.
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

  -- 2. Eventos de status das versões de silo que vão sair.
  WITH alvo AS (
    DELETE FROM public.editorial_version_status_events e
     WHERE e.version_id IN (
       SELECT v.version_id FROM public.editorial_artifact_versions v
        WHERE v.marca_id = target_brand
          AND v.artifact_type = ANY (silo_artifact_types)
     )
    RETURNING 1
  ) SELECT count(*) INTO removed_events FROM alvo;

  -- 3. As versões de silo, NA ORDEM DA PRÓPRIA REFERÊNCIA.
  --
  --    SiloPage aponta para SiloDNA (`source_version_id`), e RESTRICT não
  --    perdoa nem quando as duas pontas saem no mesmo DELETE. A primeira
  --    versão deste script soltava o vínculo (`SET source_version_id = NULL`)
  --    antes de apagar, e levou P0001 de
  --    `pipeline_editorial_validate_artifact_source()`:
  --    "silo_page requires a source SiloDNA version".
  --
  --    A validação está certa — um SiloPage sem SiloDNA é estado inválido.
  --    Errado era o caminho: não se passa por um estado inválido só para
  --    chegar ao delete. Apagando na ordem da referência, o UPDATE deixa de
  --    existir e NENHUMA validação precisa ser desabilitada — este script
  --    suspende só o append-only.
  --
  --    E a ordem não é escrita à mão (`silo_page`, depois `silo_dna`): sai
  --    quem NINGUÉM referencia, e repete. Assim uma cadeia de sucessoras
  --    entre SiloDNAs também se desfaz, e o que nunca vira folha fica — e o
  --    readback reclama, em vez de o script inventar um jeito de forçar.
  LOOP
    WITH alvo AS (
      DELETE FROM public.editorial_artifact_versions v
       WHERE v.marca_id = target_brand
         AND v.artifact_type = ANY (silo_artifact_types)
         AND NOT EXISTS (
           SELECT 1 FROM public.editorial_artifact_versions f
            WHERE f.source_version_id = v.version_id
         )
      RETURNING 1
    ) SELECT count(*) INTO rodada FROM alvo;
    removed_versions := removed_versions + rodada;
    EXIT WHEN rodada = 0;
  END LOOP;

  -- 4. Estado de trabalho dos silos e territórios.
  WITH alvo AS (
    DELETE FROM public.editorial_workflow_items w
     WHERE w.marca_id = target_brand
       AND w.stage = 'architect'
       AND w.subject_type = ANY (silo_subject_types)
    RETURNING 1
  ) SELECT count(*) INTO removed_workflow FROM alvo;

  ------------------------------------------------------------------ readback
  SELECT count(*) INTO left_versions FROM public.editorial_artifact_versions
   WHERE marca_id = target_brand AND artifact_type = ANY (silo_artifact_types);
  SELECT count(*) INTO left_workflow FROM public.editorial_workflow_items
   WHERE marca_id = target_brand AND stage = 'architect'
     AND subject_type = ANY (silo_subject_types);
  SELECT count(*) INTO left_graphs FROM public.internal_link_graphs WHERE marca_id = target_brand;

  IF left_versions <> 0 OR left_workflow <> 0 OR left_graphs <> 0 THEN
    RAISE EXCEPTION 'ARQUITETO_SILOS_INCOMPLETO: versions=% workflow=% graphs=%',
      left_versions, left_workflow, left_graphs;
  END IF;

  -- O escopo era silo. Se ArticleDNA ou Radar mudaram, vazou, e a transação
  -- inteira volta atrás — inclusive os triggers.
  SELECT count(*) INTO article_dna_depois FROM public.editorial_artifact_versions
   WHERE marca_id = target_brand AND artifact_type = 'article_dna';
  SELECT count(*) INTO radar_depois FROM public.editorial_workflow_items
   WHERE marca_id = target_brand AND stage <> 'architect';

  IF article_dna_depois <> article_dna_antes OR radar_depois <> radar_antes THEN
    RAISE EXCEPTION 'ARQUITETO_SILOS_SCOPE_LEAK: article_dna %→%, radar %→%',
      article_dna_antes, article_dna_depois, radar_antes, radar_depois;
  END IF;

  ------------------------------------------------------ devolve as proteções
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

  RAISE NOTICE 'ARQUITETO_SILOS_APAGADOS_OK';
  RAISE NOTICE '  silo_versions_removidas = % (silo_dna + silo_page)', removed_versions;
  RAISE NOTICE '  silo_workflow_removidos = %', removed_workflow;
  RAISE NOTICE '  status_events_removidos = %', removed_events;
  RAISE NOTICE '  internal_link_graph_rows_removidas = %', removed_graphs;
  RAISE NOTICE '  ARTICLE_DNA_INTOCADO = % (era %)', article_dna_depois, article_dna_antes;
  RAISE NOTICE '  RADAR_INTOCADO = % (era %)', radar_depois, radar_antes;
  RAISE NOTICE '  TRIGGERS_RESTAURADOS = %', jsonb_array_length(protected_triggers);
END;
$$;

COMMIT;

-- Conferência depois do COMMIT.
-- Esperado: silo_* e grafo zerados; article_dna e radar iguais a antes.
SELECT
  (SELECT count(*) FROM public.editorial_artifact_versions
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
      AND artifact_type IN ('silo_dna','silo_page')) AS silos_restantes,
  (SELECT count(*) FROM public.editorial_workflow_items
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND stage = 'architect'
      AND subject_type IN ('territory','silo_working_copy','territorial_serp_assessment','territorial_ai_review')) AS territorios_restantes,
  (SELECT count(*) FROM public.internal_link_graphs
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891') AS grafos_restantes,
  (SELECT count(*) FROM public.editorial_artifact_versions
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
      AND artifact_type = 'article_dna') AS article_dna_intocado,
  (SELECT count(*) FROM public.editorial_workflow_items
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND stage <> 'architect') AS radar_intocado;
