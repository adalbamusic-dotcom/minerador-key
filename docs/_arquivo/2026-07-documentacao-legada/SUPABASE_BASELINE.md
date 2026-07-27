# Supabase baseline procedure

## Purpose

Capture the real `public` schema without changing the database. The database,
not TypeScript interfaces, is the source of truth. A schema-only `pg_dump`
includes tables, columns, types, primary and foreign keys, indexes, functions,
triggers, RLS definitions, policies and grants.

## Current local state

At the Sprint 0 checkpoint, `pg_dump`, `psql`, Supabase CLI and Docker were not
available on this machine, and there was no `supabase/config.toml`. No live
schema was exported and no database change was attempted.

## Prerequisites

1. Install PostgreSQL client tools containing `pg_dump` and `psql`.
2. In Supabase, obtain a read-capable database connection from the responsible
   administrator. Prefer a dedicated temporary read-only database role.
3. Set connection values only in the current PowerShell session. Never save the
   database password in this repository:

```powershell
$env:PGHOST='<database-host>'
$env:PGPORT='5432'
$env:PGDATABASE='postgres'
$env:PGUSER='<read-only-user>'
$env:PGPASSWORD='<temporary-password>'
$env:PGSSLMODE='require'
```

## Export the real schema

```powershell
.\supabase\scripts\export-schema.ps1
```

The script calls `pg_dump --schema-only` for `public` and creates a timestamped
file in `supabase/baseline/`. It does not issue DDL or DML against Supabase.

## Run the structural divergence audit

```powershell
.\supabase\scripts\run-structural-audit.ps1
```

The SQL starts with `BEGIN TRANSACTION READ ONLY`, generates a timestamped text
report and does not repair data. If `psql` is unavailable, copy
`supabase/scripts/verify-structural-divergences.sql` into the Supabase SQL
Editor and run it manually.

## Review checklist before versioning a dump

- Confirm that it contains schema only and no table rows.
- Confirm that no connection string, password, token or cookie appears.
- Confirm presence of PKs, FKs, indexes, functions, triggers, RLS, policies and grants.
- Compare the installed `protect_*` functions/triggers with migration `0001`.
- Store the execution date and Supabase project/environment name outside secrets.

After execution, clear the session credentials:

```powershell
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
```
