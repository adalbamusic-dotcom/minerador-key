import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARTICLE_BATCH_SERP_BLOCK_SIZE,
  articleBatchSerpScopeId,
  describeArticleBatchSerpLot,
  planArticleBatchSerpLot,
} from "../lib/arquiteto/article-batch-serp.ts";
import {
  ARTICLE_ALLINTITLE_EVIDENCE_LIMIT,
  buildArticleAllintitlePlan,
  resolveArticleAllintitleReuse,
  withArticleAllintitleMeasurement,
} from "../lib/arquiteto/article-allintitle.ts";
import {
  ARTICLE_KGR_DECISION_CONTRACT_VERSION,
  articleKgrIdentityChangedMaterially,
  mergeArticleAllintitleEvidence,
  readArticleKgrDecision,
  reconcileArticleKgrIdentityWithCanonical,
} from "../lib/arquiteto/article-kgr-decision.ts";
import { articleEditorialDiff } from "../lib/arquiteto/article-editorial-diff.ts";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { resolveArticleClassification, unresolvedClassifications, type ClassificationEvidence } from "../lib/arquiteto/article-classification-closure.ts";
import { buildArticleReviewChecklist } from "../lib/arquiteto/article-review-checklist.ts";
import { ArticleKgrIdentitySchema, type ArticleKgrIdentity } from "../lib/arquiteto/contracts.ts";
import { authorizeSerpPaidPlan, serpPaidPlanOptions } from "../lib/arquiteto/serp-lens-plan.ts";
import { NO_VOLUME_NOT_OBSERVED_REASON } from "../lib/arquiteto/article-serp-interpretation.ts";

/*
 * SERP NO ARTIGO E KGR OPCIONAL — frente Arquiteto (SDD
 * `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`,
 * fatias A1 a A5). Domínio puro e leitura estrutural da tela; nenhuma chamada
 * paga, nenhum banco, nenhum dev server.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("//"))
  .join("\n");
const workspace = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));

/* ------------------------------- A2 · o lote ------------------------------ */

const kw = (id: string, keyword: string, volume: number | null, territoryRef = "territory:a") => ({ id, keyword, volume_search: volume, territoryRef });

test("A2 · o lote da coleta tem só keyword com volume dos Silos em formação; sem volume nunca é coletada", () => {
  const lote = planArticleBatchSerpLot({
    siloRefs: ["territory:a"],
    excludedKeywordIds: new Set(["cabeca"]),
    keywords: [
      kw("k1", "skincare facial", 880),
      kw("k2", "rotina skincare", 0),
      kw("k3", "skincare noturno", null),
      kw("k4", "  Skincare   Facial ", 880),
      kw("k5", "outro silo", 500, "territory:b"),
      kw("cabeca", "cabeça do silo", 5000),
      kw("k6", "sérum vitamina c", 210),
    ],
  });
  assert.deepEqual(lote.targets.map(item => item.keywordId), ["k1", "k6"]);
  assert.deepEqual(lote.withoutVolume.map(item => item.keywordId), ["k2", "k3"]);
  assert.deepEqual(lote.sameTextAs, [{ keywordId: "k4", keyword: "Skincare   Facial", sameAsKeywordId: "k1" }]);
  assert.equal(lote.blocks.length, 1);
  assert.match(describeArticleBatchSerpLot(lote), /2 keyword\(s\) com volume nas 4 lentes · 2 sem volume ficam fora \(nunca coletadas\)/);
});

test("A2 · blocos cabem no teto da rota keyword-serp e o escopo do ledger é estável", () => {
  const muitas = Array.from({ length: 14 }, (_, indice) => kw(`k${indice}`, `keyword ${indice}`, 100 + indice));
  const lote = planArticleBatchSerpLot({ siloRefs: ["territory:a"], keywords: muitas });
  assert.equal(ARTICLE_BATCH_SERP_BLOCK_SIZE, 6);
  assert.deepEqual(lote.blocks.map(bloco => bloco.length), [6, 6, 2]);
  assert.ok(lote.blocks.every(bloco => bloco.length <= 12), "a rota aceita no máximo 12 keywords por pedido");
  assert.equal(articleBatchSerpScopeId(["territory:b", "territory:a"]), articleBatchSerpScopeId(["territory:a", "territory:b"]));
  assert.match(articleBatchSerpScopeId(["territory:a"]), /^article-batch:1:[0-9a-f]{8}$/);
});

