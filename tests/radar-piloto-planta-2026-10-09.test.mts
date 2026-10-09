import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  radarArticleBlueprintFitsInvestigation,
  radarArticleBlueprintInvestigationRefOf,
  radarArticleBlueprintInvestigationRefToStore,
  radarArticleBlueprintOfPanelFreeze,
  radarArticleBlueprintPick,
  radarArticleBlueprintSameAmazonFreeze,
  type RadarArticleBlueprintCurrentInvestigation,
  type RadarArticleBlueprintVersionMeta,
} from "../lib/radar/article-blueprint-freeze.ts";
import {
  RADAR_ARTICLE_BLUEPRINT_UNAVAILABLE,
  RadarArticleBlueprintUnavailableError,
  radarArticleBlueprintCurrentInvestigationOf,
  radarArticleBlueprintExportChoice,
  readApprovedRadarArticleBlueprints,
  readRadarArticleBlueprintsForExport,
} from "../lib/server/radar-article-blueprint-read.ts";
import { generateRadarArticleBlueprint } from "../lib/server/radar-article-blueprint.ts";
import {
  RADAR_ARTICLE_BLUEPRINT_RULES_VERSION,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintColumns,
  radarArticleBlueprintCommercialOf,
  radarArticleBlueprintCommercialOfBlock,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintPublishedMapLine,
  radarArticleBlueprintPublishedMapReading,
  radarArticleBlueprintReading,
  radarArticleBlueprintRulesNoticeText,
  radarSanitizeArticleBlueprint,
} from "../lib/radar/article-blueprint.ts";
import {
  RADAR_WRITING_NEEDS_ARTICLE_BLUEPRINT,
  RadarWritingNeedsArticleBlueprintError,
  buildRadarWritingExportArticle,
  radarWritingBlueprintIsApproved,
  radarWritingExportBlueprintGate,
  type RadarWritingArticleContext,
} from "../lib/radar/portable-writing-export.ts";
import { buildRadarArticleResearchContext, radarResearchContextScopeExclusions, type RadarResearchScopeExclusion } from "../lib/radar/article-research-context.ts";
import { buildRadarResearchFingerprint } from "../lib/radar/deep-research.ts";
import { radarKeywordContextOf } from "../lib/radar/keyword-context.ts";
import { RadarItemSchema, type RadarItem } from "../lib/editorial/operational-flow.ts";
import type { RadarAmazonCommercialBlock } from "../lib/radar/amazon-commercial-block.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import { ARTIGO, contextoDePesquisa, entradaAmazon, entradaGoogle, entradaYoutube } from "./radar-portable-writing-fixtures.mts";
import { plantaDe, respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-09 · O ARTIGO-MODELO COMO FUNDAMENTO ÚNICO (agente PLANTA) =====
 *
 * Regra do dono (2026-10-09): o processo do piloto SUBSTITUI o legado. O CSV
 * "Para escrever" sai só pela planta concluída; o legado vira matéria-prima do
 * gerador. Este arquivo prova, só com fixtures (PROVIDER_CALLS = 0):
 *   1. congelamento sagrado: a planta concluída gravada antes desta rodada segue
 *      vinculada; o contexto sem exclusão é o de antes e o hash não muda;
 *   2. a Amazon congelada no vínculo, de forma aditiva;
 *   3. o `ifMissing` reaproveita só a CONCLUÍDA do mesmo congelamento (o
 *      rascunho não conta) e organiza quando a Amazon foi congelada depois;
 *   4. a falha de leitura da planta é estado explícito (`blueprint_unavailable`);
 *   5. o portão do CSV (`needs_article_blueprint`) e a linha sem legado;
 *   6. a Amazon congelada no pedido (bloco comercial e regra de review);
 *   7. as exclusões dos reajustes (ArticleDNA): fora do hash, no pedido, na
 *      conferência, no "Não cobrir" e na planta já aprovada;
 *   8. a versão das regras e o aviso; D10 nos textos novos.
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

const D10 = [/\bpend[eê]ncia/i, /\bpendente\b/i, /aguardando aprova/i, /rascunho/i, /fonte a obter/i, /\bpreencher\b/i, /peça ao Arquiteto/i, /confira se a coleta traz/i];
/* O trecho de terceiro (snippet entre “…”) é pesquisa citada como veio, não texto do entregável. */
const semD10 = (texto: string, onde: string) => { for (const proibida of D10) assert.doesNotMatch(texto.replace(/“[^”]*”/g, "“…”"), proibida, `${onde}: ${String(proibida)}`); };
const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ================================ o vínculo (fixtures do congelamento) ================================ */

const MARCA = "aaaaaaaa-0000-4000-8000-000000000001";
const CONGELADO_EM = "2026-10-05T12:00:00.000Z";
const AMAZON_EM = "2026-10-07T00:00:00.000Z";
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

type Linha = Record<string, unknown>;
const plantaGravada = (h1: string, investigationRef?: unknown) => ({
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
});
const linhaDaPlanta = (id: string, article: string, numero: number, hash: string, extra: { state?: string; ref?: unknown; h1?: string } = {}): Linha => ({
  id, brand_id: MARCA, article_id: article, bundle_hash: hash, version_number: numero, state: extra.state ?? "APPROVED", origin: "ai",
  payload: plantaGravada(extra.h1 ?? `H1 de ${id}`, extra.ref), validation: [], created_by: "ator-1", created_at: "2026-10-06T09:00:00+00:00",
  approved_by: (extra.state ?? "APPROVED") === "APPROVED" ? "ator-1" : null, approved_at: (extra.state ?? "APPROVED") === "APPROVED" ? "2026-10-06T09:00:00+00:00" : null,
});

function extrair(linha: Linha, expressao: string): unknown {
  const [coluna, ...chaves] = expressao.split("->");
  let valor: unknown = linha[coluna];
  for (const chave of chaves) valor = valor && typeof valor === "object" ? (valor as Linha)[chave] : undefined;
  return valor === undefined ? null : valor;
}

/** O banco falso das plantas (filtra, ordena, projeta). Outra tabela é a sentinela de que o fluxo seguiu para a IA. `falha` faz a leitura responder com erro. */
function bancoFalso(linhas: Linha[], falha: "erro" | "excecao" | null = null) {
  const consultas: Array<{ select: string; filtros: string[] }> = [];
  const inseridas: Linha[] = [];
  const client = {
    from(tabela: string) {
      if (falha === "excecao") throw new Error("conexão recusada");
      if (tabela !== "radar_article_blueprints") throw new Error(`SEGUIU_PARA_A_IA:${tabela}`);
      const filtros: Array<(linha: Linha) => boolean> = [];
      const registro = { select: "", filtros: [] as string[] };
      const consulta: Record<string, unknown> = {
        select(lista: string) { registro.select = lista; return consulta; },
        eq(campo: string, valor: unknown) { registro.filtros.push(`${campo}=${String(valor)}`); filtros.push(linha => linha[campo] === valor); return consulta; },
        in(campo: string, valores: unknown[]) { registro.filtros.push(`${campo} in ${valores.join("|")}`); filtros.push(linha => valores.includes(linha[campo])); return consulta; },
        order() { return consulta; },
        limit() { return consulta; },
        insert(linha: Linha) {
          const gravada = { ...linha, id: `nova-${inseridas.length + 1}`, created_at: "2026-10-09T10:00:00+00:00" };
          inseridas.push(gravada);
          const retorno = { select() { return retorno; }, single() { return Promise.resolve({ data: gravada, error: null }); } };
          return retorno;
        },
        then(resolver: (valor: unknown) => unknown, rejeitar: (erro: unknown) => unknown) {
          consultas.push(registro);
          if (falha === "erro") return Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }).then(resolver, rejeitar);
          const colunas = registro.select.split(",");
          const data = linhas.filter(linha => filtros.every(filtro => filtro(linha)))
            .sort((a, b) => Number(b.version_number) - Number(a.version_number))
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

/* ============================== 1 · o congelamento é sagrado ============================== */

test("1 · congelamento sagrado: a planta concluída gravada ANTES desta rodada (sem a chave da Amazon) segue vinculada, mesmo com a Amazon congelada hoje", async () => {
  /* A referência gravada antes da regra não ganha a chave na leitura (nenhum conteúdo lido muda). */
  const lida = radarArticleBlueprintInvestigationRefOf(referencia());
  assert.ok(lida);
  assert.equal("amazonFrozenAt" in lida!, false);
  assert.deepEqual(lida, referencia());

  const antiga = versao("v2", 2, HASH_DE_ANTES, { investigationRef: referencia() });
  const comAmazon = atual({ amazonFrozenAt: AMAZON_EM });
  assert.ok(radarArticleBlueprintFitsInvestigation(antiga, [antiga], comAmazon), "sem a chave, a planta não confere a Amazon");
  assert.deepEqual(radarArticleBlueprintPick([antiga], { bundleHash: HASH_AO_VIVO, investigation: comAmazon }), { id: "v2", approval: "APPROVED", basis: "investigation" });
  assert.ok(radarArticleBlueprintOfPanelFreeze(antiga, [antiga], { frozenAt: CONGELADO_EM, bundleId: "bundle:f1", amazonFrozenAt: AMAZON_EM }), "o painel também a mostra vinculada");

  /* A leitura do export (banco falso) entrega a planta concluída antiga com a Amazon congelada hoje. */
  const banco = bancoFalso([linhaDaPlanta("a1-v1", "a1", 1, HASH_DE_ANTES, { ref: referencia(), h1: "Concluída antes da regra da Amazon" })]);
  const lidos = await readRadarArticleBlueprintsForExport(banco.client, MARCA, [{ articleId: "a1", bundleHash: HASH_AO_VIVO, investigation: comAmazon }]);
  assert.equal(lidos.get("a1")?.blueprint.title.h1, "Concluída antes da regra da Amazon");
  assert.equal(lidos.get("a1")?.approval, "APPROVED");
});

/* ============================== 2 · a Amazon congelada no vínculo ============================== */

test("2 · a Amazon no vínculo, aditiva: com a chave dos dois lados, o congelamento novo desliga; null = sem Amazon", () => {
  /* A tabela da regra. */
  assert.equal(radarArticleBlueprintSameAmazonFreeze({}, { amazonFrozenAt: AMAZON_EM }), true, "planta antiga: sem conferência");
  assert.equal(radarArticleBlueprintSameAmazonFreeze({ amazonFrozenAt: null }, {}), true, "leitor que não conhece a Amazon (Redator): como antes");
  assert.equal(radarArticleBlueprintSameAmazonFreeze({ amazonFrozenAt: null }, { amazonFrozenAt: null }), true, "sem Amazon dos dois lados");
  assert.equal(radarArticleBlueprintSameAmazonFreeze({ amazonFrozenAt: null }, { amazonFrozenAt: AMAZON_EM }), false, "Amazon congelada depois da planta");
  assert.equal(radarArticleBlueprintSameAmazonFreeze({ amazonFrozenAt: AMAZON_EM }, { amazonFrozenAt: "2026-10-07T00:00:00+00:00" }), true, "o mesmo instante com +00:00");
  assert.equal(radarArticleBlueprintSameAmazonFreeze({ amazonFrozenAt: AMAZON_EM }, { amazonFrozenAt: "2026-10-08T00:00:00.000Z" }), false, "re-congelada");
  assert.equal(radarArticleBlueprintSameAmazonFreeze({ amazonFrozenAt: AMAZON_EM }, { amazonFrozenAt: null }), false, "reaberta");

  /* A versão nova grava a chave (null inclusive); quem não a conhece não grava. */
  assert.equal(radarArticleBlueprintInvestigationRefToStore(atual({ amazonFrozenAt: null })).amazonFrozenAt, null);
  assert.equal("amazonFrozenAt" in radarArticleBlueprintInvestigationRefToStore(atual({ amazonFrozenAt: null })), true);
  assert.equal("amazonFrozenAt" in radarArticleBlueprintInvestigationRefToStore(atual()), false);
  assert.equal(radarArticleBlueprintInvestigationRefOf(referencia({ amazonFrozenAt: AMAZON_EM }))?.amazonFrozenAt, AMAZON_EM);

  /* A regra inteira: a planta organizada sem Amazon não vale depois do congelamento da Amazon. */
  const semAmazon = versao("v3", 3, HASH_DE_ANTES, { investigationRef: referencia({ amazonFrozenAt: null }) });
  assert.equal(radarArticleBlueprintPick([semAmazon], { bundleHash: HASH_AO_VIVO, investigation: atual({ amazonFrozenAt: AMAZON_EM }) }), null);
  assert.equal(radarArticleBlueprintPick([semAmazon], { bundleHash: HASH_AO_VIVO, investigation: atual({ amazonFrozenAt: null }) })?.id, "v3");
  const comAmazon = versao("v4", 4, HASH_DE_ANTES, { investigationRef: referencia({ amazonFrozenAt: AMAZON_EM }) });
  assert.equal(radarArticleBlueprintPick([comAmazon], { bundleHash: HASH_AO_VIVO, investigation: atual({ amazonFrozenAt: AMAZON_EM }) })?.id, "v4");
  assert.equal(radarArticleBlueprintPick([comAmazon], { bundleHash: HASH_AO_VIVO, investigation: atual({ amazonFrozenAt: "2026-10-09T08:00:00.000Z" }) }), null, "re-congelada: organiza de novo");
  /* O painel com o congelamento da Amazon que a página conhece. */
  assert.equal(radarArticleBlueprintOfPanelFreeze(semAmazon, [semAmazon], { frozenAt: CONGELADO_EM, bundleId: "bundle:f1", amazonFrozenAt: AMAZON_EM }), false);
  assert.equal(radarArticleBlueprintOfPanelFreeze(semAmazon, [semAmazon], { frozenAt: CONGELADO_EM, bundleId: "bundle:f1" }), true, "sem o congelamento na página, como antes");

  /* A investigação considerada: o Google manda o congelamento; a Amazon entra no vínculo; sem Amazon, null. */
  const comAsDuas = radarArticleBlueprintCurrentInvestigationOf({
    analysisPayload: { finalizedBundle: { bundleId: "bundle:f1", bundleHash: "aaaa1111", frozenAt: CONGELADO_EM }, amazonFrozenInvestigation: { finalizedAt: AMAZON_EM } },
    article: { versionId: "dna-v2", contentHash: "sha256:dna2", createdAt: "2026-10-01T10:00:00.000Z", versionNumber: 2 },
  });
  assert.equal(comAsDuas?.frozenAt, CONGELADO_EM);
  assert.equal(comAsDuas?.amazonFrozenAt, AMAZON_EM);
  const soGoogle = radarArticleBlueprintCurrentInvestigationOf({
    analysisPayload: { finalizedBundle: { bundleId: "bundle:f1", bundleHash: "aaaa1111", frozenAt: CONGELADO_EM } },
    article: { versionId: "dna-v2", contentHash: "sha256:dna2", createdAt: "2026-10-01T10:00:00.000Z", versionNumber: 2 },
  });
  assert.equal(soGoogle?.amazonFrozenAt, null);
});

/* ============================== 3 · o ifMissing ============================== */

const montagemFalsa = (investigacao: RadarArticleBlueprintCurrentInvestigation | null) => (async () => ({
  montada: {
    bundleHash: HASH_AO_VIVO,
    get entrada(): never { throw new Error("SEGUIU_PARA_A_IA:montagem do pedido"); },
  },
  silo: null, publicacao: null, brandVoice: { kind: "none" as const }, investigacao,
})) as never;

test("3 · ifMissing: só a CONCLUÍDA do mesmo congelamento e do mesmo ArticleDNA é reaproveitada; o rascunho não conta; a Amazon congelada depois organiza", async () => {
  const base = { brandId: MARCA, articleId: ARTIGO, actorUserId: "ator-1", ifMissing: true };

  /* O rascunho do MESMO dossiê (hash exato) não é reaproveitado: segue para organizar (a sentinela). */
  const rascunho = bancoFalso([linhaDaPlanta("r1", ARTIGO, 3, HASH_AO_VIVO, { state: "DRAFT", ref: referencia({ amazonFrozenAt: null }) })]);
  await assert.rejects(generateRadarArticleBlueprint({ ...base, client: rascunho.client, assemble: montagemFalsa(atual({ amazonFrozenAt: null })) }), /SEGUIU_PARA_A_IA/, "rascunho não conta");
  assert.equal(rascunho.inseridas.length, 0);

  /* A concluída do mesmo congelamento (com a mesma Amazon): devolvida sem chamada nenhuma. */
  const concluida = bancoFalso([linhaDaPlanta("c1", ARTIGO, 2, HASH_DE_ANTES, { ref: referencia({ amazonFrozenAt: AMAZON_EM }) })]);
  const reaproveitada = await generateRadarArticleBlueprint({ ...base, client: concluida.client, assemble: montagemFalsa(atual({ amazonFrozenAt: AMAZON_EM })) });
  assert.equal(reaproveitada.id, "c1");
  assert.equal(concluida.consultas.length, 1, "só a lista das versões");
  assert.equal(concluida.inseridas.length, 0);

  /* A concluída organizada SEM Amazon, com a Amazon congelada depois: organiza de novo (o bloco comercial precisa entrar). */
  const semAmazon = bancoFalso([linhaDaPlanta("c2", ARTIGO, 2, HASH_DE_ANTES, { ref: referencia({ amazonFrozenAt: null }) })]);
  await assert.rejects(generateRadarArticleBlueprint({ ...base, client: semAmazon.client, assemble: montagemFalsa(atual({ amazonFrozenAt: AMAZON_EM })) }), /SEGUIU_PARA_A_IA/);

  /* A concluída gravada antes da regra (sem a chave): congelamento sagrado, reaproveitada. */
  const antiga = bancoFalso([linhaDaPlanta("c3", ARTIGO, 2, HASH_DE_ANTES, { ref: referencia() })]);
  assert.equal((await generateRadarArticleBlueprint({ ...base, client: antiga.client, assemble: montagemFalsa(atual({ amazonFrozenAt: AMAZON_EM })) })).id, "c3");

  /* Estrutural: o reaproveitamento vem antes de qualquer chamada paga, e a versão nova grava a investigação (com a Amazon). */
  const servidor = semComentarios(await readFile(new URL("../lib/server/radar-article-blueprint.ts", import.meta.url), "utf8"));
  const corpo = servidor.slice(servidor.indexOf("export async function generateRadarArticleBlueprint"));
  assert.doesNotMatch(corpo, /doPacote\[0\]/, "o rascunho do mesmo pacote não volta como reaproveitado");
  assert.ok(corpo.indexOf("radarArticleBlueprintRowForInvestigation(existentes") < corpo.indexOf("requestRadarArticleBlueprintAi("));
});

/* ============================== 4 · a leitura que falha ============================== */

test("4 · a leitura da planta que falha é estado explícito (blueprint_unavailable, 503), nunca o legado em silêncio", async () => {
  const artigos = [{ articleId: "a1", bundleHash: HASH_AO_VIVO, investigation: atual() }, { articleId: "a2", bundleHash: HASH_AO_VIVO, investigation: atual() }];
  for (const falha of ["erro", "excecao"] as const) {
    for (const [nome, ler] of [["export", readRadarArticleBlueprintsForExport], ["aprovadas", readApprovedRadarArticleBlueprints]] as const) {
      await assert.rejects(ler(bancoFalso([linhaDaPlanta("a1-v1", "a1", 1, HASH_AO_VIVO)], falha).client, MARCA, artigos), (erro: unknown) => {
        assert.ok(erro instanceof RadarArticleBlueprintUnavailableError, `${nome}/${falha}`);
        const indisponivel = erro as RadarArticleBlueprintUnavailableError;
        assert.equal(indisponivel.code, RADAR_ARTICLE_BLUEPRINT_UNAVAILABLE);
        assert.equal(indisponivel.code, "blueprint_unavailable");
        assert.equal(indisponivel.status, 503);
        assert.deepEqual(indisponivel.articleIds, ["a1", "a2"]);
        assert.match(indisponivel.message, /^Não foi possível ler o artigo-modelo de 2 artigos \(.*\)\. Nada foi montado sem a planta: tente de novo em instantes\.$/);
        semD10(indisponivel.message, `${nome}/${falha}`);
        return true;
      });
    }
  }
  /* O export lê só a concluída: o rascunho do mesmo dossiê nunca é escolhido. */
  const linhas = [{ id: "d1", articleId: "a1", bundleHash: HASH_AO_VIVO, versionNumber: 2, state: "DRAFT", createdAt: "2026-10-06T09:00:00+00:00" }];
  assert.equal(radarArticleBlueprintExportChoice(linhas, new Map([["a1", HASH_AO_VIVO]]), new Map([["a1", atual()]])).size, 0);
  const banco = bancoFalso([linhaDaPlanta("d1", "a1", 2, HASH_AO_VIVO, { state: "DRAFT" }), linhaDaPlanta("c1", "a1", 1, HASH_DE_ANTES, { ref: referencia() })]);
  const lidos = await readRadarArticleBlueprintsForExport(banco.client, MARCA, [{ articleId: "a1", bundleHash: HASH_AO_VIVO, investigation: atual() }]);
  assert.equal(lidos.get("a1")?.approval, "APPROVED", "a concluída da investigação vence o rascunho do hash exato");
  assert.ok(banco.consultas[0].filtros.includes("state=APPROVED"), "a leitura do export pede só a concluída");
});

/* ============================== 5 · o portão e a linha sem legado ============================== */

const AVULSO: RadarWritingArticleContext = { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null };

test("5 · o portão do CSV 'Para escrever': sem a planta concluída, needs_article_blueprint (409) com a lista; o rascunho conta como falta; o vídeo primário não pede planta", () => {
  const google = entradaGoogle();
  const concluida = plantaDe(google, { articleId: ARTIGO });
  assert.equal(radarWritingBlueprintIsApproved(concluida), true);
  assert.equal(radarWritingBlueprintIsApproved({ ...concluida, approval: "DRAFT" }), false);
  assert.equal(radarWritingBlueprintIsApproved(null), false);

  assert.deepEqual(radarWritingExportBlueprintGate([
    { articleId: "a1", blueprint: concluida, entrada: google },
    { articleId: "a2", blueprint: null, entrada: entradaYoutube() },
  ]), { status: "ready" }, "a investigação de vídeo como perfil primário não pede planta");
  assert.deepEqual(radarWritingExportBlueprintGate([
    { articleId: "a1", blueprint: { ...concluida, approval: "DRAFT" }, entrada: google },
    { articleId: "a2", blueprint: null, entrada: entradaAmazon(true) },
    { articleId: "a3", blueprint: concluida, entrada: google },
    { articleId: "a2", blueprint: null, entrada: entradaAmazon(true) },
  ]), { status: RADAR_WRITING_NEEDS_ARTICLE_BLUEPRINT, articleIds: ["a1", "a2"] }, "a proposta em rascunho conta como falta; cada artigo uma vez");

  /* A linha montada sem a planta: o erro com o estado do contrato comum. */
  assert.throws(() => buildRadarWritingExportArticle(google, AVULSO), (erro: unknown) => {
    assert.ok(erro instanceof RadarWritingNeedsArticleBlueprintError);
    const falta = erro as RadarWritingNeedsArticleBlueprintError;
    assert.equal(falta.status, 409);
    assert.equal(falta.code, "needs_article_blueprint");
    assert.deepEqual(falta.state, { status: "needs_article_blueprint", articleIds: [ARTIGO] });
    semD10(falta.message, "erro do portão");
    return true;
  });
  assert.throws(() => buildRadarWritingExportArticle(google, { ...AVULSO, blueprint: { ...concluida, approval: "DRAFT" } }), /artigo-modelo da SERP concluído/);
  assert.match(new RadarWritingNeedsArticleBlueprintError(["a1", "a2"]).message, /^2 artigos ainda não têm o artigo-modelo da SERP concluído/);
  /* O vídeo primário sai com a linha de identidade, sem planta. */
  assert.doesNotThrow(() => buildRadarWritingExportArticle(entradaYoutube(), AVULSO));
});

test("5 · com a planta, nenhuma coluna traz a estrutura, o título, a promessa, o visual nem os movimentos do legado", () => {
  const google = entradaGoogle();
  const linha = buildRadarWritingExportArticle(google, { ...AVULSO, blueprint: plantaDe(google, { articleId: ARTIGO }) }).row;
  const tudo = Object.values(linha).join("\n");
  for (const legado of [
    /H1 de trabalho/, /Ordem sugerida/, /Títulos de trabalho:/, /Plano visual do pacote/, /distribuídos pelas seções/, /^- Sustentar /m,
    /Já coberto pela maioria/, /Explicar a divergência/, /estrutura sugerida/, /^Estrutura de referência:/m, /Referência da SERP, não meta/,
    /SEO title: escreva com cerca de/, /^Chamada final/m, /^Tronco \(Assunto\)/m,
  ]) assert.doesNotMatch(tudo, legado, String(legado));
  assert.match(linha.estrutura, /^ARTIGO-MODELO DA SERP \(planta concluída do artigo/);
  assert.match(linha.titulo_e_seo, /^H1: Skincare facial: o guia prático$/m);
  assert.match(linha.plano_visual, /^Plano visual: 3 imagem\(ns\)\./);
  assert.match(linha.cobrir_e_superar, /^- Abertura: a do artigo-modelo \(coluna estrutura\); as perguntas abaixo entram nas seções\.$/m);
  semD10(tudo, "linha com a planta");
});

/* ============================== 6 · a Amazon congelada no pedido ============================== */

const BLOCO_AMAZON = (): RadarAmazonCommercialBlock => ({
  frozenAt: AMAZON_EM,
  intent: { type: "TOP_BEST", label: "Top melhores produtos", desiredCount: 5, useCase: "pele oleosa", rankingCriteria: "VALUE_FOR_MONEY" },
  editorialOutput: "TOP_BEST", workingTitle: null, promise: null,
  shortlist: [
    { order: 1, asin: "B000000001", title: "Sérum facial A", amazonUrl: "https://www.amazon.com.br/dp/B000000001", suggestedAnchor: null, supportingSignals: ["4,6 estrelas", "2.300 avaliações"], missingSignals: [] },
    { order: 2, asin: "B000000002", title: "Sérum facial B", amazonUrl: "https://www.amazon.com.br/dp/B000000002", suggestedAnchor: null, supportingSignals: ["4,4 estrelas"], missingSignals: [] },
  ],
  shortlistStatus: { state: "PARTIAL", desired: 5, available: 2, message: "O formato pede 5 produtos e a shortlist tem 2." },
  counts: { observed: 12, eligible: 4, shortlist: 2 },
  comparisonCriteria: ["Faixa de preço", "Nota de avaliação"],
  priceBands: [{ label: "Faixa econômica", detail: "até R$ 60" }],
  affiliateDisclosureRequired: true,
  rules: ["Nota e avaliações são sinal da prateleira no dia da coleta."],
  limitations: ["O texto das avaliações não foi lido."],
  skeleton: [{ heading: "Como escolhemos", objective: "Dizer os critérios.", sourceSignal: "forma comercial" }],
});

test("6 · a Amazon congelada no pedido: shortlist (Z) e critérios (Q) como evidência, o bloco comercial e a regra de review; sem Amazon, o pedido de antes", () => {
  const comercial = radarArticleBlueprintCommercialOfBlock(BLOCO_AMAZON())!;
  assert.equal(comercial.format, "Top melhores produtos");
  assert.equal(comercial.rankingCriteria, "custo-benefício");
  assert.deepEqual(comercial.products.map(item => item.asin), ["B000000001", "B000000002"]);
  assert.deepEqual(comercial.products[0].signals, ["4,6 estrelas", "2.300 avaliações"]);
  assert.equal(comercial.disclosureRequired, true);
  assert.equal(radarArticleBlueprintCommercialOfBlock(null), null);
  assert.equal(radarArticleBlueprintCommercialOf({ commercial: null, amazon: null } as never), null, "sem setup, produto nem critério: o pedido de antes");
  assert.ok(radarArticleBlueprintCommercialOf(entradaAmazon(true), AMAZON_EM), "a projeção comercial do export também vira bloco");

  const google = entradaGoogle();
  const sem = buildRadarArticleBlueprintBrief({ entrada: google, silo: null, articleId: ARTIGO, publication: null });
  const com = buildRadarArticleBlueprintBrief({ entrada: google, silo: null, articleId: ARTIGO, publication: null, commercial: comercial });
  assert.equal(sem.commercial, undefined);
  assert.equal(sem.evidence.some(item => /^[ZQ]\d/.test(item.id)), false);
  assert.deepEqual(com.evidence.filter(item => item.id.startsWith("Z")).map(item => item.id), ["Z1", "Z2"]);
  assert.deepEqual(com.evidence.filter(item => item.id.startsWith("Q")).map(item => item.id), ["Q1", "Q2"]);
  assert.ok(com.skeleton.some(item => item.heading === "Como escolhemos" && item.cover[0].startsWith("forma comercial da Amazon congelada")), "o esqueleto da forma comercial vira matéria-prima M");

  const pedidoSem = radarArticleBlueprintPrompt(sem);
  const pedidoCom = radarArticleBlueprintPrompt(com);
  assert.doesNotMatch(pedidoSem.system, /25\. REVIEW PELA AMAZON CONGELADA/);
  assert.doesNotMatch(pedidoSem.user, /# Bloco comercial/);
  assert.match(pedidoCom.system, /25\. REVIEW PELA AMAZON CONGELADA \(bloco '# Bloco comercial'\): a planta é também a review do formato declarado\. Só os produtos Z da shortlist entram/);
  assert.match(pedidoCom.user, /^# Bloco comercial \(Amazon congelada em 2026-10-07; siga a regra 25\)$/m);
  semD10(pedidoCom.system.split("\n").find(item => item.startsWith("25. ")) || "", "regra 25");
});

/* ============================== 7 · as exclusões dos reajustes ============================== */

const KEYWORDS = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", texto: "skin care principia", role: "principal" as const, volume: 2400 },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", texto: "rotina de skin care", role: "secundaria" as const, volume: 720 },
];
const HASH = "sha256:" + "c".repeat(64);
const MARCA_DO_DNA = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ARTIGO_DO_DNA = "article-skin-care-principia";
const VERSAO_DO_DNA = "4bfca609-0e2e-4d50-8797-5d387adb4849";
const referenciaDaKeyword = (kw: typeof KEYWORDS[number]) => ({
  keywordId: kw.id, keywordDnaVersionId: `kwdna-${kw.id}`, keywordDnaContentHash: HASH, role: kw.role,
  strategicContribution: `Contribuição de ${kw.texto}`, coveredIntentions: ["informacional"], requiredTopics: [kw.texto], excludedTopics: [],
  classificationOrigin: "human" as const, confidence: 0.8, humanConfirmed: true, normalizedIntent: "informational" as const,
  volume: kw.volume, resultCount: 190, kgrScore: 0.08, incrementalVolume: kw.role === "principal" ? null : kw.volume,
  contribution: kw.role === "principal" ? "central" as const : "incremental_volume" as const, purpose: "Cobrir a intenção declarada", overlapRisk: "low" as const,
});
const snapshot = (kw: typeof KEYWORDS[number]) => ({
  referenceKeywordId: kw.id, canonicalKeywordId: kw.id, sourceKeywordId: kw.id, originalKeywordId: kw.id, aliases: [], keywordDnaVersionId: `kwdna-${kw.id}`,
  keyword: kw.texto, role: kw.role, brandId: MARCA_DO_DNA, siloId: "silo-1", siloName: "Skin care", isPublished: false,
});
const itemDoRadar = (): RadarItem => RadarItemSchema.parse({
  id: `radar:${ARTIGO_DO_DNA}`, brandId: MARCA_DO_DNA, articleId: ARTIGO_DO_DNA, articleDnaVersionId: VERSAO_DO_DNA, articleDnaContentHash: HASH,
  title: "Skin care principia", slug: "skin-care-principia", siloId: "silo-1", hierarchy: "Pilar", principalKeywordId: KEYWORDS[0].id, format: "Pilar",
  intent: "informacional", state: "research_pending", importedAt: "2026-09-07T10:00:00.000Z", updatedAt: "2026-09-07T10:00:00.000Z", origin: "local", lockVersion: 1,
  hydration: {
    schemaVersion: 1, brandId: MARCA_DO_DNA, articleId: ARTIGO_DO_DNA, articleDnaVersionId: VERSAO_DO_DNA, source: "arquiteto_import", capturedAt: "2026-09-07T10:00:00.000Z",
    principalKeywordId: KEYWORDS[0].id, principalKeyword: snapshot(KEYWORDS[0]), keywordSnapshots: KEYWORDS.map(snapshot),
    silo: {
      id: "silo-1", name: "Skin care", siloDnaVersionId: "silodna-v3", siloDnaContentHash: HASH, territoryRef: "territorio-1", siloPageId: "silopage-1",
      siloPageVersionId: "silopage-v2", siloPageSlug: "/skin-care", siloPageCanonical: "https://exemplo.com.br/skin-care", siloPagePublicationStatus: "published", articleRole: "pillar",
    },
  },
  arquitetoKeywordDnaReferences: KEYWORDS.map(referenciaDaKeyword),
});
const dnaCom = (patch: Partial<ArticleDNA> = {}): VersionEnvelope<ArticleDNA> => ({
  versionId: VERSAO_DO_DNA, entityId: ARTIGO_DO_DNA, versionNumber: 7, previousVersionId: null, contentHash: HASH, origin: "human",
  changeReason: "fixture", createdAt: "2026-09-07T09:00:00.000Z", createdBy: "auditor",
  payload: {
    schemaVersion: 1, articleId: ARTIGO_DO_DNA, brandId: MARCA_DO_DNA, principalKeywordId: KEYWORDS[0].id,
    secondaryKeywordIds: [KEYWORDS[1].id], narrativeReinforcementIds: [], keywordReferences: KEYWORDS.map(referenciaDaKeyword), siloId: "silo-1", hierarchy: "Pilar",
    suggestedSlug: "skin-care-principia", canonical: null, mainIntent: "informacional", auxiliaryIntents: [], audience: "Pele oleosa", problem: "Rotina indefinida",
    desiredResult: "Rotina clara", journeyStage: "consideracao", brandObjective: "Autoridade", promise: "Rotina clara", angle: "Prático", cta: "Conhecer",
    coverage: ["rotina de skin care"], excludedSubjects: [], antiCannibalizationBoundary: "Manter a cobertura centrada em skin care.", nearbyArticleIds: [],
    differentiation: ["Passo a passo"], entities: [], requiredTopics: ["rotina de skin care"], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [],
    internalLinks: [], alerts: [], confidence: 0.7, humanPendingDecisions: [],
    ...patch,
  } as unknown as ArticleDNA,
} as VersionEnvelope<ArticleDNA>);
const REAJUSTE: Partial<ArticleDNA> = {
  excludedSubjects: ["maquiagem para pele oleosa", "Prático", "skin care principia", "protetor solar com cor"],
  differentiation: ["Diferenciação: ângulo \"rotina da manhã\"; não cobrir \"protetor solar com cor\" — é do artigo \"protetor solar para pele oleosa\" (decidido no Arquiteto)."],
  antiCannibalizationBoundary: "Cobrir a rotina; deixar ácidos no rosto; sérum noturno para as páginas vizinhas.",
} as Partial<ArticleDNA>;

test("7 · o reajuste no ArticleDNA vira escopo do artigo: excluídos, nota de diferenciação (com o dono) e fronteira; a guarda tira o ângulo e as keywords", () => {
  const contexto = buildRadarArticleResearchContext({ item: itemDoRadar(), article: dnaCom(REAJUSTE) });
  assert.deepEqual(contexto.articleScope, {
    angle: "Prático",
    exclusions: [
      { label: "protetor solar com cor", source: "differentiation", owner: "protetor solar para pele oleosa" },
      { label: "ácidos no rosto", source: "antiCannibalizationBoundary", owner: null },
      { label: "sérum noturno", source: "antiCannibalizationBoundary", owner: null },
      { label: "maquiagem para pele oleosa", source: "excludedSubjects", owner: null },
    ],
  });
  assert.deepEqual(radarResearchContextScopeExclusions(contexto).map(item => item.label), ["protetor solar com cor", "ácidos no rosto", "sérum noturno", "maquiagem para pele oleosa"]);
  /* O texto livre da formação ("Manter a cobertura centrada em …") não exclui nada; sem exclusão, a chave nem existe. */
  const sem = buildRadarArticleResearchContext({ item: itemDoRadar(), article: dnaCom() });
  assert.equal("articleScope" in sem, false);
  assert.deepEqual(radarResearchContextScopeExclusions(sem), []);
  assert.deepEqual(radarResearchContextScopeExclusions(null), []);
});

test("7 · congelamento sagrado: o escopo do artigo fica FORA do hash — a impressão da pesquisa e o contexto de keywords não mudam, e nenhum módulo do pacote o lê", async () => {
  const sem = buildRadarArticleResearchContext({ item: itemDoRadar(), article: dnaCom() });
  const com = buildRadarArticleResearchContext({ item: itemDoRadar(), article: dnaCom(REAJUSTE) });
  assert.deepEqual(buildRadarResearchFingerprint(com), buildRadarResearchFingerprint(sem), "a impressão da pesquisa (a que decide reaproveitar) não muda");
  assert.deepEqual(radarKeywordContextOf(com), radarKeywordContextOf(sem), "o contexto de keywords do pacote não muda");
  const { articleScope: _escopo, ...semOEscopo } = com;
  assert.ok(_escopo);
  assert.equal(JSON.stringify(Object.keys(semOEscopo).sort()), JSON.stringify(Object.keys(sem).sort()), "a única chave nova é o escopo");
  for (const caminho of ["evidence-bundle.ts", "evidence-bundle-runtime.ts", "competitive-observed-model.ts", "deep-research.ts", "keyword-context.ts", "google-observed-read-model.ts"]) {
    const fonte = semComentarios(await readFile(new URL(`../lib/radar/${caminho}`, import.meta.url), "utf8"));
    assert.doesNotMatch(fonte, /articleScope|radarResearchContextScopeExclusions/, `${caminho} não lê o escopo do artigo`);
  }
});

const EXCLUSAO: RadarResearchScopeExclusion = { label: "pele oleosa", source: "differentiation", owner: "skincare para pele oleosa" };
const comExclusao = (entrada: RadarPortableExportInput): RadarPortableExportInput => ({
  ...entrada,
  researchContext: { ...(entrada.researchContext ?? contextoDePesquisa()), articleScope: { angle: null, exclusions: [EXCLUSAO] } } as never,
});

test("7 · no pedido do artigo-modelo: a exclusão é fora do escopo duro (regra 26), a seção M que a toca chega marcada e a conferência tira a seção, com a nota", () => {
  const entrada = comExclusao(entradaGoogle());
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: null, articleId: ARTIGO, publication: null });
  assert.deepEqual(brief.dnaExclusions, [EXCLUSAO]);
  assert.ok(brief.skeleton.some(item => /pele oleosa/i.test(item.heading) && item.outOfScope), JSON.stringify(brief.skeleton.map(item => [item.heading, item.outOfScope])));
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /^26\. EXCLUSÕES DO ARTICLEDNA: /m);
  assert.match(user, /"pele oleosa" \(exclusão do ArticleDNA, decidida no Arquiteto: é do artigo "skincare para pele oleosa"\)/);
  /* Sem exclusão, o pedido não ganha a regra. */
  assert.doesNotMatch(radarArticleBlueprintPrompt(buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: null, articleId: ARTIGO, publication: null })).system, /26\. EXCLUSÕES DO ARTICLEDNA/);

  /* A IA que organiza uma seção sobre o assunto excluído: a conferência a tira e diz por quê. */
  const resposta = respostaDaPlanta(brief);
  const secoes = [...(resposta.sections as Array<Record<string, unknown>>), { h2: "Pele oleosa: o que muda na rotina", readerQuestion: "O que muda na pele oleosa?", answerFirst: "Resposta direta.", from: [] }];
  const { payload, notes } = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse({ ...resposta, sections: secoes }), brief, { close: true });
  assert.equal(payload.blueprint.sections.some(item => /pele oleosa/i.test(item.h2)), false);
  assert.ok(notes.includes("Seção \"Pele oleosa: o que muda na rotina\" removida: o ArticleDNA exclui \"pele oleosa\" (exclusão do ArticleDNA, decidida no Arquiteto: é do artigo \"skincare para pele oleosa\")."), notes.join("\n"));
  semD10(system.split("\n").find(item => item.startsWith("26. ")) || "", "regra 26");
});

