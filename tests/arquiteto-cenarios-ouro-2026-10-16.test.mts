import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import test from "node:test";

import { buildKeywordUniverse } from "../lib/arquiteto/keyword-universe.ts";
import { buildArchitectureAnalysis } from "../lib/arquiteto/architecture-analysis.ts";
import { buildArchitectureWorkingProposal, resolveKeywordDnaSignals } from "../lib/arquiteto/architecture-working-proposal.ts";
import { buildArticleFormationUniverse, type ArticleCandidate, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
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
import { buildPlanSheetRows, planArticleKeywordIds, planPrincipalSwapCandidates, planSheetFormationSelection, splitTableSelectionForPlan, PLAN_SHEET_LOCKED_SEAL } from "../lib/arquiteto/plan-article-sheet.ts";
import { attachSubjectToArticleDna, planSubjectAttachment, readArchitectSubjectStanding, readArchitectSubjectStandings, suggestSubjectSupport } from "../lib/arquiteto/declared-subject.ts";
import { planArticleImprovements, volumelessPrincipalSwap, type ImprovementEvidence, type ImprovementKeyword, type ImprovementTarget } from "../lib/arquiteto/article-improvement.ts";
import { buildSerpSubjectIndex } from "../lib/arquiteto/serp-subject-overlap.ts";
import { decidePublishedPrimarySwap, proposePublishedPrimarySwap } from "../lib/arquiteto/published-primary-swap.ts";
import { validateSiloPlan, SILO_ARTICLE_RANGE } from "../lib/agent/silo-plan.ts";
import { DECLARED_PLAN_ARTICLES_MIN_FOR_SILO, parseDeclaredPlanText } from "../lib/minerador/declared-plan.ts";
import { declarado, linhaDaMesa } from "./arquiteto-assunto-fixtures.mts";
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

test("C6 · Assunto sem plano com DNA, principal de volume 10, candidata de 500 na lista: HOJE a melhoria troca para a de 500 — muda na F4: fica (R1, volume definido)", () => {
  const alvo: ImprovementTarget = { id: "assunto", kind: "subject", theme: "Captação de pacientes para clínica", note: null, primaryId: "p10", post: "free", memberIds: ["p10"], territoryRef: "territory:t", slug: "captacao-de-pacientes-para-clinica", url: null, canonical: null, signals: sinais("assunto", "captação de pacientes para clínica") };
  const [proposta] = planArticleImprovements({ targets: [alvo], keywords: [termo("p10", "captação de pacientes para clínica", { volume: 10, ownerId: "assunto" }), termo("c500", "captação de pacientes clínica de estética", { volume: 500 })], evidence: [prova("assunto", "p10"), prova("assunto", "c500")] });
  assert.equal(proposta.status, "ready");
  assert.equal(proposta.currentPrimaryId, "p10");
  assert.equal(proposta.principalId, "c500", "HOJE: a regra própria do Assunto (needsPrimary, article-improvement.ts:399-401) troca a principal COM volume — muda na F4: R1 mantém p10");
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

test("C9 · publicado Livre com a principal SEM volume e uma keyword do artigo com volume e o núcleo do slug: a troca é proposta, a antiga fica secundária, decisão confirmada com ator e hora, identidade intacta (mesa: hoje grava 'proposed' pelo navegador — muda na F5)", () => {
  const indice = buildSerpSubjectIndex([pegada("pub", "como captar clientes para clínica de estética", "captar"), pegada("nova", "como captar clientes clínica de estética", "captar")]);
  const proposta = proposePublishedPrimarySwap({ published: formacaoKw("pub", "como captar clientes para clínica de estética", null, { isPublished: true }), post: "free", identity: identidade, candidates: [{ ...formacaoKw("nova", "como captar clientes clínica de estética", 390), volumeValidated: true }], serp: indice });
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
  // A melhoria (núcleo puro): a mesma troca, pela keyword do artigo mais próxima do slug.
  const alvo: ImprovementTarget = { id: "pub", kind: "published", theme: "como captar clientes para clínica de estética", note: null, primaryId: "pub", post: "free", memberIds: ["pub", "nova"], territoryRef: "territory:t", slug: identidade.slug, url: identidade.url, canonical: identidade.canonical, signals: sinais("pub", "como captar clientes para clínica de estética") };
  const troca = volumelessPrincipalSwap(alvo, new Map([["pub", termo("pub", "como captar clientes para clínica de estética", { volume: null, volumeValidated: false, published: true })], ["nova", termo("nova", "como captar clientes clínica de estética", { volume: 390, ownerId: "pub" })]]));
  assert.equal(troca?.principalId, "nova");
  assert.deepEqual(troca?.memberIds, ["pub", "nova"], "nada entra nem sai");
  // HOJE: a mesa grava a troca como 'proposed' pelo navegador (ws → persistArticleSubjectVersion) — muda na F5 (R2: approved pelo gravador único).
  const tela = codigoSemComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  const gravarPelaMesa = tela.slice(tela.indexOf("const persistArticleSubjectVersion = useCallback("), tela.indexOf("const persistArticleSubjectVersion = useCallback(") + 2500);
  assert.match(gravarPelaMesa, /persistArquitetoArtifact\(\{ brandId: selectedBrandId, artifactType: "article_dna", action: "edit", version: successor, status: "proposed" \}\)/, "HOJE: a troca pela mesa grava 'proposed' com 'edit' — muda na F5");
});

test("C9b · publicado Livre com a principal de volume 10 e candidata Forte de 500: HOJE a mesa propõe a troca e a melhoria não — muda na F4: nenhuma propõe (R1)", () => {
  const indice = buildSerpSubjectIndex([pegada("pub", "como captar clientes para clínica de estética", "captar"), pegada("c500", "como captar clientes clínica de estética", "captar")]);
  const mesa = proposePublishedPrimarySwap({ published: formacaoKw("pub", "como captar clientes para clínica de estética", 10, { isPublished: true }), post: "free", identity: identidade, candidates: [{ ...formacaoKw("c500", "como captar clientes clínica de estética", 500), volumeValidated: true }], serp: indice });
  assert.equal(mesa.state, "proposed", "HOJE a régua D2.1 (published-primary-swap.ts:170) troca Livre com volume quando a substituta tem mais — muda na F4");
  const alvo: ImprovementTarget = { id: "pub", kind: "published", theme: "como captar clientes para clínica de estética", note: null, primaryId: "pub", post: "free", memberIds: ["pub"], territoryRef: "territory:t", slug: identidade.slug, url: identidade.url, canonical: identidade.canonical, signals: sinais("pub", "como captar clientes para clínica de estética") };
  const [melhoria] = planArticleImprovements({ targets: [alvo], keywords: [termo("pub", "como captar clientes para clínica de estética", { volume: 10, published: true }), termo("c500", "como captar clientes clínica de estética", { volume: 500 })], evidence: [prova("pub", "c500", { sharedPages: 10 })] });
  assert.equal(melhoria.principalId, "pub", "a melhoria já mantém a Livre com volume (needsPrimary do publicado só para sem volume)");
  assert.ok(melhoria.memberIds.includes("c500"), "a de 500 entra como secundária");
});

/* ======================================================================= */
/* C10 · keyword solta (sem Assunto, grupo ou artigo)                       */
/* ======================================================================= */

test("C10 · keyword solta com volume: entra como secundária; como principal só da Livre sem volume; a Travada recebe só secundária", () => {
  const alvo = (extra: Partial<ImprovementTarget> = {}): ImprovementTarget => ({ id: "k10", kind: "subject", theme: "Diferença entre internet e Wi-Fi", note: null, primaryId: "dif", post: "free", memberIds: ["dif"], territoryRef: TERRITORIO_AZUL, slug: "diferenca-entre-internet-e-wi-fi", url: null, canonical: null, signals: sinais("k10", "diferença entre internet e wi-fi"), ...extra });
  const solta = termo("solta", "diferença entre internet e wi-fi em casa", { volume: 900 });
  const casos = [
    { nome: "Livre sem volume", target: alvo(), principal: termo("dif", "diferença entre internet e wi-fi", { volume: null, volumeValidated: false, ownerId: "k10" }), espera: "solta" },
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
