import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ArticleFormationMarkerPayloadSchema } from "../lib/arquiteto/article-formation-marker.ts";
import {
  bindArticleParentForMaterialization,
} from "../lib/arquiteto/article-silo-materialization.ts";
import type { ArticleDNA, SiloDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import {
  buildCanonicalSiloClosurePlan,
  formationsAwaitingMaterialization,
  verifyCanonicalSiloClosure,
} from "../lib/arquiteto/silo-composition-from-formations.ts";
import {
  resolveFormationLedger,
  resolveSiloClosureReadiness,
} from "../lib/arquiteto/silo-closure-readiness.ts";

/**
 * O FECHAMENTO AUTOMÁTICO FINAL.
 *
 * Um ato humano — `[Concluir formação]` — e, quando o lote do Silo para de se
 * mexer, quatro artefatos nascem em ordem provada:
 *
 *   ArticleDNA → SiloWorkingCopy → SiloDNA → SiloPage
 *
 * Estes testes cobrem as quatro situações da homologação: fechar uma formação
 * no meio do lote, fechar a última, fechar com a fronteira contestada e
 * reentrar sobre a mesma base.
 */

const SILO = "territory:9da03dd0-cf37-45c3-8562-20e943aa37bd";
const BASE = "artbase:5a2426be65358552";
const ATIVOS = ["cand:a", "cand:b", "cand:c", "cand:d", "cand:e"];

const congelada = (candidateRef: string, membros: number, materializedArticleId: string | null = null) => ({
  candidateRef,
  principalKeywordId: `${candidateRef}:principal`,
  members: Array.from({ length: membros }, (_, indice) => ({
    keywordId: `${candidateRef}:k${indice}`,
    role: indice === 0 ? ("principal" as const) : ("secundaria" as const),
  })),
  formationBaseHash: BASE,
  materializedArticleId,
});

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
/* Comentário é prosa, não implementação: asserção sobre comentário não prova nada. */
const codigo = workspace
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("*") && !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("/*"))
  .join("\n");

/* ================== A · concluir uma no meio do lote ==================== */

test("A — 1 concluída no remoto + 1 agora: 2 de 5, nenhum fechamento", () => {
  const ledger = resolveFormationLedger({
    activeCandidateRefs: ATIVOS,
    remoteConcludedRefs: ["cand:a"],
    concludedInThisRun: ["cand:b"],
  });
  assert.equal(ledger.totalConcluded, 2);
  assert.equal(ledger.remaining, 3, "restam três; contar só o clique de agora diria 4");

  const fechamento = resolveSiloClosureReadiness({
    siloRef: SILO,
    activeCandidateRefs: ledger.activeFormationRefs,
    concludedCandidateRefs: ledger.concludedFormationRefs,
    pendingMaterializationRefs: ledger.concludedFormationRefs,
  });
  assert.equal(fechamento.ready, false);
  assert.deepEqual(fechamento.blockers.map(item => item.code), ["FORMATIONS_PENDING"]);

  const plano = buildCanonicalSiloClosurePlan({
    formations: [congelada("cand:a", 2), congelada("cand:b", 2)],
    blockers: fechamento.blockers,
  });
  assert.equal(plano.state, "BLOCKED", "com formação pendente o fechamento NÃO pode ser executado");
});

/* =============== B · concluir a última fecha os três ==================== */

