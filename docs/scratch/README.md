# Scratch script classification

These scripts are not part of the production runtime. Never run them against an
unknown Supabase project.

| Directory / script | Classification | Behavior |
|---|---|---|
| `read-only/check-columns.js` | Read-only | Reads PostgREST OpenAPI metadata |
| `read-only/query-keywords.js` | Read-only | Reads a keyword sample |
| `read-only/inspect-briefings.js` | Read-only | Reads one briefing sample |
| `write-controlled/insert-diagnostic-list.real-db.js` | Controlled write | Inserts a diagnostic list |
| `write-controlled/test-supabase-insert.real-db.js` | Controlled write | Inserts a diagnostic keyword |
| `write-controlled/probe-briefing-columns.real-db.js` | Controlled write | Uses an invalid POST only if OpenAPI lacks the definition |
| `destructive/create-user.real-db.js` | Destructive/admin | Creates an Auth user with Service Role |
| `destructive/mark-keyword-published.real-db.js` | Destructive | Changes the status of an existing keyword |
| `legacy/test-login.real-auth.js` | Legacy | Exercises a real login and is not in the test pipeline |
| `legacy/test-external-apis.js` | Legacy | Calls a billable/limited external API |
| `tests/run-all.js` | Destructive regression suite | Sends PATCH and DELETE to the configured Supabase project |

Every script classified as controlled write or destructive exits successfully
without network access unless `ALLOW_REAL_DB_TESTS=true` is explicitly set.
The 13 regression checks in `tests/run-all.js` retain their original assertions;
Sprint 0 only added the opt-in gate.

Credentials are supplied through `.env.local` or the process environment. No
script should contain an account password, Service Role value, anon key value or
provider API key value.
