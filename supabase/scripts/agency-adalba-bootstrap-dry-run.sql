-- READ-ONLY PRECHECK. Run the complete file once in the SQL Editor.
-- The bootstrap resolves the UUID from auth.users; no UUID is supplied here.
-- Canonical target: agency name AdalbaPro, slug adalbapro,
-- existing identity adalbapro@gmail.com.

WITH
params AS (
  SELECT
    'adalbapro@gmail.com'::text AS target_email,
    'AdalbaPro'::text AS target_agency_name,
    'adalbapro'::text AS target_agency_slug
),
identity_rows AS (
  SELECT
    auth_user.id,
    auth_user.email,
    auth_user.email_confirmed_at
  FROM auth.users AS auth_user
  CROSS JOIN params
  WHERE lower(btrim(auth_user.email)) = lower(btrim(params.target_email))
),
identity AS (
  SELECT
    count(*)::integer AS identity_count,
    (array_agg(identity_row.id ORDER BY identity_row.id))[1] AS actor_user_id,
    coalesce(bool_and(identity_row.email_confirmed_at IS NOT NULL), false) AS email_confirmed
  FROM identity_rows AS identity_row
),
profile AS (
  SELECT
    count(profile_row.id)::integer AS global_admin_count
  FROM public.perfis AS profile_row
  CROSS JOIN identity
  WHERE profile_row.id = identity.actor_user_id
    AND profile_row.role = 'admin'
),
target_agency_rows AS (
  SELECT
    agency.id,
    agency.name,
    agency.slug,
    agency.status,
    agency.owner_user_id
  FROM public.agencies AS agency
  CROSS JOIN params
  WHERE lower(btrim(agency.slug)) = lower(btrim(params.target_agency_slug))
),
target_agency AS (
  SELECT
    count(*)::integer AS target_agency_count,
    (array_agg(target_row.id ORDER BY target_row.id))[1] AS agency_id,
    (array_agg(target_row.name ORDER BY target_row.id))[1] AS agency_name,
    (array_agg(target_row.status ORDER BY target_row.id))[1] AS agency_status,
    (array_agg(target_row.owner_user_id ORDER BY target_row.id))[1] AS agency_owner_user_id
  FROM target_agency_rows AS target_row
),
target_membership_rows AS (
  SELECT
    membership.id,
    membership.role,
    membership.status,
    membership.user_id,
    membership.agency_id
  FROM public.agency_memberships AS membership
  CROSS JOIN identity
  CROSS JOIN target_agency
  WHERE membership.user_id = identity.actor_user_id
    AND membership.agency_id = target_agency.agency_id
),
target_membership AS (
  SELECT
    count(*)::integer AS target_membership_count,
    coalesce(bool_and(
      membership_row.role = 'agency_admin'
      AND membership_row.status = 'active'
    ), true) AS target_membership_compatible
  FROM target_membership_rows AS membership_row
),
name_conflicts AS (
  SELECT count(*)::integer AS conflicting_name_count
  FROM public.agencies AS agency
  CROSS JOIN params
  WHERE lower(btrim(agency.name)) = lower(btrim(params.target_agency_name))
    AND lower(btrim(agency.slug)) <> lower(btrim(params.target_agency_slug))
),
active_actor_agencies AS (
  SELECT agency.id AS agency_id
  FROM public.agencies AS agency
  CROSS JOIN identity
  WHERE agency.status = 'active'
    AND agency.owner_user_id = identity.actor_user_id
  UNION
  SELECT agency.id AS agency_id
  FROM public.agencies AS agency
  JOIN public.agency_memberships AS membership
    ON membership.agency_id = agency.id
  CROSS JOIN identity
  WHERE agency.status = 'active'
    AND membership.user_id = identity.actor_user_id
    AND membership.status = 'active'
),
operational_conflicts AS (
  SELECT count(*)::integer AS other_operational_agency_count
  FROM active_actor_agencies AS actor_agency
  CROSS JOIN target_agency
  WHERE actor_agency.agency_id IS DISTINCT FROM target_agency.agency_id
),
required_relations AS (
  SELECT *
  FROM (VALUES
    ('auth'::text, 'users'::text),
    ('public'::text, 'perfis'::text),
    ('public'::text, 'agencies'::text),
    ('public'::text, 'agency_memberships'::text),
    ('public'::text, 'agency_brands'::text),
    ('public'::text, 'marcas'::text),
    ('public'::text, 'brand_memberships'::text),
    ('public'::text, 'minerador_keyword_lists'::text),
    ('public'::text, 'minerador_keywords'::text)
  ) AS relation_manifest(schema_name, relation_name)
),
relation_status AS (
  SELECT
    relation_manifest.schema_name,
    relation_manifest.relation_name,
    to_regclass(format('%I.%I', relation_manifest.schema_name, relation_manifest.relation_name)) AS relation_oid
  FROM required_relations AS relation_manifest
),
relation_gate AS (
  SELECT
    count(*)::integer AS relation_total,
    count(*) FILTER (WHERE relation_status.relation_oid IS NOT NULL)::integer AS relation_present
  FROM relation_status
),
required_columns AS (
  SELECT *
  FROM (VALUES
    ('public'::text, 'perfis'::text, 'id'::text),
    ('public'::text, 'perfis'::text, 'role'::text),
    ('public'::text, 'agencies'::text, 'id'::text),
    ('public'::text, 'agencies'::text, 'name'::text),
    ('public'::text, 'agencies'::text, 'slug'::text),
    ('public'::text, 'agencies'::text, 'status'::text),
    ('public'::text, 'agencies'::text, 'owner_user_id'::text),
    ('public'::text, 'agency_memberships'::text, 'agency_id'::text),
    ('public'::text, 'agency_memberships'::text, 'user_id'::text),
    ('public'::text, 'agency_memberships'::text, 'role'::text),
    ('public'::text, 'agency_memberships'::text, 'status'::text)
  ) AS column_manifest(schema_name, table_name, column_name)
),
column_status AS (
  SELECT
    required_columns.schema_name,
    required_columns.table_name,
    required_columns.column_name,
    EXISTS (
      SELECT 1
      FROM information_schema.columns AS column_info
      WHERE column_info.table_schema = required_columns.schema_name
        AND column_info.table_name = required_columns.table_name
        AND column_info.column_name = required_columns.column_name
    ) AS present
  FROM required_columns
),
column_gate AS (
  SELECT
    count(*)::integer AS column_total,
    count(*) FILTER (WHERE column_status.present)::integer AS column_present
  FROM column_status
),
required_helpers AS (
  SELECT *
  FROM (VALUES
    ('public.canonical_actor_is_global_admin(uuid)'::text),
    ('public.canonical_actor_can_manage_agency(uuid,uuid)'::text),
    ('public.canonical_can_access_agency(uuid)'::text),
    ('public.canonical_can_manage_agency(uuid)'::text),
    ('public.can_access_agency(uuid)'::text),
    ('public.can_manage_agency(uuid)'::text)
  ) AS helper_manifest(signature)
),
helper_status AS (
  SELECT
    required_helpers.signature,
    to_regprocedure(required_helpers.signature) IS NOT NULL AS present
  FROM required_helpers
),
helper_gate AS (
  SELECT
    count(*)::integer AS helper_total,
    count(*) FILTER (WHERE helper_status.present)::integer AS helper_present
  FROM helper_status
),
scope_counts AS (
  SELECT
    (SELECT count(*) FROM public.marcas)::bigint AS marcas_count,
    (SELECT count(*) FROM public.brand_memberships)::bigint AS brand_memberships_count,
    (SELECT count(*) FROM public.agency_brands)::bigint AS agency_brands_count,
    (SELECT count(*) FROM public.minerador_keyword_lists)::bigint AS listas_count,
    (SELECT count(*) FROM public.minerador_keywords)::bigint AS keywords_count
),
checks AS (
  SELECT
    'script_version'::text AS check_name,
    '2026-08-13-agency-adalba-bootstrap-v2'::text AS expected,
    '2026-08-13-agency-adalba-bootstrap-v2'::text AS observed,
    'INFO'::text AS verdict,
    identity.actor_user_id,
    target_agency.agency_id
  FROM identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'identity:unique'::text,
    '1'::text,
    identity.identity_count::text,
    CASE WHEN identity.identity_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'identity:confirmed'::text,
    'email_confirmed_at IS NOT NULL'::text,
    identity.email_confirmed::text,
    CASE WHEN identity.identity_count = 1 AND identity.email_confirmed THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'identity:global_admin'::text,
    'perfis.role = admin for the resolved identity'::text,
    profile.global_admin_count::text,
    CASE WHEN identity.identity_count = 1 AND profile.global_admin_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM identity
  CROSS JOIN profile
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'agency:target'::text,
    'absent or exactly AdalbaPro/adalbapro, active, owned by the resolved identity'::text,
    format('count=%s; name=%s; status=%s; owner_present=%s',
      target_agency.target_agency_count,
      coalesce(target_agency.agency_name, '<absent>'),
      coalesce(target_agency.agency_status, '<absent>'),
      (target_agency.agency_owner_user_id IS NOT NULL)::text),
    CASE
      WHEN target_agency.target_agency_count = 0 THEN 'PASS'
      WHEN target_agency.target_agency_count = 1
        AND target_agency.agency_name = params.target_agency_name
        AND target_agency.agency_status = 'active'
        AND target_agency.agency_owner_user_id = identity.actor_user_id THEN 'PASS'
      ELSE 'FAIL'
    END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM target_agency
  CROSS JOIN identity
  CROSS JOIN params

  UNION ALL
  SELECT
    'agency:name_collision'::text,
    '0 agencies with the target name under another slug'::text,
    name_conflicts.conflicting_name_count::text,
    CASE WHEN name_conflicts.conflicting_name_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM name_conflicts
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'membership:target'::text,
    'absent or exactly one active agency_admin membership'::text,
    format('count=%s; compatible=%s', target_membership.target_membership_count, target_membership.target_membership_compatible),
    CASE
      WHEN target_membership.target_membership_count = 0 THEN 'PASS'
      WHEN target_membership.target_membership_count = 1 AND target_membership.target_membership_compatible THEN 'PASS'
      ELSE 'FAIL'
    END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM target_membership
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'actor:other_operational_agency'::text,
    '0 active Agency owner or active membership outside the target'::text,
    operational_conflicts.other_operational_agency_count::text,
    CASE WHEN operational_conflicts.other_operational_agency_count = 0 THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM operational_conflicts
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'foundation:relations'::text,
    'all required relations present'::text,
    format('%s/%s present', relation_gate.relation_present, relation_gate.relation_total),
    CASE WHEN relation_gate.relation_present = relation_gate.relation_total THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM relation_gate
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'foundation:columns'::text,
    'all required canonical columns present'::text,
    format('%s/%s present', column_gate.column_present, column_gate.column_total),
    CASE WHEN column_gate.column_present = column_gate.column_total THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM column_gate
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'foundation:helpers'::text,
    'all canonical agency authorization helpers present'::text,
    format('%s/%s present', helper_gate.helper_present, helper_gate.helper_total),
    CASE WHEN helper_gate.helper_present = helper_gate.helper_total THEN 'PASS' ELSE 'FAIL' END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM helper_gate
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'scope:preexisting_data'::text,
    'record counts; this operation must not write these domains'::text,
    format('marcas=%s; brand_memberships=%s; agency_brands=%s; listas=%s; keywords=%s',
      scope_counts.marcas_count,
      scope_counts.brand_memberships_count,
      scope_counts.agency_brands_count,
      scope_counts.listas_count,
      scope_counts.keywords_count),
    'INFO'::text,
    identity.actor_user_id,
    target_agency.agency_id
  FROM scope_counts
  CROSS JOIN identity
  CROSS JOIN target_agency

  UNION ALL
  SELECT
    'bootstrap:ready'::text,
    'all required gates pass; no Brand/Minerador write is part of the operation'::text,
    format('identity=%s; confirmed=%s; admin=%s; target=%s; name_collision=%s; membership=%s; other_agencies=%s; relations=%s/%s; columns=%s/%s; helpers=%s/%s',
      identity.identity_count,
      identity.email_confirmed,
      profile.global_admin_count,
      target_agency.target_agency_count,
      name_conflicts.conflicting_name_count,
      target_membership.target_membership_count,
      operational_conflicts.other_operational_agency_count,
      relation_gate.relation_present,
      relation_gate.relation_total,
      column_gate.column_present,
      column_gate.column_total,
      helper_gate.helper_present,
      helper_gate.helper_total),
    CASE
      WHEN identity.identity_count = 1
        AND identity.email_confirmed
        AND profile.global_admin_count = 1
        AND name_conflicts.conflicting_name_count = 0
        AND operational_conflicts.other_operational_agency_count = 0
        AND relation_gate.relation_present = relation_gate.relation_total
        AND column_gate.column_present = column_gate.column_total
        AND helper_gate.helper_present = helper_gate.helper_total
        AND (
          target_agency.target_agency_count = 0
          OR (
            target_agency.target_agency_count = 1
            AND target_agency.agency_name = params.target_agency_name
            AND target_agency.agency_status = 'active'
            AND target_agency.agency_owner_user_id = identity.actor_user_id
          )
        )
        AND (
          target_membership.target_membership_count = 0
          OR (
            target_membership.target_membership_count = 1
            AND target_membership.target_membership_compatible
          )
        ) THEN 'PASS'
      ELSE 'FAIL'
    END,
    identity.actor_user_id,
    target_agency.agency_id
  FROM identity
  CROSS JOIN profile
  CROSS JOIN target_agency
  CROSS JOIN target_membership
  CROSS JOIN name_conflicts
  CROSS JOIN operational_conflicts
  CROSS JOIN relation_gate
  CROSS JOIN column_gate
  CROSS JOIN helper_gate
  CROSS JOIN params
)
SELECT
  checks.check_name,
  checks.expected,
  checks.observed,
  checks.verdict,
  checks.actor_user_id,
  checks.agency_id
FROM checks
ORDER BY checks.check_name;
