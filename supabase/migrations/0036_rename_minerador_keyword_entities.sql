-- 0036: correção semântica das entidades centrais do Minerador.
--
-- Aplicar somente depois do preflight read-only 0036 e durante uma janela de
-- manutenção. A operação renomeia as relações existentes; não copia, apaga
-- nem reconstrói dados. A migration 0005/0006 permanece imutável.

BEGIN;

SET LOCAL lock_timeout = '10s';

LOCK TABLE
  public.keywords_kgr,
  public.listas_kgr
IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  keyword_rows bigint;
  list_rows bigint;
  keyword_rls boolean;
  keyword_force_rls boolean;
  list_rls boolean;
  list_force_rls boolean;
BEGIN
  IF to_regclass('public.keywords_kgr') IS NULL
    OR to_regclass('public.listas_kgr') IS NULL THEN
    RAISE EXCEPTION 'MINERADOR_0036_PRECONDITION: entidades legadas ausentes';
  END IF;

  IF to_regclass('public.minerador_keywords') IS NOT NULL
    OR to_regclass('public.minerador_keyword_lists') IS NOT NULL THEN
    RAISE EXCEPTION 'MINERADOR_0036_PRECONDITION: entidade sucessora ja existe';
  END IF;

  SELECT count(*) INTO keyword_rows FROM public.keywords_kgr;
  SELECT count(*) INTO list_rows FROM public.listas_kgr;
  IF keyword_rows <> 0 OR list_rows <> 0 THEN
    RAISE EXCEPTION 'MINERADOR_0036_PRECONDITION: preflight encontrou dados; interrompa a aplicacao e revise manualmente (keywords=%, listas=%)', keyword_rows, list_rows;
  END IF;

  SELECT relrowsecurity, relforcerowsecurity
    INTO keyword_rls, keyword_force_rls
  FROM pg_catalog.pg_class
  WHERE oid = 'public.keywords_kgr'::regclass;

  SELECT relrowsecurity, relforcerowsecurity
    INTO list_rls, list_force_rls
  FROM pg_catalog.pg_class
  WHERE oid = 'public.listas_kgr'::regclass;

  IF NOT keyword_rls OR NOT list_rls THEN
    RAISE EXCEPTION 'MINERADOR_0036_PRECONDITION: RLS desabilitada em uma entidade do Minerador';
  END IF;

  IF keyword_force_rls IS DISTINCT FROM false
    OR list_force_rls IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'MINERADOR_0036_PRECONDITION: estado FORCE RLS inesperado';
  END IF;
END $$;

DO $$
DECLARE
  brand_fk_count integer;
  cascade_fk_count integer;
  restrict_fk_count integer;
BEGIN
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE c.confdeltype = 'c')::integer,
    count(*) FILTER (WHERE c.confdeltype = 'r')::integer
  INTO brand_fk_count, cascade_fk_count, restrict_fk_count
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.listas_kgr'::regclass
    AND c.confrelid = 'public.marcas'::regclass
    AND c.contype = 'f'
    AND c.conkey = ARRAY[(
      SELECT a.attnum
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.listas_kgr'::regclass
        AND a.attname = 'marca_id'
        AND NOT a.attisdropped
    )]::smallint[]
    AND c.confkey = ARRAY[(
      SELECT a.attnum
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.marcas'::regclass
        AND a.attname = 'id'
        AND NOT a.attisdropped
    )]::smallint[];

  IF brand_fk_count <> 2
    OR cascade_fk_count <> 1
    OR restrict_fk_count <> 1
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'public.listas_kgr'::regclass
        AND c.conname = 'listas_kgr_marca_id_fkey'
        AND c.confrelid = 'public.marcas'::regclass
        AND c.contype = 'f'
        AND c.confdeltype = 'c'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'public.listas_kgr'::regclass
        AND c.conname = 'fk_listas_kgr_marca_0005'
        AND c.confrelid = 'public.marcas'::regclass
        AND c.contype = 'f'
        AND c.confdeltype = 'r'
    ) THEN
    RAISE EXCEPTION 'MINERADOR_0036_PRECONDITION: estado das FKs de listas para marcas nao corresponde ao par historico/restritivo esperado';
  END IF;
END $$;

ALTER TABLE public.listas_kgr
  DROP CONSTRAINT listas_kgr_marca_id_fkey;

