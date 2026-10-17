import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import test from "node:test";

import { buildKeywordUniverse } from "../lib/arquiteto/keyword-universe.ts";
import { buildArchitectureAnalysis, withDeclaredPlanReading, type ArchitectureAnalysis, type ClusterAnalysis } from "../lib/arquiteto/architecture-analysis.ts";
import { ARTICLE_FORMATION_LOT_BASE_PREFIX, articleFormationMarkerIsStale } from "../lib/arquiteto/article-formation-marker.ts";
import { buildArchitectureWorkingProposal, resolveKeywordDnaSignals } from "../lib/arquiteto/architecture-working-proposal.ts";
import { articleFormationBaseHash, buildArticleFormationUniverse, cutArticleFormationUniverses, summarizeArticleFormation, type ArticleCandidate, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { reservedSiloHeadKeywordIds } from "../lib/arquiteto/article-candidate-guards.ts";
import { deterministicArticleDnaPayload, deterministicSiloDnaPayload, deterministicSiloPagePayload } from "../lib/arquiteto/adapters.ts";
import { confirmedArticlePayload } from "../lib/arquiteto/architecture-confirmation.ts";
import { articleApprovalRevalidationIssues } from "../lib/arquiteto/article-approval-revalidation.ts";
import { articleSerpBaseHash, articleSerpBaseOf, resolveArticleFormationSerpState } from "../lib/arquiteto/article-serp-gate.ts";
import { resolveApprovedArticleSerpGate, type ApprovedSerpRecord } from "../lib/arquiteto/approved-article-serp-gate.ts";
import { resolveFormationLedger, resolveSiloClosureReadiness } from "../lib/arquiteto/silo-closure-readiness.ts";
import { buildCanonicalSiloClosurePlan, verifyCanonicalSiloClosure } from "../lib/arquiteto/silo-composition-from-formations.ts";
import { resolveCanonicalSiloIdForTerritory } from "../lib/arquiteto/article-silo-materialization.ts";
import { createVersionEnvelope, toVersionReference } from "../lib/arquiteto/versioning.ts";
import { buildStructuralLinkConnections, type StructuralLinkUnit } from "../lib/arquiteto/internal-link-structure.ts";
import { createInternalLinkGraph, createInternalLinkGraphWorkingCopy } from "../lib/arquiteto/internal-link-graph.ts";
import { resolveRadarEligibility } from "../lib/arquiteto/radar-handoff-gate.ts";
import { ArticleDNASchema, type ArchitectKeyword, type ArticleDNA, type InternalLinkGraphEdge, type InternalLinkGraphNode, type ProvisionalArticleGroup, type SiloDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { choosePlanSiloTerritory, planGroupTerritory, planRecreatePlanSiloLines, planSiloHeadKeywordIds } from "../lib/arquiteto/declared-plan-silo.ts";
import { buildPlanSheetRows, editorialGroupCut, planArticleKeywordIds, planPrincipalSwapCandidates, planRowAlerts, planRowDefinition, planRowRoleLabel, planRowSeals, planSheetFormationSelection, planSheetPreviewLines, planSheetSerpPlanLine, planSheetSerpSelection, splitTableSelectionForPlan, PLAN_IDENTITY_NO_VOLUME_SENTENCE, PLAN_NO_SEARCHES_SENTENCE, PLAN_SHEET_LOCKED_SEAL, PLAN_SUPPORT_SEARCH_PATH } from "../lib/arquiteto/plan-article-sheet.ts";
import { attachSubjectToArticleDna, planSubjectAttachment, readArchitectSubjectStanding, readArchitectSubjectStandings, suggestSubjectSupport } from "../lib/arquiteto/declared-subject.ts";
import { planArticleImprovements, volumelessPrincipalSwap, type ImprovementEvidence, type ImprovementKeyword, type ImprovementTarget } from "../lib/arquiteto/article-improvement.ts";
import { buildSerpSubjectIndex } from "../lib/arquiteto/serp-subject-overlap.ts";
import { decidePublishedPrimarySwap, proposePublishedPrimarySwap } from "../lib/arquiteto/published-primary-swap.ts";
import { validateSiloPlan, SILO_ARTICLE_RANGE } from "../lib/agent/silo-plan.ts";
import { DECLARED_PLAN_ARTICLES_MIN_FOR_SILO, parseDeclaredPlanText } from "../lib/minerador/declared-plan.ts";
import { declarado, linhaDaMesa } from "./arquiteto-assunto-fixtures.mts";
import { cadastro } from "./arquiteto-planilha-primeiro-fixtures.mts";
import {
  ATOR, AZUL, CABECA_DO_SILO, GRUPOS_WIFI, LENTES, LINHAS_AZUL, MARCA_SEM_PLANO, MARCA_WIFI, PLANO_AZUL, SEMANTICO_SEM_PLANO, SEM_PLANO,
  SILO_ID_VELHO, TERRITORIO_AZUL, VOLUME_VALIDADO, codigoSemComentarios, contar, escopoDo, grupoDaKeywordAzul, mesaAzul, top10,
} from "./arquiteto-cenarios-ouro-fixtures.mts";

/*
 * F0 DA LINHA ÚNICA DO ARQUITETO — CENÁRIOS-OURO DO FLUXO DE HOJE (2026-10-16).
 *
 * SDD aprovada `docs/compartilhado/sdd-linha-unica-do-arquiteto-2026-10-16.md`
 * §11.1 (decisões D1–D5 do dono, 16/10). AGENTS.md §0.3: a suíte roda a linha
 * de processo de ponta a ponta com fixtures, sem chamada paga, e cada cenário
 * chega à conclusão esperada e documentada. Esta F0 SÓ GRAVA o comportamento
 * de HOJE: nenhuma linha de produção mudou.
 *
 * Onde a SDD diz que a conclusão muda numa fase, o cenário grava a de hoje e
 * diz "muda na Fn: <o que vai mudar>". Onde o cenário achou defeito, ele fica
 * VERMELHO marcado (`todo`, com o motivo) até a fase que o corrige — sem
 * conserto nesta fase.
 *
 * Este arquivo: os passos que são domínio puro (os mesmos núcleos que a tela
 * chama, na mesma ordem) e a forma da linha (C14, estrutural, lendo o código
 * SEM comentários). Os passos com servidor e I/O simulado estão em
 * `arquiteto-cenarios-ouro-servidor-2026-10-16.test.mts` (melhoria, Silo do
 * plano) e `arquiteto-cenarios-ouro-publicados-2026-10-16.test.mts` (reforço
 * e diferenciação). Script: `npm run test:arquiteto:cenarios`.
 *
 * Nenhuma rede, nenhum banco, nenhum provider: `fetch` lança.
 */

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida nos cenários-ouro do Arquiteto.");
}) as typeof fetch;

const AGORA = new Date("2026-10-16T12:00:00Z");
const QUANDO = "2026-10-16T12:00:00.000Z";
const slugOf = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
type Linha = Record<string, unknown> & { id: string; keyword: string };

