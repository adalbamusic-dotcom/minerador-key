import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  radarArticleBlueprintFitsInvestigation,
  radarArticleBlueprintInvestigationRefOf,
  radarArticleBlueprintOfPanelFreeze,
  radarArticleBlueprintPick,
  type RadarArticleBlueprintCurrentInvestigation,
  type RadarArticleBlueprintVersionMeta,
} from "../lib/radar/article-blueprint-freeze.ts";
import {
  radarArticleBlueprintCurrentInvestigationOf,
  radarArticleBlueprintExportChoice,
  readApprovedRadarArticleBlueprints,
  readRadarArticleBlueprintsForExport,
} from "../lib/server/radar-article-blueprint-read.ts";
import { editRadarArticleBlueprint, generateRadarArticleBlueprint, radarArticleBlueprintRowForInvestigation } from "../lib/server/radar-article-blueprint.ts";
import { radarArticleBlueprintPanelChoice } from "../modules/radar/radar-article-blueprint-panel.tsx";

/*
 * ===== 2026-10-08 · P0-A · O ARTIGO-MODELO NÃO SOME (NEM É PAGO DE NOVO) POR MUDANÇA DE CÓDIGO =====
 *
 * Nos 8 CSVs "Para escrever" do Silo de 08/10, só um saiu com o artigo-modelo:
 * nos outros 7, o hash do dossiê montado ao vivo mudou com o código que lê a
 * amostra (recorte pela seleção, URL pedida, filtros), e a planta concluída —
 * presa àquele hash — sumiu. Prova-se aqui, com banco falso e sem rede:
 *
 *   1. hash exato → usa;
 *   2. outro hash, mesmo congelamento e mesmo ArticleDNA → usa (referência
 *      gravada na versão nova; relógio na versão antiga);
 *   3. re-congelada ou ArticleDNA novo → não usa;
 *   4. o `ifMissing` reaproveita sem chamada paga; re-congelada, organiza;
 *   5. a versão antiga (sem os campos novos) continua legível;
 *   6. a edição carrega a referência da versão editada; o painel reconhece o
 *      congelamento pela mesma regra.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  configurable: true,
  writable: true,
});

/* ================================ fixtures ================================ */

const MARCA = "aaaaaaaa-0000-4000-8000-000000000001";
const ARTIGO = "artigo-instagram";
const CONGELADO_EM = "2026-10-05T12:00:00.000Z";
const HASH_AO_VIVO = "bundle-hash:depois-do-codigo";
const HASH_DE_ANTES = "bundle-hash:antes-do-codigo";

const atual = (extra: Partial<RadarArticleBlueprintCurrentInvestigation> = {}): RadarArticleBlueprintCurrentInvestigation => ({
  frozenAt: CONGELADO_EM, frozenBundleId: "bundle:f1", frozenBundleHash: "aaaa1111",
  articleDnaVersionId: "dna-v2", articleDnaContentHash: "sha256:dna2",
  articleDnaFrom: "2026-10-01T10:00:00.000Z", articleDnaUntil: null,
  ...extra,
});

const referencia = (extra: Record<string, unknown> = {}) => ({
  frozenAt: CONGELADO_EM, frozenBundleId: "bundle:f1", frozenBundleHash: "aaaa1111",
  articleDnaVersionId: "dna-v2", articleDnaContentHash: "sha256:dna2", ...extra,
});

const versao = (id: string, numero: number, bundleHash: string, extra: Partial<RadarArticleBlueprintVersionMeta> = {}): RadarArticleBlueprintVersionMeta => ({
  id, bundleHash, versionNumber: numero, state: "APPROVED", createdAt: "2026-10-06T09:00:00+00:00", ...extra,
});

