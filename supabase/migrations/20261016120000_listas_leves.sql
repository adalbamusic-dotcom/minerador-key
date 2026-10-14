-- =============================================================================
-- LISTAS LEVES (M-L) — views de leitura para as planilhas
-- SDD: docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md,
--      item 4, §8.3, §11.1 e F6 (§16, §18.6). Decisão D5: projeção por view.
--
-- ESTADO: NÃO APLICADA. O código da F6 funciona SEM ela: cada leitor tenta a
-- view e, quando o banco responde que ela não existe (42P01 / PGRST205), lê como
-- antes (Processador: `minerador_keywords_listagem`; Arquiteto: o parecer
-- inteiro projetado no Node). O deploy não quebra se esta migration não foi
-- aplicada; ela só corta os bytes no banco.
--
-- APLICAÇÃO (somente pelo dono, nesta ordem; pode ser antes ou depois do deploy):
--
--   1. Ensaio (não grava nada): copie este arquivo, troque o `COMMIT;` do fim por
--        DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;
--      e rode a cópia com `npx supabase db query --linked -f <copia>`. O erro
--      'ENSAIO' prova que guardas, criação e pós-checagem passaram; tudo volta.
--   2. npx supabase db query --linked -f supabase/migrations/20261016120000_listas_leves.sql
--   3. npx supabase migration repair --status applied 20261016120000 --linked
--   4. Conferência (só leitura):
--        npx supabase db query --linked -f supabase/scripts/20261016120000-listas-leves-post-verifier-read-only.sql
--      bytes e contagem por
--      marca, antes (tabela) e depois (view), e o tempo de cada leitura.
--
-- Nunca `supabase db push` (só parte das migrations consta no histórico remoto).
-- Rollback: supabase/rollback/20261016120000_listas_leves.rollback.sql
--
-- O QUE CRIA (nada é alterado nem apagado; nenhuma tabela, gatilho ou dado muda):
--
--   (1) public.minerador_jsonb_por_formato(jsonb, jsonb) — recorta um jsonb por
--       uma árvore de formato (`true` copia, `false`/ausente tira, objeto recorta
--       por dentro; `"*"` vale para a chave sem regra própria). Pura, IMMUTABLE.
--   (2) public.minerador_keyword_analise_leve(jsonb) — o `analise_semantica` como a
--       planilha do Processador o lê. A árvore é a MESMA de
--       `KEYWORD_LIGHT_SHAPE` (lib/minerador/keyword-light-list.ts); o teste
--       `tests/listas-leves-paridade-2026-10-13.test.mts` compara as duas e prova,
--       sobre fixtures, `resolver(linha inteira) = resolver(linha leve)`.
--       Medido sobre as 326 keywords vivas (2026-10-14): AdalbaPro 2,06 MB → 0,90 MB.
--   (3) VIEW public.minerador_keywords_lista_leve — as colunas da tabela, o
--       `analise_leve` no lugar do `analise_semantica` e `dna_hash` (md5 do conteúdo
--       que a assinatura do pacote aprovado lê: a tela guarda o veredito da
--       aprovação calculado na linha inteira por `id + dna_hash`). Só vivas.
--   (4) public.arquiteto_serp_parecer_leve(jsonb) e auxiliares — a projeção do
--       parecer de SERP da formação que a F2 fazia no Node
--       (`lib/arquiteto/article-serp-projection.ts`), agora no banco:
--       `assessment.snapshots[]` só com os campos escalares e, dos orgânicos,
--       `url`/`domain`/`position`; `assessment.keywordDnaReferences[]` sem a cópia
--       do KeywordDNA (do payload só `searchIntent`/`originalIntentLabel`).
--       Parecer sem `interpretation` (legado) fica inteiro.
--   (5) VIEW public.arquiteto_formation_serp_lista_leve — os pareceres da formação
--       com o payload projetado e `projetado` (boolean). AdalbaPro: 9,8 MB → ~2,4 MB.
--   (6) VIEW public.editorial_article_dna_lista_leve — a versão mais nova de cada
--       ArticleDNA em projeção (id, Silo, slug, Assunto, principal, ids/papéis das
--       keywords, status da versão, último evento e a última aprovada). Base da
--       mesa leve (sem consumidor na F6: o contrato do ArticleDNA na mesa é
--       `.strict()`; ver §18.6 da SDD).
--
-- SEGURANÇA: as três views são `security_invoker = true` (a RLS de quem lê vale,
-- como nas tabelas base); grants iguais aos das tabelas base (SELECT para
-- `authenticated` e `service_role`; nada para `anon`/PUBLIC). As funções são
-- puras (sem leitura de tabela) e têm `search_path` fixo.
-- =============================================================================

