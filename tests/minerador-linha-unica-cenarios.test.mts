import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LinhaUnicaFakeDb, type Row } from "./minerador-linha-unica-fake-db.mts";
import { importKeywordsWithCore, importSubjectsWithCore, normalizeKeyword, type KeywordImportCoreItem } from "../lib/minerador/keyword-import-core.ts";
import { importDeclaredPlanWithCore, readDeclaredPlanCardRows, setKeywordPlanLockWithCore, type StructuredDeclaredPlan } from "../lib/minerador/declared-plan-import-core.ts";
import { declaredPlanForGroup, declaredPlanFormationInputs } from "../lib/arquiteto/declared-plan-formation.ts";
import { looksLikeSiloPlanText } from "../lib/minerador/plan-text-detector.ts";
import { PLANO_EM_BLOCOS_DO_DONO, PLANO_EM_BLOCOS_ESPERADO } from "./minerador-plano-blocos-fixture.mts";
import { COLUNAS_IGNORADAS_DO_CSV, PLANEJAMENTO_CSV_DO_DONO, SILO_PLANOS_ESPERADO, SILO_WIFI_ESPERADO, TRECHOS_DAS_COLUNAS_IGNORADAS } from "./minerador-plano-csv-fixture.mts";
import { normalizeDeclaredPhraseKey, parseDeclaredPlanText } from "../lib/minerador/declared-plan.ts";
import { SILO_ARTICLE_RANGE, SiloPlanSchema, validateSiloPlan, type SiloPlan } from "../lib/agent/silo-plan.ts";
import {
  applyKeywordDecisionEntries,
  approvalInput,
  constrainKeywordSnapshot,
  keywordDecisionEntries,
  readDecisionKeywords,
  runKeywordLogicWithCore,
  type DecisionKeywordRow,
  type KeywordDecisionEntry,
} from "../lib/server/minerador-keyword-decision-core.ts";
import { applyApproveAndSend, previewApproveAndSend, type ApproveAndSendDeps } from "../lib/minerador/approve-and-send-core.ts";
import {
  applyApproval,
  approvedPackageDiverged,
  buildApprovedPackage,
  DECLARED_PRINCIPAL_APPROVAL_REASON,
  readApprovalRecord,
  resolveApprovalReadiness,
  resolveHandoffApprovalGate,
  SUBJECT_APPROVAL_REASON,
  VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE,
} from "../lib/minerador/approved-package.ts";
import { isApprovedForArchitect, resolveEffectiveKeywordStatus } from "../lib/minerador/editorial-status.ts";
import { canonicalJson } from "../lib/arquiteto/versioning.ts";
import {
  buildGoogleAdsEmptyVolumePatch,
  buildGoogleAdsUnavailableVolumePatch,
  buildGoogleAdsVolumeMetricPatch,
  matchGoogleAdsVolumeMetrics,
  withApprovalCarriedAcrossRemeasurement,
  type GoogleAdsVolumeKeyword,
} from "../lib/minerador/google-ads-volume.ts";
import { classifyVolumeReadback } from "../lib/minerador/volume-eligibility.ts";
import { resolveMineradorProcessState } from "../lib/minerador/process-state.ts";
import { guardKeywordSemanticWrite, keywordSubjectBlocksDeletion, resolveDeclaredPrincipal, resolveKeywordSubject, semanticForKeywordWrite } from "../lib/minerador/keyword-subject.ts";
import { readArchitectSubjectStanding } from "../lib/arquiteto/declared-subject.ts";
import { planSheetLockOf, readPlanRowVolume } from "../lib/arquiteto/plan-article-sheet.ts";
import { articleDeclaredPlanSeals } from "../lib/arquiteto/declared-plan-seals.ts";
import { keywordLockVolume, resolveKeywordPlanLock } from "../lib/minerador/keyword-plan-lock.ts";
import { importSubjectDiscoveryWithCore, SubjectDiscoveryImportRequestSchema, type SubjectDiscoveryImportVolumePort } from "../lib/minerador/subject-discovery-import.ts";
import { buildSubjectSearchReceiptDraft, SUBJECT_SEARCH_VOLUME_ORIGIN, subjectSearchVolumeDecision, type SubjectSearchReceipt } from "../lib/minerador/subject-search-receipt.ts";
import { importSiteKeywordsToMinerador, type SiteKeywordMineradorCandidateInput, type SiteKeywordMineradorRepository } from "../lib/marca/site-minerador-import.ts";
import { normalizeCandidateText } from "../lib/marca/site-parser.ts";
import { normalizeGoogleAdsKeyword } from "../lib/google/ads/normalizers.ts";
import { normalizeTopicText } from "../lib/agent/topic-match.ts";
import { readKnownVolume } from "../lib/editorial/known-before-search.ts";
import { buildDataForSeoKeywordMeasurementPatch } from "../lib/minerador/dataforseo-allintitle.ts";
import type { DataForSeoAllintitleMeasurement } from "../lib/minerador/dataforseo-serp-core.ts";
import { PLATFORM_KEYWORD_SELECT, projectPlatformKeywordRow } from "../lib/server/platform-mcp-tools.ts";
import { evaluateMineradorArquitetoHandoffBatch } from "../lib/minerador/arquiteto-handoff-gates.ts";
import { isKeywordPublished } from "../lib/minerador/keyword-lifecycle.ts";
import { convertLegacySubjectsWithCore, readConversionDraftWithCore, type ConversionRowInput } from "../lib/minerador/subject-conversion-core.ts";
import { deriveLogicalKeywordBatchItem } from "../lib/minerador/logical-batch.ts";
import { autoDetectNiche } from "../lib/arquiteto/keyword-dna-engine.ts";
import { setKeywordPageType } from "../lib/minerador/keyword-page-type.ts";
import { setKgrApplicability } from "../lib/minerador/kgr-applicability.ts";
import { applyHumanReviewField } from "../lib/minerador/human-review.ts";
import { isLegacyPublishedStatus } from "../lib/minerador/editorial-status.ts";
import { applyKeywordDeleteWithCore, previewKeywordDeleteWithCore } from "../lib/minerador/keyword-delete-core.ts";
import { previewGroupDeleteAllWithCore } from "../lib/minerador/group-delete-all-core.ts";
import { GROUP_DELETE_ALL_RELEASE_VIA, GROUP_DELETE_SELECTION_ACTION_LABEL } from "../lib/minerador/group-delete-all.ts";
import { checkDeleteConfirmation, DELETE_STRONG_CONFIRMATION_ABOVE, deleteConfirmationRequirement } from "../lib/lifecycle/typed-confirmation.ts";
import { groupEventHistoryEntry } from "../lib/editorial/group-history.ts";
import { keywordCarriesDeclaredPlan } from "../lib/minerador/keyword-subject.ts";
import { liberacaoDaCor } from "./excluir-cor-fake-db.mts";

/*
 * F0 DA LINHA ÚNICA DO MINERADOR — CENÁRIOS-OURO DO FLUXO DE HOJE (SDD
 * `docs/compartilhado/sdd-linha-unica-do-minerador-2026-10-16.md`, §6 F0 e
 * os três complementos de 16/10; AGENTS.md §0.3).
 *
 * Só testes: grava o comportamento de HOJE, de ponta a ponta, chamando os
 * núcleos reais com I/O simulado (banco em memória, Google Ads por fixture,
 * Arquiteto falso que aplica os MESMOS portões do servidor). Nenhuma rede,
 * nenhum banco, nenhuma chamada paga: REAL_PROVIDER_CALLS_IN_TESTS = 0.
 *
 * Cenário que revela defeito NÃO é consertado aqui: entra como
 *   - um teste "hoje:" que grava o comportamento atual (vira vermelho quando a
 *     fase corrigir, e a fase troca o teste pela regra nova), e
 *   - um `todo` "vermelho até a Fn" com a conclusão esperada executada.
 *
 * Caso real usado nos cenários do plano: a WifiConecta, cor Azul — as 7
 * keywords do plano (Silo 2, artigos 9 a 15) e a keyword do Silo
 * "Wi-Fi e fibra óptica", gravada no grupo sem Assunto.
 */

globalThis.fetch = (async () => { throw new Error("Rede proibida neste teste."); }) as typeof fetch;

const raiz = new URL("../", import.meta.url);
/** O arquivo como está (SQL e textos). */
const cru = (caminho: string) => readFileSync(new URL(caminho, raiz), "utf8");
/** O código SEM comentários e com LF (um comentário não pode passar nem reprovar um teste). */
const codigo = (caminho: string) => cru(caminho).replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OTHER_BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const AZUL = "22222222-3333-4444-8555-666666666666";
const AT = "2026-10-16T12:00:00.000Z";
const LATER = "2026-10-16T15:00:00.000Z";
const MEDIDO_EM = "2026-10-16T13:00:00.000Z";
const SITE = "https://wificonecta.com.br";
const PAGINA_URL = "https://wificonecta.com.br/fibra-empresarial/";

const SILO_2 = `Silo 2 — Wi-Fi, fibra óptica e qualidade da internet
Nome: Wi-Fi e fibra óptica
Slug: /wifi-e-fibra/
Objetivo: conquistar tráfego de pessoas que querem entender a tecnologia, melhorar a conexão ou descobrir se precisam trocar de plano.
9. Internet fibra óptica ou internet comum: qual a diferença e qual escolher?
Artigo pilar • Palavra-chave: internet fibra óptica
Explicar tecnologias de acesso, vantagens, limitações e o que observar na contratação.
10. Qual a diferença entre internet e Wi-Fi? Entenda antes de contratar
Palavra-chave: diferença entre internet e Wi-Fi
Esclarecer a diferença entre a conexão da operadora e a rede sem fio dentro de casa.
11. Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão
Palavra-chave: Wi-Fi lento
Abordar posicionamento do roteador, interferência, aparelhos conectados e testes de velocidade.
12. Quantos Mega de internet precisa para assistir Netflix, YouTube e streaming?
Palavra-chave: internet para streaming
Explicar consumo de banda por qualidade de vídeo e quantidade de telas simultâneas.
13. Qual a melhor internet para jogar online? Velocidade, ping e estabilidade
Palavra-chave: melhor internet para jogos online
Mostrar por que latência, estabilidade e tipo de conexão importam além dos Mega contratados.
14. Internet para home office: qual velocidade e conexão são ideais?
Palavra-chave: internet para home office
Abordar videochamadas, upload, estabilidade e uso simultâneo da rede pela família.
15. Teste de velocidade da internet: como saber se você recebe o que contratou?
Palavra-chave: teste de velocidade da internet
Ensinar a testar a conexão, interpretar download, upload e ping e identificar possíveis problemas.`;

const PRINCIPAIS_AZUL = ["internet fibra óptica", "diferença entre internet e Wi-Fi", "Wi-Fi lento", "internet para streaming", "melhor internet para jogos online", "internet para home office", "teste de velocidade da internet"];
const KEYWORD_DO_SILO = "Wi-Fi e fibra óptica";

/* ================================================================ fixtures */

let sequencia = 0;
const uuid = (prefixo: string) => `${prefixo}-0000-4000-8000-${String(++sequencia).padStart(12, "0")}`;
const novoPedido = () => uuid("6a1c0d2e");

function kw(id: string, keyword: string, extra: Row = {}): Row {
  return { id, keyword, brand_id: BRAND, status: "bruto", intent: null, location: null, volume_search: null, results_allintitle: null, kgr_score: null, lista_id: null, group_id: null, deleted_at: null, analise_semantica: {}, ...extra };
}

const MEDIDA = (volume: number) => ({ volume_measurement: { provider: "google_ads", averageMonthlySearches: volume, measuredAt: "2026-10-10T10:00:00+00:00" } });

/** A WifiConecta antes do cadastro: a cor Azul com a keyword do Silo, "wi-fi lento" já medida e a outra marca com a mesma frase. */
function wifiConecta(): LinhaUnicaFakeDb {
  return new LinhaUnicaFakeDb({
    editorial_groups: [
      { id: AZUL, marca_id: BRAND, name: "azul", color: "azul", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    editorial_workflow_items: [],
    brand_site_catalog_entries: [],
    minerador_keyword_lists: [],
    minerador_keywords: [
      kw("40000000-0000-4000-8000-000000000001", "wi-fi lento", { volume_search: 1900, volume_source: "google_ads", analise_semantica: { ...MEDIDA(1900) } }),
      kw("40000000-0000-4000-8000-0000000000aa", KEYWORD_DO_SILO, { group_id: AZUL }),
      kw("50000000-0000-4000-8000-000000000001", "internet fibra empresarial", { status: "aprovado", analise_semantica: { site_origin: { publicationStatus: "published", sourceUrl: PAGINA_URL, resolvedUrl: PAGINA_URL, canonicalUrl: PAGINA_URL, urlSituation: "canonical_confirmed", lastCheckedAt: "2026-09-20T10:00:00Z", publicationConfirmedBy: ACTOR, publicationConfirmedAt: "2026-09-20T10:00:00Z" } } }),
      { id: "90000000-0000-4000-8000-000000000001", keyword: "internet fibra óptica", brand_id: OTHER_BRAND, status: "bruto", group_id: null, deleted_at: null, analise_semantica: {} },
    ],
  });
}

const client = (db: LinhaUnicaFakeDb) => db as unknown as SupabaseClient;
const linha = (db: LinhaUnicaFakeDb, keyword: string, brandId = BRAND) => db.rows("minerador_keywords").find(row => normalizeKeyword(row.keyword) === normalizeKeyword(keyword) && row.brand_id === brandId);
const porId = (db: LinhaUnicaFakeDb, id: string) => db.rows("minerador_keywords").find(row => row.id === id)!;
const semantica = (row: Row) => (row.analise_semantica || {}) as Row;
const statusNaTela = (row: Row) => resolveEffectiveKeywordStatus({ status: row.status, diverged: approvedPackageDiverged(approvalInput(row as unknown as DecisionKeywordRow)) }).status;

/* ===================================================== portas simuladas */

/** Importar pela Descoberta (lista colada/CSV entram como `discovery` manual/csv): o núcleo `importKeywordsWithCore`. */
async function importar(db: LinhaUnicaFakeDb, frases: string[], origem: "manual" | "csv" = "manual", brandId = BRAND) {
  const items: KeywordImportCoreItem[] = frases.map(keyword => ({ keyword, source: "discovery", discoverySource: origem, locations: [{ countryCode: "BR" }], extractionBatchId: "batch-1" }));
  return importKeywordsWithCore({ brandId, actorUserId: ACTOR, items, supabase: client(db), now: AT });
}

/** O botão Lógica / MCP `run_keyword_logic` no servidor: o núcleo de sempre. */
const logica = (db: LinhaUnicaFakeDb, ids: string[]) => runKeywordLogicWithCore({ brandId: BRAND, keywordIds: ids, db: client(db), now: () => new Date(LATER) });

function metrica(frase: string, media: number | null) {
  return { keyword: frase, normalizedKeyword: normalizeGoogleAdsKeyword(frase), averageMonthlySearches: media, monthlySearchVolumes: [], competition: null, competitionIndex: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null, currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: {}, customerId: "******7890", provider: "google_ads", providerVersion: "v25", measuredAt: MEDIDO_EM, canonicalKeyword: frase, closeVariants: [], normalizedCloseVariants: [], matchedRequestedKeywords: [frase] };
}

/**
 * O botão Volume / MCP `measure_keywords`: a mesma gravação da rota do Google
 * Ads (`handleGoogleAdsKeywordMetrics`, linhas da projeção), com a resposta do
 * Google Ads em fixture: `medias[frase] = número` (média), `null` (respondeu
 * sem média) ou ausente (não voltou no lote = sem média, "not_returned").
 */
async function medirVolume(db: LinhaUnicaFakeDb, ids: string[], medias: Record<string, number | null>) {
  const lidas = await db.from("minerador_keywords").select("id,brand_id,keyword,status,intent,volume_search,results_allintitle,kgr_score,volume_source,analise_semantica").eq("brand_id", BRAND).is("deleted_at", null).in("id", ids);
  const rows = lidas.data as Row[];
  const keywords = rows.map(row => ({ id: String(row.id), brandId: String(row.brand_id), keyword: String(row.keyword), status: String(row.status || ""), volume_search: typeof row.volume_search === "number" ? row.volume_search : null, results_allintitle: typeof row.results_allintitle === "number" ? row.results_allintitle : null, kgr_score: typeof row.kgr_score === "number" ? row.kgr_score : null, volume_source: typeof row.volume_source === "string" ? row.volume_source : null, analise_semantica: semantica(row) })) as unknown as GoogleAdsVolumeKeyword[];
  const intentById = new Map(rows.map(row => [String(row.id), typeof row.intent === "string" ? row.intent : null]));
  const metrics = Object.entries(medias).map(([frase, media]) => metrica(frase, media));
  const { matches, unmatchedKeywordIds } = matchGoogleAdsVolumeMetrics(keywords, metrics as never, "0e000000-0000-4000-8000-0000000000f9", "req-1");
  const projections: Array<{ keywordId: string; volumeSearch: number | null; measuredAt: string }> = [];
  for (const measurement of matches) {
    const keyword = keywords.find(item => item.id === measurement.keywordId)!;
    const raw = measurement.averageMonthlySearches === null ? buildGoogleAdsUnavailableVolumePatch(keyword, measurement) : buildGoogleAdsVolumeMetricPatch(keyword, measurement, { requireCurrentResultsMeasurement: true });
    const patch = raw ? withApprovalCarriedAcrossRemeasurement({ ...keyword, intent: intentById.get(keyword.id) ?? null }, raw) : null;
    if (patch) await db.from("minerador_keywords").update(patch).eq("id", keyword.id).eq("brand_id", BRAND).is("deleted_at", null);
    projections.push({ keywordId: keyword.id, volumeSearch: measurement.averageMonthlySearches, measuredAt: MEDIDO_EM });
  }
  for (const id of unmatchedKeywordIds) {
    const keyword = keywords.find(item => item.id === id)!;
    const patch = withApprovalCarriedAcrossRemeasurement({ ...keyword, intent: intentById.get(id) ?? null }, buildGoogleAdsEmptyVolumePatch(keyword, { measuredAt: MEDIDO_EM, providerVersion: "v25", googleAdsRequestId: "req-1", kind: "not_returned" }));
    await db.from("minerador_keywords").update(patch).eq("id", id).eq("brand_id", BRAND).is("deleted_at", null);
    projections.push({ keywordId: id, volumeSearch: null, measuredAt: MEDIDO_EM });
  }
  return ids.map(id => {
    const row = porId(db, id);
    const projection = projections.find(item => item.keywordId === id) ?? null;
    return { id, outcome: classifyVolumeReadback({ projection: projection as never, unmatched: unmatchedKeywordIds.includes(id), row: row as never, volumeComplete: resolveMineradorProcessState(row as never).volume.complete }) };
  });
}

const RECUSA_DO_ENVIO = "Não aprovada no Minerador, ou aprovada e alterada depois (o pacote aprovado divergiu): aprove-a de novo.";

/**
 * O Arquiteto falso: os MESMOS portões de `prepareCanonicalHandoff` (status
 * canônico + pacote não divergente + `resolveHandoffApprovalGate`) e o pacote
 * de `buildApprovedPackage`. A "mesa" guarda o que o Arquiteto recebeu, no
 * formato que `readArchitectSubjectStanding` lê.
 */
function arquitetoFalso(db: LinhaUnicaFakeDb) {
  const mesa = new Map<string, Row>();
  const avaliar = async (ids: readonly string[]) => {
    const { rows } = await readDecisionKeywords(BRAND, ids, client(db));
    const elegiveis: DecisionKeywordRow[] = [];
    const refused: Array<{ keywordId: string; reason: string }> = [];
    const existentes: string[] = [];
    const atualizam: string[] = [];
    for (const row of rows) {
      const status = String(row.status || "").toLocaleLowerCase("pt-BR");
      const aprovada = (status === "aprovado" || status === "publicado") && isApprovedForArchitect({ status: row.status, diverged: approvedPackageDiverged(approvalInput(row)) });
      if (!aprovada) { refused.push({ keywordId: row.id, reason: RECUSA_DO_ENVIO }); continue; }
      const recebida = mesa.has(row.id);
      const gate = resolveHandoffApprovalGate({ semantic: row.analise_semantica, intent: row.intent, volumeSearch: row.volume_search, resultsAllintitle: row.results_allintitle, alreadyReceived: recebida });
      if (gate.verdict === "refuse") { refused.push({ keywordId: row.id, reason: `A aprovação está incompleta para o envio ao Arquiteto. ${gate.reason || ""}`.trim() }); continue; }
      elegiveis.push(row);
      if (recebida) {
        existentes.push(row.id);
        const pkg = buildApprovedPackage(approvalInput(row));
        const anterior = ((mesa.get(row.id)!.canonicalWorkflow as Row).payload as Row).approvedDna as Row | null;
        if (pkg && anterior?.contentHash !== pkg.contentHash) atualizam.push(row.id);
      }
    }
    return { elegiveis, refused, existentes, atualizam };
  };
  return {
    mesa,
    previewSend: async (ids: readonly string[]) => {
      const a = await avaliar(ids);
      return { eligibleKeywordIds: a.elegiveis.map(row => row.id), existingKeywordIds: a.existentes, refreshKeywordIds: a.atualizam, refused: a.refused };
    },
    send: async (ids: readonly string[]) => {
      const a = await avaliar(ids);
      for (const row of a.elegiveis) {
        const viva = structuredClone(porId(db, row.id));
        mesa.set(row.id, { ...viva, canonicalWorkflow: { state: "received", payload: { approvedDna: buildApprovedPackage(approvalInput(row)) } } });
      }
      return { importedKeywordIds: a.elegiveis.map(row => row.id), refused: a.refused, refreshedKeywordIds: a.atualizam };
    },
  };
}

/** "Aprovar e enviar ao Arquiteto": a orquestração real com os núcleos reais (decisão do MCP `decide_keywords`). */
function deps(db: LinhaUnicaFakeDb, arquiteto: ReturnType<typeof arquitetoFalso>): ApproveAndSendDeps<DecisionKeywordRow, KeywordDecisionEntry> {
  return {
    readRows: async ids => {
      const { rows } = await readDecisionKeywords(BRAND, ids, client(db));
      const found = new Set(rows.map(row => row.id));
      return { rows, missingIds: [...new Set(ids)].filter(id => !found.has(id)) };
    },
    entries: rows => keywordDecisionEntries(rows, "approve"),
    approve: (rows, entries) => applyKeywordDecisionEntries({ brandId: BRAND, actorId: ACTOR, action: "approve", rows, entries, db: client(db), now: () => new Date(LATER) }),
    previewSend: ids => arquiteto.previewSend(ids),
    send: ids => arquiteto.send(ids),
    hash: value => createHash("sha256").update(canonicalJson(value)).digest("hex"),
  };
}

async function aprovarEEnviar(db: LinhaUnicaFakeDb, arquiteto: ReturnType<typeof arquitetoFalso>, ids: string[], send = true) {
  const d = deps(db, arquiteto);
  const previa = await previewApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send }, d);
  const resultado = await applyApproveAndSend({ brandId: BRAND, actorId: ACTOR, keywordIds: ids, send, decisionHash: previa.decisionHash }, d);
  return { previa, resultado };
}