test("A2 · Processar artigos coleta o lote ANTES da formação, sempre nas 4 lentes, e keyword-serp continua o núcleo", () => {
  const processar = workspace.slice(workspace.indexOf("const processArticleFormation = useCallback("));
  const coleta = processar.indexOf("collectArticleBatchSerpRef.current(silosDoLote)");
  const marcador = processar.indexOf("persistArticleFormationMarker(");
  assert.ok(coleta > 0 && coleta < marcador, "a coleta do lote vem antes do marcador da formação");
  assert.match(processar, /if \(coletaDoLote === "collected"\) return;/);
  const lote = workspace.slice(workspace.indexOf("const collectArticleBatchSerp = async"), workspace.indexOf("const collectArticleBatchSerpRef = useRef"));
  assert.match(lote, /fetch\("\/api\/arquiteto\/keyword-serp"/);
  // Correção de 2026-09-28: a cabeça da SiloPage com volume também é coletada ("todas as keywords com volume").
  assert.ok(lote.includes("planArticleBatchSerpLot({ keywords: masterListRef.current, siloRefs })"));
  // Nunca "só a principal": o terceiro argumento do diálogo é `false`.
  assert.match(lote, /askSerpPaidPlan\(`Primeira coleta da SERP do lote · 4 lentes · \$\{describeArticleBatchSerpLot\(lote\)\}`, merged, false\)/);
  assert.match(lote, /authorizedPaidQueries: escolha\.authorizedPaidQueries/);
  assert.match(lote, /setSerpSubjectReload\(current => current \+ 1\)/);
});

test("A2 · o plano da coleta nunca oferece só a lente principal", () => {
  const plano = { lenses: ["a"], perLens: [], paidQueries: 8, primaryPaidQueries: 2, extraPaidQueries: 6, conditionalPaidQueries: 0, recollectableQueries: 0, estimatedCostUsd: { min: 0, max: 0 }, collectedAtSpreadDays: 0, datesDiverge: false, payMissingExtraLenses: true, recollectStaleLenses: false, digestChecked: false as const };
  assert.deepEqual(serpPaidPlanOptions(plano, { allowPrimaryOnly: false }).map(opcao => opcao.id), ["all"]);
});

/* -------------------------- A3 · sem volume no parecer -------------------- */

test("A3 · a rota do parecer tira secundária sem volume do plano e da coleta e a declara como não observada", () => {
  const rota = semComentarios(readFileSync("app/api/arquiteto/serp/route.ts", "utf8"));
  assert.match(rota, /keyword\.id === group\.principalSuggestion\.keywordId \|\| hasSearchVolume\(keyword\.volume_search\)/);
  assert.match(rota, /if \(!observableInGroup\(group, keyword\)\) continue;/);
  assert.match(rota, /group\.keywords\.filter\(keyword => observableInGroup\(group, keyword\)\)\.flatMap\(keyword => requested\.extras/);
  assert.match(rota, /return lookup\?\.hit \|\| !observableInGroup\(group, keyword\) \? \[\] : \[\{/);
  assert.match(rota, /index === principalIndex \|\| !observableInGroup\(group, keyword\) \? null : collect\(/);
  assert.match(NO_VOLUME_NOT_OBSERVED_REASON, /Sem volume no Google Ads/);
});

/* ------------------------------ A1 · fechamento ---------------------------- */

const evidenciaBase = (kgr: ReturnType<typeof readArticleKgrDecision>): ClassificationEvidence => ({
  principalIntent: "informational",
  compositionIntents: [],
  serpObservedIntent: null,
  serpMixedIntent: false,
  serpResolved: true,
  principalFunnel: "TOFU",
  compositionFunnels: [],
  principalKgrScore: kgr.principalKgrScore,
  principalKgrApplicability: kgr.principalApplicability,
  fullKgr: kgr.fullKgr,
  humanKgrDecision: kgr.source === "HUMAN_DECISION" && (kgr.decision === "YES" || kgr.decision === "NO") ? kgr.decision : null,
  awaitingHumanKgrDecision: kgr.requiresHumanDecision,
  articleAppliesKgr: kgr.applyKgr,
  compatibilityConflicts: 0,
  compatibilityEvaluated: 0,
  compositionKeywordCount: 1,
  isPublished: false,
  principalProtected: false,
});

test("A1 · mesa e fechamento convergem: sem Aplicar KGR = Não aplicável (article_decision), nunca bloqueia", () => {
  const leitura = readArticleKgrDecision({ principal: { kgr_score: 0.1, analise_semantica: { kgr_aplicabilidade: "applicable" } } });
  const evidencia = evidenciaBase(leitura);
  const fechado = resolveArticleClassification(evidencia);
  assert.equal(fechado.kgrApplicability.value, "NOT_APPLICABLE");
  assert.equal(fechado.kgrApplicability.source, "article_decision");
  assert.equal(fechado.kgr.value, "NOT_APPLICABLE");
  assert.equal(fechado.kgr.source, "article_decision");
  assert.deepEqual(unresolvedClassifications(evidencia), []);
  // Sem score nenhum, também não bloqueia.
  assert.deepEqual(unresolvedClassifications(evidenciaBase(readArticleKgrDecision({ principal: {} }))), []);
});

test("A1 · Aplicar KGR Sim sem allintitle bloqueia com KGR_APPLICABLE_WITHOUT_METRIC até medir", () => {
  const semMetrica = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "human_confirmation", bindingStatus: "candidate", status: "candidate", decision: "YES", decisionSource: "HUMAN_DECISION" },
    principal: {},
  });
  assert.deepEqual(unresolvedClassifications(evidenciaBase(semMetrica)), ["KGR_APPLICABLE_WITHOUT_METRIC"]);
  const medido = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "human_confirmation", bindingStatus: "candidate", status: "candidate", decision: "YES", decisionSource: "HUMAN_DECISION", primaryKeywordId: "k1", evidence: [{ kind: "article_allintitle", keywordId: "k1", resultCount: 20, measuredAt: "2026-09-28T00:00:00.000Z" }] },
    principal: { volume_search: 400 },
    principalKeywordId: "k1",
  });
  assert.equal(medido.principalKgrScore, 0.05);
  assert.deepEqual(unresolvedClassifications(evidenciaBase(medido)), []);
  const fechado = resolveArticleClassification(evidenciaBase(medido));
  assert.equal(fechado.kgr.value, "YES");
  assert.equal(fechado.kgrApplicability.value, "APPLICABLE");
});

