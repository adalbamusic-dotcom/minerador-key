import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertRadarEvidenceAuthority, radarEvidenceApplies, radarEvidenceIsInterpretative,
  radarEvidenceIsObserved, radarEvidenceRank, radarSerpEvidenceStanding,
  resolveRadarEvidencePrecedence, RADAR_EVIDENCE_HIERARCHY,
  type RadarEvidenceClaim,
} from "../lib/radar/evidence-authority.ts";
import {
  assertRadarEvidenceProvenance, buildRadarEvidenceBundle, radarEvidenceBundleMatchesArticle,
} from "../lib/radar/evidence-bundle.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarCompetitiveObservedModel } from "../lib/radar/competitive-observed-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage } from "../lib/radar/analysis-contracts.ts";

/*
 * =========  DIRETRIZ CANÔNICA · AUTORIDADE EVIDENCIAL DO RADAR  =========
 *
 * Esta suíte não pertence a um lote. Ela existe porque a mesma discussão volta
 * disfarçada de melhoria: uma heurística nova, uma leitura de IA mais elegante,
 * uma sugestão editorial que contradiz catorze concorrentes. Sem hierarquia
 * escrita e testável, cada lote reabre a votação — e a evidência perde, porque
 * ela não argumenta.
 *
 * Duas afirmações precisam sobreviver a todos os próximos gates:
 *
 *   A SERP vigente e suficiente é a autoridade sobre o TERRENO COMPETITIVO.
 *   Ela NÃO é autoridade sobre VERDADE FACTUAL.
 *
 * E a IA fica abaixo da evidência, nunca acima.
 */

/* =========================  1 · A HIERARQUIA  ========================== */

test("DIRETRIZ · a hierarquia é uma só, congelada e ordenada", () => {
  assert.deepEqual([...RADAR_EVIDENCE_HIERARCHY], [
    "ARTICLE_INVARIANT",
    "PRIMARY_FACTUAL_EVIDENCE",
    "QUALIFIED_SPECIALIST",
    "CURRENT_SUFFICIENT_SERP",
    "OTHER_RADAR_EVIDENCE",
    "ARTICLE_DNA_HYPOTHESIS",
    "AI_INTERPRETATION",
    "DETERMINISTIC_HEURISTIC",
    "GENERIC_EDITORIAL_SUGGESTION",
  ]);

  /* O invariante do Article nunca é violado automaticamente: ele é o primeiro. */
  assert.equal(radarEvidenceRank("ARTICLE_INVARIANT"), 1);

  /* A SERP fala mais alto que hipótese, IA e heurística. */
  assert.ok(radarEvidenceRank("CURRENT_SUFFICIENT_SERP") < radarEvidenceRank("ARTICLE_DNA_HYPOTHESIS"));
  assert.ok(radarEvidenceRank("CURRENT_SUFFICIENT_SERP") < radarEvidenceRank("AI_INTERPRETATION"));
  assert.ok(radarEvidenceRank("CURRENT_SUFFICIENT_SERP") < radarEvidenceRank("DETERMINISTIC_HEURISTIC"));
  assert.ok(radarEvidenceRank("CURRENT_SUFFICIENT_SERP") < radarEvidenceRank("GENERIC_EDITORIAL_SUGGESTION"));

  /* E a evidência factual fala mais alto que a SERP sobre verdade. */
  assert.ok(radarEvidenceRank("PRIMARY_FACTUAL_EVIDENCE") < radarEvidenceRank("CURRENT_SUFFICIENT_SERP"));
  assert.ok(radarEvidenceRank("QUALIFIED_SPECIALIST") < radarEvidenceRank("CURRENT_SUFFICIENT_SERP"));

  /* Observação e interpretação são categorias distintas, e isso é testável. */
  assert.equal(radarEvidenceIsObserved("CURRENT_SUFFICIENT_SERP"), true);
  assert.equal(radarEvidenceIsInterpretative("AI_INTERPRETATION"), true);
  assert.equal(radarEvidenceIsObserved("AI_INTERPRETATION"), false);
});

/* ==============  2 · A SERP MANDA NO TERRENO COMPETITIVO  ============== */