/** A linha da mesa → a entrada da formação (o que a aba Artigos entrega a `buildArticleFormationUniverse`). */
function entradaDaFormacao(linha: Linha, extra: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword {
  const semantico = (linha.analise_semantica ?? {}) as Record<string, unknown>;
  return {
    keywordId: linha.id, keyword: linha.keyword, intent: (semantico.intencao_principal as string | undefined) ?? null,
    volume: (linha.volume_search as number | undefined) ?? null, kgr: null, entity: (semantico.entidade_central as string | undefined) ?? null,
    problem: null, isPublished: false, semanticState: "conclusive",
    subjectHeldOut: readArchitectSubjectStanding(linha).heldOutOfFormation, ...extra,
  };
}

/**
 * O grupo do "Concluir formação": a MESMA forma que `materializeApprovedArticleDnas`
 * (ws) monta a partir do candidato revisado — papéis do cenário, pai = território.
 */
function grupoDoCandidato(candidato: ArticleCandidate, linhas: readonly Linha[], extra: Partial<ProvisionalArticleGroup> = {}): ProvisionalArticleGroup {
  const keywords = candidato.keywords.map(item => linhas.find(linha => linha.id === item.keywordId)!) as unknown as ArchitectKeyword[];
  return {
    id: candidato.candidateRef, keywordIds: keywords.map(keyword => String(keyword.id)), keywords, publishedAnchorId: null,
    territoryRef: candidato.siloRef, suggestedSiloId: null, suggestedSiloName: null,
    evidence: { lexical: 0.6, intent: 0.8, entities: 0.5, silo: 1, combined: 0.7 }, confidence: 0.7, alerts: [],
    principalSuggestion: { keywordId: candidato.principalKeywordId, score: 0.7, breakdown: { cobertura: 0.6, intencao: 0.8, centralidadeSemantica: 0.7, aderenciaMarca: 0.5, potencialComercial: 0.5, volume: 0.5, dificuldade: 0.5, qualidadeSlug: 0.8, ancoraPublicada: 0, serp: null }, justificativa: ["Principal definida na formação revisada."], pendencias: [] },
    roles: Object.fromEntries(candidato.keywords.map(item => [item.keywordId, item.role === "principal" ? "principal" : item.role === "reforco" ? "reforco_narrativo" : "secundaria"])),
    suggestedHierarchy: "Suporte",
    ...extra,
  } as unknown as ProvisionalArticleGroup;
}

/** O parecer da SERP por fixture: composição observada, 4 lentes, veredito e o aceite humano gravado no confirmar. */
function parecerDaFixture(candidato: ArticleCandidate, formationBaseHash: string, verdict = "COMPATIBLE"): ApprovedSerpRecord {
  return {
    candidateRef: candidato.candidateRef,
    payload: {
      formationBaseHash, verdict,
      assessment: { id: `assessment:${candidato.candidateRef}`, contentHash: `sha256:${"b".repeat(64)}`, keywordDnaReferences: candidato.keywords.map(item => ({ keywordId: item.keywordId })), recommendations: candidato.keywords.map(item => ({ keywordId: item.keywordId, currentRole: item.role === "principal" ? "principal" : "secundaria" })) },
      interpretation: { lenses: { requested: [...LENTES], observed: [...LENTES], missing: [] } },
      humanResolution: { formationBaseHash },
    },
  };
}

/* ======================================================================= */
/* C1 · Marca sem plano — a linha inteira, do recebido ao Radar             */
/* ======================================================================= */

test("C1 · marca sem plano: Processar arquitetura → Confirmar → Processar artigos → Concluir formação → fechamento → Links → Radar, sem chamada paga", async () => {
  const linhas: Linha[] = SEM_PLANO.map(([id, keyword, volume]) => ({ ...linhaDaMesa({ id, keyword, brandId: MARCA_SEM_PLANO, semantic: { ...SEMANTICO_SEM_PLANO, ...VOLUME_VALIDADO } }), intent: "Informativa", volume_search: volume, volume_source: "google_ads" }));
  const ids = linhas.map(linha => linha.id);

  // 1 · Processar arquitetura (aba Silos): um Silo proposto, toda keyword resolvida, nenhuma some.
  const universo = buildKeywordUniverse({ brandId: MARCA_SEM_PLANO, keywords: linhas });
  const analise = buildArchitectureAnalysis({ universe: universo, territories: [], keywordTexts: new Map(linhas.map(linha => [linha.id, linha.keyword])) });
  const proposta = buildArchitectureWorkingProposal({ analysis: analise, existingSilos: [], keywords: linhas.map(linha => resolveKeywordDnaSignals({ keywordId: linha.id, text: linha.keyword, semantic: linha.analise_semantica as Record<string, unknown> })), slugOf });
  assert.deepEqual(proposta.silos.map(silo => [silo.key, silo.name, silo.slug]), [["proposed:captacao-de-pacientes", "captação de pacientes", "captacao-de-pacientes"]], "um Silo só, pelo léxico de sempre (sem plano)");
  assert.equal(proposta.counters.RESOLVED_KEYWORDS, 8);
  assert.equal(proposta.counters.BLOCKED, 0);
  assert.ok(proposta.assignments.every(item => item.siloKey === "proposed:captacao-de-pacientes"));
  const cabecaLexica = proposta.silos[0].seedKeywordId!;

  // 2 · Confirmar propostas novas: o candidato vira território confirmado (o id real nasce no servidor).
  const territorio = "territory:7c1e0000-0000-4000-8000-0000000000a1";

  // 3 · Processar artigos: a cabeça do Silo é reservada (SiloPage), o resto forma artigos.
  const reservadas = reservedSiloHeadKeywordIds({ lexicalHeadIds: [cabecaLexica], declaredSiloHeadIds: [], territories: [], keywords: linhas.map(linha => ({ keywordId: linha.id, text: linha.keyword, territoryRef: territorio })) });
  assert.deepEqual([...reservadas], [cabecaLexica], "a semente léxica é a cabeça da SiloPage, fora da formação");
  const formacao = buildArticleFormationUniverse({ siloRef: territorio, siloLabel: "captação de pacientes", siloSlug: "captacao-de-pacientes", keywords: linhas.filter(linha => !reservadas.has(linha.id)).map(linha => entradaDaFormacao(linha)) });
  const emArtigo = formacao.candidates.flatMap(candidato => candidato.keywords.map(item => item.keywordId));
  assert.deepEqual([...emArtigo, ...formacao.ungroupedKeywordIds, ...reservadas].sort(), [...ids].sort(), "toda keyword está em artigo, em 'Keywords não agrupadas' ou é a cabeça do Silo — nenhuma some");
  assert.equal(new Set(emArtigo).size, emArtigo.length, "nenhuma keyword em dois artigos");
  assert.ok(formacao.candidates.every(candidato => candidato.keywords.length <= 6), "teto de seis");

  // A SERP (fixture, cache): o parecer da composição de cada candidato, com a base desta composição.
  const intencoes = new Map(linhas.map(linha => [linha.id, "Informativa"]));
  const bases = new Map(formacao.candidates.map(candidato => [candidato.candidateRef, articleSerpBaseHash(articleSerpBaseOf({ candidate: candidato, intentByKeywordId: intencoes }))]));
  const pareceres = formacao.candidates.map(candidato => parecerDaFixture(candidato, bases.get(candidato.candidateRef)!));
  for (const candidato of formacao.candidates) {
    const estado = resolveArticleFormationSerpState({ candidateRef: candidato.candidateRef, expectedBaseHash: bases.get(candidato.candidateRef)!, observed: { formationBaseHash: bases.get(candidato.candidateRef)!, verdict: "COMPATIBLE", lensesComplete: true } });
    assert.equal(estado.state, "current_supported");
    assert.equal(estado.blocksConclusion, false);
  }

  // 4 · Concluir formação: ArticleDNA aprovado com serpAssessmentRef = `${id}:${formationBaseHash}` (o formato dos gravadores vivos, ws:3848).
  const versoes: Array<VersionEnvelope<ArticleDNA>> = [];
  for (const candidato of formacao.candidates) {
    const base = deterministicArticleDnaPayload(grupoDoCandidato(candidato, linhas), MARCA_SEM_PLANO);
    const registro = pareceres.find(item => item.candidateRef === candidato.candidateRef)!;
    const evidencia = { entityId: registro.payload.assessment.id, versionId: `${registro.payload.assessment.id}:${registro.payload.formationBaseHash}`, contentHash: String(registro.payload.assessment.contentHash) };
    const confirmado = ArticleDNASchema.parse(confirmedArticlePayload({ ...base, serpAssessmentRef: evidencia }, candidato.principalKeywordId, ATOR, QUANDO));
    const versao = await createVersionEnvelope({ entityId: confirmado.articleId, versionNumber: 1, origin: "human", changeReason: "Concluir formação", createdBy: ATOR, payload: confirmado, createdAt: QUANDO });
    assert.deepEqual(articleApprovalRevalidationIssues({ version: versao, authorizedBrandId: MARCA_SEM_PLANO }), [], "o aprovado passa na revalidação de sempre");
    assert.equal(versao.payload.serpAssessmentRef?.versionId, `assessment:${candidato.candidateRef}:${bases.get(candidato.candidateRef)}`);
    assert.equal(versao.payload.territoryRef, territorio);
    assert.equal(versao.payload.siloId, null, "o ArticleDNA inicial nasce com o território como pai; o Silo canônico vem no mesmo ato");
    versoes.push(versao as VersionEnvelope<ArticleDNA>);
  }

  // 5 · Fechamento canônico no mesmo ato: a última conclusão fecha o lote → 1 SiloDNA + 1 SiloPage.
  const ativos = formacao.candidates.map(candidato => candidato.candidateRef);
  const livro = resolveFormationLedger({ activeCandidateRefs: ativos, remoteConcludedRefs: [], concludedInThisRun: ativos });
  const prontidao = resolveSiloClosureReadiness({ siloRef: territorio, activeCandidateRefs: livro.activeFormationRefs, concludedCandidateRefs: livro.concludedFormationRefs, pendingMaterializationRefs: livro.concludedFormationRefs });
  assert.equal(prontidao.ready, true, JSON.stringify(prontidao.blockers));
  const plano = buildCanonicalSiloClosurePlan({ formations: formacao.candidates.map(candidato => ({ candidateRef: candidato.candidateRef, principalKeywordId: candidato.principalKeywordId, members: candidato.keywords.map(item => ({ keywordId: item.keywordId, role: item.role })), formationBaseHash: bases.get(candidato.candidateRef)!, materializedArticleId: null })), blockers: prontidao.blockers });
  assert.equal(plano.state, "READY");
  if (plano.state !== "READY") return;
  assert.deepEqual([plano.expectedArticles, plano.expectedSiloDna, plano.expectedSiloPage], [formacao.candidates.length, 1, 1]);
  const comPilar = versoes.map(versao => versao.entityId === plano.pillarFormationRef ? { ...versao, payload: { ...versao.payload, hierarchy: "Pilar" as const } } : versao);
  const siloId = "silo:captacao-de-pacientes";
  const siloDna = { ...deterministicSiloDnaPayload(siloId, "captação de pacientes", comPilar, { brandId: MARCA_SEM_PLANO }), territoryRef: territorio } as SiloDNA;
  const siloVersao = await createVersionEnvelope({ entityId: siloId, versionNumber: 1, origin: "human", changeReason: "Fechamento canônico", createdBy: ATOR, payload: siloDna, createdAt: QUANDO });
  const pagina = deterministicSiloPagePayload(siloVersao as VersionEnvelope<SiloDNA>, MARCA_SEM_PLANO, "/captacao-de-pacientes");
  const paginaVersao = await createVersionEnvelope({ entityId: pagina.siloPageId, versionNumber: 1, origin: "human", changeReason: "Fechamento canônico", createdBy: ATOR, payload: pagina, createdAt: QUANDO });
  assert.equal(siloVersao.versionNumber, 1);
  assert.equal(paginaVersao.versionNumber, 1);
  const veredito = verifyCanonicalSiloClosure({
    territoryRef: territorio, expectedArticleIds: ativos, expectedPillarArticleId: plano.pillarFormationRef,
    observedArticles: versoes.map(versao => ({ articleId: versao.entityId, versionId: versao.versionId, contentHash: versao.contentHash, territoryRef: territorio, siloId: null })),
    observedSiloDna: { siloId, territoryRef: territorio, pillarArticleId: siloDna.pillarArticleId, supportArticleIds: siloDna.supportArticleIds, articleReferences: siloDna.articleReferences.map(item => ({ articleId: item.articleId, articleDnaVersionId: item.articleDnaVersionId, articleDnaContentHash: item.articleDnaContentHash })), versionId: siloVersao.versionId, contentHash: siloVersao.contentHash },
    observedSiloPage: { siloPageId: pagina.siloPageId, siloId, siloDnaRef: toVersionReference(siloVersao) },
  });
  assert.equal(veredito.complete, true, veredito.summary);

  // 6 · Links internos: working copy → consolidar → grafo v1 aprovado.
  const unidades: StructuralLinkUnit[] = [
    { nodeId: "silo-page", nodeType: "SILO_PAGE", architecturalRole: null, label: "captação de pacientes" },
    ...versoes.map(versao => ({ nodeId: versao.entityId, nodeType: "ARTICLE_DNA" as const, architecturalRole: versao.entityId === plano.pillarFormationRef ? "PILAR" as const : "SUPORTE" as const, label: versao.payload.suggestedSlug })),
  ];
  const conexoes = buildStructuralLinkConnections(unidades);
  assert.ok(conexoes.length > 0);
  const nos: InternalLinkGraphNode[] = unidades.map(unidade => ({
    nodeId: unidade.nodeId, brandId: MARCA_SEM_PLANO, nodeType: unidade.nodeType,
    articleDnaVersionRef: unidade.nodeType === "ARTICLE_DNA" ? toVersionReference(versoes.find(versao => versao.entityId === unidade.nodeId)!) : null,
    siloPageVersionRef: unidade.nodeType === "SILO_PAGE" ? toVersionReference(paginaVersao) : null,
    architecturalRole: unidade.architecturalRole, snapshot: { label: unidade.label, siloId },
  }));
  const arestas: InternalLinkGraphEdge[] = conexoes.map((conexao, indice) => ({ edgeId: `e${indice}`, sourceNodeId: conexao.sourceNodeId, targetNodeId: conexao.targetNodeId, relationType: conexao.relationType, reason: conexao.reason, priority: conexao.priority, anchorConcepts: ["captação de pacientes"], origin: "human", createdBy: ATOR, createdAt: QUANDO, provenance: { source: "structural-derivation", references: [siloVersao.versionId] } }));
  const base = { graphId: "graph:captacao", brandId: MARCA_SEM_PLANO, siloId, baseSiloDnaVersionRef: toVersionReference(siloVersao), baseSiloPageVersionRef: toVersionReference(paginaVersao), participatingArticleDnaVersionRefs: versoes.map(versao => toVersionReference(versao)), nodes: nos, edges: arestas };
  const copia = await createInternalLinkGraphWorkingCopy({ ...base, createdBy: ATOR, now: QUANDO });
  assert.equal(copia.edges.length, arestas.length, "a cópia de trabalho guarda o grafo proposto");
  const grafo = await createInternalLinkGraph({ ...base, versionNumber: 1, workflowStatus: "approved", createdBy: ATOR, createdAt: QUANDO, approvedBy: ATOR, approvedAt: QUANDO });
  assert.equal(grafo.versionNumber, 1);
  assert.equal(grafo.workflowStatus, "approved");

  // 7 · Enviar ao Radar: o portão do DNA aprovado reconhece o parecer, e o artigo é elegível.
  for (const versao of versoes) {
    const portao = resolveApprovedArticleSerpGate({ articleId: versao.entityId, dna: { serpAssessmentRef: versao.payload.serpAssessmentRef, principalKeywordId: versao.payload.principalKeywordId, keywordReferences: versao.payload.keywordReferences }, records: pareceres });
    assert.equal(portao?.state, "current_supported", `portão do Radar de ${versao.entityId}`);
    const silo = resolveCanonicalSiloIdForTerritory({ territoryRef: versao.payload.territoryRef, siloVersions: [siloVersao as VersionEnvelope<SiloDNA>] });
    assert.equal(silo.state, "BOUND");
    const elegivel = resolveRadarEligibility({
      articleId: versao.entityId, label: versao.payload.suggestedSlug, articleDnaVersionId: versao.versionId, articleDnaContentHash: versao.contentHash,
      territoryRef: territorio, siloId: silo.state === "BOUND" ? silo.siloId : null, principalKeywordId: versao.payload.principalKeywordId,
      secondaryKeywordIds: versao.payload.secondaryKeywordIds, narrativeReinforcementIds: versao.payload.narrativeReinforcementIds, suggestedSlug: versao.payload.suggestedSlug,
      keywordTerritoryRefs: versao.payload.keywordReferences.map(() => territorio), serpState: portao!.state, serpReason: null,
      internalLinkGraphApproved: grafo.workflowStatus === "approved", belongsToCurrentScenario: true, readbackConfirmed: true,
    });
    assert.equal(elegivel.eligible, true, elegivel.blockers.join(" "));
  }
  assert.equal(chamadasDeRede, 0, "0 chamada paga, 0 rede");
});

/* ======================================================================= */
/* C2 · Plano com a keyword do Silo · C3 · plano sem ela (WifiConecta azul) */
/* ======================================================================= */

const doPlanoAzul = (mesa: Linha[]) => planArticleKeywordIds({ brandId: MARCA_WIFI, standings: readArchitectSubjectStandings(mesa) });
function propostaDoAzul(opcoes: { cabeca: boolean }) {
  const mesa = mesaAzul({ cabeca: opcoes.cabeca }) as Linha[];
  const ids = LINHAS_AZUL.map(linha => linha.id);
  const membros = opcoes.cabeca ? [CABECA_DO_SILO, ...ids] : ids;
  // O léxico junta a keyword do Silo com os artigos e a elegeria semente (o Silo paralelo de antes de 15/10).
  const analise = { clusters: [{ clusterRef: "c-azul", label: "Wi-Fi e fibra óptica", memberKeywordIds: membros, headKeywordId: membros[0], ambiguousHeadKeywordIds: [], destination: "new_silo_candidate", suggestedTerritoryRef: null, suggestedTerritoryLabel: null, alternativeTerritoryRefs: [], confidence: "alta", reason: "grupo coeso" }], summary: { keywords: membros.length, clusters: 1, strengthening: 0, newSilos: 1, insufficient: 0, ambiguous: 0, confidence: "alta" }, narrative: [], baseHash: "base" } as unknown as Parameters<typeof buildArchitectureWorkingProposal>[0]["analysis"];
  // O Silo do plano que JÁ existe: onde as keywords estão — o silo_id velho do grupo não engana.
  const existente = planGroupTerritory({ plan: PLANO_AZUL, linkedTerritoryRef: SILO_ID_VELHO, keywordTerritoryRefs: mesa.filter(linha => ids.includes(linha.id)).map(linha => linha.territoryRef as string), territories: [{ territoryRef: TERRITORIO_AZUL, lifecycleStatus: "consolidated", slugs: ["wifi-e-fibra"], name: "Wi-Fi e fibra óptica" }], slugOf });
  const proposta = buildArchitectureWorkingProposal({
    analysis: analise, existingSilos: [], slugOf,
    keywords: mesa.map(linha => resolveKeywordDnaSignals({ keywordId: linha.id, text: linha.keyword, semantic: linha.analise_semantica as Record<string, unknown> })),
    declaredPlanGroups: [{ groupId: AZUL, label: "Azul", siloName: PLANO_AZUL.siloName, siloSlug: PLANO_AZUL.siloSlug, keywordIds: ids, territoryRef: existente?.territoryRef ?? null, territory: existente ? { name: existente.name ?? PLANO_AZUL.siloName, slug: existente.slug ?? PLANO_AZUL.siloSlug } : null, headKeywordIds: opcoes.cabeca ? [CABECA_DO_SILO] : [] }],
  });
  return { mesa, ids, existente, proposta };
}
const planilhaAzul = (mesa: Linha[], articles: Parameters<typeof buildPlanSheetRows>[0]["articles"] = []) => buildPlanSheetRows({ brandId: MARCA_WIFI, keywords: mesa, groupOf: id => GRUPOS_WIFI[id] ?? null, keywordGroupOf: grupoDaKeywordAzul, articles, radarArticleIds: new Set(), serp: null, filter: { kind: "groups", color: "azul", groupIds: [AZUL] }, now: AGORA });

test("C2 · plano COM a keyword do Silo: um Silo com nome e slug do plano; a keyword do Silo é a cabeça da SiloPage (nunca artigo nem não agrupada); 7 linhas do plano; hoje Concluir vai por B — muda na F2", () => {
  const { mesa, ids, existente, proposta } = propostaDoAzul({ cabeca: true });
  assert.equal(existente?.territoryRef, TERRITORIO_AZUL, "o silo_id velho (territory:09d9b92d…) não existe: vale onde as keywords do plano estão");
  assert.deepEqual(proposta.silos.map(silo => silo.key), [TERRITORIO_AZUL], "um Silo só, o do plano");
  assert.equal(proposta.silos[0].seedKeywordId, null, "o tema é o do plano, nunca a semente léxica");
  const cabeca = proposta.assignments.find(item => item.keywordId === CABECA_DO_SILO)!;
  assert.equal(cabeca.siloKey, TERRITORIO_AZUL);
  assert.match(cabeca.reason, /Keyword do Silo do plano.*cabeça da SiloPage/);
  assert.equal(proposta.counters.RESOLVED_KEYWORDS, 8, "nenhuma keyword some");
  // A keyword do Silo é reconhecida pelo nome do plano e reservada: fora de artigo e de "não agrupadas".
  const cabecas = planSiloHeadKeywordIds({ plans: [{ groupId: AZUL, siloName: PLANO_AZUL.siloName, siloSlug: PLANO_AZUL.siloSlug }], keywords: mesa.map(linha => ({ keywordId: linha.id, text: linha.keyword })), planArticleKeywordIds: doPlanoAzul(mesa) });
  assert.deepEqual([...cabecas.keys()], [CABECA_DO_SILO]);
  const reservadas = reservedSiloHeadKeywordIds({ lexicalHeadIds: [], declaredSiloHeadIds: [], territories: [], keywords: [], planArticleKeywordIds: doPlanoAzul(mesa), planSiloHeadIds: [...cabecas.keys()] });
  assert.deepEqual([...reservadas], [CABECA_DO_SILO]);
  assert.equal(ids.some(id => reservadas.has(id)), false, "artigo do plano nunca é cabeça (nunca converter artigo em Silo)");

  // Processar artigos / Concluir formação: as 7 linhas do plano, Pilar primeiro, a versão do GRUPO (v4).
  const linhas = planilhaAzul(mesa as Linha[]);
  assert.deepEqual(linhas.map(linha => linha.keywordId), ids);
  assert.equal(linhas[0].role, "Pilar");
  assert.equal(linhas[0].keyword, "internet fibra óptica");
  assert.ok(linhas.every(linha => linha.planVersion === 4), "a linha diz a versão do grupo (as keywords guardam 4/3/2)");
  assert.deepEqual(linhas.filter(linha => linha.lock.state === "free").map(linha => linha.keywordId), ["k10"], "só 'diferença entre internet e Wi-Fi' (sem volume) é Livre");
  assert.match(linhas.find(linha => linha.keywordId === "k11")!.lock.label, /^Travada · volume definido/, "Wi-Fi lento (260): volume definido fixa");
  assert.equal(linhas.some(linha => linha.keywordId === CABECA_DO_SILO), false, "a keyword do Silo nunca é linha de artigo");

  // HOJE (muda na F2): "Concluir formação" desvia as linhas do plano para a planilha (B, a melhoria com origin plan_sheet) — um prepare por grupo.
  const divisao = splitTableSelectionForPlan({ articles: [] as Array<{ id: string }>, selectedArticleIds: new Set(), idOf: art => art.id, planRowOf: () => null, planOnlyRows: linhas, selectedPlanKeywordIds: new Set(ids) });
  assert.equal(divisao.regularArticleIds.size, 0, "hoje nenhuma linha do plano vai pela formação de sempre (A) — muda na F2: a linha do plano é candidato de A");
  assert.equal(divisao.planTargets.length, 7);
  const lote = planSheetFormationSelection(linhas, "concludeFormation");
  assert.deepEqual([...lote.byGroup.keys()], [AZUL]);
  assert.equal(lote.byGroup.get(AZUL)!.length, 7);
  const barra = codigoSemComentarios("modules/arquiteto/articles-formation-bar.tsx");
  assert.match(barra, /if \(doPlano\.length\) planSheet\.start\("concludeFormation", doPlano\);/, "hoje: Concluir chama a planilha (B) — muda na F2");
  assert.match(codigoSemComentarios("modules/arquiteto/plan-article-sheet.tsx"), /origin: "plan_sheet"/, "hoje: B grava pela melhoria (origin plan_sheet) — muda na F2");
});

test("C3 · plano SEM a keyword do Silo (o caso real): o Silo do plano pelo nome e slug, reusado; nenhum erro nem pendência; nenhum artigo vira Silo", () => {
  const { mesa, ids, proposta } = propostaDoAzul({ cabeca: false });
  assert.deepEqual([proposta.counters.SILOS_PROPOSED, proposta.counters.SILOS_REUSED, proposta.counters.BLOCKED], [0, 1, 0]);
  assert.deepEqual(proposta.silos.map(silo => [silo.key, silo.seedKeywordId]), [[TERRITORIO_AZUL, null]]);
  assert.equal(proposta.counters.RESOLVED_KEYWORDS, 7);
  const cabecas = planSiloHeadKeywordIds({ plans: [{ groupId: AZUL, siloName: PLANO_AZUL.siloName, siloSlug: PLANO_AZUL.siloSlug }], keywords: mesa.map(linha => ({ keywordId: linha.id, text: linha.keyword })), planArticleKeywordIds: doPlanoAzul(mesa) });
  assert.equal(cabecas.size, 0, "a keyword do Silo ausente é o normal: nada reconhecido, nada pendente");
  assert.equal(reservedSiloHeadKeywordIds({ lexicalHeadIds: [], declaredSiloHeadIds: [], territories: [], keywords: [], planArticleKeywordIds: doPlanoAzul(mesa), planSiloHeadIds: [] }).size, 0);
  // Sem semente: nenhum artigo do plano foi promovido a Silo.
  assert.ok(proposta.assignments.filter(item => ids.includes(item.keywordId)).every(item => item.siloKey === TERRITORIO_AZUL));
  // Sem nenhum Silo vivo: proposto pelo NOME e SLUG do plano (nunca pela keyword).
  const semTerritorio = buildArchitectureWorkingProposal({
    analysis: { clusters: [{ clusterRef: "c", label: "x", memberKeywordIds: ids, headKeywordId: ids[0], ambiguousHeadKeywordIds: [], destination: "new_silo_candidate", suggestedTerritoryRef: null, suggestedTerritoryLabel: null, alternativeTerritoryRefs: [], confidence: "alta", reason: "r" }], summary: { keywords: 7, clusters: 1, strengthening: 0, newSilos: 1, insufficient: 0, ambiguous: 0, confidence: "alta" }, narrative: [], baseHash: "b" } as unknown as Parameters<typeof buildArchitectureWorkingProposal>[0]["analysis"],
    existingSilos: [], slugOf, keywords: mesa.map(linha => resolveKeywordDnaSignals({ keywordId: linha.id, text: linha.keyword, semantic: {} })),
    declaredPlanGroups: [{ groupId: AZUL, label: "Azul", siloName: PLANO_AZUL.siloName, siloSlug: PLANO_AZUL.siloSlug, keywordIds: ids, territoryRef: null, territory: null, headKeywordIds: [] }],
  });
  assert.deepEqual(semTerritorio.silos.map(silo => [silo.key, silo.name, silo.slug, silo.seedKeywordId]), [["proposed:wifi-e-fibra", "Wi-Fi e fibra óptica", "wifi-e-fibra", null]]);
});

/* ======================================================================= */
/* C4 · Silo do plano desfeito e recriado (domínio; o servidor está no arquivo do servidor) */
/* ======================================================================= */

test("C4 · Silo do plano desfeito: 'Recriar o Silo do plano' acha o MESMO Silo (nome e slug do plano), não mexe nos artigos e só traz as keywords sem artigo", () => {
  const territorios = [
    { territoryRef: TERRITORIO_AZUL, lifecycleStatus: "rejected", slugs: [null], name: "Wi-Fi e fibra óptica" },
    { territoryRef: "territory:9c75c3a7-15e1-4655-b627-c08e394b4606", lifecycleStatus: "consolidated", slugs: ["planos-de-internet"], name: "planos de internet" },
  ];
  // O grupo ainda aponta para o silo_id velho, que sumiu: o Silo desfeito do plano é achado pelo nome.
  assert.deepEqual(choosePlanSiloTerritory({ plan: PLANO_AZUL, linkedTerritoryRef: SILO_ID_VELHO, territories: territorios, slugOf }), { kind: "rejected_by_human", territoryRef: TERRITORIO_AZUL });
  // O Silo vivo de mesmo slug vence o desfeito: nunca nasce um segundo.
  assert.deepEqual(choosePlanSiloTerritory({ plan: PLANO_AZUL, linkedTerritoryRef: null, territories: [...territorios, { territoryRef: "territory:vivo", lifecycleStatus: "confirmed", slugs: ["wifi-e-fibra"], name: "Wi-Fi e fibra óptica" }], slugOf }).kind, "slug");
  const keyword = (keywordId: string, nome: string, extra: Record<string, unknown> = {}) => ({ keywordId, keyword: nome, received: true, territoryRef: null as string | null, territoryLabel: null as string | null, isPublished: false, articleLabel: null as string | null, previousDecision: null as string | null, ...extra });
  const linhas = planRecreatePlanSiloLines({ territoryRef: TERRITORIO_AZUL, keywords: LINHAS_AZUL.map(linha => ["k12", "k13", "k14"].includes(linha.id)
    ? keyword(linha.id, linha.keyword, { territoryRef: "territory:9c75c3a7-15e1-4655-b627-c08e394b4606", territoryLabel: "planos de internet", articleLabel: "melhor-para-jogos-online" })
    : keyword(linha.id, linha.keyword)) });
  assert.equal(linhas.length, 7, "nenhuma keyword some da prévia");
  assert.deepEqual(linhas.filter(item => item.outcome === "stays_in_article").map(item => item.keywordId).sort(), ["k12", "k13", "k14"], "artigos intactos: keyword em artigo aprovado não é mexida");
  assert.deepEqual(linhas.filter(item => item.outcome === "enters").map(item => item.keywordId).sort(), ["k10", "k11", "k15", "k9"]);
  // O religar do grupo: a rota de sempre só chama o "ligar" quando o grupo não tem silo_id (ver o servidor: C4 no arquivo do servidor).
  const recriar = codigoSemComentarios("lib/server/arquiteto-plan-silo-recreate.ts");
  assert.match(recriar, /if \(!lido\.grupo\.siloId\) \{\s*await linkEditorialGroupSilo\(/);
});

/* ======================================================================= */
/* C5 · Assunto sem plano (painel "Formar em torno do Assunto")             */
/* ======================================================================= */

test("C5 · Assunto sem plano, sem volume, com 5 sustentações com volume: um artigo em torno dele, subject com ator humano, principal com volume, Assunto fora das 6", async () => {
  const sem = { entidade_central: "captação de pacientes", intencao_principal: "Informativa", dna_origem: "logico_deterministico" };
  const territorio = "territory:7c1e0000-0000-4000-8000-0000000000a1";
  const assunto: Linha = { ...linhaDaMesa({ id: "s0", keyword: "Como encher a agenda da clínica de estética", brandId: MARCA_SEM_PLANO, semantic: { ...sem, ...declarado("Mostrar como transformar contatos em agendamentos.") } }), territoryRef: territorio };
  const sustentacoes: Linha[] = ([["s1", "como encher a agenda da clínica", 590], ["s2", "agenda cheia clínica de estética", 320], ["s3", "como aumentar agendamentos na clínica", 210], ["s4", "agendamento clínica de estética", 140], ["s5", "como lotar a agenda da clínica de estética", 90]] as const)
    .map(([id, keyword, volume]) => ({ ...linhaDaMesa({ id, keyword, brandId: MARCA_SEM_PLANO, semantic: { ...sem, ...VOLUME_VALIDADO, subject_discovery: { version: 1, searches: [], subjectKeywordIds: ["s0"] } } }), territoryRef: territorio, volume_search: volume, volume_source: "google_ads" }));
  const sobra: Linha = { ...linhaDaMesa({ id: "x1", keyword: "contabilidade para clínicas", brandId: MARCA_SEM_PLANO, semantic: { entidade_central: "contabilidade", intencao_principal: "Comercial", ...VOLUME_VALIDADO } }), territoryRef: territorio, volume_search: 50, volume_source: "google_ads" };
  const mesa = [assunto, ...sustentacoes, sobra];

  const posicao = readArchitectSubjectStanding(assunto);
  assert.deepEqual([posicao.declared, posicao.volumeValidated, posicao.heldOutOfFormation], [true, false, true], "Assunto sem volume: fora da formação automática");
  const sugestoes = suggestSubjectSupport({ brandId: MARCA_SEM_PLANO, subjectKeyword: assunto, keywords: mesa });
  assert.deepEqual(sugestoes.filter(item => item.automaticEligible).map(item => item.keywordId).sort(), ["s1", "s2", "s3", "s4", "s5"], "as 5 da Pesquisa por Assunto entram no lote automático");
  assert.equal(sugestoes.find(item => item.keywordId === "x1")?.automaticEligible ?? false, false, "a que só se parece nas palavras não entra");

  const antes = buildArticleFormationUniverse({ siloRef: territorio, siloLabel: "captação de pacientes", siloSlug: "captacao-de-pacientes", keywords: mesa.map(linha => entradaDaFormacao(linha)) });
  assert.deepEqual(antes.awaitingSupportSubjectKeywordIds, ["s0"], "antes: o Assunto nas sobras com o selo 'aguardando sustentação'");
  const doAssunto = antes.candidates.find(candidato => candidato.keywords.some(item => item.keywordId === "s1"))!;
  assert.deepEqual(doAssunto.keywords.map(item => item.keywordId).sort(), ["s1", "s2", "s3", "s4", "s5"]);
  // A automação prende o Assunto ao candidato (ato humano: o ator autenticado).
  const prender = planSubjectAttachment({ brandId: MARCA_SEM_PLANO, keyword: assunto, actorUserId: ATOR, attachedAt: QUANDO, target: { principalKeywordId: doAssunto.principalKeywordId, keywords: doAssunto.keywords.map(item => ({ keywordId: item.keywordId, role: item.role })) } });
  assert.ok(prender.ok, prender.ok ? "" : prender.reason);
  if (!prender.ok) return;
  assert.equal(prender.subject.attachedBy, ATOR, "attachedBy humano");
  const depois = buildArticleFormationUniverse({ siloRef: territorio, siloLabel: "captação de pacientes", siloSlug: "captacao-de-pacientes", keywords: mesa.map(linha => entradaDaFormacao(linha, linha.id === "s0" ? { subjectAnchored: true } : {})), subjectByCandidateRef: new Map([[doAssunto.candidateRef, "s0"]]) });
  const artigo = depois.candidates.find(candidato => candidato.candidateRef === doAssunto.candidateRef)!;
  assert.equal(artigo.subjectKeywordId, "s0", "um artigo por Assunto");
  assert.equal(depois.candidates.filter(candidato => candidato.subjectKeywordId === "s0").length, 1);
  assert.equal(artigo.keywords.some(item => item.keywordId === "s0"), false, "o Assunto fica fora das 6 (é o tronco)");
  assert.deepEqual(depois.ungroupedKeywordIds, [], "preso, o Assunto sai das sobras");
  // Hoje a principal eleita é "agenda cheia clínica de estética" (320), não a de maior volume (590): "volume não decide sozinho" (eleição ≠ troca, R1 §8.1-6).
  assert.equal(artigo.principalKeywordId, "s2");
  const dna = deterministicArticleDnaPayload(grupoDoCandidato(artigo, mesa), MARCA_SEM_PLANO);
  const comAssunto = attachSubjectToArticleDna(dna, prender.subject);
  assert.ok(comAssunto.ok);
  if (!comAssunto.ok) return;
  const relido = ArticleDNASchema.parse(JSON.parse(JSON.stringify(comAssunto.value)));
  assert.equal(relido.subject?.keywordId, "s0");
  assert.equal(relido.keywordReferences.some(reference => reference.keywordId === "s0"), false);
  assert.ok((relido.primaryKeywordMetrics?.volumeSearch ?? 0) > 0, "a principal tem volume");
  // A keyword que não sustenta o Assunto não entra no artigo dele: fica fora, com o motivo da auditoria.
  assert.equal(artigo.keywords.some(item => item.keywordId === "x1"), false);
  assert.ok(depois.singletonAudits.some(auditoria => auditoria.keywordId === "x1"), "a sobra tem o motivo (auditoria do singleton)");
});

/* ======================================================================= */
/* C6 · Assunto sem plano pela melhoria: principal volume 10 × candidata 500 */
/* ======================================================================= */

const sinais = (keywordId: string, texto: string) => resolveKeywordDnaSignals({ keywordId, text: texto, semantic: { entidade_central: "captação de pacientes", problema_percebido: "agenda vazia", publico: "donas de clínica", resultado_desejado: "agenda cheia", intencao_principal: "Informativa" } });
const termo = (id: string, keyword: string, extra: Partial<ImprovementKeyword> = {}): ImprovementKeyword => ({ id, keyword, volume: 50, volumeValidated: true, signals: sinais(id, keyword), ownerId: null, published: false, territoryRef: "territory:t", external: false, ...extra });
const prova = (targetId: string, keywordId: string, extra: Partial<ImprovementEvidence> = {}): ImprovementEvidence => ({ targetId, keywordId, complete: true, sharedPages: 4, contradiction: false, anchorConclusive: true, ...extra });

test("C6 · Assunto sem plano com DNA, principal de volume 10, candidata de 500 na lista: a principal de IDENTIDADE (no título e no slug) fica desde 2026-10-17; fora da identidade, HOJE a melhoria troca para a de 500 — muda na F4: fica (R1, volume definido)", () => {
  const alvo: ImprovementTarget = { id: "assunto", kind: "subject", theme: "Captação de pacientes para clínica", note: null, primaryId: "p10", post: "free", memberIds: ["p10"], territoryRef: "territory:t", slug: "captacao-de-pacientes-para-clinica", url: null, canonical: null, signals: sinais("assunto", "captação de pacientes para clínica") };
  const keywords = [termo("p10", "captação de pacientes para clínica", { volume: 10, ownerId: "assunto" }), termo("c500", "captação de pacientes clínica de estética", { volume: 500 })];
  const evidencia = [prova("assunto", "p10"), prova("assunto", "c500")];
  // 2026-10-17 · Principal de identidade (dono): ela está no título e no slug do Assunto — fica; a de 500 reforça.
  const [identidade] = planArticleImprovements({ targets: [alvo], keywords, evidence: evidencia });
  assert.equal(identidade.status, "ready");
  assert.equal(identidade.principalId, "p10", "a principal de identidade fica (R1 cumprida neste caso)");
  assert.ok(identidade.memberIds.includes("c500"), "a mais ampla entra como secundária");
  // Fora da identidade (o título e o slug falam de outra coisa): HOJE a régua própria do Assunto com volume ainda troca — muda na F4.
  const fora = { ...alvo, theme: "Agenda vazia na clínica", slug: "agenda-vazia-na-clinica" };
  const [proposta] = planArticleImprovements({ targets: [fora], keywords, evidence: evidencia });
  assert.equal(proposta.status, "ready");
  assert.equal(proposta.currentPrimaryId, "p10");
  assert.equal(proposta.principalId, "c500", "HOJE: a regra própria do Assunto (needsPrimary) troca a principal COM volume fora da identidade — muda na F4: R1 mantém p10");
  assert.ok(proposta.memberIds.includes("p10"), "a antiga fica no artigo");
  // O publicado na mesma situação NÃO troca (a régua do publicado já é a R1 para Livre com volume).
  const [publicado] = planArticleImprovements({ targets: [{ ...alvo, kind: "published", url: "https://x.test/a", canonical: "https://x.test/a" }], keywords: [termo("p10", "captação de pacientes para clínica", { volume: 10, published: true }), termo("c500", "captação de pacientes clínica de estética", { volume: 500 })], evidence: [prova("assunto", "c500")] });
  assert.equal(publicado.principalId, "p10");
});

/* ======================================================================= */
/* C9 / C9b · troca da principal Livre (mesa SERP-subject e melhoria)      */
/* ======================================================================= */

const identidade = { url: "https://adalbapro.com.br/blog/como-captar-clientes-para-clinica-de-estetica", canonical: "https://adalbapro.com.br/blog/como-captar-clientes-para-clinica-de-estetica", slug: "como-captar-clientes-para-clinica-de-estetica" };
const pegada = (keywordId: string, keyword: string, prefixo: string) => ({ keywordId, keyword, lenses: LENTES.map(lens => ({ lens, urls: top10(prefixo), domains: null, collectedAt: "2026-10-10T12:00:00+00:00" })) });
const formacaoKw = (keywordId: string, keyword: string, volume: number | null, extra: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({ keywordId, keyword, intent: "Informativa", volume, kgr: null, entity: null, problem: null, isPublished: false, ...extra });

/*
 * 2026-10-17 · PRINCIPAL DE IDENTIDADE (dono: "Se o termo principal tem pouco volume, mas faz sentido preservá-lo
 * por ser a identidade do assunto/tema, principalmente nos publicados"). A página com o slug feito da principal
 * ("como-captar-clientes-para-clinica-de-estetica") não recebe proposta de troca: ela fica e as mais amplas reforçam.
 * A troca do C9 vale para a principal FORA da identidade (estranha ao slug).
 */
const PRINCIPAL_FORA_DA_IDENTIDADE = "agenda vazia na estética";
test("C9 · publicado Livre com a principal SEM volume e uma keyword do artigo com volume e o núcleo do slug: de identidade, nada é proposto; fora da identidade, a troca é proposta, a antiga fica secundária, decisão confirmada com ator e hora, identidade intacta (mesa: hoje grava 'proposed' pelo navegador — muda na F5)", () => {
  const indice = buildSerpSubjectIndex([pegada("pub", "como captar clientes para clínica de estética", "captar"), pegada("nova", "como captar clientes clínica de estética", "captar")]);
  const deIdentidade = proposePublishedPrimarySwap({ published: formacaoKw("pub", "como captar clientes para clínica de estética", null, { isPublished: true }), post: "free", identity: identidade, candidates: [{ ...formacaoKw("nova", "como captar clientes clínica de estética", 390), volumeValidated: true }], serp: indice });
  assert.equal(deIdentidade.state, "locked");
  assert.match(deIdentidade.note, /^Principal de identidade/);
  const daPagina = (texto: string) => new Map([["pub", termo("pub", texto, { volume: null, volumeValidated: false, published: true })], ["nova", termo("nova", "como captar clientes clínica de estética", { volume: 390, ownerId: "pub" })]]);
  const alvoReal: ImprovementTarget = { id: "pub", kind: "published", theme: "como captar clientes para clínica de estética", note: null, primaryId: "pub", post: "free", memberIds: ["pub", "nova"], territoryRef: "territory:t", slug: identidade.slug, url: identidade.url, canonical: identidade.canonical, signals: sinais("pub", "como captar clientes para clínica de estética") };
  assert.equal(volumelessPrincipalSwap(alvoReal, daPagina("como captar clientes para clínica de estética")), null, "a melhoria também não troca a principal de identidade");
  const proposta = proposePublishedPrimarySwap({ published: formacaoKw("pub", PRINCIPAL_FORA_DA_IDENTIDADE, null, { isPublished: true }), post: "free", identity: identidade, candidates: [{ ...formacaoKw("nova", "como captar clientes clínica de estética", 390), volumeValidated: true }], serp: indice });
  assert.equal(proposta.state, "proposed", proposta.note);
  assert.equal(proposta.substitute?.keywordId, "nova");
  assert.deepEqual(proposta.protectedIdentity, identidade);
  const decisao = decidePublishedPrimarySwap({ proposal: proposta, article: { principalKeywordId: "pub", keywordIds: ["pub", "nova"], identity: identidade }, currentPost: "free", accepted: true, actorUserId: ATOR, decidedAt: QUANDO });
  assert.ok(decisao.ok);
  if (!decisao.ok) return;
  assert.equal(decisao.principalKeywordId, "nova");
  assert.deepEqual(decisao.roleChanges, [{ keywordId: "nova", role: "principal" }, { keywordId: "pub", role: "secundaria" }], "a antiga vira secundária");
  assert.equal(decisao.articleDnaFields.primaryKeywordDecision.status, "confirmed");
  assert.equal(decisao.articleDnaFields.primaryKeywordDecision.actorId, ATOR);
  assert.deepEqual(decisao.identity, identidade, "URL, slug e canonical intactos");
  assert.equal(decisao.requiresNewVersion, true);
  // A melhoria (núcleo puro): a mesma troca, pela keyword do artigo mais próxima do slug (principal fora da identidade).
  const troca = volumelessPrincipalSwap(alvoReal, daPagina(PRINCIPAL_FORA_DA_IDENTIDADE));
  assert.equal(troca?.principalId, "nova");
  assert.deepEqual(troca?.memberIds, ["pub", "nova"], "nada entra nem sai");
  // HOJE: a mesa grava a troca como 'proposed' pelo navegador (ws → persistArticleSubjectVersion) — muda na F5 (R2: approved pelo gravador único).
  const tela = codigoSemComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  const gravarPelaMesa = tela.slice(tela.indexOf("const persistArticleSubjectVersion = useCallback("), tela.indexOf("const persistArticleSubjectVersion = useCallback(") + 2500);
  assert.match(gravarPelaMesa, /persistArquitetoArtifact\(\{ brandId: selectedBrandId, artifactType: "article_dna", action: "edit", version: successor, status: "proposed" \}\)/, "HOJE: a troca pela mesa grava 'proposed' com 'edit' — muda na F5");
});

test("C9b · publicado Livre com a principal de volume 10 e candidata Forte de 500: de identidade, nenhuma propõe (2026-10-17); fora da identidade, HOJE a mesa propõe a troca e a melhoria não — muda na F4: nenhuma propõe (R1)", () => {
  const indice = buildSerpSubjectIndex([pegada("pub", "como captar clientes para clínica de estética", "captar"), pegada("c500", "como captar clientes clínica de estética", "captar")]);
  assert.equal(proposePublishedPrimarySwap({ published: formacaoKw("pub", "como captar clientes para clínica de estética", 10, { isPublished: true }), post: "free", identity: identidade, candidates: [{ ...formacaoKw("c500", "como captar clientes clínica de estética", 500), volumeValidated: true }], serp: indice }).state, "locked", "principal de identidade: a mesa não propõe");
  const mesa = proposePublishedPrimarySwap({ published: formacaoKw("pub", PRINCIPAL_FORA_DA_IDENTIDADE, 10, { isPublished: true }), post: "free", identity: identidade, candidates: [{ ...formacaoKw("c500", "como captar clientes clínica de estética", 500), volumeValidated: true }], serp: indice });
  assert.equal(mesa.state, "proposed", "HOJE, fora da identidade, a régua D2.1 (published-primary-swap.ts) troca Livre com volume quando a substituta tem mais — muda na F4");
  const alvo: ImprovementTarget = { id: "pub", kind: "published", theme: "como captar clientes para clínica de estética", note: null, primaryId: "pub", post: "free", memberIds: ["pub"], territoryRef: "territory:t", slug: identidade.slug, url: identidade.url, canonical: identidade.canonical, signals: sinais("pub", "como captar clientes para clínica de estética") };
  const [melhoria] = planArticleImprovements({ targets: [alvo], keywords: [termo("pub", "como captar clientes para clínica de estética", { volume: 10, published: true }), termo("c500", "como captar clientes clínica de estética", { volume: 500 })], evidence: [prova("pub", "c500", { sharedPages: 10 })] });
  assert.equal(melhoria.principalId, "pub", "a melhoria já mantém a Livre com volume (needsPrimary do publicado só para sem volume)");
  assert.ok(melhoria.memberIds.includes("c500"), "a de 500 entra como secundária");
});

/* ======================================================================= */
/* C10 · keyword solta (sem Assunto, grupo ou artigo)                       */
/* ======================================================================= */

test("C10 · keyword solta com volume: entra como secundária; como principal só da Livre sem volume FORA da identidade (2026-10-17); a de identidade e a Travada recebem só secundária", () => {
  const alvo = (extra: Partial<ImprovementTarget> = {}): ImprovementTarget => ({ id: "k10", kind: "subject", theme: "Diferença entre internet e Wi-Fi", note: null, primaryId: "dif", post: "free", memberIds: ["dif"], territoryRef: TERRITORIO_AZUL, slug: "diferenca-entre-internet-e-wi-fi", url: null, canonical: null, signals: sinais("k10", "diferença entre internet e wi-fi"), ...extra });
  const solta = termo("solta", "diferença entre internet e wi-fi em casa", { volume: 900 });
  const casos = [
    // A principal está no título e no slug: identidade, fica (dono, 17/10). SUBSTITUÍDO: "a solta assume" na Livre sem volume.
    { nome: "Livre sem volume de identidade", target: alvo(), principal: termo("dif", "diferença entre internet e wi-fi", { volume: null, volumeValidated: false, ownerId: "k10" }), espera: "dif" },
    { nome: "Livre sem volume fora da identidade", target: alvo(), principal: termo("dif", "roteador antigo em casa", { volume: null, volumeValidated: false, ownerId: "k10" }), espera: "solta" },
    { nome: "Livre com volume", target: alvo({ declaredPrincipalId: "dif" }), principal: termo("dif", "diferença entre internet e wi-fi", { volume: 30, ownerId: "k10" }), espera: "dif" },
    { nome: "Travada", target: alvo({ declaredPrincipalId: "dif" }), principal: termo("dif", "diferença entre internet e wi-fi", { volume: null, volumeValidated: false, ownerId: "k10" }), espera: "dif" },
  ];
  for (const caso of casos) {
    const [proposta] = planArticleImprovements({ targets: [caso.target], keywords: [caso.principal, solta], evidence: [prova("k10", "solta"), prova("k10", "dif")] });
    assert.equal(proposta.principalId, caso.espera, caso.nome);
    assert.ok(proposta.memberIds.includes("solta"), `${caso.nome}: a solta reforça o artigo`);
  }
  // O servidor monta `declaredPrincipalId` para a Travada e para a Livre COM volume (livreComVolume, arquiteto-article-improvement.ts:274) — ver C10 no servidor.
});

/* ======================================================================= */
/* C11 · trava e volume nas linhas do plano ("Procurar outra principal")    */
/* ======================================================================= */

test("C11 · linhas do plano Travada sem volume, Livre com volume 10 e Livre sem volume: só a 3ª oferece a troca; as outras recusam com o motivo", () => {
  const apoio = (id: string, keyword: string, volume: number, de: string) => ({ ...linhaDaMesa({ id, keyword, brandId: MARCA_WIFI, semantic: { ...VOLUME_VALIDADO, subject_discovery: { version: 1, searches: [], subjectKeywordIds: [de] } } }), territoryRef: TERRITORIO_AZUL, volume_search: volume, volume_source: "google_ads" });
  const linhaDoPlano = (id: string, keyword: string, ordem: number, opcoes: { lock?: "locked" | "free"; volume?: number }) => {
    const semantico = { dna_origem: "logico_deterministico", ...(opcoes.volume ? VOLUME_VALIDADO : {}), keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, entry: { title: keyword, source: "cadastro" }, plan: { groupId: AZUL, planVersion: 4, order: ordem, role: "Suporte", scope: escopoDo(ordem), declaredPrincipal: { keywordId: id, phrase: keyword }, ...(opcoes.lock ? { lock: opcoes.lock } : {}) } }, keyword_subject_actor: ATOR, keyword_subject_at: "2026-10-13T10:00:00+00:00", keyword_subject_origin: "import", keyword_declared_principal: { subjectKeywordId: id, groupId: AZUL, planVersion: 4 } };
    return { ...linhaDaMesa({ id, keyword, brandId: MARCA_WIFI, semantic: semantico }), territoryRef: TERRITORIO_AZUL, ...(opcoes.volume ? { volume_search: opcoes.volume, volume_source: "google_ads" } : {}) };
  };
  const travada = linhaDoPlano("t1", "roteador wi-fi 6", 20, { lock: "locked" });
  const livreCom10 = linhaDoPlano("t2", "internet para home office", 21, { volume: 10 });
  const livreSem = linhaDoPlano("t3", "diferença entre internet e wi-fi", 22, {});
  const mesa = [travada, livreCom10, livreSem, apoio("s1", "roteador wi-fi 6 vale a pena", 300, "t1"), apoio("s2", "melhor internet para home office", 300, "t2"), apoio("s3", "internet e wi-fi qual a diferença", 210, "t3")];
  const ler = (linha: typeof travada) => planPrincipalSwapCandidates({ brandId: MARCA_WIFI, subjectRow: linha, rows: mesa, currentPrincipalId: linha.id, now: AGORA });
  const t1 = ler(travada), t2 = ler(livreCom10), t3 = ler(livreSem);
  assert.equal(t1.ok, false);
  assert.match(!t1.ok ? t1.reason : "", new RegExp(`^${PLAN_SHEET_LOCKED_SEAL} \\(`), "Travada: recusa com o selo e o porquê");
  assert.equal(t2.ok, false);
  assert.match(!t2.ok ? t2.reason : "", /Volume definido no DNA.*a principal fica, mesmo com volume baixo/, "Livre com volume 10: volume definido fixa");
  assert.ok(t3.ok);
  assert.deepEqual(t3.ok && t3.candidates.map(item => item.keywordId), ["s3"], "Livre sem volume: oferece a sustentação com volume");
});

/* ======================================================================= */
/* C12 · formato do serpAssessmentRef no portão do Radar                    */
/* ======================================================================= */

test("C12 · serpAssessmentRef: `${id}:${formationBaseHash}` (gravadores vivos) é reconhecido; `${id}:v1` devolve null e a mesa decide", () => {
  const registro: ApprovedSerpRecord = { candidateRef: "cand:a", payload: { formationBaseHash: "serpbase:abc", verdict: "COMPATIBLE", assessment: { id: "assessment:a", keywordDnaReferences: [{ keywordId: "k1" }, { keywordId: "k2" }], recommendations: [{ keywordId: "k1", currentRole: "principal" }, { keywordId: "k2", currentRole: "secundaria" }] }, interpretation: { lenses: { requested: [...LENTES], observed: [...LENTES], missing: [] } }, humanResolution: { formationBaseHash: "serpbase:abc" } } };
  const dna = (versionId: string) => ({ serpAssessmentRef: { versionId }, principalKeywordId: "k1", keywordReferences: [{ keywordId: "k1", role: "principal" }, { keywordId: "k2", role: "secundaria" }] });
  assert.equal(resolveApprovedArticleSerpGate({ articleId: "a", dna: dna("assessment:a:serpbase:abc"), records: [registro] })?.state, "current_supported");
  assert.equal(resolveApprovedArticleSerpGate({ articleId: "a", dna: dna("assessment:a:v1"), records: [registro] }), null, "o formato `:v` (código morto, ws:7761 e ws:4844) não é recusa: o portão da mesa decide");
  // Os gravadores vivos escrevem o formato que o portão reconhece.
  const tela = codigoSemComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /versionId: `\$\{registro\.assessment\.id\}:\$\{registro\.formationBaseHash\}`/, "ws: canonicalSerpReferenceFor");
  assert.match(codigoSemComentarios("lib/server/arquiteto-article-improvement.ts"), /versionId: `\$\{assessment\.payload\.assessment\.id\}:\$\{assessment\.payload\.formationBaseHash\}`/, "melhoria: applyTarget");
  // Para o dono (não roda aqui): SELECT de leitura que conta os DNA gravados com `:v`.
  //   select count(*) from editorial_artifact_versions
  //   where artifact_type = 'article_dna' and payload->'serpAssessmentRef'->>'versionId' ~ ':v[0-9]+$';
});

/* ======================================================================= */
/* C13 · MCP × tela (a parte pura: validate_silo_plan × cadastro)          */
/* ======================================================================= */

test("C13 · plano de 3 artigos: HOJE validate_silo_plan (MCP) BLOQUEIA e o cadastro do Minerador só AVISA — muda na F7: a régua do cadastro (aviso)", () => {
  const plano = { siloName: "Internet residencial", siloPage: { keyword: "internet residencial" }, articles: [
    { subject: "Internet fibra óptica: o que é", targetKeyword: "internet fibra óptica", role: "Pilar" as const, funnel: "TOFU" as const, intent: "informacional" as const },
    { subject: "Wi-Fi lento: causas e como resolver", targetKeyword: "wi-fi lento", role: "Suporte" as const, funnel: "TOFU" as const, intent: "informacional" as const },
    { subject: "Teste de velocidade da internet", targetKeyword: "teste de velocidade da internet", role: "Suporte" as const, funnel: "MOFU" as const, intent: "informacional" as const },
  ] };
  const mcp = validateSiloPlan(plano, { publishedPaths: [], existingArticleSlugs: [], existingSiloPageSlugs: [], existingArticleTopics: [] });
  assert.equal(SILO_ARTICLE_RANGE.min, 4);
  assert.equal(mcp.ok, false, "HOJE: o MCP bloqueia 3 artigos — muda na F7");
  assert.ok(mcp.issues.some(issue => issue.severity === "block" && issue.field === "articles"));
  const cadastro = parseDeclaredPlanText(["Nome: Internet residencial", "Slug: internet-residencial", "1. Internet fibra óptica: o que é", "Artigo pilar • Palavra-chave: internet fibra óptica", "Explica a fibra.", "2. Wi-Fi lento: causas", "Palavra-chave: wi-fi lento", "Causas.", "3. Teste de velocidade", "Palavra-chave: teste de velocidade da internet", "Como testar."].join("\n"));
  assert.equal(DECLARED_PLAN_ARTICLES_MIN_FOR_SILO, 4);
  assert.deepEqual(cadastro.refusals, [], "o cadastro aceita 3 artigos");
  assert.ok(cadastro.notices.some(aviso => /3 artigo\(s\): o Silo pede de 4/.test(aviso)), "e só avisa");
  // As ferramentas do MCP chamam os MESMOS núcleos da tela (o hash da prévia sai igual): melhoria e reforço.
  const mcpTools = codigoSemComentarios("lib/server/platform-mcp-tools.ts");
  assert.match(mcpTools, /const outcome = await handleArticleImprovement\(improvementRuntime\(context\), ArticleImprovementRequestSchema\.parse\(\{ \.\.\.request, brandId: access\.brandId \}\)\);/);
  // HOJE: plan_published_differentiation monta o corpo à mão (sem DifferentiationPlanRequestSchema: sem resume/replaceEvaluation) — muda na F7.
  assert.match(mcpTools, /handleDifferentiationPlan\(\{ store: context, now: \(\) => new Date\(\) \}, \{ brandId: access\.brandId, groupId: previa \? groupId : undefined, ai: false \}\)/);
});

/* ======================================================================= */
/* C14 · a forma da linha (estende tests/arquiteto-linha-de-processo-guarda) */
/* ======================================================================= */

/* ======================================================================= */
/* C16 · slug declarado no plano do Minerador (2026-10-16)                  */
/* ======================================================================= */

test("C16 · slug declarado no plano do Minerador: o candidato NOVO do Assunto nasce com ele e o ArticleDNA o grava como suggestedSlug; sem slug declarado, o de sempre (pela principal)", () => {
  const territorio = "territory:7c1e0000-0000-4000-8000-0000000000b1";
  const sem = { entidade_central: "planos de internet", intencao_principal: "Comercial", dna_origem: "logico_deterministico" };
  const mesa: Linha[] = ([["k1", "como escolher plano de internet residencial", 320], ["k2", "melhor plano de internet residencial", 210]] as const)
    .map(([id, keyword, volume]) => ({ ...linhaDaMesa({ id, keyword, brandId: MARCA_SEM_PLANO, semantic: { ...sem, ...VOLUME_VALIDADO } }), territoryRef: territorio, volume_search: volume, volume_source: "google_ads" }));
  const formar = (slugs?: ReadonlyMap<string, string>) => {
    const inicial = buildArticleFormationUniverse({ siloRef: territorio, siloLabel: "Planos e contratação", siloSlug: "planos-de-internet", keywords: mesa.map(linha => entradaDaFormacao(linha)) });
    const ref = inicial.candidates.find(candidato => candidato.principalKeywordId === "k1")!.candidateRef;
    return buildArticleFormationUniverse({ siloRef: territorio, siloLabel: "Planos e contratação", siloSlug: "planos-de-internet", keywords: mesa.map(linha => entradaDaFormacao(linha)), subjectByCandidateRef: new Map([[ref, "k1"]]), ...(slugs ? { declaredSlugBySubjectKeywordId: slugs } : {}) })
      .candidates.find(candidato => candidato.candidateRef === ref)!;
  };
  const semSlug = formar();
  const comSlug = formar(new Map([["k1", "como-escolher-plano-internet-residencial"]]));
  assert.equal(comSlug.suggestedSlug, "como-escolher-plano-internet-residencial", "o candidato do artigo do plano nasce com o slug declarado");
  assert.notEqual(semSlug.suggestedSlug, "como-escolher-plano-internet-residencial", "sem slug declarado, o slug sai da principal");
  const dna = deterministicArticleDnaPayload(grupoDoCandidato(comSlug, mesa, { declaredPlan: { role: "Pilar", scope: "Escolha de plano: cobertura e custo.", slug: "como-escolher-plano-internet-residencial" } }), MARCA_SEM_PLANO);
  const relido = ArticleDNASchema.parse(JSON.parse(JSON.stringify(dna)));
  assert.equal(relido.suggestedSlug, "como-escolher-plano-internet-residencial");
  assert.equal(relido.hierarchy, "Pilar");
  assert.equal(relido.promise, "Escolha de plano: cobertura e custo.");
  const dnaSemSlug = deterministicArticleDnaPayload(grupoDoCandidato(semSlug, mesa, { declaredPlan: { role: "Pilar", scope: "Escolha de plano: cobertura e custo." } }), MARCA_SEM_PLANO);
  assert.notEqual(dnaSemSlug.suggestedSlug, "como-escolher-plano-internet-residencial", "plano sem slug: o ArticleDNA de sempre");
  assert.equal(chamadasDeRede, 0);
});

/* ======================================================================= */
/* C17 · grupo amarelo com 4 Livres sem número de buscas (inclui o Pilar)  */
/*       e outro grupo (azul) na mesma marca — teste do dono, 16/10 noite   */
/* ======================================================================= */

/*
 * WifiConecta, `?grupo=amarelo&area=articles` (SELECT de 16/10, só leitura):
 * plano "Planos e contratação" de 8 artigos (o grupo está no plano v3; as 4
 * Livres entraram na v2, as 4 Travadas na v3). As 4 Travadas com volume já
 * formaram (ArticleDNA v1); as 4 Livres foram MEDIDAS no Google Ads e ele não
 * tem número de buscas para elas (a resposta "sem média"). O azul (7 artigos)
 * está na mesma marca. Conclusões esperadas (AGENTS.md §0.3):
 *  1. a frase da linha Livre medida sem número de buscas NÃO diz "meça no
 *     Minerador": diz "Procurar outra principal" ou "Buscar sustentação"
 *     (grátis); a nunca medida continua "meça"; a Travada sem número de
 *     buscas só busca sustentação;
 *  2. o recorte da cor fora da tabela conta só o amarelo;
 *  3. "Papel no Silo" e "Definição do artigo" da linha do plano leem o plano;
 *  4. a análise da arquitetura: cada artigo do plano é a sua leitura (15 = 15);
 *  5. o marcador nascido pela linha do plano (`serpbase:`) não deixa a
 *     formação "desatualizada" para sempre;
 *  6. o Silo do plano Confirmado e visível não "fica de fora" de nada; os
 *     textos que o dono mandou tirar do painel não voltam (a guarda da forma).
 */
const AMARELO = "aaaa0000-0000-4000-8000-00000000a203";
const TERRITORIO_AMARELO = "territory:2318febb-f4c7-4036-ac8c-b7416be0de3c";
const GRUPOS_COM_AMARELO: Record<string, { color: string; name: string; planVersion?: number }> = { ...GRUPOS_WIFI, [AMARELO]: { color: "amarelo", name: "Planos e contratação", planVersion: 3 } };
/** A resposta do Google Ads sem número de buscas (medida em 15/10: menos de 30 dias). */
const SEM_BUSCAS = { volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: "2026-10-15T12:00:00+00:00", averageMonthlySearches: null } };
/** [id, keyword, ordem, papel, volume | null] — null = medida sem número de buscas (Livre). */
const AMARELO_REAL: Array<[string, string, number, "Pilar" | "Suporte", number | null]> = [
  ["a1", "como escolher plano de internet residencial", 1, "Pilar", null],
  ["a2", "internet residencial barata", 2, "Suporte", 1600],
  ["a3", "claro vivo ou tim internet residencial", 3, "Suporte", null],
  ["a4", "internet no meu cep", 4, "Suporte", 720],
  ["a5", "quantos mega de internet preciso", 5, "Suporte", null],
  ["a6", "combo internet e celular", 6, "Suporte", 720],
  ["a7", "combo internet tv streaming", 7, "Suporte", null],
  ["a8", "instalação de internet residencial", 8, "Suporte", 170],
];
function mesaAmarela(extra: { travadaSemBuscas?: boolean } = {}): Linha[] {
  return AMARELO_REAL.map(([id, keyword, ordem, papel, volume]) => {
    const base = cadastro(id, keyword, keyword, ordem, papel, AMARELO, volume !== null ? VOLUME_VALIDADO : SEM_BUSCAS);
    const assunto = base.keyword_subject as Record<string, unknown>;
    const plano = { ...(assunto.plan as Record<string, unknown>), planVersion: volume !== null ? 3 : 2, ...(extra.travadaSemBuscas && id === "a3" ? { lock: "locked" } : {}) };
    return { ...linhaDaMesa({ id, keyword, brandId: MARCA_WIFI, semantic: { ...base, keyword_subject: { ...assunto, plan: plano } } }), territoryRef: TERRITORIO_AMARELO, ...(volume !== null ? { volume_search: volume, volume_source: "google_ads" } : {}) } as Linha;
  });
}
const grupoDaKeywordWifi = (id: string) => id.startsWith("a") ? AMARELO : grupoDaKeywordAzul(id);
const FILTRO_AMARELO = { kind: "groups" as const, color: "amarelo" as const, groupIds: [AMARELO] };
/** Os 4 artigos já formados do amarelo (as Travadas com volume), como a mesa os lê. */
const FORMADOS_AMARELO = ["a2", "a4", "a6", "a8"].map(id => ({ articleId: `art-${id}`, versionNumber: 1, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id] }));