test("A1 · regra antiga gravada fecha como aplicada, sem abrir pendência", () => {
  const legado = readArticleKgrDecision({
    kgrIdentity: { isKgrArticle: true, source: "minerador", bindingStatus: "candidate", status: "candidate", primaryKeywordId: "k1", decision: "YES", decisionSource: "FULL_KGR_RULE" },
    principal: { kgr_score: 0.1 },
    principalKeywordId: "k1",
  });
  const fechado = resolveArticleClassification(evidenciaBase(legado));
  assert.equal(fechado.kgr.value, "YES");
  assert.deepEqual(unresolvedClassifications(evidenciaBase(legado)), []);
});

test("A1 · o checklist só cobra o KGR quando o artigo o aplica sem allintitle", () => {
  const base = { hasArticleDna: true, approved: false, unitType: { defined: true, label: "Artigo" }, serp: { kind: "compatible" as never, label: "Compatível", divergences: [] }, aiProposals: [], unresolvedConflicts: [] };
  const padrao = buildArticleReviewChecklist({ ...base, kgr: { label: "Não aplicável", requiresHumanDecision: false, fullKgr: false, principalKeyword: "x", principalScoreLabel: "—", applyKgr: false, metricMissing: false } });
  const kgr = padrao.decisions.find(item => item.kind === "article_kgr");
  assert.equal(kgr?.resolved, true);
  assert.match(String(kgr?.what), /KGR não aplicável por padrão/);
  const semMetrica = buildArticleReviewChecklist({ ...base, kgr: { label: "Sim", requiresHumanDecision: false, fullKgr: false, principalKeyword: "x", principalScoreLabel: "—", applyKgr: true, metricMissing: true } });
  assert.equal(semMetrica.decisions.find(item => item.kind === "article_kgr")?.resolved, false);
});

