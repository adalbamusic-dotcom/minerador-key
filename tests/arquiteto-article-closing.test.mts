import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveSerpFormationVerdict, type SerpFormationObservationInput } from "../lib/arquiteto/serp-formation-verdict.ts";
import { buildArticleReviewChecklist } from "../lib/arquiteto/article-review-checklist.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const observation = (overrides: Partial<SerpFormationObservationInput> = {}): SerpFormationObservationInput => ({
  keywordId: "kw-2",
  keyword: "manicure e pedicure a domicílio",
  currentRole: "secundaria",
  upstreamIntent: "Local",
  observedIntent: "Local",
  compatibility: "coerente",
  overlap: "low",
  dominantPageType: "Página de serviço específico",
  competition: "media",
  conflict: false,
  insufficientEvidence: false,
  likelyCannibalization: "unlikely",
  needsSeparation: false,
  principalPossiblyInadequate: false,
  decisionStatus: "pending",
  recommendationAction: "manter_secundaria",
  recommendationReason: null,
  ...overrides,
});

test("SERP inconclusiva não bloqueia nem exige decisão humana", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "insuficiente",
    keywordCount: 3,
    observations: [observation({ insufficientEvidence: true })],
  });

  assert.equal(verdict.kind, "INCONCLUSIVE");
  assert.equal(verdict.blocking, false);
  assert.equal(verdict.divergences.length, 0);
  assert.equal(verdict.canRefresh, true);
  assert.match(verdict.impact, /Nenhuma alteração estrutural obrigatória/);
});

test("artigo com uma única keyword não recebe conflito de agrupamento", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "prioritaria",
    keywordCount: 1,
    observations: [observation({ keywordId: "kw-1", currentRole: "principal", upstreamIntent: "Transacional", observedIntent: "Informacional", conflict: true })],
  });

  assert.equal(verdict.kind, "INCONCLUSIVE");
  assert.equal(verdict.blocking, false);
  assert.equal(verdict.divergences.length, 0);
  assert.ok(verdict.observations.some(item => item.includes("intenção upstream")));
  assert.match(verdict.explanation, /uma única keyword/);
});

test("divergência real mostra objeto, evidência, motivo, impacto e ações", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "prioritaria",
    keywordCount: 2,
    observations: [
      observation({ keywordId: "kw-1", currentRole: "principal" }),
      observation({ compatibility: "incompativel", overlap: "low", needsSeparation: true, recommendationAction: "separar_artigo", recommendationReason: "Baixa sobreposição entre os Top 10." }),
    ],
  });

  assert.equal(verdict.kind, "DIVERGENCE");
  assert.equal(verdict.blocking, true);
  assert.equal(verdict.divergences.length, 1);
  const divergence = verdict.divergences[0];
  assert.equal(divergence.keyword, "manicure e pedicure a domicílio");
  assert.equal(divergence.currentRole, "secundaria");
  assert.match(divergence.upstreamFact, /Local/);
  assert.equal(divergence.overlapLabel, "Baixa");
  assert.equal(divergence.evidenceStrength, "Forte");
  assert.match(divergence.recommendation, /Separar/);
  assert.match(divergence.reason, /sobreposição/i);
  assert.deepEqual(divergence.actions, ["keep", "separate"]);
});

test("recomendação já decidida deixa de exigir decisão humana", () => {
  const verdict = resolveSerpFormationVerdict({
    hasAssessment: true,
    evidencePriority: "prioritaria",
    keywordCount: 2,
    observations: [
      observation({ keywordId: "kw-1", currentRole: "principal" }),
      observation({ compatibility: "incompativel", needsSeparation: true, recommendationAction: "separar_artigo", decisionStatus: "followed" }),
    ],
  });

  assert.equal(verdict.kind, "COMPATIBLE");
  assert.equal(verdict.blocking, false);
});

