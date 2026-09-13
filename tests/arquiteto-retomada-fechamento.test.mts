import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCanonicalSiloClosurePlan,
  resolveCanonicalClosureResumption,
  verifyCanonicalSiloClosure,
} from "../lib/arquiteto/silo-composition-from-formations.ts";
import { resolveSiloClosureReadiness } from "../lib/arquiteto/silo-closure-readiness.ts";
import { proposalFromRemoteWorkingCopy } from "../lib/arquiteto/silo-working-copy-bridge.ts";
import { resolveArticleRowAxes } from "../lib/arquiteto/operational-status.ts";
import { siloConsolidationIssues } from "../lib/arquiteto/silo-consolidation.ts";
import type { CanonicalSiloWorkingCopy } from "../lib/arquiteto/canonical-workspace.ts";

/**
 * A RETOMADA DEPOIS DA MATERIALIZAÇÃO PARCIAL.
 *
 * A homologação produziu, de verdade:
 *
 *   FORMATIONS = 5/5     ARTICLEDNA = 5/5     SILODNA = 0
 *
 * e o fechamento morreu em "A proposta local de skincare não está carregada" —
 * um objeto de sessão que o F5 apaga, exigido depois de tudo o que importa já
 * estar gravado no servidor.
 */

const SILO = "territory:9da03dd0-cf37-45c3-8562-20e943aa37bd";
const BASE = "artbase:5a2426be65358552";
const REFS = ["cand:a", "cand:b", "cand:c", "cand:d", "cand:e"];

const congelada = (candidateRef: string, membros: number, materializado = true) => ({
  candidateRef,
  principalKeywordId: `${candidateRef}:principal`,
  members: Array.from({ length: membros }, (_, indice) => ({
    keywordId: `${candidateRef}:k${indice}`,
    role: indice === 0 ? ("principal" as const) : ("secundaria" as const),
  })),
  formationBaseHash: BASE,
  materializedArticleId: materializado ? candidateRef : null,
});

/** O estado que a homologação deixou: cinco formações, cinco artigos, zero Silo. */
const CINCO = [
  congelada("cand:a", 2), congelada("cand:b", 2), congelada("cand:c", 4),
  congelada("cand:d", 2), congelada("cand:e", 3),
];

const planoPronto = (formations = CINCO) => buildCanonicalSiloClosurePlan({
  formations,
  blockers: resolveSiloClosureReadiness({
    siloRef: SILO,
    activeCandidateRefs: REFS,
    concludedCandidateRefs: formations.map(item => item.candidateRef),
    pendingMaterializationRefs: formations.filter(item => !item.materializedArticleId).map(item => item.candidateRef),
    alreadyConsolidated: false,
  }).blockers,
});

/* ============ §5/§10 · o estado parcial é reconhecido e retomável ======== */

test("§5 — 5 formações, 5 ArticleDNA, 0 SiloDNA: CANONICAL_CLOSURE_RESUMABLE", () => {
  const retomada = resolveCanonicalClosureResumption({
    plan: planoPronto(),
    formations: CINCO,
    remoteApprovedArticleIds: REFS,
    canonicalSiloExists: false,
    canonicalSiloPageExists: false,
  });
  assert.equal(retomada.state, "RESUMABLE");
  if (retomada.state !== "RESUMABLE") return;
  assert.equal(retomada.existingArticleIds.length, 5);
  assert.deepEqual(retomada.missingFormationRefs, [], "NEW_ARTICLEDNA = 0: nada a materializar");
  assert.equal(retomada.pillarArticleId, "cand:c", "o Pilar é o do plano determinístico, não reescolhido");
  assert.equal(retomada.supportArticleIds.length, 4);
  assert.equal(retomada.narrativeOrder[0], "cand:c");
});

test("§10 — a fila de materialização da retomada é vazia: NEW_ARTICLEDNA = 0", () => {
  const plano = planoPronto();
  assert.equal(plano.state, "READY");
  if (plano.state !== "READY") return;
  assert.deepEqual(plano.materializationOrder, [], "os 5 já têm materializedArticleId");
  assert.equal(plano.expectedArticles, 5);
});