/** Cadastrar Assuntos (card) / MCP `declare_silo_plan`: o núcleo `importDeclaredPlanWithCore`. */
const cadastro = (db: LinhaUnicaFakeDb, extra: Partial<Parameters<typeof importDeclaredPlanWithCore>[0]> = {}) => importDeclaredPlanWithCore({
  brandId: BRAND, actorUserId: ACTOR, keywordsClient: db as never, groupsClient: db as never, mode: "preview", text: SILO_2,
  group: { mode: "new", color: "azul", name: null }, destination: { kind: "new_silo" }, now: AT, brandSiteUrl: SITE, ...extra,
});

async function azulCadastrado() {
  const db = wifiConecta();
  const aplicado = await cadastro(db, { mode: "apply", importRequestId: novoPedido() });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  const ids = PRINCIPAIS_AZUL.map(frase => String(linha(db, frase)!.id));
  return { db, ids };
}

/** O plano do Silo 2 no formato do MCP `validate_silo_plan`. */
function siloPlanDoAzul(options: { comKeywordDoSilo: boolean; artigos?: number }): Record<string, unknown> {
  const artigos = parseDeclaredPlanText(SILO_2).articles.slice(0, options.artigos ?? 7);
  return {
    siloName: "Wi-Fi e fibra óptica",
    siloPage: { ...(options.comKeywordDoSilo ? { keyword: "wi-fi e fibra óptica" } : {}), slug: "wifi-e-fibra" },
    articles: artigos.map((article, index) => ({ subject: article.subject, targetKeyword: article.principal ?? undefined, role: article.role, funnel: index % 2 ? "MOFU" : "TOFU", intent: index % 2 ? "comercial" : "informacional" })),
  };
}

const CONTEXTO_VAZIO = { publishedPaths: [], existingArticleSlugs: [], existingSiloPageSlugs: [], existingArticleTopics: [] };

/* ====================================================================== G1 */

test("G1 · marca sem plano: colar 5 → Lógica → Volume (1 sem média) → aprovar e enviar: 5 aprovadas e enviadas, pacote com contentHash, outra marca intacta", async () => {
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [{ id: "90000000-0000-4000-8000-0000000000b1", keyword: "plano de internet barato", brand_id: OTHER_BRAND, status: "bruto", deleted_at: null, analise_semantica: { marca: "B" } }], minerador_keyword_lists: [] });
  const outraAntes = JSON.stringify(db.rows("minerador_keywords").filter(row => row.brand_id === OTHER_BRAND));
  const frases = ["plano de internet barato", "internet 500 mega", "melhor provedor de internet", "internet para empresas", "internet rural via satélite"];
  const importado = await importar(db, frases);
  assert.equal(importado.created, 5);
  const ids = importado.items.map(item => String(item.keywordId));
  assert.ok(ids.every(id => porId(db, id).status === "bruto"), "entra bruto");

  const rodada = await logica(db, ids);
  assert.equal(rodada.applied, 5);
  assert.equal(rodada.readbackConfirmed, true);

  const volume = await medirVolume(db, ids, { "plano de internet barato": 1300, "internet 500 mega": 880, "melhor provedor de internet": 590, "internet para empresas": 320 });
  assert.deepEqual(volume.map(item => item.outcome), ["confirmed", "confirmed", "confirmed", "confirmed", "confirmed_empty"]);
  const semMedia = porId(db, ids[4]);
  const prontidao = resolveApprovalReadiness({ semantic: semantica(semMedia), intent: semMedia.intent, volumeSearch: semMedia.volume_search, resultsAllintitle: semMedia.results_allintitle });
  assert.equal(prontidao.ok, true, "a sem média aprova");
  assert.deepEqual(prontidao.notes, [VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE]);

  const arquiteto = arquitetoFalso(db);
  const { previa, resultado } = await aprovarEEnviar(db, arquiteto, ids);
  assert.equal(previa.counts.approveAndSend, 5);
  assert.equal(resultado.counts.approved_and_sent, 5, JSON.stringify(resultado.results));
  assert.equal(resultado.readbackConfirmed, true);
  for (const id of ids) {
    const viva = porId(db, id);
    assert.equal(viva.status, "aprovado");
    const pacote = ((arquiteto.mesa.get(id)!.canonicalWorkflow as Row).payload as Row).approvedDna as Row;
    assert.equal(pacote.contentHash, readApprovalRecord(semantica(viva))!.contentHash, "o Arquiteto recebe o pacote assinado");
    assert.equal(readApprovalRecord(semantica(viva))!.approvedBy, ACTOR);
  }
  assert.equal(arquiteto.mesa.size, 5, "o Arquiteto recebe as 5");
  assert.equal(JSON.stringify(db.rows("minerador_keywords").filter(row => row.brand_id === OTHER_BRAND)), outraAntes, "nada da marca B muda");
});

/* ====================================================================== G2 */

test("G2 · duplicata e idempotência: o mesmo lote duas vezes não cria linha; caixa e acento normalizam igual; a outra marca fica intacta", async () => {
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [{ id: "90000000-0000-4000-8000-0000000000b2", keyword: "Wi-Fi lento", brand_id: OTHER_BRAND, status: "bruto", deleted_at: null, analise_semantica: {} }] });
  const primeiro = await importar(db, ["Wi-Fi lento", "internet fibra óptica"], "csv");
  assert.equal(primeiro.created, 2);
  const total = db.rows("minerador_keywords").length;
  const segundo = await importar(db, ["WI-FI LENTO", "Internet Fibra Optica", "  wi-fi   lento "], "csv");
  assert.equal(segundo.created, 0, "zero linha nova na 2ª vez");
  assert.deepEqual(segundo.items.map(item => item.outcome), ["existing", "existing", "duplicate"]);
  assert.equal(db.rows("minerador_keywords").length, total);
  assert.equal(normalizeKeyword("Internet Fibra Óptica"), normalizeKeyword("internet fibra optica"));
  assert.equal(db.rows("minerador_keywords").filter(row => row.brand_id === OTHER_BRAND).length, 1, "a marca B não ganha nem perde linha");
  assert.deepEqual(porId(db, "90000000-0000-4000-8000-0000000000b2").analise_semantica, {}, "a marca B com a mesma frase fica intacta");
});

test("G2 · hoje: `importKeywordsWithCore` não conhece `importRequestId` (a idempotência por pedido mora só na rota da Descoberta, em `minerador_discovery_import_batches`); o import de Assunto trava o pedido em curso", async () => {
  const fonte = codigo("lib/minerador/keyword-import-core.ts");
  const nucleo = fonte.slice(fonte.indexOf("export async function importKeywordsWithCore"), fonte.indexOf("export type SubjectImportItem"));
  assert.doesNotMatch(nucleo, /importRequestId/);
  const rota = codigo("app/api/minerador/marcas/[brandId]/discovery/import/route.ts");
  assert.match(rota, /MINERADOR_DISCOVERY_IMPORT_REQUEST_REUSED/);
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [] });
  const semPedido = await importSubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(db), mode: "apply", source: "manual", items: [{ keyword: "x" }] });
  assert.ok(!semPedido.ok && semPedido.code === "IMPORT_REQUEST_REQUIRED");
});

/* ====================================================================== G3 */

test("G3 · plano declarado, Silo novo (WifiConecta Azul): prévia → cadastrar → Lógica → aprovar (D2-bis) → enviar: 7 keywords com entry e plano, trava pelo volume, Silo do plano chega ao Arquiteto; a keyword do Silo fica fora", async () => {
  const db = wifiConecta();
  const previa = await cadastro(db);
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") return;
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.articles.length, 7);
  assert.equal(previa.group.mode, "existing", "a cor Azul já tem grupo");
  assert.deepEqual(previa.leftovers.map(item => [item.keyword, item.reason]), [[KEYWORD_DO_SILO, "silo_name"]], "a keyword do Silo é sobra: fica fora do plano");
  assert.equal(db.writes().length, 0, "prévia não grava");

  const aplicado = await cadastro(db, { mode: "apply", importRequestId: novoPedido() });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  const ids = PRINCIPAIS_AZUL.map(frase => String(linha(db, frase)!.id));
  for (const [indice, id] of ids.entries()) {
    const assunto = resolveKeywordSubject(semantica(porId(db, id)));
    assert.equal(assunto.declared, true);
    assert.ok(assunto.entry?.title, "o título mora na keyword");
    assert.equal(assunto.plan?.groupId, AZUL);
    assert.equal(assunto.plan?.order, 9 + indice);
    assert.equal(resolveDeclaredPrincipal(semantica(porId(db, id))).mark?.subjectKeywordId, id, "D2-bis: a marca de principal é a própria keyword");
  }
  const silo = linha(db, KEYWORD_DO_SILO)!;
  assert.equal(resolveKeywordSubject(semantica(silo)).declared, false, "a keyword do Silo continua sem Assunto");
  const trava = (id: string) => resolveKeywordPlanLock({ keywordId: id, status: String(porId(db, id).status), semantic: semantica(porId(db, id)), volume: keywordLockVolume({ semantic: semantica(porId(db, id)), volumeSearch: porId(db, id).volume_search as number | null }) });
  const rotulo = (id: string) => { const lock = trava(id); return lock?.kind === "plan" ? lock.label : null; };
  assert.equal(rotulo(ids[0]), "Livre · sem volume medido");
  assert.equal(rotulo(ids[2]), "Travada · pelo volume medido", "wi-fi lento tem volume medido");

  const rodada = await logica(db, ids);
  assert.equal(rodada.failed, 0);
  const arquiteto = arquitetoFalso(db);
  const { resultado } = await aprovarEEnviar(db, arquiteto, ids);
  assert.equal(resultado.counts.approved_and_sent, 7, JSON.stringify(resultado.results));
  for (const id of ids) {
    const standing = readArchitectSubjectStanding(arquiteto.mesa.get(id)!);
    assert.equal(standing.declared, true);
    assert.equal(standing.plan?.groupId, AZUL, "o Silo do plano chega pelo pacote aprovado");
  }
  assert.equal(readArchitectSubjectStanding(arquiteto.mesa.get(ids[0])!).plan?.role, "Pilar");
  assert.equal(arquiteto.mesa.has(String(silo.id)), false, "a keyword do Silo não foi enviada");
});

test("G3 · o mesmo plano com a keyword do Silo passa no MCP `validate_silo_plan` sem bloqueio", () => {
  const plano = SiloPlanSchema.parse(siloPlanDoAzul({ comKeywordDoSilo: true }));
  const validado = validateSiloPlan(plano, CONTEXTO_VAZIO);
  assert.deepEqual(validado.issues.filter(issue => issue.severity === "block"), []);
  assert.equal(validado.ok, true);
});

/* ====================================================================== G4 */

test("G4 · hoje: plano sem keyword do Silo — o cadastro aceita; o MCP recusa no schema (`siloPage.keyword` obrigatório)", async () => {
  const db = wifiConecta();
  const previa = await cadastro(db);
  assert.ok(previa.ok && previa.mode === "preview" && previa.canApply, "o cadastro não tem keyword da página do Silo e aceita");
  assert.equal(SiloPlanSchema.safeParse(siloPlanDoAzul({ comKeywordDoSilo: false })).success, false, "o MCP exige a keyword do Silo");
});

test("G4 · plano sem keyword do Silo: o MCP não bloqueia pela falta da keyword", { todo: "vermelho até a F2 (A2): `siloPage.keyword` opcional em SiloPlanSchema (adendo 15/10, S2)" }, () => {
  const lido = SiloPlanSchema.safeParse(siloPlanDoAzul({ comKeywordDoSilo: false }));
  assert.equal(lido.success, true);
  if (lido.success) assert.equal(validateSiloPlan(lido.data, CONTEXTO_VAZIO).ok, true);
});

/* ====================================================================== G5 */

const TRES_ARTIGOS = SILO_2.split("\n").slice(0, 4 + 3 * 3).join("\n");

