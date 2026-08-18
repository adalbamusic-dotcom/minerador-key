-- FASE 2E. PREPARACAO LOCAL. NAO EXECUTAR SEM SNAPSHOT NOVO E REVISAO HUMANA.
-- Remove somente contratos fisicos que ja nao possuem consumidores de runtime:
-- public.brand_memberships.user_key, public.perfis.marca_id e
-- public.agency_memberships.canonical_role.
--
-- Esta migration nao usa CASCADE, nao altera dados canonicos, owners,
-- memberships, RLS, grants, funcoes ou modulos editoriais.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  contract record;
  source_relation oid;
  source_attribute smallint;
  expected_dependency_count integer;
  constraint_dependency record;
  index_dependency record;
BEGIN
  IF to_regclass('public.brand_memberships') IS NULL
    OR to_regclass('public.perfis') IS NULL
    OR to_regclass('public.agency_memberships') IS NULL
    OR to_regclass('public.marcas') IS NULL
    OR to_regclass('public.agencies') IS NULL THEN
    RAISE EXCEPTION 'PHASE_2E_0017_PRECONDITION: relacoes canonicas ausentes';
  END IF;

  FOR contract IN
    SELECT * FROM (VALUES
      ('brand_memberships'::text, 'user_key'::text),
      ('perfis'::text, 'marca_id'::text),
      ('agency_memberships'::text, 'canonical_role'::text)
    ) AS expected(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns column_info
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = contract.table_name
        AND column_info.column_name = contract.column_name
    ) THEN
      RAISE EXCEPTION 'PHASE_2E_0017_PRECONDITION: coluna legada %.% nao esta no estado esperado',
        contract.table_name, contract.column_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brand_memberships' AND column_name = 'member_user_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'role'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marcas' AND column_name = 'owner_user_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'owner_user_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'role'
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_PRECONDITION: contrato canonico incompleto';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.brand_memberships membership
    WHERE membership.member_user_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = membership.member_user_id)
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: membership de marca sem UUID canonico valido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.marcas brand
    WHERE brand.owner_user_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = brand.owner_user_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.agencies agency
    WHERE agency.owner_user_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM auth.users auth_user WHERE auth_user.id = agency.owner_user_id)
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: owner canonico ausente ou invalido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agency_memberships membership
    WHERE membership.role IS NULL
       OR membership.role NOT IN ('agency_admin', 'agency_member')
       OR membership.canonical_role IS NULL
       OR membership.canonical_role IS DISTINCT FROM membership.role
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: role final de agencia diverge do contrato canonico';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND (
        pg_get_functiondef(procedure.oid) ~* '\muser_key\M'
        OR pg_get_functiondef(procedure.oid) ~* '\mcanonical_role\M'
        OR pg_get_functiondef(procedure.oid) ILIKE '%perfis.marca_id%'
      )
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: funcao ativa ainda depende de contrato legado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND (
        coalesce(policy.qual, '') ~* '\muser_key\M'
        OR coalesce(policy.with_check, '') ~* '\muser_key\M'
        OR coalesce(policy.qual, '') ~* '\mcanonical_role\M'
        OR coalesce(policy.with_check, '') ~* '\mcanonical_role\M'
        OR (
          policy.tablename = 'perfis'
          AND (
            coalesce(policy.qual, '') ~* '\mmarca_id\M'
            OR coalesce(policy.with_check, '') ~* '\mmarca_id\M'
          )
        )
        OR coalesce(policy.qual, '') ILIKE '%perfis.marca_id%'
        OR coalesce(policy.with_check, '') ILIKE '%perfis.marca_id%'
      )
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: policy ativa ainda depende de contrato legado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger trigger
    WHERE NOT trigger.tgisinternal
      AND (
        pg_get_triggerdef(trigger.oid) ~* '\muser_key\M'
        OR pg_get_triggerdef(trigger.oid) ~* '\mcanonical_role\M'
        OR pg_get_triggerdef(trigger.oid) ILIKE '%perfis.marca_id%'
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_rewrite rewrite
    JOIN pg_catalog.pg_class view_relation ON view_relation.oid = rewrite.ev_class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = view_relation.relnamespace
    WHERE rewrite.rulename = '_RETURN'
      AND namespace.nspname = 'public'
      AND view_relation.relkind IN ('v', 'm')
      AND (
        pg_get_viewdef(view_relation.oid, true) ~* '\muser_key\M'
        OR pg_get_viewdef(view_relation.oid, true) ~* '\mcanonical_role\M'
        OR pg_get_viewdef(view_relation.oid, true) ILIKE '%perfis.marca_id%'
      )
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: trigger ou view ativa ainda depende de contrato legado';
  END IF;

  SELECT count(*)
  INTO expected_dependency_count
  FROM (
    SELECT source.table_name, source.column_name, relation.oid AS relation_oid, attribute.attnum
    FROM (VALUES
      ('brand_memberships'::text, 'user_key'::text),
      ('perfis'::text, 'marca_id'::text),
      ('agency_memberships'::text, 'canonical_role'::text)
    ) AS source(table_name, column_name)
    JOIN pg_catalog.pg_class relation
      ON relation.relnamespace = 'public'::regnamespace
     AND relation.relname = source.table_name
    JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = source.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
  ) source_column
  JOIN pg_catalog.pg_depend dependency
    ON dependency.refobjid = source_column.relation_oid
   AND dependency.refobjsubid = source_column.attnum
  WHERE dependency.classid IN ('pg_catalog.pg_constraint'::regclass, 'pg_catalog.pg_class'::regclass);

  IF expected_dependency_count <> 6 THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: dependencias fisicas esperadas divergiram do preflight (% em vez de 6)',
      expected_dependency_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT relation.oid AS relation_oid, attribute.attnum
      FROM (VALUES
        ('brand_memberships'::text, 'user_key'::text),
        ('perfis'::text, 'marca_id'::text),
        ('agency_memberships'::text, 'canonical_role'::text)
      ) AS source(table_name, column_name)
      JOIN pg_catalog.pg_class relation
        ON relation.relnamespace = 'public'::regnamespace
       AND relation.relname = source.table_name
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attname = source.column_name
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
    ) source_column
    JOIN pg_catalog.pg_depend dependency
      ON dependency.refobjid = source_column.relation_oid
     AND dependency.refobjsubid = source_column.attnum
    WHERE dependency.classid NOT IN (
      'pg_catalog.pg_constraint'::regclass,
      'pg_catalog.pg_class'::regclass,
      'pg_catalog.pg_attrdef'::regclass,
      'pg_catalog.pg_description'::regclass
    )
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: dependencia bloqueadora fora do manifest fisico';
  END IF;

  -- Primeiro remove constraints locais que dependem da coluna. Indices
  -- pertencentes a essas constraints desaparecem junto com a constraint.
  FOR contract IN
    SELECT * FROM (VALUES
      ('brand_memberships'::text, 'user_key'::text),
      ('perfis'::text, 'marca_id'::text),
      ('agency_memberships'::text, 'canonical_role'::text)
    ) AS expected(table_name, column_name)
  LOOP
    SELECT relation.oid, attribute.attnum
    INTO source_relation, source_attribute
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = contract.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    WHERE relation.relnamespace = 'public'::regnamespace
      AND relation.relname = contract.table_name;

    FOR constraint_dependency IN
      SELECT DISTINCT constraint_row.conrelid,
             namespace.nspname AS schema_name,
             relation.relname AS table_name,
             constraint_row.conname
      FROM pg_catalog.pg_depend dependency
      JOIN pg_catalog.pg_constraint constraint_row ON constraint_row.oid = dependency.objid
      JOIN pg_catalog.pg_class relation ON relation.oid = constraint_row.conrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE dependency.classid = 'pg_catalog.pg_constraint'::regclass
        AND dependency.refobjid = source_relation
        AND dependency.refobjsubid = source_attribute
    LOOP
      IF constraint_dependency.conrelid <> source_relation THEN
        RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: constraint dependente fora da tabela de origem';
      END IF;
      RAISE NOTICE 'PHASE_2E_0017_DROP_EXPECTED_CONSTRAINT: %.%.%',
        constraint_dependency.schema_name, constraint_dependency.table_name, constraint_dependency.conname;
      EXECUTE format(
        'ALTER TABLE %I.%I DROP CONSTRAINT %I',
        constraint_dependency.schema_name,
        constraint_dependency.table_name,
        constraint_dependency.conname
      );
    END LOOP;
  END LOOP;

  -- Depois remove somente indices locais restantes presos diretamente a cada
  -- coluna. Um indice de outra tabela, de uma constraint ou de outro tipo aborta.
  FOR contract IN
    SELECT * FROM (VALUES
      ('brand_memberships'::text, 'user_key'::text),
      ('perfis'::text, 'marca_id'::text),
      ('agency_memberships'::text, 'canonical_role'::text)
    ) AS expected(table_name, column_name)
  LOOP
    SELECT relation.oid, attribute.attnum
    INTO source_relation, source_attribute
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = contract.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    WHERE relation.relnamespace = 'public'::regnamespace
      AND relation.relname = contract.table_name;

    FOR index_dependency IN
      SELECT DISTINCT index_relation.oid,
             index_relation.relkind,
             index_row.indrelid,
             namespace.nspname AS schema_name,
             index_relation.relname AS index_name
      FROM pg_catalog.pg_depend dependency
      JOIN pg_catalog.pg_class index_relation ON index_relation.oid = dependency.objid
      JOIN pg_catalog.pg_index index_row ON index_row.indexrelid = index_relation.oid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = index_relation.relnamespace
      WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
        AND dependency.refobjid = source_relation
        AND dependency.refobjsubid = source_attribute
    LOOP
      IF index_dependency.relkind <> 'i'
        OR index_dependency.indrelid <> source_relation
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_constraint constraint_row
          WHERE constraint_row.conindid = index_dependency.oid
        ) THEN
        RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: indice dependente nao pertence ao manifest removivel';
      END IF;
      RAISE NOTICE 'PHASE_2E_0017_DROP_EXPECTED_INDEX: %.%',
        index_dependency.schema_name, index_dependency.index_name;
      EXECUTE format('DROP INDEX %I.%I', index_dependency.schema_name, index_dependency.index_name);
    END LOOP;
  END LOOP;

  ALTER TABLE public.brand_memberships DROP COLUMN user_key;
  ALTER TABLE public.perfis DROP COLUMN marca_id;
  ALTER TABLE public.agency_memberships DROP COLUMN canonical_role;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'brand_memberships' AND column_name = 'user_key')
        OR (table_name = 'perfis' AND column_name = 'marca_id')
        OR (table_name = 'agency_memberships' AND column_name = 'canonical_role')
      )
  ) THEN
    RAISE EXCEPTION 'PHASE_2E_0017_CONFLICT: coluna legada permaneceu apos o corte';
  END IF;

  PERFORM public.canonical_is_platform_admin();
  PERFORM public.canonical_can_access_brand(NULL);
  PERFORM public.canonical_can_manage_brand(NULL);
  PERFORM public.canonical_can_access_agency(NULL);
  PERFORM public.canonical_can_manage_agency(NULL);
  PERFORM public.editorial_current_actor_id();
  PERFORM public.editorial_has_permission(NULL, 'marca', 'view');
END $$;

COMMIT;