test("B — a última conclusão fecha o lote: 5 ArticleDNA, 1 SiloDNA, 1 SiloPage", () => {
  const ledger = resolveFormationLedger({
    activeCandidateRefs: ATIVOS,
    remoteConcludedRefs: ["cand:a", "cand:b", "cand:c", "cand:d"],
    concludedInThisRun: ["cand:e"],
  });
  assert.equal(ledger.totalConcluded, 5);
  assert.equal(ledger.remaining, 0);

  const fechamento = resolveSiloClosureReadiness({
    siloRef: SILO,
    activeCandidateRefs: ledger.activeFormationRefs,
    concludedCandidateRefs: ledger.concludedFormationRefs,
    pendingMaterializationRefs: ledger.concludedFormationRefs,
  });
  assert.equal(fechamento.ready, true);

  const plano = buildCanonicalSiloClosurePlan({
    // `cand:c` cobre mais buscas: é ele que o Pilar deve sair.
    formations: [
      congelada("cand:a", 2), congelada("cand:b", 2), congelada("cand:c", 4),
      congelada("cand:d", 2), congelada("cand:e", 3),
    ],
    blockers: fechamento.blockers,
  });
  assert.equal(plano.state, "READY");
  if (plano.state !== "READY") return;
  assert.equal(plano.materializationOrder.length, 5, "nenhuma foi materializada ainda: as cinco entram na fila");
  assert.equal(plano.pillarFormationRef, "cand:c");
  assert.equal(plano.supportFormationRefs.length, 4);
  assert.equal(plano.narrativeOrder[0], "cand:c", "a ordem narrativa começa no Pilar");
  assert.equal(plano.expectedArticles, 5);
  assert.equal(plano.expectedSiloDna, 1);
  assert.equal(plano.expectedSiloPage, 1);

  /* O veredito do remoto: cinco artigos, um SiloDNA, uma SiloPage pareada. */
  const artigos = ATIVOS.map(candidateRef => ({
    articleId: candidateRef,
    versionId: `${candidateRef}:v1`,
    contentHash: `${candidateRef}:h1`,
    territoryRef: SILO,
    siloId: null,
  }));
  const veredito = verifyCanonicalSiloClosure({
    territoryRef: SILO,
    expectedArticleIds: ATIVOS,
    expectedPillarArticleId: "cand:c",
    observedArticles: artigos,
    observedSiloDna: {
      siloId: "silo-1",
      territoryRef: SILO,
      pillarArticleId: "cand:c",
      supportArticleIds: ATIVOS.filter(ref => ref !== "cand:c"),
      articleReferences: artigos.map(item => ({
        articleId: item.articleId,
        articleDnaVersionId: item.versionId,
        articleDnaContentHash: item.contentHash,
      })),
      versionId: "silo:v1",
      contentHash: "silo:h1",
    },
    observedSiloPage: {
      siloPageId: "page-1",
      siloId: "silo-1",
      siloDnaRef: { entityId: "silo-1", versionId: "silo:v1", contentHash: "silo:h1" },
    },
  });
  assert.equal(veredito.complete, true, veredito.summary);
  assert.equal(veredito.observedArticles, 5);
  assert.equal(veredito.observedSiloDna, 1);
  assert.equal(veredito.observedSiloPage, 1);
  assert.deepEqual(veredito.divergences, []);
});

/* ============ C · fronteira contestada represa o fechamento ============= */

test("C — contestação real: a formação pode fechar, o Silo canônico não", () => {
  const fechamento = resolveSiloClosureReadiness({
    siloRef: SILO,
    activeCandidateRefs: ATIVOS,
    concludedCandidateRefs: ATIVOS,
    pendingMaterializationRefs: ATIVOS,
    openBoundaryChallenges: [{ scopeLabel: "Skin care para peles oleosas" }],
  });
  assert.equal(fechamento.ready, false);
  assert.deepEqual(fechamento.blockers.map(item => item.code), ["SILO_RECONSIDERATION_REQUIRED"]);

  const plano = buildCanonicalSiloClosurePlan({
    formations: ATIVOS.map(ref => congelada(ref, 2)),
    blockers: fechamento.blockers,
  });
  assert.equal(plano.state, "BLOCKED");
  if (plano.state !== "BLOCKED") return;
  assert.match(plano.blockers[0].detail, /fronteira foi contestada/);
});

/* =========== D · reentrar sobre a mesma base não cria versão =========== */

test("D — reexecutar o fechamento fechado: zero versões novas", () => {
  const formacoes = ATIVOS.map(ref => congelada(ref, 2, `${ref}`));
  assert.deepEqual(formationsAwaitingMaterialization(formacoes), [], "nada aguarda materialização");

  const fechamento = resolveSiloClosureReadiness({
    siloRef: SILO,
    activeCandidateRefs: ATIVOS,
    concludedCandidateRefs: ATIVOS,
    pendingMaterializationRefs: [],
    alreadyConsolidated: true,
  });
  assert.equal(fechamento.ready, false);
  assert.deepEqual(fechamento.blockers.map(item => item.code), ["ALREADY_CONSOLIDATED"]);

  const plano = buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: fechamento.blockers });
  assert.equal(plano.state, "BLOCKED", "o par canônico já existe: fechar de novo criaria um segundo par");

  // E mesmo SEM o bloqueio — o caso do retry após falha parcial — a fila de
  // materialização é vazia: NEW_ARTICLEDNA_VERSIONS = 0.
  const semBloqueio = buildCanonicalSiloClosurePlan({ formations: formacoes, blockers: [] });
  assert.equal(semBloqueio.state, "READY");
  if (semBloqueio.state !== "READY") return;
  assert.deepEqual(semBloqueio.materializationOrder, [], "nenhuma sucessora no-op é criada na reentrada");
});

