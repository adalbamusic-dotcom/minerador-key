import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { ARTIGO, HOST_DO_BANCO, MARCA, instalarPostgrestSimulado, semearBanco, type Banco } from "./radar-export-leitura-fixtures.mts";
import { comArtigosModeloConcluidos, plantaConcluidaDaBancada } from "./radar-piloto-artigo-modelo-fixtures-2026-10-09.mts";
import { entradaGoogle } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-09 · O MCP PELO MESMO NÚCLEO DA ROTA DE EXPORT (regra do dono) =====
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos." `get_article_for_writing` e `get_video_material`
 * entregam o MESMO arquivo que a tela baixa, pela mesma montagem, a mesma
 * exigência do artigo-modelo e a mesma projeção — e sem a planta, o estado
 * explícito, nunca o legado. Provas, sem rede e sem IA:
 *
 *   A · com a planta concluída, o CSV do MCP é byte a byte o da rota (escrita e vídeo);
 *   B · sem a planta, o MCP diz o mesmo que o 409 da rota (o que falta, pelo título, e o teto);
 *   C · o artigo não finalizado volta com a recusa de antes;
 *   D · a recusa lançada pela função pura de escrita e a devolvida pela de vídeo viram o mesmo estado;
 *   E · os botões que o MCP manda o usuário clicar são os da tela, com o custo;
 *   F · congelamento sagrado e PROVIDER_CALLS = 0: só leituras, nada fora do banco.
 */

/* ======================= ambiente sem rede (o da bancada do export) ======================= */

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
const ATOR = "ator-de-teste";
(globalThis as Record<string, unknown>).__perfilDoExportDeTeste = { userId: ATOR, supabase: createCanonicalServiceClient() };

const rota = await import("../app/api/editorial/radar-export/route.ts");
const { radarMcpMaterialForArticle, radarMcpMaterialOf } = await import("../lib/server/radar-mcp-material.ts");
const painel = await import("../modules/radar/radar-article-blueprint-panel.tsx");
const mcp = await import("../lib/agent/mcp-article-blueprint.ts");

const AGORA = "2026-09-25T12:00:00.000Z";
const DataReal = Date;
class DataFixa extends DataReal {
  constructor(...argumentos: unknown[]) {
    if (argumentos.length === 0) super(AGORA);
    else super(...(argumentos as [string]));
  }
  static now() { return new DataReal(AGORA).getTime(); }
}

async function comDataFixa<T>(fazer: () => Promise<T>): Promise<T> {
  (globalThis as { Date: DateConstructor }).Date = DataFixa as unknown as DateConstructor;
  try { return await fazer(); } finally { (globalThis as { Date: DateConstructor }).Date = DataReal; }
}

async function pelaRota(corpo: unknown): Promise<{ status: number; corpo: Record<string, unknown> }> {
  return comDataFixa(async () => {
    const resposta = await rota.POST(new Request("http://localhost/api/editorial/radar-export", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
    }));
    return { status: resposta.status, corpo: JSON.parse(await resposta.text()) as Record<string, unknown> };
  });
}

const peloMcp = (articleId: string, mode: "writing" | "video") => comDataFixa(() =>
  radarMcpMaterialForArticle({ brandId: MARCA, articleId, mode, supabase: createCanonicalServiceClient(), actorUserId: ATOR }));

/* As palavras que nenhum entregável novo pode ter (D10). */
const D10 = /pend[eê]ncia|aguardando aprova|rascunho|fonte a obter|preencher|peça ao Arquiteto|confira se a coleta traz/i;

/* ======================= A · com a planta, o mesmo arquivo da tela ======================= */

for (const mode of ["writing", "video"] as const) {
  test(`A · ${mode}: com o artigo-modelo concluído, o CSV do MCP é byte a byte o da rota`, async () => {
    banco = comArtigosModeloConcluidos(semearBanco());
    const daRota = await pelaRota({ brandId: MARCA, articleIds: [ARTIGO.F], mode });
    assert.equal(daRota.status, 200, JSON.stringify(daRota.corpo).slice(0, 300));
    banco = comArtigosModeloConcluidos(semearBanco());
    pedidos.length = 0;
    const doMcp = await peloMcp(ARTIGO.F, mode);
    assert.equal(doMcp.status, "ready", JSON.stringify(doMcp).slice(0, 300));
    if (doMcp.status !== "ready") return;
    assert.equal(doMcp.csv, daRota.corpo.csv, "o MCP entrega o mesmo arquivo que a tela baixa");
    assert.equal(doMcp.filename, daRota.corpo.filename);
    assert.equal(doMcp.mode, mode);
    /* F · só leituras: nada escrito, nada fora do banco. */
    assert.ok(pedidos.length > 0);
    for (const pedido of pedidos) assert.equal(pedido.metodo, "GET", `o MCP gravou: ${pedido.tabela}`);
    assert.deepEqual(foraDoBanco, [], "PROVIDER_CALLS = 0");
  });
}