test("7 · no CSV: a exclusão vai ao 'Não cobrir' como exclusão dura; a planta APROVADA antes do reajuste perde a seção que a cobre, com a nota e as medidas certas", () => {
  const antes = entradaGoogle();
  /* A planta concluída organizada ANTES do reajuste: tem a seção de pele oleosa (com link e respiro). */
  const planta = plantaDe(antes, { articleId: ARTIGO });
  const secaoExcluida = planta.blueprint.sections.find(item => /pele oleosa/i.test(item.h2));
  assert.ok(secaoExcluida, planta.blueprint.sections.map(item => item.h2).join(" | "));

  const semReajuste = buildRadarWritingExportArticle(antes, { ...AVULSO, blueprint: planta }).row;
  const linha = buildRadarWritingExportArticle(comExclusao(antes), { ...AVULSO, blueprint: planta }).row;
  /* O "Não cobrir". */
  assert.match(linha.cobrir_e_superar, /^- "pele oleosa": o ArticleDNA tira este assunto do artigo \(reajuste decidido no Arquiteto\); é do artigo "skincare para pele oleosa", que no máximo se menciona e linka\.$/m, linha.cobrir_e_superar);
  assert.doesNotMatch(semReajuste.cobrir_e_superar, /o ArticleDNA tira este assunto/);
  /* A estrutura sem a seção, a nota concluída e as medidas sem ela. */
  assert.equal(linha.estrutura.includes(`## ${secaoExcluida!.h2}`), false);
  assert.match(linha.estrutura, new RegExp(`^Sai do artigo-modelo \\(exclusão do ArticleDNA, decidida no Arquiteto\\): seção "${secaoExcluida!.h2.replace(/[?()]/g, "\\$&")}" — trata de "pele oleosa", assunto do artigo "skincare para pele oleosa"\\. Não entra no texto\\.$`, "m"), linha.estrutura);
  const h2 = (estrutura: string) => Number(/^Medidas do plano: (\d+) H2/m.exec(estrutura)?.[1]);
  const links = (estrutura: string) => Number(/ · (\d+) links? internos?/.exec(estrutura)?.[1]);
  assert.equal(h2(linha.estrutura), h2(semReajuste.estrutura) - 1, "a seção sai da conta");
  assert.equal(links(linha.estrutura), links(semReajuste.estrutura) - secaoExcluida!.internalLinks.length, "os links dela também");
  assert.equal(linha.links_internos.split("\n").filter(item => /^L\d/.test(item)).length, semReajuste.links_internos.split("\n").filter(item => /^L\d/.test(item)).length - secaoExcluida!.internalLinks.length);
  semD10(Object.values(linha).join("\n"), "linha com a exclusão");

  /* A leitura pura da planta: a seção sai, e o resto é o mesmo objeto da planta gravada (a planta não muda). */
  const leitura = radarArticleBlueprintReading(planta.blueprint, { exclusions: { items: [EXCLUSAO], core: ["skincare facial", "skin care noturno"] } });
  assert.deepEqual(leitura.removedSections.map(item => item.section), [secaoExcluida!.h2]);
  assert.equal(planta.blueprint.sections.includes(secaoExcluida!), true, "a planta gravada não muda");
  const colunas = radarArticleBlueprintColumns(planta, null, null, null, { exclusions: { items: [EXCLUSAO], core: ["skincare facial", "skin care noturno"] } } as never);
  assert.equal(colunas.estrutura.includes(`## ${secaoExcluida!.h2}`), false);
});

