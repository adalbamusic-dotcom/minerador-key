-- ROLLBACK DE EMERGENCIA. DESTRUTIVO. NAO EXECUTADO PELO CODEX.
-- Exportar e confirmar todos os dados antes de qualquer uso.
DROP TABLE IF EXISTS public.publication_records;
DROP TABLE IF EXISTS public.content_document_comments;
DROP TABLE IF EXISTS public.content_document_user_states;
DROP TABLE IF EXISTS public.content_document_versions;
DROP TABLE IF EXISTS public.content_documents;
DROP TABLE IF EXISTS public.editorial_decision_events;
DROP TABLE IF EXISTS public.editorial_workflow_items;
DROP TABLE IF EXISTS public.editorial_version_status_events;
DROP TABLE IF EXISTS public.editorial_artifact_versions;
DROP TABLE IF EXISTS public.editorial_saved_views;
DROP TABLE IF EXISTS public.delegated_access_permissions;
DROP TABLE IF EXISTS public.delegated_access_grants;
DROP TABLE IF EXISTS public.brand_member_permissions;
DROP TABLE IF EXISTS public.brand_memberships;
DROP TABLE IF EXISTS public.brand_invitation_permissions;
DROP TABLE IF EXISTS public.brand_invitations;
DROP TABLE IF EXISTS public.brand_role_permissions;
DROP TABLE IF EXISTS public.brand_roles;
DROP FUNCTION IF EXISTS public.editorial_stage_module(text);
DROP FUNCTION IF EXISTS public.editorial_artifact_module(text);
DROP FUNCTION IF EXISTS public.editorial_has_permission(uuid,text,text);
DROP FUNCTION IF EXISTS public.editorial_current_user_key();
DROP FUNCTION IF EXISTS public.editorial_protect_append_only();
DROP FUNCTION IF EXISTS public.editorial_touch_lock_version();
DROP FUNCTION IF EXISTS public.editorial_touch_updated_at();