function planta(h1: string, investigationRef?: unknown) {
  return {
    schemaVersion: 1,
    blueprint: {
      keywordPlan: { reading: "A principal pede o passo a passo.", principalPlacement: ["H1"], complementary: [], slugNote: null },
      reader: "Dona de clínica de estética", promise: "Atrair pacientes pelo Instagram sem anúncio",
      angle: { statement: "Perfil que responde vence perfil que posta", evidence: [] },
      title: { h1, alternatives: [], seoTitle: h1, metaDescription: "Como atrair pacientes pelo Instagram." },
      opening: { readerQuestion: "Por que o Instagram não traz pacientes?", direction: "Responder no primeiro parágrafo.", evidence: [] },
      sections: [{ h2: "Otimize a bio", readerQuestion: "O que pôr na bio?", answerFirst: "Diga quem atende e onde.", h3: [], paragraphs: 3, bold: [], internalLinks: [], externalLinks: [], explain: [], terms: [], evidence: [], specialist: null, video: null, image: null, practical: null }],
      closing: { turn: "Quem quer mais precisa de método.", specialist: null, cta: "Agende uma conversa.", nextStep: "" },
      visual: [], eeat: [], warnings: [],
    },
    measures: {
      serp: { comparablePages: 6, words: { median: 1500, p25: 1200, p75: 1800 }, h2: 6, h3: 4, paragraphs: 20, images: 3, lists: 2 },
      plan: { sections: 1, h3: 0, paragraphs: 3, bold: 0, images: 0, respites: 0, internalLinks: 0, externalLinks: 0, wordsMin: 1200, wordsMax: 1800 },
    },
    linkCandidates: [], sources: [], evidence: [],
    ...(investigationRef ? { investigationRef } : {}),
  };
}

type Linha = Record<string, unknown>;

const linhaDaPlanta = (id: string, article: string, numero: number, hash: string, extra: { createdAt?: string; state?: string; ref?: unknown; h1?: string; brand?: string } = {}): Linha => ({
  id, brand_id: extra.brand ?? MARCA, article_id: article, bundle_hash: hash, version_number: numero, state: extra.state ?? "APPROVED", origin: "ai",
  payload: planta(extra.h1 ?? `H1 de ${id}`, extra.ref), validation: [], created_by: "ator-1", created_at: extra.createdAt ?? "2026-10-06T09:00:00+00:00",
  approved_by: (extra.state ?? "APPROVED") === "APPROVED" ? "ator-1" : null, approved_at: (extra.state ?? "APPROVED") === "APPROVED" ? "2026-10-06T09:00:00+00:00" : null,
});

/* Caminho do PostgREST (`apelido:coluna->chave`): a falta vira null, como no remoto. */
function extrair(linha: Linha, expressao: string): unknown {
  const [coluna, ...chaves] = expressao.split("->");
  let valor: unknown = linha[coluna];
  for (const chave of chaves) valor = valor && typeof valor === "object" ? (valor as Linha)[chave] : undefined;
  return valor === undefined ? null : valor;
}

/**
 * O banco falso do artigo-modelo: filtra, ordena por versão, projeta os
 * caminhos e registra cada consulta. Qualquer outra tabela é a sentinela de
 * que o fluxo seguiu para a IA (credencial, cota): nada aqui chega a provider.
 */