/* -------------------------- guarda de versionamento ------------------------ */

const identidade = (extra: Partial<ArticleKgrIdentity>): ArticleKgrIdentity => ({ isKgrArticle: false, source: "minerador", bindingStatus: "not_applicable", status: "not_kgr", primaryKeywordId: "k1", ...extra });

test("guarda · a troca da regra (v1 → v2) não abre sucessora; decisão humana e Principal trocada abrem", () => {
  const legadoV1 = identidade({ isKgrArticle: true, bindingStatus: "candidate", status: "candidate", decision: "YES", decisionSource: "FULL_KGR_RULE", decisionContractVersion: "article-kgr-decision-v1", boundSlug: "slug" });
  assert.equal(articleKgrIdentityChangedMaterially(legadoV1, undefined), false, "a derivação nova não carrega a identidade antiga: não é mudança real");
  assert.equal(articleKgrIdentityChangedMaterially(undefined, undefined), false);
  const humano = identidade({ decision: "NO", decisionSource: "HUMAN_DECISION", source: "human_confirmation", decidedAt: "2026-09-28T10:00:00.000Z" });
  assert.equal(articleKgrIdentityChangedMaterially(legadoV1, humano), true);
  assert.equal(articleKgrIdentityChangedMaterially(humano, humano), false);
  assert.equal(articleKgrIdentityChangedMaterially(identidade({ primaryKeywordId: "k1" }), identidade({ primaryKeywordId: "k2" })), true);
  // Medição de allintitle sem KGR aplicado não versiona; com KGR aplicado, versiona.
  const medida = identidade({ evidence: [{ kind: "article_allintitle", keywordId: "k1", resultCount: 10, measuredAt: "2026-09-28T00:00:00.000Z" }] });
  assert.equal(articleKgrIdentityChangedMaterially(undefined, medida), false);
  const aplicado = identidade({ isKgrArticle: true, bindingStatus: "candidate", status: "candidate", decision: "YES", decisionSource: "HUMAN_DECISION", source: "human_confirmation", decidedAt: "2026-09-27T00:00:00.000Z" });
  assert.equal(articleKgrIdentityChangedMaterially(aplicado, { ...aplicado, evidence: medida.evidence }), true);
});