const checklistInput = (overrides: Partial<Parameters<typeof buildArticleReviewChecklist>[0]> = {}) => buildArticleReviewChecklist({
  hasArticleDna: true,
  approved: false,
  kgr: { label: "Sim · KGR pleno", requiresHumanDecision: false, fullKgr: true, principalKeyword: "cleansing oil hada labo", principalScoreLabel: "0,022" },
  unitType: { defined: true, label: "Artigo" },
  serp: { kind: "COMPATIBLE", label: "Compatível", divergences: [] },
  aiProposals: [],
  unresolvedConflicts: [],
  ...overrides,
});

test("KGR pleno aparece como decisão já resolvida na Revisão", () => {
  const checklist = checklistInput();
  const kgr = checklist.decisions.find(decision => decision.kind === "article_kgr");

  assert.equal(kgr?.resolved, true);
  assert.equal(kgr?.state, "Sim · KGR pleno");
  assert.match(kgr?.what || "", /regra/);
  assert.equal(checklist.status, "READY_FOR_APPROVAL");
  assert.equal(checklist.statusLabel, "Pronto para aprovação");
  assert.equal(checklist.readyForApproval, true);
});

test("cada pendência responde o que falta, por quê e como resolver", () => {
  const checklist = checklistInput({
    kgr: { label: "A decidir", requiresHumanDecision: true, fullKgr: false, principalKeyword: "clínica popular", principalScoreLabel: "0,656" },
    unitType: { defined: false, label: null },
    serp: {
      kind: "DIVERGENCE",
      label: "Divergência",
      divergences: [{
        keywordId: "kw-2", keyword: "manicure a domicílio", currentRole: "secundaria", upstreamFact: "Local", observedEvidence: "Local",
        overlapLabel: "Baixa", dominantPageType: "Serviço", observedIntent: "Local", evidenceStrength: "Forte",
        recommendation: "Separar esta keyword do artigo atual.", reason: "Baixa compatibilidade.", impact: "Decisão humana.", actions: ["keep", "separate"],
      }],
    },
    aiProposals: [{ id: "ai-1", title: "Promover keyword a Principal", resolved: false }],
  });

  assert.equal(checklist.pendingCount, 4);
  assert.equal(checklist.status, "AWAITING_HUMAN_REVIEW");
  assert.equal(checklist.statusLabel, "Aguardando revisão humana");
  assert.equal(checklist.readyForApproval, false);
  for (const decision of checklist.decisions.filter(item => !item.resolved)) {
    assert.ok(decision.what.length > 0, `sem "o que falta": ${decision.title}`);
    assert.ok(decision.why.length > 0, `sem "por quê": ${decision.title}`);
    assert.ok(decision.how.length > 0, `sem "como resolver": ${decision.title}`);
  }
  assert.equal(checklist.blockers.length, 4);
});

test("zero pendências habilita a aprovação e aprovado vira estado final", () => {
  const ready = checklistInput();
  const approved = checklistInput({ approved: true });
  const inFormation = checklistInput({ hasArticleDna: false });

  assert.equal(ready.readyForApproval, true);
  assert.equal(ready.statusBadge, "ready_for_approval");
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.readyForApproval, false);
  assert.equal(approved.statusBadge, "approved");
  assert.equal(inFormation.status, "IN_FORMATION");
  assert.equal(inFormation.statusLabel, "Em formação");
});

test("a Revisão do Arquiteto exibe checklist, ações e o botão de aprovação", () => {
  assert.match(workspace, /data-testid="architect-review-checklist"/);
  assert.match(workspace, /data-testid="architect-review-decision"/);
  assert.match(workspace, /data-testid="architect-article-approval"/);
  assert.match(workspace, /Aprovar ArticleDNA/);
  assert.match(workspace, /disabled=\{!articleReview\.readyForApproval\}/);
  assert.match(workspace, /decisão\(ões\) pendente\(s\)/);
  assert.doesNotMatch(workspace, /alteração\(ões\) aguardando confirmação/);
});