function bancoFalso(linhas: Linha[]) {
  const consultas: Array<{ select: string; filtros: string[] }> = [];
  const inseridas: Linha[] = [];
  const client = {
    from(tabela: string) {
      if (tabela !== "radar_article_blueprints") throw new Error(`SEGUIU_PARA_A_IA:${tabela}`);
      const filtros: Array<(linha: Linha) => boolean> = [];
      const registro = { select: "", filtros: [] as string[] };
      let limite = Number.POSITIVE_INFINITY;
      const consulta: Record<string, unknown> = {
        select(lista: string) { registro.select = lista; return consulta; },
        eq(campo: string, valor: unknown) { registro.filtros.push(`${campo}=${String(valor)}`); filtros.push(linha => linha[campo] === valor); return consulta; },
        in(campo: string, valores: unknown[]) { registro.filtros.push(`${campo} in ${valores.join("|")}`); filtros.push(linha => valores.includes(linha[campo])); return consulta; },
        order() { return consulta; },
        limit(n: number) { limite = n; return consulta; },
        insert(linha: Linha) {
          const gravada = { ...linha, id: `nova-${inseridas.length + 1}`, created_at: "2026-10-08T10:00:00+00:00" };
          inseridas.push(gravada);
          const retorno = { select() { return retorno; }, single() { return Promise.resolve({ data: gravada, error: null }); } };
          return retorno;
        },
        then(resolver: (valor: unknown) => unknown, rejeitar: (erro: unknown) => unknown) {
          consultas.push(registro);
          const colunas = registro.select.split(",");
          const data = linhas.filter(linha => filtros.every(filtro => filtro(linha)))
            .sort((a, b) => Number(b.version_number) - Number(a.version_number)).slice(0, limite)
            .map(linha => Object.fromEntries(colunas.map(coluna => {
              const [apelido, expressao] = coluna.includes(":") ? [coluna.slice(0, coluna.indexOf(":")), coluna.slice(coluna.indexOf(":") + 1)] : [coluna, coluna];
              return [apelido, extrair(linha, expressao)];
            })));
          return Promise.resolve({ data, error: null }).then(resolver, rejeitar);
        },
      };
      return consulta;
    },
  };
  return { client: client as never, consultas, inseridas };
}

/* ============================== a regra pura ============================== */

test("1 · hash exato do dossiê → usa (a concluída; o rascunho antigo só pelo hash exato e só para quem aceita rascunho)", () => {
  const versoes = [versao("v4", 4, HASH_DE_ANTES, { investigationRef: referencia() }), versao("v3", 3, HASH_AO_VIVO)];
  assert.deepEqual(radarArticleBlueprintPick(versoes, { bundleHash: HASH_AO_VIVO, investigation: atual() }), { id: "v3", approval: "APPROVED", basis: "bundle" }, "hash exato vem primeiro");
  const rascunho = [versao("v5", 5, HASH_AO_VIVO, { state: "DRAFT" })];
  assert.deepEqual(radarArticleBlueprintPick(rascunho, { bundleHash: HASH_AO_VIVO }, { drafts: true }), { id: "v5", approval: "DRAFT", basis: "bundle" });
  assert.equal(radarArticleBlueprintPick(rascunho, { bundleHash: HASH_AO_VIVO, investigation: atual() }), null, "sem aceitar rascunho (Redator, ifMissing), o rascunho não vale");
  assert.equal(radarArticleBlueprintPick([versao("v6", 6, HASH_DE_ANTES, { state: "DRAFT", investigationRef: referencia() })], { bundleHash: HASH_AO_VIVO, investigation: atual() }, { drafts: true }), null, "pela investigação, só a concluída");
});

test("2 · outro hash, mesmo congelamento e mesmo ArticleDNA → usa: a referência gravada (versão nova) e o relógio (versão antiga)", () => {
  const nova = versao("v2", 2, HASH_DE_ANTES, { investigationRef: referencia() });
  assert.deepEqual(radarArticleBlueprintPick([nova], { bundleHash: HASH_AO_VIVO, investigation: atual() }), { id: "v2", approval: "APPROVED", basis: "investigation" });
  const comOffset = versao("v2", 2, HASH_DE_ANTES, { investigationRef: referencia({ frozenAt: "2026-10-05T12:00:00+00:00" }) });
  assert.ok(radarArticleBlueprintFitsInvestigation(comOffset, [comOffset], atual()), "o mesmo instante com +00:00 (PostgREST) é o mesmo congelamento");

  const antiga = versao("v1", 1, HASH_DE_ANTES, { createdAt: "2026-10-06T09:00:00+00:00" });
  assert.deepEqual(radarArticleBlueprintPick([antiga], { bundleHash: HASH_AO_VIVO, investigation: atual() }), { id: "v1", approval: "APPROVED", basis: "investigation" }, "versão antiga: nascida depois do congelamento, com o ArticleDNA vigente");

  /* A concluída mais nova da investigação vale (o dono reorganizou depois). */
  const duas = [antiga, versao("v7", 7, "bundle-hash:outra-leitura", { investigationRef: referencia() })];
  assert.equal(radarArticleBlueprintPick(duas, { bundleHash: HASH_AO_VIVO, investigation: atual() })?.id, "v7");
  assert.equal(radarArticleBlueprintInvestigationRefOf({ frozenAt: CONGELADO_EM }), null, "referência sem ArticleDNA não é referência");
});