const afirmacao = (source: RadarEvidenceClaim["source"], claim: string): RadarEvidenceClaim =>
  ({ source, claim, provenance: `fixture:${source}` });

test("DIRETRIZ · a IA não sobrepõe a SERP sobre o que o mercado faz", () => {
  const resolucao = resolveRadarEvidencePrecedence({
    domain: "COMPETITIVE",
    claims: [
      afirmacao("AI_INTERPRETATION", "Acho melhor ignorar os 14 concorrentes e seguir outra estrutura."),
      afirmacao("CURRENT_SUFFICIENT_SERP", "14 de 14 páginas comparáveis abrem pelo mesmo conceito."),
    ],
  });

  assert.equal(resolucao.prevailing.source, "CURRENT_SUFFICIENT_SERP");
  assert.equal(resolucao.overruled[0].source, "AI_INTERPRETATION");
  assert.match(resolucao.overruled[0].reason, /Interpretação não sobrepõe observação/);
  assert.doesNotThrow(() => assertRadarEvidenceAuthority(resolucao));

  /* E a leitura sobreposta NÃO é apagada. */
  assert.equal(resolucao.overruled[0].claim.length > 0, true);
  assert.equal(resolucao.overruled[0].provenance.length > 0, true);
});

test("DIRETRIZ · hipótese do ArticleDNA cede à SERP na leitura competitiva, sem ser apagada", () => {
  const resolucao = resolveRadarEvidencePrecedence({
    domain: "COMPETITIVE",
    claims: [
      afirmacao("ARTICLE_DNA_HYPOTHESIS", "O tópico X parecia central na formação."),
      afirmacao("CURRENT_SUFFICIENT_SERP", "A amostra não trata de X e converge em Y."),
      afirmacao("DETERMINISTIC_HEURISTIC", "A regra sugeria priorizar X."),
    ],
  });

  assert.equal(resolucao.prevailing.source, "CURRENT_SUFFICIENT_SERP");
  assert.deepEqual(resolucao.overruled.map(item => item.source), ["ARTICLE_DNA_HYPOTHESIS", "DETERMINISTIC_HEURISTIC"]);
  assert.match(resolucao.note, /evidência externa observável/);
  assert.ok(resolucao.overruled.every(item => item.claim && item.provenance), "divergência registrada, não resolvida em silêncio");
});

/* =========  3 · A SERP NÃO DECIDE VERDADE — YMYL É O CASO  ============ */

test("DIRETRIZ · dez concorrentes afirmando algo não vencem uma fonte primária", () => {
  const resolucao = resolveRadarEvidencePrecedence({
    domain: "FACTUAL",
    claims: [
      afirmacao("CURRENT_SUFFICIENT_SERP", "10 de 14 páginas afirmam X."),
      afirmacao("PRIMARY_FACTUAL_EVIDENCE", "A literatura primária mostra que X está desatualizado."),
    ],
  });

  assert.equal(resolucao.prevailing.source, "PRIMARY_FACTUAL_EVIDENCE");
  assert.equal(resolucao.conflict, true, "isto é conflito, não empate resolvido");
  assert.match(resolucao.note, /prevalecem sobre a recorrência do mercado/);

  /* O padrão do mercado permanece registrado — é o que os concorrentes dizem. */
  const mercado = resolucao.overruled.find(item => item.source === "CURRENT_SUFFICIENT_SERP")!;
  assert.match(mercado.claim, /10 de 14 páginas afirmam X/);
  assert.doesNotThrow(() => assertRadarEvidenceAuthority(resolucao));
});

test("DIRETRIZ · o especialista qualificado também vence a recorrência, e a SERP fica no registro", () => {
  const resolucao = resolveRadarEvidencePrecedence({
    domain: "FACTUAL",
    claims: [
      afirmacao("CURRENT_SUFFICIENT_SERP", "O mercado frequentemente afirma X."),
      afirmacao("QUALIFIED_SPECIALIST", "X não deve ser reproduzido como fato."),
    ],
  });
  assert.equal(resolucao.prevailing.source, "QUALIFIED_SPECIALIST");
  assert.ok(resolucao.overruled.some(item => item.source === "CURRENT_SUFFICIENT_SERP"));
});

