import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessRadarClaimYmyl, buildRadarEvidenceClaims, radarClaimNeedsFactualSupport, radarClaimType } from "../lib/radar/claim-evidence.ts";
import {
  buildRadarFactualEvidence, buildRadarSourceVerificationPlan, classifyRadarSourceAuthority,
  radarSourceCanSupportFact, radarSourceId, radarSourceVerificationTargets,
} from "../lib/radar/source-authority.ts";
import { verifyRadarSources } from "../lib/radar/source-verification.ts";
import { buildRadarAuthorityEvidence, readRadarEeatSignalSet } from "../lib/radar/authority-evidence.ts";
import { assessRadarYmylRelevance } from "../lib/radar/editorial-policy.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import { buildRadarCompetitiveModel } from "../lib/radar/competitive-model.ts";
import { buildRadarEditorialComparison } from "../lib/radar/editorial-comparison.ts";
import { buildRadarCompetitiveObservedModel, radarObservedNarrative } from "../lib/radar/competitive-observed-model.ts";
import { resolveRadarEvidencePrecedence } from "../lib/radar/evidence-authority.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";
import type { RadarExternalEvidenceCandidate } from "../lib/radar/link-and-source-research.ts";

/*
 * ======  GATE 12 · YMYL, E-E-A-T, EVIDÊNCIA FACTUAL, ESPECIALISTA  =====
 *
 * Duas afirmações precisam conviver sem uma apagar a outra:
 *
 *   "9 de 14 concorrentes afirmam X"  → verdade sobre o MERCADO
 *   "a fonte primária condiciona X"   → verdade sobre o FATO
 *
 * Nenhuma nota de E-E-A-T. Nenhuma autoridade deduzida de recorrência. Nenhuma
 * pergunta genérica ao especialista. E nenhuma busca externa fora do ANALYZE
 * acionado pela pessoa.
 *
 * Nenhum teste chama rede: `fetchImpl` e `lookupImpl` são stubs locais.
 */

/* ============================== a fixture =============================== */

const link = (patch: Partial<RadarObservedLink>): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org",
  kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Causas da pele oleosa", rel: [], target: null, order: 0,
  ...patch,
});

const pagina = (id: string, headings: string[], patch: Partial<RadarExtractionPage> = {}): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [],
  wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link({})], error: null,
  ...patch,
});

/** Catorze comparáveis: causas em todas, uso na gravidez em nove, textura em cinco. */
const PAGINAS = Array.from({ length: 14 }, (_, index) => pagina(`A${index}`, index < 9
  ? ["Causas da pele oleosa", "Pode usar ácido salicílico na gravidez?"]
  : index < 12
    ? ["Causas da pele oleosa", "Qual textura de creme é mais agradável"]
    : ["Causas da pele oleosa"]));