test("3 · investigação re-congelada ou ArticleDNA novo → não usa (como hoje)", () => {
  const casos: Array<[string, RadarArticleBlueprintVersionMeta[], RadarArticleBlueprintCurrentInvestigation]> = [
    ["re-congelada (outro instante)", [versao("v2", 2, HASH_DE_ANTES, { investigationRef: referencia({ frozenAt: "2026-10-02T08:00:00.000Z" }) })], atual()],
    ["re-congelada (outro pacote congelado)", [versao("v2", 2, HASH_DE_ANTES, { investigationRef: referencia({ frozenBundleId: "bundle:f0" }) })], atual()],
    ["ArticleDNA novo (outra versão)", [versao("v2", 2, HASH_DE_ANTES, { investigationRef: referencia({ articleDnaVersionId: "dna-v1" }) })], atual()],
    ["ArticleDNA com outro conteúdo", [versao("v2", 2, HASH_DE_ANTES, { investigationRef: referencia({ articleDnaContentHash: "sha256:outro" }) })], atual()],
    ["antiga organizada antes do congelamento vigente", [versao("v1", 1, HASH_DE_ANTES, { createdAt: "2026-10-04T09:00:00+00:00" })], atual()],
    ["antiga organizada antes da versão vigente do ArticleDNA", [versao("v1", 1, HASH_DE_ANTES)], atual({ articleDnaFrom: "2026-10-07T09:00:00.000Z" })],
    ["antiga organizada depois que outra versão do ArticleDNA a substituiu", [versao("v1", 1, HASH_DE_ANTES)], atual({ articleDnaUntil: "2026-10-05T18:00:00.000Z" })],
    ["antiga sem a vigência do ArticleDNA conhecida", [versao("v1", 1, HASH_DE_ANTES)], atual({ articleDnaFrom: null })],
    ["antiga sem data", [versao("v1", 1, HASH_DE_ANTES, { createdAt: null })], atual()],
  ];
  for (const [motivo, versoes, investigacao] of casos) {
    assert.equal(radarArticleBlueprintPick(versoes, { bundleHash: HASH_AO_VIVO, investigation: investigacao }), null, motivo);
  }
  /* A edição feita HOJE de uma planta do congelamento anterior é daquela investigação: a família conta pela primeira versão. */
  const familia = [versao("v1", 1, HASH_DE_ANTES, { createdAt: "2026-10-04T09:00:00+00:00", state: "DRAFT" }), versao("v5", 5, HASH_DE_ANTES, { createdAt: "2026-10-07T09:00:00+00:00" })];
  assert.equal(radarArticleBlueprintPick(familia, { bundleHash: HASH_AO_VIVO, investigation: atual() }), null, "edição de planta antiga não vira da investigação nova");
  /* Sem a investigação vigente, a regra é a de antes: só o hash exato. */
  assert.equal(radarArticleBlueprintPick([versao("v2", 2, HASH_DE_ANTES, { investigationRef: referencia() })], { bundleHash: HASH_AO_VIVO }), null);
});