ALTER TABLE public.keywords_kgr RENAME TO minerador_keywords;
ALTER TABLE public.listas_kgr RENAME TO minerador_keyword_lists;

-- Renomeia somente nomes físicos diretamente pertencentes às duas relações.
-- O teste pelo catálogo evita tocar em um objeto externo ou em um conceito
-- real de KGR que não seja parte do nome legado da entidade.
DO $$
DECLARE
  item record;
  replacement_name text;
BEGIN
  FOR item IN
    SELECT c.oid, c.relname AS old_name,
           CASE
             WHEN c.relname LIKE '%keywords_kgr%' THEN replace(c.relname, 'keywords_kgr', 'minerador_keywords')
             WHEN c.relname LIKE '%listas_kgr%' THEN replace(c.relname, 'listas_kgr', 'minerador_keyword_lists')
           END AS new_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
    WHERE n.nspname = 'public'
      AND i.indrelid IN ('public.minerador_keywords'::regclass, 'public.minerador_keyword_lists'::regclass)
      AND (c.relname LIKE '%keywords_kgr%' OR c.relname LIKE '%listas_kgr%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = replacement_name
        AND c.oid <> item.oid
    ) THEN
      RAISE EXCEPTION 'MINERADOR_0036_CONFLICT: indice sucessor ja existe: %', replacement_name;
    END IF;
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I', item.old_name, replacement_name);
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  replacement_name text;
BEGIN
  FOR item IN
    SELECT c.oid, c.conrelid, rel.relname AS relation_name, c.conname AS old_name,
           CASE
             WHEN c.conname LIKE '%keywords_kgr%' THEN replace(c.conname, 'keywords_kgr', 'minerador_keywords')
             WHEN c.conname LIKE '%listas_kgr%' THEN replace(c.conname, 'listas_kgr', 'minerador_keyword_lists')
           END AS new_name
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.oid IN ('public.minerador_keywords'::regclass, 'public.minerador_keyword_lists'::regclass)
      AND (c.conname LIKE '%keywords_kgr%' OR c.conname LIKE '%listas_kgr%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = item.conrelid
        AND c.conname = replacement_name
        AND c.oid <> item.oid
    ) THEN
      RAISE EXCEPTION 'MINERADOR_0036_CONFLICT: constraint sucessora ja existe: %', replacement_name;
    END IF;
    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', item.relation_name, item.old_name, replacement_name);
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  replacement_name text;
BEGIN
  FOR item IN
    SELECT t.oid, t.relname AS relation_name, tg.tgname AS old_name,
           CASE
             WHEN tg.tgname LIKE '%keywords_kgr%' THEN replace(tg.tgname, 'keywords_kgr', 'minerador_keywords')
             WHEN tg.tgname LIKE '%listas_kgr%' THEN replace(tg.tgname, 'listas_kgr', 'minerador_keyword_lists')
           END AS new_name
    FROM pg_catalog.pg_trigger tg
    JOIN pg_catalog.pg_class t ON t.oid = tg.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE NOT tg.tgisinternal
      AND n.nspname = 'public'
      AND t.oid IN ('public.minerador_keywords'::regclass, 'public.minerador_keyword_lists'::regclass)
      AND (tg.tgname LIKE '%keywords_kgr%' OR tg.tgname LIKE '%listas_kgr%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TRIGGER %I ON public.%I RENAME TO %I', item.old_name, item.relation_name, replacement_name);
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  replacement_name text;
BEGIN
  FOR item IN
    SELECT p.policyname AS old_name, p.tablename AS relation_name,
           CASE
             WHEN p.policyname LIKE '%keywords_kgr%' THEN replace(p.policyname, 'keywords_kgr', 'minerador_keywords')
             WHEN p.policyname LIKE '%listas_kgr%' THEN replace(p.policyname, 'listas_kgr', 'minerador_keyword_lists')
           END AS new_name
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('minerador_keywords', 'minerador_keyword_lists')
      AND (p.policyname LIKE '%keywords_kgr%' OR p.policyname LIKE '%listas_kgr%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER POLICY %I ON public.%I RENAME TO %I', item.old_name, item.relation_name, replacement_name);
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  replacement_name text;
BEGIN
  FOR item IN
    SELECT seq.oid, seq.relname AS old_name,
           CASE
             WHEN seq.relname LIKE '%keywords_kgr%' THEN replace(seq.relname, 'keywords_kgr', 'minerador_keywords')
             WHEN seq.relname LIKE '%listas_kgr%' THEN replace(seq.relname, 'listas_kgr', 'minerador_keyword_lists')
           END AS new_name
    FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_class seq ON seq.oid = d.objid
    JOIN pg_catalog.pg_namespace n ON n.oid = seq.relnamespace
    WHERE d.classid = 'pg_class'::regclass
      AND d.refclassid = 'pg_class'::regclass
      AND d.refobjid IN ('public.minerador_keywords'::regclass, 'public.minerador_keyword_lists'::regclass)
      AND d.deptype = 'a'
      AND seq.relkind = 'S'
      AND n.nspname = 'public'
      AND (seq.relname LIKE '%keywords_kgr%' OR seq.relname LIKE '%listas_kgr%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER SEQUENCE public.%I RENAME TO %I', item.old_name, replacement_name);
  END LOOP;