const contexto = (extra: { topics?: string[] } = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: { brandId: "b", articleId: "a", articleDnaVersionId: "dna-v12", articleDnaContentHash: null, promise: "Como cuidar da pele oleosa com segurança", mainIntent: "informacional", hierarchy: "Pilar" },
  keywords: [{
    identity: { keywordId: "kw1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: { intent: "informacional", funnel: "tofu" }, normalizedIntent: "informacional" },
  }],
  editorialTopics: extra.topics ?? ["causas da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: null, formationSerp: null, internalLinks: null, limitations: [],
} as unknown as RadarArticleResearchContext);

const semantico = (pages = PAGINAS) => buildRadarSemanticConceptModel({
  pages, centralEntities: ["pele oleosa"], keywordTexts: ["skincare para pele oleosa"],
});

const claims = (pages = PAGINAS) => buildRadarEvidenceClaims({
  semantic: semantico(pages),
  articleYmyl: assessRadarYmylRelevance(contexto()),
  sourcesByPage: new Map(pages.map(page => [page.id, page.observedLinks.map(item => item.destinationDomain)])),
});

/* ==============  G, H, I e J · YMYL POR AFIRMAÇÃO  ==================== */

test("GATE 12 · G — afirmação de alta consequência sobe para HIGH", () => {
  const gravidez = assessRadarClaimYmyl({ text: "Pode usar ácido salicílico na gravidez?" });

  assert.equal(gravidez.relevance, "HIGH");
  assert.equal(gravidez.claimType, "SAFETY");
  assert.equal(gravidez.sensitivePopulation, true);
  assert.ok(gravidez.signals.includes("decisão sobre saúde ou corpo"));
  assert.ok(gravidez.signals.includes("população sensível mencionada"));
  assert.ok(gravidez.reason.length > 20);
  assert.equal(gravidez.confidence, "HIGH");
});

test("GATE 12 · H — afirmação estética não vira HIGH por estar num artigo de pele", () => {
  const textura = assessRadarClaimYmyl({
    text: "Qual textura de creme é mais agradável",
    articleYmyl: assessRadarYmylRelevance(contexto()),
  });

  assert.equal(textura.relevance, "NONE", "preferência não é decisão sensível");
  assert.equal(textura.sensitivePopulation, false);
  assert.match(textura.reason, /sem domínio de decisão sensível/);
  assert.equal(radarClaimNeedsFactualSupport({ ymyl: textura } as never), false);

  /* E a régua não é o nicho: a mesma frase sobre finanças também é preferência. */
  assert.equal(assessRadarClaimYmyl({ text: "Qual layout de planilha é mais bonito" }).relevance, "NONE");
});

test("GATE 12 · I — um mesmo artigo carrega afirmações de níveis diferentes", () => {
  const todas = claims();
  const niveis = new Set(todas.map(item => item.ymyl.relevance));

  assert.ok(niveis.size > 1, "CLAIM_LEVEL_YMYL: níveis diferentes no mesmo artigo");
  const gravidez = todas.find(item => /gravidez/i.test(item.canonicalClaim))!;
  const textura = todas.find(item => /textura/i.test(item.canonicalClaim));
  assert.equal(gravidez.ymyl.relevance, "HIGH");
  if (textura) assert.equal(textura.ymyl.relevance, "NONE");

  /* A afirmação é normalizada, não copiada do concorrente. */
  assert.equal(gravidez.canonicalClaim.endsWith("?"), false, "normalizada");
  assert.ok(gravidez.canonicalClaim.length < 120, "afirmação curta, não trecho de artigo");
  assert.ok(gravidez.provenance.includes("Conceito"));
});

test("GATE 12 · J — artigo sem sensibilidade não fabrica necessidade de especialista", () => {
  const paginas = Array.from({ length: 8 }, (_, index) => pagina(`N${index}`, ["Qual textura de creme é mais agradável"]));
  const autoridade = buildRadarAuthorityEvidence({
    ymyl: assessRadarYmylRelevance(contexto({ topics: [] })),
    claims: claims(paginas),
    pages: paginas,
    serp: { current: true, sufficient: true, valid: true },
  });

  assert.deepEqual(autoridade.specialistReviewRequirements, [], "SPECIALIST_REVIEW_REQUIREMENTS = []");
  assert.equal(autoridade.summary.claimsNeedingSupport, 0);
});

test("GATE 12 · o tipo da afirmação é lido pela consequência, não pela palavra bonita", () => {
  assert.equal(radarClaimType("Pode usar durante a gravidez?").type, "SAFETY");
  assert.equal(radarClaimType("Riscos do uso prolongado").type, "RISK");
  assert.equal(radarClaimType("Você deve aplicar duas vezes ao dia").type, "RECOMMENDATION");
  assert.equal(radarClaimType("Como aplicar o produto").type, "USAGE");
  assert.equal(radarClaimType("Causas da pele oleosa").type, "CAUSE");
  assert.equal(radarClaimType("O que é pele oleosa").type, "DEFINITION");
  assert.equal(radarClaimType("Diferença entre pele oleosa e mista").type, "COMPARISON");
});

/* ==========  K, L, M, N e O · A NATUREZA DAS FONTES  ================== */

test("GATE 12 · K, L e M — social, marketplace e comercial não viram fonte factual", () => {
  const social = classifyRadarSourceAuthority({ domain: "www.instagram.com", url: "https://www.instagram.com/marca" });
  assert.equal(social.type, "SOCIAL");
  assert.equal(radarSourceCanSupportFact(social.type), false);

  const marketplace = classifyRadarSourceAuthority({ domain: "www.mercadolivre.com.br", url: "https://www.mercadolivre.com.br/produto/x" });
  assert.equal(marketplace.type, "MARKETPLACE");

  const comercial = classifyRadarSourceAuthority({ domain: "loja.exemplo.com", url: "https://loja.exemplo.com/produto/creme" });
  assert.equal(comercial.type, "COMMERCIAL");
  assert.equal(radarSourceCanSupportFact(comercial.type), false);

  /* Fabricante não vira científica por citar estudo no próprio site. */
  const fabricante = classifyRadarSourceAuthority({ domain: "marca-cosmeticos.com.br", url: "https://marca-cosmeticos.com.br/ciencia" });
  assert.notEqual(fabricante.type, "PRIMARY_SCIENTIFIC");
});

test("GATE 12 · as fontes factuais são reconhecidas pelos sinais do endereço", () => {
  assert.equal(classifyRadarSourceAuthority({ domain: "pubmed.ncbi.nlm.nih.gov", url: "https://pubmed.ncbi.nlm.nih.gov/123/" }).type, "PRIMARY_SCIENTIFIC");
  assert.equal(classifyRadarSourceAuthority({ domain: "www.gov.br", url: "https://www.gov.br/anvisa/x" }).type, "REGULATOR");
  assert.equal(classifyRadarSourceAuthority({ domain: "portal.gov.br", url: "https://portal.gov.br/saude" }).type, "OFFICIAL_GOVERNMENT");
  assert.equal(classifyRadarSourceAuthority({ domain: "www.cochrane.org", url: "https://www.cochrane.org/reviews/x" }).type, "SYSTEMATIC_REVIEW");
  assert.equal(classifyRadarSourceAuthority({ domain: "www.harvard.edu", url: "https://www.harvard.edu/pesquisa" }).type, "ACADEMIC_INSTITUTION");

  /*
   * E o limite fica declarado: `usp.br` é uma universidade e o endereço não
   * diz isso. Sem `.edu` nem verificação, a resposta honesta é indeterminada —
   * a alternativa seria manter uma lista de instituições, que envelhece e
   * favorece as que alguém lembrou de escrever.
   */
  const semSinal = classifyRadarSourceAuthority({ domain: "usp.br", url: "https://usp.br/pesquisa" });
  assert.equal(semSinal.type, "UNKNOWN");
  assert.match(semSinal.classificationReason, /não foi determinada/);
  for (const tipo of ["PRIMARY_SCIENTIFIC", "REGULATOR", "OFFICIAL_GOVERNMENT", "SYSTEMATIC_REVIEW", "ACADEMIC_INSTITUTION"] as const) {
    assert.equal(radarSourceCanSupportFact(tipo), true);
  }
});

test("GATE 12 · N — recorrência não transforma domínio em autoridade", () => {
  /* Citado por seis concorrentes e ainda assim indeterminado sem verificação. */
  const semVerificar = classifyRadarSourceAuthority({ domain: "www.aad.org", url: "https://www.aad.org/public/diseases/oily-skin" });
  assert.equal(semVerificar.type, "UNKNOWN", "TLD .org sozinho não classifica");
  assert.equal(semVerificar.verified, false);
  assert.match(semVerificar.classificationReason, /não classifica sozinho a natureza da fonte/);
  assert.match(semVerificar.provenance, /não foi verificada nesta investigação/);

  /* Com a página verificada declarando organização, aí há base. */
  const verificada = classifyRadarSourceAuthority({
    domain: "www.aad.org",
    url: "https://www.aad.org/public/diseases/oily-skin",
    verifiedPage: pagina("V", ["x"], { url: "https://www.aad.org/public/diseases/oily-skin", structuredDataTypes: ["MedicalOrganization"] }),
  });
  assert.equal(verificada.type, "PROFESSIONAL_ORGANIZATION");
  assert.equal(verificada.verified, true);
  assert.match(verificada.provenance, /conteúdo verificado/);

  /* Um blog comercial citado dez vezes continua comercial. */
  const blog = classifyRadarSourceAuthority({ domain: "blogdaloja.com.br", url: "https://blogdaloja.com.br/produto/creme" });
  assert.equal(blog.type, "COMMERCIAL");
});

test("GATE 12 · O — a mesma fonte ligada a várias afirmações preserva a procedência de cada uma", () => {
  const todas = claims();
  const comFonte = todas.filter(item => item.observedSourceDomains.includes("www.aad.org"));

  assert.ok(comFonte.length >= 2, "a mesma fonte aparece em mais de uma afirmação");
  for (const claim of comFonte) {
    assert.ok(claim.provenance.includes(claim.conceptId), "cada afirmação diz de que conceito veio");
    assert.ok(claim.market.supportingCompetitors.length > 0, "e quais páginas a sustentam");
    assert.ok(claim.market.supportingCompetitors.every(item => item.url.startsWith("https://")));
  }
});

/* ===========  6 e 7 · MERCADO E FATO SÃO EIXOS SEPARADOS  =========== */

const evidenciaContraria = (claimId: string) => ({
  claimId,
  sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/123/",
  sourceDomain: "pubmed.ncbi.nlm.nih.gov",
  sourceType: "PRIMARY_SCIENTIFIC" as const,
  supportType: "QUALIFIES" as const,
  evidenceSummary: "O uso é seguro apenas em concentração abaixo de 2% e sob orientação profissional.",
  sourceTitle: "Salicylic acid in pregnancy",
  author: "Autor Exemplo",
  hasDates: true,
  confidence: "HIGH" as const,
  provenance: "https://pubmed.ncbi.nlm.nih.gov/123/ · verificada e interpretada por especialista.",
  limitations: [],
});

test("GATE 12 · C — recorrência forte convive com sustentação factual fraca", () => {
  const todas = claims();
  const gravidez = todas.find(item => /gravidez/i.test(item.canonicalClaim))!;

  assert.equal(gravidez.market.recurrence, "STRONG", "9 de 14 é recorrência forte");
  assert.match(gravidez.market.statement, /9 de 14 concorrentes/);

  const autoridade = buildRadarAuthorityEvidence({
    ymyl: assessRadarYmylRelevance(contexto()),
    claims: todas, pages: PAGINAS,
    serp: { current: true, sufficient: true, valid: true },
  });
  assert.ok(autoridade.summary.claimsWithEvidenceGap > 0, "MARKET_PATTERN = STRONG · FACTUAL_SUPPORT = WEAK");
  assert.ok(autoridade.limitations.some(item => /não têm fonte adequada/.test(item)));

  /* E a observação do mercado continua intacta. */
  assert.equal(autoridade.claims.find(item => item.claimId === gravidez.claimId)!.market.competitors, 9);
});

test("GATE 12 · 16 e 17 — conflito registra os dois lados e não corrige a SERP", () => {
  const todas = claims();
  const gravidez = todas.find(item => /gravidez/i.test(item.canonicalClaim))!;
  const autoridade = buildRadarAuthorityEvidence({
    ymyl: assessRadarYmylRelevance(contexto()),
    claims: todas, pages: PAGINAS,
    factualEvidence: [evidenciaContraria(gravidez.claimId)],
    serp: { current: true, sufficient: true, valid: true },
  });

  const conflito = autoridade.marketVsFactConflicts.find(item => item.claimId === gravidez.claimId)!;
  assert.ok(conflito, "MARKET_VS_FACT_CONFLICTS");
  assert.equal(conflito.conflictType, "MARKET_VS_FACTUAL_EVIDENCE");
  assert.match(conflito.marketObservation, /9 de 14 concorrentes/, "os nove continuam lá");
  assert.match(conflito.factualPosition, /concentração abaixo de 2%/);
  assert.match(conflito.impact, /só se sustenta sob a condição/);

  /* PRIMARY_FACTUAL_PRECEDENCE_ENFORCED — pela hierarquia canônica. */
  assert.equal(conflito.resolution.prevailing.source, "PRIMARY_FACTUAL_EVIDENCE");
  assert.equal(conflito.resolution.domain, "FACTUAL");
  assert.ok(conflito.resolution.overruled.some(item => item.source === "CURRENT_SUFFICIENT_SERP"),
    "a leitura do mercado é sobreposta, não apagada");
  assert.equal(conflito.resolution.conflict, true);

  /* A SERP não é corrigida: recorrência e conceitos permanecem como observados. */
  assert.equal(autoridade.claims.find(item => item.claimId === gravidez.claimId)!.market.recurrence, "STRONG");
});

/* ============  34 · A HIERARQUIA NO CAMINHO REAL  =================== */

test("GATE 12 · A e B — sobre o mercado, a SERP prevalece sobre heurística e IA", () => {
  const competitivo = resolveRadarEvidencePrecedence({
    domain: "COMPETITIVE",
    claims: [
      { source: "DETERMINISTIC_HEURISTIC", claim: "A regra sugere outro formato.", provenance: "heuristica" },
      { source: "AI_INTERPRETATION", claim: "Prefiro outra leitura da amostra.", provenance: "ia" },
      { source: "CURRENT_SUFFICIENT_SERP", claim: "14 de 14 páginas usam guia editorial.", provenance: "serp" },
    ],
  });
  assert.equal(competitivo.prevailing.source, "CURRENT_SUFFICIENT_SERP", "SERP_COMPETITIVE_PRECEDENCE_ENFORCED");
  assert.equal(competitivo.overruled.length, 2, "AI_CAN_OVERRIDE_EVIDENCE = NO");
});

test("GATE 12 · D — fonte primária prevalece sobre secundária na mesma questão factual", () => {
  const factual = resolveRadarEvidencePrecedence({
    domain: "FACTUAL",
    claims: [
      { source: "OTHER_RADAR_EVIDENCE", claim: "Uma publicação editorial afirma X.", provenance: "editorial" },
      { source: "PRIMARY_FACTUAL_EVIDENCE", claim: "A literatura primária condiciona X.", provenance: "pubmed" },
    ],
  });
  assert.equal(factual.prevailing.source, "PRIMARY_FACTUAL_EVIDENCE");
});

test("GATE 12 · E e F — SERP obsoleta perde precedência, e evidência sem procedência não entra", () => {
  const autoridade = buildRadarAuthorityEvidence({
    ymyl: assessRadarYmylRelevance(contexto()),
    claims: claims(), pages: PAGINAS,
    serp: { current: false, sufficient: true, valid: true },
  });
  assert.equal(autoridade.serpStanding.authoritative, false);
  assert.ok(autoridade.limitations.some(item => /sem precedência/.test(item)));

  assert.throws(
    () => resolveRadarEvidencePrecedence({ domain: "FACTUAL", claims: [{ source: "PRIMARY_FACTUAL_EVIDENCE", claim: "X", provenance: "" }] }),
    /RADAR_EVIDENCE_CLAIM_WITHOUT_PROVENANCE/,
  );
});

/* ================  1 · E-E-A-T É SINAL, NUNCA NOTA  ================= */

test("GATE 12 · E-E-A-T sai como sinais observados, com procedência e sem nota", () => {
  const sinais = readRadarEeatSignalSet({ pages: PAGINAS });

  assert.ok(sinais.length >= 6);
  assert.deepEqual(
    [...new Set(sinais.map(item => item.dimension))].sort(),
    ["AUTHORITATIVENESS", "EXPERIENCE", "EXPERTISE", "TRUST"],
  );
  for (const sinal of sinais) {
    assert.ok(["SUPPORTED", "DECLARED", "UNVERIFIED", "ABSENT"].includes(sinal.state));
    assert.ok(sinal.observation.length > 10);
    assert.ok(sinal.provenance.length > 10);
    assert.equal(typeof sinal.pages, "number");
  }

  /* Experiência e credencial saem como DECLARADAS — a página diz, não prova. */
  const experiencia = sinais.find(item => item.key === "FIRSTHAND_ACCOUNT")!;
  assert.equal(experiencia.state, "DECLARED");
  assert.match(experiencia.observation, /o Radar não verifica se aconteceu/);
  const credencial = sinais.find(item => item.key === "DECLARED_CREDENTIAL")!;
  assert.match(credencial.observation, /Escrita na página, não conferida/);

  /* EEAT_IS_SCORE = NO — varredura no módulo. */
  const fonte = readFileSync("lib/radar/authority-evidence.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["eeatScore", "EEAT_SCORE", "authorityScore", "AUTHORITY_SCORE", "trustScore"]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} seria uma nota inventada`);
  }
});

/* =========  P, Q, R, S e T · A PREPARAÇÃO DO ESPECIALISTA  ========= */

test("GATE 12 · P — afirmação sensível sem fonte adequada vira ponto de revisão", () => {
  const todas = claims();
  const autoridade = buildRadarAuthorityEvidence({
    ymyl: assessRadarYmylRelevance(contexto()), claims: todas, pages: PAGINAS,
    serp: { current: true, sufficient: true, valid: true },
  });

  const semFonte = autoridade.specialistReviewRequirements.find(item => item.kind === "RESOLVE_FACTUAL_UNCERTAINTY")!;
  assert.ok(semFonte, "EVIDENCE_GAP → SPECIALIST_REVIEW_REQUIRED");
  assert.match(semFonte.factualEvidence, /Nenhuma fonte factual adequada/);
  assert.match(semFonte.whyReviewIsNeeded, /sem fonte adequada que a sustente/);
  assert.equal(semFonte.priority, "HIGH");
});

test("GATE 12 · Q — afirmação bem sustentada pede verificação e experiência, não falsa incerteza", () => {
  const todas = claims();
  const gravidez = todas.find(item => /gravidez/i.test(item.canonicalClaim))!;
  const autoridade = buildRadarAuthorityEvidence({
    ymyl: assessRadarYmylRelevance(contexto()), claims: todas, pages: PAGINAS,
    factualEvidence: [{ ...evidenciaContraria(gravidez.claimId), supportType: "SUPPORTS" }],
    serp: { current: true, sufficient: true, valid: true },
  });

  const sustentada = autoridade.specialistReviewRequirements.find(item => item.claimId === gravidez.claimId)!;
  assert.equal(sustentada.kind, "VERIFY_AND_ADD_EXPERIENCE");
  assert.match(sustentada.whyReviewIsNeeded, /tem sustentação factual/);
  assert.match(sustentada.specificQuestion, /Você confirma esta leitura/);
  assert.equal(/Não encontramos fonte adequada/.test(sustentada.specificQuestion), false, "nada de incerteza fabricada");
});

test("GATE 12 · R e S — a pergunta chega com contexto, nunca em folha em branco", () => {
  const todas = claims();
  const gravidez = todas.find(item => /gravidez/i.test(item.canonicalClaim))!;
  const autoridade = buildRadarAuthorityEvidence({
    ymyl: assessRadarYmylRelevance(contexto()), claims: todas, pages: PAGINAS,
    factualEvidence: [evidenciaContraria(gravidez.claimId)],
    serp: { current: true, sufficient: true, valid: true },
  });

  const doConflito = autoridade.specialistReviewRequirements.find(item => item.kind === "RESOLVE_CONFLICT")!;
  assert.ok(doConflito, "conflito factual gera pergunta específica");
  assert.match(doConflito.specificQuestion, /9 de 14 concorrentes/, "o que o mercado diz");
  assert.match(doConflito.specificQuestion, /concentração abaixo de 2%/, "o que a evidência diz");
  assert.match(doConflito.specificQuestion, /Na sua prática/, "e onde o profissional entra");

  /* SPECIALIST_QUESTIONS_CONTEXTUALIZED — nenhuma pergunta genérica. */
  for (const requisito of autoridade.specialistReviewRequirements) {
    assert.ok(requisito.specificQuestion.length > 80, "pergunta curta demais é folha em branco");
    assert.equal(/^O que você acha/i.test(requisito.specificQuestion), false);
    assert.ok(requisito.marketObservation.length > 10, "com a observação do mercado");
    assert.ok(requisito.provenance.length > 10, "e a procedência");
    assert.ok(["HIGH", "MEDIUM", "LOW"].includes(requisito.priority));
  }
});

test("GATE 12 · T — nenhum envio ao especialista neste gate", () => {
  for (const arquivo of ["lib/radar/authority-evidence.ts", "lib/radar/claim-evidence.ts", "lib/radar/source-authority.ts"]) {
    const codigo = readFileSync(arquivo, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    /*
     * A varredura é pela SUPERFÍCIE DE ENVIO, não pela palavra.
     *
     * "telegram" aparece legitimamente na lista de domínios de rede social que
     * o classificador reconhece — proibir a palavra proibiria classificar o
     * Telegram como rede social, que é justamente o que ele deve fazer.
     */
    assert.equal(/sendMessage|webhook|bot_?token|api\.telegram|telegram\.org/i.test(codigo), false, `TELEGRAM_USED = NO — ${arquivo}`);
    for (const proibido of ["fetch(", "supabase", "Repository", "process.env", "async "]) {
      assert.equal(codigo.includes(proibido), false, `${proibido} não pode existir em ${arquivo}`);
    }
  }
});

/* ========  10, 11, 12 e 38 · VERIFICAR É NAVEGAR, E TEM DONO  ====== */

const candidata = (domain: string, url: string, competitors: number): RadarExternalEvidenceCandidate => ({
  destinationUrl: url, domain, sourceType: "unknown", category: "CONTENT_REFERENCE",
  competitorsUsingIt: competitors, sampleSize: 14, queryCoverage: 1,
  anchors: [], sections: [], contexts: [], authoritySignals: [],
  confidence: "MEDIUM", provenance: [], reason: "fixture",
});

test("GATE 12 · 11 — a fila de verificação prioriza afirmação sensível e fonte recorrente", () => {
  const todas = claims();
  const plano = buildRadarSourceVerificationPlan({
    claims: todas,
    candidates: [
      candidata("www.aad.org", "https://www.aad.org/public/diseases/oily-skin", 6),
      candidata("pubmed.ncbi.nlm.nih.gov", "https://pubmed.ncbi.nlm.nih.gov/123/", 1),
      candidata("www.instagram.com", "https://www.instagram.com/marca", 4),
      candidata("www.mercadolivre.com.br", "https://www.mercadolivre.com.br/p/x", 3),
    ],
  });

  const dominios = plano.map(item => item.domain);
  assert.ok(dominios.includes("www.aad.org"), "recorrente e ligada a afirmação sensível");
  assert.ok(dominios.includes("pubmed.ncbi.nlm.nih.gov"), "potencial fonte primária");
  assert.equal(dominios.includes("www.instagram.com"), false, "rede social não entra na fila");
  assert.equal(dominios.includes("www.mercadolivre.com.br"), false, "marketplace não entra na fila");
  assert.ok(plano.every(item => item.reason.length > 10 && item.claimIds));
});

test("GATE 12 · 12 — o servidor resolve o destino; o cliente não escolhe URL", () => {
  const plano = buildRadarSourceVerificationPlan({
    claims: claims(),
    candidates: [candidata("www.aad.org", "https://www.aad.org/public/diseases/oily-skin", 6)],
  });

  const aceito = radarSourceVerificationTargets({ plan: plano, requestedSourceIds: [radarSourceId("https://www.aad.org/public/diseases/oily-skin")] });
  assert.equal(aceito.targets.length, 1);
  assert.equal(aceito.targets[0].candidateUrl, "https://www.aad.org/public/diseases/oily-skin", "a URL vem do plano persistido");

  const forjado = radarSourceVerificationTargets({ plan: plano, requestedSourceIds: ["source:deadbeef"] });
  assert.equal(forjado.targets.length, 0);
  assert.deepEqual(forjado.refused, [{ sourceId: "source:deadbeef", code: "SOURCE_UNKNOWN" }]);

  /* Não existe campo por onde uma URL do cliente entre. */
  const contrato = readFileSync("lib/radar/source-authority.ts", "utf8");
  const assinatura = contrato.slice(contrato.indexOf("export function radarSourceVerificationTargets"), contrato.indexOf("/* ========================== a evidência factual"));
  assert.equal(/url:\s*string/.test(assinatura), false, "o pedido carrega domínio, não endereço");
});

test("GATE 12 · 38 — verificar reutiliza os guardas da extração e não busca sozinho", async () => {
  let chamadas = 0;
  const html = `<html><head><title>Oily skin</title></head><body><h1>Oily skin</h1>
<p>Sebum production is regulated by hormones and other factors described here in detail.</p>
${"<p>Additional body copy to make the extraction succeed without trouble at all.</p>".repeat(6)}</body></html>`;
  const resposta = () => ({
    ok: true, status: 200, url: "https://www.aad.org/public/diseases/oily-skin",
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => html, arrayBuffer: async () => new TextEncoder().encode(html).buffer,
  }) as unknown as Response;

  const plano = buildRadarSourceVerificationPlan({
    claims: claims(),
    candidates: [candidata("www.aad.org", "https://www.aad.org/public/diseases/oily-skin", 6)],
  });
  const resultado = await verifyRadarSources({
    targets: plano,
    fetchImpl: (async () => { chamadas += 1; return resposta(); }) as unknown as typeof fetch,
    lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never,
    now: "2026-09-10T10:00:00.000Z",
  });

  assert.equal(chamadas, 1, "uma fonte, uma busca");
  assert.equal(resultado.verified.length, 1);
  assert.equal(resultado.verified[0].classification.verified, true);
  assert.ok(resultado.limitations.length > 0, "e as ausências da fonte são declaradas");

  /* Os guardas vêm da extração — não há uma segunda implementação. */
  const fonte = readFileSync("lib/radar/source-verification.ts", "utf8");
  assert.match(fonte, /extractCompetitorPage/);
  assert.equal(/new URL\(.*fetch|globalThis\.fetch/.test(fonte), false, "nenhum caminho de rede próprio");

  /* USER_ACTION_REQUIRED_FOR_FETCH — nenhum componente busca fonte. */
  for (const componente of ["modules/radar/radar-page.tsx", "modules/radar/radar-r3-workbench.tsx", "modules/radar/radar-r3-serp-panel.tsx"]) {
    const codigo = readFileSync(componente, "utf8");
    assert.equal(/verifyRadarSources/.test(codigo), false, `${componente} não pode buscar fonte`);
  }
});

test("GATE 12 · 13 e 14 — a evidência factual guarda resumo, não o artigo da fonte", () => {
  const todas = claims();
  const gravidez = todas.find(item => /gravidez/i.test(item.canonicalClaim))!;
  const page = pagina("F", ["Oily skin"], {
    url: "https://pubmed.ncbi.nlm.nih.gov/123/",
    metaDescription: "Resumo do estudo sobre uso tópico.",
    author: null, hasDates: false,
  });
  const semLeitura = buildRadarFactualEvidence({
    claim: gravidez, page,
    classification: classifyRadarSourceAuthority({ domain: "pubmed.ncbi.nlm.nih.gov", url: page.url, verifiedPage: page }),
  });

  assert.equal(semLeitura.supportType, "INSUFFICIENT", "sem interpretação, o estado honesto");
  assert.ok(semLeitura.evidenceSummary.length <= 400, "resumo compacto, não o artigo");
  assert.ok(semLeitura.limitations.some(item => /não identifica autoria/.test(item)));
  assert.ok(semLeitura.limitations.some(item => /não expõe data/.test(item)));
  assert.ok(semLeitura.limitations.some(item => /ninguém interpretou/.test(item)));
  assert.equal(semLeitura.confidence, "LOW");

  const comLeitura = buildRadarFactualEvidence({
    claim: gravidez, page,
    classification: classifyRadarSourceAuthority({ domain: "pubmed.ncbi.nlm.nih.gov", url: page.url, verifiedPage: page }),
    reading: { supportType: "QUALIFIES", summary: "Seguro apenas abaixo de 2%.", readBy: "especialista" },
  });
  assert.equal(comLeitura.supportType, "QUALIFIES");
  assert.equal(comLeitura.confidence, "HIGH");
  assert.match(comLeitura.provenance, /interpretada por especialista/);
});

/* ==========  28, 29 e 30 · MODELO, BUNDLE E PROJEÇÃO  ============== */

function observado(extra: Parameters<typeof buildRadarCompetitiveObservedModel>[0] extends infer T ? Partial<T> : never = {}) {
  const context = contexto();
  const structural = buildRadarCompetitiveModel({
    pages: PAGINAS, query: "skincare para pele oleosa", principal: "skincare para pele oleosa",
    editorialTopics: context.editorialTopics, keywordTexts: context.resolvedKeywordTexts, centralEntities: ["pele oleosa"],
  });
  const comparison = buildRadarEditorialComparison({ context, model: structural, observedIntent: "informacional" });
  return buildRadarCompetitiveObservedModel({
    context, references: [], selectedUrls: [], pages: PAGINAS, structural, comparison,
    diagnostic: { dominantIntent: "informacional", dominantFormats: ["article"] },
    observedAt: "2026-09-10T12:00:00.000Z",
    ...extra,
  });
}

test("GATE 12 · 28 — a camada entra no modelo observado, sem relatório paralelo", () => {
  const modelo = observado();

  assert.ok(modelo.authorityEvidence, "COMPETITIVE_MODEL_INTEGRATED");
  assert.ok(modelo.authorityEvidence.claims.length > 0);
  assert.ok(modelo.authorityEvidence.eeatSignals.length > 0);
  assert.equal(modelo.authorityEvidence.ymylAssessment.relevance, assessRadarYmylRelevance(contexto()).relevance);

  const view = readFileSync("lib/radar/deep-research-view.ts", "utf8");
  assert.equal(/buildRadarAuthorityEvidence/.test(view), false, "a view lê do modelo, não monta por fora");
});

test("GATE 12 · 29 — a camada é serializável e mantém o vínculo com o ArticleDNA", () => {
  const modelo = observado();
  const round = JSON.parse(JSON.stringify(modelo.authorityEvidence));

  assert.equal(round.claims.length, modelo.authorityEvidence.claims.length, "RADAR_EVIDENCE_BUNDLE_READY");
  assert.equal(modelo.identity.articleDnaVersionId, "dna-v12", "e o modelo continua amarrado à versão");
  assert.ok(round.specialistReviewRequirements !== undefined);
  assert.ok(round.eeatSignals.every((item: { provenance: string }) => item.provenance));
});

test("GATE 12 · 30 e 31 — a projeção humana mostra a leitura e o conflito inteiro", () => {
  const todas = claims();
  const gravidez = todas.find(item => /gravidez/i.test(item.canonicalClaim))!;
  const modelo = observado({ factualEvidence: [evidenciaContraria(gravidez.claimId)] } as never);
  const secao = radarObservedNarrative(modelo).find(item => item.title === "Autoridade e evidência")!;
  const texto = secao.lines.join("\n");

  assert.ok(secao, "a seção existe na primeira camada");
  assert.match(texto, /Relevância YMYL do artigo/);
  assert.match(texto, /afirmação\(ões\) exigem sustentação factual/);
  assert.match(texto, /Especialista:/);

  /* Sem nota e sem ID técnico. */
  assert.equal(/score|nota \d|\d{2,3}\/100/i.test(texto), false, "EEAT_IS_SCORE = NO também na leitura");
  assert.equal(/claim:|concept:|page:/.test(texto), false, "identificadores ficam no modelo");
  assert.deepEqual(radarObservedNarrative(modelo).find(item => item.title === "Autoridade e evidência"), secao);
});

test("GATE 12 · 26 — o upstream continua intocado", () => {
  const antes = JSON.stringify(contexto());
  observado();
  assert.equal(JSON.stringify(contexto()), antes, "ARTICLE_UPSTREAM_MUTATED = NO");
});
