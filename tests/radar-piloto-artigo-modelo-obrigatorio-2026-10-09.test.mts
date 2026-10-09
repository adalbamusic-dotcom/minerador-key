import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ARTIGO, HOST_DO_BANCO, MARCA, PEDIDO_DO_SILO, instalarPostgrestSimulado, semearBanco, type Banco, type Pedido } from "./radar-export-leitura-fixtures.mts";
import { comArtigosModeloConcluidos, plantaConcluidaDaBancada } from "./radar-piloto-artigo-modelo-fixtures-2026-10-09.mts";
import { entradaAmazon, entradaGoogle } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-09 · O ARTIGO-MODELO É OBRIGATÓRIO EM TODA ENTREGA (regra do dono) =====
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos." Provas, sem rede e sem IA:
 *
 *   A · a rota de export: sem a planta concluída de cada artigo, nenhum formato
 *       sai (para escrever, vídeo, técnico, por Silo) — 409 com a lista pelo
 *       título e o teto do custo; com ela, sai; sem `mode`, o padrão é "writing";
 *   B · o CSV técnico: com a planta, título, promessa, estrutura e prompt saem
 *       dela; sem ela, não manda escrever nem diz "PRONTO PARA O REDATOR";
 *   C · a situação da investigação diz só o que é entregue (planta e comercial);
 *   D · a prontidão: o bloqueio da planta, e o pacote congelado intocado;
 *   E · a tela: o custo dito no botão antes do clique (2 por artigo, com a
 *       passada de correção), organizar em série e só então seguir;
 *   F · congelamento sagrado: a planta concluída que já existe continua valendo.
 *
 * PROVIDER_CALLS = 0: o `fetch` só alcança o banco simulado.
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
(globalThis as Record<string, unknown>).__perfilDoExportDeTeste = { userId: "ator-de-teste", supabase: createCanonicalServiceClient() };

const rota = await import("../app/api/editorial/radar-export/route.ts");
const {
  RADAR_EXPORT_NEEDS_ARTICLE_BLUEPRINT,
  radarExportNeedsArticleBlueprint,
  radarExportNeedsArticleBlueprintIds,
  radarPortableExportBlueprintOf,
  radarPortableExportHasApprovedBlueprint,
  radarPortableExportMissingBlueprints,
  radarPortableExportNeedsBlueprintBody,
} = await import("../lib/radar/portable-export-batch.ts");
const { RADAR_EXTERNAL_WRITER_PROMPT, RADAR_EXTERNAL_WRITER_PROMPT_FROM_BLUEPRINT, buildRadarPortableExportRow } = await import("../lib/radar/portable-export.ts");
const { radarPortableResearchStatusMarkdown, radarPortableWriterReadiness } = await import("../lib/radar/portable-dossier-gaps.ts");
const { RADAR_HANDOFF_ARTICLE_BLUEPRINT_MISSING, radarArticleBlueprintMissingBlock, radarHandoffReadiness } = await import("../lib/radar/handoff-readiness.ts");
const panel = await import("../modules/radar/radar-article-blueprint-panel.tsx");

const AGORA = "2026-09-25T12:00:00.000Z";
const DataReal = Date;
class DataFixa extends DataReal {
  constructor(...argumentos: unknown[]) {
    if (argumentos.length === 0) super(AGORA);
    else super(...(argumentos as [string]));
  }
  static now() { return new DataReal(AGORA).getTime(); }
}

type Resposta = { status: number; corpo: Record<string, unknown>; texto: string; pedidos: Pedido[] };