test("a aba SERP expõe o veredito e as ações da divergência", () => {
  assert.match(workspace, /data-testid="architect-serp-verdict"/);
  assert.match(workspace, /data-testid="architect-serp-divergence"/);
  assert.match(workspace, /Atualizar SERP/);
  assert.match(workspace, /Manter no artigo/);
  assert.match(workspace, /Aplicar recomendação/);
});

test("Página de categoria sai da fase Artigos e continua rotulada no contrato", () => {
  assert.match(workspace, /const ARTICLE_PHASE_UNIT_TYPES: EditorialArticleUnitType\[\] = \["article", "service_page", "landing_page", "other"\]/);
  assert.match(workspace, /ARTICLE_PHASE_UNIT_TYPES\.map\(type =>/);
  assert.match(workspace, /Página de categoria é decisão de cluster e pertence à etapa Silos/);
});

test("o status do artigo acompanha o fechamento e nunca promete aprovação sem botão", () => {
  const badges = readFileSync("components/editorial/workflow-status.tsx", "utf8");

  assert.match(badges, /awaiting_human_review: \{ label: "Aguardando revisão humana"/);
  assert.match(badges, /ready_for_approval: \{ label: "Pronto para aprovação"/);
  assert.match(workspace, /articleReview\.statusBadge/);
});

/* ---- versão aprovada e revisão corrente são tempos diferentes ---------- */

test("aprovado COM pendência nova mostra a revisão, não some", () => {
  /*
   * O caso da captura: "Revisão humana · Aprovado" e "2 decisões pendentes"
   * ao mesmo tempo, sem ato nenhum para fechar a segunda. `approved`
   * curto-circuitava a contagem e o botão — condicionado a
   * `readyForApproval` — desaparecia justamente quando era necessário.
   */
  const comPendencia = checklistInput({
    approved: true,
    approvedVersionLabel: "v5",
    kgr: { label: "A decidir", requiresHumanDecision: true, fullKgr: false, principalKeyword: "skin care principia", principalScoreLabel: "0,177" },
  });

  assert.equal(comPendencia.approved, true, "a versão aprovada continua aprovada");
  assert.equal(comPendencia.revisionPending, true, "e a revisão corrente está pendente");
  assert.equal(comPendencia.status, "AWAITING_HUMAN_REVIEW", "o status descreve o presente, não o histórico");
  assert.ok(comPendencia.pendingCount > 0);
  assert.match(comPendencia.headline, /v5 aprovada · revisão atual com \d+ pendência/);
  // As pendências precisam ser nomeáveis: "resolva" sem dizer o quê é mudo.
  assert.ok(comPendencia.blockers.length > 0);
});

test("a frase nomeia a versão e o estado da revisão", () => {
  const semPendencia = checklistInput({ approved: true, approvedVersionLabel: "v7" });
  assert.equal(semPendencia.revisionPending, false);
  assert.equal(semPendencia.status, "APPROVED");
  assert.match(semPendencia.headline, /v7 aprovada · sem pendência/);
  // Aprovado e sem pendência não oferece sucessora: não há conteúdo alterado.
  assert.equal(semPendencia.readyForApproval, false);
});

test("a tela mostra os dois tempos e o caminho de resolução", () => {
  const review = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  assert.match(review, /data-testid="architect-article-headline"/);
  assert.match(review, /data-testid="architect-revision-pending"/);
  assert.match(review, /A versão aprovada permanece válida e não é reescrita/);
  // O botão não pode mais ser escondido por `approved` sozinho.
  assert.doesNotMatch(review, /\{closure\.approved \? \(\s*<p[\s\S]{0,200}\) : \(\s*<>/);
});

test("o papel da cópia de trabalho vem da decisão humana, não do legado", () => {
  const canonico = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");
  // `assignment.role` divergiu da decisão e produziu duas Principais na tela.
  assert.match(canonico, /const decidedRole = resolveArticleFormationState\(assignment\)\.decision\?\.role;/);
  assert.match(canonico, /const assignedRole = decidedRole \?\? assignmentStringOrUndefined\(assignment, "role", "reviewRole"\);/);
});