test("G5 · hoje: plano com 3 artigos — o card só avisa; o MCP bloqueia", async () => {
  const db = wifiConecta();
  const previa = await cadastro(db, { text: TRES_ARTIGOS });
  assert.ok(previa.ok && previa.mode === "preview");
  if (!previa.ok || previa.mode !== "preview") return;
  assert.equal(previa.articles.length, 3);
  assert.equal(previa.canApply, true, "o card aceita");
  assert.ok(previa.notices.some(notice => /O plano tem 3 artigo\(s\)/.test(notice)), "e avisa");
  const mcp = validateSiloPlan(SiloPlanSchema.parse(siloPlanDoAzul({ comKeywordDoSilo: true, artigos: 3 })), CONTEXTO_VAZIO);
  assert.equal(mcp.ok, false);
  assert.ok(mcp.issues.some(issue => issue.severity === "block" && issue.field === "articles" && issue.message.includes(`${SILO_ARTICLE_RANGE.min} a ${SILO_ARTICLE_RANGE.max}`)));
});

test("G5 · plano com 3 artigos: a mesma severidade no card e no MCP (D2: avisar em todo lugar)", { todo: "vermelho até a F2 (A2/D2): uma régua, `SILO_ARTICLE_RANGE`, só aviso" }, () => {
  const mcp = validateSiloPlan(SiloPlanSchema.parse(siloPlanDoAzul({ comKeywordDoSilo: true, artigos: 3 })), CONTEXTO_VAZIO);
  assert.equal(mcp.issues.some(issue => issue.field === "articles" && issue.severity === "block"), false);
});

/* ====================================================================== G6 */

async function azulComVolume10Livre() {
  const { db, ids } = await azulCadastrado();
  const stream = ids[3];
  await medirVolume(db, [stream], { "internet para streaming": 10 });
  const livre = await setKeywordPlanLockWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db as never, groupsClient: db as never, mode: "apply", keywordIds: [stream], lock: "free", importRequestId: novoPedido(), now: LATER });
  assert.ok(livre.ok && livre.counts.changed === 1, JSON.stringify(livre));
  await logica(db, ids);
  const arquiteto = arquitetoFalso(db);
  const { resultado } = await aprovarEEnviar(db, arquiteto, ids);
  assert.equal(resultado.counts.approved_and_sent, 7, JSON.stringify(resultado.results));
  const row = porId(db, stream);
  const minerador = resolveKeywordPlanLock({ keywordId: stream, status: String(row.status), semantic: semantica(row), volume: keywordLockVolume({ semantic: semantica(row), volumeSearch: row.volume_search as number | null }) });
  const mesa = arquiteto.mesa.get(stream)!;
  const standing = readArchitectSubjectStanding(mesa);
  const planilha = planSheetLockOf(standing, readPlanRowVolume(mesa, new Date(LATER)));
  const selos = articleDeclaredPlanSeals({ subjectKeywordId: stream, principalKeywordId: stream, standingOf: id => (arquiteto.mesa.has(id) ? readArchitectSubjectStanding(arquiteto.mesa.get(id)!) : null), groupHasPlan: true });
  return { minerador: minerador?.kind === "plan" ? minerador.state : null, planilha: planilha.state, selo: selos.some(selo => selo.kind === "free_principal") ? "free" : selos.some(selo => selo.kind === "declared_principal") ? "locked" : null, standing };
}

// 2026-10-18 · a F2 da SDD do Assunto pela principal (§6.2-f, G11) adiantou a D1: o cenário "hoje" (Posto Livre × planilha Travada) saiu; os três dizem Travada.
test("G6 · trava × volume: Posto, planilha do plano e selo dizem o mesmo estado (D1: volume definido fixa)", async () => {
  const leitura = await azulComVolume10Livre();
  assert.deepEqual({ minerador: leitura.minerador, planilha: leitura.planilha, selo: leitura.selo }, { minerador: "locked", planilha: "locked", selo: "locked" });
});

/* ====================================================================== G7 */

function artigosDoAzul(): StructuredDeclaredPlan["articles"] {
  return parseDeclaredPlanText(SILO_2).articles.map(article => ({ order: article.order, subject: article.subject, principal: article.principal, role: article.role, scope: article.scope }));
}

test("G7 · recadastro: acréscimo não tira nada; substituição com decisionHash dá as quatro listas, a que sai é liberada pelo marcador, nada é apagado, a aprovada que muda volta a Em revisão", async () => {
  const { db, ids } = await azulCadastrado();
  await logica(db, ids);
  const arquiteto = arquitetoFalso(db);
  await aprovarEEnviar(db, arquiteto, ids, false);
  assert.ok(ids.every(id => porId(db, id).status === "aprovado"));
  const total = db.rows("minerador_keywords").filter(row => row.brand_id === BRAND).length;

  const novo = { order: 16, subject: "Roteador mesh vale a pena?", principal: "roteador mesh", role: "Suporte" as const, scope: "Quando o mesh resolve a cobertura da casa." };
  const acrescimo = await cadastro(db, { mode: "apply", importRequestId: novoPedido(), text: null, plan: { silo: null, articles: [novo] }, destination: { kind: "existing_silo", groupId: AZUL } });
  assert.ok(acrescimo.ok && acrescimo.mode === "apply" && acrescimo.failed === 0, JSON.stringify(acrescimo));
  for (const id of ids) assert.equal(resolveKeywordSubject(semantica(porId(db, id))).plan?.groupId, AZUL, "acréscimo não tira nada");
  assert.ok(ids.every(id => statusNaTela(porId(db, id)) === "aprovado"), "acréscimo não rebaixa os 7");

  const atuais = [...artigosDoAzul(), novo];
  const linhas = atuais.filter(article => article.order !== 12).map(article => article.order === 11 ? { ...article, scope: `${article.scope} Repetidores e mesh.` } : article)
    .concat([{ order: 17, subject: "Repetidor de Wi-Fi funciona?", principal: "repetidor de wi-fi", role: "Suporte" as const, scope: "Quando o repetidor ajuda e quando atrapalha." }]);
  const substituicao = { text: null, plan: { silo: null, articles: linhas }, planMode: "replace" as const, group: { mode: "existing" as const, groupId: AZUL }, destination: { kind: "existing_silo" as const, groupId: AZUL } };
  const previa = await cadastro(db, substituicao);
  assert.ok(previa.ok && previa.mode === "preview" && previa.replace, JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview" || !previa.replace) return;
  assert.deepEqual(previa.blockers, []);
  assert.deepEqual(previa.replace.changed.map(item => item.order), [11]);
  assert.deepEqual(previa.replace.entering.map(item => item.order), [17]);
  assert.deepEqual(previa.replace.leaving.map(item => item.order), [12]);
  assert.equal(previa.replace.same.length, 6);

  const aplicado = await cadastro(db, { ...substituicao, mode: "apply", importRequestId: novoPedido(), decisionHash: previa.replace.decisionHash });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  const saiu = semantica(porId(db, ids[3]));
  assert.equal(resolveKeywordSubject(saiu).plan, null, "a que sai fica sem plano");
  assert.equal((saiu.keyword_subject_release as Row).via, "tirar_do_plano", "liberada pelo marcador");
  assert.equal(db.rows("minerador_keywords").filter(row => row.brand_id === BRAND).length, total + 2, "entram mesh e repetidor; nada é apagado");
  assert.ok(db.rows("minerador_keywords").every(row => !row.deleted_at));
  assert.equal(statusNaTela(porId(db, ids[2])), "em_revisao", "a aprovada que muda volta a Em revisão");
  assert.equal(statusNaTela(porId(db, ids[0])), "aprovado", "a que fica igual não é tocada");
});

/* ====================================================================== G8 */

async function gravarComoServidor(db: LinhaUnicaFakeDb, id: string, montar: (semantic: Row, row: Row) => Row) {
  const { rows } = await readDecisionKeywords(BRAND, [id], client(db));
  const atual = rows[0];
  const guardado = guardKeywordSemanticWrite(atual.analise_semantica, montar(atual.analise_semantica || {}, atual as unknown as Row));
  if (!guardado.ok) return guardado;
  const salvo = await constrainKeywordSnapshot(db.from("minerador_keywords").update({ analise_semantica: guardado.semantic }).eq("id", id).eq("brand_id", BRAND).is("deleted_at", null), atual).select("id").maybeSingle();
  return { ok: Boolean(salvo.data), code: null };
}

test("G8 · o Assunto nunca se perde: Lógica, Volume, Vínculo, KGR, Revisão e Posto em cada keyword do plano deixam `keyword_subject` intacto; só o marcador libera", async () => {
  const { db, ids } = await azulCadastrado();
  const antes = new Map(ids.map(id => [id, resolveKeywordSubject(semantica(porId(db, id)))]));
  await logica(db, ids);
  await medirVolume(db, ids, Object.fromEntries(PRINCIPAIS_AZUL.map((frase, index) => [frase, index * 100])));
  for (const id of ids) {
    assert.ok((await gravarComoServidor(db, id, semantic => setKeywordPageType(semantic, { pageType: "article", actorId: ACTOR, changedAt: LATER }).semantic)).ok, "Vínculo");
    assert.ok((await gravarComoServidor(db, id, semantic => setKgrApplicability(semantic, "applicable", { actorId: ACTOR, decidedAt: LATER }) as Row)).ok, "KGR");
    assert.ok((await gravarComoServidor(db, id, (semantic, row) => applyHumanReviewField({ semantic, intent: row.intent as string | null, field: "intencao", logicalValue: row.intent, decision: "keep_logic", actorId: ACTOR, decidedAt: LATER }).semantic)).ok, "Revisão");
  }
  const posto = await setKeywordPlanLockWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db as never, groupsClient: db as never, mode: "apply", keywordIds: ids, lock: "locked", importRequestId: novoPedido(), now: LATER });
  assert.ok(posto.ok, JSON.stringify(posto));
  for (const id of ids) {
    const depois = resolveKeywordSubject(semantica(porId(db, id)));
    const era = antes.get(id)!;
    assert.equal(depois.declared, true);
    assert.equal(depois.entry?.title, era.entry?.title);
    assert.deepEqual([depois.plan?.groupId, depois.plan?.order, depois.plan?.role], [era.plan?.groupId, era.plan?.order, era.plan?.role]);
    assert.equal(depois.plan?.lock, "locked", "o Posto grava a trava no plano, pelo núcleo do cadastro");
  }
  // Um gravador que monta a cópia SEM o Assunto (o antigo "Vínculo → Assunto: Não") tem o Assunto devolvido.
  const semChave = await gravarComoServidor(db, ids[0], semantic => { const copia = { ...semantic }; delete copia.keyword_subject; return copia; });
  assert.ok(semChave.ok);
  assert.equal(resolveKeywordSubject(semantica(porId(db, ids[0]))).declared, true);
  // Tirar o Assunto sem o marcador é recusado.
  const semMarcador = guardKeywordSemanticWrite(semantica(porId(db, ids[0])), { ...semantica(porId(db, ids[0])), keyword_subject: null });
  assert.equal(semMarcador.ok, false);
  assert.equal(!semMarcador.ok && semMarcador.code, "SUBJECT_RELEASE_REQUIRED");
});

/* ====================================================================== G9 */

function recibo(frases: Record<string, number | null>, subjectKeywordId: string, operationRequestId: string): SubjectSearchReceipt {
  const draft = buildSubjectSearchReceiptDraft({
    operationRequestId, batchId: "0b000000-0000-4000-8000-0000000000b1", subjectKeywordId, phrase: "internet fibra óptica", providerVersion: "v25",
    targeting: { language: "languageConstants/1014", geoTargetConstants: [], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false },
    googleAdsRequestIds: ["req-1"], executedAt: AT,
    candidates: Object.entries(frases).map(([keyword, media]) => ({ keyword, normalizedKeyword: normalizeKeyword(keyword), googleAds: { averageMonthlySearches: media, competition: "LOW", competitionIndex: 10, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: "BRL" } })),
  });
  return { ...draft, brandId: BRAND, actorId: ACTOR, candidateCount: Object.keys(draft.candidates).length } as SubjectSearchReceipt;
}

const porta = (valor: SubjectSearchReceipt): SubjectDiscoveryImportVolumePort => ({
  receipt: "found",
  decide: (key, existing) => subjectSearchVolumeDecision(valor, key, existing),
  verified: key => Boolean(valor.candidates[key]),
});

test("G9 · Pesquisa por Assunto com recibo: importar 3 sustentações grava o Volume com origem subject_search, roda a Lógica, não declara Assunto e não chama rede", async () => {
  const { db, ids } = await azulCadastrado();
  const pilar = ids[0];
  const busca = "0e000000-0000-4000-8000-0000000000a9";
  const valor = recibo({ "fibra óptica residencial": 720, "fibra óptica vale a pena": 390, "o que é fibra óptica": null }, pilar, busca);
  const pedido = SubjectDiscoveryImportRequestSchema.parse({ importRequestId: novoPedido(), searchId: busca, subjectKeywordId: pilar, subjectPhrase: "internet fibra óptica", items: ["fibra óptica residencial", "fibra óptica vale a pena", "o que é fibra óptica"].map(keyword => ({ keyword, origins: ["ads_keyword_seed"], evidence: [] })) });
  const resultado = await importSubjectDiscoveryWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(db), request: pedido, now: AT, volume: porta(valor), runLogic: async keywordIds => logica(db, keywordIds) });
  assert.ok(resultado.ok, JSON.stringify(resultado));
  if (!resultado.ok) return;
  assert.equal(resultado.counts.created, 3);
  assert.deepEqual(resultado.volume, { receipt: "found", written: 2, skipped: 1 });
  assert.equal(resultado.logic?.ran, true);
  for (const frase of ["fibra óptica residencial", "fibra óptica vale a pena", "o que é fibra óptica"]) {
    const row = linha(db, frase)!;
    assert.equal(resolveKeywordSubject(semantica(row)).declared, false, "nenhuma declaração de Assunto");
    assert.equal(semantica(row).dna_origem, "logico_deterministico", "a Lógica rodou");
    assert.deepEqual((semantica(row).subject_discovery as Row).subjectKeywordIds, [pilar]);
  }
  assert.equal(((semantica(linha(db, "fibra óptica residencial")!).volume_measurement) as Row).origin, SUBJECT_SEARCH_VOLUME_ORIGIN);
  assert.equal(linha(db, "o que é fibra óptica")!.volume_search, null, "a sem média nasce sem volume");
  assert.ok(!db.log.some(entry => entry.op === "rpc"), "nenhuma rota/RPC de declaração de Assunto");
  // F1 (A8): a tela da Pesquisa por Assunto não chama mais a rota aposentada `subjects/import` (410): zero chamada.
  for (const arquivo of ["modules/minerador/discovery/use-subject-search.ts", "modules/minerador/discovery/subject-search-dialogs.tsx", "modules/minerador/discovery/discovery-source-controls.tsx"]) {
    assert.doesNotMatch(codigo(arquivo), /subjects\/import/, arquivo);
  }
});

/* ===================================================================== G10 */

test("G10 · publicado: cadastro com destino \"Artigo publicado\" põe o Assunto na publicada (sem plano), URL/keyword/status intactos, o posto é o da publicação; aprovar não muda o status; o envio leva o Assunto", async () => {
  const db = wifiConecta();
  const pagina = linha(db, "internet fibra empresarial")!;
  const antes = { keyword: pagina.keyword, status: pagina.status, origem: JSON.stringify(semantica(pagina).site_origin) };
  const pedido = { text: null, plan: { silo: null, articles: [{ order: 1, subject: "Fibra para empresas: o que muda no contrato", principal: "fibra para empresas", role: "Suporte" as const, scope: "Reforçar SLA, IP fixo e suporte dedicado." }] }, destination: { kind: "published" as const, url: PAGINA_URL }, group: { mode: "new" as const, color: "azul", name: null } };
  const aplicado = await cadastro(db, { ...pedido, mode: "apply", importRequestId: novoPedido() });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  const depois = linha(db, "internet fibra empresarial")!;
  assert.deepEqual({ keyword: depois.keyword, status: depois.status, origem: JSON.stringify(semantica(depois).site_origin) }, antes, "URL/slug/canonical, keyword e status intactos");
  const assunto = resolveKeywordSubject(semantica(depois));
  assert.equal(assunto.declared, true);
  assert.equal(assunto.plan, null, "publicado não entra em plano de Silo");
  assert.equal(resolveKeywordPlanLock({ keywordId: String(depois.id), status: String(depois.status), semantic: semantica(depois) }), null, "o posto é o da publicação, não a trava do plano");
  const entrada = keywordDecisionEntries((await readDecisionKeywords(BRAND, [String(depois.id)], client(db))).rows, "approve")[0];
  // Sem a Lógica, a publicada continua protegida (só envia); com a Lógica e a coluna `aprovado`, o pacote pode ser re-assinado (2026-10-18, F4).
  assert.equal(entrada.outcome, "blocked");
  assert.match(entrada.blockers[0], /publicado é protegido/);
  const arquiteto = arquitetoFalso(db);
  const { resultado } = await aprovarEEnviar(db, arquiteto, [String(depois.id)]);
  assert.equal(resultado.results[0].outcome, "sent", JSON.stringify(resultado.results));
  assert.equal(linha(db, "internet fibra empresarial")!.status, "aprovado", "o status da publicada não mudou");
  assert.equal(readArchitectSubjectStanding(arquiteto.mesa.get(String(depois.id))!).declared, true, "o Assunto chega ao Arquiteto na publicada");
});

/* ===================================================================== G11 */