test("§10 — com o par canônico completo não há o que retomar", () => {
  const retomada = resolveCanonicalClosureResumption({
    plan: planoPronto(),
    formations: CINCO,
    remoteApprovedArticleIds: REFS,
    canonicalSiloExists: true,
    canonicalSiloPageExists: true,
  });
  assert.equal(retomada.state, "COMPLETE", "NEW_SILODNA = 0 · NEW_SILOPAGE = 0");
});

test("§6 — SiloDNA sem SiloPage NÃO conta como par: ainda é retomável", () => {
  const retomada = resolveCanonicalClosureResumption({
    plan: planoPronto(),
    formations: CINCO,
    remoteApprovedArticleIds: REFS,
    canonicalSiloExists: true,
    canonicalSiloPageExists: false,
  });
  assert.equal(retomada.state, "RESUMABLE", "metade do par é o estado parcial, não o fechamento");
});

test("§5 — sem o ArticleDNA do Pilar a retomada NÃO troca o Pilar por outro", () => {
  const retomada = resolveCanonicalClosureResumption({
    plan: planoPronto(),
    formations: CINCO,
    // `cand:c` é o Pilar e não está no remoto.
    remoteApprovedArticleIds: REFS.filter(ref => ref !== "cand:c"),
    canonicalSiloExists: false,
    canonicalSiloPageExists: false,
  });
  assert.equal(retomada.state, "NOT_APPLICABLE");
  if (retomada.state !== "NOT_APPLICABLE") return;
  assert.equal(retomada.blockers[0].code, "PILLAR_ARTICLE_MISSING");
});

test("§5 — bloqueio real impede a retomada; ela não contorna portão nenhum", () => {
  const contestado = buildCanonicalSiloClosurePlan({
    formations: CINCO,
    blockers: resolveSiloClosureReadiness({
      siloRef: SILO,
      activeCandidateRefs: REFS,
      concludedCandidateRefs: REFS,
      pendingMaterializationRefs: [],
      openBoundaryChallenges: [{ scopeLabel: "Skin care para peles oleosas" }],
    }).blockers,
  });
  const retomada = resolveCanonicalClosureResumption({
    plan: contestado,
    formations: CINCO,
    remoteApprovedArticleIds: REFS,
    canonicalSiloExists: false,
    canonicalSiloPageExists: false,
  });
  assert.equal(retomada.state, "NOT_APPLICABLE");
  if (retomada.state !== "NOT_APPLICABLE") return;
  assert.equal(retomada.blockers[0].code, "SILO_RECONSIDERATION_REQUIRED");
});

/* ========= §1/§3 · a working copy sai do remoto, sem proposta local ====== */

const remota = (overrides: Partial<CanonicalSiloWorkingCopy["workingCopy"]> = {}): CanonicalSiloWorkingCopy => ({
  workingCopyRef: `wc:${SILO}`,
  lockVersion: 3,
  workingCopy: {
    workingCopyRef: `wc:${SILO}`,
    brandId: "brand-1",
    territoryRef: SILO,
    name: "Skincare",
    slug: "skincare",
    formationStatus: "draft",
    existingSiloId: null,
    articleRefs: REFS.map(articleId => ({
      articleId,
      articleDnaVersionId: `${articleId}:v1`,
      articleDnaContentHash: `${articleId}:h1`,
    })),
    pillarSuggestionArticleId: "cand:c",
    pillarSelection: {
      articleId: "cand:c",
      actorUserId: "user-1",
      decidedAt: "2026-09-08T12:00:00.000Z",
      reason: "Fechamento canônico do Silo após a última formação concluída.",
      decidedOverArticleIds: [...REFS].sort(),
    },
    supportArticleIds: REFS.filter(ref => ref !== "cand:c"),
    exclusions: [],
    reasons: [],
    conflicts: [],
    ...overrides,
  },
} as unknown as CanonicalSiloWorkingCopy);

const versoes = new Map(REFS.map(articleId => [articleId, {
  versionId: `${articleId}:v1`,
  contentHash: `${articleId}:h1`,
  keywordReferences: [{ keywordId: `${articleId}:k0`, keywordDnaVersionId: "kv1", keywordDnaContentHash: "kh1" }],
}]));