test("a investigação vigente sai do que o lote já leu: congelamento do perfil primário, pacote do Google e a vigência do ArticleDNA", () => {
  const google = { finalizedBundle: { bundleId: "bundle:f1", bundleHash: "aaaa1111", frozenAt: CONGELADO_EM }, amazonFrozenInvestigation: { finalizedAt: "2026-10-07T00:00:00.000Z" } };
  assert.deepEqual(radarArticleBlueprintCurrentInvestigationOf({
    analysisPayload: google,
    article: { versionId: "dna-v2", contentHash: "sha256:dna2", createdAt: "2026-10-01T10:00:00.000Z", versionNumber: 2 },
    articleVersions: [{ versionNumber: 1, createdAt: "2026-09-01T10:00:00.000Z" }, { versionNumber: 2, createdAt: "2026-10-01T10:00:00.000Z" }, { versionNumber: 4, createdAt: "2026-10-09T10:00:00.000Z" }, { versionNumber: 3, createdAt: "2026-10-08T10:00:00+00:00" }],
  }), {
    frozenAt: CONGELADO_EM, frozenBundleId: "bundle:f1", frozenBundleHash: "aaaa1111",
    articleDnaVersionId: "dna-v2", articleDnaContentHash: "sha256:dna2",
    /* 2026-10-09 · a investigação considerada não é só a do Google: o congelamento da Amazon (acréscimo de review) entra no vínculo. */
    amazonFrozenAt: "2026-10-07T00:00:00.000Z",
    articleDnaFrom: "2026-10-01T10:00:00.000Z", articleDnaUntil: "2026-10-08T10:00:00.000Z",
  }, "o Google manda; a vigência fecha na versão seguinte mais antiga");
  const soAmazon = radarArticleBlueprintCurrentInvestigationOf({ analysisPayload: { amazonFrozenInvestigation: { finalizedAt: "2026-10-07T00:00:00.000Z" } }, article: { versionId: "dna-v2", createdAt: null, versionNumber: 2 } });
  assert.equal(soAmazon?.frozenAt, "2026-10-07T00:00:00.000Z");
  assert.equal(soAmazon?.amazonFrozenAt, "2026-10-07T00:00:00.000Z");
  assert.equal(soAmazon?.frozenBundleId, null);
  assert.equal(soAmazon?.articleDnaUntil, null, "sem as versões, a vigência fica aberta");
  assert.equal(radarArticleBlueprintCurrentInvestigationOf({ analysisPayload: { finalizedBundle: null }, article: { versionId: "dna-v2" } }), null, "não congelada: sem investigação");
});

/* ============================== a leitura do export ============================== */

