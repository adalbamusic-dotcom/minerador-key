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

test("Google fica suspenso por flag server-side, com provider e troca preservados", async () => {
  const route = await read("app/api/auth/[...nextauth]/route.ts");
  const flags = await read("lib/server/auth-feature-flags.ts");
  const page = await read("app/page.tsx");
  assert.match(flags, /GOOGLE_LOGIN_ENABLED === "true"/);
  assert.match(route, /GoogleProvider/);
  assert.match(route, /exchangeGoogleIdTokenForSupabaseToken/);
  assert.match(route, /GOOGLE_LOGIN_ENABLED \? \[googleProvider\]/);
  assert.doesNotMatch(page, /signIn\("google"/);
});

test("provisionamento administrativo exige owner Auth real e não promove o Admin", async () => {
  const provisioning = await read("lib/server/brand-provisioning.ts");
  const route = await read("app/api/marcas/route.ts");
  assert.match(provisioning, /getUserById/);
  assert.match(provisioning, /listUsers/);
  assert.match(provisioning, /owner_user_id: owner\.id/);
  assert.match(provisioning, /role: "owner"/);
  assert.match(provisioning, /status: "active"/);
  assert.match(provisioning, /compensate\(client/);
  assert.match(provisioning, /membership_id/);
  assert.doesNotMatch(route, /owner_user_id: profile\.userId/);
  assert.doesNotMatch(route, /d67ebbad-a590-45f8-8bb5-a19c6241ac1b/);
});

test("seleção de owner usa busca server-side por nome/e-mail e não expõe UUID como entrada", async () => {
  const panel = await read("modules/admin/brands-admin-panel.tsx");
  const ownersRoute = await read("app/api/admin/owners/route.ts");
  const authUsers = await read("lib/server/auth-users.ts");
  const provisioning = await read("lib/server/brand-provisioning.ts");
  assert.match(panel, /fetch\(`\/api\/admin\/owners\?q=/);
  assert.match(panel, /Selecione o proprietário da marca\./);
  assert.match(panel, /Busque por nome ou e-mail/);
  assert.match(panel, /UUID Auth:/);
  assert.doesNotMatch(panel, /placeholder="UUID real do Supabase Auth"/);
  assert.doesNotMatch(panel, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(ownersRoute, /profile\.isAdmin/);
  assert.match(ownersRoute, /searchAuthUsers\(createServiceClient\(\), query\)/);
  assert.match(authUsers, /listUsers/);
  assert.match(authUsers, /email_confirmed_at|confirmed_at/);
  assert.match(authUsers, /full_name|display_name/);
  assert.match(panel, /ownerSearchText/);
  assert.match(panel, /selectedOwner/);
  assert.match(panel, /ownerSearchStatus/);
  assert.match(panel, /payload\.ownerUserId = selectedOwner!?\.id/);
  assert.match(panel, /disabled=\{saving \|\|/);
  assert.match(panel, /setSelectedOwner\(null\)/);
  assert.doesNotMatch(panel, /payload\.ownerEmail/);
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

function fakeProvisionClient(options: { failMembership?: boolean; ownerByEmail?: boolean } = {}): FakeProvisionClient {
  const state = { brands: [] as Array<Record<string, unknown>>, memberships: [] as Array<Record<string, unknown>>, lists: [] as Array<Record<string, unknown>> };
  const resultFor = (table: string, operation: string, payload: unknown, filters: Record<string, unknown>) => {
    if (operation === "role") return { data: { id: "owner-role" }, error: null };
    if (operation === "brand-insert") {
      const input = payload as Record<string, unknown>;
      const row = { ...input, id: "22222222-2222-4222-8222-222222222222" };
      state.brands.push(row);
      return { data: row, error: null };
    }
    if (operation === "membership-insert") {
      if (options.failMembership) return { data: null, error: { message: "membership failed" } };
      const row = { ...(payload as Record<string, unknown>), id: "33333333-3333-4333-8333-333333333333" };
      state.memberships.push(row);
      return { data: row, error: null };
    }
    if (operation === "lists-insert") {
      const rows = (payload as Array<Record<string, unknown>>).map((item, index) => ({ ...item, id: `44444444-4444-4444-8444-44444444444${index}` }));
      state.lists.push(...rows);
      return { data: rows, error: null };
    }
    if (operation === "delete") {
      if (table === "marcas") state.brands = state.brands.filter(row => row.id !== filters.id);
      if (table === "brand_memberships") state.memberships = state.memberships.filter(row => row.id !== filters.id);
      if (table === "listas_kgr") state.lists = state.lists.filter(row => !(filters.ids as string[]).includes(String(row.id)));
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
      let operation = table === "brand_roles" ? "role" : "";
      let payload: unknown;
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        is: () => builder,
        eq: (key: string, value: unknown) => { filters[key] = value; return builder; },
        in: (key: string, values: string[]) => { filters[key] = values; return builder; },
        maybeSingle: async () => resultFor(table, operation, payload, filters),
        single: async () => resultFor(table, operation, payload, filters),
        insert: (value: unknown) => { payload = value; operation = table === "marcas" ? "brand-insert" : table === "brand_memberships" ? "membership-insert" : "lists-insert"; return builder; },
        delete: () => { operation = "delete"; return builder; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resultFor(table, operation, payload, filters)).then(resolve),
      };
      return builder;
    },
  } as unknown as FakeProvisionClient;
}

test("provisionamento usa fixtures para confirmar ownership/membership e compensar falha", async () => {
  const successClient = fakeProvisionClient();
  const created = await provisionBrandWithOwner(successClient, "d67ebbad-a590-45f8-8bb5-a19c6241ac1b", { nome: "Marca Nova", ownerUserId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(created.owner_user_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(created.membership_id, "33333333-3333-4333-8333-333333333333");
  assert.equal(successClient.state.memberships.length, 1);

  const failedClient = fakeProvisionClient({ failMembership: true });
  await assert.rejects(() => provisionBrandWithOwner(failedClient, "d67ebbad-a590-45f8-8bb5-a19c6241ac1b", { nome: "Marca Incompleta", ownerUserId: "11111111-1111-4111-8111-111111111111" }));
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

test("usuário sem marca consulta somente tenants e recebe estado de espera", async () => {
  const selector = await read("app/selecionar-marca/select-brand-client.tsx");
  const tenants = await read("app/api/tenants/route.ts");
  assert.match(selector, /fetch\("\/api\/tenants"/);
  assert.match(selector, /Aguardando associação a uma marca ou convite/);
  assert.match(selector, /Sair da conta/);
  assert.doesNotMatch(selector, /listas_kgr|keywords_kgr/);
  assert.doesNotMatch(tenants, /listas_kgr|keywords_kgr/);
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
