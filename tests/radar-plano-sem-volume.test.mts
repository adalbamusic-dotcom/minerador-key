import assert from "node:assert/strict";
import test from "node:test";

import { buildRadarResearchQueryPlan, radarQueryHasSearchVolume } from "../lib/radar/research-query-plan.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { radarResearchResumption } from "../lib/radar/research-resumption.ts";
import { hasSearchVolume } from "../lib/arquiteto/serp-subject-suggestions.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";

/**
 * SDD "SERP no artigo e KGR opcional" (2026-09-28), fatia R2 do Radar.
 *
 * Regra do dono: keyword sem volume nunca é coletada. No Radar isso quer
 * dizer que secundária ou reforço SEM volume de busca não gera consulta
 * auxiliar (que pagaria as 4 lentes): vira CONTEXT_ONLY, com o motivo. A
 * principal continua sendo a âncora da investigação.
 *
 * Domínio puro: sem rede, sem banco, sem provider.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("rede proibida neste teste"));
  },
  writable: true, configurable: true,
});

type Papel = "principal" | "secundaria" | "reforco_narrativo";

const keyword = (id: string, texto: string, papel: Papel, volume: number | null, entidade: string, intencao: string) => ({
  identity: { keywordId: id, canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: `kdna-${id}`, text: texto, role: papel },
  strategy: {
    volume, resultCount: null, kgrScore: null, incrementalVolume: null, contribution: null, normalizedIntent: intencao,
    coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null,
    demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: entidade } }, semanticQualification: null,
  },
  resolution: "FULL",
  provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: `kdna-${id}`, keywordDnaContentHash: "h" },
});

function contexto(keywords: ReturnType<typeof keyword>[]): RadarArticleResearchContext {
  return {
    state: "COMPLETE",
    article: { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: "hash-dna", promise: "p", mainIntent: "informacional", hierarchy: "Suporte" },
    keywords,
    editorialTopics: [],
    resolvedKeywordTexts: keywords.map(item => item.identity.text),
    silo: null,
    formationSerp: null,
    internalLinks: null,
    limitations: [],
  } as unknown as RadarArticleResearchContext;
}

/* Cada secundária e cada reforço tem recorte próprio (outra intenção ou outra entidade): sem a regra, todas executariam. */
const PRINCIPAL = keyword("kw-p", "protetor solar para pele oleosa", "principal", 720, "protetor solar", "informacional");
const SEC_COM_VOLUME = keyword("kw-s1", "melhor protetor solar oil free", "secundaria", 90, "protetor solar", "comercial");
const SEC_ZERO = keyword("kw-s2", "protetor solar com cor barato", "secundaria", 0, "protetor solar", "transacional");
const SEC_NULA = keyword("kw-s3", "protetor solar toque seco resenha", "secundaria", null, "protetor solar", "comercial");
const REF_ENTIDADE_SEM_VOLUME = keyword("kw-r1", "niacinamida controla oleosidade", "reforco_narrativo", null, "niacinamida", "informacional");
const REF_ENTIDADE_COM_VOLUME = keyword("kw-r2", "ácido salicílico oleosidade", "reforco_narrativo", 40, "ácido salicílico", "informacional");

const plano = () => buildRadarResearchQueryPlan(contexto([PRINCIPAL, SEC_COM_VOLUME, SEC_ZERO, SEC_NULA, REF_ENTIDADE_SEM_VOLUME, REF_ENTIDADE_COM_VOLUME]));
const disposicao = (id: string) => plano().queries.find(item => item.keywordId === id)!;

test("R2 · o predicado de volume do Radar é o MESMO do Arquiteto (hasSearchVolume)", () => {
  for (const valor of [null, undefined, 0, -1, -0, Number.NaN, Number.POSITIVE_INFINITY, 0.5, 1, 10, 720]) {
    assert.equal(radarQueryHasSearchVolume(valor), hasSearchVolume(valor), `divergiram em ${String(valor)}`);
  }
});

test("R2 · secundária sem volume (zero ou nulo) vira CONTEXT_ONLY com o motivo", () => {
  for (const id of ["kw-s2", "kw-s3"]) {
    const candidata = disposicao(id);
    assert.equal(candidata.disposition, "CONTEXT_ONLY", id);
    assert.match(candidata.reason, /Sem volume de busca/);
  }
});

test("R2 · reforço com entidade própria mas sem volume também não consulta", () => {
  assert.equal(disposicao("kw-r1").disposition, "CONTEXT_ONLY");
  assert.match(disposicao("kw-r1").reason, /Sem volume de busca/);
});

test("R2 · com volume, as regras de antes continuam: secundária com recorte e reforço com entidade executam", () => {
  assert.equal(disposicao("kw-s1").disposition, "EXECUTE");
  assert.equal(disposicao("kw-r2").disposition, "EXECUTE");
  assert.deepEqual(plano().executable.map(item => item.keywordId), ["kw-p", "kw-s1", "kw-r2"]);
  assert.deepEqual(plano().contextOnly.map(item => item.keywordId).sort(), ["kw-r1", "kw-s2", "kw-s3"]);
});

test("R2 · a principal sem volume continua sendo a âncora (EXECUTE)", () => {
  const semVolume = keyword("kw-p", "protetor solar para pele oleosa", "principal", null, "protetor solar", "informacional");
  const resultado = buildRadarResearchQueryPlan(contexto([semVolume, SEC_ZERO]));
  assert.equal(resultado.primary?.disposition, "EXECUTE");
  assert.equal(resultado.queries.find(item => item.keywordId === "kw-s2")?.disposition, "CONTEXT_ONLY");
});

test("R2 · keyword sem texto continua NOT_EXECUTABLE (a regra anterior vem antes)", () => {
  const semTexto = { ...SEC_ZERO, identity: { ...SEC_ZERO.identity, text: null } } as unknown as ReturnType<typeof keyword>;
  const resultado = buildRadarResearchQueryPlan(contexto([PRINCIPAL, semTexto]));
  assert.equal(resultado.queries.find(item => item.keywordId === "kw-s2")?.disposition, "NOT_EXECUTABLE");
});

test("R2 · a investigação não enfileira auxiliar sem volume: NOT_EXECUTED no registro e fora da fila de coleta", () => {
  const ctx = contexto([PRINCIPAL, SEC_COM_VOLUME, SEC_ZERO, SEC_NULA, REF_ENTIDADE_SEM_VOLUME]);
  const registro = startRadarDeepResearch({ context: ctx, plan: buildRadarResearchQueryPlan(ctx), startedBy: "ator", now: "2026-09-28T10:00:00.000Z" });
  for (const id of ["kw-s2", "kw-s3", "kw-r1"]) {
    const consulta = registro.queries.find(item => item.keywordId === id)!;
    assert.equal(consulta.execution, "NOT_EXECUTED", id);
    assert.match(consulta.reason, /Sem volume de busca/);
  }
  const fila = radarResearchResumption({ record: registro }).auxiliaryToCollect.map(item => item.keywordId);
  assert.deepEqual(fila, ["kw-s1"], "só a secundária com volume vai à coleta auxiliar (paga)");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(tentativasDeRede, []);
});