test("7 · o H2 publicado sobre o assunto excluído sai do mapa, com o motivo do reajuste (nunca fica nem é absorvido)", () => {
  const planta = plantaDe(entradaGoogle(), { articleId: ARTIGO });
  const atuais = ["Pele oleosa: cuidados de todo dia", "Como montar a rotina de skincare facial"];
  const sem = radarArticleBlueprintPublishedMapReading(planta, atuais, { keywords: ["skincare facial"] });
  assert.notEqual(sem.find(item => item.current === atuais[0])?.kind, "REMOVED", "sem o reajuste, o H2 não sai por isto");
  const com = radarArticleBlueprintPublishedMapReading(planta, atuais, { keywords: ["skincare facial"], exclusions: { items: [EXCLUSAO], core: ["skincare facial", "skin care noturno"] } });
  const daExclusao = com.find(item => item.current === atuais[0])!;
  assert.equal(daExclusao.kind, "REMOVED");
  assert.match(radarArticleBlueprintPublishedMapLine(daExclusao), /^sai: o ArticleDNA exclui "pele oleosa" deste artigo \(reajuste decidido no Arquiteto; é do artigo "skincare para pele oleosa"\)$/);
  assert.doesNotMatch(radarArticleBlueprintPublishedMapLine(daExclusao), /decisão no artigo-modelo/, "a decisão é do reajuste, não da planta");
  assert.notEqual(com.find(item => item.current === atuais[1])?.kind, "REMOVED", "o H2 que não toca a exclusão segue o mapa");
});

