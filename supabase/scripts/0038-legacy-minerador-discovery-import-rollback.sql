/*
  0038 technical rollback template — LOCAL / MANUAL ONLY.

  Dropping the unused RPC is intentionally irreversible unless its exact
  pre-drop definition is restored. The preflight emits
  PRECHECK_TARGET_FUNCTION_DEFINITION. Before any rollback, paste that exact
  pg_get_functiondef output below, review it against the preflight owner,
  security mode, search_path and ACL, and only then execute manually.

  Restoring this RPC reopens the previously confirmed actor-spoofing risk.
  This artifact is not an automatic rollback and must not be used as a
  substitute for hardening or for a new security decision.
*/

-- BEGIN MANUAL RESTORE BLOCK
-- Paste the exact PRECHECK_TARGET_FUNCTION_DEFINITION here, then review it.
-- CREATE OR REPLACE FUNCTION public.import_minerador_discovery_candidates(...)
-- ... exact definition captured from the preflight ...

-- Restore only the ACL observed in the successful preflight, after review.
-- Example historical ACL (do not assume it is current):
-- REVOKE ALL PRIVILEGES ON FUNCTION public.import_minerador_discovery_candidates(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.import_minerador_discovery_candidates(uuid, uuid, uuid, uuid[]) TO authenticated, service_role;
-- END MANUAL RESTORE BLOCK
