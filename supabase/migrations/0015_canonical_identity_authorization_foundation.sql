-- PREPARAÇÃO LOCAL DA FASE 1. NÃO EXECUTAR SEM O GATE REMOTO APROVADO.
-- Sucessora de 0005, 0006 e 0014: não altera migrations históricas, não remove
-- colunas, não remove policies e não toca dados editoriais, keywords ou listas.
-- O catálogo remoto e os scripts de auditoria read-only devem ser revisados antes
-- da aplicação manual desta migration.

-- All guards and validations run before COMMIT. Any exception aborts this
-- transaction and rolls back this file's changes atomically.
BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL
    OR to_regclass('public.perfis') IS NULL
    OR to_regclass('public.marcas') IS NULL
    OR to_regclass('public.brand_memberships') IS NULL
    OR to_regclass('public.brand_member_permissions') IS NULL
    OR to_regclass('public.agencies') IS NULL
    OR to_regclass('public.agency_memberships') IS NULL
    OR to_regclass('public.agency_brands') IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_0015_PRECONDITION: relations esperadas não existem no catálogo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'id')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'role')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marcas' AND column_name = 'owner_user_id')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brand_memberships' AND column_name = 'member_user_id')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'user_id')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_brands' AND column_name = 'brand_id') THEN
    RAISE EXCEPTION 'CANONICAL_0015_PRECONDITION: colunas da geração anterior não correspondem ao contrato local auditado';
  END IF;
END $$;

-- Campos canônicos novos. Eles convivem temporariamente com os contratos
-- legados; a remoção de user_key, marca_id e papéis legados
-- pertence à fase de corte, após prova de ausência de consumidores.
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.agency_memberships ADD COLUMN IF NOT EXISTS canonical_role text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.agencies'::regclass AND conname = 'fk_agencies_owner_user_id_0015') THEN
    ALTER TABLE public.agencies
      ADD CONSTRAINT fk_agencies_owner_user_id_0015
      FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.agency_memberships'::regclass AND conname = 'ck_agency_memberships_canonical_role_0015') THEN
    ALTER TABLE public.agency_memberships
      ADD CONSTRAINT ck_agency_memberships_canonical_role_0015
      CHECK (canonical_role IS NULL OR canonical_role IN ('agency_admin', 'agency_member')) NOT VALID;
  END IF;
END $$;

-- Não há uma segunda coluna UUID canônica em brand_memberships: member_user_id
-- é o contrato definitivo por já estar instalado em 0005/0006. user_key será
-- removida apenas depois do corte de todos os consumidores textuais.
-- Não há busca por e-mail, user_key, slug, owner textual ou primeira identidade.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.brand_memberships WHERE member_user_id IS NULL) THEN
    RAISE EXCEPTION 'CANONICAL_0015_BLOCKED: existem memberships sem identidade UUID reconciliada';
  END IF;

  UPDATE public.agency_memberships
  SET canonical_role = CASE
    WHEN role = 'agency_admin' THEN 'agency_admin'
    WHEN role IN ('operator', 'viewer') THEN 'agency_member'
    ELSE NULL
  END
  WHERE canonical_role IS NULL;

  IF EXISTS (
    SELECT 1 FROM public.agency_memberships
    WHERE canonical_role IS NULL OR canonical_role NOT IN ('agency_admin', 'agency_member')
  ) THEN
    RAISE EXCEPTION 'CANONICAL_0015_BLOCKED: papel de agency_membership sem mapeamento canônico';
  END IF;

  -- agency_admin é somente candidato para decisão humana; nunca é inferido
  -- como owner. Com agência existente e owner ausente, a migration falha para
  -- que uma sucessora contenha o mapeamento UUID aprovado pelo operador.
  IF EXISTS (
    SELECT 1
    FROM public.agencies a
    WHERE a.owner_user_id IS NULL
      AND 0 = (
        SELECT count(*)
        FROM public.agency_memberships am
        WHERE am.agency_id = a.id AND am.status = 'active' AND am.canonical_role = 'agency_admin'
      )
  ) THEN
    RAISE EXCEPTION 'CANONICAL_0015_BLOCKED: agência sem owner não possui candidato agency_admin ativo';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.agencies a
    WHERE a.owner_user_id IS NULL
      AND 1 < (
        SELECT count(*)
        FROM public.agency_memberships am
        WHERE am.agency_id = a.id AND am.status = 'active' AND am.canonical_role = 'agency_admin'
      )
  ) THEN
    RAISE EXCEPTION 'CANONICAL_0015_BLOCKED: agência sem owner possui múltiplos candidatos agency_admin';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agencies WHERE owner_user_id IS NULL) THEN
    RAISE EXCEPTION 'CANONICAL_0015_OWNER_DECISION_REQUIRED: owner de agência exige mapeamento UUID humano em migration sucessora';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.agencies a
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.owner_user_id)
  ) THEN
    RAISE EXCEPTION 'CANONICAL_0015_CONFLICT: owner_user_id de agência não existe em auth.users';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_agencies_owner_status_0015
  ON public.agencies (owner_user_id, status);
