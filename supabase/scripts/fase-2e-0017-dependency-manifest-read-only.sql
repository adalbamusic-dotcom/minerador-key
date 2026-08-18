-- FASE 2E / 0017. SOMENTE LEITURA.
-- Execute antes da aplicacao manual para conferir os seis objetos fisicos
-- removiveis. Nao retorna identidade, conteudo, URLs ou segredos.

WITH legacy_columns AS (
  SELECT * FROM (VALUES
    ('brand_memberships'::text, 'user_key'::text, 'user_key'::text),
    ('perfis'::text, 'marca_id'::text, 'perfis_marca_id'::text),
    ('agency_memberships'::text, 'canonical_role'::text, 'canonical_role'::text)
  ) AS value(table_name, column_name, contract_name)
), attributes AS (
  SELECT legacy.contract_name,
         relation.oid AS relation_oid,
         attribute.attnum
  FROM legacy_columns legacy
  JOIN pg_catalog.pg_class relation
    ON relation.relnamespace = 'public'::regnamespace
   AND relation.relname = legacy.table_name
  JOIN pg_catalog.pg_attribute attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attname = legacy.column_name
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
), dependencies AS (
  SELECT attributes.contract_name,
         CASE dependency.classid
           WHEN 'pg_catalog.pg_constraint'::regclass THEN 'CONSTRAINT'
           WHEN 'pg_catalog.pg_class'::regclass THEN 'INDEX'
           ELSE 'UNEXPECTED'
         END AS object_kind,
         CASE dependency.classid
           WHEN 'pg_catalog.pg_constraint'::regclass THEN constraint_row.conname
           WHEN 'pg_catalog.pg_class'::regclass THEN relation.relname
           ELSE dependency.classid::regclass::text
         END AS object_name,
         CASE
           WHEN dependency.classid IN ('pg_catalog.pg_constraint'::regclass, 'pg_catalog.pg_class'::regclass)
             THEN 'DROP_EXPLICITLY_BEFORE_COLUMN'
           ELSE 'BLOCKED'
         END AS action
  FROM attributes
  JOIN pg_catalog.pg_depend dependency
    ON dependency.refobjid = attributes.relation_oid
   AND dependency.refobjsubid = attributes.attnum
  LEFT JOIN pg_catalog.pg_constraint constraint_row
    ON dependency.classid = 'pg_catalog.pg_constraint'::regclass
   AND constraint_row.oid = dependency.objid
  LEFT JOIN pg_catalog.pg_class relation
    ON dependency.classid = 'pg_catalog.pg_class'::regclass
   AND relation.oid = dependency.objid
)
SELECT DISTINCT contract_name, object_kind, object_name, action
FROM dependencies
WHERE object_kind <> 'UNEXPECTED'
ORDER BY contract_name, object_kind, object_name;

WITH legacy_columns AS (
  SELECT * FROM (VALUES
    ('brand_memberships'::text, 'user_key'::text),
    ('perfis'::text, 'marca_id'::text),
    ('agency_memberships'::text, 'canonical_role'::text)
  ) AS value(table_name, column_name)
), attributes AS (
  SELECT relation.oid AS relation_oid, attribute.attnum
  FROM legacy_columns legacy
  JOIN pg_catalog.pg_class relation
    ON relation.relnamespace = 'public'::regnamespace
   AND relation.relname = legacy.table_name
  JOIN pg_catalog.pg_attribute attribute
    ON attribute.attrelid = relation.oid
   AND attribute.attname = legacy.column_name
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
), facts AS (
  SELECT
    count(*) FILTER (
      WHERE dependency.classid IN ('pg_catalog.pg_constraint'::regclass, 'pg_catalog.pg_class'::regclass)
    ) AS expected_drop_dependencies,
    count(*) FILTER (
      WHERE dependency.classid NOT IN (
        'pg_catalog.pg_constraint'::regclass,
        'pg_catalog.pg_class'::regclass,
        'pg_catalog.pg_attrdef'::regclass,
        'pg_catalog.pg_description'::regclass
      )
    ) AS blocking_dependencies
  FROM attributes
  JOIN pg_catalog.pg_depend dependency
    ON dependency.refobjid = attributes.relation_oid
   AND dependency.refobjsubid = attributes.attnum
)
SELECT expected_drop_dependencies,
       blocking_dependencies,
       CASE
         WHEN expected_drop_dependencies = 6 AND blocking_dependencies = 0 THEN 'READY_FOR_0017_REVIEW'
         ELSE 'BLOCKED'
       END AS dependency_manifest_status
FROM facts;
