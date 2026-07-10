# Security baseline — Sprint 0

## Credential containment

The Sprint 0 scan found an administrative password embedded in diagnostic
scripts under `docs/scratch`. The hard-coded value was removed. The responsible
administrator must rotate that password manually in Supabase/Auth; this
repository does not attempt provider-side rotation.

Other containment actions:

- `.env.example` now contains fake examples only.
- `.env*` remains ignored, with an explicit exception only for `.env.example`.
- The extension's real runtime configuration belongs in
  `minerador-extensao/config.local.js`, which is ignored by Git.
- The versioned extension example contains only fake values.
- Service Role, provider API keys and test credentials are read from environment
  variables and must never be copied into scripts or documentation.
- Real database tests and write-capable scratch scripts require
  `ALLOW_REAL_DB_TESTS=true`.

## Manual rotation required

1. Rotate the exposed administrative password in the identity provider.
2. Invalidate active sessions for that account if the provider supports it.
3. Review Supabase Auth and API logs for unexpected access.
4. If any of the scratch files were ever pushed, treat Git history and forks as
   containing the old credential even after the working tree is cleaned.
5. Consider rotating Service Role and other provider keys if repository history
   or previous distribution cannot be established.

## Safe scan procedure

The following command prints file names only, not matching secret values:

```powershell
rg -l -i "password|service.role|api.key|authorization|bearer|cookie|eyJ" `
  -g "!node_modules/**" -g "!.next/**" -g "!.env.local" .
```

Every hit must be classified as one of:

- environment-variable reference;
- fake example;
- public configuration intentionally shipped to a browser/extension;
- credential requiring removal and rotation.

Do not paste matching lines into tickets, reports or terminal transcripts.

## Remaining trust boundaries

- A Supabase anon key is public by design, but its safety depends on correct RLS.
- Service Role bypasses RLS and must remain server-only.
- The extension uses a Supabase user token; schema and RLS must be confirmed
  before changing its insert contract.
- `GET /api/marcas` now rejects clients without a linked brand before starting
  an unfiltered Service Role query.