test("G11 · keyword solta (sem grupo, sem Assunto): o caminho do G1, e chega ao Arquiteto como solta (sem plano)", async () => {
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [], minerador_keyword_lists: [] });
  const importado = await importar(db, ["roteador wi-fi 6"]);
  const id = String(importado.items[0].keywordId);
  await logica(db, [id]);
  await medirVolume(db, [id], { "roteador wi-fi 6": 2400 });
  const arquiteto = arquitetoFalso(db);
  const { resultado } = await aprovarEEnviar(db, arquiteto, [id]);
  assert.equal(resultado.counts.approved_and_sent, 1);
  const standing = readArchitectSubjectStanding(arquiteto.mesa.get(id)!);
  assert.deepEqual([standing.declared, standing.plan, porId(db, id).group_id], [false, null, null]);
  assert.equal(standing.volumeValidated, true);
});

/* ===================================================================== G12 */

const T1 = "6d5d87cd-3f0f-4431-bef4-81285715db0e";
const K1 = "3048743b-0000-4000-8000-000000000001";
const LARANJA = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";

function formatoAnterior(): LinhaUnicaFakeDb {
  const titulo = { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null }, keyword_subject_actor: ACTOR, keyword_subject_at: "2026-10-12T16:00:00+00:00", keyword_subject_origin: "import" };
  const logicaGravada = { dna_origem: "logico_deterministico", intencao_principal: "Comercial" };
  return new LinhaUnicaFakeDb({
    editorial_groups: [{ id: LARANJA, marca_id: BRAND, name: "laranja", color: "laranja", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT }],
    editorial_group_events: [], editorial_group_articles: [], brand_site_catalog_entries: [], editorial_workflow_items: [],
    minerador_keywords: [
      kw(T1, "Claro, Vivo ou TIM: qual internet residencial escolher?", { status: "aprovado", group_id: LARANJA, analise_semantica: { ...logicaGravada, ...titulo } }),
      kw(K1, "claro ou vivo", { status: "aprovado", group_id: LARANJA, volume_search: 590, analise_semantica: { ...logicaGravada, ...MEDIDA(590), subject_discovery: { subjectKeywordIds: [T1] } } }),
    ],
    editorial_artifact_versions: [
      { marca_id: BRAND, artifact_type: "article_dna", entity_id: T1, version_number: 1, created_at: AT, payload: { articleId: T1, principalKeywordId: K1, secondaryKeywordIds: [], narrativeReinforcementIds: [], hierarchy: "Pilar", promise: "Cobrir com clareza o tema.", subject: { keywordId: T1, phrase: "x" } } },
    ],
  });
}

test("G12 · formato anterior: a conversão passa o Assunto para a principal; a linha-título fica viva e intocada; a D2 vale só para a linha anterior", async () => {
  const db = formatoAnterior();
  const tituloAntes = JSON.stringify(porId(db, T1));
  const lido = await readConversionDraftWithCore({ brandId: BRAND, keywordsClient: db as never, groupsClient: db as never, groupId: LARANJA });
  assert.ok(lido.ok, lido.ok ? "" : lido.reason);
  if (!lido.ok) return;
  const rows: ConversionRowInput[] = lido.draft.rows.map(row => ({ fromKeywordId: row.fromKeywordId, articleId: row.articleId, order: row.order, role: row.role, title: row.title, keyword: row.suggestedKeyword ?? "", scope: row.scope || "Comparar operadoras.", lock: "auto" }));
  assert.equal(rows[0]?.keyword, "claro ou vivo");
  const aplicado = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db as never, groupsClient: db as never, mode: "apply", groupId: LARANJA, silo: lido.draft.silo ?? { name: "Planos", slug: "planos", objective: null }, rows, importRequestId: novoPedido(), followUp: null, now: AT });
  assert.ok(aplicado.ok && aplicado.mode === "apply", aplicado.ok ? "" : `${aplicado.reason} ${(aplicado.blockers || []).join(" | ")}`);
  const principal = semantica(porId(db, K1));
  const assunto = resolveKeywordSubject(principal);
  assert.equal(assunto.entry?.title, "Claro, Vivo ou TIM: qual internet residencial escolher?");
  assert.equal(assunto.plan?.declaredPrincipal?.keywordId, K1);
  assert.equal(JSON.stringify(porId(db, T1)), tituloAntes, "a linha-título fica viva e intocada");
  assert.equal(porId(db, T1).deleted_at, null);
  // D2 só para a linha anterior: sem Lógica, a linha-título recusa pela D2; a convertida, pela D2-bis.
  const semLogica = (semantic: Row) => { const copia = { ...semantic }; delete copia.dna_origem; return copia; };
  assert.equal(resolveApprovalReadiness({ semantic: semLogica(semantica(porId(db, T1))) }).reason, SUBJECT_APPROVAL_REASON);
  assert.equal(resolveApprovalReadiness({ semantic: semLogica(principal) }).reason, DECLARED_PRINCIPAL_APPROVAL_REASON);
});

/* ===================================================================== G13 */

test("G13 · hoje: Lógica do navegador × escrita do servidor na mesma keyword — o navegador grava da cópia velha, sem conferência, e apaga o que o servidor gravou; o núcleo do servidor recusa (stale)", async () => {
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [kw("70000000-0000-4000-8000-000000000001", "internet para home office")], minerador_keyword_lists: [] });
  const id = "70000000-0000-4000-8000-000000000001";
  const copiaDaTela = structuredClone(porId(db, id));
  // O MCP grava o Vínculo depois que a tela carregou.
  assert.ok((await gravarComoServidor(db, id, semantic => setKeywordPageType(semantic, { pageType: "article", actorId: ACTOR, changedAt: LATER }).semantic)).ok);
  assert.ok(semantica(porId(db, id)).keyword_page_type, "o Vínculo do MCP está gravado");
  // O botão Lógica do navegador (`processLogicalKeywordDna`): deriva da cópia da tela e grava sem compare-and-swap.
  const derivado = deriveLogicalKeywordBatchItem(copiaDaTela as never, null, LATER);
  await db.from("minerador_keywords").update({ intent: derivado.update.intent, analise_semantica: semanticForKeywordWrite(semantica(copiaDaTela), derivado.update.analise_semantica) }).eq("id", id).eq("brand_id", BRAND).is("deleted_at", null);
  assert.equal(semantica(porId(db, id)).keyword_page_type, undefined, "a escrita do MCP foi apagada em silêncio");

  // O núcleo do servidor, com escrita concorrente entre a leitura e a gravação: recusa, nada é apagado.
  const db2 = new LinhaUnicaFakeDb({ minerador_keywords: [kw(id, "internet para home office")], minerador_keyword_lists: [] });
  let concorrente = false;
  db2.beforeWrite = (table, op, alvo) => {
    if (concorrente || table !== "minerador_keywords" || op !== "update") return;
    concorrente = true;
    for (const row of alvo) row.analise_semantica = setKeywordPageType(semantica(row), { pageType: "article", actorId: ACTOR, changedAt: LATER }).semantic;
  };
  const rodada = await logica(db2, [id]);
  assert.equal(rodada.results[0].outcome, "stale");
  assert.ok(semantica(porId(db2, id)).keyword_page_type, "a escrita concorrente ficou");
});