CREATE INDEX IF NOT EXISTS ix_agency_memberships_canonical_role_0015
  ON public.agency_memberships (agency_id, user_id, canonical_role, status);
ALTER TABLE public.agencies ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE public.agency_memberships ALTER COLUMN canonical_role SET NOT NULL;
ALTER TABLE public.agencies VALIDATE CONSTRAINT fk_agencies_owner_user_id_0015;
ALTER TABLE public.agency_memberships VALIDATE CONSTRAINT ck_agency_memberships_canonical_role_0015;

-- Reutiliza o índice 0014 quando ele estiver correto. O catálogo remoto ainda
-- precisa confirmar sua presença; se existir com definição divergente, aborta
-- em vez de criar índice/constraint concorrente.
DO $$
DECLARE expected_index_definition text;
BEGIN
  IF to_regclass('public.uq_agency_brands_active_brand_0014') IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_0015_PRECONDITION: índice uq_agency_brands_active_brand_0014 ausente';
  END IF;
  SELECT pg_get_indexdef(to_regclass('public.uq_agency_brands_active_brand_0014'))
  INTO expected_index_definition;
  IF expected_index_definition NOT ILIKE '%UNIQUE INDEX%'
    OR expected_index_definition NOT ILIKE '%ON public.agency_brands%'
    OR expected_index_definition NOT ILIKE '%(brand_id)%'
    OR expected_index_definition NOT ILIKE '%WHERE (status = ''active''%' THEN
    RAISE EXCEPTION 'CANONICAL_0015_CONFLICT: índice 0014 de agência ativa possui definição divergente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.agency_brands
    WHERE status = 'active'
    GROUP BY brand_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CANONICAL_0015_CONFLICT: uma marca possui mais de uma agência ativa';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.canonical_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_access_brand(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.marcas b
      WHERE b.id = target_brand_id
        AND b.status = 'active'
        AND (
          b.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.brand_memberships bm
            WHERE bm.marca_id = b.id
              AND bm.member_user_id = auth.uid()
              AND bm.status = 'active'
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_manage_brand(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.marcas b
      WHERE b.id = target_brand_id
        AND b.status = 'active'
        AND (
          b.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.brand_memberships bm
            JOIN public.brand_member_permissions p
              ON p.membership_id = bm.id
             AND p.module = 'marca'
             AND p.action = 'manage'
             AND p.granted
            WHERE bm.marca_id = b.id
              AND bm.member_user_id = auth.uid()
              AND bm.status = 'active'
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_access_agency(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.id = target_agency_id
        AND a.status = 'active'
        AND (
          a.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.agency_memberships am
            WHERE am.agency_id = a.id
              AND am.user_id = auth.uid()
              AND am.status = 'active'
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_manage_agency(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.id = target_agency_id
        AND a.status = 'active'
        AND (
          a.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.agency_memberships am
            WHERE am.agency_id = a.id
              AND am.user_id = auth.uid()
              AND am.status = 'active'
              AND am.canonical_role = 'agency_admin'
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.canonical_is_platform_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_can_access_brand(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_can_manage_brand(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_can_access_agency(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_can_manage_agency(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canonical_is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_access_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_manage_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_access_agency(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_manage_agency(uuid) TO authenticated, service_role;

COMMIT;
