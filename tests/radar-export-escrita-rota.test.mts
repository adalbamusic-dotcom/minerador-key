import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { ARTIGO, HOST_DO_BANCO, MARCA, PEDIDO_DO_SILO, instalarPostgrestSimulado, semearBanco, type Banco, type Pedido } from "./radar-export-leitura-fixtures.mts";

/*
 * ===== A ROTA NO FORMATO "PARA ESCREVER" — a mesma leitura, outra projeção =====
 *
 * A rota roda de verdade sobre o PostgREST simulado da bancada do export (o
 * cliente Supabase é o real; só o `fetch` é trocado). Três provas:
 *
 *   1 · sem `mode`, a resposta é a de antes, byte a byte igual a `mode: "full"`
 *       — quem já chamava a rota continua recebendo o formato completo;
 *   2 · com `mode: "writing"`, a rota faz EXATAMENTE as mesmas leituras do
 *       formato completo (mesmas tabelas, mesmos parâmetros, só GET): o
 *       formato novo não lê nada a mais do banco;
 *   3 · o arquivo novo sai com as 13 colunas, a linha de topo e o nome
 *       "para-escrever", por silo e avulso.
 *
 * PROVIDER_CALLS = 0: o `fetch` recusa qualquer host que não seja o do banco.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = `http://${HOST_DO_BANCO}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}

const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { return globalThis.__perfilDoExportDeTeste; }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
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

let banco: Banco = semearBanco();
const { pedidos, foraDoBanco } = instalarPostgrestSimulado(() => banco);

const { createCanonicalServiceClient } = await import("../lib/server/canonical-authorization.ts");
(globalThis as Record<string, unknown>).__perfilDoExportDeTeste = { userId: "ator-de-teste", supabase: createCanonicalServiceClient() };

const rota = await import("../app/api/editorial/radar-export/route.ts");
const { RADAR_WRITING_EXPORT_COLUMNS } = await import("../lib/radar/portable-writing-export.ts");

const AGORA = "2026-09-25T12:00:00.000Z";
const DataReal = Date;
class DataFixa extends DataReal {
  constructor(...argumentos: unknown[]) {
    if (argumentos.length === 0) super(AGORA);
    else super(...(argumentos as [string]));
  }
  static now() { return new DataReal(AGORA).getTime(); }
}

type Resposta = { status: number; texto: string; pedidos: Pedido[] };

async function exportar(corpo: unknown): Promise<Resposta> {
  banco = semearBanco();
  pedidos.length = 0;
  (globalThis as { Date: DateConstructor }).Date = DataFixa as unknown as DateConstructor;
  try {
    const resposta = await rota.POST(new Request("http://localhost/api/editorial/radar-export", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
    }));
    return { status: resposta.status, texto: await resposta.text(), pedidos: [...pedidos] };
  } finally {
    (globalThis as { Date: DateConstructor }).Date = DataReal;
  }
}

const assinaturaDasLeituras = (lista: Pedido[]) => lista.map(pedido => `${pedido.metodo} ${pedido.tabela} ${[...pedido.params.entries()].sort().map(([chave, valor]) => `${chave}=${valor}`).join("&")}`);

const primeiraLinhaDoCsv = (csv: string) => csv.replace(/^﻿/, "").split("\r\n")[0];

/* ======================= 1 · sem `mode`, o de antes ======================= */

for (const [nome, corpo] of Object.entries({
  silo: { brandId: MARCA, articleIds: PEDIDO_DO_SILO, groupBy: "silo" },
  avulso: { brandId: MARCA, articleIds: PEDIDO_DO_SILO },
})) {
  test(`1 · ${nome}: sem 'mode' a resposta é a do formato completo, byte a byte`, async () => {
    const semModo = await exportar(corpo);
    const completo = await exportar({ ...corpo, mode: "full" });
    assert.equal(semModo.status, 200, semModo.texto.slice(0, 300));
    assert.equal(completo.texto, semModo.texto, "o padrão da rota deixou de ser o formato completo");
    const csv = nome === "silo" ? JSON.parse(semModo.texto).files[0].csv : JSON.parse(semModo.texto).csv;
    assert.match(primeiraLinhaDoCsv(csv), /"keyword_principal"/, "o formato completo perdeu as colunas de antes");
  });
}

