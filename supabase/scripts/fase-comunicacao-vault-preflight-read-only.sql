-- Central de Comunicacao / Supabase Vault
-- SOMENTE LEITURA. Nao aplicar migration, nao criar segredo e nao imprimir valores.
-- Execute manualmente no SQL Editor apenas quando a auditoria remota for autorizada.

WITH vault_catalog AS (
  SELECT
    (to_regnamespace('vault') IS NOT NULL) AS vault_schema_present,
    (
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_extension e
        WHERE e.extname IN ('supabase_vault', 'vault')
      )
      OR to_regnamespace('vault') IS NOT NULL
    ) AS vault_extension_available,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'vault' AND p.proname = 'create_secret'
    ) AS vault_create_secret_available,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'vault' AND p.proname = 'update_secret'
    ) AS vault_update_secret_available,
    (to_regclass('vault.decrypted_secrets') IS NOT NULL) AS vault_decrypted_view_present
), privileges AS (
  SELECT
    CASE
      WHEN NOT v.vault_schema_present THEN 'NOT_AVAILABLE'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'vault'
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
      ) OR has_schema_privilege('anon', 'vault', 'USAGE')
      THEN 'EXPOSED'
      ELSE 'DENIED'
    END AS anon_vault_access,
    CASE
      WHEN NOT v.vault_schema_present THEN 'NOT_AVAILABLE'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'vault'
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ) OR has_schema_privilege('authenticated', 'vault', 'USAGE')
      THEN 'EXPOSED'
      ELSE 'DENIED'
    END AS authenticated_vault_access,
    CASE
      WHEN NOT v.vault_schema_present THEN 'NOT_AVAILABLE'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'vault'
          AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      ) THEN 'ALLOWED'
      ELSE 'NOT_CONFIRMED'
    END AS service_role_vault_access
  FROM vault_catalog v
), dependency_audit AS (
  SELECT
    (
      SELECT count(*)
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name ~* '(secret|password|api[_-]?key|credential|decrypted)'
    )::bigint AS plaintext_secret_columns,
    (
      SELECT count(*)
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) ~* '(vault\.decrypted_secrets|secret_ref|resend_api_key)'
    )::bigint AS existing_secret_references,
    (
      SELECT count(*)
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND c.relname ~* '(communication|email_provider|provider_config|outbox)'
    )::bigint AS existing_communication_objects
)
SELECT
  CASE WHEN v.vault_extension_available THEN 'AVAILABLE' ELSE 'MISSING_OR_UNCONFIRMED' END AS vault_extension_available,
  CASE WHEN v.vault_schema_present THEN 'PRESENT' ELSE 'MISSING' END AS vault_schema_present,
  CASE WHEN v.vault_create_secret_available THEN 'AVAILABLE' ELSE 'MISSING' END AS vault_create_secret_available,
  CASE WHEN v.vault_update_secret_available THEN 'AVAILABLE' ELSE 'MISSING' END AS vault_update_secret_available,
  CASE WHEN v.vault_decrypted_view_present THEN 'PRESENT' ELSE 'MISSING' END AS vault_decrypted_view_present,
  p.anon_vault_access,
  p.authenticated_vault_access,
  p.service_role_vault_access,
  CASE WHEN r.existing_communication_objects = 0 THEN 'NONE_FOUND' ELSE 'REVIEW_REQUIRED' END AS existing_communication_config,
  r.existing_secret_references,
  r.plaintext_secret_columns,
  CASE
    WHEN r.existing_secret_references = 0 AND r.plaintext_secret_columns = 0 THEN 0
    ELSE r.existing_secret_references + r.plaintext_secret_columns
  END AS unexpected_dependencies,
  CASE
    WHEN v.vault_extension_available
      AND v.vault_schema_present
      AND v.vault_create_secret_available
      AND v.vault_update_secret_available
      AND v.vault_decrypted_view_present
      AND p.anon_vault_access = 'DENIED'
      AND p.authenticated_vault_access = 'DENIED'
      AND p.service_role_vault_access = 'ALLOWED'
      AND r.existing_secret_references = 0
      AND r.plaintext_secret_columns = 0
      AND r.existing_communication_objects = 0
    THEN 'READY_FOR_COMMUNICATION_SCHEMA_REVIEW'
    ELSE 'BLOCKED_REMOTE_VAULT_GATE'
  END AS preflight_status
FROM vault_catalog v
CROSS JOIN privileges p
CROSS JOIN dependency_audit r;