/* ============ §4 · o ArticleDNA inicial nasce com siloId nulo =========== */

/*
 * O binder só lê `siloId` e `territoryRef` e devolve o resto intacto. Montar
 * um ArticleDNA completo aqui não provaria nada além da capacidade de copiar
 * o schema — e o contrato já é coberto por `arquiteto-ciclo-silo-artigo`.
 */
const artigo = (overrides: Partial<ArticleDNA> = {}): ArticleDNA => ({
  schemaVersion: 1,
  articleId: "cand:a",
  brandId: "brand-1",
  principalKeywordId: "k1",
  secondaryKeywordIds: [],
  narrativeReinforcementIds: [],
  keywordReferences: [{ keywordId: "k1", keywordDnaVersionId: "v1", contentHash: "h1" }],
  siloId: null,
  territoryRef: SILO,
  suggestedSlug: "pele-oleosa-rotina",
  ...overrides,
} as unknown as ArticleDNA);

const siloVersion = (territoryRef: string | null, siloId: string): VersionEnvelope<SiloDNA> => ({
  versionId: `${siloId}:v1`,
  entityId: siloId,
  versionNumber: 1,
  previousVersionId: null,
  contentHash: `${siloId}:h1`,
  origin: "human",
  createdAt: "2026-09-08T00:00:00.000Z",
  createdBy: "human",
  changeReason: "teste",
  payload: { siloId, territoryRef } as unknown as SiloDNA,
} as unknown as VersionEnvelope<SiloDNA>);

test("§4 — sem SiloDNA canônico, o ArticleDNA nasce com siloId nulo e território declarado", () => {
  const vinculo = bindArticleParentForMaterialization({
    article: artigo(),
    siloVersions: [],
    stage: "INITIAL",
  });
  assert.equal(vinculo.ok, true);
  if (!vinculo.ok) return;
  assert.equal(vinculo.siloId, null);
  assert.equal(vinculo.payload.siloId, null);
  assert.equal(vinculo.payload.territoryRef, SILO, "o pai é o território confirmado");
  // E `siloId: null` não é o que o contrato recusa — é o que ele prevê.
  const contrato = readFileSync("lib/arquiteto/contracts.ts", "utf8");
  assert.equal(contrato.includes("siloId: z.string().nullable(),"), true);
});

test("§4 — a mesma etapa NÃO deixa nulo quando o Silo canônico já existe", () => {
  const vinculo = bindArticleParentForMaterialization({
    article: artigo(),
    siloVersions: [siloVersion(SILO, "silo-1")],
    stage: "INITIAL",
  });
  assert.equal(vinculo.ok, true);
  if (!vinculo.ok) return;
  assert.equal(vinculo.siloId, "silo-1", "nascer nulo ao lado de um pai que existe seria dívida de propósito");
});

test("§4 — sem território e com 1:1 quebrado, o artigo NÃO é escrito", () => {
  const semTerritorio = bindArticleParentForMaterialization({
    // `territoryRef` é opcional no contrato: ausente é o caso a barrar.
    article: artigo({ territoryRef: undefined }),
    siloVersions: [],
    stage: "INITIAL",
  });
  assert.equal(semTerritorio.ok, false, "sem pai não há artigo a gravar");

  const ambiguo = bindArticleParentForMaterialization({
    article: artigo(),
    siloVersions: [siloVersion(SILO, "silo-1"), siloVersion(SILO, "silo-2")],
    stage: "INITIAL",
  });
  assert.equal(ambiguo.ok, false, "dois Silos no mesmo território: ninguém desempata");
});

test("§4 — CANONICAL_REQUIRED continua exigindo o Silo: a etapa não afrouxa o legado", () => {
  const vinculo = bindArticleParentForMaterialization({
    article: artigo(),
    siloVersions: [],
    stage: "CANONICAL_REQUIRED",
  });
  assert.equal(vinculo.ok, false);
});

/* ================= §13 · sucesso parcial falso não existe =============== */

test("§13 — ArticleDNA gravado e Silo ausente é dito como parcial, nunca como completo", () => {
  const veredito = verifyCanonicalSiloClosure({
    territoryRef: SILO,
    expectedArticleIds: ATIVOS,
    expectedPillarArticleId: "cand:a",
    observedArticles: ATIVOS.map(ref => ({
      articleId: ref, versionId: `${ref}:v1`, contentHash: `${ref}:h1`, territoryRef: SILO, siloId: null,
    })),
    observedSiloDna: null,
    observedSiloPage: null,
  });
  assert.equal(veredito.complete, false);
  assert.equal(veredito.observedArticles, 5);
  assert.equal(veredito.observedSiloDna, 0);
  assert.match(veredito.summary, /INCOMPLETO/);
  assert.match(veredito.summary, /ARTICLEDNA 5\/5/);
});

