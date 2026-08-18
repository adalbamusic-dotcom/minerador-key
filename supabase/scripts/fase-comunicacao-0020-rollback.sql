-- 0020 schema rollback. MANUAL ONLY, after snapshot and dry-run review.
-- Operational rollback (stop dispatcher/config) is distinct and should happen
-- before this schema rollback. This guard never removes invitations, agencies,
-- Auth identities, provider records, Vault material, or remote messages.
BEGIN;

DO $$
DECLARE
  template_rows bigint := 0;
  message_rows bigint := 0;
  delivery_event_rows bigint := 0;
  token_generation_rows bigint := 0;
BEGIN
  IF to_regclass('public.communication_templates') IS NULL
     OR to_regclass('public.communication_messages') IS NULL
     OR to_regclass('public.communication_delivery_events') IS NULL
     OR to_regclass('public.agency_invitation_token_generations') IS NULL THEN
    RAISE EXCEPTION 'COMMUNICATION_0020_ROLLBACK_BLOCKED_SCHEMA_NOT_PRESENT';
  END IF;
  SELECT count(*) INTO template_rows FROM public.communication_templates;
  SELECT count(*) INTO message_rows FROM public.communication_messages;
  SELECT count(*) INTO delivery_event_rows FROM public.communication_delivery_events;
  SELECT count(*) INTO token_generation_rows FROM public.agency_invitation_token_generations;
  IF template_rows + message_rows + delivery_event_rows + token_generation_rows > 0 THEN
    RAISE EXCEPTION 'COMMUNICATION_0020_ROLLBACK_BLOCKED_DATA_PRESENT';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.complete_agency_onboarding_with_token(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.revoke_agency_invitation_token_generations(uuid);
DROP FUNCTION IF EXISTS public.create_agency_invitation_token_generation(uuid, text);
DROP FUNCTION IF EXISTS public.record_communication_delivery_event(uuid, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.complete_communication_message(uuid, text, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.claim_communication_message(uuid);
DROP FUNCTION IF EXISTS public.enqueue_communication_message(text, text, integer, text, jsonb, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.communication_dispatch_lease_seconds();

DROP TABLE public.communication_delivery_events;
DROP TABLE public.communication_messages;
DROP TABLE public.communication_templates;
DROP TABLE public.agency_invitation_token_generations;

ALTER TABLE public.agency_invitations
  DROP CONSTRAINT IF EXISTS agency_invitations_communication_generation_0020;
ALTER TABLE public.agency_invitations
  DROP COLUMN IF EXISTS communication_generation;

COMMIT;
