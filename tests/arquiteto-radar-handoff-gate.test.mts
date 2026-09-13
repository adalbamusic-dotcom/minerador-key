import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildArchitectSerpProvenance,
  buildRadarHandoffPlan,
  radarEvidenceIsStale,
  resolveRadarEligibility,
  type RadarCandidateArticle,
} from "../lib/arquiteto/radar-handoff-gate.ts";

const TERRITORIO = "territory:6d8facce-fac9-41fc-a242-03cf0480469b";

/** Um Article que passa em tudo; cada teste quebra um campo por vez. */
const pronto = (over: Partial<RadarCandidateArticle> = {}): RadarCandidateArticle => ({
  articleId: "article-formation:abc",
  label: "skin care pele oleosa",
  articleDnaVersionId: "v:1",
  articleDnaContentHash: "sha256:aaa",
  territoryRef: TERRITORIO,
  siloId: "silo-canonico-1",
  principalKeywordId: "k1",
  secondaryKeywordIds: ["k2", "k3"],
  narrativeReinforcementIds: [],
  suggestedSlug: "skin-care-pele-oleosa",
  keywordTerritoryRefs: [TERRITORIO, TERRITORIO, TERRITORIO],
  serpState: "current_supported",
  serpReason: null,
  internalLinkGraphApproved: true,
  belongsToCurrentScenario: true,
  readbackConfirmed: true,
  ...over,
});

const bloqueadoPor = (article: RadarCandidateArticle, code: string) =>
  resolveRadarEligibility(article).checks.find(check => check.code === code);

/* --------------------------- §2 o gate por Article ----------------------- */

test("um Article completo é elegível", () => {
  const resultado = resolveRadarEligibility(pronto());
  assert.equal(resultado.eligible, true);
  assert.deepEqual(resultado.blockers, []);
  assert.ok(resultado.checks.every(check => check.ok));
});

test("Silo canônico ausente barra, mesmo com território confirmado", () => {
  // É exatamente o caso real: o pai existe em `territoryRef`, mas o `siloId`
  // só passa a existir quando SiloDNA e SiloPage são consolidados.
  const resultado = resolveRadarEligibility(pronto({ siloId: null }));
  assert.equal(resultado.eligible, false);
  assert.match(resultado.blockers.join(" "), /falta consolidar SiloDNA e SiloPage/);
  // E o pai continua declarado: são gates diferentes.
  assert.equal(bloqueadoPor(pronto({ siloId: null }), "ARTICLE_PARENT_EXPLICIT")?.ok, true);
});

test("ArticleDNA de acervo não vai ao Radar", () => {
  const resultado = resolveRadarEligibility(pronto({ belongsToCurrentScenario: false }));
  assert.equal(resultado.eligible, false);
  assert.match(resultado.blockers.join(" "), /é acervo, não o cenário corrente/);
});

test("gravação sem readback não vai ao Radar", () => {
  const resultado = resolveRadarEligibility(pronto({ readbackConfirmed: false }));
  assert.match(resultado.blockers.join(" "), /não foi confirmada pelo remoto/);
});

test("pai ausente barra: o DNA não pode descobrir o Silo pelo consenso", () => {
  const resultado = resolveRadarEligibility(pronto({ territoryRef: null }));
  assert.match(resultado.blockers.join(" "), /não declara o Silo pai/);
});

test("cross-Silo barra", () => {
  const article = pronto({ keywordTerritoryRefs: [TERRITORIO, "territory:outro", TERRITORIO] });
  assert.equal(bloqueadoPor(article, "NO_CROSS_SILO")?.ok, false);
  assert.match(resolveRadarEligibility(article).blockers.join(" "), /pertencem a outro Silo/);
});

test("keyword em dois papéis é composição inválida", () => {
  const resultado = resolveRadarEligibility(pronto({ secondaryKeywordIds: ["k2"], narrativeReinforcementIds: ["k2"] }));
  assert.match(resultado.blockers.join(" "), /busca repetida entre Principal, secundárias e reforços/);
});

test("o teto de seis é guarda de saída", () => {
  const resultado = resolveRadarEligibility(pronto({
    secondaryKeywordIds: ["k2", "k3", "k4", "k5", "k6", "k7"],
  }));
  assert.match(resultado.blockers.join(" "), /o teto é 6/);
});

test("Article sem Principal ou sem endereço não vai", () => {
  assert.match(resolveRadarEligibility(pronto({ principalKeywordId: null })).blockers.join(" "), /não tem Principal/);
  assert.match(resolveRadarEligibility(pronto({ suggestedSlug: null })).blockers.join(" "), /não tem endereço proposto/);
});

