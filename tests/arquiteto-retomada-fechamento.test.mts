import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCanonicalSiloClosurePlan,
  resolveCanonicalClosureResumption,
  verifyCanonicalSiloClosure,
} from "../lib/arquiteto/silo-composition-from-formations.ts";
import { closureFormationsForSilo, closureGuardsForSilo, describeSiloClosureReading, resolveSiloClosureReadiness } from "../lib/arquiteto/silo-closure-readiness.ts";
import { proposalFromRemoteWorkingCopy } from "../lib/arquiteto/silo-working-copy-bridge.ts";
import { existingTerritoryForProposedSilo } from "../lib/arquiteto/silo-assignment.ts";
import { readFormationConclusionState } from "../lib/arquiteto/formation-conclusion-state.ts";
import { partitionMaterializedArticles } from "../lib/arquiteto/formation-materialization.ts";
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

/* ===== O que barra o fechamento é do próprio Silo (dono, 2026-09-30) ===== */

test("par e contestação de outro Silo não barram o fechamento deste", () => {
  const siloOfCandidate = new Map([["a1", "silo-a"], ["a2", "silo-a"], ["b1", "silo-b"], ["b2", "silo-b"]]);
  const pairs = [{ left: "b1", right: "b2" }, { left: "a1", right: "a2" }];
  const challenges = [
    { scope: { id: "b1" }, currentSiloRef: "silo-b" },
    { scope: { id: "a2" }, currentSiloRef: "silo-a" },
  ];
  // Silo A com tudo concluído: o par de B não chega aqui, e o par de A já foi decidido.
  const fechadoA = closureGuardsForSilo({ siloRef: "silo-a", pairs, challenges, siloOfCandidate, concludedCandidateRefs: new Set(["a1", "a2"]) });
  assert.deepEqual(fechadoA, { pairs: [], challenges: [] });
  // Silo B com candidatos abertos: o par e a contestação dele continuam barrando.
  const abertoB = closureGuardsForSilo({ siloRef: "silo-b", pairs, challenges, siloOfCandidate, concludedCandidateRefs: new Set() });
  assert.deepEqual(abertoB.pairs, [{ left: "b1", right: "b2" }]);
  assert.deepEqual(abertoB.challenges.map(item => item.scope.id), ["b1"]);
  // Um lado ainda aberto: o par segue valendo.
  const meio = closureGuardsForSilo({ siloRef: "silo-a", pairs, challenges, siloOfCandidate, concludedCandidateRefs: new Set(["a1"]) });
  assert.equal(meio.pairs.length, 1);
});

test("o fechamento de cada Silo diz em português o que falta", () => {
  const base = { consolidated: false, pendingLabels: [] as string[], blockers: [] as { code: string; detail: string }[], outOfScenarioCount: 0, hasConcluded: true, planReady: true, resumable: true, resumptionReason: null };
  assert.equal(describeSiloClosureReading({ ...base, label: "Estratégia", consolidated: true }).state, "closed");
  const pronto = describeSiloClosureReading({ ...base, label: "Estratégia" });
  assert.equal(pronto.state, "closing");
  assert.match(pronto.text, /Pilar pela cobertura de buscas/);
  const espera = describeSiloClosureReading({
    ...base, label: "Leads", planReady: false, resumable: false, resumptionReason: "x",
    pendingLabels: ["leads qualificados"],
    blockers: [{ code: "FORMATIONS_PENDING", detail: "3 formações" }, { code: "KEYWORD_PACKAGE_STALE", detail: "\"atrair\" está em revisão" }],
  });
  assert.equal(espera.state, "waiting");
  assert.match(espera.text, /falta concluir 1 artigo\(s\): “leads qualificados” \(aba Artigos: marque os artigos do Silo e clique em “Concluir formação”\)/);
  assert.match(espera.text, /está em revisão/);
  assert.doesNotMatch(espera.text, /3 formações/, "a pendência de formação sai pelo nome, não pela contagem crua");
});

