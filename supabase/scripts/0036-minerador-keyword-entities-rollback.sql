-- 0036 rollback local assistido.
--
-- Artefato para revisao humana; nao executar automaticamente. Ele somente
-- desfaz os renames realizados pela 0036 e nao recria, apaga ou migra dados.

BEGIN;

SET LOCAL lock_timeout = '10s';

LOCK TABLE
  public.minerador_keywords,
  public.minerador_keyword_lists
IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('public.minerador_keywords') IS NULL
    OR to_regclass('public.minerador_keyword_lists') IS NULL THEN
    RAISE EXCEPTION 'MINERADOR_0036_ROLLBACK_BLOCKED: entidades sucessoras ausentes';
  END IF;
  IF to_regclass('public.keywords_kgr') IS NOT NULL
    OR to_regclass('public.listas_kgr') IS NOT NULL THEN
    RAISE EXCEPTION 'MINERADOR_0036_ROLLBACK_BLOCKED: entidade legada ja existe';
  END IF;
END $$;

DO $$
DECLARE
  item record;
  replacement_name text;
BEGIN
  FOR item IN
    SELECT c.oid, c.relname AS old_name,
           CASE
             WHEN c.relname LIKE '%minerador_keywords%' THEN replace(c.relname, 'minerador_keywords', 'keywords_kgr')
             WHEN c.relname LIKE '%minerador_keyword_lists%' THEN replace(c.relname, 'minerador_keyword_lists', 'listas_kgr')
           END AS new_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
    WHERE n.nspname = 'public'
      AND i.indrelid IN ('public.minerador_keywords'::regclass, 'public.minerador_keyword_lists'::regclass)
      AND (c.relname LIKE '%minerador_keywords%' OR c.relname LIKE '%minerador_keyword_lists%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN CONTINUE; END IF;
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
             WHEN c.conname LIKE '%minerador_keywords%' THEN replace(c.conname, 'minerador_keywords', 'keywords_kgr')
             WHEN c.conname LIKE '%minerador_keyword_lists%' THEN replace(c.conname, 'minerador_keyword_lists', 'listas_kgr')
           END AS new_name
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.oid IN ('public.minerador_keywords'::regclass, 'public.minerador_keyword_lists'::regclass)
      AND (c.conname LIKE '%minerador_keywords%' OR c.conname LIKE '%minerador_keyword_lists%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', item.relation_name, item.old_name, replacement_name);
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  replacement_name text;
BEGIN
  FOR item IN
    SELECT t.relname AS relation_name, tg.tgname AS old_name,
           CASE
             WHEN tg.tgname LIKE '%minerador_keywords%' THEN replace(tg.tgname, 'minerador_keywords', 'keywords_kgr')
             WHEN tg.tgname LIKE '%minerador_keyword_lists%' THEN replace(tg.tgname, 'minerador_keyword_lists', 'listas_kgr')
           END AS new_name
    FROM pg_catalog.pg_trigger tg
    JOIN pg_catalog.pg_class t ON t.oid = tg.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE NOT tg.tgisinternal
      AND n.nspname = 'public'
      AND t.oid IN ('public.minerador_keywords'::regclass, 'public.minerador_keyword_lists'::regclass)
      AND (tg.tgname LIKE '%minerador_keywords%' OR tg.tgname LIKE '%minerador_keyword_lists%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN CONTINUE; END IF;
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
             WHEN p.policyname LIKE '%minerador_keywords%' THEN replace(p.policyname, 'minerador_keywords', 'keywords_kgr')
             WHEN p.policyname LIKE '%minerador_keyword_lists%' THEN replace(p.policyname, 'minerador_keyword_lists', 'listas_kgr')
           END AS new_name
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('minerador_keywords', 'minerador_keyword_lists')
      AND (p.policyname LIKE '%minerador_keywords%' OR p.policyname LIKE '%minerador_keyword_lists%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN CONTINUE; END IF;
    EXECUTE format('ALTER POLICY %I ON public.%I RENAME TO %I', item.old_name, item.relation_name, replacement_name);
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  replacement_name text;
BEGIN
  FOR item IN
    SELECT seq.relname AS old_name,
           CASE
             WHEN seq.relname LIKE '%minerador_keywords%' THEN replace(seq.relname, 'minerador_keywords', 'keywords_kgr')
             WHEN seq.relname LIKE '%minerador_keyword_lists%' THEN replace(seq.relname, 'minerador_keyword_lists', 'listas_kgr')
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
      AND (seq.relname LIKE '%minerador_keywords%' OR seq.relname LIKE '%minerador_keyword_lists%')
  LOOP
    replacement_name := item.new_name;
    IF replacement_name IS NULL OR replacement_name = item.old_name THEN CONTINUE; END IF;
    EXECUTE format('ALTER SEQUENCE public.%I RENAME TO %I', item.old_name, replacement_name);
  END LOOP;
END $$;

ALTER TABLE public.minerador_keywords RENAME TO keywords_kgr;
ALTER TABLE public.minerador_keyword_lists RENAME TO listas_kgr;

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
      AND (p.prosrc ILIKE '%minerador_keywords%' OR p.prosrc ILIKE '%minerador_keyword_lists%')
  LOOP
    definition := pg_get_functiondef(item.oid);
    open_pos := strpos(definition, 'AS $');
    IF open_pos = 0 THEN RAISE EXCEPTION 'MINERADOR_0036_ROLLBACK_BLOCKED: corpo de funcao sem marcador AS $ para oid %', item.oid; END IF;
    open_pos := open_pos + 3;
    tag_end_relative := strpos(substring(definition FROM open_pos + 1), '$');
    IF tag_end_relative = 0 THEN RAISE EXCEPTION 'MINERADOR_0036_ROLLBACK_BLOCKED: delimitador de corpo ausente para oid %', item.oid; END IF;
    tag := substring(definition FROM open_pos FOR tag_end_relative + 1);
    body_start := open_pos + length(tag);
    body_end := strpos(substring(definition FROM body_start), tag);
    IF body_end = 0 THEN RAISE EXCEPTION 'MINERADOR_0036_ROLLBACK_BLOCKED: fechamento de corpo ausente para oid %', item.oid; END IF;
    body := substring(definition FROM body_start FOR body_end - 1);
    body := replace(body, 'public.minerador_keywords', 'public.keywords_kgr');
    body := replace(body, 'minerador_keywords', 'keywords_kgr');
    body := replace(body, 'public.minerador_keyword_lists', 'public.listas_kgr');
    body := replace(body, 'minerador_keyword_lists', 'listas_kgr');
    definition := left(definition, body_start - 1)
      || body
      || substring(definition FROM body_start + body_end - 1);
    EXECUTE definition;
  END LOOP;
END $$;

COMMIT;
