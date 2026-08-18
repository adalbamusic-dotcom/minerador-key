-- Preflight read-only antes de qualquer hardening posterior a 0020.
-- Nao corrige dados, nao altera ACLs e nao executa migration.
-- Saida sanitizada: somente contagens e metadados de catalogo.

WITH token_counts AS (
  SELECT
    count(*)::text AS total,
    count(*) FILTER (WHERE used_at IS NOT NULL AND revoked_at IS NOT NULL)::text AS used_and_revoked,
    count(*) FILTER (WHERE used_at IS NOT NULL AND revoked_at IS NULL)::text AS used_only,
    count(*) FILTER (WHERE used_at IS NULL AND revoked_at IS NOT NULL)::text AS revoked_only,
    count(*) FILTER (WHERE used_at IS NULL AND revoked_at IS NULL)::text AS neither
  FROM public.agency_invitation_token_generations
),
constraint_state AS (
  SELECT count(*) FILTER (
    WHERE regexp_replace(lower(pg_get_constraintdef(oid, true)), '[^a-z0-9]+', '', 'g')
      LIKE '%usedatisnullorrevokedatisnull%'
  )::text AS used_revoked_check_count
  FROM pg_constraint
  WHERE conrelid = to_regclass('public.agency_invitation_token_generations')
),
function_state AS (
  SELECT
    (to_regprocedure('public.create_agency_invitation_token_generation(uuid,text)') IS NOT NULL)::text AS create_present,
    (to_regprocedure('public.revoke_agency_invitation_token_generations(uuid)') IS NOT NULL)::text AS revoke_present,
    (to_regprocedure('public.complete_agency_onboarding_with_token(uuid,uuid,uuid,text,text)') IS NOT NULL)::text AS onboarding_present
),
rows AS (
  SELECT 'token_generations_total'::text AS check_name, 'metadata only'::text AS expected, total AS observed, 'INFO'::text AS verdict FROM token_counts
  UNION ALL
  SELECT 'token_generations_with_used_and_revoked', '0', used_and_revoked, CASE WHEN used_and_revoked = '0' THEN 'PASS' ELSE 'FAIL' END FROM token_counts
  UNION ALL
  SELECT 'token_generations_with_used_only', 'metadata only', used_only, 'INFO' FROM token_counts
  UNION ALL
  SELECT 'token_generations_with_revoked_only', 'metadata only', revoked_only, 'INFO' FROM token_counts
  UNION ALL
  SELECT 'token_generations_with_neither_used_nor_revoked', 'metadata only', neither, 'INFO' FROM token_counts
  UNION ALL
  SELECT 'token_check_used_revoked_in_catalog', '1', used_revoked_check_count,
    CASE WHEN used_revoked_check_count = '1' THEN 'PASS' ELSE 'FAIL' END
  FROM constraint_state
  UNION ALL
  SELECT 'function:create_agency_invitation_token_generation', 'present', create_present,
    CASE WHEN create_present = 'true' THEN 'PASS' ELSE 'FAIL' END FROM function_state
  UNION ALL
  SELECT 'function:revoke_agency_invitation_token_generations', 'present', revoke_present,
    CASE WHEN revoke_present = 'true' THEN 'PASS' ELSE 'FAIL' END FROM function_state
  UNION ALL
  SELECT 'function:complete_agency_onboarding_with_token', 'present', onboarding_present,
    CASE WHEN onboarding_present = 'true' THEN 'PASS' ELSE 'FAIL' END FROM function_state
)
SELECT check_name, expected, observed, verdict
FROM rows
ORDER BY check_name;