test("§13 — SiloDNA persistido e SiloPage falhando devolve o par real, não sucesso", () => {
  const artigos = ATIVOS.map(ref => ({
    articleId: ref, versionId: `${ref}:v1`, contentHash: `${ref}:h1`, territoryRef: SILO, siloId: null,
  }));
  const veredito = verifyCanonicalSiloClosure({
    territoryRef: SILO,
    expectedArticleIds: ATIVOS,
    expectedPillarArticleId: "cand:a",
    observedArticles: artigos,
    observedSiloDna: {
      siloId: "silo-1",
      territoryRef: SILO,
      pillarArticleId: "cand:a",
      supportArticleIds: ATIVOS.filter(ref => ref !== "cand:a"),
      articleReferences: artigos.map(item => ({
        articleId: item.articleId,
        articleDnaVersionId: item.versionId,
        articleDnaContentHash: item.contentHash,
      })),
      versionId: "silo:v1",
      contentHash: "silo:h1",
    },
    observedSiloPage: null,
  });
  assert.equal(veredito.complete, false);
  assert.equal(veredito.observedSiloDna, 1);
  assert.equal(veredito.observedSiloPage, 0);
  assert.match(veredito.summary, /SILODNA 1\/1 · SILOPAGE 0\/1/);
  assert.match(veredito.summary, /par canônico ficou pela metade/);
});

test("§8 — referência com hash divergente reprova o fechamento", () => {
  const artigos = ATIVOS.map(ref => ({
    articleId: ref, versionId: `${ref}:v1`, contentHash: `${ref}:h1`, territoryRef: SILO, siloId: null,
  }));
  const veredito = verifyCanonicalSiloClosure({
    territoryRef: SILO,
    expectedArticleIds: ATIVOS,
    expectedPillarArticleId: "cand:a",
    observedArticles: artigos,
    observedSiloDna: {
      siloId: "silo-1",
      territoryRef: SILO,
      pillarArticleId: "cand:a",
      supportArticleIds: ATIVOS.filter(ref => ref !== "cand:a"),
      articleReferences: artigos.map(item => ({
        articleId: item.articleId,
        articleDnaVersionId: item.versionId,
        articleDnaContentHash: "hash-de-outra-versao",
      })),
      versionId: "silo:v1",
      contentHash: "silo:h1",
    },
    observedSiloPage: {
      siloPageId: "page-1",
      siloId: "silo-1",
      siloDnaRef: { entityId: "silo-1", versionId: "silo:v1", contentHash: "silo:h1" },
    },
  });
  assert.equal(veredito.complete, false);
  assert.equal(veredito.divergences.length, 5, "cada referência divergente é nomeada");
});

/* ============ §9 · o marcador registra a materialização ================= */

test("§9 — o marcador congela endereço e materializedArticleId", () => {
  const payload = ArticleFormationMarkerPayloadSchema.parse({
    contractVersion: "article-formation-marker-v1",
    baseHash: BASE,
    processedAt: "2026-09-08T12:00:00.000Z",
    confirmation: {
      status: "confirmed",
      confirmedAt: "2026-09-08T12:05:00.000Z",
      confirmedArticleCount: 1,
      coveredKeywordCount: 2,
      pendingSiloCount: 0,
      failedCount: 0,
    },
    concludedFormations: [{
      candidateRef: "cand:a",
      territoryRef: SILO,
      principalKeywordId: "k1",
      members: [{ keywordId: "k1", role: "principal" }],
      formationBaseHash: BASE,
      slug: "pele-oleosa-rotina",
      fullPath: "skin-care/pele-oleosa-rotina",
      concludedAt: "2026-09-08T12:05:00.000Z",
      concludedBy: "user-1",
      materializedArticleId: "cand:a",
    }],
  });
  assert.equal(payload.concludedFormations[0].slug, "pele-oleosa-rotina");
  assert.equal(payload.concludedFormations[0].materializedArticleId, "cand:a");

  // Marcador anterior ao corte continua legível: o endereço é nulo, não erro.
  const legado = ArticleFormationMarkerPayloadSchema.parse({
    contractVersion: "article-formation-marker-v1",
    baseHash: BASE,
    processedAt: "2026-09-08T12:00:00.000Z",
    confirmation: {
      status: "confirmed", confirmedAt: null, confirmedArticleCount: 0,
      coveredKeywordCount: 0, pendingSiloCount: 0, failedCount: 0,
    },
    concludedFormations: [{
      candidateRef: "cand:b",
      territoryRef: SILO,
      principalKeywordId: "k2",
      members: [{ keywordId: "k2", role: "principal" }],
      formationBaseHash: BASE,
      concludedAt: "2026-09-08T12:05:00.000Z",
      concludedBy: "user-1",
      materializedArticleId: null,
    }],
  });
  assert.equal(legado.concludedFormations[0].slug, null);
});