test("G13 · concorrência: o botão Lógica não apaga o que o MCP gravou", { todo: "vermelho até a F3 (A3): o botão Lógica chama `runKeywordLogicWithCore` (compare-and-swap e releitura)" }, async () => {
  const fonte = codigo("modules/minerador/minerador-workspace.tsx");
  const inicio = fonte.indexOf("const processLogicalKeywordDna");
  const corpo = fonte.slice(inicio, fonte.indexOf("\n  };\n", inicio));
  assert.ok(inicio >= 0 && corpo.length > 100);
  assert.doesNotMatch(corpo, /\.from\("minerador_keywords"\)\s*\.update\(/, "o navegador não grava a Lógica");
});

/* ===================================================================== G14 */

test("G14 · hoje: abrir a tela grava o nicho da lista (pelo 1º texto) e a Lógica do servidor passa a dar outro nicho para as outras keywords da lista", async () => {
  const listaId = "60000000-0000-4000-8000-000000000001";
  const montar = () => new LinhaUnicaFakeDb({
    minerador_keyword_lists: [{ id: listaId, marca_id: BRAND, nome: "Lista", nicho: null }],
    minerador_keywords: [kw("71000000-0000-4000-8000-000000000001", "clareamento dental", { lista_id: listaId }), kw("71000000-0000-4000-8000-000000000002", "marketing digital", { lista_id: listaId })],
  });
  const fechada = montar();
  await logica(fechada, ["71000000-0000-4000-8000-000000000002"]);
  assert.equal(semantica(porId(fechada, "71000000-0000-4000-8000-000000000002")).nicho, "Marketing");
  // O `fetchData` da tela: lista sem nicho → grava `autoDetectNiche` do 1º texto (o mesmo cálculo, com a porta falsa do banco).
  const aberta = montar();
  const lista = aberta.rows("minerador_keyword_lists")[0];
  const primeira = aberta.rows("minerador_keywords").find(row => row.lista_id === listaId)!;
  await aberta.from("minerador_keyword_lists").update({ nicho: autoDetectNiche(String(primeira.keyword)) }).eq("id", lista.id).eq("marca_id", BRAND);
  assert.equal(aberta.writes("minerador_keyword_lists").length, 1, "abrir a tela gravou");
  await logica(aberta, ["71000000-0000-4000-8000-000000000002"]);
  assert.equal(semantica(porId(aberta, "71000000-0000-4000-8000-000000000002")).nicho, "Odontologia", "a Lógica do servidor mudou de nicho depois que alguém abriu a tela");
  const tela = codigo("modules/minerador/minerador-workspace.tsx").replace(/\r\n/g, "\n");
  assert.match(tela, /const detectedNicho = autoDetectNiche\(listKws\[0\]\.keyword\);\s*await supabase\s*\.from\("minerador_keyword_lists"\)\s*\.update\(\{ nicho: detectedNicho \}\)/);
});

test("G14 · abrir a tela não grava", { todo: "vermelho até a F3 (A6/D3): sai a escrita do nicho no carregamento; o nicho vira proposta confirmada" }, async () => {
  const tela = codigo("modules/minerador/minerador-workspace.tsx");
  assert.doesNotMatch(tela, /\.from\("minerador_keyword_lists"\)\s*\.update\(\{ nicho: detectedNicho \}\)/);
});

/* ===================================================================== G15 */

test("G15 · exclusão: não publicada sai de vez; publicada vai à lixeira por 24 h; a do plano, SEM a liberação, é recusada pelo banco (KEYWORD_DELETE_SUBJECT_PROTECTED; a exclusão comum libera pelo núcleo da cor — G18); excluir lista não apaga keyword", async () => {
  const { db, ids } = await azulCadastrado();
  const solta = linha(db, KEYWORD_DO_SILO)!;
  const publicada = linha(db, "internet fibra empresarial")!;
  const plano = porId(db, ids[0]);
  // F1 (P-8): o espelho do cliente (`assessKeywordHardDelete`, `recoverablePurgeAfter`) saiu, sem uso em
  // produção; a regra é conferida no gravador, a RPC do ciclo de vida, com a leitura viva da publicação.
  assert.equal(isKeywordPublished({ status: String(solta.status), semantic: semantica(solta) }), false, "não publicada");
  assert.equal(isKeywordPublished({ status: String(publicada.status), semantic: semantica(publicada) }), true, "publicada");
  const rpc = cru("supabase/migrations/20260921100000_exclusao_publicada_exige_declaracao.sql");
  assert.match(rpc, /IF public\.lifecycle_keyword_is_published\(p_brand_id, current_keyword\.id\) THEN\s+UPDATE public\.minerador_keywords\s+SET deleted_at = current_timestamp, purge_after = current_timestamp \+ interval '24 hours'/, "publicada: só pelo fluxo recuperável, lixeira de 24 h");
  assert.match(rpc, /DELETE FROM public\.minerador_keywords WHERE brand_id = p_brand_id AND id = current_keyword\.id;/, "não publicada: exclusão definitiva");
  assert.equal(keywordSubjectBlocksDeletion(semantica(plano)), true, "a do plano é recusada (espelho do gatilho)");
  assert.equal(keywordSubjectBlocksDeletion(semantica(solta)), false);
  const migration = cru("supabase/migrations/20261015120000_assunto_nunca_se_perde.sql");
  assert.match(migration, /KEYWORD_DELETE_SUBJECT_PROTECTED/);
  const fk = cru("supabase/migrations/0005_tenant_ownership_and_rls.sql");
  assert.match(fk, /FOREIGN KEY \(lista_id\) REFERENCES public\.listas_kgr\(id\) ON DELETE RESTRICT/, "lista → keyword: RESTRICT");
  // 2026-10-17 (P-4): a rota chama o núcleo da exclusão, que grava pela RPC do ciclo de vida de sempre.
  const rota = codigo("app/api/minerador/marcas/[brandId]/keywords/delete/route.ts");
  assert.match(rota, /applyKeywordDeleteWithCore\(\{/, "a rota passa pelo núcleo");
  const nucleo = codigo("lib/minerador/keyword-delete-core.ts");
  assert.match(nucleo, /KEYWORD_DELETE_RPC = "lifecycle_delete_minerador_keywords"/);
  assert.match(nucleo, /input\.client\.rpc\(KEYWORD_DELETE_RPC, \{/, "o gravador é a RPC do ciclo de vida");
});

/* ===================================================================== G18 */

/*
 * 2026-10-17 · o dono: "não está deixando apagar no Minerador, ele tem que
 * deixar apagar todo o grupo, isso está no contrato global" (e, em 14/10, "só
 * com selecionar já está bom"). A MESMA linha ganha o caso: a exclusão de
 * sempre (selecionar → Excluir) manda a keyword que carrega o plano ao MESMO
 * núcleo de "Excluir tudo da cor" (a RPC da M-E libera o Assunto e exclui na
 * mesma transação; o plano ganha a versão nova; o histórico do grupo registra;
 * a D7 vale) e confere pela MESMA regra da confirmação (P-4 da SDD).
 */

/** O ciclo de vida do banco, em memória: as RPCs de sempre e a da M-E (o espelho do SQL) e o gatilho do Assunto. */
function cicloDeVidaNoBanco(db: LinhaUnicaFakeDb, opcoes: { meAplicada?: boolean } = {}) {
  const publicada = (row: Row) => isKeywordPublished({ status: String(row.status || ""), semantic: semantica(row) });
  const erro = (message: string, code = "P0001") => ({ data: null, error: { code, message } });
  // `lifecycle_delete_minerador_keywords` (20260921100000) + o gatilho `minerador_keywords_recusa_exclusao_com_assunto`.
  const ciclo = (brandId: string, ids: string[], allowRecoverable: boolean): { data: unknown; error: unknown } => {
    const linhas = ids.map(id => db.rows("minerador_keywords").find(row => row.id === id && row.brand_id === brandId && !row.deleted_at));
    if (linhas.some(row => !row)) return erro("KEYWORD_DELETE_NOT_FOUND");
    const publicadas = (linhas as Row[]).filter(publicada);
    if (publicadas.length && !allowRecoverable) return erro(`KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW: ${publicadas.map(row => row.keyword).join(", ")}`);
    const hard: string[] = [];
    const recoverable: string[] = [];
    for (const row of linhas as Row[]) {
      if (keywordSubjectBlocksDeletion(semantica(row))) return erro(`KEYWORD_DELETE_SUBJECT_PROTECTED: a keyword "${row.keyword}" carrega o Assunto do plano do Silo.`);
      if (publicada(row)) { row.deleted_at = LATER; row.purge_after = "2026-10-17T15:00:00.000Z"; recoverable.push(String(row.id)); }
      else hard.push(String(row.id));
    }
    db.tables.minerador_keywords = db.rows("minerador_keywords").filter(row => !hard.includes(String(row.id)));
    return { data: { hardDeletedIds: hard.sort(), recoverableIds: recoverable.sort(), partialDelete: false }, error: null };
  };
  // Uma transação: qualquer recusa desfaz tudo o que a chamada escreveu (inclusive a liberação).
  const transacao = (corpo: () => { data: unknown; error: unknown }) => {
    const foto = structuredClone(db.tables.minerador_keywords);
    const resultado = corpo();
    if (resultado.error) db.tables.minerador_keywords = foto;
    return resultado;
  };
  db.rpcs.lifecycle_preview_minerador_keywords = args => ({
    data: {
      items: ((args.p_keyword_ids as string[]) ?? []).map(id => {
        const row = db.rows("minerador_keywords").find(item => item.id === id && item.brand_id === args.p_brand_id);
        return { root: { id, label: row?.keyword ?? "" }, mode: row && publicada(row) ? "recoverable" : "hard", recoveryState: row?.deleted_at ? "recoverable" : "active" };
      }),
    },
    error: null,
  });
  db.rpcs.lifecycle_delete_minerador_keywords = args => transacao(() => ciclo(String(args.p_brand_id), [...new Set((args.p_keyword_ids as string[]) ?? [])], args.p_allow_recoverable === true));
  if (opcoes.meAplicada === false) return;
  db.rpcs.lifecycle_delete_group_keywords_contract = () => ({ data: { operation: "lifecycle_delete_group_keywords", version: 1, maxIds: 100, via: GROUP_DELETE_ALL_RELEASE_VIA }, error: null });
  // `lifecycle_delete_group_keywords` (M-E 20261016130000): libera o Assunto e chama a exclusão de sempre, na mesma transação.
  db.rpcs.lifecycle_delete_group_keywords = args => transacao(() => {
    const ids = [...new Set((args.p_keyword_ids as string[]) ?? [])].sort();
    if (!ids.length || ids.length > 100) return erro("GROUP_DELETE_INVALID");
    if (!db.rows("editorial_groups").some(grupo => grupo.id === args.p_group_id && grupo.marca_id === args.p_brand_id)) return erro("GROUP_DELETE_OUTSIDE_GROUP");
    const vivas = db.rows("minerador_keywords").filter(row => row.brand_id === args.p_brand_id && ids.includes(String(row.id)) && row.group_id === args.p_group_id && !row.deleted_at);
    if (vivas.length !== ids.length) return erro("GROUP_DELETE_OUTSIDE_GROUP");
    const liberadas: string[] = [];
    for (const row of vivas) {
      const antes = semantica(row);
      const depois = liberacaoDaCor(antes, { actorId: String(args.p_actor_user_id), requestId: String(args.p_request_id), at: LATER });
      if (depois !== antes) { row.analise_semantica = depois; liberadas.push(String(row.id)); }
    }
    const resultado = ciclo(String(args.p_brand_id), ids, args.p_allow_recoverable === true);
    if (resultado.error) return resultado;
    return { data: { ...(resultado.data as Row), releasedSubjectIds: liberadas.sort(), requestId: args.p_request_id, groupId: args.p_group_id, via: GROUP_DELETE_ALL_RELEASE_VIA }, error: null };
  });
}

const excluirPreview = (db: LinhaUnicaFakeDb, keywordIds: string[]) => previewKeywordDeleteWithCore({ client: client(db), brandId: BRAND, actorUserId: ACTOR, keywordIds });
const excluir = (db: LinhaUnicaFakeDb, keywordIds: string[], input: { decisionHash: string | null; allowRecoverable?: boolean; typed: Record<string, unknown> }) => {
  let n = 0;
  return applyKeywordDeleteWithCore({ client: client(db), brandId: BRAND, actorUserId: ACTOR, keywordIds, allowRecoverable: input.allowRecoverable ?? false, decisionHash: input.decisionHash, typed: input.typed, requestId: () => `7c000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
};
const exclusoesNoBanco = (db: LinhaUnicaFakeDb) => db.log.filter(entrada => entrada.op === "rpc" && (entrada.table === "lifecycle_delete_minerador_keywords" || entrada.table === "lifecycle_delete_group_keywords")).length;
const escritasForaDeRpc = (db: LinhaUnicaFakeDb) => db.writes().filter(entrada => entrada.op !== "rpc").length;

test("G18 · selecionar keywords do plano e Excluir (a exclusão de sempre): a prévia avisa que saem do plano, pede a confirmação forte (a cor, “apaga de vez” e o nome da publicada), o plano ganha a versão nova, as do plano e a solta saem de vez, a publicada vai à lixeira de 24 h; a outra marca e o Assunto das não selecionadas ficam intactos", async () => {
  const { db, ids } = await azulCadastrado();
  cicloDeVidaNoBanco(db);
  const importado = await importar(db, ["roteador wifi 6 vale a pena"]);
  const solta = String(importado.items[0].keywordId);
  const publicada = String(linha(db, "internet fibra empresarial")!.id);
  const outraMarcaAntes = JSON.stringify(db.rows("minerador_keywords").filter(row => row.brand_id === OTHER_BRAND));
  const naoSelecionadas = [ids[0], ids[2], ids[4], ids[5], ids[6]];
  const assuntoAntes = new Map(naoSelecionadas.map(id => [id, JSON.stringify(semantica(porId(db, id)).keyword_subject)]));
  const versaoAntes = Number(db.rows("editorial_groups").find(grupo => grupo.id === AZUL)!.plan_version);
  const selecao = [ids[1], ids[3], solta, publicada];

  // 1. A prévia (grátis, só leitura): não recusa; diz o que sai do plano e pede a confirmação forte.
  const escritasAntes = escritasForaDeRpc(db);
  const previa = await excluirPreview(db, selecao);
  assert.ok(previa.ok, JSON.stringify(previa));
  if (!previa.ok) return;
  const p = previa.preview;
  assert.match(previa.decisionHash, /^sha256:/);
  assert.equal(escritasForaDeRpc(db), escritasAntes, "a prévia não grava");
  assert.equal(exclusoesNoBanco(db), 0, "a prévia não exclui");
  assert.deepEqual(p.colors.map(cor => [cor.groupId, cor.keywordIds]), [[AZUL, [ids[1], ids[3]].sort()]], "as do plano vão ao núcleo da cor Azul");
  const cor = p.colors[0].preview;
  assert.deepEqual(cor.releasedSubjects.map(item => item.keywordId).sort(), [ids[1], ids[3]].sort(), "as duas saem do plano");
  assert.deepEqual(cor.plan, { hasPlan: true, articlesNow: 7, articlesLeaving: 2, articlesStaying: 5, after: "reduced", nextPlanVersion: versaoAntes + 1 });
  assert.equal(cor.color.freedAtEnd, false);
  assert.ok(cor.color.keptBecause.some(item => /6 keywords da cor não estão na seleção e ficam/.test(item)), JSON.stringify(cor.color.keptBecause));
  assert.deepEqual(p.free, { hard: [solta], recoverable: [publicada] });
  assert.deepEqual(p.out, []);
  assert.deepEqual(p.confirmation, { selectionName: null, colorWords: ["azul"], hardPhrase: "apaga de vez", publishedNames: [{ id: publicada, keyword: "internet fibra empresarial" }] });
  assert.ok(p.effects.some(efeito => efeito.startsWith(`Cor Azul: 2 keywords saem do plano (o Assunto é liberado e apagado na mesma transação); o plano do Silo passa para a v${versaoAntes + 1} com 5 artigos; a cor Azul continua ocupada`)), JSON.stringify(p.effects));
  // SUBSTITUÍDO (dono, 2026-10-18): o aviso "O Arquiteto não exclui keyword (F4)" saiu; tudo pode
  // ser apagado, e a prévia diz que as versões dos artefatos ficam como histórico.
  assert.ok(!p.effects.some(efeito => /O Arquiteto não exclui keyword \(F4\)/.test(efeito)), "a recusa F4 saiu da prévia");
  assert.ok(p.effects.some(efeito => /ficam como histórico \(não são apagadas\)/.test(efeito)), JSON.stringify(p.effects));
  assert.ok(p.effects.some(efeito => /3 keywords não publicadas são apagadas DE VEZ/.test(efeito)));
  assert.ok(p.effects.some(efeito => /1 publicada vai para a lixeira de 24 h/.test(efeito)));
  assert.deepEqual([...p.publishedIds], [publicada]);
  assert.equal(p.requiresRecoverableConfirmation, true);

  // 2. Sem a decisão certa, nada começa.
  const certo = { colors: { azul: "  Azul " }, phrase: "Apaga de vez", publishedNames: { [publicada]: "internet fibra empresarial" } };
  for (const [entrada, codigoEsperado] of [
    [{ decisionHash: previa.decisionHash, allowRecoverable: true, typed: { selection: "4 keywords selecionadas" } }, "CONFIRMATION_REQUIRED"],
    [{ decisionHash: previa.decisionHash, allowRecoverable: true, typed: { ...certo, colors: { azul: "verde" } } }, "CONFIRMATION_REQUIRED"],
    [{ decisionHash: previa.decisionHash, allowRecoverable: false, typed: certo }, "KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW"],
    [{ decisionHash: "sha256:outra", allowRecoverable: true, typed: certo }, "DECISION_STALE"],
    [{ decisionHash: null, allowRecoverable: true, typed: certo }, "DECISION_REQUIRED"],
  ] as const) {
    const recusa = await excluir(db, selecao, entrada as never);
    assert.ok(!recusa.ok && recusa.code === codigoEsperado, `${codigoEsperado}: ${JSON.stringify(recusa).slice(0, 300)}`);
  }
  assert.equal(exclusoesNoBanco(db), 0, "nenhuma recusa chega ao banco");
  assert.ok(porId(db, ids[1]) && resolveKeywordSubject(semantica(porId(db, ids[1]))).plan, "nada mudou");

  // 3. Confirmado: as do plano saem do plano e de vez, a solta de vez, a publicada para a lixeira.
  const feito = await excluir(db, selecao, { decisionHash: previa.decisionHash, allowRecoverable: true, typed: certo });
  assert.ok(feito.ok && feito.complete, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual([...feito.hardDeletedIds].sort(), [ids[1], ids[3], solta].sort());
  assert.deepEqual(feito.recoverableIds, [publicada]);
  assert.deepEqual([...feito.releasedSubjectIds].sort(), [ids[1], ids[3]].sort());
  assert.equal(feito.readback.confirmed, true);
  for (const id of [ids[1], ids[3], solta]) assert.equal(db.rows("minerador_keywords").some(row => row.id === id), false, `${id} saiu de vez`);
  assert.ok(porId(db, publicada).deleted_at, "a publicada está na lixeira de 24 h (restaurável), não sumiu");
  const grupo = db.rows("editorial_groups").find(item => item.id === AZUL)!;
  assert.equal(grupo.plan_version, versaoAntes + 1, "o plano do grupo ganhou a versão nova");
  assert.equal((grupo.plan as Row).articleCount, 5);
  assert.equal(grupo.status, "active", "sobrou coisa: a cor continua ocupada");
  assert.deepEqual(feito.colors.map(item => [item.groupId, item.outcome, item.plan && item.plan.ok ? item.plan.outcome : null, item.colorFreed]), [[AZUL, "done", "reduced", false]]);
  // O Assunto das não selecionadas: intacto, byte a byte. A outra marca: intacta.
  for (const id of naoSelecionadas) assert.equal(JSON.stringify(semantica(porId(db, id)).keyword_subject), assuntoAntes.get(id), id);
  assert.equal(JSON.stringify(db.rows("minerador_keywords").filter(row => row.brand_id === OTHER_BRAND)), outraMarcaAntes);
  // O histórico do grupo: o nome da exclusão comum, as contagens e o plano.
  const eventos = db.rows("editorial_group_events").filter(evento => evento.group_id === AZUL);
  const saida = eventos.find(evento => evento.event_type === "keywords_unassigned")!;
  assert.equal((saida.payload as Row).operation, GROUP_DELETE_SELECTION_ACTION_LABEL);
  assert.deepEqual(((saida.payload as Row).counts as Row), { hardDeleted: 2, recoverable: 0, out: 0, refusedBlocks: 0, refusedKeywords: 0 });
  assert.match(groupEventHistoryEntry({ ...saida, occurred_at: LATER })?.detail || "", /^Excluir as selecionadas · 2 apagada\(s\) de vez · 0 na lixeira de 24 h/);
  const plano = eventos.find(evento => evento.event_type === "plan_changed" && (evento.payload as Row).via === GROUP_DELETE_ALL_RELEASE_VIA)!;
  assert.equal((plano.payload as Row).operation, GROUP_DELETE_SELECTION_ACTION_LABEL);
});

test("G18 · selecionar a cor INTEIRA e Excluir = “Excluir tudo da cor”: a mesma prévia (o que sai, o plano limpo, a cor livre), as keywords apagadas e a cor liberada (D7); a outra marca intacta", async () => {
  const { db } = await azulCadastrado();
  cicloDeVidaNoBanco(db);
  const daCor = db.rows("minerador_keywords").filter(row => row.brand_id === BRAND && row.group_id === AZUL && !row.deleted_at).map(row => String(row.id)).sort();
  assert.equal(daCor.length, 8, "7 do plano + a keyword do Silo");
  const outraMarcaAntes = JSON.stringify(db.rows("minerador_keywords").filter(row => row.brand_id === OTHER_BRAND));

  const daSelecao = await excluirPreview(db, daCor);
  const daCorInteira = await previewGroupDeleteAllWithCore({ client: client(db), brandId: BRAND, actorUserId: ACTOR, groupId: AZUL, includePublished: true });
  assert.ok(daSelecao.ok && daCorInteira.ok, JSON.stringify(daSelecao));
  if (!daSelecao.ok || !daCorInteira.ok) return;
  const sel = daSelecao.preview.colors[0].preview;
  const tudo = daCorInteira.preview;
  for (const campo of ["hard", "recoverable", "out", "releasedSubjects", "blocks", "plan", "color", "confirmation"] as const) {
    assert.deepEqual(sel[campo], tudo[campo], `a mesma prévia: ${campo}`);
  }
  assert.equal(sel.plan.after, "cleared");
  assert.equal(sel.color.freedAtEnd, true);
  assert.deepEqual(daSelecao.preview.confirmation, { selectionName: null, colorWords: ["azul"], hardPhrase: "apaga de vez", publishedNames: [] });
  assert.deepEqual(daSelecao.preview.free, { hard: [], recoverable: [] }, "a cor inteira vai pelo núcleo da cor");

  const feito = await excluir(db, daCor, { decisionHash: daSelecao.decisionHash, typed: { colors: { azul: "azul" }, phrase: "apaga de vez" } });
  assert.ok(feito.ok && feito.complete, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual([...feito.hardDeletedIds].sort(), daCor);
  assert.equal(db.rows("minerador_keywords").filter(row => row.brand_id === BRAND && row.group_id === AZUL).length, 0, "nada da cor ficou");
  const grupo = db.rows("editorial_groups").find(item => item.id === AZUL)!;
  assert.equal(grupo.plan, null, "plano limpo (um plano sem artigos não existe)");
  assert.equal(grupo.status, "archived", "D7: nada ficou, a cor está livre");
  assert.deepEqual(feito.colors.map(item => [item.outcome, item.plan && item.plan.ok ? item.plan.outcome : null, item.colorFreed]), [["done", "cleared", true]]);
  assert.equal(JSON.stringify(db.rows("minerador_keywords").filter(row => row.brand_id === OTHER_BRAND)), outraMarcaAntes);
});

test("G18 · sem a M-E no banco: a keyword do plano fica fora com a explicação (nada dela muda) e o resto da seleção sai como sempre, com a confirmação simples", async () => {
  const { db, ids } = await azulCadastrado();
  cicloDeVidaNoBanco(db, { meAplicada: false });
  const importado = await importar(db, ["roteador wifi 6 vale a pena"]);
  const solta = String(importado.items[0].keywordId);
  const assuntoAntes = JSON.stringify(semantica(porId(db, ids[1])));
  const previa = await excluirPreview(db, [ids[1], solta]);
  assert.ok(previa.ok);
  if (!previa.ok) return;
  assert.deepEqual(previa.preview.colors, []);
  assert.deepEqual(previa.preview.out.map(item => [item.id, item.reason]), [[ids[1], "plan_delete_unavailable"]]);
  assert.match(previa.preview.out[0].message, /migration 20261016130000_excluir_tudo_da_cor, que ainda não foi aplicada/);
  assert.match(previa.preview.unavailableMessage || "", /não foi aplicada/);
  assert.deepEqual(previa.preview.free, { hard: [solta], recoverable: [] });
  assert.deepEqual(previa.preview.confirmation, { selectionName: "2 keywords selecionadas", colorWords: [], hardPhrase: null, publishedNames: [] }, "sem plano a sair e até 10: a confirmação simples de sempre");
  const feito = await excluir(db, [ids[1], solta], { decisionHash: previa.decisionHash, typed: { selection: "2 keywords selecionadas" } });
  assert.ok(feito.ok && feito.complete, JSON.stringify(feito));
  if (!feito.ok) return;
  assert.deepEqual(feito.hardDeletedIds, [solta]);
  assert.equal(JSON.stringify(semantica(porId(db, ids[1]))), assuntoAntes, "a do plano ficou como estava");
  assert.equal(db.log.some(entrada => entrada.op === "rpc" && entrada.table === "lifecycle_delete_group_keywords"), false);
});

test("G18 · a regra única da confirmação (P-4): simples até 10 sem plano; forte acima de 10, com plano a sair ou na cor inteira — a mesma função na tela, no servidor e em “Excluir tudo da cor”", () => {
  const publicadas = [{ id: "p1", keyword: "internet fibra empresarial" }];
  assert.deepEqual(deleteConfirmationRequirement({ selectionName: "10 keywords selecionadas", colorWords: [], hardCount: 10, recoverable: [] }), { selectionName: "10 keywords selecionadas", colorWords: [], hardPhrase: null, publishedNames: [] });
  assert.equal(DELETE_STRONG_CONFIRMATION_ABOVE, 10);
  assert.deepEqual(deleteConfirmationRequirement({ selectionName: "11 keywords selecionadas", colorWords: [], hardCount: 11, recoverable: [] }), { selectionName: null, colorWords: [], hardPhrase: "apaga de vez", publishedNames: [] });
  const comPlano = deleteConfirmationRequirement({ selectionName: "x", colorWords: ["amarelo"], hardCount: 1, recoverable: publicadas });
  assert.deepEqual(comPlano, { selectionName: null, colorWords: ["amarelo"], hardPhrase: "apaga de vez", publishedNames: publicadas });
  assert.deepEqual(checkDeleteConfirmation(comPlano, { colors: { amarelo: " AMARELO " }, phrase: "apaga de vez", publishedNames: { p1: "Internet fibra empresarial" } }), { ok: true });
  const falta = checkDeleteConfirmation(comPlano, { colors: { amarelo: "amarelo" } });
  assert.ok(!falta.ok && /falta digitar “apaga de vez”, o nome da publicada “internet fibra empresarial”/.test(falta.message));
  assert.deepEqual(checkDeleteConfirmation({ selectionName: "wifi lento", colorWords: [], hardPhrase: null, publishedNames: [] }, { selection: " WiFi Lento " }), { ok: true });
  // Uma regra só: a da cor e a comum chamam a MESMA função (o código, sem comentários).
  const cor = codigo("lib/minerador/group-delete-all.ts");
  assert.match(cor, /return checkDeleteConfirmation\(/);
  assert.match(cor, /deleteConfirmationRequirement\(\{ selectionName: colorWord, colorWords: \[colorWord\], hardCount: hard\.length, recoverable, alwaysStrong: true \}\)/);
  assert.match(codigo("lib/minerador/keyword-delete-core.ts"), /checkDeleteConfirmation\(preview\.confirmation, input\.typed \?\? \{\}\)/);
  assert.match(codigo("components/lifecycle/delete-confirmation.tsx"), /checkDeleteConfirmation\(forte, digitado\)\.ok/);
});

test("G18 · espelho do gatilho: a liberação da exclusão comum é a da cor (“excluir_cor”), que os dois gatilhos JÁ aceitam — nenhuma migration nova; o núcleo comum não grava o marcador (só a RPC da M-E, na transação da exclusão)", () => {
  const gatilhos = cru("supabase/migrations/20261015120000_assunto_nunca_se_perde.sql");
  assert.match(gatilhos, /\(liberacao ->> 'via'\) IN \('tirar_do_plano', 'conversao', 'excluir_cor'\)/, "(a) aceita o marcador da exclusão da cor");
  assert.match(gatilhos, /NOT IN \('tirar_do_plano', 'excluir_cor'\)/, "(b) deixa excluir com o marcador da exclusão da cor");
  assert.equal(GROUP_DELETE_ALL_RELEASE_VIA, "excluir_cor");
  assert.match(cru("supabase/migrations/20261016130000_excluir_tudo_da_cor.sql"), /'via', 'excluir_cor'\);/);
  // O espelho em TS: a keyword do plano bloqueia sozinha; liberada pela cor, deixa de carregar o plano e passa.
  const doPlano = { keyword_subject: { declared: true, entry: { title: "Wi-Fi lento em casa", source: "cadastro" }, plan: { groupId: AZUL, planVersion: 1, order: 11, role: "Suporte", scope: "x", declaredPrincipal: { keywordId: "k1", phrase: "Wi-Fi lento" } } }, keyword_declared_principal: { subjectKeywordId: "k1", groupId: AZUL, planVersion: 1 } };
  assert.equal(keywordSubjectBlocksDeletion(doPlano), true);
  assert.equal(keywordCarriesDeclaredPlan(doPlano), true);
  const liberada = liberacaoDaCor(doPlano, { actorId: ACTOR, requestId: "r-1", at: LATER });
  assert.equal(keywordSubjectBlocksDeletion(liberada), false);
  assert.equal(keywordCarriesDeclaredPlan(liberada), false);
  assert.equal(resolveKeywordSubject(liberada).declared, true, "o Assunto continua declarado até a exclusão (a mesma transação)");
  // Nenhum escritor novo do marcador: o núcleo comum não grava keyword (só chama as RPCs).
  const comum = codigo("lib/minerador/keyword-delete-core.ts");
  assert.doesNotMatch(comum, /\.update\(|\.insert\(|\.upsert\(|\.delete\(\s*\)/);
  assert.doesNotMatch(comum, /keyword_subject_release|excluir_cor/);
  assert.match(comum, /applyGroupDeleteAllWithCore\(\{/, "a do plano vai pelo MESMO núcleo da cor");
});

/* ======================================================= E-1 · entrada */

/* ===================================================================== G16 */

/*
 * 2026-10-16 · o dono cadastrou uma lista nova colando o plano em BLOCOS (sem
 * número, o papel sozinho na 1ª linha, título/keyword/slug/descrição sem rótulo)
 * e o card não preencheu. A MESMA linha (leitor único → núcleo do cadastro →
 * pacote aprovado → Arquiteto) ganha o caso; nenhum caminho novo.
 */
const PLANO_EM_BLOCOS = (extra: Partial<Parameters<typeof importDeclaredPlanWithCore>[0]> = {}) => ({ text: PLANO_EM_BLOCOS_DO_DONO, ...extra });

test("G16 · plano em blocos sem número (Silo/Pilar/Suporte, slug por artigo): o texto do dono → prévia com Silo + 8 linhas e o slug de cada artigo → cadastrar grava o slug no plano → reaplicar não muda nada → a trava do Posto mantém o slug → Lógica → aprovar (D2-bis) → enviar: o Arquiteto recebe o slug declarado", async () => {
  assert.equal(looksLikeSiloPlanText(PLANO_EM_BLOCOS_DO_DONO), true, "colar em qualquer campo do card dispara o preenchimento (o detector reconhece)");
  const db = wifiConecta();
  const previa = await cadastro(db, PLANO_EM_BLOCOS());
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") return;
  assert.deepEqual(previa.blockers, []);
  assert.deepEqual(previa.unparsed, []);
  assert.equal(previa.canApply, true);
  assert.equal(previa.silo.name, "Planos e contratação");
  assert.equal(previa.silo.slug, "planos-de-internet");
  assert.deepEqual(previa.articles.map(article => [article.order, article.role, article.title, article.principal.phrase, article.slug, article.scope]), PLANO_EM_BLOCOS_ESPERADO.map(item => [item.order, item.role, item.subject, item.principal, item.slug, item.scope]));
  assert.equal(db.writes().length, 0, "prévia não grava");

  const aplicado = await cadastro(db, PLANO_EM_BLOCOS({ mode: "apply", importRequestId: novoPedido() }));
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.equal(aplicado.reciprocityConfirmed, 8);
  const grupo = db.rows("editorial_groups").find(row => row.id === aplicado.groupId)!;
  assert.equal((grupo.plan as Row).siloName, "Planos e contratação");
  assert.equal((grupo.plan as Row).siloSlug, "planos-de-internet");
  assert.equal((grupo.plan as Row).articleCount, 8);
  const ids = PLANO_EM_BLOCOS_ESPERADO.map(item => String(linha(db, item.principal)!.id));
  for (const [indice, id] of ids.entries()) {
    const assunto = resolveKeywordSubject(semantica(porId(db, id)));
    assert.equal(assunto.entry?.title, PLANO_EM_BLOCOS_ESPERADO[indice].subject, "o Assunto mora na keyword");
    assert.equal(assunto.plan?.order, indice + 1);
    assert.equal(assunto.plan?.role, PLANO_EM_BLOCOS_ESPERADO[indice].role);
    assert.equal(assunto.plan?.scope, PLANO_EM_BLOCOS_ESPERADO[indice].scope);
    assert.equal(assunto.plan?.slug, PLANO_EM_BLOCOS_ESPERADO[indice].slug, "o slug declarado fica no plano do artigo");
  }
  for (const item of PLANO_EM_BLOCOS_ESPERADO) assert.equal(linha(db, item.subject), undefined, `o título "${item.subject}" não vira keyword`);
  assert.equal(linha(db, "Planos e contratação"), undefined, "o nome do Silo não vira keyword");

  // O card relê o Silo existente com o slug de cada linha; colar o mesmo texto de novo não muda nada.
  const relido = await readDeclaredPlanCardRows({ brandId: BRAND, keywordsClient: db as never, groupsClient: db as never, groupId: aplicado.groupId });
  assert.ok(relido.ok);
  if (relido.ok) assert.deepEqual(relido.rows.map(row => row.slug), PLANO_EM_BLOCOS_ESPERADO.map(item => item.slug));
  const antes = JSON.stringify(db.rows("minerador_keywords"));
  const deNovo = await cadastro(db, PLANO_EM_BLOCOS({ mode: "apply", importRequestId: novoPedido(), group: { mode: "existing", groupId: aplicado.groupId }, destination: { kind: "existing_silo", groupId: aplicado.groupId } }));
  assert.ok(deNovo.ok && deNovo.mode === "apply", JSON.stringify(deNovo));
  if (deNovo.ok && deNovo.mode === "apply") {
    assert.equal(deNovo.planVersion, aplicado.planVersion, "mesmo plano = mesma versão");
    assert.ok(deNovo.articles.every(article => article.outcome === "unchanged"));
  }
  assert.equal(JSON.stringify(db.rows("minerador_keywords")), antes);

  // A trava pelo Posto de principal regrava a linha igual: o slug fica.
  const trava = await setKeywordPlanLockWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db as never, groupsClient: db as never, mode: "apply", keywordIds: [ids[1]], lock: "locked", importRequestId: novoPedido(), now: LATER });
  assert.ok(trava.ok && trava.counts.changed === 1, JSON.stringify(trava));
  assert.equal(resolveKeywordSubject(semantica(porId(db, ids[1]))).plan?.lock, "locked");
  assert.equal(resolveKeywordSubject(semantica(porId(db, ids[1]))).plan?.slug, "internet-residencial-barata", "a trava não apaga o slug declarado");

  const rodada = await logica(db, ids);
  assert.equal(rodada.failed, 0);
  const arquiteto = arquitetoFalso(db);
  const { resultado } = await aprovarEEnviar(db, arquiteto, ids);
  assert.equal(resultado.counts.approved_and_sent, 8, JSON.stringify(resultado.results));
  const standings = ids.map(id => readArchitectSubjectStanding(arquiteto.mesa.get(id)!));
  for (const [indice, standing] of standings.entries()) {
    assert.equal(standing.plan?.slug, PLANO_EM_BLOCOS_ESPERADO[indice].slug, "o slug chega pelo pacote aprovado");
    assert.equal(declaredPlanForGroup(standing)?.slug, PLANO_EM_BLOCOS_ESPERADO[indice].slug, "o adapter do Arquiteto recebe o slug declarado");
  }
  const formacao = declaredPlanFormationInputs({ standings, brandId: BRAND });
  assert.equal(formacao.get(ids[0])?.slug, "como-escolher-plano-internet-residencial", "a formação do artigo do plano nasce com o slug declarado");
  assert.equal(formacao.get(ids[0])?.role, "Pilar");
});

test("G16 · os outros formatos entram pela MESMA linha: planilha (TAB), CSV com cabeçalho e numerado sem rótulo chegam à prévia sem impedimento; o MCP estruturado manda o slug igual; o publicado ignora o slug", async () => {
  const TAB = String.fromCharCode(9);
  const linhasDoPlano = PLANO_EM_BLOCOS_ESPERADO.slice(0, 4);
  const planilha = [["Papel", "Assunto", "Keyword", "Slug", "Descrição"], ...linhasDoPlano.map(item => [item.role, item.subject, item.principal, `/planos-de-internet/${item.slug}/`, item.scope])].map(celulas => celulas.join(TAB)).join("\n");
  const csv = ["Ordem;Papel;Título;Palavra-chave;URL;Detalhes", ...linhasDoPlano.map(item => [item.order, item.role, item.subject, item.principal, `https://wificonecta.com.br/planos-de-internet/${item.slug}/`, `"${item.scope}"`].join(";"))].join("\n");
  const numerado = linhasDoPlano.map(item => [`${item.order}. ${item.subject}`, ...(item.role === "Pilar" ? ["Papel: Pilar"] : []), item.principal, `/planos-de-internet/${item.slug}/`, item.scope].join("\n")).join("\n");
  for (const [formato, corpo] of [["planilha", planilha], ["csv", csv], ["lista", numerado]] as const) {
    const texto = `Nome: Planos e contratação\nSlug: /planos-de-internet/\n${corpo}`;
    assert.equal(parseDeclaredPlanText(texto).format, formato);
    assert.equal(looksLikeSiloPlanText(texto), true, formato);
    const previa = await cadastro(wifiConecta(), { text: texto });
    assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
    if (!previa.ok || previa.mode !== "preview") continue;
    assert.deepEqual(previa.blockers, [], formato);
    assert.deepEqual(previa.articles.map(article => [article.order, article.role, article.title, article.principal.phrase, article.slug]), linhasDoPlano.map(item => [item.order, item.role, item.subject, item.principal, item.slug]), formato);
  }

  // O MCP `declare_silo_plan` com o plano estruturado: o slug no caminho inteiro é normalizado igual.
  const estruturado: StructuredDeclaredPlan = {
    silo: { name: "Planos e contratação", slug: "/planos-de-internet/" },
    articles: linhasDoPlano.map(item => ({ order: item.order, subject: item.subject, principal: item.principal, role: item.role, scope: item.scope, slug: `/planos-de-internet/${item.slug}/` })),
  };
  const pelaEstrutura = await cadastro(wifiConecta(), { text: null, plan: estruturado });
  assert.ok(pelaEstrutura.ok && pelaEstrutura.mode === "preview");
  if (pelaEstrutura.ok && pelaEstrutura.mode === "preview") assert.deepEqual(pelaEstrutura.articles.map(article => article.slug), linhasDoPlano.map(item => item.slug));
  const repetido = await cadastro(wifiConecta(), { text: null, plan: { ...estruturado, articles: estruturado.articles.map(article => ({ ...article, slug: "/planos-de-internet/mesmo/" })) } });
  assert.ok(repetido.ok && repetido.mode === "preview" && !repetido.canApply && repetido.blockers.some(blocker => /aparece nos artigos/.test(blocker)), "slug repetido no plano é recusa");
  // `validate_silo_plan` aceita o caminho inteiro (vale o último trecho) e avisa quando ele sai do slug do silo.
  const validado = validateSiloPlan(SiloPlanSchema.parse({ siloName: "Planos e contratação", siloPage: { keyword: "planos de internet", slug: "planos-de-internet" }, articles: linhasDoPlano.map((item, indice) => ({ subject: item.subject, targetKeyword: item.principal, slug: indice === 3 ? `/outro-silo/${item.slug}/` : `/planos-de-internet/${item.slug}/`, role: item.role, funnel: indice % 2 ? "MOFU" : "TOFU", intent: indice % 2 ? "comercial" : "informacional" })) }), CONTEXTO_VAZIO);
  assert.deepEqual(validado.plan.articles.map(article => article.slug), linhasDoPlano.map(item => item.slug));
  assert.ok(validado.issues.some(issue => issue.field === "articles.3.slug" && /não fica dentro do slug do silo/.test(issue.message)));
  assert.ok(!validado.issues.some(issue => /aparece mais de uma vez/.test(issue.message)));

  // Publicado: URL, slug e canonical são da página (AGENTS §11) — o slug colado é ignorado e a prévia diz.
  const publicado = await cadastro(wifiConecta(), { text: null, plan: { articles: [{ order: 1, subject: "Fibra empresarial: como escolher", principal: "fibra empresarial para pequenas empresas", role: "Suporte", scope: "Para quem tem CNPJ.", slug: "/outro-endereco/" }] }, destination: { kind: "published", url: PAGINA_URL } });
  assert.ok(publicado.ok && publicado.mode === "preview", JSON.stringify(publicado));
  if (publicado.ok && publicado.mode === "preview") {
    assert.ok(publicado.notices.some(notice => /slug das linhas não vale no destino/.test(notice)));
    assert.ok(publicado.articles.every(article => article.slug === undefined));
  }
});

/* ===================================================================== G17 */

test("G17 · planejamento em CSV com 2 Silos (o arquivo do dono): sem a escolha, recusa listando os Silos e nada é lido do banco; Silo 1 num verde novo → prévia (slug do Silo tirado dos endereços, colunas extras numa linha) → cadastrar grava Assunto, keyword, slug e detalhes no DNA de cada keyword; Silo 2 no azul que já existe: acréscimo bloqueia, a substituição mostra entra/muda/sai e só muda com o decisionHash", async () => {
  const { db, ids: idsDoAzul } = await azulCadastrado();
  // A cor Verde da marca, ainda sem plano (o banco em memória não cria grupo: a cor com grupo leva o cadastro para ele, como na tela).
  const VERDE_ID = "33333333-4444-4555-8666-777777777777";
  db.tables.editorial_groups.push({ id: VERDE_ID, marca_id: BRAND, name: "verde", color: "verde", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT });
  const CSV = PLANEJAMENTO_CSV_DO_DONO;
  const VERDE = { mode: "new" as const, color: "verde", name: null };

  // 1 — o texto traz 2 Silos: o núcleo (rota e MCP) pede siloName e lista os dois, antes de qualquer leitura.
  const antesDeTudo = db.writes().length;
  const leiturasAntes = db.log.length;
  const semEscolha = await cadastro(db, { text: CSV, group: VERDE });
  assert.ok(!semEscolha.ok && semEscolha.code === "SILO_CHOICE_REQUIRED", JSON.stringify(semEscolha));
  if (!semEscolha.ok) {
    assert.match(semEscolha.reason, /Este texto tem 2 Silos: Planos e contratação \(8\) · Wi-Fi e fibra óptica \(7\)[\s\S]*siloName/);
    assert.deepEqual(semEscolha.blockers, ["Planos e contratação: 8 artigo(s), /planos-de-internet/", "Wi-Fi e fibra óptica: 7 artigo(s), /wifi-e-fibra/"]);
  }
  const outro = await cadastro(db, { text: CSV, group: VERDE, siloName: "Velocidade" });
  assert.ok(!outro.ok && outro.code === "SILO_CHOICE_REQUIRED", "o Silo pedido que não está no texto também é recusa");
  assert.equal(db.log.length, leiturasAntes, "a recusa vem antes de qualquer leitura ou escrita no banco");
  assert.equal(db.writes().length, antesDeTudo, "recusar não grava");

  // 2 — Silo 1, Silo novo no verde: a prévia de sempre, com os 8 artigos do arquivo.
  const previa = await cadastro(db, { text: CSV, group: VERDE, siloName: "Planos e contratação" });
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") return;
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.canApply, true);
  assert.equal(previa.silo.name, "Planos e contratação");
  assert.equal(previa.silo.slug, "planos-de-internet", "sem slug do Silo no arquivo: o começo comum dos endereços");
  assert.deepEqual(previa.articles.map(article => [article.order, article.role, article.title, article.principal.phrase, article.slug, article.scope]), SILO_PLANOS_ESPERADO.map(item => [item.order, item.role, item.subject, item.principal, item.slug, item.scope]));
  assert.equal(previa.notices.filter(notice => notice === `Colunas ignoradas: ${COLUNAS_IGNORADAS_DO_CSV.join(", ")}.`).length, 1, "as colunas extras numa linha só, sem recusa");
  assert.equal(db.writes().length, antesDeTudo, "prévia não grava");

  const aplicado = await cadastro(db, { text: CSV, group: VERDE, siloName: "Planos e contratação", mode: "apply", importRequestId: novoPedido() });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.equal(aplicado.reciprocityConfirmed, 8);
  const verde = db.rows("editorial_groups").find(row => row.id === aplicado.groupId)!;
  assert.equal(verde.color, "verde");
  assert.deepEqual(verde.plan, { siloName: "Planos e contratação", siloSlug: "planos-de-internet", objective: null, articleCount: 8 });
  for (const item of SILO_PLANOS_ESPERADO) {
    const row = linha(db, item.principal);
    assert.ok(row, `a keyword "${item.principal}" existe`);
    const assunto = resolveKeywordSubject(semantica(row!));
    assert.equal(assunto.entry?.title, item.subject, "o Assunto mora na keyword");
    assert.deepEqual([assunto.plan?.order, assunto.plan?.role, assunto.plan?.scope, assunto.plan?.slug, assunto.plan?.groupId], [item.order, item.role, item.scope, item.slug, aplicado.groupId]);
    assert.equal(linha(db, item.subject), undefined, "o título não vira keyword");
    const dna = JSON.stringify(semantica(row!));
    for (const trecho of TRECHOS_DAS_COLUNAS_IGNORADAS) assert.ok(!dna.includes(trecho), `"${trecho}" (coluna ignorada) não entra no DNA`);
  }
  assert.equal(linha(db, "Planos e contratação"), undefined, "o nome do Silo não vira keyword");
  assert.ok(idsDoAzul.every(id => resolveKeywordSubject(semantica(porId(db, id))).plan?.groupId === AZUL), "cadastrar o Silo 1 não mexe no azul");

  // 3 — Silo 2 do MESMO texto no azul que já tem "Wi-Fi e fibra óptica" (plano com outros títulos e keywords).
  const daCor = { text: CSV, siloName: "Wi-Fi e fibra óptica", group: { mode: "existing" as const, groupId: AZUL }, destination: { kind: "existing_silo" as const, groupId: AZUL } };
  const congelado = JSON.stringify(db.rows("minerador_keywords"));
  const acrescimo = await cadastro(db, daCor);
  assert.ok(acrescimo.ok && acrescimo.mode === "preview", JSON.stringify(acrescimo));
  if (acrescimo.ok && acrescimo.mode === "preview") {
    assert.equal(acrescimo.canApply, false, "acrescentar um 2º Pilar ao azul não passa");
    assert.ok(acrescimo.blockers.some(blocker => /Pilar/.test(blocker)), JSON.stringify(acrescimo.blockers));
    assert.ok(!acrescimo.notices.some(notice => /O texto não trouxe o slug do Silo/.test(notice)), "no Silo existente vale o slug gravado");
  }
  const troca = await cadastro(db, { ...daCor, planMode: "replace" });
  assert.ok(troca.ok && troca.mode === "preview" && troca.replace, JSON.stringify(troca));
  if (!troca.ok || troca.mode !== "preview" || !troca.replace) return;
  assert.deepEqual(troca.blockers, []);
  assert.deepEqual(troca.replace.changed.map(item => item.order), [13, 14], "as duas keywords que o azul já tinha mudam (título, detalhes, slug)");
  assert.deepEqual(troca.replace.entering.map(item => item.order), [9, 10, 11, 12, 15]);
  assert.deepEqual(troca.replace.leaving.map(item => item.order), [9, 10, 11, 12, 15], "as do plano v anterior que o arquivo não traz saem pelo Tirar do plano");
  assert.equal(troca.replace.same.length, 0);
  assert.ok(troca.replace.changed[0].reasons.some(reason => /slug sem slug → \/internet-para-jogos-ping-estabilidade\//.test(reason)), JSON.stringify(troca.replace.changed[0].reasons));
  assert.equal(troca.silo.slug, "wifi-e-fibra", "o Silo gravado fica com o slug dele");
  assert.equal(JSON.stringify(db.rows("minerador_keywords")), congelado, "nada muda sem a confirmação (prévias não gravam)");
  const semHash = await cadastro(db, { ...daCor, planMode: "replace", mode: "apply", importRequestId: novoPedido() });
  assert.ok(!semHash.ok && semHash.code === "DECISION_REQUIRED");
  assert.equal(JSON.stringify(db.rows("minerador_keywords")), congelado);

  const trocado = await cadastro(db, { ...daCor, planMode: "replace", mode: "apply", importRequestId: novoPedido(), decisionHash: troca.replace.decisionHash });
  assert.ok(trocado.ok && trocado.mode === "apply" && trocado.failed === 0, JSON.stringify(trocado));
  for (const item of SILO_WIFI_ESPERADO) {
    const assunto = resolveKeywordSubject(semantica(linha(db, item.principal)!));
    assert.equal(assunto.entry?.title, item.subject);
    assert.deepEqual([assunto.plan?.order, assunto.plan?.role, assunto.plan?.slug, assunto.plan?.groupId], [item.order, item.role, item.slug, AZUL]);
  }
  const saiu = semantica(linha(db, "internet fibra óptica")!);
  assert.equal(resolveKeywordSubject(saiu).plan, null, "o Pilar anterior sai do plano (o arquivo traz outro)");
  assert.equal((saiu.keyword_subject_release as Row).via, "tirar_do_plano", "liberado pelo marcador; nada é apagado");
  assert.ok(db.rows("minerador_keywords").every(row => !row.deleted_at));
  assert.equal((db.rows("editorial_groups").find(row => row.id === AZUL)!.plan as Row).siloSlug, "wifi-e-fibra");
  assert.ok(SILO_PLANOS_ESPERADO.every(item => resolveKeywordSubject(semantica(linha(db, item.principal)!)).plan?.groupId === aplicado.groupId), "o Silo 1 (verde) fica como está");
});

test("E-1 · os gravadores de entrada que existem hoje deduplicam pela mesma chave na marca? núcleo comum, Assunto, Pesquisa por Assunto e cadastro reconhecem a existente; o site não (outra lista)", async () => {
  const base = () => new LinhaUnicaFakeDb({ minerador_keywords: [kw("72000000-0000-4000-8000-000000000001", "Internet Fibra Óptica", { lista_id: "60000000-0000-4000-8000-000000000002" })], minerador_keyword_lists: [], editorial_groups: [], editorial_group_events: [], editorial_group_articles: [], brand_site_catalog_entries: [], editorial_workflow_items: [] });
  const comum = base();
  assert.equal((await importar(comum, ["internet fibra optica"])).items[0].outcome, "existing");
  const assunto = base();
  const previaAssunto = await importSubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(assunto), mode: "preview", source: "manual", items: [{ keyword: "internet fibra optica" }] });
  assert.ok(previaAssunto.ok && previaAssunto.rows[0].classification === "existing_without_subject");
  const pesquisa = base();
  const pedido = SubjectDiscoveryImportRequestSchema.parse({ importRequestId: novoPedido(), searchId: "0e000000-0000-4000-8000-0000000000a8", subjectPhrase: "fibra", items: [{ keyword: "internet fibra optica", origins: ["ads_keyword_seed"], evidence: [] }] });
  const lida = await importSubjectDiscoveryWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(pesquisa), request: pedido, now: AT });
  assert.ok(lida.ok && lida.counts.created === 0, JSON.stringify(lida));
  const site = base();
  const resultado = await importarDoSite(site, "60000000-0000-4000-8000-000000000001", ["internet fibra optica"]);
  assert.equal(resultado.summary.imported, 1, "hoje: o site cria outra linha da mesma frase em outra lista (E-3)");
});

/* ============================================ E-2 · dedup acima de 1.000 */

function marcaCom1001(): { db: LinhaUnicaFakeDb; alvo: string } {
  const rows: Row[] = [];
  for (let i = 0; i < 1000; i += 1) rows.push(kw(`73000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `keyword numero ${i}`));
  rows.push(kw("ffffffff-0000-4000-8000-000000000001", "internet fibra óptica"));
  return { db: new LinhaUnicaFakeDb({ minerador_keywords: rows, editorial_workflow_items: [] }, { maxRows: 1000 }), alvo: "internet fibra óptica" };
}

test("E-2 · hoje: com 1.001 vivas (max_rows = 1000), `importKeywordsWithCore` não vê a 1.001ª e cria duplicata; os núcleos irmãos paginam e reconhecem", async () => {
  const { db, alvo } = marcaCom1001();
  const resultado = await importar(db, [alvo]);
  assert.equal(resultado.created, 1, "hoje: duplicata");
  assert.equal(db.rows("minerador_keywords").filter(row => normalizeKeyword(row.keyword) === normalizeKeyword(alvo)).length, 2);
  const irmao = marcaCom1001();
  const previa = await importSubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(irmao.db), mode: "preview", source: "manual", items: [{ keyword: alvo }] });
  assert.ok(previa.ok && previa.rows[0].classification === "existing_without_subject", "o import de Assunto pagina");
  const pesquisa = marcaCom1001();
  const pedido = SubjectDiscoveryImportRequestSchema.parse({ importRequestId: novoPedido(), searchId: "0e000000-0000-4000-8000-0000000000a7", subjectPhrase: "fibra", items: [{ keyword: alvo, origins: ["ads_keyword_seed"], evidence: [] }] });
  const lida = await importSubjectDiscoveryWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(pesquisa.db), request: pedido, now: AT });
  assert.ok(lida.ok && lida.counts.created === 0, "a Pesquisa por Assunto pagina");
});

test("E-2 · acima de 1.000 vivas, o import comum reconhece a existente", { todo: "vermelho até a F2 (E-2): `importKeywordsWithCore` lê as vivas com o leitor paginado (o índice único é decisão do dono)" }, async () => {
  const { db, alvo } = marcaCom1001();
  const resultado = await importar(db, [alvo]);
  assert.equal(resultado.created, 0);
});

/* ============================================== E-3 · import pelo site */

async function importarDoSite(db: LinhaUnicaFakeDb, listaId: string, textos: string[]) {
  const repository: SiteKeywordMineradorRepository = {
    validateDestination: async () => undefined,
    findByIds: async (brandId, ids) => ((await db.from("minerador_keywords").select("id,brand_id,keyword,status,analise_semantica").eq("brand_id", brandId).is("deleted_at", null).in("id", [...ids])).data as never),
    findByList: async (brandId, targetListId) => {
      let query = db.from("minerador_keywords").select("id,brand_id,keyword,status,analise_semantica").eq("brand_id", brandId).is("deleted_at", null);
      if (targetListId) query = query.eq("lista_id", targetListId);
      return (await query).data as never;
    },
    updateKeywordEvidence: async ({ id, brandId, analise_semantica }) => { await db.from("minerador_keywords").update({ analise_semantica }).eq("id", id).eq("brand_id", brandId).is("deleted_at", null); },
    insertKeyword: async payload => {
      const { data } = await db.from("minerador_keywords").insert({ ...payload, brand_id: BRAND }).select("id,keyword,brand_id").single();
      return data as never;
    },
  };
  const candidates: SiteKeywordMineradorCandidateInput[] = textos.map((text, index) => ({ id: `74000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, brandId: BRAND, text, catalogEntryId: null, sourceUrl: `${SITE}/pagina-${index}/`, sourceField: "title", suggestedRole: "possible_primary", confidence: "high" }) as SiteKeywordMineradorCandidateInput);
  return importSiteKeywordsToMinerador({ brandId: BRAND, targetListId: listaId, candidates, importBatchId: "75000000-0000-4000-8000-000000000001", requestedBy: ACTOR, repository, now: AT });
}

test("E-3 · hoje: o import pelo site deduplica só dentro da lista (cria a mesma frase em outra lista), usa outra normalização e grava evidência na aprovada (rebaixa para Em revisão)", async () => {
  const L1 = "60000000-0000-4000-8000-000000000001";
  const L2 = "60000000-0000-4000-8000-000000000002";
  const aprovadaSemantic = await applyApproval({ keywordId: "76000000-0000-4000-8000-000000000001", brandId: BRAND, keyword: "wi-fi lento", intent: "Informacional", volumeSearch: 1900, resultsAllintitle: null, kgrScore: null, listaId: L1, semantic: { dna_origem: "logico_deterministico", ...MEDIDA(1900) }, approvedAt: AT, approvedBy: ACTOR });
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [
    kw("76000000-0000-4000-8000-000000000001", "wi-fi lento", { status: "aprovado", intent: "Informacional", volume_search: 1900, lista_id: L1, analise_semantica: aprovadaSemantic }),
    kw("76000000-0000-4000-8000-000000000002", "Internet Fibra Óptica", { lista_id: L2 }),
  ] });
  assert.equal(statusNaTela(porId(db, "76000000-0000-4000-8000-000000000001")), "aprovado");
  const resultado = await importarDoSite(db, L1, ["internet fibra optica", "Wi Fi lento!"]);
  assert.deepEqual(resultado.items.map(item => item.outcome), ["imported", "evidence_updated"]);
  assert.equal(db.rows("minerador_keywords").filter(row => normalizeKeyword(row.keyword) === "internet fibra optica").length, 2, "a mesma frase em duas listas");
  assert.equal(normalizeCandidateText("Wi Fi lento!"), normalizeCandidateText("wi-fi lento"), "o site tira pontuação");
  assert.notEqual(normalizeKeyword("Wi Fi lento!"), normalizeKeyword("wi-fi lento"), "o núcleo comum, não");
  assert.equal(statusNaTela(porId(db, "76000000-0000-4000-8000-000000000001")), "em_revisao", "a evidência do site rebaixou a aprovada");
});