test("DIRETRIZ · fonte primária não opina sobre o que ranqueia", () => {
  const resolucao = resolveRadarEvidencePrecedence({
    domain: "COMPETITIVE",
    claims: [
      afirmacao("PRIMARY_FACTUAL_EVIDENCE", "O mecanismo fisiológico é Z."),
      afirmacao("CURRENT_SUFFICIENT_SERP", "12 de 14 páginas usam formato de guia."),
    ],
  });

  assert.equal(resolucao.prevailing.source, "CURRENT_SUFFICIENT_SERP");
  assert.equal(resolucao.notApplicable[0].source, "PRIMARY_FACTUAL_EVIDENCE", "não perdeu: não se aplica");
  assert.match(resolucao.notApplicable[0].reason, /atesta fato, não descreve o comportamento da busca/);
  assert.equal(radarEvidenceApplies("PRIMARY_FACTUAL_EVIDENCE", "COMPETITIVE"), false);
  assert.equal(radarEvidenceApplies("PRIMARY_FACTUAL_EVIDENCE", "FACTUAL"), true);
  assert.equal(radarEvidenceApplies("ARTICLE_INVARIANT", "COMPETITIVE"), true, "o invariante vale sempre");
});

/* ===============  4 · A INVARIANTE QUE IMPEDE A INVERSÃO  ============= */

test("DIRETRIZ · inverter a hierarquia é erro de execução, não discussão de revisão", () => {
  /* Uma resolução forjada em que a IA sobrepõe a SERP. */
  const invertida = {
    domain: "COMPETITIVE" as const,
    prevailing: afirmacao("AI_INTERPRETATION", "Prefiro outra leitura."),
    overruled: [{ ...afirmacao("CURRENT_SUFFICIENT_SERP", "14 de 14 páginas fazem assim."), reason: "forjado" }],
    notApplicable: [],
    conflict: false,
    note: "",
  };
  assert.throws(() => assertRadarEvidenceAuthority(invertida), /RADAR_EVIDENCE_AUTHORITY_INVERTED/);

  /* E recorrência de mercado vencendo fonte primária em questão factual. */
  const mercadoSobreFato = {
    domain: "FACTUAL" as const,
    prevailing: afirmacao("CURRENT_SUFFICIENT_SERP", "10 concorrentes afirmam X."),
    overruled: [{ ...afirmacao("PRIMARY_FACTUAL_EVIDENCE", "X está incorreto."), reason: "forjado" }],
    notApplicable: [],
    conflict: true,
    note: "",
  };
  assert.throws(() => assertRadarEvidenceAuthority(mercadoSobreFato), /recorrência de mercado não decide verdade factual/);
});

test("DIRETRIZ · afirmação sem procedência não entra na disputa", () => {
  assert.throws(
    () => resolveRadarEvidencePrecedence({
      domain: "COMPETITIVE",
      claims: [{ source: "AI_INTERPRETATION", claim: "Acho que sim.", provenance: "  " }],
    }),
    /RADAR_EVIDENCE_CLAIM_WITHOUT_PROVENANCE/,
  );

  const semProcedencia = {
    domain: "COMPETITIVE" as const,
    prevailing: { source: "CURRENT_SUFFICIENT_SERP" as const, claim: "x", provenance: "" },
    overruled: [], notApplicable: [], conflict: false, note: "",
  };
  assert.throws(() => assertRadarEvidenceAuthority(semProcedencia), /RADAR_EVIDENCE_PROVENANCE_LOST/);
});

/* =============  5 · A SERP SÓ MANDA ENQUANTO É VIGENTE  ============== */

test("DIRETRIZ · SERP obsoleta continua evidência, mas perde a precedência — e diz isso", () => {
  const vigente = radarSerpEvidenceStanding({ current: true, sufficient: true, valid: true });
  assert.equal(vigente.authoritative, true);
  assert.match(vigente.reason, /autoridade evidencial sobre o terreno competitivo/);

  const obsoleta = radarSerpEvidenceStanding({ current: false, sufficient: true, valid: true });
  assert.equal(obsoleta.authoritative, false);
  assert.match(obsoleta.reason, /permanece como evidência, mas sem precedência/);
  assert.match(obsoleta.reason, /os fundamentos mudaram desde a coleta/);

  const insuficiente = radarSerpEvidenceStanding({ current: true, sufficient: false, valid: true });
  assert.match(insuficiente.reason, /não sustenta leitura de mercado/);
});