END $$;

-- PL/pgSQL guarda o corpo como texto. Renomear a relação não reescreve esse
-- texto; atualizamos apenas o corpo das funções/procedures que ainda possuem
-- o nome legado, mantendo assinatura, segurança, search_path e dependências.
DO $$
DECLARE
  item record;
  definition text;
  body text;
  open_pos integer;
  tag_end_relative integer;
  tag text;
  body_start integer;
  body_end integer;
BEGIN
  FOR item IN
    SELECT p.oid
    FROM pg_catalog.pg_proc p
    WHERE p.prokind IN ('f', 'p')
      AND (p.prosrc ILIKE '%keywords_kgr%' OR p.prosrc ILIKE '%listas_kgr%')
  LOOP
    definition := pg_get_functiondef(item.oid);
    open_pos := strpos(definition, 'AS $');
    IF open_pos = 0 THEN
      RAISE EXCEPTION 'MINERADOR_0036_CONFLICT: corpo de funcao sem marcador AS $ para oid %', item.oid;
    END IF;
    open_pos := open_pos + 3;
    tag_end_relative := strpos(substring(definition FROM open_pos + 1), '$');
    IF tag_end_relative = 0 THEN
      RAISE EXCEPTION 'MINERADOR_0036_CONFLICT: delimitador de corpo ausente para oid %', item.oid;
    END IF;
    tag := substring(definition FROM open_pos FOR tag_end_relative + 1);
    body_start := open_pos + length(tag);
    body_end := strpos(substring(definition FROM body_start), tag);
    IF body_end = 0 THEN
      RAISE EXCEPTION 'MINERADOR_0036_CONFLICT: fechamento de corpo ausente para oid %', item.oid;
    END IF;
    body := substring(definition FROM body_start FOR body_end - 1);
    body := replace(body, 'public.keywords_kgr', 'public.minerador_keywords');
    body := replace(body, 'keywords_kgr', 'minerador_keywords');
    body := replace(body, 'public.listas_kgr', 'public.minerador_keyword_lists');
    body := replace(body, 'listas_kgr', 'minerador_keyword_lists');
    definition := left(definition, body_start - 1)
      || body
      || substring(definition FROM body_start + body_end - 1);
    EXECUTE definition;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    WHERE p.prokind IN ('f', 'p')
      AND (p.prosrc ILIKE '%keywords_kgr%' OR p.prosrc ILIKE '%listas_kgr%')
  ) THEN
    RAISE EXCEPTION 'MINERADOR_0036_CONFLICT: funcao/procedure ainda contem nome legado';
  END IF;
END $$;

DO $$
DECLARE
  keyword_rls boolean;
  keyword_force_rls boolean;
  list_rls boolean;
  list_force_rls boolean;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity
    INTO keyword_rls, keyword_force_rls
  FROM pg_catalog.pg_class
  WHERE oid = 'public.minerador_keywords'::regclass;
  SELECT relrowsecurity, relforcerowsecurity
    INTO list_rls, list_force_rls
  FROM pg_catalog.pg_class
  WHERE oid = 'public.minerador_keyword_lists'::regclass;
  IF NOT keyword_rls OR NOT list_rls
    OR keyword_force_rls IS DISTINCT FROM false
    OR list_force_rls IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'MINERADOR_0036_CONFLICT: RLS mudou durante a renomeacao';
  END IF;
END $$;

COMMIT;
