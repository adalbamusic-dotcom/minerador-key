-- 0036 preflight: somente leitura, antes da renomeacao das entidades centrais.
--
-- Esperado para esta janela: as duas tabelas legadas existem, as sucessoras
-- ainda nao existem e as contagens sao zero. Se houver linhas, interrompa a
-- aplicacao remota; nao copie, mova ou apague dados manualmente.
--
-- O fingerprint preservado exclui as relacoes-alvo e seus objetos internos,
-- mas inclui dependentes externos. Textos que podem mudar legitimamente com a
-- renomeacao sao normalizados para marcadores canonicos antes do hash.

WITH
target_tables AS (
  SELECT *
  FROM (VALUES
    ('public'::text, 'keywords_kgr'::text, 'minerador_keywords'::text),
    ('public'::text, 'listas_kgr'::text, 'minerador_keyword_lists'::text)
  ) AS v(schema_name, old_name, new_name)
),
target_meta AS (
  SELECT
    t.schema_name,
    t.old_name,
    t.new_name,
    t.schema_name || '.' || t.old_name AS old_qualified,
    t.schema_name || '.' || t.new_name AS new_qualified,
    c.oid,
    c.relowner,
    c.relkind,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relacl
  FROM target_tables t
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = t.schema_name
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = t.old_name
),
target_oids AS (
  SELECT oid FROM target_meta WHERE oid IS NOT NULL
),
target_index_oids AS (
  SELECT DISTINCT i.indexrelid AS oid
  FROM pg_catalog.pg_index i
  WHERE i.indrelid IN (SELECT oid FROM target_oids)
),
target_type_oids AS (
  SELECT t.oid
  FROM pg_catalog.pg_type t
  WHERE t.typrelid IN (SELECT oid FROM target_oids)
  UNION
  SELECT array_type.oid
  FROM pg_catalog.pg_type array_type
  WHERE array_type.typelem IN (
    SELECT row_type.oid
    FROM pg_catalog.pg_type row_type
    WHERE row_type.typrelid IN (SELECT oid FROM target_oids)
  )
),
target_sequence_oids AS (
  SELECT DISTINCT d.objid AS oid
  FROM pg_catalog.pg_depend d
  JOIN pg_catalog.pg_class c ON c.oid = d.objid
  WHERE d.classid = 'pg_class'::regclass
    AND d.refclassid = 'pg_class'::regclass
    AND d.refobjid IN (SELECT oid FROM target_oids)
    AND d.deptype = 'a'
    AND c.relkind = 'S'
),
target_constraint_oids AS (
  SELECT c.oid
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid IN (SELECT oid FROM target_oids)
     OR c.conindid IN (SELECT oid FROM target_index_oids)
),
target_policy_oids AS (
  SELECT p.oid
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid IN (SELECT oid FROM target_oids)
),
  target_trigger_oids AS (
    SELECT t.oid
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid IN (SELECT oid FROM target_oids)
  ),
  list_brand_fk_rows AS (
    SELECT
      c.oid,
      c.conname,
      c.confdeltype,
      c.conkey,
      c.confkey,
      (
        c.conname = 'fk_listas_kgr_marca_0005'
        AND c.confdeltype = 'r'
        AND c.conkey = ARRAY[(
          SELECT a.attnum
          FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = t.oid
            AND a.attname = 'marca_id'
            AND NOT a.attisdropped
        )]::smallint[]
        AND c.confkey = ARRAY[(
          SELECT a.attnum
          FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = 'public.marcas'::regclass
            AND a.attname = 'id'
            AND NOT a.attisdropped
        )]::smallint[]
      ) AS is_expected_restrict,
      (
        c.conname = 'listas_kgr_marca_id_fkey'
        AND c.confdeltype = 'c'
        AND c.conkey = ARRAY[(
          SELECT a.attnum
          FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = t.oid
            AND a.attname = 'marca_id'
            AND NOT a.attisdropped
        )]::smallint[]
        AND c.confkey = ARRAY[(
          SELECT a.attnum
          FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = 'public.marcas'::regclass
            AND a.attname = 'id'
            AND NOT a.attisdropped
        )]::smallint[]
      ) AS is_expected_cascade
    FROM target_meta t
    JOIN pg_catalog.pg_constraint c
      ON c.conrelid = t.oid
     AND c.confrelid = 'public.marcas'::regclass
     AND c.contype = 'f'
    WHERE t.old_name = 'listas_kgr'
  ),
  list_brand_fk_audit AS (
    SELECT
      'public.listas_kgr.marca_id -> public.marcas.id'::text AS object_name,
      count(r.oid)::bigint AS fk_count,
      count(r.oid) FILTER (WHERE r.confdeltype = 'r')::bigint AS restrict_count,
      count(r.oid) FILTER (WHERE r.confdeltype = 'c')::bigint AS cascade_count,
      count(r.oid) FILTER (WHERE r.is_expected_restrict)::bigint AS expected_restrict_count,
      count(r.oid) FILTER (WHERE r.is_expected_cascade)::bigint AS expected_cascade_count,
      count(r.oid) FILTER (WHERE NOT r.is_expected_restrict AND NOT r.is_expected_cascade)::bigint AS unexpected_count,
      coalesce(string_agg(r.conname || ':' || r.confdeltype::text, '|' ORDER BY r.conname), '<none>')::text AS constraint_summary
    FROM target_meta t
    LEFT JOIN list_brand_fk_rows r ON true
    WHERE t.old_name = 'listas_kgr'
    GROUP BY t.old_name
  ),
  briefings_list_fk_audit AS (
    SELECT
      'public.briefings_artigos.silo_id -> public.listas_kgr.id'::text AS object_name,
      count(c.oid)::bigint AS fk_count,
      count(c.oid) FILTER (WHERE c.confdeltype = 'a')::bigint AS no_action_count,
      count(c.oid) FILTER (WHERE c.confdeltype = 'c')::bigint AS cascade_count,
      coalesce(string_agg(c.conname || ':' || c.confdeltype::text, '|' ORDER BY c.conname), '<none>')::text AS constraint_summary
    FROM (SELECT to_regclass('public.briefings_artigos')::oid AS source_oid) s
    LEFT JOIN pg_catalog.pg_constraint c
      ON c.conrelid = s.source_oid
     AND c.confrelid = to_regclass('public.listas_kgr')::oid
     AND c.contype = 'f'
     AND c.conkey = ARRAY[(
       SELECT a.attnum
       FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = s.source_oid
         AND a.attname = 'silo_id'
         AND NOT a.attisdropped
     )]::smallint[]
     AND c.confkey = ARRAY[(
       SELECT a.attnum
       FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = to_regclass('public.listas_kgr')::oid
         AND a.attname = 'id'
         AND NOT a.attisdropped
     )]::smallint[]
    GROUP BY s.source_oid
  ),
  keyword_measurement_fk_audit AS (
    SELECT
      'public.minerador_keyword_metric_measurements.keyword_id -> public.keywords_kgr.id'::text AS object_name,
      count(c.oid)::bigint AS fk_count,
      count(c.oid) FILTER (WHERE c.confdeltype = 'c')::bigint AS cascade_count,
      count(c.oid) FILTER (WHERE c.confdeltype = 'r')::bigint AS restrict_count,
      coalesce(string_agg(c.conname || ':' || c.confdeltype::text, '|' ORDER BY c.conname), '<none>')::text AS constraint_summary
    FROM (SELECT to_regclass('public.minerador_keyword_metric_measurements')::oid AS source_oid) s
    LEFT JOIN pg_catalog.pg_constraint c
      ON c.conrelid = s.source_oid
     AND c.confrelid = to_regclass('public.keywords_kgr')::oid
     AND c.contype = 'f'
     AND c.conkey = ARRAY[(
       SELECT a.attnum
       FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = s.source_oid
         AND a.attname = 'keyword_id'
         AND NOT a.attisdropped
     )]::smallint[]
     AND c.confkey = ARRAY[(
       SELECT a.attnum
       FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = to_regclass('public.keywords_kgr')::oid
         AND a.attname = 'id'
         AND NOT a.attisdropped
     )]::smallint[]
    GROUP BY s.source_oid
  ),
  target_owned_relation_oids AS (
  SELECT oid FROM target_oids
  UNION
  SELECT oid FROM target_index_oids
  UNION
  SELECT oid FROM target_sequence_oids
),
row_counts AS (
  SELECT
    'public.keywords_kgr'::text AS object_name,
    count(*)::bigint AS row_count,
    md5(coalesce(string_agg(to_jsonb(k)::text, '|' ORDER BY k.id), ''))::text AS data_fingerprint
  FROM public.keywords_kgr k
  UNION ALL
  SELECT
    'public.listas_kgr'::text,
    count(*)::bigint,
    md5(coalesce(string_agg(to_jsonb(l)::text, '|' ORDER BY l.id), ''))::text
  FROM public.listas_kgr l
),
function_refs AS (
  SELECT
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature,
    p.prokind,
    p.prosrc
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND (p.prosrc ILIKE '%keywords_kgr%' OR p.prosrc ILIKE '%listas_kgr%')
),
view_refs AS (
  SELECT
    n.nspname || '.' || c.relname AS object_name,
    c.relkind,
    pg_get_viewdef(c.oid, true) AS view_definition
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v', 'm')
    AND (
      pg_get_viewdef(c.oid, true) ILIKE '%keywords_kgr%'
      OR pg_get_viewdef(c.oid, true) ILIKE '%listas_kgr%'
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_rewrite r
        JOIN pg_catalog.pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = r.oid
        WHERE r.ev_class = c.oid
          AND d.refclassid = 'pg_class'::regclass
          AND d.refobjid IN (SELECT oid FROM target_oids)
      )
    )
),
catalog_rows AS (
  SELECT
    'pg_class'::text AS row_kind,
    c.oid::text || '|' || c.relkind::text || '|' || c.relname || '|' || coalesce(c.relacl::text, '') AS row_value
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.oid NOT IN (SELECT oid FROM target_owned_relation_oids)
  UNION ALL
  SELECT
    'pg_type',
    t.oid::text || '|' || t.typtype::text || '|' || t.typname || '|' || t.typrelid::text || '|' || t.typbasetype::text
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.oid NOT IN (SELECT oid FROM target_type_oids)
  UNION ALL
  SELECT
    'pg_constraint',
    c.oid::text || '|' || c.conrelid::text || '|' || c.confrelid::text || '|' || c.conindid::text || '|' || c.contype::text || '|' || c.conkey::text || '|' || c.confkey::text || '|' || c.confdeltype::text || '|' || c.confupdtype::text || '|' || c.convalidated::text || '|' || replace(replace(replace(replace(coalesce(pg_get_constraintdef(c.oid, true), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid NOT IN (SELECT oid FROM target_oids)
    AND (c.conindid = 0 OR c.conindid NOT IN (SELECT oid FROM target_index_oids))
  UNION ALL
  SELECT
    'pg_index',
    i.indexrelid::text || '|' || i.indrelid::text || '|' || i.indisunique::text || '|' || i.indisprimary::text || '|' || i.indkey::text || '|' || replace(replace(replace(replace(coalesce(pg_get_indexdef(i.indexrelid), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM pg_catalog.pg_index i
  WHERE i.indrelid NOT IN (SELECT oid FROM target_oids)
  UNION ALL
  SELECT
    'pg_depend',
    d.classid::regclass::text || '|' || d.objid::text || '|' || d.objsubid::text || '|' || d.refclassid::regclass::text || '|' || d.refobjid::text || '|' || d.refobjsubid::text || '|' || d.deptype::text
  FROM pg_catalog.pg_depend d
  WHERE NOT (
    d.deptype IN ('a', 'i')
    AND d.refclassid = 'pg_class'::regclass
    AND d.refobjid IN (SELECT oid FROM target_oids)
  )
    AND NOT (d.classid = 'pg_class'::regclass AND d.objid IN (SELECT oid FROM target_owned_relation_oids))
    AND NOT (d.classid = 'pg_type'::regclass AND d.objid IN (SELECT oid FROM target_type_oids))
    AND NOT (d.classid = 'pg_constraint'::regclass AND d.objid IN (SELECT oid FROM target_constraint_oids))
    AND NOT (d.classid = 'pg_policy'::regclass AND d.objid IN (SELECT oid FROM target_policy_oids))
    AND NOT (d.classid = 'pg_trigger'::regclass AND d.objid IN (SELECT oid FROM target_trigger_oids))
  UNION ALL
  SELECT
    'pg_policy',
     p.oid::text || '|' || p.polrelid::text || '|' || p.polname || '|' || p.polcmd::text || '|' || p.polroles::text || '|' || replace(replace(replace(replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>') || '|' || replace(replace(replace(replace(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid NOT IN (SELECT oid FROM target_oids)
  UNION ALL
  SELECT
    'pg_trigger',
    t.oid::text || '|' || t.tgrelid::text || '|' || t.tgname || '|' || t.tgenabled::text || '|' || replace(replace(replace(replace(coalesce(pg_get_triggerdef(t.oid, true), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal
    AND t.tgrelid NOT IN (SELECT oid FROM target_oids)
  UNION ALL
  SELECT
    'pg_proc',
    p.oid::text || '|' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' || replace(replace(replace(replace(coalesce(pg_get_functiondef(p.oid), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  UNION ALL
  SELECT
    'view_definition',
    c.oid::text || '|' || n.nspname || '.' || c.relname || '|' || replace(replace(replace(replace(coalesce(pg_get_viewdef(c.oid, true), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v', 'm')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
catalog_fingerprint AS (
  SELECT
    count(*)::bigint AS row_count,
    md5(
      regexp_replace(
        regexp_replace(
          coalesce(string_agg(row_kind || ':' || row_value, '|' ORDER BY row_kind, row_value), ''),
          '(public[.])?(keywords_kgr|minerador_keywords)',
          '<KEYWORD_ENTITY>',
          'g'
        ),
        '(public[.])?(listas_kgr|minerador_keyword_lists)',
        '<LIST_ENTITY>',
        'g'
      )
    )::text AS fingerprint
  FROM catalog_rows
),
target_shape_rows AS (
  SELECT
    'relation'::text AS row_kind,
    t.old_name AS object_name,
    t.oid::text || '|' || t.relkind::text || '|' || t.relrowsecurity::text || '|' || t.relforcerowsecurity::text || '|' || coalesce(pg_get_userbyid(t.relowner), '') || '|' || coalesce(t.relacl::text, '') AS row_value
  FROM target_meta t
  WHERE t.oid IS NOT NULL
  UNION ALL
  SELECT
    'composite_type',
    CASE WHEN ty.typrelid = 0 THEN '<TARGET_TYPES>'::text ELSE tm.old_name END,
    ty.oid::text || '|' || ty.typtype::text || '|' || ty.typname || '|' || ty.typrelid::text || '|' || ty.typbasetype::text
  FROM target_type_oids target_type
  JOIN pg_catalog.pg_type ty ON ty.oid = target_type.oid
  LEFT JOIN target_meta tm ON tm.oid = ty.typrelid
  UNION ALL
  SELECT
    'sequence',
    '<TARGET_SEQUENCES>'::text,
    seq.oid::text || '|' || seq.relname || '|' || coalesce(pg_get_userbyid(seq.relowner), '') || '|' || coalesce(ps.seqstart::text, '') || '|' || coalesce(ps.seqincrement::text, '') || '|' || coalesce(ps.seqmin::text, '') || '|' || coalesce(ps.seqmax::text, '') || '|' || coalesce(ps.seqcache::text, '') || '|' || coalesce(ps.seqcycle::text, '')
  FROM target_sequence_oids target_sequence
  JOIN pg_catalog.pg_class seq ON seq.oid = target_sequence.oid
  LEFT JOIN pg_catalog.pg_sequence ps ON ps.seqrelid = seq.oid
  UNION ALL
  SELECT
    'column',
    t.old_name,
    a.attnum::text || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text || '|' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '')
  FROM target_meta t
  JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND NOT a.attisdropped AND a.attnum > 0
  LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE t.oid IS NOT NULL
  UNION ALL
  SELECT
    'constraint',
    t.old_name,
    c.oid::text || '|' || c.contype::text || '|' || c.conkey::text || '|' || c.confrelid::text || '|' || c.confkey::text || '|' || c.confdeltype::text || '|' || c.confupdtype::text || '|' || c.condeferrable::text || '|' || c.condeferred::text || '|' || c.convalidated::text || '|' || replace(replace(replace(replace(coalesce(pg_get_constraintdef(c.oid, true), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM target_meta t
  JOIN pg_catalog.pg_constraint c ON c.conrelid = t.oid
  UNION ALL
  SELECT
    'index',
    t.old_name,
    i.indexrelid::text || '|' || i.indisunique::text || '|' || i.indisprimary::text || '|' || i.indkey::text || '|' || replace(replace(replace(replace(coalesce(pg_get_indexdef(i.indexrelid), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM target_meta t
  JOIN pg_catalog.pg_index i ON i.indrelid = t.oid
  UNION ALL
  SELECT
    'policy',
    t.old_name,
     p.oid::text || '|' || p.polname || '|' || p.polcmd::text || '|' || p.polroles::text || '|' || replace(replace(replace(replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>') || '|' || replace(replace(replace(replace(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM target_meta t
  JOIN pg_catalog.pg_policy p ON p.polrelid = t.oid
  UNION ALL
  SELECT
    'trigger',
    t.old_name,
    tg.oid::text || '|' || tg.tgname || '|' || tg.tgenabled::text || '|' || replace(replace(replace(replace(coalesce(pg_get_triggerdef(tg.oid, true), ''), 'public.keywords_kgr', '<KEYWORD_ENTITY>'), 'keywords_kgr', '<KEYWORD_ENTITY>'), 'public.listas_kgr', '<LIST_ENTITY>'), 'listas_kgr', '<LIST_ENTITY>')
  FROM target_meta t
  JOIN pg_catalog.pg_trigger tg ON tg.tgrelid = t.oid
  WHERE NOT tg.tgisinternal
),
target_shape_fingerprint AS (
  SELECT
    count(*)::bigint AS row_count,
    md5(
      regexp_replace(
        regexp_replace(
          coalesce(string_agg(row_kind || ':' || object_name || ':' || row_value, '|' ORDER BY row_kind, object_name, row_value), ''),
          '(public[.])?(keywords_kgr|minerador_keywords)',
          '<KEYWORD_ENTITY>',
          'g'
        ),
        '(public[.])?(listas_kgr|minerador_keyword_lists)',
        '<LIST_ENTITY>',
        'g'
      )
    )::text AS fingerprint
  FROM target_shape_rows
),
  checks_base AS (
  SELECT
    'EXISTENCE'::text AS check_name,
    t.old_qualified::text AS object_name,
    ('old_present=' || (t.oid IS NOT NULL)::text || ';new_absent=' || (to_regclass(t.new_qualified) IS NULL)::text)::text AS observed,
    CASE WHEN t.oid IS NOT NULL AND to_regclass(t.new_qualified) IS NULL THEN 'PASS' ELSE 'NOT_READY' END::text AS verdict
  FROM target_meta t
  UNION ALL
  SELECT 'ROW_COUNT'::text, r.object_name, r.row_count::text, CASE WHEN r.row_count = 0 THEN 'PASS' ELSE 'STOP_REMOTE_APPLY' END::text FROM row_counts r
  UNION ALL
  SELECT 'OWNER'::text, t.old_qualified, coalesce(pg_get_userbyid(t.relowner), 'ABSENT')::text, CASE WHEN t.oid IS NOT NULL THEN 'INFO' ELSE 'NOT_READY' END::text FROM target_meta t
  UNION ALL
  SELECT 'COLUMNS'::text, t.old_qualified, coalesce((SELECT jsonb_agg(jsonb_build_object('attnum', a.attnum, 'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull, 'default', pg_get_expr(ad.adbin, ad.adrelid)) ORDER BY a.attnum)::text FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum WHERE a.attrelid = t.oid AND NOT a.attisdropped AND a.attnum > 0), '[]')::text, 'INFO'::text FROM target_meta t
  UNION ALL
  SELECT 'PK_CONSTRAINTS'::text, t.old_qualified, coalesce((SELECT jsonb_agg(jsonb_build_object('name', c.conname, 'type', c.contype, 'columns', c.conkey, 'references', CASE WHEN c.confrelid = 0 THEN NULL ELSE c.confrelid::regclass::text END, 'delete_action', c.confdeltype, 'update_action', c.confupdtype, 'validated', c.convalidated, 'definition', pg_get_constraintdef(c.oid, true)) ORDER BY c.oid)::text FROM pg_catalog.pg_constraint c WHERE c.conrelid = t.oid), '[]')::text, 'INFO'::text FROM target_meta t
  UNION ALL
  SELECT 'FK_OUTGOING'::text, t.old_qualified, coalesce((SELECT jsonb_agg(jsonb_build_object('name', c.conname, 'target', c.confrelid::regclass::text, 'delete_action', c.confdeltype, 'update_action', c.confupdtype, 'definition', pg_get_constraintdef(c.oid, true)) ORDER BY c.oid)::text FROM pg_catalog.pg_constraint c WHERE c.conrelid = t.oid AND c.contype = 'f'), '[]')::text, 'INFO'::text FROM target_meta t
  UNION ALL
  SELECT
    'FK_DELETE_ACTIONS'::text,
    t.old_qualified,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', c.conname, 'delete_action', c.confdeltype) ORDER BY c.oid)::text FROM pg_catalog.pg_constraint c WHERE c.conrelid = t.oid AND c.contype = 'f'), '[]')::text,
    CASE
      WHEN t.old_name = 'listas_kgr' THEN
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM list_brand_fk_rows r
            WHERE r.is_expected_cascade
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint c
            WHERE c.conrelid = t.oid
              AND c.contype = 'f'
              AND c.confdeltype <> 'r'
              AND NOT EXISTS (
                SELECT 1
                FROM list_brand_fk_rows r
                WHERE r.oid = c.oid
                  AND r.is_expected_cascade
              )
          ) THEN 'PASS'
          ELSE 'FAIL'
        END
      WHEN (SELECT count(*) FILTER (WHERE c.oid IS NOT NULL) FROM pg_catalog.pg_constraint c WHERE c.conrelid = t.oid AND c.contype = 'f') = (SELECT count(*) FILTER (WHERE c.confdeltype = 'r') FROM pg_catalog.pg_constraint c WHERE c.conrelid = t.oid AND c.contype = 'f') THEN 'PASS'
      ELSE 'FAIL'
    END::text
  FROM target_meta t
  UNION ALL
  SELECT 'EXPECTED_PRE_MIGRATION_PAIR'::text, a.object_name,
    ('prestate=LIST_BRAND_FK_PRESTATE;classification=' || CASE WHEN a.fk_count = 2 AND a.restrict_count = 1 AND a.cascade_count = 1 AND a.expected_restrict_count = 1 AND a.expected_cascade_count = 1 AND a.unexpected_count = 0 THEN 'EXPECTED_LEGACY_PRESTATE' ELSE 'INVALID_LEGACY_PRESTATE' END || ';fk_count=' || a.fk_count::text || ';restrict=' || a.restrict_count::text || ';cascade=' || a.cascade_count::text || ';expected_restrict=' || a.expected_restrict_count::text || ';expected_cascade=' || a.expected_cascade_count::text || ';unexpected=' || a.unexpected_count::text || ';constraints=' || a.constraint_summary)::text,
    CASE WHEN a.fk_count = 2 AND a.restrict_count = 1 AND a.cascade_count = 1 AND a.expected_restrict_count = 1 AND a.expected_cascade_count = 1 AND a.unexpected_count = 0 THEN 'PASS' ELSE 'FAIL' END::text
  FROM list_brand_fk_audit a
  UNION ALL
  SELECT 'BRIEFINGS_LIST_DEPENDENCY'::text, a.object_name, ('fk_count=' || a.fk_count::text || ';no_action=' || a.no_action_count::text || ';cascade=' || a.cascade_count::text || ';constraints=' || a.constraint_summary)::text, CASE WHEN a.fk_count = 1 AND a.no_action_count = 1 AND a.cascade_count = 0 THEN 'KEEP_FOR_COMPATIBILITY' ELSE 'FAIL' END::text FROM briefings_list_fk_audit a
  UNION ALL
  SELECT 'KEYWORD_MEASUREMENT_DELETE_ACTION'::text, a.object_name, ('fk_count=' || a.fk_count::text || ';cascade=' || a.cascade_count::text || ';restrict=' || a.restrict_count::text || ';constraints=' || a.constraint_summary)::text, CASE WHEN a.fk_count = 1 AND a.cascade_count = 1 AND a.restrict_count = 0 THEN 'INTENTIONAL_CASCADE' ELSE 'FAIL' END::text FROM keyword_measurement_fk_audit a
  UNION ALL
  SELECT 'FK_INCOMING'::text, t.old_qualified, coalesce((SELECT jsonb_agg(jsonb_build_object('name', c.conname, 'source', c.conrelid::regclass::text, 'delete_action', c.confdeltype, 'update_action', c.confupdtype, 'definition', pg_get_constraintdef(c.oid, true)) ORDER BY c.oid)::text FROM pg_catalog.pg_constraint c WHERE c.confrelid = t.oid AND c.conrelid <> t.oid AND c.contype = 'f'), '[]')::text, 'INFO'::text FROM target_meta t
  UNION ALL
  SELECT 'INDEXES'::text, t.old_qualified, coalesce((SELECT jsonb_agg(jsonb_build_object('name', c.relname, 'definition', pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid)::text FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = t.oid), '[]')::text, 'INFO'::text FROM target_meta t
  UNION ALL
  SELECT 'COMPOSITE_TYPES'::text, 'target_relations'::text, coalesce((SELECT jsonb_agg(jsonb_build_object('oid', ty.oid, 'name', ty.typname, 'type', ty.typtype, 'relation', CASE WHEN ty.typrelid = 0 THEN NULL ELSE ty.typrelid::regclass::text END, 'element_type', CASE WHEN ty.typelem = 0 THEN NULL ELSE ty.typelem::regtype::text END) ORDER BY ty.oid)::text FROM target_type_oids target_type JOIN pg_catalog.pg_type ty ON ty.oid = target_type.oid), '[]')::text, 'INFO'::text
  UNION ALL
  SELECT 'SEQUENCES'::text, 'target_relations'::text, coalesce((SELECT jsonb_agg(jsonb_build_object('oid', seq.oid, 'name', seq.relname, 'owner', pg_get_userbyid(seq.relowner), 'start', ps.seqstart, 'increment', ps.seqincrement, 'min', ps.seqmin, 'max', ps.seqmax, 'cache', ps.seqcache, 'cycle', ps.seqcycle) ORDER BY seq.oid)::text FROM target_sequence_oids target_sequence JOIN pg_catalog.pg_class seq ON seq.oid = target_sequence.oid LEFT JOIN pg_catalog.pg_sequence ps ON ps.seqrelid = seq.oid), '[]')::text, 'INFO'::text
  UNION ALL
  SELECT 'LIST_ID_OPTIONAL'::text, 'public.keywords_kgr'::text, coalesce((SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'lista_id'), 'ABSENT')::text, CASE WHEN (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'keywords_kgr' AND column_name = 'lista_id') = 'YES' THEN 'PASS' ELSE 'FAIL' END::text
  UNION ALL
  SELECT 'RLS'::text, t.old_qualified, ('enabled=' || coalesce(t.relrowsecurity::text, 'ABSENT') || ';forced=' || coalesce(t.relforcerowsecurity::text, 'ABSENT'))::text, CASE WHEN t.relrowsecurity THEN 'PASS' ELSE 'NOT_READY' END::text FROM target_meta t
  UNION ALL
  SELECT 'POLICIES'::text, t.old_qualified, coalesce((SELECT jsonb_agg(jsonb_build_object('name', p.policyname, 'command', p.cmd, 'roles', p.roles, 'using', p.qual, 'check', p.with_check) ORDER BY p.policyname)::text FROM pg_catalog.pg_policies p WHERE p.schemaname = t.schema_name AND p.tablename = t.old_name), '[]')::text, 'INFO'::text FROM target_meta t
  UNION ALL
  SELECT 'ACL'::text, t.old_qualified, ('relacl=' || coalesce(t.relacl::text, '<NULL>') || ';privileges=' || coalesce((SELECT string_agg(p.entry, ',' ORDER BY p.entry) FROM (SELECT DISTINCT tp.grantee || ':' || tp.privilege_type AS entry FROM information_schema.table_privileges tp WHERE tp.table_schema = t.schema_name AND tp.table_name = t.old_name) p), '<none>') || ';anon_select=' || CASE WHEN t.oid IS NULL THEN 'ABSENT' WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN has_table_privilege('anon', t.old_qualified, 'SELECT')::text ELSE 'ROLE_ABSENT' END || ';authenticated_select=' || CASE WHEN t.oid IS NULL THEN 'ABSENT' WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN has_table_privilege('authenticated', t.old_qualified, 'SELECT')::text ELSE 'ROLE_ABSENT' END || ';service_role_select=' || CASE WHEN t.oid IS NULL THEN 'ABSENT' WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN has_table_privilege('service_role', t.old_qualified, 'SELECT')::text ELSE 'ROLE_ABSENT' END)::text, 'INFO'::text FROM target_meta t
  UNION ALL
  SELECT 'ACL_UNEXPECTED_ROLES'::text, t.old_qualified, coalesce((SELECT string_agg(p.entry, ',' ORDER BY p.entry) FROM (SELECT DISTINCT tp.grantee AS entry FROM information_schema.table_privileges tp WHERE tp.table_schema = t.schema_name AND tp.table_name = t.old_name AND tp.grantee NOT IN ('PUBLIC', 'anon', 'authenticated', 'service_role')) p), '<none>')::text, 'INFO'::text FROM target_meta t
  UNION ALL
  SELECT 'TRIGGERS'::text, t.old_qualified, coalesce((SELECT jsonb_agg(jsonb_build_object('name', tg.tgname, 'definition', pg_get_triggerdef(tg.oid, true)) ORDER BY tg.oid)::text FROM pg_catalog.pg_trigger tg WHERE tg.tgrelid = t.oid AND NOT tg.tgisinternal), '[]')::text, 'INFO'::text FROM target_meta t
  UNION ALL
   SELECT 'FUNCTIONS_PROCEDURES_TEXTUAL'::text, 'database'::text, coalesce((SELECT string_agg(signature || ':' || prokind::text, '|' ORDER BY signature) FROM function_refs), '<none>')::text, CASE WHEN EXISTS (SELECT 1 FROM function_refs) THEN 'REWRITE_IN_MIGRATION' ELSE 'PASS' END::text
  UNION ALL
   SELECT 'VIEWS_MATERIALIZED_VIEWS'::text, 'database'::text, coalesce((SELECT string_agg(object_name || ':' || relkind::text, '|' ORDER BY object_name) FROM view_refs), '<none>')::text, CASE WHEN EXISTS (SELECT 1 FROM view_refs) THEN 'DEPENDENCY_AUDIT' ELSE 'PASS' END::text
  UNION ALL
   SELECT 'PG_DEPEND'::text, 'target_relations'::text, coalesce((SELECT string_agg(d.classid::regclass::text || ':' || d.objid::text || ':' || d.refclassid::regclass::text || ':' || d.refobjid::text || ':' || d.deptype::text, '|' ORDER BY d.classid::text, d.objid, d.refobjid) FROM pg_catalog.pg_depend d WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid IN (SELECT oid FROM target_oids)), '<none>')::text, 'INFO'::text
  UNION ALL
  SELECT 'TARGET_DATA_FINGERPRINT'::text, r.object_name, ('rows=' || r.row_count::text || ';fingerprint=' || r.data_fingerprint)::text, 'INFO'::text FROM row_counts r
  UNION ALL
  SELECT 'TARGET_SHAPE_FINGERPRINT'::text, 'target_relations'::text, ('catalog_rows=' || f.row_count::text || ';fingerprint=' || f.fingerprint)::text, 'CAPTURE_BEFORE_APPLY'::text FROM target_shape_fingerprint f
  UNION ALL
  SELECT 'PRESERVED_CATALOG_FINGERPRINT'::text, 'external_catalog'::text, ('catalog_rows=' || f.row_count::text || ';fingerprint=' || f.fingerprint)::text, 'CAPTURE_BEFORE_APPLY'::text FROM catalog_fingerprint f
  UNION ALL
  SELECT 'RENAME_STRATEGY'::text, '0036'::text, 'ALTER TABLE rename; data, RLS, grants, policies, triggers, FKs and dependent views preserved; direct function bodies rewritten only when legacy literals are present'::text, 'INFO'::text
),
checks AS (
  SELECT check_name, object_name, observed, verdict
  FROM checks_base
  UNION ALL
  SELECT 'PRECHECK_GATE'::text, '0036'::text, ('old_tables_present=' || bool_and(t.oid IS NOT NULL)::text || ';new_tables_absent=' || bool_and(to_regclass(t.new_qualified) IS NULL)::text || ';rows_zero=' || bool_and(r.row_count = 0)::text || ';rls_enabled=' || bool_and(t.relrowsecurity)::text || ';force_rls_disabled=' || bool_and(t.relforcerowsecurity IS FALSE)::text || ';structural_failures=' || (SELECT count(*) FROM checks_base WHERE verdict = 'FAIL')::text)::text, CASE WHEN bool_and(t.oid IS NOT NULL AND to_regclass(t.new_qualified) IS NULL AND r.row_count = 0 AND t.relrowsecurity AND t.relforcerowsecurity IS FALSE) AND NOT EXISTS (SELECT 1 FROM checks_base WHERE verdict = 'FAIL') THEN 'READY' ELSE 'NOT_READY' END::text
  FROM target_meta t
  JOIN row_counts r ON r.object_name = t.old_qualified
)
SELECT check_name, object_name, observed, verdict
FROM checks
ORDER BY check_name, object_name;