/* ------------------- §3 SERP: executada ≠ resolvida ---------------------- */

test("SERP nunca executada barra com o motivo do gate", () => {
  const resultado = resolveRadarEligibility(pronto({
    serpState: "missing",
    serpReason: "Este artigo ainda não foi confrontado com a SERP.",
  }));
  assert.equal(bloqueadoPor(pronto({ serpState: "missing" }), "SERP_EXECUTED")?.ok, false);
  assert.match(resultado.blockers.join(" "), /ainda não foi confrontado com a SERP/);
});

test("divergente e inconclusivo têm evidência vigente; falta decisão", () => {
  for (const state of ["current_divergent_unresolved", "current_inconclusive_unresolved"]) {
    const article = pronto({ serpState: state });
    // A SERP FOI executada e a evidência é da composição atual.
    assert.equal(bloqueadoPor(article, "SERP_EXECUTED")?.ok, true);
    assert.equal(bloqueadoPor(article, "SERP_CURRENT")?.ok, true);
    // O que falta é a decisão editorial.
    assert.equal(bloqueadoPor(article, "SERP_RESOLVED")?.ok, false);
    assert.match(resolveRadarEligibility(article).blockers.join(" "), /espera decisão editorial/);
  }
});

test("divergência resolvida libera, sem virar sustentada", () => {
  for (const state of ["current_supported", "current_divergent_resolved", "current_inconclusive_resolved"]) {
    assert.equal(resolveRadarEligibility(pronto({ serpState: state })).eligible, true, `${state} deveria liberar`);
  }
});

test("stale e failed barram por coleta, não por decisão", () => {
  for (const state of ["stale", "failed"]) {
    const article = pronto({ serpState: state });
    assert.equal(bloqueadoPor(article, "SERP_CURRENT")?.ok, false);
    assert.equal(bloqueadoPor(article, "SERP_EXECUTED")?.ok, false);
  }
});

/* ---------------------- §6 Links Internos é dependência ------------------ */

test("sem InternalLinkGraph aprovado o Article não vai ao Radar", () => {
  const resultado = resolveRadarEligibility(pronto({ internalLinkGraphApproved: false }));
  assert.equal(resultado.eligible, false);
  assert.match(resultado.blockers.join(" "), /fase Links Internos ainda não fechou/);
});

/* -------------------------- §10 o plano do lote -------------------------- */

test("o plano diz o que destrava mais coisas de uma vez", () => {
  const plano = buildRadarHandoffPlan([
    pronto({ articleId: "a", siloId: null, internalLinkGraphApproved: false }),
    pronto({ articleId: "b", siloId: null, internalLinkGraphApproved: false }),
    pronto({ articleId: "c", siloId: null, internalLinkGraphApproved: false, serpState: "missing" }),
    pronto({ articleId: "d" }),
  ]);
  assert.equal(plano.eligible.length, 1);
  assert.equal(plano.blocked.length, 3);
  // O motivo que barra mais artigos vem primeiro.
  assert.equal(plano.blockersByCode[0].count, 3);
  assert.ok(["CANONICAL_SILO_BINDING", "INTERNAL_LINK_GRAPH_APPROVED"].includes(plano.blockersByCode[0].code));
  // E todo bloqueado carrega o motivo legível.
  assert.ok(plano.blocked.every(item => item.blockers.length > 0));
});

test("nenhum motivo de recusa é código cru", () => {
  const plano = buildRadarHandoffPlan([pronto({ siloId: null, serpState: "stale", internalLinkGraphApproved: false })]);
  for (const blocker of plano.blocked[0].blockers) {
    assert.ok(blocker.trim().split(" ").length >= 5, `motivo curto demais: ${blocker}`);
    assert.doesNotMatch(blocker, /^[A-Z_]+$/);
  }
});

/* -------------------- §3/§9 proveniência e stale ------------------------- */

test("a proveniência responde as perguntas do §3", () => {
  const provenance = buildArchitectSerpProvenance({
    assessmentId: "serp-formation:marca:cand:v1",
    formationBaseHash: "serpbase:abc",
    verdict: "DIVERGENCE",
    humanResolution: {
      decision: "accept_current_composition",
      reason: "a composição responde a mesma necessidade editorial",
      decidedBy: "ator",
      decidedAt: "2026-09-04T12:00:00.000Z",
    },
  });
  // Esta composição foi confrontada? qual base? qual parecer? quem resolveu?
  assert.equal(provenance.formationBaseHash, "serpbase:abc");
  assert.equal(provenance.verdict, "DIVERGENCE");
  assert.equal(provenance.humanResolution?.decision, "accept_current_composition");
  assert.ok(provenance.humanResolution?.reason);

  const semDecisao = buildArchitectSerpProvenance({
    assessmentId: "x", formationBaseHash: "y", verdict: "COMPATIBLE",
  });
  assert.equal(semDecisao.humanResolution, null);
});

