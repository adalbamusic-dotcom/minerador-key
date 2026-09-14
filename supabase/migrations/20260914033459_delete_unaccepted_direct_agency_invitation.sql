-- Admin-only, transactional purge of a direct invitation that was never accepted.
-- Apply manually only after reviewing a database backup/snapshot.
BEGIN;

CREATE FUNCTION public.delete_unaccepted_direct_agency_invitation(p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation public.agency_invitations%ROWTYPE;
BEGIN
  IF p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'AGENCY_INVITATION_DELETE_INVALID_ID';
  END IF;

  SELECT * INTO invitation
    FROM public.agency_invitations
   WHERE id = p_invitation_id
   FOR UPDATE;
  IF NOT FOUND OR invitation.source <> 'ADMIN_INVITE' OR invitation.application_id IS NOT NULL THEN
    RAISE EXCEPTION 'AGENCY_INVITATION_DELETE_UNAVAILABLE';
  END IF;
  IF invitation.status = 'ACCEPTED' OR invitation.accepted_at IS NOT NULL
     OR invitation.accepted_by_actor_user_id IS NOT NULL OR invitation.agency_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.agency_onboardings WHERE invitation_id = p_invitation_id)
     OR EXISTS (SELECT 1 FROM public.agency_access_periods WHERE source_invitation_id = p_invitation_id)
     OR EXISTS (SELECT 1 FROM public.agency_invitation_token_generations WHERE invitation_id = p_invitation_id AND used_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'AGENCY_INVITATION_DELETE_ACCEPTED';
  END IF;

  -- Serialize with dispatcher claims. Never purge a message actively sending.
  PERFORM 1 FROM public.communication_messages
   WHERE agency_invitation_id = p_invitation_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.communication_messages
     WHERE agency_invitation_id = p_invitation_id
       AND (status = 'SENDING' OR message_type <> 'AGENCY_INVITATION')
  ) THEN
    RAISE EXCEPTION 'AGENCY_INVITATION_DELETE_MESSAGE_BUSY';
  END IF;

  DELETE FROM public.communication_delivery_events AS event
   USING public.communication_messages AS message
   WHERE event.communication_message_id = message.id
     AND message.agency_invitation_id = p_invitation_id;
  DELETE FROM public.communication_messages
   WHERE agency_invitation_id = p_invitation_id;
  DELETE FROM public.agency_invitation_token_generations
   WHERE invitation_id = p_invitation_id;
  DELETE FROM public.agency_invitations
   WHERE id = p_invitation_id;

  IF FOUND THEN RETURN true; END IF;
  RAISE EXCEPTION 'AGENCY_INVITATION_DELETE_FAILED';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_unaccepted_direct_agency_invitation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_unaccepted_direct_agency_invitation(uuid) TO service_role;

COMMIT;