test("E-3 · o import pelo site passa pelo gravador de entrada: mesma chave da marca, sem rebaixar aprovada", { todo: "vermelho até a F5/F6 (E-1/E-3): o site chama o gravador de entrada do Minerador" }, async () => {
  const L1 = "60000000-0000-4000-8000-000000000001";
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [kw("76000000-0000-4000-8000-000000000002", "Internet Fibra Óptica", { lista_id: "60000000-0000-4000-8000-000000000002" })] });
  const resultado = await importarDoSite(db, L1, ["internet fibra optica"]);
  assert.equal(resultado.summary.imported, 0);
});

/* ===================================== E-4 · normalização da mesma frase */

const NORMALIZADORES: Record<string, (value: string) => string> = {
  normalizeKeyword: value => normalizeKeyword(value),
  normalizeDeclaredPhraseKey: value => normalizeDeclaredPhraseKey(value),
  normalizeGoogleAdsKeyword: value => normalizeGoogleAdsKeyword(value),
  normalizeCandidateText: value => normalizeCandidateText(value),
  normalizeTopicText: value => normalizeTopicText(value),
};

test("E-4 · hoje: a mesma frase dá chaves diferentes conforme o normalizador (acento, hífen, pontuação)", () => {
  const frases = ["Wi-Fi lento", "Wí-Fi  lento", "wi fi lento", "Wi-Fi lento?", "Internet fibra óptica"];
  const chaves = Object.fromEntries(Object.entries(NORMALIZADORES).map(([nome, fn]) => [nome, frases.map(fn)]));
  assert.deepEqual(chaves, {
    normalizeKeyword: ["wi-fi lento", "wi-fi lento", "wi fi lento", "wi-fi lento?", "internet fibra optica"],
    normalizeDeclaredPhraseKey: ["wi-fi lento", "wi-fi lento", "wi fi lento", "wi-fi lento?", "internet fibra optica"],
    normalizeGoogleAdsKeyword: ["wi-fi lento", "wí-fi  lento", "wi fi lento", "wi-fi lento?", "internet fibra óptica"],
    normalizeCandidateText: ["wi fi lento", "wi fi lento", "wi fi lento", "wi fi lento", "internet fibra optica"],
    normalizeTopicText: ["wi fi lento", "wi fi lento", "wi fi lento", "wi fi lento", "internet fibra optica"],
  });
});