test("export · banco falso: o hash mudado por código não desliga a planta; re-congelada e ArticleDNA novo, sim; a antiga continua legível", async () => {
  const banco = bancoFalso([
    linhaDaPlanta("a1-v1", "a1", 1, HASH_DE_ANTES, { h1: "Planta antiga, sem referência" }),
    linhaDaPlanta("a2-v1", "a2", 1, HASH_DE_ANTES, { ref: referencia(), h1: "Planta nova, com referência" }),
    linhaDaPlanta("a3-v1", "a3", 1, HASH_DE_ANTES, { createdAt: "2026-10-04T09:00:00+00:00" }),
    linhaDaPlanta("a4-v1", "a4", 1, HASH_DE_ANTES, { ref: referencia({ articleDnaVersionId: "dna-v1" }) }),
    linhaDaPlanta("a5-v1", "a5", 1, HASH_AO_VIVO, { h1: "Hash exato" }),
    linhaDaPlanta("a1-outra-marca", "a1", 9, HASH_DE_ANTES, { brand: "bbbbbbbb-0000-4000-8000-000000000002", h1: "PLANTA-DE-OUTRA-MARCA" }),
  ]);
  const artigos = ["a1", "a2", "a3", "a4", "a5"].map(articleId => ({ articleId, bundleHash: HASH_AO_VIVO, investigation: atual() }));
  const lidos = await readRadarArticleBlueprintsForExport(banco.client, MARCA, artigos);
  assert.equal(lidos.get("a1")?.blueprint.title.h1, "Planta antiga, sem referência", "versão antiga (sem os campos novos): vale pelo relógio");
  assert.equal(lidos.get("a1")?.approval, "APPROVED");
  assert.equal(lidos.get("a2")?.blueprint.title.h1, "Planta nova, com referência");
  assert.equal(lidos.has("a3"), false, "re-congelada depois da planta: não vale");
  assert.equal(lidos.has("a4"), false, "ArticleDNA novo: não vale");
  assert.equal(lidos.get("a5")?.blueprint.title.h1, "Hash exato");
  assert.doesNotMatch(JSON.stringify([...lidos.values()]), /PLANTA-DE-OUTRA-MARCA/);

  const [metadados, conteudo] = banco.consultas;
  assert.equal(metadados.select, "id,article_id,bundle_hash,version_number,state,created_at,ir:payload->investigationRef");
  assert.ok(!metadados.select.split(",").includes("payload"), "os metadados nunca trazem a planta");
  assert.ok(metadados.filtros.includes(`brand_id=${MARCA}`));
  assert.equal(conteudo.filtros.find(filtro => filtro.startsWith("id in")), "id in a1-v1|a2-v1|a5-v1", "só os payloads escolhidos");
  assert.equal(banco.consultas.length, 2);

  /* Antes desta correção (sem a investigação), a mesma leitura perdia as três plantas de outro hash — e a consulta é a de sempre. */
  const antes = bancoFalso([linhaDaPlanta("a1-v1", "a1", 1, HASH_DE_ANTES), linhaDaPlanta("a2-v1", "a2", 1, HASH_DE_ANTES, { ref: referencia() })]);
  assert.equal((await readRadarArticleBlueprintsForExport(antes.client, MARCA, [{ articleId: "a1", bundleHash: HASH_AO_VIVO }, { articleId: "a2", bundleHash: HASH_AO_VIVO }])).size, 0);
  assert.equal(antes.consultas[0].select, "id,article_id,bundle_hash,version_number,state", "sem investigação, nem as colunas novas são pedidas");

  /* A escolha pura com e sem a investigação. */
  const linhas = [{ id: "v1", articleId: "a1", bundleHash: HASH_DE_ANTES, versionNumber: 1, state: "APPROVED", createdAt: "2026-10-06T09:00:00+00:00" }];
  assert.deepEqual(Object.fromEntries(radarArticleBlueprintExportChoice(linhas, new Map([["a1", HASH_AO_VIVO]]), new Map([["a1", atual()]]))), { a1: { id: "v1", approval: "APPROVED" } }, "o CSV não marca nada a mais (D10)");
  assert.equal(radarArticleBlueprintExportChoice(linhas, new Map([["a1", HASH_AO_VIVO]])).size, 0);
});

test("export · a leitura só do aprovado aplica a mesma regra", async () => {
  const banco = bancoFalso([
    linhaDaPlanta("a1-v1", "a1", 1, HASH_DE_ANTES, { h1: "Concluída da mesma investigação" }),
    linhaDaPlanta("a2-v1", "a2", 1, HASH_DE_ANTES, { createdAt: "2026-10-04T09:00:00+00:00" }),
  ]);
  const lidos = await readApprovedRadarArticleBlueprints(banco.client, MARCA, [{ articleId: "a1", bundleHash: HASH_AO_VIVO, investigation: atual() }, { articleId: "a2", bundleHash: HASH_AO_VIVO, investigation: atual() }]);
  assert.equal(lidos.get("a1")?.blueprint.title.h1, "Concluída da mesma investigação");
  assert.equal(lidos.has("a2"), false);
  assert.ok(banco.consultas[0].filtros.includes("state=APPROVED"));
});

