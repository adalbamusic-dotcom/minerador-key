-- 0026_public_default_acl_baseline.sql
-- DEFAULT ACL baseline for future application objects in public.
--
-- Scope is intentionally limited to objects CREATED BY postgres IN public.
-- This changes defaults only; it does not alter ownership, existing objects,
-- existing data, RLS, policies, or explicit ACLs.
--
-- Future migrations must grant the exact access required by each new object.
-- No default privileges for types are changed here.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
