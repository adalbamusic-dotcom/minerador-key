-- BASE CANÔNICA DE AUTORIZAÇÃO PESSOA -> AGENCY -> BRAND.
-- Preparação local. Não executar remotamente sem snapshot, preflight e gate
-- operacional aprovados. Não altera 0005/0006 nem reescreve dados legados.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.agencies') IS NULL
    OR to_regclass('public.agency_memberships') IS NULL
    OR to_regclass('public.agency_brands') IS NULL
    OR to_regclass('public.marcas') IS NULL
    OR to_regclass('public.brand_memberships') IS NULL
    OR to_regclass('public.brand_member_permissions') IS NULL
    OR to_regclass('public.perfis') IS NULL
    OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_0021_PRECONDITION: relações canônicas ausentes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agencies' AND column_name = 'owner_user_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION 'CANONICAL_0021_PRECONDITION: colunas UUID de autorização ausentes';
  END IF;

  IF EXISTS (
    WITH effective AS (
      SELECT a.owner_user_id AS actor_user_id, a.id AS agency_id
      FROM public.agencies a
      WHERE a.status = 'active' AND a.owner_user_id IS NOT NULL
      UNION
      SELECT am.user_id, am.agency_id
      FROM public.agency_memberships am
      JOIN public.agencies a ON a.id = am.agency_id
      WHERE am.status = 'active' AND a.status = 'active'
    )
    SELECT actor_user_id
    FROM effective
    GROUP BY actor_user_id
    HAVING count(DISTINCT agency_id) > 1
  ) THEN
    RAISE EXCEPTION 'CANONICAL_0021_BLOCKED: actor associado a mais de uma Agency operacional';
  END IF;

END $$;

CREATE TABLE IF NOT EXISTS public.canonical_capabilities (
  code text PRIMARY KEY CHECK (code = lower(btrim(code)) AND char_length(code) BETWEEN 1 AND 80),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.canonical_capabilities (code, label)
VALUES
  ('brand_data', 'Dados da Brand'),
  ('brand_collaborators', 'Colaboradores da Brand'),
  ('brand_dna', 'BrandDNA'),
  ('minerador', 'Minerador'),
  ('arquiteto', 'Arquiteto'),
  ('radar', 'Radar'),
  ('planejador', 'Planejador'),
  ('redator', 'Redator'),
  ('publicacoes', 'Publicações'),
  ('activity', 'Atividade'),
  ('notifications', 'Notificações')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agency_membership_capabilities (
  membership_id uuid NOT NULL REFERENCES public.agency_memberships(id) ON DELETE RESTRICT,
  capability text NOT NULL REFERENCES public.canonical_capabilities(code) ON DELETE RESTRICT,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, capability)
);