/* ======================= B · sem a planta, o mesmo 409, como estado ======================= */

for (const mode of ["writing", "video"] as const) {
  test(`B · ${mode}: sem o artigo-modelo concluído, o MCP diz o que o 409 da rota diz — e nenhum arquivo pelo processo antigo`, async () => {
    banco = semearBanco();
    const daRota = await pelaRota({ brandId: MARCA, articleIds: [ARTIGO.F], mode });
    assert.equal(daRota.status, 409);
    assert.equal(daRota.corpo.code, "needs_article_blueprint");
    banco = semearBanco();
    const doMcp = await peloMcp(ARTIGO.F, mode);
    assert.equal(doMcp.status, "needs_article_blueprint");
    if (doMcp.status !== "needs_article_blueprint") return;
    assert.deepEqual(doMcp.missing, daRota.corpo.missingArticleBlueprints);
    assert.deepEqual(doMcp.missing, [{ articleId: ARTIGO.F, title: "Skincare facial: a rotina que cabe na manhã" }]);
    assert.equal(doMcp.maxAiCalls, daRota.corpo.maxAiCalls);
    assert.equal(doMcp.maxAiCalls, 2, "até 2 chamadas de IA por artigo");
    assert.equal(doMcp.message, daRota.corpo.error);
    assert.equal("csv" in doMcp, false);
    assert.doesNotMatch(JSON.stringify(doMcp), D10);
  });
}

test("B · a planta só do outro artigo não vale para este; a do próprio artigo vale (o ifMissing do servidor não entra aqui)", async () => {
  banco = comArtigosModeloConcluidos(semearBanco(), { exceto: [ARTIGO.T] });
  const semPlanta = await peloMcp(ARTIGO.T, "video");
  assert.equal(semPlanta.status, "needs_article_blueprint");
  banco = comArtigosModeloConcluidos(semearBanco(), { exceto: [ARTIGO.T] });
  const comPlanta = await peloMcp(ARTIGO.X, "video");
  assert.equal(comPlanta.status, "ready");
});

/* ======================= C · a recusa de antes continua ======================= */

test("C · artigo não finalizado: a mesma recusa da rota, com o código e o motivo", async () => {
  banco = comArtigosModeloConcluidos(semearBanco());
  const daRota = await pelaRota({ brandId: MARCA, articleIds: [ARTIGO.N], mode: "video" });
  assert.equal(daRota.status, 409);
  const recusadoNaRota = (daRota.corpo.refused as Array<{ code: string; reason: string }>)[0];
  banco = comArtigosModeloConcluidos(semearBanco());
  const doMcp = await peloMcp(ARTIGO.N, "video");
  assert.equal(doMcp.status, "refused");
  if (doMcp.status !== "refused") return;
  assert.equal(doMcp.code, recusadoNaRota.code);
  assert.equal(doMcp.reason, recusadoNaRota.reason);
});

/* ======================= D · as duas formas da recusa das funções puras ======================= */