test("C17 · amarelo com 4 Livres medidas sem número de buscas (o Pilar entre elas) e o azul na marca: a frase certa por estado, o recorte da cor, o Papel e a Definição do plano, uma leitura por artigo, o marcador do plano não envelhece, nada de 'fica de fora' nem dos textos que saíram", () => {
  const mesa = [...(mesaAzul() as Linha[]), ...mesaAmarela()];
  const linhas = buildPlanSheetRows({ brandId: MARCA_WIFI, keywords: mesa, groupOf: id => GRUPOS_COM_AMARELO[id] ?? null, keywordGroupOf: grupoDaKeywordWifi, articles: FORMADOS_AMARELO, radarArticleIds: new Set(), serp: null, filter: FILTRO_AMARELO, now: AGORA });

  // 2 · a tabela já recortava: só as 8 do amarelo, na ordem do plano, na versão do GRUPO (v3).
  assert.deepEqual(linhas.map(linha => linha.keywordId), ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]);
  assert.ok(linhas.every(linha => linha.planVersion === 3), "a versão do grupo, não a da keyword (2/3)");
  const livres = linhas.filter(linha => linha.volume.state === "no_average");
  assert.deepEqual(livres.map(linha => [linha.keywordId, linha.lock.state]), [["a1", "free"], ["a3", "free"], ["a5", "free"], ["a7", "free"]], "as 4 Livres foram medidas: 'sem número de buscas', nunca 'sem volume medido'");
  assert.match(livres[0].volume.label, /^Google Ads sem número de buscas \(zero ou poucas\) \(medido em 15\/10\/2026\)$/);
  assert.equal(planRowSeals(livres[0]).find(selo => selo.kind === "volume")?.label, "Sem buscas", "linguagem simples no selo");
  assert.doesNotMatch(livres[0].lock.why, /Sem volume medido/);

  // 1 · CONCLUIR FORMAÇÃO (a prévia por linha, da execução preparada): a Livre medida nunca ouve "meça no Minerador".
  // 2026-10-17 (noite) · SUBSTITUÍDO "as 4 formadas ficam fora (o reforço é do 'Melhorar publicados…')": o Concluir leva as 8 — o reforço dos formados vira a versão seguinte na mesma confirmação.
  const doGrupo = planSheetFormationSelection(linhas, "concludeFormation");
  assert.deepEqual(doGrupo.byGroup.get(AMARELO)?.map(linha => linha.keywordId), ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"], "as 8 do plano, formadas ou não");
  const naoSustenta = (id: string) => ({ targetId: id, status: "insufficient_evidence" as const, reasons: ["Assunto declarado mantido como fundamento do artigo."], principalId: id, currentPrimaryId: id, memberIds: [id], needsValidation: false });
  const previa = planSheetPreviewLines({ proposals: livres.map(linha => naoSustenta(linha.keywordId)) }, livres);
  /*
   * 2026-10-17 (noite) · T12 NO CONCLUIR (o dono viu "use Procurar outra principal" nos 4 Livres do amarelo): as 4 são a
   * principal de IDENTIDADE (no título do Assunto): ouvem a frase dela — fica; o reforço e a SERP vêm do "Processar
   * artigos". SUBSTITUI a frase (b) para a identidade; a (b) vale para a Livre fora da identidade.
   */
  assert.ok(livres.every(linha => linha.identityPrincipal === true), "as 4 Livres são a principal de identidade");
  assert.deepEqual(previa.map(linha => [linha.kind, linha.sentence]), livres.map(() => ["refused", PLAN_IDENTITY_NO_VOLUME_SENTENCE]), "a frase da identidade, igual para as 4 — o Pilar incluído");
  assert.ok(previa.every(linha => !/meça no Minerador|não tem volume medido|Procurar outra principal/.test(linha.sentence)));
  const FRASE_B = "O Google Ads não tem número de buscas para esta keyword (zero ou poucas buscas). Como ela é Livre, use “Procurar outra principal” ou traga sustentações com volume (Minerador → perfil da keyword → “Buscar sustentação”, grátis).";
  assert.equal(planSheetPreviewLines({ proposals: [naoSustenta("a1")] }, [{ ...livres[0], identityPrincipal: undefined }])[0].sentence, FRASE_B, "fora da identidade, a frase (b)");
  assert.ok(FRASE_B.startsWith(PLAN_NO_SEARCHES_SENTENCE) && FRASE_B.includes(PLAN_SUPPORT_SEARCH_PATH));
  /*
   * VALIDAR SERP ("Processar artigos" nas linhas do plano). 2026-10-17 · A RÉGUA
   * ÚNICA DA COLETA (dono: "implementa a sua recomendação"): as 4 Livres sem
   * buscas são a principal de IDENTIDADE (a frase do título do Assunto) — a SERP
   * delas é coletada, com o propósito e o custo ditos. SUBSTITUI "recusa com o
   * caminho" para a principal de identidade; a sem volume fora da identidade
   * continua recusada com o caminho, sem "meça" (abaixo).
   */
  const serp = planSheetSerpSelection(linhas);
  assert.deepEqual(serp.refused, []);
  const deIdentidade = serp.toPlan.filter(row => row.identityPrincipal);
  assert.deepEqual(deIdentidade.map(row => row.keywordId), ["a1", "a3", "a5", "a7"]);
  assert.deepEqual(deIdentidade.map(planSheetSerpPlanLine), deIdentidade.map(row => `SERP da principal de identidade “${row.keyword}” (sem buscas no Google Ads): 4 consultas, até US$ 0,014 — para ver o que o Google mostra para a frase do artigo.`));
  // A Livre sem buscas FORA da identidade (a frase não está no título nem no slug): recusada com o caminho, sem "meça".
  const foraDaIdentidade = buildPlanSheetRows({ brandId: MARCA_WIFI, keywords: [...(mesaAzul() as Linha[]), ...mesaAmarela().map(linha => linha.id === "a3" ? { ...linha, ...linhaDaMesa({ id: "a3", keyword: "claro vivo ou tim internet residencial", brandId: MARCA_WIFI, semantic: { ...cadastro("a3", "claro vivo ou tim internet residencial", "Qual operadora atende a sua rua", 3, "Suporte", AMARELO, SEM_BUSCAS) } }), territoryRef: TERRITORIO_AMARELO } : linha)], groupOf: id => GRUPOS_COM_AMARELO[id] ?? null, keywordGroupOf: grupoDaKeywordWifi, articles: FORMADOS_AMARELO, radarArticleIds: new Set(), serp: null, filter: FILTRO_AMARELO, now: AGORA });
  const recusadas = planSheetSerpSelection(foraDaIdentidade).refused;
  assert.deepEqual(recusadas.map(item => item.keywordId), ["a3"]);
  assert.ok(recusadas.every(item => item.reason.startsWith(`${PLAN_NO_SEARCHES_SENTENCE}: a SERP não é coletada para keyword sem volume que não é a principal de identidade do artigo`) && item.reason.includes("Procurar outra principal") && !/meça no Minerador/.test(item.reason)));
  // O alerta da linha (o porquê inteiro no title): a principal de identidade fica (2026-10-17, noite); fora da identidade, "livre, pode trocar".
  assert.equal(planRowAlerts(livres[0]).find(alerta => alerta.kind === "no_volume")?.label, "sem número de buscas — identidade, fica");
  assert.equal(planRowAlerts({ ...livres[0], identityPrincipal: undefined }).find(alerta => alerta.kind === "no_volume")?.label, "sem número de buscas — livre, pode trocar");
  // (a) a NUNCA medida (azul, "diferença entre internet e Wi-Fi", Livre) continua "meça no Minerador (Volume)".
  const azul = buildPlanSheetRows({ brandId: MARCA_WIFI, keywords: mesa, groupOf: id => GRUPOS_COM_AMARELO[id] ?? null, keywordGroupOf: grupoDaKeywordWifi, articles: [], radarArticleIds: new Set(), serp: null, filter: { kind: "groups", color: "azul", groupIds: [AZUL] }, now: AGORA });
  const nuncaMedida = azul.find(linha => linha.keywordId === "k10")!;
  assert.equal(nuncaMedida.volume.state, "missing");
  assert.match(planSheetPreviewLines({ proposals: [naoSustenta("k10")] }, [nuncaMedida])[0].sentence, /meça no Minerador \(Volume\)/);
  // 2026-10-17 · ela é a principal de identidade (no título do Assunto): a SERP dela vai ao custo, dita "sem volume medido".
  assert.equal(planSheetSerpPlanLine(planSheetSerpSelection([nuncaMedida]).toPlan[0]), `SERP da principal de identidade “${nuncaMedida.keyword}” (sem volume medido): 4 consultas, até US$ 0,014 — para ver o que o Google mostra para a frase do artigo.`);
  // (c) a TRAVADA medida sem número de buscas: só as sustentações (sem "Procurar outra principal", sem "meça").
  const travada = buildPlanSheetRows({ brandId: MARCA_WIFI, keywords: [...(mesaAzul() as Linha[]), ...mesaAmarela({ travadaSemBuscas: true })], groupOf: id => GRUPOS_COM_AMARELO[id] ?? null, keywordGroupOf: grupoDaKeywordWifi, articles: FORMADOS_AMARELO, radarArticleIds: new Set(), serp: null, filter: FILTRO_AMARELO, now: AGORA }).find(linha => linha.keywordId === "a3")!;
  assert.equal(travada.lock.state, "locked");
  assert.equal(planSheetPreviewLines({ proposals: [naoSustenta("a3")] }, [travada])[0].sentence, `${PLAN_NO_SEARCHES_SENTENCE}. Como ela é Travada, a principal fica: traga sustentações com volume (${PLAN_SUPPORT_SEARCH_PATH}).`);

  // 3 · "Papel no Silo" e "Definição do artigo" da linha do plano (candidato e artigo da mesa): o plano, com o porquê curto.
  assert.equal(planRowRoleLabel(linhas[0]), "Pilar · 1º");
  assert.equal(planRowRoleLabel(linhas[6]), "Suporte · 7º");
  assert.deepEqual(linhas.map(linha => planRowDefinition(linha).label), ["Aguardando formação", "Formado · v1", "Aguardando formação", "Formado · v1", "Aguardando formação", "Formado · v1", "Aguardando formação", "Formado · v1"], "nunca 'Pendente' sem explicação para a linha do plano");
  assert.equal(planRowDefinition(linhas[0]).reason, "identidade, fica · “Processar artigos”");
  assert.equal(planRowDefinition(linhas[0]).title, PLAN_IDENTITY_NO_VOLUME_SENTENCE);
  assert.equal(planRowDefinition({ ...linhas[0], identityPrincipal: undefined }).reason, "sem número de buscas · Livre: “Procurar outra principal” ou sustentação");
  assert.equal(planRowDefinition(linhas[1]).reason, null);
  // Na tabela de sempre: o artigo da mesa que é do plano lê as MESMAS funções (a linha do plano sem artigo também).
  const mesaDaTela = codigoSemComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(mesaDaTela, /const linhaDoPlanoDaLinha = articleMode \? planRowOfArticle\(art\) : null;/);
  assert.match(mesaDaTela, /if \(linhaDoPlanoDaLinha\) return <span data-testid="architect-silo-role-cell"[^>]*>\{planRowRoleLabel\(linhaDoPlanoDaLinha\)\}<\/span>;/);
  assert.match(mesaDaTela, /\{definicaoDoPlano \? <PlanRowDefinitionCell definition=\{definicaoDoPlano\} \/> : articleDnaVersion \?/);
  assert.match(codigoSemComentarios("modules/arquiteto/plan-article-sheet.tsx"), /case "articleDefinition":\s*return <td key=\{columnId\} className="border-r border-divider px-2 py-2 text-center"><PlanRowDefinitionCell definition=\{planRowDefinition\(row\)\} \/><\/td>;/);

  // 2 · O RECORTE DA COR fora da tabela: a keyword e o candidato do amarelo dentro; os do azul fora; sem cor, tudo.
  const posicoes = readArchitectSubjectStandings(mesa);
  const grupos = new Map(mesa.map(linha => [linha.id, grupoDaKeywordWifi(linha.id)] as const));
  const recorte = editorialGroupCut({ brandId: MARCA_WIFI, filter: FILTRO_AMARELO, keywordGroupById: grupos, standings: posicoes });
  assert.equal(recorte.all, false);
  assert.deepEqual(mesa.filter(linha => recorte.keyword(linha.id)).map(linha => linha.id), AMARELO_REAL.map(([id]) => id));
  assert.equal(recorte.article({ subjectKeywordId: "k9", principalKeywordId: "k9", keywordIds: ["k9"] }), false);
  assert.equal(recorte.article({ subjectKeywordId: "a1", principalKeywordId: "s-sem-grupo", keywordIds: ["s-sem-grupo"] }), true, "o artigo do plano entra pelo grupo do plano do Assunto");
  // Etiqueta perdida: o artigo do plano continua no recorte pelo plano (o caso "jogos online").
  const semEtiqueta = editorialGroupCut({ brandId: MARCA_WIFI, filter: FILTRO_AMARELO, keywordGroupById: new Map(), standings: posicoes });
  assert.equal(semEtiqueta.keyword("a7"), true);
  assert.equal(editorialGroupCut({ brandId: MARCA_WIFI, filter: { kind: "all" }, keywordGroupById: grupos, standings: posicoes }).all, true, "sem cor: a marca inteira, como hoje");
  // O painel conta o recorte (a formação e o hash seguem lendo os universos inteiros).
  const universo = (siloRef: string, label: string, ids: readonly string[]) => buildArticleFormationUniverse({ siloRef, siloLabel: label, siloSlug: slugOf(label), keywords: mesa.filter(linha => ids.includes(linha.id)).map(linha => entradaDaFormacao(linha)) });
  const universos = [universo(TERRITORIO_AZUL, "Wi-Fi e fibra óptica", LINHAS_AZUL.map(linha => linha.id)), universo(TERRITORIO_AMARELO, "Planos e contratação", AMARELO_REAL.map(([id]) => id))];
  const noRecorte = cutArticleFormationUniverses(universos, { candidate: candidato => recorte.article({ subjectKeywordId: candidato.subjectKeywordId ?? null, principalKeywordId: candidato.principalKeywordId, keywordIds: candidato.keywords.map(item => item.keywordId) }), keyword: recorte.keyword });
  assert.deepEqual(noRecorte.map(item => item.siloRef), [TERRITORIO_AMARELO], "o universo do azul sai do recorte do amarelo");
  const todos = summarizeArticleFormation(universos), doAmarelo = summarizeArticleFormation(noRecorte);
  assert.equal(doAmarelo.keywords, 8);
  assert.equal(doAmarelo.candidates, summarizeArticleFormation([universos[1]]).candidates);
  assert.ok(todos.candidates > doAmarelo.candidates && todos.keywords === 15, "a marca inteira continua 15 (azul + amarelo)");

  // 4 · ANÁLISE DA ARQUITETURA: o léxico juntou "internet residencial barata" + "internet no meu cep" (posições 2 e 4) e
  // "combo internet tv streaming" (amarelo, 7) + "internet para streaming" (azul, 12). Cada artigo do plano é a sua leitura.
  const SEM = { value: 0, reasons: ["r"] };
  const grupo = (ref: string, ids: string[]): ClusterAnalysis => ({ clusterRef: ref, label: ids[0], memberKeywordIds: ids, headKeywordId: ids[0], ambiguousHeadKeywordIds: [], destination: "insufficient_depth", suggestedTerritoryRef: null, suggestedTerritoryLabel: null, alternativeTerritoryRefs: [], scores: { coherence: SEM, siloFit: SEM, depth: SEM, publishedEvidence: SEM }, confidence: "baixa", reason: "O grupo não tem profundidade para um silo próprio neste lote; segue para a formação de artigos." });
  const juntos = [["a2", "a4"], ["a7", "k12"]];
  const sozinhos = [...AMARELO_REAL.map(([id]) => id), ...LINHAS_AZUL.map(linha => linha.id)].filter(id => !juntos.flat().includes(id));
  const lexico: ArchitectureAnalysis = { clusters: [...juntos.map((ids, indice) => grupo(`c-junto-${indice}`, ids)), ...sozinhos.map(id => grupo(`c-${id}`, [id]))], summary: { keywords: 15, clusters: 2 + sozinhos.length, strengthening: 0, newSilos: 0, insufficient: 2 + sozinhos.length, ambiguous: 0, confidence: "baixa" }, narrative: [], baseHash: "arch:wifi" };
  assert.equal(lexico.summary.clusters, 13, "15 keywords em 13 grupos léxicos");
  const nomeDo = new Map(mesa.map(linha => [linha.id, linha.keyword] as const));
  const planoDe = (id: string) => { const posicao = posicoes.get(id); if (!posicao?.plan) return null; return { siloName: posicao.plan.groupId === AMARELO ? "Planos e contratação" : PLANO_AZUL.siloName, role: posicao.plan.role, order: posicao.plan.order }; };
  const leitura = withDeclaredPlanReading(lexico, planoDe, id => nomeDo.get(id) ?? null);
  assert.deepEqual([leitura.summary.declaredPlan, leitura.summary.insufficient, leitura.summary.clusters], [15, 0, 15], "15 seguem o plano, nenhuma 'sem profundidade'");
  assert.ok(leitura.clusters.every(item => item.memberKeywordIds.length === 1 && item.declaredPlan), "uma leitura por artigo do plano");
  const dizDe = (id: string) => leitura.clusters.find(item => item.memberKeywordIds[0] === id)!;
  assert.equal(dizDe("a2").reason, "Segue o plano do Silo “Planos e contratação” (Suporte, posição 2).");
  assert.equal(dizDe("a4").reason, "Segue o plano do Silo “Planos e contratação” (Suporte, posição 4).");
  assert.equal(dizDe("a4").label, "internet no meu cep");
  assert.equal(dizDe("a7").reason, "Segue o plano do Silo “Planos e contratação” (Suporte, posição 7).", "combo internet tv streaming: o grupo com o azul não a tira do plano");
  assert.equal(dizDe("k12").reason, "Segue o plano do Silo “Wi-Fi e fibra óptica” (Suporte, posição 12).");
  assert.ok(leitura.narrative.every(linha => !/não tem profundidade/.test(linha)));
  assert.equal(leitura.baseHash, lexico.baseHash, "só leitura: a base da análise não muda");

  // 5 · O MARCADOR NASCIDO PELA LINHA DO PLANO (WifiConecta, SELECT de 16/10: baseHash "serpbase:85ffd702b788a0e8") não envelhece;
  // o de "Processar artigos" (artbase) envelhece quando o lote muda.
  const baseDoLote = articleFormationBaseHash({ siloRefs: universos.map(item => item.siloRef), keywordIds: universos.flatMap(item => item.keywordIds), publishedArticlePaths: [] });
  assert.ok(baseDoLote.startsWith(ARTICLE_FORMATION_LOT_BASE_PREFIX), "o prefixo da base do lote é o que o marcador reconhece");
  assert.equal(articleFormationMarkerIsStale({ storedBaseHash: "serpbase:85ffd702b788a0e8", currentBaseHash: baseDoLote }), false, "nunca mais 'Formação desatualizada' para sempre");
  assert.equal(articleFormationMarkerIsStale({ storedBaseHash: baseDoLote, currentBaseHash: baseDoLote }), false);
  assert.equal(articleFormationMarkerIsStale({ storedBaseHash: "artbase:0000000000000000", currentBaseHash: baseDoLote }), true);

  // 6 · Silos: a frase do lote de desfazer só acompanha o botão e diz a verdade; o painel sem os textos que saíram (guarda da forma).
  const linhasDeSilo = codigoSemComentarios("modules/arquiteto/territorial-workspace-rows.tsx");
  assert.match(linhasDeSilo, /\{undoAll && undoAll\.count > 0 && undoAll\.excludedNote && \(/);
  const tela = codigoSemComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /o Silo do plano segue o cadastro do Minerador/);
  assert.doesNotMatch(tela, /fica\$\{siloUndoPlanExcluded\.length === 1 \? "" : "m"\} de fora/);
  const painel = codigoSemComentarios("modules/arquiteto/article-formation-panel.tsx");
  for (const saiu of ["Formação desatualizada", "Assunto(s) aguardando sustentação", "foram confrontados com a SERP", "artigo(s) confirmado(s)"]) assert.ok(!painel.includes(saiu), saiu);
  assert.equal(chamadasDeRede, 0, "0 chamada paga, 0 rede");
});

test("C14 · forma da linha: cada botão da linha existe uma vez; nenhuma rota nova do Arquiteto; HOJE há gravador de article_dna 'approved' fora do núcleo — muda na F1", () => {
  const barra = codigoSemComentarios("modules/arquiteto/articles-formation-bar.tsx");
  for (const testId of ["architect-articles-top-process", "architect-articles-top-confirm", "architect-articles-improve-published"]) assert.equal(contar(barra, `data-testid="${testId}"`), 1, testId);
  const tela = codigoSemComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  assert.equal(contar(tela, "<ArticlesFormationBar"), 1);
  assert.equal(contar(tela, "<ArticleImprovementPanel"), 1);
  assert.equal(contar(tela, "<PlanSheetOperations"), 1);
  for (const rotulo of ["Processar arquitetura", "Confirmar propostas novas"]) assert.ok(tela.includes(rotulo), rotulo);
  // As rotas do Arquiteto, hoje: exatamente estas (rota nova = porta nova, AGENTS.md §0.1). A F7 tira as legadas sem chamador (silo-dna, silo-page, silos, silo-pair, article-dna).
  const rotas: string[] = [];
  const andar = (pasta: string) => { for (const nome of readdirSync(new URL(`../${pasta}`, import.meta.url))) { const caminho = `${pasta}/${nome}`; if (statSync(new URL(`../${caminho}`, import.meta.url)).isDirectory()) andar(caminho); else if (nome === "route.ts") rotas.push(caminho.replace(/^app\/api\/arquiteto\//, "").replace(/\/route\.ts$/, "")); } };
  andar("app/api/arquiteto");
  const ROTAS_DE_HOJE = ["architecture-marker", "article-allintitle", "article-dna", "article-formation-marker", "article-improvement", "artifacts", "backup/restore", "cannibalization/apply", "cannibalization/plan", "cannibalization/run", "handoff", "homologation-fresh", "import", "internal-link-graph", "internal-link-graph/anchors", "internal-link-graph/proposals", "internal-link-graph/working-copy", "keyword-serp", "plan-silo/recreate", "publication/verify", "published-reinforcement", "published-reinforcement/search/plan", "published-reinforcement/search/run", "serp", "serp-resolution", "serp-subject", "silo-article-withdrawal", "silo-consolidation", "silo-declared-plan", "silo-dna", "silo-page", "silo-pair", "silo-review", "silos", "subject-conversion", "territorial-ai", "territorial-serp", "workflow-status", "workspace", "workspace/delta"];
  assert.deepEqual([...rotas].sort(), [...ROTAS_DE_HOJE].sort(), "nenhuma rota nova nem sumida no Arquiteto (a fase que mudar a lista atualiza este cenário)");
  // HOJE (muda na F1): o núcleo appendArquitetoArtifact não confere 'approve' nem a revalidação; cada porta faz a sua.
  const persistencia = codigoSemComentarios("lib/server/arquiteto-persistence.ts");
  const nucleo = persistencia.slice(persistencia.indexOf("export async function appendArquitetoArtifact("), persistencia.indexOf("export async function appendArquitetoArtifact(") + 4000);
  assert.doesNotMatch(nucleo, /articleApprovalRevalidationIssues/, "HOJE a revalidação não está no núcleo — muda na F1");
  const aprovados = [
    ["app/api/arquiteto/published-reinforcement/route.ts", /appendArquitetoArtifact\(context, "article_dna", version, "approved"\)/],
    ["lib/server/arquiteto-article-improvement.ts", /appendArquitetoArtifact\(await runtime\.authorize\("arquiteto", "approve"\), "article_dna", version, "approved"\)/],
  ] as const;
  for (const [arquivo, padrao] of aprovados) assert.match(codigoSemComentarios(arquivo), padrao, `${arquivo}: grava article_dna aprovado`);
  // O reforço grava 'approved' com o contexto 'edit' (route.ts:39) — muda na F1 (permissão 'approve' no núcleo).
  assert.match(codigoSemComentarios("app/api/arquiteto/published-reinforcement/route.ts"), /action: aplicar \? "edit" : "view"/);
  // A diferenciação grava 'proposed' com 'edit' — muda na F5 (R2).
  const diferenciacao = codigoSemComentarios("app/api/arquiteto/cannibalization/apply/route.ts");
  assert.match(diferenciacao, /appendArquitetoArtifact\(context, "article_dna", version, "proposed"\)/);
  assert.match(diferenciacao, /module: "arquiteto", action: "edit"/);
});