/* ============================== 8 · a versão das regras ============================== */

test("8 · as regras 2026-10-09b: a planta nova sai com elas; o aviso da de 09/10 diz o que mudou e o custo real, sem palavra do D10", () => {
  assert.equal(RADAR_ARTICLE_BLUEPRINT_RULES_VERSION, "2026-10-09b");
  assert.equal(plantaDe(entradaGoogle(), { articleId: ARTIGO }).rulesVersion, "2026-10-09b");
  assert.equal(radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-09b" }), null);
  const aviso = radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-09" })!;
  assert.match(aviso, /bloco comercial da Amazon congelada no pedido \(shortlist, critérios de comparação, regra de review e aviso de afiliado\)/);
  assert.match(aviso, /o congelamento da Amazon no vínculo da planta/);
  assert.match(aviso, /exclusões que os reajustes gravam no ArticleDNA \(assuntos excluídos, nota de diferenciação e fronteira anticanibalização\)/);
  assert.match(aviso, /O CSV para escrever já tira, ao ler esta versão, a seção que cobre uma exclusão do ArticleDNA/);
  assert.match(aviso, /"Organizar de novo \(IA\)" \(até 2 chamadas de IA\)/);
  for (const versaoGravada of ["2026-10-08", "2026-10-09", undefined]) semD10(radarArticleBlueprintRulesNoticeText({ rulesVersion: versaoGravada }) || "", `aviso ${versaoGravada}`);
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
