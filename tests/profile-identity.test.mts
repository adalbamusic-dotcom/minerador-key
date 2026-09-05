import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Perfil usa o contrato Auth existente para salvar e confirmar o nome", async () => {
  const editor = await read("modules/conta/profile-identity-editor.tsx");
  const session = await read("components/auth/supabase-session-context.tsx");
  const page = await read("modules/conta/personal-account-page.tsx");

  assert.match(editor, /auth\.updateUser\(\{ data: \{ full_name: normalizedName \} \}\)/);
  assert.match(editor, /auth\.getUser\(\)/);
  assert.match(editor, /PROFILE_NAME_PERSISTED/);
  assert.match(session, /metadata\.display_name/);
  assert.match(page, /ProfileIdentityEditor/);
  assert.match(editor, /E-mail de acesso/);
  assert.doesNotMatch(editor, /email.*updateUser|changeEmail|alterar.*e-mail/i);
});

test("Avatar é validado, recortado e persistido pelo contrato remoto aprovado", async () => {
  const editor = await read("modules/conta/profile-identity-editor.tsx");
  const migration = await read("supabase/migrations/0045_profile_avatar_storage.sql");
  const sdd = await read("docs/09-conta/sdd-perfil-avatar-persistencia.md");

  assert.match(editor, /image\/jpeg,image\/png,image\/webp/);
  assert.match(editor, /image\/webp/);
  assert.match(editor, /AVATAR_OUTPUT_SIZE = 256/);
  assert.match(editor, /AVATAR_BUCKET = "profile-avatars"/);
  assert.match(editor, /storage\.from\(AVATAR_BUCKET\)\.upload/);
  assert.match(editor, /auth\.updateUser\(\{ data: \{ avatar_url: avatarUrl \} \}\)/);
  assert.match(editor, /storageReadbackError/);
  assert.match(editor, /PROFILE_AVATAR_PERSISTED/);
  assert.doesNotMatch(editor, /base64|service_role/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /name = \(\(SELECT auth\.uid\(\)\)::text \|\| '\/avatar\.webp'\)/);
  assert.match(sdd, /APPROVED_LOCAL_PREPARATION/);
  assert.match(sdd, /auth\.users\.user_metadata\.avatar_url/);
});

test("Avatar confirmado usa o mesmo contexto de identidade da Topbar", async () => {
  const session = await read("components/auth/supabase-session-context.tsx");
  const topbar = await read("components/global-topbar.tsx");
  const editor = await read("modules/conta/profile-identity-editor.tsx");

  assert.match(session, /setPresentationOverride/);
  assert.match(editor, /setPresentationOverride\(\{ image: avatarUrl \}\)/);
  assert.match(topbar, /useSupabaseSession\(\)/);
  assert.match(topbar, /session\.user\.image/);
});