test("guarda · a tela usa a guarda, não a comparação de JSON", () => {
  const preparar = workspace.slice(workspace.indexOf("const prepareSelectedLogicalArticleDnas = async"));
  assert.match(preparar, /if \(articleKgrIdentityChangedMaterially\(currentKgrIdentity, nextKgrIdentity\)\) \{/);
  assert.doesNotMatch(preparar.slice(0, 2500), /JSON\.stringify\(currentKgrIdentity\) !== JSON\.stringify\(nextKgrIdentity\)/);
});

/* ------------------------------ A4 · allintitle ---------------------------- */

const agora = new Date("2026-09-28T12:00:00.000Z");

test("A4 · reaproveita a medição do Arquiteto e depois a do Minerador, até 30 dias; Recalcular paga", () => {
  const doArquiteto = identidade({ evidence: [{ kind: "article_allintitle", keywordId: "k1", resultCount: 44, measuredAt: "2026-09-10T00:00:00.000Z" }] });
  assert.deepEqual(resolveArticleAllintitleReuse({ principalKeywordId: "k1", kgrIdentity: doArquiteto, mineradorResultCount: 99, mineradorMeasuredAt: "2026-09-27T00:00:00.000Z" }, { now: agora }), { kind: "arquiteto", resultCount: 44, measuredAt: "2026-09-10T00:00:00.000Z" });
  assert.deepEqual(resolveArticleAllintitleReuse({ principalKeywordId: "k1", kgrIdentity: null, mineradorResultCount: 99, mineradorMeasuredAt: "2026-09-27T00:00:00.000Z" }, { now: agora }), { kind: "minerador", resultCount: 99, measuredAt: "2026-09-27T00:00:00.000Z" });
  assert.equal(resolveArticleAllintitleReuse({ principalKeywordId: "k1", kgrIdentity: null, mineradorResultCount: 99, mineradorMeasuredAt: "2026-08-01T00:00:00.000Z" }, { now: agora }).kind, "to_pay", "mais de 30 dias");
  assert.equal(resolveArticleAllintitleReuse({ principalKeywordId: "k1", kgrIdentity: null, mineradorResultCount: null, mineradorMeasuredAt: null }, { now: agora }).kind, "to_pay");
  assert.equal(resolveArticleAllintitleReuse({ principalKeywordId: "k1", kgrIdentity: doArquiteto, mineradorResultCount: 99, mineradorMeasuredAt: "2026-09-27T00:00:00.000Z" }, { now: agora, recollect: true }).kind, "to_pay");
  // Medição de outra Principal não vale.
  const deOutra = identidade({ primaryKeywordId: "k2", evidence: [{ kind: "article_allintitle", keywordId: "k2", resultCount: 5, measuredAt: "2026-09-27T00:00:00.000Z" }] });
  assert.equal(resolveArticleAllintitleReuse({ principalKeywordId: "k1", kgrIdentity: deOutra, mineradorResultCount: null, mineradorMeasuredAt: null }, { now: agora }).kind, "to_pay");
});

test("A4 · o plano do allintitle entra no mesmo diálogo e na mesma autorização, uma consulta por artigo", () => {
  const plano = buildArticleAllintitlePlan([{ kind: "to_pay", reason: "x" }, { kind: "minerador", resultCount: 1, measuredAt: "2026-09-27T00:00:00.000Z" }, { kind: "to_pay", reason: "y" }]);
  assert.equal(plano.paidQueries, 2);
  assert.equal(plano.perLens[0].hits, 1);
  assert.deepEqual(plano.estimatedCostUsd, { min: 0.004, max: 0.007 });
  assert.equal(authorizeSerpPaidPlan(plano, 0).ok, false, "sem autorização nada é pago");
  assert.equal(authorizeSerpPaidPlan(plano, 2).ok, true);
  assert.equal(buildArticleAllintitlePlan([{ kind: "arquiteto", resultCount: 1, measuredAt: "2026-09-27T00:00:00.000Z" }]).paidQueries, 0);
});

test("A4 · a medição vai para kgrIdentity (campos existentes), não decide e guarda poucas medições", () => {
  let atual: ArticleKgrIdentity | undefined;
  for (let dia = 1; dia <= 7; dia += 1) {
    atual = withArticleAllintitleMeasurement({
      identity: atual, principalKeywordId: "k1", brandId: "marca", workflowItemId: "wf-1", principalVolume: 400,
      measurement: { resultCount: 40 + dia, measuredAt: `2026-09-2${dia}T00:00:00.000Z`, query: "allintitle:skincare facial", locationCode: 2076, languageCode: "pt", provider: "dataforseo", endpoint: "/v3/serp/google/organic/live/regular", providerRequestId: null, operationRequestId: `op-${dia}` },
      actorUserId: "ator", evaluatedAt: "2026-09-28T12:00:00.000Z",
    });
  }
  assert.ok(atual);
  assert.equal(ArticleKgrIdentitySchema.safeParse(atual).success, true);
  assert.equal(atual?.decision, "NO", "medir não aplica o KGR");
  assert.equal(atual?.decisionSource, "KEYWORD_APPLICABILITY_RULE");
  assert.equal(atual?.decisionContractVersion, ARTICLE_KGR_DECISION_CONTRACT_VERSION);
  assert.equal(atual?.resultCount, 47);
  assert.equal(atual?.kgrValue, 0.1175);
  assert.equal(atual?.evidence?.length, ARTICLE_ALLINTITLE_EVIDENCE_LIMIT);
  const leitura = readArticleKgrDecision({ kgrIdentity: atual, principal: { volume_search: 400 }, principalKeywordId: "k1" });
  assert.equal(leitura.principalResultCount, 47);
  assert.equal(leitura.scoreSource, "arquiteto_allintitle");

  // A decisão humana existente é preservada pela medição.
  const humano = withArticleAllintitleMeasurement({
    identity: identidade({ isKgrArticle: true, source: "human_confirmation", bindingStatus: "candidate", status: "candidate", decision: "YES", decisionSource: "HUMAN_DECISION", decidedAt: "2026-09-27T00:00:00.000Z" }),
    principalKeywordId: "k1", brandId: "marca", workflowItemId: "wf-1", principalVolume: 200,
    measurement: { resultCount: 30, measuredAt: "2026-09-28T00:00:00.000Z", query: "allintitle:x", locationCode: 2076, languageCode: "pt", provider: "dataforseo", endpoint: "/v3/serp/google/organic/live/regular", providerRequestId: "t1", operationRequestId: "op" },
    actorUserId: "ator", evaluatedAt: "2026-09-28T12:00:00.000Z",
  });
  assert.equal(humano.decisionSource, "HUMAN_DECISION");
  assert.equal(humano.isKgrArticle, true);
  assert.equal(humano.kgrValue, 0.15);
});

test("A4 · a mesa junta a medição mais nova da working copy à identidade do ArticleDNA, sem trocar a decisão", () => {
  const gravada = identidade({ isKgrArticle: true, bindingStatus: "candidate", status: "candidate", decision: "YES", decisionSource: "FULL_KGR_RULE" });
  const working = identidade({ evidence: [{ kind: "article_allintitle", keywordId: "k1", resultCount: 12, measuredAt: "2026-09-28T00:00:00.000Z" }] });
  const junta = mergeArticleAllintitleEvidence(gravada, working);
  assert.equal(junta?.decisionSource, "FULL_KGR_RULE");
  assert.equal(junta?.evidence?.length, 1);
  assert.equal(mergeArticleAllintitleEvidence(gravada, identidade({ primaryKeywordId: "k9", evidence: working.evidence })), gravada, "outra Principal não entra");
  assert.equal(mergeArticleAllintitleEvidence(undefined, working), working);
});

test("A4 · a rota do allintitle só lê o Minerador e grava no item de workflow do Arquiteto", () => {
  const rota = semComentarios(readFileSync("app/api/arquiteto/article-allintitle/route.ts", "utf8"));
  assert.match(rota, /from\("minerador_keywords"\)\.select\(ARTICLE_ALLINTITLE_KEYWORD_COLUMNS\)/);
  assert.doesNotMatch(rota, /from\("minerador_keywords"\)\.(update|upsert|insert)/);
  assert.doesNotMatch(rota, /(results_allintitle|kgr_score):\s*(medicao|kgrIdentity|calculate)/);
  assert.match(rota, /repository\.update\(String\(alvo\.item\.id\)/);
  assert.match(rota, /measureDataForSeoAllintitle\(/);
  assert.match(rota, /authorizeSerpPaidPlan\(plan, parsed\.data\.authorizedPaidQueries\)/);
  assert.match(rota, /operationKind: "article_allintitle"/);
});

/* ------------------------------ A5 · fase Silos ---------------------------- */

test("A5 · a consulta nas 4 lentes da fase Silos é manual, opcional e nunca coleta keyword sem volume", () => {
  const coleta = workspace.slice(workspace.indexOf("const collectKeywordSerp = async"), workspace.indexOf("const collectArticleBatchSerp = async"));
  assert.match(coleta, /const comVolume = doTerritorio\.filter\(kw => hasSearchVolume\(/);
  assert.match(coleta, /const todas = comVolume\.map\(/);
  assert.match(coleta, /ação manual e opcional/);
});

/* ------------- correção · versionamento depois de medir o allintitle ------------- */

const artigoDna = (kgrIdentity: ArticleKgrIdentity | undefined): ArticleDNA => ({
  schemaVersion: 1,
  articleId: "article-formation:1",
  brandId: "brand-1",
  principalKeywordId: "k1",
  secondaryKeywordIds: ["k2"],
  narrativeReinforcementIds: [],
  keywordReferences: [{ keywordId: "k1", role: "principal" }, { keywordId: "k2", role: "secundaria" }],
  territoryRef: "territory:1",
  siloId: "working-silo:1",
  suggestedSlug: "slug",
  canonical: null,
  architectureStatus: "architecture_confirmed",
  primaryKeywordPolicy: "locked",
  classification: { intent: "INFORMATIONAL", funnel: "TOP" },
  serpAssessmentRef: { entityId: "serp:1", versionId: "serp:1:base", contentHash: "sha256:serp" },
  ...(kgrIdentity ? { kgrIdentity } : {}),
  alerts: [],
  humanPendingDecisions: [],
} as unknown as ArticleDNA);

const medir = (identity: ArticleKgrIdentity | undefined, resultCount: number, measuredAt: string) => withArticleAllintitleMeasurement({
  identity,
  principalKeywordId: "k1",
  brandId: "brand-1",
  workflowItemId: "wi-1",
  principalVolume: 400,
  measurement: { resultCount, measuredAt, query: "allintitle:x", locationCode: 2076, languageCode: "pt", provider: "dataforseo", endpoint: "serp", providerRequestId: null, operationRequestId: "op-1" },
  actorUserId: "user-1",
  evaluatedAt: measuredAt,
});

/** O caminho da conclusão da formação: reconcilia com a canônica e só então compara. */
const reformar = (canonical: ArticleDNA, copiaDaPrincipal: ArticleKgrIdentity | undefined) => {
  const identidade = reconcileArticleKgrIdentityWithCanonical({ canonical: canonical.kgrIdentity, candidate: copiaDaPrincipal, principalKeywordId: "k1" });
  const candidato = artigoDna(identidade);
  return { identidade, diff: articleEditorialDiff({ canonical, candidate: candidato }) };
};

test("correção · medir o allintitle sem Aplicar KGR não abre sucessora do ArticleDNA", () => {
  const medida = medir(undefined, 30, "2026-09-28T10:00:00.000Z");
  const semIdentidade = reformar(artigoDna(undefined), medida);
  assert.equal(semIdentidade.diff.substantive, false, "sem identidade → medida não é revisão");
  const canonicaMedida = artigoDna(medida);
  const recalculada = medir(medida, 55, "2026-09-29T10:00:00.000Z");
  const recalcular = reformar(canonicaMedida, recalculada);
  assert.equal(recalcular.diff.substantive, false, "medida → Recalcular não é revisão");
  assert.equal(readArticleKgrDecision({ kgrIdentity: recalcular.identidade, principal: { volume_search: 400 }, principalKeywordId: "k1" }).principalResultCount, 55, "a medição nova segue na identidade gravada");
  // O diff do domínio, sozinho, também não conta medição sem KGR aplicado.
  assert.equal(articleEditorialDiff({ canonical: artigoDna(undefined), candidate: artigoDna(medida) }).substantive, false);
  assert.equal(articleEditorialDiff({ canonical: canonicaMedida, candidate: artigoDna(recalculada) }).substantive, false);
});

test("correção · com Aplicar KGR, a medição nova é revisão real", () => {
  const aplicado = identidade({ isKgrArticle: true, bindingStatus: "candidate", status: "candidate", decision: "YES", decisionSource: "HUMAN_DECISION", source: "human_confirmation", decidedAt: "2026-09-27T00:00:00.000Z" });
  const medido = medir(aplicado, 30, "2026-09-28T10:00:00.000Z");
  assert.equal(reformar(artigoDna(aplicado), medido).diff.substantive, true);
});

test("correção · reformar artigo com identidade antiga mantém a identidade e não abre sucessora", () => {
  const legados = [
    identidade({ isKgrArticle: true, bindingStatus: "confirmed", status: "confirmed", decision: "YES", decisionSource: "FULL_KGR_RULE", boundSlug: "slug", decisionContractVersion: "article-kgr-decision-v1" }),
    identidade({ isKgrArticle: true, bindingStatus: "candidate", status: "candidate", decision: "YES", decisionSource: "FULL_KGR_RULE", boundSlug: "slug", decisionContractVersion: "article-kgr-decision-v1" }),
    identidade({ isKgrArticle: false, bindingStatus: "candidate", status: "unknown", decision: "PENDING_HUMAN_DECISION", decisionSource: "AWAITING_HUMAN_DECISION", decisionContractVersion: "article-kgr-decision-v1" }),
  ];
  for (const legado of legados) {
    const canonica = artigoDna(legado);
    const semNada = reformar(canonica, undefined);
    assert.equal(semNada.diff.substantive, false, `${legado.decisionSource}: a cópia sem identidade não troca a gravada`);
    assert.deepEqual(semNada.identidade, legado, "a identidade da canônica segue como está");
    const soMedida = reformar(canonica, medir(undefined, 20, "2026-09-28T10:00:00.000Z"));
    assert.equal(soMedida.identidade?.decisionSource, legado.decisionSource, "a medição não troca a decisão gravada");
    assert.equal(soMedida.identidade?.bindingStatus, legado.bindingStatus);
  }
});

test("correção · decisão humana nova e Principal trocada continuam valendo", () => {
  const legado = identidade({ isKgrArticle: true, bindingStatus: "confirmed", status: "confirmed", decision: "YES", decisionSource: "FULL_KGR_RULE", boundSlug: "slug" });
  const humano = identidade({ decision: "NO", decisionSource: "HUMAN_DECISION", source: "human_confirmation", decidedAt: "2026-09-28T10:00:00.000Z" });
  assert.equal(reconcileArticleKgrIdentityWithCanonical({ canonical: legado, candidate: humano, principalKeywordId: "k1" }), humano);
  assert.equal(reformar(artigoDna(legado), humano).diff.substantive, true);
  assert.equal(reconcileArticleKgrIdentityWithCanonical({ canonical: legado, candidate: undefined, principalKeywordId: "k9" }), undefined, "a identidade da Principal anterior não passa para a nova");
  // Repetir a mesma escolha humana (só a data muda) não é revisão.
  assert.equal(articleKgrIdentityChangedMaterially(humano, { ...humano, decidedAt: "2026-09-29T10:00:00.000Z" }), false);
});

test("correção · a conclusão da formação e o preparo reconciliam a identidade antes de comparar", () => {
  const materializar = workspace.slice(workspace.indexOf("const payload: ArticleDNA = { ...vinculo.payload, kgrIdentity: kgrReconciliada };") - 900);
  assert.ok(materializar.includes("canonical: (canonicaAprovada?.payload ?? acceptedArticleDnas[articleId]?.payload)?.kgrIdentity,"));
  assert.ok(materializar.includes("const kgrReconciliada = reconcileArticleKgrIdentityWithCanonical({"));
  assert.ok(workspace.indexOf("const payload: ArticleDNA = { ...vinculo.payload, kgrIdentity: kgrReconciliada };") < workspace.indexOf("const diffEditorial = articleEditorialDiff({ canonical: canonicaAprovada?.payload ?? null, candidate: payload });"));
  const preparar = workspace.slice(workspace.indexOf("const prepareSelectedLogicalArticleDnas = async"));
  assert.ok(preparar.slice(0, 2500).includes("const nextKgrIdentity = reconcileArticleKgrIdentityWithCanonical({"));
});
