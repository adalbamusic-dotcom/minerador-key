# Sprint 0 — Containment and baseline report

Date: 2026-07-10

## Outcome

Sprint 0 containment is implemented in the working tree. No schema, data, RLS,
policy, function or trigger change was applied to Supabase. Sprint 1 work was
not started.

## Files changed or created

- Security/configuration: `.env.example`, `.gitignore`, local-only `.env.local`.
- Authorization: `app/api/marcas/route.ts`, `lib/server/authz.ts`,
  `lib/server/marcas-access.mjs`, `lib/server/marcas-access.d.mts`.
- Tests: `package.json`, `tests/run-all.js`, `tests/marcas-access.test.mjs`.
- Extension: `manifest.json`, `popup.html`, `popup.js`, `background.js`,
  `config.example.js`, local-only `config.local.js`, `README.md`.
- Supabase baseline: `supabase/scripts/*.ps1`,
  `supabase/scripts/verify-structural-divergences.sql`,
  `supabase/baseline/README.md`.
- Documentation: `SECURITY_BASELINE.md`, `SUPABASE_BASELINE.md`,
  `GIT_RECOVERY.md`, this report and `docs/scratch/README.md`.
- Scratch scripts were classified and moved under `read-only/`,
  `write-controlled/`, `destructive/` and `legacy/`.

## Problems found

1. An administrative password was present in multiple scratch scripts.
2. A real Supabase anon key and project URL were duplicated in extension files.
3. Database tests ran against the configured real project without an explicit
   opt-in gate.
4. `.git` exists but is empty: no HEAD, config, objects or remotes are recoverable
   from this directory.
5. `GET /api/marcas` could leave a Service Role query unfiltered for an
   authenticated user without a valid profile/brand link.
6. The extension used `innerHTML` with brand and silo names returned by the database.
7. The local machine has no `pg_dump`, `psql`, Supabase CLI or Docker, so the
   live database baseline could not be captured in this sprint.
8. The current database remains the source of truth for unresolved differences,
   especially `keywords_kgr.marca_id`, published slug/canonical columns, RLS and
   installed triggers.

## Changes made

- Removed real credentials from versionable scripts and moved all configuration
  to environment variables or an ignored local extension config.
- Added manual password-rotation instructions.
- Added `ALLOW_REAL_DB_TESTS=true` gates without changing the 13 established
  regression assertions.
- Added a reproducible schema-only export and a read-only structural audit.
- Corrected brand listing scopes: admin gets all; client gets the linked brand;
  missing/invalid profile gets 403; missing session gets 401.
- Replaced database-driven `innerHTML` with DOM options using `textContent`.
- Preserved the extension insert contract, including conditional `marca_id`,
  pending confirmation from the real schema.

## Validation executed

- `npm test`: four isolated authorization tests passed; the real Supabase suite
  was skipped by default with a clear message.
- `npx tsc --noEmit --incremental false`: passed.
- Targeted ESLint for authorization files: passed.
- Node syntax checks for touched JavaScript/MJS files: passed.
- PowerShell parser checks for baseline scripts: passed.
- Extension scan: no `innerHTML`, embedded JWT-like key or project-specific
  Supabase URL remains in versionable extension files.
- Production build: passed on Next.js 16.2.9; all 17 app routes were generated.
- Full repository lint still reports 100 errors and 23 warnings in untouched
  legacy/application files, predominantly explicit `any` usage.

No dangerous scratch script and no live database test was executed.

## Manual actions remaining

1. Rotate the exposed administrative password and invalidate old sessions.
2. Recover the authoritative Git remote/history; do not initialize a parallel
   history unless the owner confirms that no prior repository exists.
3. Install PostgreSQL client tools and run the schema export plus read-only audit.
4. Review the resulting dump/report for RLS, policies, grants and migration 0001
   trigger installation.
5. Confirm `keywords_kgr.marca_id` before changing the extension insert payload.
6. Run the 13 real-database tests only in an explicitly selected non-production
   environment with `ALLOW_REAL_DB_TESTS=true`.

## Open risks

- The real database schema and current data divergences are still unverified.
- RLS safety cannot be asserted from this repository because policies are not
  represented by migrations.
- Other server routes still use Service Role/anon fallback patterns outside the
  narrowly authorized Sprint 0 fix.
- The extension manifest uses a wildcard Supabase host permission because MV3
  permissions cannot interpolate local config.
- Existing full-project lint debt and dependency audit findings remain.

## Sprint 1 recommendation

Start Sprint 1 only after credential rotation, Git-history recovery and review
of a real schema baseline/audit. If any of those three items is incomplete, the
safe recommendation is to keep Sprint 1 blocked rather than design migrations
from TypeScript assumptions.