test("a retomada e a tela leem a MESMA leitura do fechamento, escopada por Silo", () => {
  const leitura = codigo.slice(codigo.indexOf("const siloClosureReadings = useMemo"), codigo.indexOf("const closureResumptionAttempted = useRef"));
  assert.match(leitura, /closureGuardsForSilo\(\{/);
  assert.doesNotMatch(leitura, /unresolvedCannibalization: candidateGuards\.pares\.map/, "o par da marca inteira não barra este Silo");
  const retomada = codigo.slice(codigo.indexOf("const closureResumptionAttempted = useRef"), codigo.indexOf("const confirmArticleFormation = useCallback"));
  assert.match(retomada, /for \(const leitura of siloClosureReadings\)/);
  // O gatilho pós-conclusão também filtra pelo Silo.
  const concluir = codigo.slice(codigo.indexOf("const confirmArticleFormation = useCallback"));
  assert.match(concluir.slice(0, concluir.indexOf("\n  }, [")), /closureGuardsForSilo\(\{\s*siloRef,/);
  assert.match(codigo, /data-testid="architect-silo-closure-status"/);
});

test("tirar do Silo usa a decisão de Silo que já existe e só vale para candidato aberto", () => {
  const trecho = codigo.slice(codigo.indexOf("const removeCandidateFromSilo = async"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  };"));
  assert.match(corpo, /applySiloDecisionsInBatch\(ids\.map\(keywordId => \(\{ keywordId, target: \{ kind: "unassigned" as const \} \}\)\)\)/);
  assert.match(corpo, /concluido \|\| candidate\.keywords\.some\(item => publishedKeywordIdSet\.has\(item\.keywordId\)\)/);
  assert.doesNotMatch(corpo, /delete|purge|DELETE/);
  const painel = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  assert.match(painel, /data-testid="architect-review-remove-from-silo-confirm"/);
  assert.match(codigo, /onRemoveFromSilo=\{!art\.isPublished && !articleDnaVersion/);
});

/* ===== Fechamento sem impasse: órfão, aprovado sem conclusão, Pilar (2026-09-30) ===== */

const formacao = (candidateRef: string, territoryRef: string, principal: string, artigo: string) => ({
  candidateRef, territoryRef, principalKeywordId: principal,
  members: [{ keywordId: principal, role: "principal" as const }],
  formationBaseHash: "h", slug: null, fullPath: null, concludedAt: "2026-09-30T00:00:00.000Z", concludedBy: "u",
  materializedArticleId: artigo,
});

test("ponteiro órfão de formação concluída em outro Silo não é formação pendente", () => {
  const leitura = closureFormationsForSilo({
    territoryRef: "silo-estrategia",
    concludedFormations: [
      formacao("f-plano", "silo-estrategia", "k-plano", "a-plano"),
      formacao("f-agencia", "silo-crescimento", "k-agencia", "a-agencia"),
    ],
    // "seo para google meu negócio" ficou com o ponteiro do artigo de Crescimento.
    candidates: [{ candidateRef: "f-plano", principalKeywordId: "k-plano" }, { candidateRef: "f-agencia", principalKeywordId: "k-seo" }],
    approvedArticles: [],
  });
  assert.deepEqual(leitura.activeCandidateRefs, ["f-plano"]);
  assert.deepEqual(leitura.formations.map(item => item.candidateRef), ["f-plano"]);
  assert.deepEqual(leitura.outOfScenario, []);
  const fechamento = resolveSiloClosureReadiness({ siloRef: "silo-estrategia", activeCandidateRefs: leitura.activeCandidateRefs, concludedCandidateRefs: leitura.formations.map(item => item.candidateRef), pendingMaterializationRefs: [] });
  assert.equal(fechamento.ready, true);
});

test("publicado com ArticleDNA aprovado e sem 'Concluir formação' entra no fechamento como está", () => {
  const leitura = closureFormationsForSilo({
    territoryRef: "silo-captacao",
    concludedFormations: [formacao("f-odonto", "silo-captacao", "k-odonto", "a-odonto")],
    candidates: [{ candidateRef: "f-odonto", principalKeywordId: "k-odonto" }, { candidateRef: "f-captar", principalKeywordId: "k-captar" }],
    approvedArticles: [
      { versionId: "v-odonto", createdAt: "t", createdBy: "u", articleId: "a-odonto", territoryRef: "silo-captacao", principalKeywordId: "k-odonto", suggestedSlug: "odonto", references: [{ keywordId: "k-odonto", role: "principal" }] },
      { versionId: "v-captar", createdAt: "t", createdBy: "u", articleId: "a-captar", territoryRef: "silo-captacao", principalKeywordId: "k-captar", suggestedSlug: "captar", references: [{ keywordId: "k-captar", role: "principal" }, { keywordId: "k-x", role: "reforco_narrativo" }] },
      { versionId: "v-outro", createdAt: "t", createdBy: "u", articleId: "a-outro", territoryRef: "silo-leads", principalKeywordId: "k-o", suggestedSlug: "o", references: [] },
    ],
  });
  const doPublicado = leitura.formations.find(item => item.materializedArticleId === "a-captar");
  assert.ok(doPublicado, "o aprovado entra pelo próprio ArticleDNA");
  assert.equal(doPublicado!.candidateRef, "f-captar", "o candidato dele deixa de contar como pendente");
  assert.deepEqual(doPublicado!.members.map(item => item.role), ["principal", "reforco"]);
  assert.equal(leitura.formations.length, 2, "o já materializado não entra duas vezes e o de outro Silo não entra");
  const fechamento = resolveSiloClosureReadiness({ siloRef: "silo-captacao", activeCandidateRefs: leitura.activeCandidateRefs, concludedCandidateRefs: leitura.formations.map(item => item.candidateRef), pendingMaterializationRefs: [] });
  assert.equal(fechamento.ready, true);
});

test("o fechamento grava o Pilar pelo articleId do ArticleDNA, não pelo ref da formação", () => {
  const fechamento = codigo.slice(codigo.indexOf("const runCanonicalSiloClosure = async"), codigo.indexOf("const canonicalClosureRef = useRef"));
  assert.match(fechamento, /const pilarArticleId = porRef\.get\(input\.plan\.pillarFormationRef\)\?\.materializedArticleId \|\| input\.plan\.pillarFormationRef;/);
  assert.equal(fechamento.includes("expectedPillarArticleId: input.plan.pillarFormationRef"), false);
  assert.match(fechamento, /humanPillarSelection\(\{\s*articleId: pilarArticleId,/);
});

test("'Manter composição' resolve o par (os dois lados) e a fronteira do artigo mantido", () => {
  assert.match(codigo, /const humanKeptCandidate = useCallback/);
  assert.match(codigo, /decisao\?\.decision === "accept_current_composition" && Boolean\(esperado\) && decisao\.formationBaseHash === esperado/);
  assert.match(codigo, /candidateGuards\.fronteiras\.filter\(item => item\.verdict === "KEEP_SEPARATE"\)/);
  assert.match(codigo, /candidateGuards\.pares\.filter\(par => humanKeptCandidate\(par\.left\) && humanKeptCandidate\(par\.right\)\)/);
  assert.match(codigo, /candidateGuards\.openChallenges\.filter\(item => !humanKeptCandidate\(item\.scope\.id\) && !concluidos\.has\(item\.scope\.id\)\)/);
  // A portaria, a leitura do fechamento e o gatilho pós-conclusão usam os MESMOS abertos.
  assert.match(codigo, /unresolvedCannibalization: openCannibalPairs/);
  assert.equal((codigo.match(/pairs: openCannibalPairs,/g) || []).length, 2);
  assert.equal(codigo.includes("pairs: candidateGuards.pares,"), false);
  // E a tela diz o que "Manter" decide ANTES do clique.
  const painel = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  assert.match(painel, /data-testid="architect-serp-keep-also-decides"/);
  assert.match(codigo, /keepAlsoDecides=\{humanKeptCandidate\(revisao\.candidate\.candidateRef\) \? \[\] : \[/);
});

test("a consolidação só é barrada pela contestação dos Silos que estão consolidando", () => {
  const trecho = codigo.slice(codigo.indexOf("const consolidateSilos = async"));
  const corpo = trecho.slice(0, trecho.indexOf("const consolidable = "));
  assert.equal(corpo.includes("candidateGuards.openChallenges.length"), false, "contestação de outro Silo não barra este");
  assert.match(corpo, /const contestacoesDoEscopo = openSiloChallenges\s*\.filter\(item => !escopo\?\.onlyTerritoryRefs \|\| escopo\.onlyTerritoryRefs\.includes\(item\.currentSiloRef\)\);/);
});

test("formação reconcluída sem vínculo volta ao ArticleDNA aprovado da mesma Principal: nada de segundo artigo", () => {
  const leitura = closureFormationsForSilo({
    territoryRef: "silo-captacao",
    concludedFormations: [{ ...formacao("f-whats", "silo-captacao", "k-whats", "x"), materializedArticleId: null }],
    candidates: [{ candidateRef: "f-whats", principalKeywordId: "k-whats" }],
    approvedArticles: [
      { versionId: "v1", createdAt: "t", createdBy: "u", articleId: "a-whats", territoryRef: "silo-captacao", principalKeywordId: "k-whats", suggestedSlug: "whats", references: [{ keywordId: "k-whats", role: "principal" }] },
    ],
  });
  assert.equal(leitura.formations.length, 1, "o ArticleDNA não entra de novo como formação à parte");
  assert.equal(leitura.formations[0].materializedArticleId, "a-whats");
  const plano = buildCanonicalSiloClosurePlan({ formations: leitura.formations, blockers: [] });
  assert.equal(plano.state, "READY");
  assert.deepEqual(plano.state === "READY" ? plano.materializationOrder : null, [], "nenhum artigo novo é materializado");
});

test("o Concluir não entrega fragmento órfão, não apaga o vínculo e não lista publicado protegido como pendência", () => {
  const concluir = codigo.slice(codigo.indexOf("const confirmArticleFormation = useCallback"));
  const corpo = concluir.slice(0, concluir.indexOf("\n  }, ["));
  assert.match(corpo, /candidates: universe\.candidates\.filter\(candidate => !concluidaEm\.has\(candidate\.candidateRef\) \|\| concluidaEm\.get\(candidate\.candidateRef\) === universe\.siloRef\)/);
  assert.match(corpo, /materializedArticleId: materializado\?\.articleId \?\? anteriores\.get\(entrada\.candidateRef\)\?\.materializedArticleId \?\? null/);
  assert.match(corpo, /plano\.blocked\.filter\(item => item\.code !== "PUBLISHED_COLLISION"\)/);
  assert.match(corpo, /closureResumptionAttempted\.current\.clear\(\);/);
  assert.match(codigo, /return candidateGuards\.openChallenges\.filter\(item => !humanKeptCandidate\(item\.scope\.id\) && !concluidos\.has\(item\.scope\.id\)\);/);
});

test("reprocessar não duplica Silo consolidado nem recria Silo desfeito pela pessoa", () => {
  const territories = [
    { territoryRef: "t-captacao", territory: { name: "Captação de Pacientes", lifecycleStatus: "consolidated", slugState: { publishedSlug: "/captacao-de-pacientes", confirmed: null, proposals: [] } } },
    { territoryRef: "t-botox", territory: { name: "botox para o rosto", lifecycleStatus: "rejected", slugState: { publishedSlug: null, confirmed: null, proposals: [{ slug: "botox-para-o-rosto" }] } } },
  ];
  // A página publicada do Silo consolidado é o MESMO Silo: reaproveita.
  assert.deepEqual(existingTerritoryForProposedSilo({ name: "Captação de Pacientes", slug: null, publishedSlug: "captacao-de-pacientes", territories }), { kind: "reuse", territoryRef: "t-captacao" });
  // O que a pessoa desfez não volta sozinho — nem pelo endereço, nem pelo nome.
  assert.deepEqual(existingTerritoryForProposedSilo({ name: "Botox para o Rosto", slug: "outro-slug", publishedSlug: null, territories }), { kind: "rejected_by_human", territoryRef: "t-botox" });
  // Silo realmente novo continua nascendo.
  assert.equal(existingTerritoryForProposedSilo({ name: "Skincare", slug: "skincare", publishedSlug: null, territories }), null);
  // A fiação: consulta ANTES de criar.
  const processar = codigo.slice(codigo.indexOf("const naoRecriados: string[] = [];"));
  const antesDeCriar = processar.slice(0, processar.indexOf("createRemoteSiloCandidate({"));
  assert.match(antesDeCriar, /existingTerritoryForProposedSilo\(\{/);
  assert.match(antesDeCriar, /if \(existente\?\.kind === "reuse"\) \{ refPorChave\.set\(silo\.key, existente\.territoryRef\); continue; \}/);
  assert.match(antesDeCriar, /if \(existente\?\.kind === "rejected_by_human"\) \{ naoRecriados\.push\(silo\.name\); continue; \}/);
});

test("reconcluir formação materializada sucede o MESMO artigo e nunca reescreve publicado", () => {
  const trecho = codigo.slice(codigo.indexOf("const materializeApprovedArticleDnas = useCallback"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  assert.match(corpo, /const articleId = \(articleFormationMarker\?\.concludedFormations \|\| \[\]\)\s*\.find\(item => item\.candidateRef === aprovado\.candidateRef\)\?\.materializedArticleId\s*\|\| aprovado\.candidateRef;/);
  assert.match(corpo, /if \(acceptedArticleDnas\[articleId\]\?\.payload\.publishedIdentityRef\) \{/);
  assert.equal(corpo.includes("const articleId = aprovado.candidateRef;"), false);
});

test("Papel no Silo aparece em Artigos e em Links, lido do SiloDNA aprovado de todo Silo fechado", () => {
  assert.match(codigo, /const siloRoleByArticleId = useMemo\(\(\) => \{/);
  assert.match(codigo, /if \(version\.payload\.pillarArticleId\) papeis\.set\(String\(version\.payload\.pillarArticleId\), "PILAR"\);/);
  assert.match(codigo, /\?\? siloRoleByArticleId\.get\(String\(articleDnaVersion\?\.payload\.articleId \|\| ""\)\);/);
  assert.equal(codigo.includes('{workspaceMode === "links" && <th className="relative border-r border-divider px-2 py-2 text-center">Papel no Silo</th>}'), false);
  assert.match(codigo, /\{ base: articleTableRenderRevision, workspaceMode, linksHierarchy, siloRoleByArticleId \}/);
});

test("conclusão só fica desatualizada quando a composição DO ARTIGO mudou, não o lote", () => {
  const congelada = { candidateRef: "f-leads", formationBaseHash: "lote-antigo", principalKeywordId: "k1", members: [{ keywordId: "k1" }, { keywordId: "k2" }] };
  const base = { candidateRef: "f-leads", articleDnaVersionNumber: null, processed: true, concludedFormations: [congelada], currentFormationBaseHash: "lote-novo" };
  const igual = readFormationConclusionState({ ...base, currentComposition: { principalKeywordId: "k1", keywordIds: ["k2", "k1"] } });
  assert.equal(igual.stale, false, "outra keyword de outro Silo mudou o hash do lote, não este artigo");
  assert.equal(igual.statusLabel, "Aguardando consolidação do Silo");
  const mudou = readFormationConclusionState({ ...base, currentComposition: { principalKeywordId: "k1", keywordIds: ["k1", "k3"] } });
  assert.equal(mudou.stale, true);
});

test("o vínculo gravado mantém o artigo aprovado na linha mesmo com revisão em andamento", () => {
  const particao = partitionMaterializedArticles({
    accepted: [{ articleId: "a-dentistas", territoryRef: "silo-c", principalKeywordId: "k-dentistas", keywordIds: ["k-dentistas", "k-b"] }],
    candidates: [
      { candidateRef: "f-dentistas", siloRef: "silo-c", principalKeywordId: "k-outra", keywordIds: ["k-outra", "k-dentistas", "k-b"] },
      { candidateRef: "f-orfao", siloRef: "silo-x", principalKeywordId: "k-z", keywordIds: ["k-z"] },
    ],
    explicitLinks: new Map([["f-dentistas", "a-dentistas"], ["f-orfao", "a-dentistas"]]),
  });
  assert.equal(particao.matched.get("f-dentistas"), "a-dentistas");
  assert.equal(particao.matched.has("f-orfao"), false, "vínculo de outro Silo não vale");
  assert.deepEqual(particao.legacy, []);
});

test("aba Silos: Silo fechado diz 'fechado', Pilar em texto, contestação sem concluído e sem Silo desfeito como destino", () => {
  assert.match(codigo, /closed: Boolean\(aprovadaAgora\) && Boolean\(siloDnaVersion\) && effectiveVersionStatus\(siloDnaVersion!\.versionId, versionEvents\) === "approved",/);
  const painel = readFileSync("modules/arquiteto/architecture-panel.tsx", "utf8");
  assert.match(painel, /silo\.closed \? "fechado · SiloDNA e SiloPage aprovados"/);
  assert.match(codigo, /data-testid="architect-silo-pillar-closed"/);
  assert.match(codigo, /const openSiloReconsideration = useMemo\(\(\) => describeSiloReconsideration\(openSiloChallenges\), \[openSiloChallenges\]\);/);
  assert.equal(codigo.includes("candidateGuards.reconsideration.required"), false);
  assert.match(codigo, /const achado = remoteTerritories\.filter\(item => item\.territory\.lifecycleStatus !== "rejected"\)\.find\(/);
  assert.match(codigo, /if \(desfeito\) \{ registrar\("unchanged", assignment\.keywordId\); continue; \}/);
});

test("Concluir formação fecha tudo: o que precisa de decisão vira UMA confirmação, gravada como 'Manter composição'", () => {
  const concluir = codigo.slice(codigo.indexOf("const confirmArticleFormation = useCallback"));
  const corpo = concluir.slice(0, concluir.indexOf("\n  }, ["));
  // Levanta antes da portaria: divergência da SERP, par (os dois lados na seleção) e fronteira.
  assert.ok(corpo.indexOf("if (humano && !continuacao?.keepConfirmed) {") < corpo.indexOf("let portaria = validateFormationConclusion("));
  assert.match(corpo, /if \(articleSerpGates\.get\(ref\)\?\.requiresHumanDecision\) anotar\(ref,/);
  assert.match(corpo, /if \(!naSelecao\.has\(par\.left\) \|\| !naSelecao\.has\(par\.right\)\) continue;/);
  assert.match(corpo, /setConclusionKeepPrompt\(\{ items: itens \}\);\s*return;/);
  // A gravação é a MESMA decisão do "Manter composição", conferida na releitura.
  const manter = codigo.slice(codigo.indexOf("const keepAndConclude = useCallback"));
  const corpoManter = manter.slice(0, manter.indexOf("\n  }, ["));
  assert.match(corpoManter, /"\/api\/arquiteto\/serp-resolution"/);
  assert.match(corpoManter, /decision: "accept_current_composition"/);
  assert.match(corpoManter, /const canonical = await loadCanonicalArquitetoWorkspace\(selectedBrandId\);/);
  assert.match(corpoManter, /setPendingHumanConclusion\("keep"\);/);
  assert.match(codigo, /data-testid="architect-conclusion-keep-confirm"/);
});

test("Confirmar propostas novas não tira keyword de artigo nem de Silo fechado, e a aba Silos diz como o Silo fecha", () => {
  const confirmar = codigo.slice(codigo.indexOf("const confirmArchitecture = async"));
  const corpo = confirmar.slice(0, confirmar.indexOf("\n  };"));
  assert.match(corpo, /const sairiaDoSilo = \(keywordId: string, destino: string \| null\) => \{/);
  // Filtra o plano ANTES da trava de impacto: uma proposta inválida não barra o lote inteiro.
  assert.ok(corpo.indexOf("const mantidasNosArtigos = plan.assignments.filter(") < corpo.indexOf("const impactoEstrutural = resolveTerritoryChangeImpact("));
  assert.match(corpo, /if \(sairiaDoSilo\(assignment\.keywordId, territoryRef\)\) \{ registrar\("unchanged", assignment\.keywordId\); continue; \}/);
  assert.match(corpo, /if \(sairiaDoSilo\(item\.keywordId, null\)\) \{ registrar\("unchanged", item\.keywordId\);/);
  assert.match(codigo, /data-testid="architect-silo-closure-status-silos"/);
});

test("Silo fechado aparece uma vez só na aba Silos: o SiloDNA dele é do território, não 'estrutura existente' solta", () => {
  const paisagem = readFileSync("lib/arquiteto/territorial-landscape.ts", "utf8");
  assert.match(paisagem, /if \(territory\.consolidation\?\.siloId\) anchoredSiloIds\.set\(territory\.consolidation\.siloId, territory\.territoryRef\);/);
  assert.match(paisagem, /territories\.some\(item => item\.territoryRef === territorio\)/);
  const superficie = readFileSync("lib/arquiteto/territorial-surface.ts", "utf8");
  assert.match(superficie, /for \(const structure of landscape\.existingStructures\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(structure\.anchoredByTerritoryRef\) continue;/);
});

test("candidato não cobra 'Registrar decisão' do tipo da unidade: ele é definido ao concluir a formação", () => {
  assert.match(codigo, /if \(!temArticleDna\) return \{ defined: true, label: `\$\{rotulo \|\| "Artigo"\} · definido ao concluir a formação` \};/);
  // O controle só aparece com decisão de tipo pendente — no candidato, nunca.
  assert.match(codigo, /unitTypeControl=\{expandedUnitDraft && articleReview\.decisions\.some\(item => item\.kind === "unit_type" && !item\.resolved\)/);
});

test("Links internos mostra a barra de progresso com o nome do que está em curso", () => {
  const componente = readFileSync("modules/arquiteto/operation-progress.tsx", "utf8");
  assert.match(componente, /role="progressbar"/);
  assert.match(componente, /motion-safe:animate-pulse motion-reduce:animate-none/);
  assert.match(codigo, /"Processando links: esqueleto do Silo e âncoras da IA"/);
  assert.match(codigo, /<OperationProgress key=\{linksPhaseReading\.activityLabel\} label=\{linksPhaseReading\.activityLabel\} testId="architect-links-progress"/);
  assert.equal(codigo.includes('? "Há uma operação em curso."'), false, "o genérico virou o nome do que está em curso");
  // A melhoria de publicados usa o MESMO componente (um visual só).
  const melhoria = readFileSync("modules/arquiteto/article-improvement-panel.tsx", "utf8");
  assert.match(melhoria, /<OperationProgress label=\{ACTIVITY_LABELS\[activity\.action\]\}/);
});

test("Links segue a seleção, e 'Pronto para Radar' relê a SERP velha antes de recusar", () => {
  // O Silo do grafo acompanha as linhas marcadas quando são todas de um Silo fechado.
  assert.match(codigo, /if \(silos\.size !== 1\) return;/);
  assert.match(codigo, /handleLinksSiloChange\(siloId\);/);
  const marcar = codigo.slice(codigo.indexOf("const markSelectedReadyForRadar = async (depoisDaSerp = false) => {"));
  const corpo = marcar.slice(0, marcar.indexOf("\n  const markReadyRef"));
  assert.match(corpo, /return estado === "stale" \|\| estado === "missing" \|\| estado === "incomplete";/);
  assert.match(corpo, /await confirmSerpValidationRef\.current\(grupos\);\s*setPendingReadyRetry\(true\);/);
  assert.match(codigo, /void markReadyRef\.current\(true\);/);
});
