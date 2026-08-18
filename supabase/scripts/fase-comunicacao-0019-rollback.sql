-- Rollback local/documental da 0019. Executar somente com autorizacao,
-- snapshot e revisao humana. Nao remove segredo do Vault automaticamente.
BEGIN;
DROP FUNCTION IF EXISTS public.save_platform_communication_config(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.platform_communication_secret();
DROP FUNCTION IF EXISTS public.mark_platform_communication_validation(text, text);
REVOKE ALL ON TABLE public.platform_communication_config FROM PUBLIC, anon, authenticated, service_role;
DROP TABLE IF EXISTS public.platform_communication_config;
COMMIT;