test("evidência do Radar não herda para a versão seguinte do Article", () => {
  const mesma = radarEvidenceIsStale({
    evidenceArticleDnaVersionId: "v1",
    evidenceArticleDnaContentHash: "sha256:a",
    currentArticleDnaVersionId: "v1",
    currentArticleDnaContentHash: "sha256:a",
  });
  assert.equal(mesma, false);

  const sucessora = radarEvidenceIsStale({
    evidenceArticleDnaVersionId: "v1",
    evidenceArticleDnaContentHash: "sha256:a",
    currentArticleDnaVersionId: "v2",
    currentArticleDnaContentHash: "sha256:b",
  });
  assert.equal(sucessora, true);

  // Mesmo versionId com conteúdo diferente também envelhece: o hash é o que
  // descreve o artigo, e ignorá-lo repetiria o erro da SERP de outra base.
  const conteudoMudou = radarEvidenceIsStale({
    evidenceArticleDnaVersionId: "v1",
    evidenceArticleDnaContentHash: "sha256:a",
    currentArticleDnaVersionId: "v1",
    currentArticleDnaContentHash: "sha256:z",
  });
  assert.equal(conteudoMudou, true);
});

/* ------------------------------ pureza ----------------------------------- */

test("o gate é leitura: não envia, não persiste, não muta", () => {
  const source = readFileSync("lib/arquiteto/radar-handoff-gate.ts", "utf8")
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");
  assert.doesNotMatch(source, /fetch\(|supabase|persist|import.*ToRadar/);
  assert.match(readFileSync("lib/arquiteto/radar-handoff-gate.ts", "utf8"), /Este módulo NÃO envia nada/);
});

/* --------- a cadeia não pode perder o caminho de aprovação de novo -------- */

test("a fase Artigos mantém o fechamento do ArticleDNA no fluxo", () => {
  const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  /**
   * O botão vivia na aba `Revisão` do antigo seletor de processos. Quando a
   * fase Artigos trocou as quatro abas por um painel só, o único caminho de
   * aprovação saiu do fluxo junto — e sem ArticleDNA aprovado a etapa Silos
   * não forma working copy, o que trava Links Internos e o Radar.
   */
  const formacao = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");
  /*
   * O caminho continua no fluxo, com UMA autoridade.
   *
   * O botão daqui gravava `approved` por caminho próprio, sem passar por
   * `validateFormationConclusion` — era uma segunda aprovação, mais fraca que
   * a primeira. O ato é "Concluir formação"; o painel de revisão aponta para
   * ele em vez de virar beco sem saída.
   */
  assert.doesNotMatch(review, /data-testid="architect-approve-article"/);
  assert.match(review, /Concluir formação/);
  assert.match(review, /data-testid="architect-approval-blockers"/);
  assert.match(formacao, /data-testid="architect-confirm-formation"/);
  // E o painel da fase Artigos recebe o fechamento de fato.
  assert.match(workspace, /closure=\{\{ approved: articleReview\.approved/);
  assert.match(workspace, /data-testid="architect-closing-authority"/);
});

test("concluir formação continua exigindo que as pendências estejam resolvidas", () => {
  const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // O bloqueio não é decorativo: ele nomeia o que falta, nas duas telas.
  assert.match(review, /closure\.blockers\.map/);
  assert.match(review, /data-testid="architect-revision-pending"/);
  assert.match(workspace, /articleClosingIssues\.map/);
  // E a portaria da conclusão continua sendo a que decide gravar.
  assert.match(workspace, /const portaria = validateFormationConclusion\(\{/);
});

test("as decisões obrigatórias voltaram ao fluxo, com o controle que as resolve", () => {
  const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // Um botão desabilitado sem o controle que o destrava é um beco sem saída.
  assert.match(review, /data-testid="architect-review-decisions"/);
  assert.match(review, /data-testid="architect-review-unit-type"/);
  assert.match(review, /data-testid="architect-review-unit-type-confirm"/);
  assert.match(review, /O que falta:/);
  assert.match(review, /Como resolver:/);
  assert.match(workspace, /pendingDecisions=\{articleReview\.decisions\.filter\(item => !item\.resolved\)/);
  assert.match(workspace, /unitTypeControl=\{expandedUnitDraft/);
});
