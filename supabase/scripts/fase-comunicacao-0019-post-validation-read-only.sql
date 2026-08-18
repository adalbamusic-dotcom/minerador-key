-- Central de Comunicacao / pos-validacao da 0019.
-- SOMENTE LEITURA. Nao imprime segredos, UUIDs, e-mails ou dados editoriais.

WITH catalog AS (
  SELECT
    to_regclass('public.platform_communication_config') IS NOT NULL AS config_table_present,
    to_regnamespace('vault') IS NOT NULL AS vault_schema_present,
    to_regclass('vault.decrypted_secrets') IS NOT NULL AS decrypted_view_present,
    EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'save_platform_communication_config' AND p.prokind = 'f') AS save_function_present,
    EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'platform_communication_secret' AND p.prokind = 'f') AS secret_function_present,
    EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'mark_platform_communication_validation' AND p.prokind = 'f') AS validation_function_present
), privileges AS (
  SELECT
    NOT has_table_privilege('anon', 'public.platform_communication_config', 'SELECT')
      AND NOT has_function_privilege('anon', 'public.platform_communication_secret()', 'EXECUTE') AS anon_secret_access_denied,
    NOT has_table_privilege('authenticated', 'public.platform_communication_config', 'SELECT')
      AND NOT has_function_privilege('authenticated', 'public.platform_communication_secret()', 'EXECUTE') AS authenticated_secret_access_denied,
    has_function_privilege('service_role', 'public.platform_communication_secret()', 'EXECUTE') AS service_role_secret_path_allowed,
    has_function_privilege('service_role', 'public.save_platform_communication_config(text,text,text,text,text)', 'EXECUTE') AS service_role_admin_path_allowed
), config AS (
  SELECT
    count(*)::bigint AS config_rows,
    count(*) FILTER (WHERE secret_ref IS NOT NULL)::bigint AS configured_secret_refs,
    count(*) FILTER (WHERE status = 'READY' AND validated_at IS NOT NULL)::bigint AS ready_rows,
    count(*) FILTER (WHERE status NOT IN ('DISABLED', 'NOT_CONFIGURED', 'VALIDATING', 'READY', 'ERROR'))::bigint AS invalid_status_rows
  FROM public.platform_communication_config
), plaintext AS (
  SELECT count(*)::bigint AS plaintext_secret_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'platform_communication_config'
    AND column_name ~* '(secret|password|api[_-]?key|credential|decrypted)'
    AND column_name <> 'secret_ref'
)
SELECT
  CASE WHEN c.config_table_present AND c.vault_schema_present AND c.decrypted_view_present AND c.save_function_present AND c.secret_function_present AND c.validation_function_present THEN 'OK' ELSE 'BLOCKED' END AS vault_contract,
  CASE WHEN cfg.config_rows = 1 AND cfg.invalid_status_rows = 0 THEN 'OK' ELSE 'BLOCKED' END AS communication_config_contract,
  CASE WHEN p.anon_secret_access_denied THEN 'DENIED' ELSE 'EXPOSED' END AS anon_secret_access,
  CASE WHEN p.authenticated_secret_access_denied THEN 'DENIED' ELSE 'EXPOSED' END AS authenticated_secret_access,
  plain.plaintext_secret_columns,
  CASE WHEN p.anon_secret_access_denied AND p.authenticated_secret_access_denied AND p.service_role_secret_path_allowed AND p.service_role_admin_path_allowed THEN 0 ELSE 1 END AS provider_config_secret_exposure,
  CASE WHEN p.service_role_admin_path_allowed THEN 'OK' ELSE 'BLOCKED' END AS admin_contract,
  CASE WHEN c.config_table_present AND cfg.config_rows = 1 AND cfg.invalid_status_rows = 0 AND p.anon_secret_access_denied AND p.authenticated_secret_access_denied AND p.service_role_secret_path_allowed AND p.service_role_admin_path_allowed AND plain.plaintext_secret_columns = 0 THEN 'READY' ELSE 'BLOCKED' END AS post_migration_status
FROM catalog c
CROSS JOIN privileges p
CROSS JOIN config cfg
CROSS JOIN plaintext plain;
