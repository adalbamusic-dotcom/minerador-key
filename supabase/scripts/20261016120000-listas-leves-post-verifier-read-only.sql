-- =============================================================================
-- CONFERÊNCIA (SÓ LEITURA) de 20261016120000_listas_leves.sql (M-L) — F6 das listas leves
-- SDD: docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md, §18.6
--
--   npx supabase db query --linked -f supabase/scripts/20261016120000-listas-leves-post-verifier-read-only.sql
--
-- Bytes de fio por `length(x::text)` (regra R2 da SDD egress), por marca: o que a
-- tela lia antes (tabela/listagem) e o que lê pela view. Nada é gravado.
--
-- Tempo no banco (opcional, também só leitura), um de cada vez:
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.minerador_keywords_lista_leve WHERE brand_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3';
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.arquiteto_formation_serp_lista_leve WHERE marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3';
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.editorial_article_dna_lista_leve WHERE marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3';
-- (o §8.4 da SDD pede preferir coluna gerada se alguma passar de 2 s).
-- =============================================================================
SELECT json_agg(x ORDER BY x.marca) AS conferencia FROM (
  SELECT m.nome AS marca,
    (SELECT count(*) FROM public.minerador_keywords k WHERE k.brand_id = m.id AND k.deleted_at IS NULL) AS keywords_vivas,
    (SELECT sum(length(t::text)) FROM public.minerador_keywords_listagem t WHERE t.brand_id = m.id AND t.deleted_at IS NULL) AS keywords_listagem_antes_bytes,
    (SELECT sum(length(t::text)) FROM public.minerador_keywords t WHERE t.brand_id = m.id AND t.deleted_at IS NULL) AS keywords_tabela_bytes,
    (SELECT count(*) FROM public.minerador_keywords_lista_leve t WHERE t.brand_id = m.id) AS keywords_view_linhas,
    (SELECT sum(length(t::text)) FROM public.minerador_keywords_lista_leve t WHERE t.brand_id = m.id) AS keywords_view_bytes,
    (SELECT count(*) FROM public.editorial_workflow_items w WHERE w.marca_id = m.id AND w.subject_type = 'article_formation_serp_assessment' AND w.stage = 'architect') AS pareceres,
    (SELECT sum(length(w.payload::text)) FROM public.editorial_workflow_items w WHERE w.marca_id = m.id AND w.subject_type = 'article_formation_serp_assessment' AND w.stage = 'architect') AS pareceres_antes_bytes,
    (SELECT sum(length(l.payload::text)) FROM public.arquiteto_formation_serp_lista_leve l WHERE l.marca_id = m.id) AS pareceres_view_bytes,
    (SELECT count(*) FILTER (WHERE NOT l.projetado) FROM public.arquiteto_formation_serp_lista_leve l WHERE l.marca_id = m.id) AS pareceres_legados_inteiros,
    (SELECT count(*) FROM public.editorial_artifact_versions v WHERE v.marca_id = m.id AND v.artifact_type = 'article_dna') AS article_dna_versoes,
    (SELECT sum(length(v.payload::text)) FROM public.editorial_artifact_versions v WHERE v.marca_id = m.id AND v.artifact_type = 'article_dna') AS article_dna_todas_bytes,
    (SELECT count(*) FROM public.editorial_article_dna_lista_leve a WHERE a.marca_id = m.id) AS article_dna_view_linhas,
    (SELECT sum(length(a::text)) FROM public.editorial_article_dna_lista_leve a WHERE a.marca_id = m.id) AS article_dna_view_bytes
  FROM public.marcas m
) x;