test("o núcleo do export passa a investigação vigente que o laço já leu (nenhuma leitura nova)", async () => {
  const nucleo = (await readFile(new URL("../lib/server/radar-portable-export-core.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(nucleo, /const investigacao = radarArticleBlueprintCurrentInvestigationOf\(\{\n\s+analysisPayload: payload,\n\s+article,\n\s+articleVersions: artefatos\.articles\.filter\(versao => versao\.payload\.articleId === articleId && versao\.payload\.brandId === input\.brandId\),\n\s+\}\);/);
  assert.match(nucleo, /investigation: congelamentos\.get\(item\.articleId\) \?\? null,/);
  assert.match(nucleo, /return \{ exportedAt, montadas, identificacao, recusados, publicacoes, lentes, plano, planoDaSelecao, brandVoice, congelamentos \};/);
});

/* ============================== o ifMissing e a gravação ============================== */

const montagemFalsa = (investigacao: RadarArticleBlueprintCurrentInvestigation | null) => (async () => ({
  montada: {
    bundleHash: HASH_AO_VIVO,
    /* Ler a entrada é montar o pedido à IA: a sentinela prova que o fluxo seguiu para organizar. */
    get entrada(): never { throw new Error("SEGUIU_PARA_A_IA:montagem do pedido"); },
  },
  silo: null, publicacao: null, brandVoice: { kind: "none" as const }, investigacao,
})) as never;

test("4 · ifMissing: a concluída da mesma investigação é reaproveitada SEM chamada paga; re-congelada ou ArticleDNA novo, organiza", async () => {
  const linhas = [linhaDaPlanta("v1", ARTIGO, 1, HASH_DE_ANTES, { h1: "Organizada antes da mudança de código" })];
  const base = { brandId: MARCA, articleId: ARTIGO, actorUserId: "ator-1", ifMissing: true };

  const banco = bancoFalso(linhas);
  const reaproveitada = await generateRadarArticleBlueprint({ ...base, client: banco.client, assemble: montagemFalsa(atual()) });
  assert.equal(reaproveitada.id, "v1", "mesma investigação: devolve a versão que existe");
  assert.equal(banco.consultas.length, 1, "só a lista das versões: nada de credencial, cota ou IA");
  assert.equal(banco.inseridas.length, 0, "nenhuma versão nova");

  for (const [motivo, investigacao] of [
    ["re-congelada", atual({ frozenAt: "2026-10-07T12:00:00.000Z", frozenBundleId: "bundle:f2" })],
    ["ArticleDNA novo", atual({ articleDnaVersionId: "dna-v3", articleDnaFrom: "2026-10-07T12:00:00.000Z" })],
    ["investigação desconhecida", null],
  ] as const) {
    const outro = bancoFalso(linhas);
    await assert.rejects(generateRadarArticleBlueprint({ ...base, client: outro.client, assemble: montagemFalsa(investigacao) }), /SEGUIU_PARA_A_IA/, motivo);
  }
  /* O botão do painel (sem ifMissing) organiza de novo de propósito. */
  await assert.rejects(generateRadarArticleBlueprint({ ...base, ifMissing: false, client: bancoFalso(linhas).client, assemble: montagemFalsa(atual()) }), /SEGUIU_PARA_A_IA/);

  /* A mesma escolha que o ifMissing usa, sobre as linhas do banco. */
  const daLinha = (id: string, numero: number, hash: string, criada: string, estado: "APPROVED" | "DRAFT" = "APPROVED") => ({
    id, articleId: ARTIGO, bundleHash: hash, versionNumber: numero, state: estado, origin: "ai" as const, payload: planta(id) as never,
    validation: [], createdBy: "ator-1", createdAt: criada, approvedBy: null, approvedAt: null,
  });
  assert.equal(radarArticleBlueprintRowForInvestigation([daLinha("v2", 2, HASH_DE_ANTES, "2026-10-06T09:00:00+00:00", "DRAFT")], { bundleHash: HASH_AO_VIVO, investigation: atual() }), null, "rascunho antigo de outro hash não é reaproveitado");

  const servidor = (await readFile(new URL("../lib/server/radar-article-blueprint.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const corpo = servidor.slice(servidor.indexOf("export async function generateRadarArticleBlueprint"));
  const reaproveita = corpo.indexOf("radarArticleBlueprintRowForInvestigation(existentes, { bundleHash: montada.bundleHash, investigation: investigacao })");
  assert.ok(reaproveita > 0 && reaproveita < corpo.indexOf("resolveDeepSeekCanonicalConfig(") && reaproveita < corpo.indexOf("requestRadarArticleBlueprintAi("), "a checagem vem antes de qualquer chamada paga");
  assert.match(corpo, /actorUserId: input\.actorUserId, investigationRef: investigacao \}\);/, "a versão organizada grava a investigação em que nasceu");
});

test("6 · a edição copia a referência da versão editada (a antiga segue sem ela, pela família do bundle_hash)", async () => {
  const banco = bancoFalso([
    linhaDaPlanta("v2", ARTIGO, 2, HASH_DE_ANTES, { ref: referencia() }),
    linhaDaPlanta("v1", ARTIGO, 1, "bundle-hash:mais-antigo"),
  ]);
  const editada = await editRadarArticleBlueprint({ client: banco.client, brandId: MARCA, articleId: ARTIGO, blueprintId: "v2", edit: { title: { h1: "Como atrair pacientes pelo Instagram" } }, actorUserId: "ator-1" });
  const gravada = banco.inseridas[0];
  assert.equal(gravada.bundle_hash, HASH_DE_ANTES);
  assert.equal(gravada.state, "APPROVED");
  assert.deepEqual((gravada.payload as Linha).investigationRef, referencia(), "a investigação da versão editada");
  assert.equal(editada.payload.blueprint.title.h1, "Como atrair pacientes pelo Instagram");

  const antiga = bancoFalso([linhaDaPlanta("v1", ARTIGO, 1, "bundle-hash:mais-antigo")]);
  await editRadarArticleBlueprint({ client: antiga.client, brandId: MARCA, articleId: ARTIGO, blueprintId: "v1", edit: { title: { h1: "Outro H1" } }, actorUserId: "ator-1" });
  assert.equal("investigationRef" in (antiga.inseridas[0].payload as Linha), false, "edição de versão antiga não inventa referência");
});

test("6 · o painel reconhece o congelamento vigente pela mesma regra (a página passa o hash do pacote CONGELADO, não o do dossiê)", () => {
  const congelamento = { frozenAt: CONGELADO_EM, bundleId: "bundle:f1", bundleHash: "aaaa1111" };
  type V = { id: string; versionNumber: number; state: "DRAFT" | "APPROVED"; origin: "ai" | "human_edit"; bundleHash?: string; createdAt?: string | null; payload?: unknown };
  const v = (id: string, numero: number, hash: string, criada: string, ref?: unknown): V => ({ id, versionNumber: numero, state: "APPROVED", origin: "ai", bundleHash: hash, createdAt: criada, payload: ref ? { investigationRef: ref } : {} });

  const antigas = [v("v2", 2, HASH_DE_ANTES, "2026-10-06T09:00:00+00:00"), v("v1", 1, "bundle-hash:outro-congelamento", "2026-10-04T09:00:00+00:00")];
  const escolha = radarArticleBlueprintPanelChoice(antigas, "aaaa1111", congelamento);
  assert.equal(escolha.shown?.id, "v2", "a antiga organizada depois do congelamento é a que vai aos entregáveis");
  assert.equal(escolha.newestFromOtherFreeze, null);
  assert.equal(escolha.currentConfirmed, true);

  const reCongelada = radarArticleBlueprintPanelChoice(antigas, "bbbb2222", { frozenAt: "2026-10-07T12:00:00.000Z", bundleId: "bundle:f2", bundleHash: "bbbb2222" });
  assert.equal(reCongelada.shown, null, "re-congelada: nenhuma versão vale");
  assert.equal(reCongelada.newestFromOtherFreeze?.id, "v2");

  /* Versão nova: a referência gravada (o hash congelado que a página passa) basta. */
  const nova = [v("v3", 3, HASH_DE_ANTES, "2026-10-06T09:00:00+00:00", referencia())];
  assert.equal(radarArticleBlueprintPanelChoice(nova, "aaaa1111").shown?.id, "v3", "mesmo sem o congelamento inteiro, o hash congelado gravado casa");
  assert.equal(radarArticleBlueprintOfPanelFreeze({ ...versao("v3", 3, HASH_DE_ANTES), investigationRef: referencia({ frozenBundleId: "bundle:f0" }) }, [], congelamento), false);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