test("E-4 · uma função para a chave de deduplicação: todos os normalizadores de entrada dão a mesma chave", { todo: "vermelho até a F6 (E-4): uma chave de dedup em toda a entrada" }, () => {
  for (const frase of ["Wí-Fi  lento", "Internet fibra óptica", "Wi-Fi lento?"]) {
    assert.equal(new Set(Object.values(NORMALIZADORES).map(fn => fn(frase))).size, 1, frase);
  }
});

/* ========================================================= E-5 · MCP × tela */

test("E-5 · hoje: `validate_silo_plan` × cadastro divergem — escopo (o cadastro exige), URL publicada (só o MCP confere)", async () => {
  const db = wifiConecta();
  const semEscopo = SILO_2.replace("Explicar tecnologias de acesso, vantagens, limitações e o que observar na contratação.\n", "");
  const previa = await cadastro(db, { text: semEscopo });
  assert.ok(previa.ok && previa.mode === "preview" && !previa.canApply && previa.blockers.some(item => /sem descrição/.test(item)), "o cadastro recusa artigo sem escopo");
  assert.ok(validateSiloPlan(SiloPlanSchema.parse(siloPlanDoAzul({ comKeywordDoSilo: true })), CONTEXTO_VAZIO).ok, "o MCP não tem escopo");
  const publicado = { ...CONTEXTO_VAZIO, publishedPaths: ["wifi-e-fibra"] };
  assert.equal(validateSiloPlan(SiloPlanSchema.parse(siloPlanDoAzul({ comKeywordDoSilo: true })), publicado).ok, false, "o MCP bloqueia o slug já publicado");
  const comPublicado = await cadastro(wifiConecta());
  assert.ok(comPublicado.ok && comPublicado.mode === "preview" && comPublicado.canApply, "o cadastro não confere a URL publicada do Silo");
});