async function exportar(corpo: unknown, semear: (semeado: Banco) => Banco = semeado => semeado): Promise<Resposta> {
  banco = semear(semearBanco());
  pedidos.length = 0;
  (globalThis as { Date: DateConstructor }).Date = DataFixa as unknown as DateConstructor;
  try {
    const resposta = await rota.POST(new Request("http://localhost/api/editorial/radar-export", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
    }));
    const texto = await resposta.text();
    return { status: resposta.status, corpo: JSON.parse(texto), texto, pedidos: [...pedidos] };
  } finally {
    (globalThis as { Date: DateConstructor }).Date = DataReal;
  }
}

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const ler = async (caminho: string) => (await readFile(new URL(`../${caminho}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

/* As palavras que nenhum entregável novo pode ter (D10). */
const D10 = /pend[eê]ncia|aguardando aprova|rascunho|fonte a obter|preencher|peça ao Arquiteto|confira se a coleta traz/i;

/* ======================= A · a rota de export ======================= */

const TITULOS_FINALIZADOS = ["Skincare facial: a rotina que cabe na manhã", "Limpeza facial em dois passos", "Tônico facial: quando usar", "Esfoliação sem irritar"];

for (const [nome, corpo] of Object.entries({
  "para escrever (padrão, sem mode)": { brandId: MARCA, articleIds: PEDIDO_DO_SILO },
  "para escrever por Silo": { brandId: MARCA, articleIds: PEDIDO_DO_SILO, groupBy: "silo", mode: "writing" },
  "vídeo": { brandId: MARCA, articleIds: PEDIDO_DO_SILO, mode: "video" },
  "técnico": { brandId: MARCA, articleIds: PEDIDO_DO_SILO, mode: "full" },
  "técnico por Silo": { brandId: MARCA, articleIds: PEDIDO_DO_SILO, groupBy: "silo", mode: "full" },
})) {
  test(`A · ${nome}: sem o artigo-modelo concluído, nada sai — 409 com o que falta pelo título e o teto do custo`, async () => {
    const resposta = await exportar(corpo);
    assert.equal(resposta.status, 409, resposta.texto.slice(0, 300));
    assert.equal(resposta.corpo.code, RADAR_EXPORT_NEEDS_ARTICLE_BLUEPRINT);
    const faltando = resposta.corpo.missingArticleBlueprints as Array<{ articleId: string; title: string }>;
    assert.deepEqual(faltando.map(item => item.title).sort(), [...TITULOS_FINALIZADOS].sort());
    assert.equal(resposta.corpo.maxAiCalls, faltando.length * 2, "o teto: até 2 chamadas de IA por artigo");
    /* Os recusados de antes (não finalizados) continuam ditos. */
    assert.deepEqual((resposta.corpo.refused as Array<{ code: string }>).map(item => item.code).sort(), ["article_dna_not_found", "radar_item_not_found", "radar_research_not_finalized"]);
    /* Nenhum arquivo, nenhuma linha pelo modelo antigo. */
    for (const campo of ["csv", "files", "filename"]) assert.equal(campo in resposta.corpo, false, `saiu ${campo} sem o artigo-modelo`);
    for (const pedido of resposta.pedidos) assert.equal(pedido.metodo, "GET", `o export gravou: ${pedido.tabela}`);
  });
}

test("A · só o artigo sem planta é listado; os que têm a planta concluída não pagam de novo", async () => {
  const resposta = await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, mode: "writing" }, semeado => comArtigosModeloConcluidos(semeado, { exceto: [ARTIGO.T] }));
  assert.equal(resposta.status, 409);
  assert.deepEqual(resposta.corpo.missingArticleBlueprints, [{ articleId: ARTIGO.T, title: "Limpeza facial em dois passos" }]);
  assert.equal(resposta.corpo.maxAiCalls, 2);
});

test("A · com a planta concluída de cada artigo, os quatro formatos saem; sem `mode`, é o formato para escrever", async () => {
  const comPlanta = (semeado: Banco) => comArtigosModeloConcluidos(semeado);
  const padrao = await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO }, comPlanta);
  assert.equal(padrao.status, 200, padrao.texto.slice(0, 300));
  assert.equal(padrao.corpo.mode, "writing", "o padrão da rota passou a ser o formato para escrever");
  const escrita = await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, mode: "writing" }, comPlanta);
  assert.equal(escrita.texto, padrao.texto);

  const tecnico = await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, mode: "full" }, comPlanta);
  assert.equal(tecnico.status, 200, tecnico.texto.slice(0, 300));
  const csv = String(tecnico.corpo.csv);
  /* O técnico pelo artigo-modelo: a estrutura e o prompt dele; nenhum prompt de auditoria. */
  assert.match(csv, /ARTIGO-MODELO DA SERP \(planta concluída do artigo/);
  assert.ok(csv.includes(RADAR_EXTERNAL_WRITER_PROMPT_FROM_BLUEPRINT.split("\n")[0]), "o prompt do técnico com planta");
  assert.equal(csv.includes("Esta linha não traz o artigo-modelo"), false);
  /* A bancada tem outro bloqueio (integridade do pacote de teste); a planta, não: ela não aparece entre os motivos. */
  assert.equal(csv.includes("o artigo-modelo concluído desta investigação não foi organizado"), false);
  assert.match(csv, /"Artigo-modelo \d+"/, "o título sugerido é o H1 da planta");

  const porSilo = await exportar({ brandId: MARCA, articleIds: PEDIDO_DO_SILO, groupBy: "silo", mode: "full" }, comPlanta);
  assert.equal(porSilo.status, 200, porSilo.texto.slice(0, 300));
  assert.ok(Array.isArray(porSilo.corpo.files) && (porSilo.corpo.files as unknown[]).length >= 1);
});

/* ======================= A · as pontes puras ======================= */

test("A · puro: o que falta, o estado explícito das funções de entrega e o corpo da recusa", () => {
  const planta = plantaConcluidaDaBancada("H1");
  const montada = (articleId: string, blueprint: unknown) => ({ articleId, entrada: entradaGoogle(), lentes: [], blueprint }) as never;
  const lote = [montada("com", planta), montada("sem", null), montada("rascunho", { ...planta, approval: "DRAFT" }), montada("concluida", { ...planta, approval: "APPROVED" })];
  assert.deepEqual(radarPortableExportMissingBlueprints(lote).map(item => item.articleId), ["sem", "rascunho"]);
  assert.ok(radarPortableExportMissingBlueprints(lote).every(item => item.title && !/^[0-9a-f-]{36}$/.test(item.title)), "o que falta vai pelo título, nunca pelo id");
  assert.deepEqual(radarPortableExportMissingBlueprints(lote, ["com"]).map(item => item.articleId), ["com"]);

  const estado = { status: "needs_article_blueprint" as const, articleIds: ["a", "", 3 as unknown as string] };
  assert.equal(radarExportNeedsArticleBlueprint(estado), true);
  assert.deepEqual(radarExportNeedsArticleBlueprintIds(estado), ["a"]);
  assert.equal(radarExportNeedsArticleBlueprint({ csv: "x", exported: 1 }), false);
  assert.equal(radarExportNeedsArticleBlueprint(null), false);

  const corpo = radarPortableExportNeedsBlueprintBody({ missing: [{ articleId: "a", title: "Título A" }, { articleId: "b", title: "Título B" }], refused: [] });
  assert.equal(corpo.success, false);
  assert.equal(corpo.code, "needs_article_blueprint");
  assert.equal(corpo.maxAiCalls, 4);
  assert.match(corpo.error, /artigo-modelo/);
});

/* ======================= B · o CSV técnico ======================= */

test("B · técnico COM a planta: título, alternativas, promessa, estrutura, links, plano visual e prompt saem dela, concluídos", () => {
  const planta = plantaConcluidaDaBancada("Rotina da manhã em quatro passos");
  const linha = buildRadarPortableExportRow({ ...entradaGoogle(), articleBlueprint: radarPortableExportBlueprintOf(planta) });
  assert.equal(linha.suggested_title, "Rotina da manhã em quatro passos");
  assert.match(linha.alternate_titles, /Rotina da manhã em quatro passos: o passo a passo/);
  assert.match(linha.reader_promise, /Montar a rotina da manhã/);
  assert.match(linha.outline_md, /^# Estrutura do artigo-modelo\n\nARTIGO-MODELO DA SERP/);
  assert.match(linha.outline_md, /## A ordem dos passos de manhã/);
  assert.deepEqual(JSON.parse(linha.outline_json).map((secao: { h2: string }) => secao.h2), ["A ordem dos passos de manhã", "Quanto tempo a rotina leva"]);
  assert.match(linha.writer_brief_md, /Título de trabalho: Rotina da manhã em quatro passos/);
  assert.match(linha.writer_brief_md, /## A ordem dos passos de manhã/);
  assert.match(linha.writer_brief_md, /Abertura: responder "Qual é a ordem dos produtos de manhã\?" no primeiro parágrafo/);
  assert.match(linha.writer_context_md, /ARTIGO-MODELO DA SERP/);
  assert.match(linha.visual_plan_md, /^# Plano visual do artigo-modelo/);
  assert.match(linha.seo_metadata_md, /SEO title: Rotina da manhã em quatro passos \| Bancada/);
  assert.equal(JSON.parse(linha.cover_image_plan_json).slot, "CAPA");
  assert.equal(JSON.parse(linha.respite_images_plan_json).length, 1);
  assert.equal(linha.external_writer_prompt_md, RADAR_EXTERNAL_WRITER_PROMPT_FROM_BLUEPRINT);
  assert.match(linha.research_status_md, /\*\*PRONTO PARA O REDATOR\.\*\* A investigação congelada e o artigo-modelo concluído desta investigação vão juntos/);
  /* D10 nas colunas que a planta passou a escrever. */
  for (const coluna of ["outline_md", "internal_links_md", "visual_plan_md", "external_writer_prompt_md", "research_status_md", "suggested_title", "reader_promise"]) {
    assert.doesNotMatch(linha[coluna], D10, `${coluna} com palavra proibida (D10)`);
  }
});

test("B · técnico SEM a planta: não manda escrever nem diz 'PRONTO PARA O REDATOR'; o rascunho antigo conta como sem planta", () => {
  assert.equal(radarPortableExportBlueprintOf({ ...plantaConcluidaDaBancada("H1"), approval: "DRAFT" }), null, "o rascunho antigo não é planta");
  for (const articleBlueprint of [null, radarPortableExportBlueprintOf({ ...plantaConcluidaDaBancada("H1"), approval: "DRAFT" })]) {
    const linha = buildRadarPortableExportRow({ ...entradaGoogle(), articleBlueprint });
    assert.equal(linha.external_writer_prompt_md, RADAR_EXTERNAL_WRITER_PROMPT);
    assert.doesNotMatch(linha.external_writer_prompt_md, /Escreva o conteúdo completo/);
    assert.doesNotMatch(linha.research_status_md, /PRONTO PARA O REDATOR/);
    assert.match(linha.research_status_md, /BLOQUEADO PARA O REDATOR/);
    assert.match(linha.research_status_md, /Motivo: o artigo-modelo concluído desta investigação não foi organizado\./);
    assert.doesNotMatch(linha.outline_md, /ARTIGO-MODELO DA SERP/);
  }
  /* Quem monta a linha sem informar a planta (leitura de auditoria): o prompt de auditoria, a prontidão de antes. */
  const semInformar = buildRadarPortableExportRow(entradaGoogle());
  assert.equal(semInformar.external_writer_prompt_md, RADAR_EXTERNAL_WRITER_PROMPT);
  assert.doesNotMatch(RADAR_EXTERNAL_WRITER_PROMPT, /Escreva o conteúdo completo/);
  assert.ok(RADAR_EXTERNAL_WRITER_PROMPT.length < 700 && RADAR_EXTERNAL_WRITER_PROMPT_FROM_BLUEPRINT.length < 700, "os prompts apontam para o brief, sem duplicá-lo");
});

/* ======================= C · a situação diz só o que é entregue ======================= */

const statusDaBancada = (extra: Record<string, unknown> = {}) => ({
  frozenObservedAt: "2026-09-21T12:00:00.000Z",
  bundle: {
    primaryResearchProfile: "GOOGLE" as const,
    researchSources: [],
    research: { google: null, youtube: null, amazon: null },
    crossSerp: null,
    editorialOutputs: [],
    serpStanding: { authoritative: true, current: true, sufficient: true, valid: true, reason: "A SERP vigente sustenta a investigação." },
    conflicts: [],
    formatBlueprints: { video: { frozenAt: "2026-09-22T12:00:00.000Z" }, review: { frozenAt: "2026-09-23T12:00:00.000Z", intent: { type: "TOP_BEST" } } },
  },
  readiness: { ready: true, blocks: [] },
  ...extra,
}) as never;

test("C · a parte comercial e o vídeo: a célula diz o que o arquivo leva, nunca promete colunas que não saíram", () => {
  const comComercial = radarPortableResearchStatusMarkdown(statusDaBancada({ commercialDelivered: true }));
  assert.match(comComercial, /produtos, critérios e aviso de afiliado estão em commercial_plan_md, selected_products_json e promotion_links_json/);
  const semComercial = radarPortableResearchStatusMarkdown(statusDaBancada({ commercialDelivered: false }));
  assert.match(semComercial, /este arquivo não traz produtos nem aviso de afiliado/);
  assert.doesNotMatch(semComercial, /saem do blueprint comercial do pacote/);
  const semSaber = radarPortableResearchStatusMarkdown(statusDaBancada());
  assert.doesNotMatch(semSaber, /commercial_plan_md|saem do blueprint comercial/);
  for (const texto of [comComercial, semComercial, semSaber]) {
    assert.match(texto, /o roteiro sai pelo artigo-modelo, no CSV para vídeo e redes sociais/);
    assert.doesNotMatch(texto, /o roteiro sai do blueprint de vídeo do pacote/);
    assert.doesNotMatch(texto, D10);
  }
  /* A linha técnica informa o que leva: a Amazon com produtos tem as colunas comerciais. */
  assert.ok(buildRadarPortableExportRow(entradaAmazon(true)).commercial_plan_md);
});

test("C · 'PRONTO PARA O REDATOR' diz só o que vai junto: com a planta, a planta; sem saber, só a investigação; sem planta, bloqueado", () => {
  const comPlanta = radarPortableResearchStatusMarkdown(statusDaBancada({ articleBlueprint: "APPROVED" }));
  assert.match(comPlanta, /\*\*PRONTO PARA O REDATOR\.\*\* A investigação congelada e o artigo-modelo concluído desta investigação vão juntos neste arquivo/);
  const semSaber = radarPortableResearchStatusMarkdown(statusDaBancada());
  assert.match(semSaber, /\*\*PRONTO PARA O REDATOR\.\*\* A investigação congelada passa na regra de prontidão do Radar; o envio ao Redator leva junto o artigo-modelo concluído desta investigação\./);
  assert.doesNotMatch(semSaber, /aceitaria importar/);
  const semPlanta = radarPortableWriterReadiness({ readiness: { ready: true, blocks: [] }, articleBlueprint: "MISSING" });
  assert.equal(semPlanta.state, "BLOCKED");
  assert.deepEqual(semPlanta.actions, ["organize o artigo-modelo da SERP no Radar (Pesquisa → Artigo-modelo da SERP)"]);
  /* Sem a informação, a prontidão de antes (o CSV para escrever lê o veredito por aqui). */
  assert.equal(radarPortableWriterReadiness({ readiness: { ready: true, blocks: [] } }).state, "READY");
});

/* ======================= D · a prontidão e o pacote congelado ======================= */

test("D · a prontidão: o bloqueio da planta tem a frase do envio; sem a informação, a resposta é a de antes", () => {
  const artigo = { brandId: MARCA, articleId: ARTIGO.F, articleDnaVersionId: "dna", articleDnaContentHash: null };
  /* Sem investigação congelada, o passo que falta é finalizar — a planta nem entra. */
  const antes = radarHandoffReadiness({ article: artigo, frozen: null });
  assert.deepEqual(radarHandoffReadiness({ article: artigo, frozen: null, articleBlueprint: "MISSING" }), antes);
  assert.deepEqual(radarHandoffReadiness({ article: artigo, frozen: null, articleBlueprint: null }), antes);
  const bloqueio = radarArticleBlueprintMissingBlock();
  assert.equal(bloqueio.code, "ARTICLE_BLUEPRINT_MISSING");
  assert.match(bloqueio.message, /O envio ao Redator leva o artigo-modelo concluído desta investigação/);
  assert.equal(RADAR_HANDOFF_ARTICLE_BLUEPRINT_MISSING, "radar_handoff_article_blueprint_missing");
});

test("D · CONGELAMENTO SAGRADO: o dossiê canônico e o pacote não leem a planta — nenhum hash muda nesta rodada", async () => {
  const dossie = semComentarios(await ler("lib/server/radar-canonical-dossier.ts"));
  const chamada = dossie.slice(dossie.indexOf("radarHandoffReadiness({"), dossie.indexOf("})", dossie.indexOf("radarHandoffReadiness({")));
  assert.ok(chamada.length > 0);
  assert.equal(/articleBlueprint/.test(chamada), false, "a prontidão do dossiê canônico passou a depender da planta (mudaria o pacote)");
  const pacote = semComentarios(await ler("lib/radar/evidence-bundle.ts"));
  assert.equal(/articleBlueprint|radar_article_blueprints/.test(pacote), false, "a planta entrou no pacote congelado");
  /* O envio confere a planta por FORA do pacote: o recibo e o hash continuam os do pacote. */
  const envio = semComentarios(await ler("lib/server/radar-writer-send.ts"));
  assert.match(envio, /bundleHash: bundle\.bundleHash,/);
  assert.equal(/bundle\.articleBlueprint|articleBlueprint:/.test(envio.slice(envio.indexOf("RadarWriterBundleRecordSchema.parse("), envio.indexOf("RadarWriterBundleRecordSchema.parse(") + 900)), false);
});

/* ======================= E · a tela ======================= */

test("E · o custo no botão, antes do clique: até 2 chamadas por artigo, e a confirmação cita a passada de correção", () => {
  assert.equal(panel.RADAR_ARTICLE_BLUEPRINT_MAX_CALLS_PER_ARTICLE, 2);
  assert.equal(panel.radarArticleBlueprintOrganizeAndExportLabel(3), "Organizar 3 artigo(s)-modelo e exportar (+ até 6 chamadas de IA)");
  assert.equal(panel.RADAR_ARTICLE_BLUEPRINT_ORGANIZE_AND_SEND_LABEL, "Organizar o artigo-modelo e enviar (+ até 2 chamadas de IA)");
  assert.equal(panel.radarArticleBlueprintBatchLabel(4), "Organizar o artigo-modelo (4) · + até 8 chamadas de IA");
  assert.equal(panel.radarArticleBlueprintBatchLabel(7, "silo"), "Organizar o artigo-modelo do Silo (7) · + até 14 chamadas de IA");
  for (const artigos of [1, 5]) {
    const texto = panel.radarArticleBlueprintCostConfirmation(artigos);
    assert.match(texto, new RegExp(`até ${artigos * 2} chamadas de IA`));
    assert.match(texto, /passada de correção/);
    assert.match(texto, /nunca as duas|no máximo 2 por artigo/);
    assert.doesNotMatch(texto, D10);
  }
  const botao = renderToStaticMarkup(createElement(panel.RadarArticleBlueprintCostAction, { articles: 2, label: panel.radarArticleBlueprintOrganizeAndExportLabel(2), onConfirm: () => undefined, testId: "teste" }));
  assert.match(botao, />Organizar 2 artigo\(s\)-modelo e exportar \(\+ até 4 chamadas de IA\)<\/button>/);
  assert.doesNotMatch(botao, /Confirmar e organizar/, "nada chama a IA no primeiro clique");
  const confirmando = renderToStaticMarkup(createElement(panel.RadarArticleBlueprintCostAction, { articles: 2, label: "x", onConfirm: () => undefined, testId: "teste", open: true }));
  assert.match(confirmando, /passada de correção/);
  assert.match(confirmando, />Confirmar e organizar<\/button>/);
});

test("E · a recusa do export lida pela tela: a lista pelo título; outra resposta não é essa recusa", () => {
  assert.deepEqual(panel.radarExportMissingArticleBlueprints({ code: "needs_article_blueprint", missingArticleBlueprints: [{ articleId: "a", title: " Título A " }, { articleId: "", title: "x" }, { title: "sem id" }, { articleId: "b" }] }), [
    { articleId: "a", title: "Título A" }, { articleId: "b", title: "artigo sem título conhecido" },
  ]);
  assert.equal(panel.radarExportMissingArticleBlueprints({ code: "radar_export_empty" }), null);
  assert.equal(panel.radarExportMissingArticleBlueprints(null), null);
  const aviso = panel.radarExportMissingArticleBlueprintNotice([{ title: "Título A" }, { title: "Título B" }]);
  assert.match(aviso, /"Título A", "Título B"/);
  assert.match(aviso, /Organizar 2 artigo\(s\)-modelo e exportar \(\+ até 4 chamadas de IA\)/);
  assert.doesNotMatch(aviso, D10);
});

test("E · organizar e seguir: em série, um por vez; com falha, a entrega não sai", async () => {
  let ativos = 0;
  let maximo = 0;
  const seguiu: string[] = [];
  const organize = async (articleId: string) => {
    ativos += 1; maximo = Math.max(maximo, ativos);
    await new Promise(resolver => setTimeout(resolver, 1));
    ativos -= 1;
    return articleId === "falha" ? { ok: false as const, message: "A resposta da IA veio cortada." } : { ok: true as const, versionNumber: 2 };
  };
  const tudoBem = await panel.organizeRadarArticleBlueprintsThenRun({ articleIds: ["a", "b"], organize, run: async () => { seguiu.push("exportou"); return "arquivo"; } });
  assert.equal(tudoBem.ran, true);
  assert.equal(tudoBem.ran && tudoBem.result, "arquivo");
  assert.equal(maximo, 1, "nunca em paralelo");
  const comFalha = await panel.organizeRadarArticleBlueprintsThenRun({ articleIds: ["a", "falha"], organize, run: async () => { seguiu.push("não devia"); return "x"; } });
  assert.equal(comFalha.ran, false);
  assert.deepEqual(comFalha.failed.map(item => item.articleId), ["falha"]);
  assert.deepEqual(seguiu, ["exportou"], "a entrega não sai sem o artigo-modelo de todos");
  assert.match(panel.radarArticleBlueprintProgressNotice({ articleId: "a", state: "running", message: null, at: 1, position: { index: 2, total: 5 } }, "exportar"), /2 de 5…/);
  assert.doesNotMatch(panel.radarArticleBlueprintBatchSummary({ done: ["a", "b"], failed: [] }), /\d+ chamadas de IA/, "a barra não conta chamadas que o 'só se faltar' pode ter evitado");
});

test("E · o painel também sem o Google congelado (Amazon, YouTube), pela precedência do servidor; a entrega pela regra do painel", () => {
  /* O Google manda; a Amazon congelada que a página conhece confere a planta como no export. */
  assert.deepEqual(panel.radarArticleBlueprintFreezeOfInvestigation({ google: { frozenAt: "g", bundleId: "b", bundleHash: "h" }, amazon: { finalizedAt: "a" } }, "dna"), { frozenAt: "g", bundleId: "b", bundleHash: "h", articleDnaVersionId: "dna", amazonFrozenAt: "a" });
  assert.deepEqual(panel.radarArticleBlueprintFreezeOfInvestigation({ google: { frozenAt: "g" }, amazon: null }, null), { frozenAt: "g", bundleId: null, bundleHash: null, amazonFrozenAt: null });
  /* Sem a aba da Amazon na página, o painel não confere a Amazon (como antes). */
  assert.equal("amazonFrozenAt" in panel.radarArticleBlueprintFreezeOfInvestigation({ google: { frozenAt: "g" } }, null)!, false);
  assert.deepEqual(panel.radarArticleBlueprintFreezeOfInvestigation({ google: null, amazon: { finalizedAt: "a" }, youtube: { finalizedAt: "y" } }, null), { frozenAt: "a", bundleId: null, bundleHash: null, amazonFrozenAt: "a" });
  assert.deepEqual(panel.radarArticleBlueprintFreezeOfInvestigation({ google: null, amazon: null, youtube: { finalizedAt: "y" } }, null)?.frozenAt, "y");
  assert.equal(panel.radarArticleBlueprintFreezeOfInvestigation({ google: null }, null), null);
  const versao = (state: "APPROVED" | "DRAFT", bundleHash: string) => ({ versionNumber: 1, state, origin: "ai" as const, bundleHash });
  assert.equal(panel.radarArticleBlueprintDeliveryOf([versao("APPROVED", "A")], "A", null), "approved");
  assert.equal(panel.radarArticleBlueprintDeliveryOf([versao("DRAFT", "A")], "A", null), "missing", "o rascunho antigo não vale para a entrega");
  assert.equal(panel.radarArticleBlueprintDeliveryOf([], "A", null), "missing");
});

test("E · a tela: o botão do próprio pedido diz o custo; a barra de lote organiza a seleção ou o Silo; o envio organiza e envia", async () => {
  const pagina = semComentarios(await ler("modules/radar/radar-page.tsx"));
  /* O export que parou: o MESMO botão do card diz o custo e abre a confirmação (sem pedir de novo à rota). */
  assert.match(pagina, /<span>\{paradoDoCsv \?\? "Exportar CSV"\}<\/span>/);
  assert.match(pagina, /\{paradoDoVideo \?\? "CSV para vídeo e redes sociais"\}/);
  assert.match(pagina, /\{paradoDoSiloTecnico \?\? "Silo completo · técnico"\}/);
  assert.match(pagina, /\{paradoDosSelecionadosTecnico \?\? "Artigos selecionados · técnico"\}/);
  for (const funcao of ["const exportarDossiesFinalizados", "const exportarSilosCompletos"]) {
    const corpo = pagina.slice(pagina.indexOf(funcao), pagina.indexOf("await fetch(\"/api/editorial/radar-export\"", pagina.indexOf(funcao)));
    assert.match(corpo, /if \(pedidoParadoPorArtigoModelo\("(dossies|silos)", modo, (alvo|escopo\.articleIds)\)\) \{ setConfirmandoArtigoModelo\(true\); return; \}/, `${funcao} pede de novo à rota em vez de abrir a confirmação`);
  }
  /*
   * Organizar o que a rota apontou: em série, e o mesmo pedido no fim. 2026-10-09
   * (correção) · com `ifMissing`: o 409 é do instante, e quem foi organizado
   * pelo painel depois dele não é pago de novo.
   */
  const organizar = pagina.slice(pagina.indexOf("const organizarArtigosModeloEExportar"), pagina.indexOf("const organizarArtigosModeloEmLote"));
  assert.match(organizar, /organizeRadarArticleBlueprintsThenRun\(\{/);
  assert.match(organizar, /postRadarArticleBlueprintOrganize\(\{ brandId: marca, articleId, ifMissing: true \}\)/);
  assert.match(organizar, /marcarFaltaArtigoModelo\(null\);\s*if \(parado\.pedido === "silos" && parado\.modo !== "video"\) await exportarSilosCompletos\(parado\.modo\);\s*else await exportarDossiesFinalizados\(parado\.modo\);/);
  /* A barra de lote: "só se faltar", com progresso, e o teto no botão. */
  const lote = pagina.slice(pagina.indexOf("const organizarArtigosModeloEmLote"), pagina.indexOf("const fronteiraDoRedator"));
  assert.match(lote, /postRadarArticleBlueprintOrganize\(\{ brandId: marca, articleId, ifMissing: true \}\)/);
  assert.match(lote, /setNotice\(radarArticleBlueprintProgressNotice\(job\)\)/);
  assert.match(pagina, /renderBulkBar=\{rows => <div className="flex min-w-max flex-wrap items-center gap-2"><RadarR4BulkOperationsBar selectedRows=\{selectedSnapshotsFor\(rows\)\} onAction=\{handleBulkAction\}\/>\{barraDoArtigoModelo\(rows\)\}<\/div>\}/);
  const barra = pagina.slice(pagina.indexOf("const barraDoArtigoModelo"), pagina.indexOf("const importable ="));
  assert.match(barra, /label=\{radarArticleBlueprintBatchLabel\(daSelecao\.length\)\}/);
  assert.match(barra, /label=\{radarArticleBlueprintBatchLabel\(doSilo\.length, "silo"\)\}/);
  /* O envio: recusado por falta de planta, o botão organiza e envia pela mesma porta. */
  assert.match(pagina, /if \(resultado\.code === RADAR_HANDOFF_ARTICLE_BLUEPRINT_MISSING\) \{/);
  const envio = pagina.slice(pagina.indexOf("const organizarArtigoModeloEEnviar"), pagina.indexOf("const enviarAoRedator"));
  assert.match(envio, /run: \(\) => postRadarWriterHandoff\(\{ brandId: target\.brandId, articleId: target\.articleId \}\)/);
  /* 2026-10-09 (correção) · a planta concluída que já existe não é paga de novo antes do envio. */
  assert.match(envio, /postRadarArticleBlueprintOrganize\(\{ brandId: target\.brandId, articleId, ifMissing: true \}\)/);
  assert.equal(/useEffect\([^)]*organizarArtigo/.test(pagina), false, "nenhuma chamada de IA nasce de efeito");

  const bancada = semComentarios(await ler("modules/radar/radar-r3-workbench.tsx"));
  const envioNaTela = bancada.slice(bancada.indexOf("function WriterHandoff("), bancada.indexOf("function DeepResearch("));
  assert.match(envioNaTela, /label=\{RADAR_ARTICLE_BLUEPRINT_ORGANIZE_AND_SEND_LABEL\}/);
  assert.match(envioNaTela, /tab\.articleBlueprint === "loading"/);
  assert.ok(envioNaTela.indexOf("RADAR_ARTICLE_BLUEPRINT_ORGANIZE_AND_SEND_LABEL") < envioNaTela.indexOf("\"Enviar ao Redator\""), "sem planta, o envio direto não aparece");
  /* Sistema visual: nenhum texto abaixo de 14px nem cor fixa no que esta rodada pôs na tela. */
  for (const trecho of [envioNaTela, barra, pagina.slice(pagina.indexOf("data-testid=\"radar-artigo-modelo-do-export\""), pagina.indexOf("data-testid=\"radar-artigo-modelo-do-export\"") + 800)]) {
    assert.equal(/text-xs|#[0-9a-f]{3,6}\b|rgb\(/i.test(trecho), false);
  }
});

/* ======================= F · a planta concluída que já existe continua valendo ======================= */

test("F · congelamento sagrado: a planta concluída gravada antes (sem a marca de aprovação no payload) continua sendo a planta do artigo", () => {
  const antiga = plantaConcluidaDaBancada("Planta de 08/10") as Record<string, unknown>;
  delete antiga.approval;
  assert.equal(radarPortableExportHasApprovedBlueprint({ blueprint: antiga as never }), true);
  assert.equal(radarPortableExportHasApprovedBlueprint({ blueprint: { ...antiga, approval: "APPROVED" } as never }), true);
  assert.equal(radarPortableExportHasApprovedBlueprint({ blueprint: null }), false);
  assert.equal(radarPortableExportHasApprovedBlueprint({ blueprint: { ...antiga, approval: "DRAFT" } as never }), false);
});

test("PROVIDER_CALLS = 0: nenhum pedido saiu do banco simulado", () => {
  assert.deepEqual(foraDoBanco, []);
});