CREATE TABLE IF NOT EXISTS public.brand_agency_capability_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE RESTRICT,
  capability text NOT NULL REFERENCES public.canonical_capabilities(code) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  reason text CHECK (reason IS NULL OR char_length(btrim(reason)) <= 1000),
  applied_by_actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CHECK ((status = 'active' AND revoked_at IS NULL AND revoked_by_actor_user_id IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_actor_user_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_agency_capability_restriction_active_0021
  ON public.brand_agency_capability_restrictions (brand_id, agency_id, capability)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_agency_membership_capabilities_capability_0021
  ON public.agency_membership_capabilities (capability, granted);
CREATE INDEX IF NOT EXISTS ix_brand_agency_capability_restrictions_agency_0021
  ON public.brand_agency_capability_restrictions (agency_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agencies_active_owner_0021
  ON public.agencies (owner_user_id)
  WHERE owner_user_id IS NOT NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_memberships_active_user_0021
  ON public.agency_memberships (user_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.canonical_actor_is_global_admin(target_actor_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = target_actor_user_id AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_actor_can_manage_agency(target_agency_id uuid, target_actor_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agencies a
    WHERE a.id = target_agency_id
      AND a.status = 'active'
      AND (
        a.owner_user_id = target_actor_user_id
        OR EXISTS (
          SELECT 1 FROM public.agency_memberships am
          WHERE am.agency_id = a.id
            AND am.user_id = target_actor_user_id
            AND am.status = 'active'
            AND am.role = 'agency_admin'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_actor_can_manage_brand(target_brand_id uuid, target_actor_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.marcas b
    WHERE b.id = target_brand_id
      AND (
        b.owner_user_id = target_actor_user_id
        OR EXISTS (
          SELECT 1
          FROM public.brand_memberships bm
          WHERE bm.marca_id = b.id
            AND bm.member_user_id = target_actor_user_id
            AND bm.status = 'active'
            AND (
              bm.role IN ('owner', 'brand_admin')
              OR EXISTS (
                SELECT 1 FROM public.brand_member_permissions p
                WHERE p.membership_id = bm.id
                  AND p.module = 'marca'
                  AND p.action = 'manage'
                  AND p.granted
              )
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_capability_for_module(requested_module text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE requested_module
    WHEN 'marca' THEN 'brand_data'
    ELSE requested_module
  END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_actor_has_agency_capability(target_agency_id uuid, target_actor_user_id uuid, target_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agencies a
    WHERE a.id = target_agency_id
      AND a.status = 'active'
      AND a.owner_user_id = target_actor_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.agency_memberships am
    JOIN public.agencies a ON a.id = am.agency_id AND a.status = 'active'
    WHERE am.agency_id = target_agency_id
      AND am.user_id = target_actor_user_id
      AND am.status = 'active'
      AND am.role = 'agency_admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.agency_memberships am
    JOIN public.agencies a ON a.id = am.agency_id AND a.status = 'active'
    JOIN public.agency_membership_capabilities c ON c.membership_id = am.id
    WHERE am.agency_id = target_agency_id
      AND am.user_id = target_actor_user_id
      AND am.status = 'active'
      AND c.capability = target_capability
      AND c.granted
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_actor_has_brand_restriction(target_brand_id uuid, target_agency_id uuid, target_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.brand_agency_capability_restrictions r
    WHERE r.brand_id = target_brand_id
      AND r.agency_id = target_agency_id
      AND r.capability = target_capability
      AND r.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_actor_can_access_brand(target_brand_id uuid, target_actor_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.marcas b
    WHERE b.id = target_brand_id
      AND b.status = 'active'
      AND (
        b.owner_user_id = target_actor_user_id
        OR EXISTS (
          SELECT 1 FROM public.brand_memberships bm
          WHERE bm.marca_id = b.id
            AND bm.member_user_id = target_actor_user_id
            AND bm.status = 'active'
        )
        OR EXISTS (
          SELECT 1
          FROM public.agency_brands ab
          WHERE ab.brand_id = b.id
            AND ab.status = 'active'
            AND EXISTS (
              SELECT 1
              FROM public.agencies a
              WHERE a.id = ab.agency_id
                AND a.status = 'active'
                AND (
                  a.owner_user_id = target_actor_user_id
                  OR EXISTS (
                    SELECT 1 FROM public.agency_memberships am
                    WHERE am.agency_id = a.id
                      AND am.user_id = target_actor_user_id
                      AND am.status = 'active'
                  )
                )
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_actor_can_use_brand_capability(target_brand_id uuid, target_actor_user_id uuid, target_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.canonical_capabilities c WHERE c.code = target_capability AND c.active)
    AND EXISTS (
      SELECT 1 FROM public.marcas b
      WHERE b.id = target_brand_id AND b.status = 'active'
        AND (
          b.owner_user_id = target_actor_user_id
          OR EXISTS (
            SELECT 1
            FROM public.brand_memberships bm
            WHERE bm.marca_id = b.id
              AND bm.member_user_id = target_actor_user_id
              AND bm.status = 'active'
              AND (
                bm.role IN ('owner', 'brand_admin')
                OR EXISTS (
                  SELECT 1 FROM public.brand_member_permissions p
                  WHERE p.membership_id = bm.id
                    AND p.granted
                    AND (
                      (target_capability IN ('brand_data', 'brand_collaborators', 'brand_dna') AND p.module = 'marca' AND p.action IN ('view', 'manage'))
                      OR (p.module = target_capability AND p.action IN ('view', 'manage'))
                    )
                )
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.agency_brands ab
            WHERE ab.brand_id = b.id
              AND ab.status = 'active'
              AND public.canonical_actor_has_agency_capability(ab.agency_id, target_actor_user_id, target_capability)
              AND NOT public.canonical_actor_has_brand_restriction(b.id, ab.agency_id, target_capability)
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.canonical_actor_can_use_brand_action(target_brand_id uuid, target_actor_user_id uuid, requested_module text, requested_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.canonical_actor_can_access_brand(target_brand_id, target_actor_user_id)
    AND (
      public.canonical_actor_can_manage_brand(target_brand_id, target_actor_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.brand_memberships bm
        JOIN public.brand_member_permissions p ON p.membership_id = bm.id
        WHERE bm.marca_id = target_brand_id
          AND bm.member_user_id = target_actor_user_id
          AND bm.status = 'active'
          AND p.module = requested_module
          AND p.action = requested_action
          AND p.granted
      )
      OR EXISTS (
        SELECT 1
        FROM public.agency_brands ab
        WHERE ab.brand_id = target_brand_id
          AND ab.status = 'active'
          AND public.canonical_actor_has_agency_capability(ab.agency_id, target_actor_user_id, public.canonical_capability_for_module(requested_module))
          AND NOT public.canonical_actor_has_brand_restriction(target_brand_id, ab.agency_id, public.canonical_capability_for_module(requested_module))
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.canonical_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND public.canonical_actor_is_global_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_access_brand(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND public.canonical_actor_can_access_brand(target_brand_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.canonical_can_manage_brand(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.canonical_actor_can_manage_brand(target_brand_id, auth.uid())
      OR public.canonical_actor_can_use_brand_action(target_brand_id, auth.uid(), 'marca', 'manage')
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
            WHERE am.agency_id = a.id AND am.user_id = auth.uid() AND am.status = 'active'
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
  SELECT auth.uid() IS NOT NULL AND public.canonical_actor_can_manage_agency(target_agency_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_access_agency(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT public.canonical_can_access_agency(target_agency_id); $$;

CREATE OR REPLACE FUNCTION public.can_manage_agency(target_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT public.canonical_can_manage_agency(target_agency_id); $$;

-- Compatibilidade: as policies antigas continuam chamando estes nomes, mas a
-- decisão passa a usar somente UUID, Agency ativa e restrições canônicas.
CREATE OR REPLACE FUNCTION public.can_access_brand(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT public.canonical_can_access_brand(target_brand_id); $$;

CREATE OR REPLACE FUNCTION public.can_manage_brand(target_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT public.canonical_can_manage_brand(target_brand_id); $$;

CREATE OR REPLACE FUNCTION public.tenant_actor_has_permission(target_brand_id uuid, requested_module text, requested_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.canonical_actor_can_use_brand_action(target_brand_id, auth.uid(), requested_module, requested_action);
$$;

CREATE OR REPLACE FUNCTION public.canonical_validate_single_operational_agency_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor_id uuid;
  actor_ids uuid[] := ARRAY[]::uuid[];
  touched_agency_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'agencies' THEN
    touched_agency_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    IF TG_OP <> 'INSERT' AND OLD.owner_user_id IS NOT NULL THEN actor_ids := actor_ids || OLD.owner_user_id; END IF;
    IF TG_OP <> 'DELETE' AND NEW.owner_user_id IS NOT NULL THEN actor_ids := actor_ids || NEW.owner_user_id; END IF;
    SELECT actor_ids || coalesce(array_agg(am.user_id), ARRAY[]::uuid[])
      INTO actor_ids
    FROM public.agency_memberships am
    WHERE am.agency_id = touched_agency_id AND am.status = 'active';
  ELSE
    IF TG_OP <> 'INSERT' AND OLD.user_id IS NOT NULL THEN actor_ids := actor_ids || OLD.user_id; END IF;
    IF TG_OP <> 'DELETE' AND NEW.user_id IS NOT NULL THEN actor_ids := actor_ids || NEW.user_id; END IF;
  END IF;

  FOREACH actor_id IN ARRAY actor_ids LOOP
    IF actor_id IS NULL THEN CONTINUE; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(actor_id::text, 21021));

    IF EXISTS (
      WITH effective AS (
        SELECT a.id AS agency_id
        FROM public.agencies a
        WHERE a.status = 'active' AND a.owner_user_id = actor_id
        UNION
        SELECT am.agency_id
        FROM public.agency_memberships am
        JOIN public.agencies a ON a.id = am.agency_id AND a.status = 'active'
        WHERE am.user_id = actor_id AND am.status = 'active'
      )
      SELECT 1 FROM effective GROUP BY actor_id HAVING count(DISTINCT agency_id) > 1
    ) THEN
      RAISE EXCEPTION 'CANONICAL_0021_ACTOR_MULTIPLE_AGENCIES';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canonical_0021_agencies_actor_guard ON public.agencies;
CREATE CONSTRAINT TRIGGER canonical_0021_agencies_actor_guard
AFTER INSERT OR UPDATE OR DELETE ON public.agencies
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.canonical_validate_single_operational_agency_actor();

DROP TRIGGER IF EXISTS canonical_0021_memberships_actor_guard ON public.agency_memberships;
CREATE CONSTRAINT TRIGGER canonical_0021_memberships_actor_guard
AFTER INSERT OR UPDATE OR DELETE ON public.agency_memberships
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.canonical_validate_single_operational_agency_actor();

CREATE OR REPLACE FUNCTION public.canonical_assert_rpc_actor(p_actor_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF auth.role() NOT IN ('authenticated', 'service_role') OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_0021_RPC_ACTOR_INVALID';
  END IF;
  IF auth.role() = 'authenticated' AND auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'CANONICAL_0021_RPC_ACTOR_MISMATCH';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_actor_user_id) THEN
    RAISE EXCEPTION 'CANONICAL_0021_RPC_ACTOR_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_assign_agency_owner(
  p_actor_user_id uuid,
  p_agency_id uuid,
  p_owner_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT (public.canonical_actor_is_global_admin(p_actor_user_id) OR public.canonical_actor_can_manage_agency(p_agency_id, p_actor_user_id)) THEN
    RAISE EXCEPTION 'CANONICAL_0021_AGENCY_OWNER_FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_owner_user_id) THEN
    RAISE EXCEPTION 'CANONICAL_0021_OWNER_NOT_FOUND';
  END IF;
  UPDATE public.agencies SET owner_user_id = p_owner_user_id, updated_at = now() WHERE id = p_agency_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANONICAL_0021_AGENCY_NOT_FOUND'; END IF;
  RETURN p_agency_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_upsert_agency_membership(
  p_actor_user_id uuid,
  p_agency_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text DEFAULT 'active'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE membership_id uuid;
BEGIN
  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT (public.canonical_actor_is_global_admin(p_actor_user_id) OR public.canonical_actor_can_manage_agency(p_agency_id, p_actor_user_id)) THEN
    RAISE EXCEPTION 'CANONICAL_0021_MEMBERSHIP_FORBIDDEN';
  END IF;
  IF p_role NOT IN ('agency_admin', 'operator', 'viewer') OR p_status NOT IN ('active', 'suspended', 'removed') THEN
    RAISE EXCEPTION 'CANONICAL_0021_MEMBERSHIP_INVALID_INPUT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'CANONICAL_0021_MEMBER_NOT_FOUND';
  END IF;
  INSERT INTO public.agency_memberships (agency_id, user_id, role, status, updated_at)
  VALUES (p_agency_id, p_user_id, p_role, p_status, now())
  ON CONFLICT (agency_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now()
  RETURNING id INTO membership_id;
  RETURN membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_set_agency_membership_status(
  p_actor_user_id uuid,
  p_membership_id uuid,
  p_status text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE target_agency_id uuid; membership_user_id uuid;
BEGIN
  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  SELECT agency_id, user_id INTO target_agency_id, membership_user_id FROM public.agency_memberships WHERE id = p_membership_id FOR UPDATE;
  IF target_agency_id IS NULL THEN RAISE EXCEPTION 'CANONICAL_0021_MEMBERSHIP_NOT_FOUND'; END IF;
  IF NOT (public.canonical_actor_is_global_admin(p_actor_user_id) OR public.canonical_actor_can_manage_agency(target_agency_id, p_actor_user_id)) THEN
    RAISE EXCEPTION 'CANONICAL_0021_MEMBERSHIP_FORBIDDEN';
  END IF;
  IF p_status NOT IN ('active', 'suspended', 'removed') THEN RAISE EXCEPTION 'CANONICAL_0021_MEMBERSHIP_INVALID_INPUT'; END IF;
  UPDATE public.agency_memberships SET status = p_status, updated_at = now() WHERE id = p_membership_id;
  RETURN p_membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_set_agency_brand_link(
  p_actor_user_id uuid,
  p_agency_id uuid,
  p_brand_id uuid,
  p_status text DEFAULT 'active'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE link_id uuid;
BEGIN
  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT (public.canonical_actor_is_global_admin(p_actor_user_id) OR (public.canonical_actor_can_manage_agency(p_agency_id, p_actor_user_id) AND public.canonical_actor_can_manage_brand(p_brand_id, p_actor_user_id))) THEN
    RAISE EXCEPTION 'CANONICAL_0021_BRAND_LINK_FORBIDDEN';
  END IF;
  IF p_status NOT IN ('active', 'inactive', 'removed') THEN RAISE EXCEPTION 'CANONICAL_0021_BRAND_LINK_INVALID_INPUT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = p_agency_id AND status = 'active') THEN RAISE EXCEPTION 'CANONICAL_0021_AGENCY_NOT_ACTIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marcas WHERE id = p_brand_id AND status = 'active') THEN RAISE EXCEPTION 'CANONICAL_0021_BRAND_NOT_ACTIVE'; END IF;
  INSERT INTO public.agency_brands (agency_id, brand_id, status, updated_at)
  VALUES (p_agency_id, p_brand_id, p_status, now())
  ON CONFLICT (agency_id, brand_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
  RETURNING id INTO link_id;
  RETURN link_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_apply_brand_agency_capability_restriction(
  p_actor_user_id uuid,
  p_brand_id uuid,
  p_agency_id uuid,
  p_capability text,
  p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE restriction_id uuid;
BEGIN
  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT public.canonical_actor_can_manage_brand(p_brand_id, p_actor_user_id) THEN RAISE EXCEPTION 'CANONICAL_0021_RESTRICTION_FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.canonical_capabilities WHERE code = p_capability AND active) THEN RAISE EXCEPTION 'CANONICAL_0021_CAPABILITY_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agency_brands WHERE agency_id = p_agency_id AND brand_id = p_brand_id AND status = 'active') THEN RAISE EXCEPTION 'CANONICAL_0021_BRAND_LINK_REQUIRED'; END IF;
  INSERT INTO public.brand_agency_capability_restrictions (brand_id, agency_id, capability, status, reason, applied_by_actor_user_id)
  VALUES (p_brand_id, p_agency_id, p_capability, 'active', NULLIF(btrim(p_reason), ''), p_actor_user_id)
  ON CONFLICT (brand_id, agency_id, capability) WHERE status = 'active' DO UPDATE
    SET reason = EXCLUDED.reason, applied_by_actor_user_id = EXCLUDED.applied_by_actor_user_id, created_at = now(), revoked_at = NULL, revoked_by_actor_user_id = NULL, status = 'active'
  RETURNING id INTO restriction_id;
  RETURN restriction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_revoke_brand_agency_capability_restriction(
  p_actor_user_id uuid,
  p_restriction_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE target_brand_id uuid; changed bigint;
BEGIN
  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  SELECT brand_id INTO target_brand_id FROM public.brand_agency_capability_restrictions WHERE id = p_restriction_id FOR UPDATE;
  IF target_brand_id IS NULL THEN RETURN false; END IF;
  IF NOT public.canonical_actor_can_manage_brand(target_brand_id, p_actor_user_id) THEN RAISE EXCEPTION 'CANONICAL_0021_RESTRICTION_FORBIDDEN'; END IF;
  UPDATE public.brand_agency_capability_restrictions
  SET status = 'revoked', revoked_at = now(), revoked_by_actor_user_id = p_actor_user_id
  WHERE id = p_restriction_id AND status = 'active';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed > 0;
END;
$$;

-- Acesso direto às relações estruturais é somente leitura para authenticated;
-- mudanças atravessando múltiplas tabelas passam pelas RPCs acima.
ALTER TABLE public.canonical_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_membership_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_agency_capability_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_0014_agencies_select ON public.agencies;
CREATE POLICY agency_0021_agencies_select ON public.agencies FOR SELECT TO authenticated USING (public.canonical_can_access_agency(id));
DROP POLICY IF EXISTS agency_0014_agencies_insert ON public.agencies;
DROP POLICY IF EXISTS agency_0014_agencies_update ON public.agencies;
DROP POLICY IF EXISTS agency_0014_agencies_delete ON public.agencies;

DROP POLICY IF EXISTS agency_0014_memberships_select ON public.agency_memberships;
CREATE POLICY agency_0021_memberships_select ON public.agency_memberships FOR SELECT TO authenticated USING (public.canonical_can_access_agency(agency_id));
DROP POLICY IF EXISTS agency_0014_memberships_insert ON public.agency_memberships;
DROP POLICY IF EXISTS agency_0014_memberships_update ON public.agency_memberships;
DROP POLICY IF EXISTS agency_0014_memberships_delete ON public.agency_memberships;

DROP POLICY IF EXISTS agency_0014_brands_select ON public.agency_brands;
CREATE POLICY agency_0021_brands_select ON public.agency_brands FOR SELECT TO authenticated USING (public.canonical_can_access_agency(agency_id) OR public.canonical_can_manage_brand(brand_id));
DROP POLICY IF EXISTS agency_0014_brands_insert ON public.agency_brands;
DROP POLICY IF EXISTS agency_0014_brands_update ON public.agency_brands;
DROP POLICY IF EXISTS agency_0014_brands_delete ON public.agency_brands;

CREATE POLICY canonical_0021_capabilities_select ON public.canonical_capabilities FOR SELECT TO authenticated USING (active);
CREATE POLICY canonical_0021_membership_capabilities_select ON public.agency_membership_capabilities
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.agency_memberships am WHERE am.id = membership_id AND public.canonical_can_access_agency(am.agency_id)));
CREATE POLICY canonical_0021_restrictions_select ON public.brand_agency_capability_restrictions
  FOR SELECT TO authenticated USING (
    public.canonical_can_manage_brand(brand_id)
    OR (
      public.canonical_can_access_agency(brand_agency_capability_restrictions.agency_id)
      AND EXISTS (
        SELECT 1 FROM public.agency_brands ab
        WHERE ab.agency_id = brand_agency_capability_restrictions.agency_id
          AND ab.brand_id = brand_agency_capability_restrictions.brand_id
          AND ab.status = 'active'
      )
    )
  );

REVOKE ALL ON TABLE public.canonical_capabilities, public.agency_membership_capabilities, public.brand_agency_capability_restrictions FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.canonical_capabilities, public.agency_membership_capabilities, public.brand_agency_capability_restrictions TO authenticated;
GRANT ALL ON TABLE public.canonical_capabilities, public.agency_membership_capabilities, public.brand_agency_capability_restrictions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.agencies, public.agency_memberships, public.agency_brands FROM authenticated;
GRANT SELECT ON TABLE public.agencies, public.agency_memberships, public.agency_brands TO authenticated;

REVOKE ALL ON FUNCTION public.canonical_actor_is_global_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_actor_can_manage_agency(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_actor_can_manage_brand(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_actor_has_agency_capability(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_actor_has_brand_restriction(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_actor_can_access_brand(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_actor_can_use_brand_capability(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.canonical_actor_can_use_brand_action(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canonical_actor_can_use_brand_capability(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_actor_can_use_brand_action(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_access_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_manage_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_access_agency(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_can_manage_agency(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_agency(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_agency(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_actor_has_permission(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.canonical_assert_rpc_actor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canonical_assert_rpc_actor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_assign_agency_owner(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_upsert_agency_membership(uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_set_agency_membership_status(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_set_agency_brand_link(uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_apply_brand_agency_capability_restriction(uuid, uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_revoke_brand_agency_capability_restriction(uuid, uuid) TO authenticated, service_role;

COMMIT;
