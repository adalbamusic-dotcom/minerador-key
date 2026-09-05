-- SDD: PROFILE_AVATAR_REMOTE_PERSISTENCE
-- Local preparation only. Apply remotely only through the approved migration gate.
-- Canonical reference remains auth.users.user_metadata.avatar_url.

BEGIN;

DO $$
DECLARE
  existing_public boolean;
  existing_file_size_limit bigint;
  existing_allowed_mime_types text[];
  expected_mime_types text[] := ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];
BEGIN
  SELECT public, file_size_limit, allowed_mime_types
    INTO existing_public, existing_file_size_limit, existing_allowed_mime_types
    FROM storage.buckets
   WHERE id = 'profile-avatars';

  IF FOUND THEN
    IF existing_public IS DISTINCT FROM true
       OR existing_file_size_limit IS DISTINCT FROM 5242880
       OR existing_allowed_mime_types IS DISTINCT FROM expected_mime_types THEN
      RAISE EXCEPTION 'profile-avatars bucket exists with an incompatible contract';
    END IF;
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('profile-avatars', 'profile-avatars', true, 5242880, expected_mime_types);
  END IF;
END
$$;

DROP POLICY IF EXISTS profile_avatars_select_own ON storage.objects;
CREATE POLICY profile_avatars_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND name = ((SELECT auth.uid())::text || '/avatar.webp')
  );

DROP POLICY IF EXISTS profile_avatars_insert_own ON storage.objects;
CREATE POLICY profile_avatars_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND name = ((SELECT auth.uid())::text || '/avatar.webp')
  );

DROP POLICY IF EXISTS profile_avatars_update_own ON storage.objects;
CREATE POLICY profile_avatars_update_own
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND name = ((SELECT auth.uid())::text || '/avatar.webp')
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND name = ((SELECT auth.uid())::text || '/avatar.webp')
  );

DROP POLICY IF EXISTS profile_avatars_delete_own ON storage.objects;
CREATE POLICY profile_avatars_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND name = ((SELECT auth.uid())::text || '/avatar.webp')
  );

COMMIT;