test("§3 — a proposta é reconstruída da linha remota, com refs e Pilar reais", () => {
  const proposta = proposalFromRemoteWorkingCopy({ remote: remota(), articleVersionById: versoes });
  assert.equal(proposta.articleReferences.length, 5);
  assert.equal(proposta.pillarCandidateArticleId, "cand:c");
  assert.deepEqual(proposta.supportArticleIds, REFS.filter(ref => ref !== "cand:c").sort());
  assert.equal(proposta.articleReferences.filter(item => item.role === "pillar_candidate").length, 1);
  // Versão e hash vêm da linha remota, não de recálculo.
  for (const reference of proposta.articleReferences) {
    assert.equal(reference.articleDnaVersionId, `${reference.articleId}:v1`);
    assert.equal(reference.articleDnaContentHash, `${reference.articleId}:h1`);
  }
  // E a SiloPage continua distinta do Pilar.
  assert.equal(proposta.siloPage.distinctFromPillar, true);
  assert.equal(proposta.siloPage.pillarArticleId, null);
});

test("§3 — sem Pilar decidido a reconstrução NÃO promove a sugestão", () => {
  const proposta = proposalFromRemoteWorkingCopy({
    remote: remota({ pillarSelection: null }),
    articleVersionById: versoes,
  });
  assert.equal(proposta.pillarCandidateArticleId, null, "sugestão não é decisão");
  // E o portão recusa, como deve: consolidar sem Pilar é inventar arquitetura.
  const issues = siloConsolidationIssues({
    copy: proposta,
    articleVersions: [],
    humanConfirmedSilo: true,
  } as never);
  assert.ok(issues.some(issue => issue.includes("Pilar")), issues.join(" · "));
});

test("§4 — a proposta reconstruída passa no portão de composição", () => {
  const proposta = proposalFromRemoteWorkingCopy({ remote: remota(), articleVersionById: versoes });
  const articleVersions = REFS.map(articleId => ({
    versionId: `${articleId}:v1`,
    contentHash: `${articleId}:h1`,
    payload: { articleId, brandId: "brand-1" },
  }));
  const issues = siloConsolidationIssues({
    copy: proposta,
    articleVersions,
    humanConfirmedSilo: true,
    articleStatuses: Object.fromEntries(REFS.map(articleId => [articleId, "approved"])),
  } as never);
  for (const proibido of ["Pilar", "ArticleDNA ausente", "versão ou hash divergente", "Suportes não cobrem"]) {
    assert.equal(
      issues.some(issue => issue.includes(proibido)),
      false,
      `a composição remota não pode falhar por "${proibido}": ${issues.join(" · ")}`,
    );
  }
});

/* =================== §6 · o readback final continua exigente ============ */

test("§6 — completo só com 5 ArticleDNA, 1 SiloDNA e 1 SiloPage", () => {
  const artigos = REFS.map(articleId => ({
    articleId, versionId: `${articleId}:v1`, contentHash: `${articleId}:h1`, territoryRef: SILO, siloId: null,
  }));
  const veredito = verifyCanonicalSiloClosure({
    territoryRef: SILO,
    expectedArticleIds: REFS,
    expectedPillarArticleId: "cand:c",
    observedArticles: artigos,
    observedSiloDna: {
      siloId: "silo-1", territoryRef: SILO, pillarArticleId: "cand:c",
      supportArticleIds: REFS.filter(ref => ref !== "cand:c"),
      articleReferences: artigos.map(item => ({
        articleId: item.articleId,
        articleDnaVersionId: item.versionId,
        articleDnaContentHash: item.contentHash,
      })),
      versionId: "silo:v1", contentHash: "silo:h1",
    },
    observedSiloPage: {
      siloPageId: "page-1", siloId: "silo-1",
      siloDnaRef: { entityId: "silo-1", versionId: "silo:v1", contentHash: "silo:h1" },
    },
  });
  assert.equal(veredito.complete, true, veredito.summary);
  assert.match(veredito.summary, /ARTICLEDNA 5\/5 · SILODNA 1\/1 · SILOPAGE 1\/1/);
});

/* ================== §8 · os dois eixos, de novo ========================= */