test("E-5 · hoje: `import_subject_keywords` sem ids gera searchId/importRequestId aleatórios — a nova tentativa vira outra busca", async () => {
  const mcp = codigo("lib/server/platform-mcp-tools.ts");
  assert.match(mcp, /searchId: request\.searchId \?\? crypto\.randomUUID\(\)/);
  assert.match(mcp, /importRequestId: request\.importRequestId \?\? crypto\.randomUUID\(\)/);
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [] });
  const pedido = (searchId: string) => SubjectDiscoveryImportRequestSchema.parse({ importRequestId: novoPedido(), searchId, subjectPhrase: "fibra", items: [{ keyword: "fibra óptica residencial", origins: ["ads_keyword_seed"], evidence: [] }] });
  const mesma = "0e000000-0000-4000-8000-0000000000a1";
  const primeira = await importSubjectDiscoveryWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(db), request: pedido(mesma), now: AT });
  const repetida = await importSubjectDiscoveryWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(db), request: pedido(mesma), now: AT });
  assert.ok(primeira.ok && repetida.ok);
  if (repetida.ok) assert.equal(repetida.rows[0].outcome, "already_recorded", "com o mesmo searchId, a repetição não regrava");
  const aleatoria = await importSubjectDiscoveryWithCore({ brandId: BRAND, actorUserId: ACTOR, supabase: client(db), request: pedido("0e000000-0000-4000-8000-0000000000a2"), now: AT });
  assert.ok(aleatoria.ok && aleatoria.rows[0].outcome === "recorded", "com searchId novo, a mesma tentativa grava outra busca");
  assert.equal(((semantica(linha(db, "fibra óptica residencial")!).subject_discovery as Row).searches as unknown[]).length, 2);
});

test("E-5 · MCP × tela na entrada: a nova tentativa do MCP sem ids não vira outra busca; o cadastro confere a URL publicada", { todo: "vermelho até a F6 (E-5): ids obrigatórios (ou derivados) no MCP; checagem de URL publicada no núcleo do cadastro" }, async () => {
  const mcp = codigo("lib/server/platform-mcp-tools.ts");
  assert.doesNotMatch(mcp, /request\.searchId \?\? crypto\.randomUUID\(\)/);
});

/* ============================================= S-1 · "Resultados" rebaixa aprovada */

const ALLINTITLE: DataForSeoAllintitleMeasurement = { keyword: "wi-fi lento", query: "allintitle:\"wi-fi lento\"", resultsAllintitle: 1200, locationCode: 2076, languageCode: "pt", measuredAt: LATER, provider: "dataforseo", providerVersion: "v3", endpoint: "/v3/serp/google/organic/live/regular", providerRequestId: "task-1", cost: 0.003, checkUrl: null } as DataForSeoAllintitleMeasurement;

async function aprovadaMedida() {
  const db = new LinhaUnicaFakeDb({ minerador_keywords: [kw("77000000-0000-4000-8000-000000000001", "wi-fi lento")], minerador_keyword_lists: [] });
  const id = "77000000-0000-4000-8000-000000000001";
  await logica(db, [id]);
  await medirVolume(db, [id], { "wi-fi lento": 1900 });
  await aprovarEEnviar(db, arquitetoFalso(db), [id], false);
  return { db, id };
}

test("S-1 · hoje: \"Resultados\" (allintitle) grava na aprovada sem carregar a aprovação: a keyword volta a Em revisão; o Volume, ao contrário, carrega", async () => {
  const { db, id } = await aprovadaMedida();
  assert.equal(statusNaTela(porId(db, id)), "aprovado");
  await medirVolume(db, [id], { "wi-fi lento": 1900 });
  assert.equal(statusNaTela(porId(db, id)), "aprovado", "remedir o Volume sem mudança carrega a aprovação");
  const row = porId(db, id);
  const patch = buildDataForSeoKeywordMeasurementPatch({ existing: { results_allintitle: null, volume_search: row.volume_search as number, kgr_score: null, analise_semantica: semantica(row) as never }, measurement: ALLINTITLE, operationRequestId: "78000000-0000-4000-8000-000000000001", targeting: {}, requireCurrentVolumeMeasurement: true });
  await db.from("minerador_keywords").update(patch).eq("id", id).eq("brand_id", BRAND).is("deleted_at", null);
  assert.equal(porId(db, id).status, "aprovado", "a coluna continua aprovado");
  assert.equal(statusNaTela(porId(db, id)), "em_revisao", "a tela rebaixa: o pacote divergiu");
});

test("S-1 · Resultados carrega a aprovação (D6): medir allintitle não rebaixa a aprovada", { todo: "vermelho até a fase da D6 (S-1, F6): a gravação do allintitle carrega a aprovação, como o Volume" }, async () => {
  const { db, id } = await aprovadaMedida();
  const row = porId(db, id);
  const patch = buildDataForSeoKeywordMeasurementPatch({ existing: { results_allintitle: null, volume_search: row.volume_search as number, kgr_score: null, analise_semantica: semantica(row) as never }, measurement: ALLINTITLE, operationRequestId: "78000000-0000-4000-8000-000000000002", targeting: {}, requireCurrentVolumeMeasurement: true });
  await db.from("minerador_keywords").update(patch).eq("id", id).eq("brand_id", BRAND).is("deleted_at", null);
  assert.equal(statusNaTela(porId(db, id)), "aprovado");
});

/* ================================================= S-2 · volume com duas réguas */

const DA_DESCOBERTA = kw("79000000-0000-4000-8000-000000000001", "internet 1 giga", { volume_search: 320, volume_source: "google_ads", analise_semantica: { dna_origem: "logico_deterministico" } });

test("S-2 · hoje: keyword da Descoberta com volume na coluna (google_ads) sem medição — \"já temos\" e a planilha do plano dizem medido; a aprovação recusa por falta de Volume", () => {
  assert.equal(readKnownVolume(DA_DESCOBERTA as never, new Date(LATER)).state, "measured");
  assert.equal(readPlanRowVolume(DA_DESCOBERTA, new Date(LATER)).state, "measured");
  assert.ok(resolveApprovalReadiness({ semantic: semantica(DA_DESCOBERTA), volumeSearch: 320 }).missing.includes("volume"));
});

test("S-2 · \"volume medido\" é uma leitura só (A7/E-7)", { todo: "vermelho até a F2 (S-2/A7): uma função de volume medido para aprovação, trava, recibo e Arquiteto" }, () => {
  const conhecido = readKnownVolume(DA_DESCOBERTA as never, new Date(LATER)).state === "measured";
  const aprovavel = !resolveApprovalReadiness({ semantic: semantica(DA_DESCOBERTA), volumeSearch: 320 }).missing.includes("volume");
  assert.equal(conhecido, aprovavel);
});

/* =============================================== S-6 · status pelo navegador */

test("S-6 · hoje: rejeitar pelo navegador grava `update({ status })` direto, com a trava do status cru — a publicada pelo site passa; o núcleo do servidor a protege", async () => {
  const db = wifiConecta();
  const publicada = linha(db, "internet fibra empresarial")!;
  assert.equal(isLegacyPublishedStatus(publicada.status as string), false, "a trava do navegador olha só o status cru");
  assert.equal(isKeywordPublished({ status: String(publicada.status), semantic: semantica(publicada) }), true, "mas a keyword está publicada");
  const servidor = keywordDecisionEntries((await readDecisionKeywords(BRAND, [String(publicada.id)], client(db))).rows, "reject")[0];
  assert.equal(servidor.outcome, "blocked", "o núcleo do servidor recusa");
  const tela = codigo("modules/minerador/minerador-workspace.tsx").replace(/\r\n/g, "\n");
  assert.match(tela, /return !isLegacyPublishedStatus\(item\?\.status\);/);
  assert.match(tela, /\.from\("minerador_keywords"\)\s*\.update\(\{ status: normalizedStatus \}\)/);
});

test("S-6 · todo Status passa pelo núcleo de decisão do servidor", { todo: "vermelho até a F3 (A4/S-6): rejeitado/bruto/em revisão por `applyKeywordDecisionEntries`" }, async () => {
  const tela = codigo("modules/minerador/minerador-workspace.tsx");
  assert.doesNotMatch(tela, /\.update\(\{ status: normalizedStatus \}\)/);
});

/* ============================================ S-7 · MCP lê o status cru */

test("S-7 · hoje: `list_platform_keywords` lê o status cru — a aprovada que divergiu aparece \"aprovado\" no MCP e \"Em revisão\" na tela", async () => {
  const { db, id } = await aprovadaMedida();
  await db.from("minerador_keywords").update({ analise_semantica: { ...semantica(porId(db, id)), nota_do_humano: "mexida depois" } }).eq("id", id);
  assert.equal(statusNaTela(porId(db, id)), "em_revisao");
  const lida = (await db.from("minerador_keywords").select(PLATFORM_KEYWORD_SELECT).eq("id", id)).data as Row[];
  const mcp = projectPlatformKeywordRow(lida[0]);
  assert.equal(mcp.status, "aprovado", "o MCP diz aprovado");
  assert.doesNotMatch(PLATFORM_KEYWORD_SELECT, /aprovacao/, "nem lê o registro de aprovação");
});

test("S-7 · o MCP lê o status efetivo, como a tela", { todo: "vermelho até a F6 (S-7): todo leitor passa por `resolveCanonicalKeywordSnapshot`" }, async () => {
  const { db, id } = await aprovadaMedida();
  await db.from("minerador_keywords").update({ analise_semantica: { ...semantica(porId(db, id)), nota_do_humano: "mexida depois" } }).eq("id", id);
  const lida = (await db.from("minerador_keywords").select(PLATFORM_KEYWORD_SELECT).eq("id", id)).data as Row[];
  assert.equal(projectPlatformKeywordRow(lida[0]).status, "em_revisao");
});

/* ======================================= P-1 · "Enviar ao Arquiteto" antigo */

test("P-1 · hoje: o portão do botão antigo olha o status cru — aprova o lote com uma aprovada que divergiu; o servidor (modo de sempre, não parcial) a deixa fora em silêncio, e a tela diz \"já estavam no workspace\"", async () => {
  const { db, id } = await aprovadaMedida();
  const arquiteto = arquitetoFalso(db);
  await arquiteto.send([id]);
  await db.from("minerador_keywords").update({ analise_semantica: { ...semantica(porId(db, id)), nota_do_humano: "mexida depois" } }).eq("id", id);
  const gate = evaluateMineradorArquitetoHandoffBatch({ keywords: [porId(db, id) as never], brandId: BRAND });
  assert.equal(gate.ok, true, "o navegador libera o envio");
  const previa = await arquiteto.previewSend([id]);
  assert.deepEqual(previa.eligibleKeywordIds, [], "o servidor não a considera aprovada");
  const tela = codigo("modules/minerador/minerador-workspace.tsx");
  assert.match(tela, /As keywords selecionadas já estavam no workspace canônico do Arquiteto\./, "a mensagem de sucesso falso");
  assert.match(tela, /persistMineradorArquitetoHandoff\(\{\s*brandId: selectedBrandId,\s*keywordIds: \[\.\.\.selectedIds\],\s*\}\)/, "sem modo parcial");
  const mcp = codigo("lib/server/platform-mcp-tools.ts");
  assert.match(mcp, /reportArquitetoHandoff\(keywordIds, await createMineradorArquitetoHandoff\(context, keywordIds\)\)/, "o MCP também não é parcial");
});

test("P-1 · um envio só (D8): o botão antigo sai e o MCP usa o modo parcial", { todo: "vermelho até a fase da D8 (P-1, F6): \"Aprovar e enviar\" é o envio; `send_keywords_to_arquiteto` parcial" }, async () => {
  assert.doesNotMatch(codigo("modules/minerador/minerador-workspace.tsx"), /handleBatchSendToArchitect/);
  assert.match(codigo("lib/server/platform-mcp-tools.ts"), /createMineradorArquitetoHandoff\(context, keywordIds, \{ partial: true \}\)/);
});

/* =========================================== P-3 · desfazer só na tela */

test("P-3 · hoje: desfazer/refazer volta só o estado da tela (sem gravar, sem reler) e avisa como sucesso", async () => {
  const historico = codigo("components/editorial/use-local-history.ts");
  assert.doesNotMatch(historico, /fetch\(|supabase|\.from\(/, "o histórico não fala com o servidor");
  const tela = codigo("modules/minerador/minerador-workspace.tsx").replace(/\r\n/g, "\n");
  assert.match(tela, /const restoreKeywordSnapshot = useCallback\(\(snapshot: KeywordItem\[\]\) => \{\n\s*setKeywords\(snapshot\);/, "restaurar = setKeywords da cópia");
  assert.match(tela, /undoKeywordHistory\(\);\n\s*showNotification\("success", "Voltando uma alteração na lista atual\."\);/);
});

test("P-3 · desfazer não volta dado gravado sem o servidor (D7)", { todo: "vermelho até a fase da D7 (P-3, F6): desfazer só para seleção/filtro/organização, ou vira gravação com prévia" }, async () => {
  const tela = codigo("modules/minerador/minerador-workspace.tsx");
  assert.doesNotMatch(tela, /pushKeywordsHistory\(keywords, `Alterar status/);
});

/* ======================================= P-4 · exclusão comum × por cor */

/*
 * 2026-10-17 · P-4 FEITA (pedido do dono "ele tem que deixar apagar todo o
 * grupo"): o "hoje:" da exclusão comum sem hash deu lugar à regra nova (abaixo
 * e no G18). Continua "hoje:" só o palpite de "Apagar Duplicadas" sobre qual
 * fica — ele entra na MESMA prévia, hash e confirmação, mas a escolha de qual
 * manter ainda é do navegador (backlog).
 */
test("P-4 · hoje: \"Apagar Duplicadas\" escolhe qual fica por palpite do navegador (a exclusão passa pela mesma prévia, hash e confirmação)", async () => {
  const tela = codigo("modules/minerador/minerador-workspace.tsx").replace(/\r\n/g, "\n");
  assert.match(tela, /: nonPublished\.slice\(1\)\.map\(k => k\.id\);/, "\"Apagar Duplicadas\" mantém a primeira da tela");
  assert.match(tela, /await handleBatchDelete\(false, idsToDelete\);/, "e entra na exclusão de sempre");
});

test("P-4 · a mesma confirmação forte e com hash nos dois casos", async () => {
  const comum = codigo("app/api/minerador/marcas/[brandId]/keywords/delete/route.ts");
  assert.match(comum, /decisionHash: z\.string\(\)/, "a exclusão comum recebe a decisão");
  assert.match(comum, /decisionHash: input\.decisionHash \?\? null/);
  const nucleo = codigo("lib/minerador/keyword-delete-core.ts");
  assert.match(nucleo, /if \(input\.decisionHash !== decisionHash\) return refuse\("DECISION_STALE"/);
  assert.match(nucleo, /const conferida = checkDeleteConfirmation\(preview\.confirmation, input\.typed \?\? \{\}\);/);
  const cor = codigo("app/api/minerador/marcas/[brandId]/keywords/delete-group/route.ts");
  assert.match(cor, /decisionHash/, "a exclusão por cor exige hash");
  const tela = codigo("modules/minerador/minerador-workspace.tsx");
  assert.match(tela, /requirement=\{deleteReview\?\.requirement \?\? null\}/, "o diálogo de sempre pede a confirmação da regra única");
});

/* ============================== A11 · D2-bis pela marca órfã (Ainda não verificado → fechado) */

test("A11 · hoje: a marca de principal ÓRFÃ (Assunto perdido) ainda dispensa o Volume na aprovação", () => {
  const orfa = { dna_origem: "logico_deterministico", keyword_declared_principal: { subjectKeywordId: "80000000-0000-4000-8000-000000000001", groupId: AZUL, planVersion: 1 } };
  const viva = { ...orfa };
  const comLogica = deriveLogicalKeywordBatchItem({ id: "80000000-0000-4000-8000-000000000001", keyword: "internet para streaming", analise_semantica: viva }, null, LATER).update;
  const prontidao = resolveApprovalReadiness({ semantic: comLogica.analise_semantica, intent: comLogica.intent });
  assert.equal(resolveKeywordSubject(comLogica.analise_semantica).declared, false, "sem Assunto");
  assert.equal(prontidao.ok, true, "hoje: aprova sem Volume pela marca órfã");
});

test("A11 · a dispensa exige a marca E o Assunto vivo com o plano do mesmo grupo", { todo: "vermelho até a F6 (A11): `resolveApprovalReadiness` ignora a marca órfã" }, () => {
  const orfa = { dna_origem: "logico_deterministico", keyword_declared_principal: { subjectKeywordId: "80000000-0000-4000-8000-000000000001", groupId: AZUL, planVersion: 1 } };
  const comLogica = deriveLogicalKeywordBatchItem({ id: "80000000-0000-4000-8000-000000000001", keyword: "internet para streaming", analise_semantica: orfa }, null, LATER).update;
  assert.ok(resolveApprovalReadiness({ semantic: comLogica.analise_semantica, intent: comLogica.intent }).missing.includes("volume"));
});