BEGIN;

-- 0. Guardas -------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.minerador_keywords') IS NULL
     OR to_regclass('public.editorial_artifact_versions') IS NULL
     OR to_regclass('public.editorial_version_status_events') IS NULL
     OR to_regclass('public.editorial_workflow_items') IS NULL THEN
    RAISE EXCEPTION 'LEVE_PRE: tabelas base ausentes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'minerador_keywords' AND column_name = 'group_id') THEN
    RAISE EXCEPTION 'LEVE_PRE: minerador_keywords.group_id ausente (aplique 20261013120000_grupos_editoriais antes).';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'minerador_keywords'
         AND column_name IN ('id','brand_id','keyword','location','results_allintitle','volume_search','kgr_score','intent','status','created_at','lista_id','volume_source','group_id','deleted_at','purge_after','deleted_by','analise_semantica')) <> 17 THEN
    RAISE EXCEPTION 'LEVE_PRE: as colunas de minerador_keywords divergem do esperado pela view.';
  END IF;
  IF to_regclass('public.minerador_keywords_lista_leve') IS NOT NULL
     OR to_regclass('public.arquiteto_formation_serp_lista_leve') IS NOT NULL
     OR to_regclass('public.editorial_article_dna_lista_leve') IS NOT NULL
     OR to_regprocedure('public.minerador_jsonb_por_formato(jsonb, jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'LEVE_PRE: objetos já existem (migration aplicada?).';
  END IF;
END $$;

-- 1. Recorte por formato -------------------------------------------------------
CREATE FUNCTION public.minerador_jsonb_por_formato(p_doc jsonb, p_formato jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF p_doc IS NULL OR p_formato IS NULL OR p_formato = 'true'::jsonb
     OR jsonb_typeof(p_doc) <> 'object' OR jsonb_typeof(p_formato) <> 'object' THEN
    RETURN p_doc;
  END IF;
  RETURN coalesce((
    SELECT jsonb_object_agg(e.key, public.minerador_jsonb_por_formato(e.value, r.regra))
      FROM jsonb_each(p_doc) e
      CROSS JOIN LATERAL (SELECT CASE WHEN p_formato ? e.key THEN p_formato -> e.key ELSE p_formato -> '*' END AS regra) r
     WHERE r.regra IS NOT NULL AND r.regra <> 'false'::jsonb
  ), '{}'::jsonb);
END;
$function$;

COMMENT ON FUNCTION public.minerador_jsonb_por_formato(jsonb, jsonb) IS
  'Listas leves (SDD 2026-10-13, F6): recorta um jsonb por uma árvore de formato (true copia, false/ausente tira, objeto recorta; "*" vale para a chave sem regra).';

-- 2. O analise_semantica da planilha do Processador ------------------------------
-- A árvore abaixo é KEYWORD_LIGHT_SHAPE (lib/minerador/keyword-light-list.ts), igual
-- caractere a caractere depois de JSON.parse — o teste de paridade confere.
CREATE FUNCTION public.minerador_keyword_analise_leve(p_semantica jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT public.minerador_jsonb_por_formato(p_semantica, $formato${"*":false,"allintitle_last_error":true,"allintitle_measurement":{"measuredAt":true,"measured_at":true,"provider":true,"resultsAllintitle":true,"results_allintitle":true,"status":true},"aprovacao":{"approvedAt":true,"approvedBy":true,"contentHash":true,"signature":true,"version":true},"dataforseo_keyword_overview":{"executor":true,"externalIntent":true,"external_intent":true,"keywordDifficulty":true,"keyword_difficulty":true,"mainIntent":true,"main_intent":true,"operationRequestId":true,"provider":true},"dataforseo_keyword_overview_last_error":true,"dataforseo_keyword_overview_measurement":true,"discovery_import":{"source":true,"lastMeasurement":true,"dataforseo_keyword_overview":true,"dataforseo_keyword_overview_measurement":true,"importedMetrics":true,"keywordOverview":true,"metrics":true,"sourceSnapshot":{"measuredAt":true,"provider":true,"providerVersion":true,"allintitleProvider":true,"allintitle_provider":true,"currencyCode":true,"currency_code":true,"dataforseo_keyword_overview":true,"dataforseo_keyword_overview_measurement":true,"importedMetrics":true,"metrics":{"*":true,"monthlySearchVolumes":false},"sourceData":{"importedMetrics":true}}},"dna_origem":true,"evidencia_serp":{"collectedAt":true,"contentHash":true,"funnel":true,"intent":true,"invalidada":true,"lentes":true,"semanticState":true,"version":true,"versionId":true},"funnel":true,"funnel_canonico":true,"funnel_human":true,"funnel_humano":true,"funnel_revisado":true,"human_review":{"*":true,"completedAt":false,"completedBy":false},"intencao_humana":true,"intencao_principal":true,"intencao_revisada":true,"keyword_declared_principal":true,"keyword_overview_measurement":true,"keyword_page_type":true,"keyword_page_type_stance":true,"keyword_subject":true,"keyword_subject_actor":true,"keyword_subject_at":true,"keyword_subject_conversion":true,"keyword_subject_origin":true,"kgrApplicability":true,"kgr_aplicabilidade":true,"kgr_aplicavel":true,"kgr_applicability":true,"kgr_decisao":true,"kgr_decisao_origem":true,"logicInputHash":true,"logicProcessedAt":true,"logicProcessorVersion":true,"logical_output_contract":{"version":true,"fields":{"*":{"state":true,"value":true}}},"niche":true,"nicho":true,"nicho_canonico":true,"nicho_humano":true,"nicho_override":true,"nicho_revisado":true,"primary_keyword_policy":true,"site_origin":{"*":true,"publication_link_history":false},"volume_eligibility":{"averageMonthlySearches":true,"measuredAt":true,"provider":true,"status":true},"volume_measurement":{"averageCpcMicros":true,"averageMonthlySearches":true,"currencyCode":true,"currency_code":true,"match":true,"measuredAt":true,"provider":true,"rawVolume":true,"status":true}}$formato$::jsonb);
$function$;

COMMENT ON FUNCTION public.minerador_keyword_analise_leve(jsonb) IS
  'Listas leves (F6): o analise_semantica que a planilha do Processador lê. Mesma árvore de KEYWORD_LIGHT_SHAPE (lib/minerador/keyword-light-list.ts).';

-- 3. A lista leve das keywords ---------------------------------------------------
CREATE VIEW public.minerador_keywords_lista_leve WITH (security_invoker = true) AS
SELECT
  k.id, k.brand_id, k.keyword, k.location, k.results_allintitle, k.volume_search,
  k.kgr_score, k.intent, k.status, k.created_at, k.lista_id, k.volume_source,
  k.group_id, k.deleted_at, k.purge_after, k.deleted_by,
  coalesce(public.minerador_keyword_analise_leve(k.analise_semantica), '{}'::jsonb) AS analise_leve,
  -- Tudo que a assinatura do pacote aprovado pode ler (superconjunto): mudou
  -- qualquer coisa, o veredito guardado na tela deixa de valer.
  md5(jsonb_build_array(k.keyword, k.location, k.intent, k.status, k.volume_search,
                        k.volume_source, k.results_allintitle, k.kgr_score, k.lista_id,
                        k.analise_semantica)::text) AS dna_hash
FROM public.minerador_keywords k
WHERE k.deleted_at IS NULL;

COMMENT ON VIEW public.minerador_keywords_lista_leve IS
  'Listas leves (SDD 2026-10-13, F6): keywords vivas com o analise_semantica recortado para a planilha (analise_leve) e dna_hash. Escrita nunca lê daqui.';

-- 4. O parecer de SERP da formação em projeção -----------------------------------
CREATE FUNCTION public.arquiteto_serp_organico_leve(p_resultado jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_resultado) = 'object' THEN coalesce((
    SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(p_resultado) e
     WHERE e.key IN ('url', 'domain', 'position')
  ), '{}'::jsonb) ELSE p_resultado END;
$function$;

CREATE FUNCTION public.arquiteto_serp_consulta_leve(p_consulta jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_consulta) = 'object' THEN coalesce((
    SELECT jsonb_object_agg(e.key, CASE
             WHEN e.key = 'organicResults' AND jsonb_typeof(e.value) = 'array' THEN coalesce((
               SELECT jsonb_agg(public.arquiteto_serp_organico_leve(o.valor) ORDER BY o.ordem)
                 FROM jsonb_array_elements(e.value) WITH ORDINALITY AS o(valor, ordem)), '[]'::jsonb)
             ELSE e.value END)
      FROM jsonb_each(p_consulta) e
     WHERE e.key = 'organicResults' OR jsonb_typeof(e.value) IN ('string', 'number', 'boolean', 'null')
  ), '{}'::jsonb) ELSE p_consulta END;
$function$;

CREATE FUNCTION public.arquiteto_serp_dna_ref_leve(p_ref jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_ref) = 'object' THEN coalesce((
    SELECT jsonb_object_agg(e.key, CASE
             WHEN e.key = 'payload' AND jsonb_typeof(e.value) = 'object' THEN coalesce((
               SELECT jsonb_object_agg(d.key, d.value) FROM jsonb_each(e.value) d
                WHERE d.key IN ('searchIntent', 'originalIntentLabel')), '{}'::jsonb)
             ELSE e.value END)
      FROM jsonb_each(p_ref) e
     WHERE e.key <> 'sourceKeywordSnapshot'
  ), '{}'::jsonb) ELSE p_ref END;
$function$;

CREATE FUNCTION public.arquiteto_serp_parecer_leve(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_payload) = 'object'
     AND jsonb_typeof(p_payload -> 'assessment') = 'object'
     AND jsonb_typeof(p_payload -> 'interpretation') = 'object' THEN
      jsonb_set(p_payload, '{assessment}',
        (p_payload -> 'assessment')
        || CASE WHEN (p_payload -> 'assessment') ? 'snapshots' THEN jsonb_build_object('snapshots',
             CASE WHEN jsonb_typeof(p_payload #> '{assessment,snapshots}') = 'array' THEN coalesce((
               SELECT jsonb_agg(public.arquiteto_serp_consulta_leve(s.valor) ORDER BY s.ordem)
                 FROM jsonb_array_elements(p_payload #> '{assessment,snapshots}') WITH ORDINALITY AS s(valor, ordem)), '[]'::jsonb)
             ELSE p_payload #> '{assessment,snapshots}' END) ELSE '{}'::jsonb END
        || CASE WHEN (p_payload -> 'assessment') ? 'keywordDnaReferences' THEN jsonb_build_object('keywordDnaReferences',
             CASE WHEN jsonb_typeof(p_payload #> '{assessment,keywordDnaReferences}') = 'array' THEN coalesce((
               SELECT jsonb_agg(public.arquiteto_serp_dna_ref_leve(r.valor) ORDER BY r.ordem)
                 FROM jsonb_array_elements(p_payload #> '{assessment,keywordDnaReferences}') WITH ORDINALITY AS r(valor, ordem)), '[]'::jsonb)
             ELSE p_payload #> '{assessment,keywordDnaReferences}' END) ELSE '{}'::jsonb END)
    ELSE p_payload
  END;
$function$;

COMMENT ON FUNCTION public.arquiteto_serp_parecer_leve(jsonb) IS
  'Listas leves (F6): a projeção do parecer de SERP da formação (a mesma de lib/arquiteto/article-serp-projection.ts). Sem interpretation, o payload volta inteiro.';

CREATE VIEW public.arquiteto_formation_serp_lista_leve WITH (security_invoker = true) AS
SELECT
  w.id, w.marca_id, w.subject_type, w.subject_id, w.article_id, w.stage, w.state,
  w.source_entity_id, w.lock_version, w.created_at, w.updated_at,
  public.arquiteto_serp_parecer_leve(w.payload) AS payload,
  (jsonb_typeof(w.payload -> 'assessment') = 'object' AND jsonb_typeof(w.payload -> 'interpretation') = 'object') AS projetado
FROM public.editorial_workflow_items w
WHERE w.subject_type = 'article_formation_serp_assessment' AND w.stage = 'architect';

COMMENT ON VIEW public.arquiteto_formation_serp_lista_leve IS
  'Listas leves (SDD 2026-10-13, F6): pareceres de SERP da formação em projeção (lista do Arquiteto). O parecer inteiro continua na tabela (escrita e exportação).';

-- 5. ArticleDNA vigente em projeção ----------------------------------------------
CREATE VIEW public.editorial_article_dna_lista_leve WITH (security_invoker = true) AS
WITH vigente AS (
  SELECT DISTINCT ON (v.marca_id, v.entity_id)
         v.marca_id, v.entity_id, v.version_id, v.version_number, v.status, v.content_hash, v.created_at, v.payload
    FROM public.editorial_artifact_versions v
   WHERE v.artifact_type = 'article_dna'
   ORDER BY v.marca_id, v.entity_id, v.version_number DESC
)
SELECT
  v.marca_id, v.entity_id, v.version_id, v.version_number, v.status AS version_status,
  v.content_hash, v.created_at,
  coalesce(v.payload ->> 'articleId', v.payload #>> '{payload,articleId}') AS article_id,
  v.payload ->> 'siloId'             AS silo_id,
  v.payload ->> 'suggestedSlug'      AS slug,
  v.payload #>> '{subject,phrase}'   AS assunto,
  v.payload ->> 'principalKeywordId' AS principal_keyword_id,
  v.payload ->> 'architectureStatus' AS architecture_status,
  v.payload ->> 'hierarchy'          AS hierarchy,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('keywordId', r.valor -> 'keywordId', 'role', r.valor -> 'role') ORDER BY r.ordem), '[]'::jsonb)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.payload -> 'keywordReferences') = 'array' THEN v.payload -> 'keywordReferences' ELSE '[]'::jsonb END)
          WITH ORDINALITY AS r(valor, ordem)) AS keyword_refs,
  (SELECT e.status FROM public.editorial_version_status_events e
    WHERE e.version_id = v.version_id ORDER BY e.occurred_at DESC LIMIT 1) AS status_atual,
  (SELECT a.version_id FROM public.editorial_artifact_versions a
     JOIN public.editorial_version_status_events e ON e.version_id = a.version_id AND e.status = 'approved'
    WHERE a.marca_id = v.marca_id AND a.entity_id = v.entity_id AND a.artifact_type = 'article_dna'
    ORDER BY a.version_number DESC LIMIT 1) AS ultima_aprovada_version_id
FROM vigente v;

COMMENT ON VIEW public.editorial_article_dna_lista_leve IS
  'Listas leves (SDD 2026-10-13, F6): a versão mais nova de cada ArticleDNA em projeção (colunas da lista), com o último evento e a última aprovada.';

-- 6. Acesso: igual às tabelas base ---------------------------------------------
REVOKE ALL ON public.minerador_keywords_lista_leve, public.arquiteto_formation_serp_lista_leve, public.editorial_article_dna_lista_leve FROM PUBLIC, anon;
GRANT SELECT ON public.minerador_keywords_lista_leve, public.arquiteto_formation_serp_lista_leve, public.editorial_article_dna_lista_leve TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.minerador_jsonb_por_formato(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.minerador_keyword_analise_leve(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arquiteto_serp_organico_leve(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arquiteto_serp_consulta_leve(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arquiteto_serp_dna_ref_leve(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arquiteto_serp_parecer_leve(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minerador_jsonb_por_formato(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.minerador_keyword_analise_leve(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arquiteto_serp_organico_leve(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arquiteto_serp_consulta_leve(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arquiteto_serp_dna_ref_leve(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arquiteto_serp_parecer_leve(jsonb) TO authenticated, service_role;

-- 7. Pós-checagem ----------------------------------------------------------------
DO $$
DECLARE
  v_vivas bigint;
  v_leves bigint;
  v_pareceres bigint;
  v_leves_serp bigint;
BEGIN
  -- Uma linha por keyword viva.
  SELECT count(*) INTO v_vivas FROM public.minerador_keywords WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_leves FROM public.minerador_keywords_lista_leve;
  IF v_vivas <> v_leves THEN
    RAISE EXCEPTION 'LEVE_POS: a view de keywords tem % linhas para % keywords vivas.', v_leves, v_vivas;
  END IF;
  -- A projeção só tira: nenhuma chave de topo que a linha inteira não tenha, e nenhum valor diferente
  -- nas chaves copiadas inteiras (as recortadas são conferidas pelo teste de paridade).
  IF EXISTS (
    SELECT 1 FROM public.minerador_keywords_lista_leve l
      JOIN public.minerador_keywords k ON k.id = l.id
     CROSS JOIN LATERAL jsonb_each(l.analise_leve) e
     WHERE NOT (coalesce(k.analise_semantica, '{}'::jsonb) ? e.key)
        OR (e.key IN ('keyword_subject', 'keyword_declared_principal', 'nicho_override', 'primary_keyword_policy')
            AND e.value IS DISTINCT FROM k.analise_semantica -> e.key)
  ) THEN
    RAISE EXCEPTION 'LEVE_POS: analise_leve trouxe chave ou valor que a linha inteira não tem.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.minerador_keywords_lista_leve WHERE dna_hash IS NULL OR length(dna_hash) <> 32) THEN
    RAISE EXCEPTION 'LEVE_POS: dna_hash ausente.';
  END IF;
  -- Um parecer por item; identidade, base e veredito intactos; o mesmo número de consultas.
  SELECT count(*) INTO v_pareceres FROM public.editorial_workflow_items
   WHERE subject_type = 'article_formation_serp_assessment' AND stage = 'architect';
  SELECT count(*) INTO v_leves_serp FROM public.arquiteto_formation_serp_lista_leve;
  IF v_pareceres <> v_leves_serp THEN
    RAISE EXCEPTION 'LEVE_POS: a view de pareceres tem % linhas para % pareceres.', v_leves_serp, v_pareceres;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.arquiteto_formation_serp_lista_leve l
      JOIN public.editorial_workflow_items w ON w.id = l.id
     WHERE l.payload -> 'candidateRef' IS DISTINCT FROM w.payload -> 'candidateRef'
        OR l.payload -> 'formationBaseHash' IS DISTINCT FROM w.payload -> 'formationBaseHash'
        OR l.payload -> 'verdict' IS DISTINCT FROM w.payload -> 'verdict'
        OR l.payload -> 'interpretation' IS DISTINCT FROM w.payload -> 'interpretation'
        OR l.payload -> 'humanResolution' IS DISTINCT FROM w.payload -> 'humanResolution'
        OR (jsonb_typeof(w.payload #> '{assessment,snapshots}') = 'array'
            AND jsonb_array_length(l.payload #> '{assessment,snapshots}') <> jsonb_array_length(w.payload #> '{assessment,snapshots}'))
        OR (NOT l.projetado AND l.payload IS DISTINCT FROM w.payload)
  ) THEN
    RAISE EXCEPTION 'LEVE_POS: a projeção do parecer mudou identidade, base, veredito, decisão humana ou o número de consultas.';
  END IF;
  -- Uma linha por ArticleDNA.
  IF (SELECT count(*) FROM public.editorial_article_dna_lista_leve)
     <> (SELECT count(DISTINCT (marca_id, entity_id)) FROM public.editorial_artifact_versions WHERE artifact_type = 'article_dna') THEN
    RAISE EXCEPTION 'LEVE_POS: a view de ArticleDNA não tem uma linha por artigo.';
  END IF;
  -- security_invoker nas três.
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('minerador_keywords_lista_leve', 'arquiteto_formation_serp_lista_leve', 'editorial_article_dna_lista_leve')
       AND coalesce(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%'
  ) THEN
    RAISE EXCEPTION 'LEVE_POS: view sem security_invoker.';
  END IF;
  -- anon não lê.
  IF has_table_privilege('anon', 'public.minerador_keywords_lista_leve', 'SELECT')
     OR has_table_privilege('anon', 'public.arquiteto_formation_serp_lista_leve', 'SELECT')
     OR has_table_privilege('anon', 'public.editorial_article_dna_lista_leve', 'SELECT') THEN
    RAISE EXCEPTION 'LEVE_POS: anon com SELECT numa view leve.';
  END IF;
END $$;

COMMIT;
