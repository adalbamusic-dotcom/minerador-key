-- Hardening sucessor da ACL das sete tabelas criadas pela 0024.
-- Não cria objetos, não altera ownership, não altera default ACL e não toca dados.
-- Aplicação remota manual somente após o preflight read-only da 0025.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  missing_tables text;
BEGIN
  SELECT string_agg(table_name, ', ' ORDER BY table_name)
  INTO missing_tables
  FROM (VALUES
    ('integration_providers'),
    ('integration_capabilities'),
    ('integration_connections'),
    ('integration_grants'),
    ('integration_bindings'),
    ('integration_quota_policies'),
    ('integration_usage_events')
  ) AS expected(table_name)
  WHERE to_regclass('public.' || table_name) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'INTEGRATIONS_0025_PREREQUISITE_MISSING: %', missing_tables;
  END IF;
END $$;

-- Remove grants diretos amplos sem depender da ACL deixada pela 0024,
-- de default ACL ou de privilégios públicos já existentes.
REVOKE ALL PRIVILEGES ON TABLE
  public.integration_providers,
  public.integration_capabilities,
  public.integration_connections,
  public.integration_grants,
  public.integration_bindings,
  public.integration_quota_policies,
  public.integration_usage_events
FROM service_role;

-- Reafirma o contrato privado dos clientes e preserva authenticated como
-- consumidor somente de leitura sob RLS.
REVOKE ALL PRIVILEGES ON TABLE
  public.integration_providers,
  public.integration_capabilities,
  public.integration_connections,
  public.integration_grants,
  public.integration_bindings,
  public.integration_quota_policies,
  public.integration_usage_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.integration_providers,
  public.integration_capabilities,
  public.integration_connections,
  public.integration_grants,
  public.integration_bindings,
  public.integration_quota_policies,
  public.integration_usage_events
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.integration_providers,
  public.integration_capabilities,
  public.integration_connections,
  public.integration_grants,
  public.integration_bindings,
  public.integration_quota_policies
TO service_role;

GRANT SELECT, INSERT ON TABLE public.integration_usage_events TO service_role;

-- DEFAULT_ACL_GLOBAL_POLICY_REQUIRED permanece como dívida separada.
-- Esta migration não executa ALTER DEFAULT PRIVILEGES.

COMMIT;