test("§8 — ArticleDNA aprovado com Silo pendente: Aprovado · Aguardando consolidação do Silo", () => {
  const eixos = resolveArticleRowAxes({
    canonicalArticleDnaStatus: "approved",
    hasUncanonicalVersion: false,
    formationConcluded: true,
    canonicalSiloConsolidated: false,
    published: false,
    sentToRadar: false,
    reviewBadge: "approved",
  });
  assert.equal(eixos.approval.label, "Aprovado", "APPROVAL_COLUMN = APROVADO");
  assert.equal(eixos.workflow.status, "AGUARDANDO_CONSOLIDACAO_DO_SILO");
  assert.notEqual(eixos.workflow.label, "Aprovado", "o Status não copia a palavra do eixo editorial");
  assert.notEqual(eixos.workflow.label, eixos.approval.label);
});

test("§8 — com o par canônico confirmado o Status vira Concluído", () => {
  const eixos = resolveArticleRowAxes({
    canonicalArticleDnaStatus: "approved",
    hasUncanonicalVersion: false,
    formationConcluded: true,
    canonicalSiloConsolidated: true,
    published: false,
    sentToRadar: false,
    reviewBadge: "approved",
  });
  assert.equal(eixos.approval.label, "Aprovado");
  assert.equal(eixos.workflow.status, "CONCLUIDO");
  assert.equal(eixos.workflow.label, "Concluído");
});

/* ============ contrato · a tela não volta a exigir proposta local ======= */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const codigo = workspace
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("*") && !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("/*"))
  .join("\n");

test("LOCAL_ARCHITECTURE_PROPOSAL_REQUIRED_FOR_CLOSURE = NO", () => {
  // A recusa que matou a homologação não pode voltar a existir.
  assert.equal(
    codigo.includes("não está carregada; recarregue o workspace"),
    false,
    "a consolidação não pode mais exigir a proposta local",
  );
  assert.equal(codigo.includes("|| proposalFromRemoteWorkingCopy({"), true);
  // E o fechamento automático não passa mais proposta local nenhuma.
  const fechamento = codigo.slice(
    codigo.indexOf("const runCanonicalSiloClosure = async"),
    codigo.indexOf("const canonicalClosureRef = useRef"),
  );
  assert.ok(fechamento.length > 0);
  assert.equal(fechamento.includes("proposals: [proposta]"), false);
  assert.equal(fechamento.includes("remoteWorkingCopies: comWorkingCopy"), true);
});

test("§5 — a retomada é automática e não cria botão", () => {
  assert.equal(codigo.includes("resolveCanonicalClosureResumption({"), true);
  assert.equal(codigo.includes("closureResumptionAttempted"), true, "uma tentativa por território por sessão");
  for (const rotulo of ["Retomar fechamento", "Consolidar Silo", "Materializar Articles"]) {
    assert.equal(codigo.includes(`>${rotulo}<`), false, `a retomada não pode criar o botão ${rotulo}`);
  }
});

test("§9 — PROVIDER_CALLS = 0 também na retomada", () => {
  const retomada = codigo.slice(
    codigo.indexOf("const closureResumptionAttempted = useRef"),
    codigo.indexOf("const confirmArticleFormation = useCallback"),
  );
  assert.ok(retomada.length > 0, "o efeito de retomada existe e é delimitável");
  for (const proibido of ["dataforseo", "/api/arquiteto/serp", "callAi", "/api/ai", "buildArticleFormationUniverses"]) {
    assert.equal(retomada.includes(proibido), false, `a retomada não pode conter ${proibido}`);
  }
});

test("o fechamento preserva as formações de outros territórios no marcador", () => {
  /*
   * `runCanonicalSiloClosure` recebe as formações DESTE Silo. Gravá-las como
   * `concludedFormations` apagaria as dos outros territórios — perda silenciosa
   * que só aparece numa marca com dois Silos fechando.
   */
  const fechamento = codigo.slice(
    codigo.indexOf("const runCanonicalSiloClosure = async"),
    codigo.indexOf("const canonicalClosureRef = useRef"),
  );
  assert.equal(
    fechamento.includes("concludedFormations: (input.marker.concludedFormations || []).map("),
    true,
    "a escrita parte do marcador inteiro",
  );
  assert.equal(fechamento.includes("concludedFormations: todas.map("), false);
  // E a retomada só entrega as formações do território que está fechando.
  const retomada = codigo.slice(
    codigo.indexOf("const closureResumptionAttempted = useRef"),
    codigo.indexOf("const confirmArticleFormation = useCallback"),
  );
  assert.equal(retomada.includes("formations: doSilo,"), true);
  assert.equal(retomada.includes("formations: congeladas,"), false);
});
