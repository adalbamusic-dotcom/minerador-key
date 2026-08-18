import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MANUAL_PASSWORD_MIN_LENGTH,
  mapManualSignupError,
  parseManualSignupInput,
  signupCreatedUser,
} from "../lib/auth/manual-auth.ts";
import { provisionBrandWithOwner } from "../lib/server/brand-provisioning.ts";
import { searchAuthUsers } from "../lib/server/auth-users.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("cadastro manual valida senha, confirmação e e-mail sem criar dados tenantizados", async () => {
  const input = parseManualSignupInput({ name: "Owner Novo", email: "owner@example.com", password: "senha-123", passwordConfirmation: "senha-123" });
  assert.equal(input.email, "owner@example.com");
  assert.equal(MANUAL_PASSWORD_MIN_LENGTH, 6);
  assert.throws(() => parseManualSignupInput({ ...input, passwordConfirmation: "outra" }));
  const route = await read("app/api/auth/signup/route.ts");
  assert.doesNotMatch(route, /brand_memberships|marcas|listas_kgr|perfis/);
  assert.match(route, /auth\/v1\/signup/);
});

test("cadastro trata e-mail duplicado sem expor segredo", () => {
  assert.match(mapManualSignupError(422, { msg: "User already registered" }), /já está cadastrado/);
  assert.equal(signupCreatedUser({ user: { id: "user-1", identities: [] } }), false);
  assert.equal(signupCreatedUser({ user: { id: "user-1", identities: [{}] } }), true);
});

test("Google fica suspenso e as telas usam somente Supabase Auth nativo", async () => {
  const [button, page, signup] = await Promise.all([
    read("components/auth/google-oauth-button.tsx"), read("app/login/page.tsx"), read("app/cadastro/page.tsx"),
  ]);
  assert.match(button, /enabled = false/);
  assert.match(page, /signInWithPassword/);
  assert.match(signup, /auth\.signUp/);
  assert.doesNotMatch(page + signup, /signIn\("google"|GoogleOAuthButton/);
});

test("provisionamento administrativo exige owner Auth real e não promove o Admin", async () => {
  const provisioning = await read("lib/server/brand-provisioning.ts");
  const route = await read("app/api/marcas/route.ts");
  assert.match(provisioning, /getUserById/);
  assert.match(provisioning, /listUsers/);
  assert.match(provisioning, /owner_user_id: owner\.id/);
  assert.match(provisioning, /status: "active"/);
  assert.match(provisioning, /compensate\(client/);
  assert.match(provisioning, /membership_id: null/);
  assert.doesNotMatch(provisioning, /from\("brand_memberships"\)\.insert|role: "owner"/);
  assert.doesNotMatch(route, /owner_user_id: profile\.userId/);
  assert.doesNotMatch(route, /d67ebbad-a590-45f8-8bb5-a19c6241ac1b/);
});

test("admin monitora marcas sem fluxo operacional de owner ou criação direta", async () => {
  const panel = await read("modules/admin/brands-admin-panel.tsx");
  const ownersRoute = await read("app/api/admin/owners/route.ts");
  const authUsers = await read("lib/server/auth-users.ts");
  const provisioning = await read("lib/server/brand-provisioning.ts");
  assert.match(panel, /Monitoramento estrutural global/);
  assert.doesNotMatch(panel, /Nova marca|ownerQuery|ownerUserId|\/api\/admin\/owners/);
  assert.doesNotMatch(panel, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(ownersRoute, /requireCanonicalPlatformAdmin/);
  assert.doesNotMatch(ownersRoute, /profile\.isAdmin|requireCanonicalSessionProfile|ADMIN_EMAIL/);
  assert.match(ownersRoute, /searchAuthUsers\(createServiceClient\(\), query\)/);
  assert.match(authUsers, /listUsers/);
  assert.match(authUsers, /email_confirmed_at|confirmed_at/);
  assert.match(authUsers, /full_name|display_name/);
  assert.doesNotMatch(panel, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(provisioning, /auth\.admin\.getUserById/);
});

test("busca Auth normaliza e-mail, percorre a segunda pagina e preserva nao confirmado", async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    email: `other-${index}@example.com`,
    user_metadata: {},
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
  }));
  const secondPage = [{
    id: "11111111-1111-4111-8111-111111111111",
    email: "Scalbeto@Gmail.com ",
    user_metadata: { full_name: "Scalbeto" },
    email_confirmed_at: null,
  }];
  const client = {
    auth: {
      admin: {
        listUsers: async ({ page }: { page?: number }) => ({
          data: { users: page === 2 ? secondPage : firstPage },
          error: null,
        }),
      },
    },
  } as never;

  const result = await searchAuthUsers(client, "  SCALBETO@GMAIL.COM ");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "11111111-1111-4111-8111-111111111111");
  assert.equal(result[0].email, "Scalbeto@Gmail.com");
  assert.equal(result[0].name, "Scalbeto");
  assert.equal(result[0].emailConfirmed, false);
});

test("erro administrativo na busca Auth nao vira lista vazia", async () => {
  const client = {
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: new Error("admin failed") }) } },
  } as never;
  await assert.rejects(() => searchAuthUsers(client, "owner@example.com"), /admin failed/);
});

type FakeProvisionClient = Parameters<typeof provisionBrandWithOwner>[0] & {
  state: { brands: Array<Record<string, unknown>>; memberships: Array<Record<string, unknown>>; lists: Array<Record<string, unknown>> };
};

