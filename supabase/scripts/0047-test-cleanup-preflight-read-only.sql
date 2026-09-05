-- Read-only allowlist preflight for the current homologation cleanup.
-- No text-only target and no mutation.
SELECT public.lifecycle_preview_minerador_keywords(
  '09762023-d0d4-4c24-b34e-d0fdfd43f891'::uuid,
  ARRAY[
    '1d42a051-d574-4a7e-a916-98faa4393792'::uuid,
    'e1eef13a-cdfb-4cb8-a91e-764cc14b7dfb'::uuid,
    'f08f3a56-3e1b-43dd-82fb-cfc29b1c3432'::uuid
  ],
  'd67ebbad-a590-45f8-8bb5-a19c6241ac1b'::uuid
) AS allowlisted_lifecycle_impact;

