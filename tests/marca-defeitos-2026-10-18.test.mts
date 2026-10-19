import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/**
 * ===== MARCA · OS DEFEITOS DO INVENTÁRIO DE BOTÕES (2026-10-18) =====
 *
 * docs/compartilhado/inventario-botoes-e-linha-2026-10-18.md, defeitos da Marca:
 *
 *   convite     "Cancelar" grava no servidor pelo `InvitationRepository.updateStatus`
 *               que já existia (PATCH de /api/editorial/invitations), na marca do
 *               pedido; "Suspender" e "Revogar" ficam desligados porque o banco não
 *               guarda esses estados (CHECK da migration 0002) — o botão não finge;
 *   keywords    "Ver keywords" abre o modo Keywords (antes só escolhia o conteúdo
 *               e ficava em "Conteúdos", onde o quadro não aparece);
 *   renomear    "Renomear" grava pelo MESMO salvamento da Skill: nome novo com o
 *               mesmo arquivo vira versão sucessora; o hash continua do conteúdo;
 *   idioma      as mensagens da importação do Site estão em português.
 *
 * O PATCH roda contra um PostgREST simulado (o cliente é o `supabase-js` real;
 * só o `fetch` é trocado, e ele recusa rede). O resto é estrutural, sem comentários.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.teste.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return { userId: 'ator-de-teste' }; }",
    "export async function assertCanAccessMarca(userId, brandId) { (globalThis.__permissoesPedidas ||= []).push('acesso:' + brandId); }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": [
    "export async function assertEditorialPermission(profile, brandId, module, action) {",
    "  (globalThis.__permissoesPedidas ||= []).push([brandId, module, action].join(':'));",
    "}",
  ].join("\n"),
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);

type Linha = Record<string, unknown>;
const banco: Record<string, Linha[]> = { brand_invitations: [] };
const escritas: Linha[] = [];

function casa(linha: Linha, params: URLSearchParams): boolean {
  for (const [coluna, filtro] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(coluna)) continue;
    const valor = linha[coluna] === null || linha[coluna] === undefined ? "null" : String(linha[coluna]);
    if (filtro.startsWith("eq.")) { if (valor !== filtro.slice(3)) return false; continue; }
    throw new Error(`filtro não simulado: ${coluna}=${filtro}`);
  }
  return true;
}
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  if (url.hostname !== "supabase.teste.invalid") throw new Error(`rede real proibida neste teste: ${url.href}`);
  const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
  const metodo = String(init?.method || "GET").toUpperCase();
  const linhas = (banco[tabela] ||= []).filter(linha => casa(linha, url.searchParams));
  if (metodo === "GET") return json(linhas.map(linha => structuredClone(linha)));
  if (metodo === "PATCH") {
    const mudanca = JSON.parse(String(init?.body || "{}")) as Linha;
    for (const linha of linhas) { escritas.push({ id: linha.id, marca: linha.marca_id, ...mudanca }); Object.assign(linha, mudanca); }
    return json(linhas.map(linha => ({ id: linha.id })));
  }
  throw new Error(`método não simulado: ${metodo} ${tabela}`);
}) as typeof fetch;

const { NextRequest } = await import("next/server");
const rota = await import("../app/api/editorial/invitations/route.ts");
const { importBrandSkill, replaceBrandSkillMarkdown } = await import("../lib/marca/brand-skill-domain.ts");
const { careGlowSkillFile } = await import("./care-glow-skill.fixture.ts");

const MARCA_A = "5f0c3a52-8d4e-4b7a-9c61-2e8f4a1b7c90";
const MARCA_B = "7a1d2e3f-4b5c-4d6e-8f90-1a2b3c4d5e6f";
const CONVITE_A = "11111111-1111-4111-8111-111111111111";
const CONVITE_B = "22222222-2222-4222-8222-222222222222";
const convite = (id: string, marca: string, status = "pending") => ({
  id, marca_id: marca, email: `${id.slice(0, 4)}@empresa.test`, status, expires_at: "2026-10-25T00:00:00.000000+00:00",
  created_at: "2026-10-18T00:00:00.000000+00:00", created_by: "ator", role_id: null, brand_roles: { slug: "editor" },
  brand_invitation_permissions: [{ module: "redator", action: "view" }],
});
const semear = () => {
  banco.brand_invitations = [convite(CONVITE_A, MARCA_A), convite(CONVITE_B, MARCA_B)];
  escritas.length = 0;
  (globalThis as { __permissoesPedidas?: string[] }).__permissoesPedidas = [];
};
const patch = (corpo: unknown) => rota.PATCH(new NextRequest("http://localhost/api/editorial/invitations", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
}));

test("convite · Cancelar grava no servidor, na marca do pedido, e devolve o relido", async () => {
  semear();
  const resposta = await patch({ brandId: MARCA_A, invitationId: CONVITE_A, action: "cancel" });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200, JSON.stringify(corpo));
  assert.equal(corpo.invitation.status, "cancelled", "a tela recebe o estado relido do servidor");
  assert.equal(banco.brand_invitations.find(linha => linha.id === CONVITE_A)?.status, "cancelled");
  assert.ok(escritas.every(escrita => escrita.marca === MARCA_A), "nenhuma escrita em outra marca");
  assert.ok((globalThis as { __permissoesPedidas?: string[] }).__permissoesPedidas?.includes(`${MARCA_A}:marca:manage`), "exige marca:manage");
});

test("convite · id de outra marca não é cancelado; convite já cancelado é 409", async () => {
  semear();
  const cruzado = await patch({ brandId: MARCA_A, invitationId: CONVITE_B, action: "cancel" });
  assert.equal(cruzado.status, 404);
  assert.equal(banco.brand_invitations.find(linha => linha.id === CONVITE_B)?.status, "pending", "o convite da outra marca ficou intacto");
  banco.brand_invitations.find(linha => linha.id === CONVITE_A)!.status = "accepted";
  const aceito = await patch({ brandId: MARCA_A, invitationId: CONVITE_A, action: "cancel" });
  assert.equal(aceito.status, 409, "só pendente pode ser cancelado");
});

test("convite · suspender e revogar não existem no servidor (o contrato só aceita cancel)", async () => {
  semear();
  for (const action of ["suspend", "revoke"]) {
    const resposta = await patch({ brandId: MARCA_A, invitationId: CONVITE_A, action });
    assert.equal(resposta.status, 400, `${action} é recusado`);
  }
  assert.equal(escritas.length, 0);
});

test("renomear · o mesmo arquivo com nome novo vira versão sucessora; o mesmo nome continua sem versão", async () => {
  const entrada = { brandId: "brand-a", definitionKey: "brand_voice", name: "Voz Care Glow", filename: careGlowSkillFile.filename, markdown: careGlowSkillFile.content, byteSize: careGlowSkillFile.byteSize, mimeType: null, importedBy: "actor-a", now: "2026-10-18T12:00:00.000Z" };
  const anterior = await importBrandSkill(entrada);
  const mesmo = await replaceBrandSkillMarkdown({ ...entrada, previous: anterior });
  assert.equal(mesmo.changed, false);
  const renomeada = await replaceBrandSkillMarkdown({ ...entrada, name: "Voz editorial Care Glow", previous: anterior });
  assert.equal(renomeada.changed, true);
  assert.equal(renomeada.skill.version, 2);
  assert.equal(renomeada.skill.name, "Voz editorial Care Glow");
  assert.equal(renomeada.skill.contentHash, anterior.contentHash, "o hash continua sendo só do conteúdo");
});

function semComentarios(caminho: string) {
  return readFileSync(new URL(caminho, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\}/g, "{}").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("tela · os botões chamam o servidor ou não fingem", () => {
  const equipe = semComentarios("../modules/marca/brand-page.tsx");
  assert.match(equipe, /method: "PATCH"[\s\S]{0,200}action: "cancel"/, "Cancelar chama o PATCH");
  assert.equal(/updateInvitationStatus\(item\.id, "(revoked|suspended|cancelled)"\)/.test(equipe), false, "nenhum botão muda só a tela");
  assert.match(equipe, /disabled data-convite-suspender/);
  assert.match(equipe, /disabled data-convite-revogar/);
  const skills = semComentarios("../modules/marca/brand-skills-panel.tsx");
  assert.match(skills, /onRename=\{name => void rename\(detailVersion, name\)\}/);
  assert.match(skills, /const rename = async[\s\S]{0,900}action: "save"/, "Renomear usa o salvamento de sempre");
  const site = semComentarios("../modules/marca/site-sitemap-panel.tsx");
  assert.match(site, /setKeywordEntryId\(entry\.id\); setWorkspaceMode\("keywords"\)/, "Ver keywords abre o modo Keywords");
  for (const ingles of ["Prepare a preview", "Import confirmed", "Batch partially", "Batch persisted", "Batch not completed", "The preview has", "The Minerador did not", "Import failed"]) {
    assert.equal(site.includes(ingles), false, `mensagem em inglês: ${ingles}`);
  }
});