test("1 · 'mode' fora do contrato é recusado, e o corpo continua estrito", async () => {
  const invalido = await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, mode: "resumo" });
  assert.equal(invalido.status, 400);
  const estranho = await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, mode: "writing", formato: "x" });
  assert.equal(estranho.status, 400);
});

/* ======================= 2 · a mesma leitura ======================= */

test("2 · 'Para escrever' faz exatamente as leituras do formato completo — nenhuma a mais, nenhuma escrita", async () => {
  const corpo = { brandId: MARCA, articleIds: PEDIDO_DO_SILO, groupBy: "silo" };
  const completo = await exportar(corpo);
  const escrita = await exportar({ ...corpo, mode: "writing" });
  assert.equal(escrita.status, 200, escrita.texto.slice(0, 300));
  assert.deepEqual(assinaturaDasLeituras(escrita.pedidos), assinaturaDasLeituras(completo.pedidos), "o formato novo mudou o que se lê do banco");
  for (const pedido of escrita.pedidos) assert.equal(pedido.metodo, "GET", `o export gravou: ${pedido.tabela}`);
  assert.ok(escrita.texto.length * 3 < completo.texto.length, `a resposta nova (${escrita.texto.length}) não ficou bem menor que a completa (${completo.texto.length})`);
});

/* ======================= 3 · o arquivo novo ======================= */

test("3 · por silo: 13 colunas, a linha 'Silo' no topo, o nome 'para-escrever' e os recusados de antes", async () => {
  const completo = JSON.parse((await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, groupBy: "silo" })).texto);
  const escrita = JSON.parse((await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, groupBy: "silo", mode: "writing" })).texto);
  assert.equal(escrita.success, true);
  assert.equal(escrita.mode, "writing");
  assert.equal(escrita.csv, undefined, "no export por silo o CSV do lote não sai");
  assert.equal(escrita.exported, completo.exported);
  assert.deepEqual(escrita.refused, completo.refused, "os recusados são os mesmos nos dois formatos");
  assert.equal(escrita.files.length, completo.files.length);
  assert.equal(typeof escrita.blocked, "number");
  const arquivo = escrita.files[0];
  assert.match(arquivo.filename, /^silo-.+-para-escrever-\d{4}-\d{2}-\d{2}(-parcial)?\.csv$/);
  assert.deepEqual(arquivo.silo, completo.files[0].silo, "o resumo do arquivo que a tela mostra é o mesmo");
  assert.equal(primeiraLinhaDoCsv(arquivo.csv), RADAR_WRITING_EXPORT_COLUMNS.map(coluna => `"${coluna}"`).join(","));
  assert.match(arquivo.csv.replace(/^﻿/, "").split("\r\n")[1], /^"Silo","(Com ressalva|Não): /);
  assert.equal(/"keyword_principal"|_json"|_md"/.test(arquivo.csv), false);
  assert.match(escrita.headline, /exportado\(s\) para escrever/);
});

test("3 · avulso: o CSV do lote com a linha 'Marca' no topo e o nome 'para-escrever'", async () => {
  const escrita = JSON.parse((await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, mode: "writing" })).texto);
  assert.equal(escrita.success, true);
  assert.equal(escrita.files, undefined);
  assert.match(escrita.filename, /para-escrever/);
  assert.equal(primeiraLinhaDoCsv(escrita.csv), RADAR_WRITING_EXPORT_COLUMNS.map(coluna => `"${coluna}"`).join(","));
  assert.match(escrita.csv.replace(/^﻿/, "").split("\r\n")[1], /^"Marca","/);
});

test("3 · só recusados: o mesmo 409 do formato completo", async () => {
  const corpo = { brandId: MARCA, articleIds: [ARTIGO.N, ARTIGO.V, ARTIGO.M] };
  const completo = await exportar(corpo);
  assert.equal(completo.status, 409);
  const escrita = await exportar({ ...corpo, mode: "writing" });
  assert.equal(escrita.status, 409);
  assert.deepEqual(JSON.parse(escrita.texto), JSON.parse(completo.texto), "a recusa é a mesma nos dois formatos");
});

test("PROVIDER_CALLS = 0: nenhum pedido saiu do banco simulado", () => {
  assert.deepEqual(foraDoBanco, []);
});
