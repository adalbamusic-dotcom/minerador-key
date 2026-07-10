# Minerador Chrome extension configuration

## Local configuration

Copy the fake example and fill the public values for the intended environment:

```powershell
Copy-Item .\minerador-extensao\config.example.js .\minerador-extensao\config.local.js
```

`config.local.js` is ignored by Git and is loaded by both the popup and the
background service worker. It centralizes:

- `PANEL_URL`;
- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`.

The anon key is public by Supabase design, but access still depends on verified
RLS policies. Never place Service Role or a user password in extension files.

The manifest uses `https://*.supabase.co/*` because Chrome host permissions are
static and cannot interpolate the local configuration. Review this permission
before publishing the extension.

## Open schema question: `keywords_kgr.marca_id`

The insert payload still conditionally sends `marca_id`, preserving the current
mining flow exactly as required by Sprint 0. The last historical report said the
column did not exist, while newer extension code assumes it does. Run the
read-only structural audit in `docs/SUPABASE_BASELINE.md` before changing this
payload. Do not remove or add the field based only on TypeScript or old notes.