function fakeProvisionClient(options: { failLists?: boolean; ownerByEmail?: boolean } = {}): FakeProvisionClient {
  const state = { brands: [] as Array<Record<string, unknown>>, memberships: [] as Array<Record<string, unknown>>, lists: [] as Array<Record<string, unknown>> };
  const resultFor = (table: string, operation: string, payload: unknown, filters: Record<string, unknown>) => {
    if (operation === "brand-insert") {
      const input = payload as Record<string, unknown>;
      const row = { ...input, id: "22222222-2222-4222-8222-222222222222" };
      state.brands.push(row);
      return { data: row, error: null };
    }
    if (operation === "lists-insert") {
      if (options.failLists) return { data: null, error: { message: "lists failed" } };
      const rows = (payload as Array<Record<string, unknown>>).map((item, index) => ({ ...item, id: `44444444-4444-4444-8444-44444444444${index}` }));
      state.lists.push(...rows);
      return { data: rows, error: null };
    }
    if (operation === "delete") {
      if (table === "marcas") state.brands = state.brands.filter(row => row.id !== filters.id);
      if (table === "brand_memberships") state.memberships = state.memberships.filter(row => row.id !== filters.id);
      if (table === "minerador_keyword_lists") state.lists = state.lists.filter(row => !(filters.ids as string[]).includes(String(row.id)));
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  return {
    state,
    auth: { admin: {
      getUserById: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" } }, error: null }),
      listUsers: async () => ({ data: { users: options.ownerByEmail ? [{ id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" }] : [] }, error: null }),
    } },
    from(table: string) {
      let operation = "";
      let payload: unknown;
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        is: () => builder,
        eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
        in: (key: string, values: string[]) => { filters[key] = values; return builder; },
        maybeSingle: async () => resultFor(table, operation, payload, filters),
        single: async () => resultFor(table, operation, payload, filters),
        insert: (value: unknown) => { payload = value; operation = table === "marcas" ? "brand-insert" : "lists-insert"; return builder; },
        delete: () => { operation = "delete"; return builder; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resultFor(table, operation, payload, filters)).then(resolve),
      };
      return builder;
    },
  } as unknown as FakeProvisionClient;
}

test("provisionamento confirma ownership sem membership artificial e compensa falha", async () => {
  const successClient = fakeProvisionClient();
  const created = await provisionBrandWithOwner(successClient, "d67ebbad-a590-45f8-8bb5-a19c6241ac1b", { nome: "Marca Nova", ownerUserId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(created.owner_user_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(created.membership_id, null);
  assert.equal(successClient.state.memberships.length, 0);

  const failedClient = fakeProvisionClient({ failLists: true });
  await assert.rejects(() => provisionBrandWithOwner(failedClient, "d67ebbad-a590-45f8-8bb5-a19c6241ac1b", { nome: "Marca Incompleta", ownerUserId: "11111111-1111-4111-8111-111111111111", silos_existentes: [{ nome: "Silo" }] }));
  assert.equal(failedClient.state.brands.length, 0, "falha não pode deixar marca ativa órfã");
});

test("owner por e-mail é resolvido no Auth e e-mail inexistente não cria marca", async () => {
  const foundClient = fakeProvisionClient({ ownerByEmail: true });
  const created = await provisionBrandWithOwner(foundClient, "d67ebbad-a590-45f8-8bb5-a19c6241ac1b", { nome: "Marca por E-mail", ownerEmail: "owner@example.com" });
  assert.equal(created.owner_user_id, "11111111-1111-4111-8111-111111111111");

  const missingClient = fakeProvisionClient();
  await assert.rejects(
    () => provisionBrandWithOwner(missingClient, "d67ebbad-a590-45f8-8bb5-a19c6241ac1b", { nome: "Sem Owner", ownerEmail: "missing@example.com" }),
    /Não encontramos um usuário cadastrado/
  );
  assert.equal(missingClient.state.brands.length, 0);
});

test("usuário sem marca recebe estado explícito sem escolher primeiro contexto", async () => {
  const selector = await read("app/selecionar-marca/select-brand-client.tsx");
  const contexts = await read("app/api/contexts/route.ts");
  assert.match(selector, /fetch\("\/api\/contexts"/);
  assert.match(selector, /ainda não possui acesso editorial a uma marca/);
  assert.match(selector, /Sair da conta/);
  assert.doesNotMatch(selector, /listas_kgr|keywords_kgr/);
  assert.doesNotMatch(contexts, /listas_kgr|keywords_kgr/);
});

test("convite existente permanece na entidade canônica e a lacuna de aceite fica explícita", async () => {
  const repository = await read("lib/server/editorial-repositories.ts");
  const migration = await read("supabase/migrations/0002_operational_editorial_flow.sql");
  assert.match(repository, /from\("brand_invitations"\)/);
  assert.match(repository, /token_hash/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.brand_invitations/);
  assert.match(migration, /status text NOT NULL CHECK \(status IN \('pending','accepted','expired','cancelled'\)\)/);
  assert.doesNotMatch(repository, /create table|CREATE TABLE/i);
});

test("migration, RLS e grants permanecem fora da alteração", async () => {
  const route = await read("app/api/marcas/route.ts");
  const provisioning = await read("lib/server/brand-provisioning.ts");
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY.*NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(provisioning, /UPDATE|ALTER|DROP|CREATE TABLE/i);
});