/* ================= §3, §11 e §14 · o que a mesa faz ==================== */

test("§3 — a ordem executada é ArticleDNA → SiloWorkingCopy → SiloDNA → SiloPage", () => {
  const materializa = codigo.indexOf('materializeApprovedArticleDnas(entradas, "INITIAL")');
  const workingCopy = codigo.indexOf("createRemoteSiloWorkingCopy({", materializa);
  const consolida = codigo.indexOf("consolidateSilos({", materializa);
  assert.ok(materializa > 0, "o fechamento materializa os ArticleDNA");
  assert.ok(workingCopy > materializa, "a working copy é montada DEPOIS dos ArticleDNA reais");
  assert.ok(consolida > workingCopy, "SiloDNA e SiloPage vêm por último, sobre refs que existem");
});

test("§11 — um só ato humano: o fechamento não acrescenta botão", () => {
  /*
   * A busca é por RÓTULO RENDERIZADO, não pela frase.
   *
   * "Aprovar ArticleDNA é ato de Concluir formação" existe no arquivo e é
   * justamente a recusa do segundo clique: proibir a string proibiria a
   * doutrina junto com o botão.
   */
  const proibidos = ["Consolidar Silo", "Materializar Articles", "Aprovar ArticleDNA", "Aprovar Silo"];
  for (const rotulo of proibidos) {
    assert.equal(codigo.includes(`>${rotulo}<`), false, `o fechamento não pode renderizar o botão ${rotulo}`);
    assert.equal(codigo.includes(`>${rotulo} `), false, `o fechamento não pode renderizar o botão ${rotulo}`);
  }
  // O ato humano continua sendo um só, e é este.
  assert.equal(codigo.includes("Concluir formação"), true);
});

test("§14 — PROVIDER_CALLS = 0: o fechamento não chama provider nem IA", () => {
  const inicio = codigo.indexOf("const runCanonicalSiloClosure = async");
  const fim = codigo.indexOf("const canonicalClosureRef = useRef");
  assert.ok(inicio > 0 && fim > inicio, "o executor do fechamento existe e é delimitável");
  const corpo = codigo.slice(inicio, fim);
  for (const proibido of ["dataforseo", "/api/arquiteto/serp", "runSerp", "collectSerp", "callAi", "/api/ai"]) {
    assert.equal(corpo.includes(proibido), false, `o fechamento não pode conter ${proibido}`);
  }
  // Nem recalcula formação: a composição vem do marcador congelado.
  for (const proibido of ["buildArticleFormationUniverses", "buildArticleFormationConfirmationPlan"]) {
    assert.equal(corpo.includes(proibido), false, `o fechamento não pode recalcular via ${proibido}`);
  }
  assert.equal(corpo.includes("congelada.members"), true, "os membros vêm do snapshot congelado");
  assert.equal(corpo.includes("congelada.principalKeywordId"), true, "a Principal NÃO é reescolhida");
});

test("§2 — o gatilho lê o marcador do readback, não uma soma otimista de cliente", () => {
  const rota = readFileSync("app/api/arquiteto/article-formation-marker/route.ts", "utf8");
  assert.match(rota, /readbackArticleFormationMarker/, "a rota devolve o readback remoto");
  assert.match(rota, /marker: readback\.payload/, "o corpo devolvido é o do remoto");
  // E o plano é construído sobre esse marcador — o que o remoto devolveu.
  const congeladas = codigo.indexOf("const congeladasDoSilo = (marcador.concludedFormations");
  const plano = codigo.indexOf("const closurePlan = buildCanonicalSiloClosurePlan(", congeladas);
  assert.ok(congeladas > 0, "as formações do Silo saem do marcador do readback");
  assert.ok(plano > congeladas, "o plano é construído depois, sobre elas");
  assert.equal(
    codigo.slice(congeladas, plano + 600).includes("formations: congeladasDoSilo"),
    true,
    "o plano recebe as formações do marcador remoto, não uma soma de cliente",
  );
});