/* =========  6 · O DOSSIÊ NÃO ANDA SOLTO NEM VAI SEM PROCEDÊNCIA  ==== */

const pagina = (id: string, heading: string): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id}.com.br/artigo/x`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: [heading], h3: [], wordCount: 1400, internalLinkCount: 4, externalLinkCount: 2,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: null, structuredDataTypes: [], recurringTerms: [], boldCount: 3, italicCount: 0,
  paragraphCount: 11, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, { level: 2, text: heading }],
  introWordCount: 60, introText: "Abertura.", closingWordCount: 40, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: [], error: null,
});

const HASH = `sha256:${"a".repeat(64)}`;
const PAGINAS = ["A", "B", "C", "D"].map((id, index) => pagina(id, index < 2 ? "Características da pele oleosa" : "Causas da pele oleosa"));

const contexto = (): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "dna-v7", articleDnaContentHash: HASH, promise: null, mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { intent: "informacional" }, normalizedIntent: "informacional" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

function observado(patch: Partial<{ articleDnaVersionId: string; articleDnaContentHash: string | null }> = {}) {
  const base = contexto();
  const context = {
    ...base,
    article: { ...base.article, ...patch },
  } as unknown as RadarArticleResearchContext;
  const structural = buildRadarCompetitiveModel({
    pages: PAGINAS, query: "skincare para pele oleosa", principal: "skincare para pele oleosa",
    editorialTopics: context.editorialTopics, keywordTexts: context.resolvedKeywordTexts, centralEntities: ["pele oleosa"],
  });
  const comparison = buildRadarEditorialComparison({ context, model: structural, observedIntent: "informacional" });
  return buildRadarCompetitiveObservedModel({
    context, references: [], selectedUrls: [], pages: PAGINAS, structural, comparison,
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
    observedAt: "2026-09-10T12:00:00.000Z",
  });
}

test("DIRETRIZ · o dossiê fica amarrado a artigo, versão e hash do ArticleDNA", () => {
  const bundle = buildRadarEvidenceBundle({
    observed: observado(),
    serp: { current: true, sufficient: true, valid: true },
  });

  assert.equal(bundle.binding.brandId, "brand-1");
  assert.equal(bundle.binding.articleId, "article-1");
  assert.equal(bundle.binding.articleDnaVersionId, "dna-v7");
  assert.equal(bundle.binding.articleDnaContentHash, HASH);
  assert.equal(bundle.serpStanding.authoritative, true);
  assert.doesNotThrow(() => assertRadarEvidenceProvenance(bundle));

  /* E é a fotografia INTEIRA que viaja, não um resumo dela. */
  assert.ok(bundle.observed.evidence.comparison, "o confronto com o ArticleDNA vai junto");
  assert.ok(bundle.observed.evidence.structural, "a camada estrutural vai junto");
  assert.ok(bundle.observed.evidence.semantic, "a camada conceitual vai junto");
  assert.ok(bundle.observed.competitors.length >= 0 && bundle.observed.concepts.all.length > 0);
});

test("DIRETRIZ · dossiê sem vínculo com o ArticleDNA não é entregue", () => {
  const semVersao = observado({ articleDnaVersionId: "" });
  assert.throws(
    () => buildRadarEvidenceBundle({ observed: semVersao, serp: { current: true, sufficient: true, valid: true } }),
    /RADAR_EVIDENCE_BINDING_MISSING_ARTICLE_DNA_VERSION/,
  );
});

test("DIRETRIZ · evidência não sobrevive ao fundamento que a originou", () => {
  const bundle = buildRadarEvidenceBundle({
    observed: observado(),
    serp: { current: true, sufficient: true, valid: true },
  });

  const mesma = radarEvidenceBundleMatchesArticle(bundle, { articleId: "article-1", articleDnaVersionId: "dna-v7", articleDnaContentHash: HASH });
  assert.equal(mesma.matches, true);

  const outraVersao = radarEvidenceBundleMatchesArticle(bundle, { articleId: "article-1", articleDnaVersionId: "dna-v8", articleDnaContentHash: HASH });
  assert.equal(outraVersao.matches, false);
  assert.match(outraVersao.reason, /versão corrente é dna-v8/);

  /* Mesma versão, conteúdo alterado por baixo: é o caso que interessa. */
  const outroHash = radarEvidenceBundleMatchesArticle(bundle, { articleId: "article-1", articleDnaVersionId: "dna-v7", articleDnaContentHash: `sha256:${"b".repeat(64)}` });
  assert.equal(outroHash.matches, false);
  assert.match(outroHash.reason, /conteúdo do ArticleDNA mudou/);

  const outroArtigo = radarEvidenceBundleMatchesArticle(bundle, { articleId: "article-2", articleDnaVersionId: "dna-v7", articleDnaContentHash: HASH });
  assert.equal(outroArtigo.matches, false);
});

test("DIRETRIZ · conflito registrado no dossiê passa pela invariante de autoridade", () => {
  const conflito = resolveRadarEvidencePrecedence({
    domain: "FACTUAL",
    claims: [
      afirmacao("CURRENT_SUFFICIENT_SERP", "O mercado afirma X."),
      afirmacao("PRIMARY_FACTUAL_EVIDENCE", "X está desatualizado."),
    ],
  });
  const bundle = buildRadarEvidenceBundle({
    observed: observado(),
    serp: { current: true, sufficient: true, valid: true },
    conflicts: [conflito],
  });

  assert.equal(bundle.conflicts.length, 1);
  assert.equal(bundle.conflicts[0].conflict, true);
  assert.ok(bundle.conflicts[0].overruled.some(item => item.source === "CURRENT_SUFFICIENT_SERP"), "o padrão do mercado fica no dossiê");

  /* Um conflito com a hierarquia invertida não consegue entrar. */
  const forjado = { ...conflito, prevailing: conflito.overruled[0], overruled: [{ ...conflito.prevailing, reason: "forjado" }] };
  assert.throws(
    () => buildRadarEvidenceBundle({ observed: observado(), serp: { current: true, sufficient: true, valid: true }, conflicts: [forjado] }),
    /RADAR_EVIDENCE_AUTHORITY_INVERTED/,
  );
});

/* ==============  7 · A DIRETRIZ ESTÁ ESCRITA, NÃO IMPLÍCITA  ========= */

test("DIRETRIZ · a regra está escrita no código e no projeto, para não ser reaberta a cada lote", () => {
  const autoridade = readFileSync("lib/radar/evidence-authority.ts", "utf8");
  assert.match(autoridade, /DIRETRIZ CANÔNICA/);
  assert.match(autoridade, /EVIDÊNCIA EXTERNA OBSERVÁVEL/);
  assert.match(autoridade, /MAS ELA NÃO DECIDE VERDADE FACTUAL/);
  assert.match(autoridade, /A IA fica ABAIXO da evidência, nunca acima/);

  const dossie = readFileSync("lib/radar/evidence-bundle.ts", "utf8");
  assert.match(dossie, /O PLANEJADOR NÃO PESQUISA DE NOVO/);
  assert.match(dossie, /O REDATOR NÃO REDESCOBRE NADA/);
  assert.match(dossie, /O Radar NÃO reescreve o ArticleDNA/);

  const doc = readFileSync("docs/05-radar/diretriz-autoridade-evidencial.md", "utf8");
  assert.match(doc, /SERP VIGENTE E SUFICIENTE\s+autoridade sobre a realidade da busca/);
  assert.match(doc, /A SERP não decide verdade factual/);
  assert.match(doc, /Planejador não pesquisa de novo/i);
  assert.match(doc, /Redator não redescobre nada/i);
  assert.match(doc, /A suíte falha, e a falha é o ponto/, "o documento diz o que fazer quando a regra for questionada");

  /* Módulos de domínio puro: a diretriz não conhece transporte. */
  for (const arquivo of ["lib/radar/evidence-authority.ts", "lib/radar/evidence-bundle.ts"]) {
    const codigo = readFileSync(arquivo, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const proibido of ["fetch(", "supabase", "Repository", "process.env", "async "]) {
      assert.equal(codigo.includes(proibido), false, `${proibido} não pode existir em ${arquivo}`);
    }
  }
});