test("D · puro: recusa lançada (escrita) e devolvida (vídeo) viram o mesmo estado; sem montado, a recusa de antes", () => {
  const planta = plantaConcluidaDaBancada("Rotina da manhã em quatro passos");
  const montada = { articleId: "a1", entrada: entradaGoogle(), lentes: [], blueprint: planta } as never;
  const montagem = (montadas: unknown[]) => ({
    exportedAt: AGORA, montadas: montadas as never, recusados: [{ articleId: "n1", code: "radar_research_not_finalized", reason: "Finalize antes." }],
    publicacoes: new Map(), lentes: { lookups: [], readFailed: false } as never, plano: null, planoDaSelecao: null, brandVoice: { kind: "missing" } as never,
  });
  const lancada = radarMcpMaterialOf("writing", montagem([montada]), {
    writing: () => { throw Object.assign(new Error("Este artigo ainda não tem o artigo-modelo da SERP concluído."), { code: "needs_article_blueprint", articleIds: ["a1"] }); },
    video: () => { throw new Error("não deveria projetar vídeo"); },
  });
  assert.equal(lancada.status, "needs_article_blueprint");
  if (lancada.status === "needs_article_blueprint") assert.deepEqual(lancada.missing.map(item => item.articleId), ["a1"]);

  const devolvida = radarMcpMaterialOf("video", montagem([montada]), {
    writing: () => { throw new Error("não deveria projetar escrita"); },
    video: () => ({ status: "needs_article_blueprint", articleIds: ["a1"] }),
  });
  assert.equal(devolvida.status, "needs_article_blueprint");

  /* Outro erro da projeção não vira estado: sobe como veio. */
  assert.throws(() => radarMcpMaterialOf("writing", montagem([montada]), {
    writing: () => { throw new Error("quebrou"); },
    video: () => { throw new Error("não"); },
  }), /quebrou/);

  /* Sem a planta, a projeção nem é chamada: a regra vem antes, como na rota. */
  let projetou = false;
  const semPlanta = radarMcpMaterialOf("video", montagem([{ articleId: "a2", entrada: entradaGoogle(), lentes: [], blueprint: null }]), {
    writing: () => { projetou = true; throw new Error("x"); },
    video: () => { projetou = true; throw new Error("x"); },
  });
  assert.equal(semPlanta.status, "needs_article_blueprint");
  assert.equal(projetou, false);
  const rascunho = radarMcpMaterialOf("video", montagem([{ articleId: "a3", entrada: entradaGoogle(), lentes: [], blueprint: { ...planta, approval: "DRAFT" } }]));
  assert.equal(rascunho.status, "needs_article_blueprint", "versão não concluída conta como falta");

  const vazio = radarMcpMaterialOf("writing", montagem([]));
  assert.deepEqual(vazio, { status: "refused", mode: "writing", code: "radar_research_not_finalized", reason: "Finalize antes." });
});

/* ======================= E · os botões que o MCP aponta são os da tela ======================= */

test("E · os botões e o custo que o MCP manda o usuário procurar são os mesmos da tela", async () => {
  assert.equal(mcp.MCP_ARTICLE_BLUEPRINT_MAX_CALLS_PER_ARTICLE, painel.RADAR_ARTICLE_BLUEPRINT_MAX_CALLS_PER_ARTICLE);
  for (const n of [1, 2, 7]) {
    assert.equal(mcp.mcpArticleBlueprintBatchLabel(n), painel.radarArticleBlueprintBatchLabel(n));
    assert.equal(mcp.mcpArticleBlueprintOrganizeAndExportLabel(n), painel.radarArticleBlueprintOrganizeAndExportLabel(n));
    assert.equal(mcp.mcpArticleBlueprintCostLabel(n), painel.radarArticleBlueprintCostLabel(n));
  }
  assert.equal(mcp.MCP_ARTICLE_BLUEPRINT_SCREEN.organizeAndSend, painel.RADAR_ARTICLE_BLUEPRINT_ORGANIZE_AND_SEND_LABEL);
  const fonte = await readFile(new URL("../modules/radar/radar-article-blueprint-panel.tsx", import.meta.url), "utf8");
  assert.ok(fonte.includes(`"${mcp.MCP_ARTICLE_BLUEPRINT_SCREEN.organize}"`), "o botão do painel sem versão");
  assert.ok(fonte.includes(`"${mcp.MCP_ARTICLE_BLUEPRINT_SCREEN.organizeAgain}"`), "o botão do painel com versão");
  const bancada = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
  assert.match(bancada, /Artigo-modelo da SERP|RadarArticleBlueprintPanel/, "o painel mora na Pesquisa do artigo");
  const acao = mcp.mcpArticleBlueprintAction({ articles: 3, afterwards: "Chame de novo.", flowButton: mcp.mcpArticleBlueprintOrganizeAndExportLabel(3) });
  assert.deepEqual(acao.buttons, [mcp.MCP_ARTICLE_BLUEPRINT_SCREEN.organize, painel.radarArticleBlueprintOrganizeAndExportLabel(3), `${painel.radarArticleBlueprintBatchLabel(3)} (barra de lote do Radar)`]);
  assert.match(acao.cost, /Até 6 chamadas de IA/);
  assert.doesNotMatch(JSON.stringify(acao), D10);
});

/* ======================= F · congelamento sagrado ======================= */

test("F · ler o material não toca o congelamento: o banco depois é igual ao de antes", async () => {
  banco = comArtigosModeloConcluidos(semearBanco());
  const antes = JSON.stringify(banco);
  const escrita = await peloMcp(ARTIGO.F, "writing");
  const video = await peloMcp(ARTIGO.F, "video");
  assert.equal(escrita.status, "ready");
  assert.equal(video.status, "ready");
  assert.equal(JSON.stringify(banco), antes, "nenhuma versão, planta ou pacote mudou");
});
