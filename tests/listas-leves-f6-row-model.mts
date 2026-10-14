/**
 * F6 · o que a PLANILHA do Processador lê de cada linha — os MESMOS resolvers
 * que `modules/minerador/minerador-workspace.tsx` chama ao montar a linha
 * (coluna a coluna) e a lista (filtros e ordenação de `deriveMineradorTableRows`).
 *
 * Usado pelo teste de paridade (`listas-leves-paridade-2026-10-13.test.mts`)
 * e pela medição sobre as linhas reais: `rowModel(linha inteira)` tem de ser
 * igual a `rowModel(linha leve)`.
 */
import { resolveCanonicalKeywordSnapshot } from "../lib/minerador/canonical-keyword-snapshot.ts";
import { classifyKgrMeasurement, hasLegacyPendingKgrApplicability, isInKgrInterestVolumeRange, kgrTechnicalTone } from "../lib/minerador/kgr-applicability.ts";
import { assessVolumeKgrConsistency, hasExplicitZeroMeasurement } from "../lib/minerador/volume-kgr-consistency.ts";
import { processorCpcCell, processorKdCell, processorResultsCell, processorVolumeCell, matchesProcessorRunFilter } from "../lib/minerador/processor-table-cells.ts";
import { readVolumeEligibility } from "../lib/minerador/volume-eligibility.ts";
import { readPublicationLink, readSiteOrigin } from "../lib/minerador/publication-link.ts";
import { resolveKeywordPublication } from "../lib/minerador/keyword-lifecycle.ts";
import { resolveKeywordVinculo } from "../lib/minerador/keyword-vinculo.ts";
import { keywordLockVolume } from "../lib/minerador/keyword-plan-lock.ts";
import { resolveSubjectArticleView, subjectHeadline } from "../lib/minerador/subject-article-view.ts";
import { readPrimaryKeywordPolicy } from "../lib/minerador/primary-keyword-policy.ts";
import { convertedTitleIndex } from "../lib/minerador/subject-conversion.ts";
import { deriveMineradorTableRows, KGR_FILTER_GROUPS, VINCULO_FILTER_GROUPS, PROCESS_RUN_FILTER_OPTIONS, parseCombinedKgrFilter, parseCombinedVinculoFilter, type MineradorTableFilters } from "../lib/minerador/table-view.ts";
import { readCanonicalKeywordDna } from "../lib/minerador/logical-read-model.ts";

export type Row = {
  id: string;
  keyword: string;
  status: string;
  intent?: string | null;
  lista_id: string | null;
  group_id?: string | null;
  volume_search?: number | null;
  results_allintitle?: number | null;
  kgr_score?: number | null;
  volume_source?: string | null;
  analise_semantica?: Record<string, unknown> | null;
  [column: string]: unknown;
};

type Ctx = { byId: Map<string, Row>; converted: ReturnType<typeof convertedTitleIndex> };

export function rowContext(rows: readonly Row[]): Ctx {
  return {
    byId: new Map(rows.map(row => [row.id, row])),
    converted: convertedTitleIndex(rows.map(row => ({ id: row.id, keyword: row.keyword, semantic: (row.analise_semantica && typeof row.analise_semantica === "object" ? row.analise_semantica : null) }))),
  };
}

/** Uma linha da planilha, como a tela a desenha (só valores, sem JSX). */
export function rowModel(item: Row, ctx: Ctx): Record<string, unknown> {
  const semantic = item.analise_semantica || null;
  const snap = resolveCanonicalKeywordSnapshot(item as never);
  const volumeValue = snap.metrics.volume.value;
  const resultValue = snap.metrics.result.value;
  const score = snap.metrics.kgr.score;
  const volumeMeasurement = semantic?.volume_measurement && typeof semantic.volume_measurement === "object" && !Array.isArray(semantic.volume_measurement)
    ? semantic.volume_measurement as Record<string, unknown>
    : null;
  const keywordSemanticOf = (keywordId: string) => (ctx.byId.get(keywordId)?.analise_semantica ?? null) as Record<string, unknown> | null;
  const plan = {
    keywordId: item.id,
    keyword: item.keyword ?? null,
    volume: keywordLockVolume({ semantic, volumeSearch: item.volume_search ?? null, resultsAllintitle: item.results_allintitle ?? null }),
    subjectSemanticOf: keywordSemanticOf,
    keywordTextOf: (id: string) => ctx.byId.get(id)?.keyword ?? null,
  };
  const siteOrigin = readSiteOrigin(semantic);
  const publicationLink = snap.vinculo;
  const logic = readCanonicalKeywordDna(item as never, { includeSerpEvidence: false });
  return {
    // Do snapshot, só o que a linha e os filtros da planilha leem (minerador-workspace.tsx ~4412–4495; table-view.ts).
    status: snap.status,
    intent: snap.semantic.intent,
    intentLabel: snap.semantic.intentLabel,
    intentState: snap.semantic.intentState,
    niche: snap.semantic.niche,
    volume: snap.metrics.volume.value,
    result: snap.metrics.result.value,
    kgrScore: snap.metrics.kgr.score,
    kgrApplicability: snap.metrics.kgr.applicability,
    cpc: { source: snap.metrics.cpc.source, sortValue: snap.metrics.cpc.sortValue },
    kd: { source: snap.metrics.kd.source, value: snap.metrics.kd.value },
    approvalRecord: snap.approval,
    vinculoLink: publicationLink,
    // A carga da tela monta o rascunho da Qualificação com a intenção e o funil da Lógica (fetchData).
    logic: { intent: logic.intent, funnel: logic.funnel },
    kgrLegacyPending: hasLegacyPendingKgrApplicability(semantic as never),
    kgrInInterest: isInKgrInterestVolumeRange(volumeValue),
    kgrMeasurement: classifyKgrMeasurement({ kgrScore: score, volume: volumeValue, results: resultValue }),
    kgrTone: score === null ? null : kgrTechnicalTone(score, volumeValue),
    consistency: assessVolumeKgrConsistency({ volume: volumeValue, results: resultValue, kgrScore: score, semantic } as never),
    zeroConfirmed: hasExplicitZeroMeasurement(semantic),
    confirmedVolume: Boolean(volumeMeasurement && volumeMeasurement.match === "exact" && ["confirmed", "zero_confirmed"].includes(String(volumeMeasurement.status || "")) && typeof volumeMeasurement.rawVolume === "number" && volumeMeasurement.rawVolume === volumeValue),
    resultsCell: processorResultsCell({ semantic, value: resultValue }),
    volumeCell: processorVolumeCell({ semantic, value: volumeValue }),
    cpcCell: processorCpcCell({ semantic, value: snap.metrics.cpc.sortValue }),
    kdCell: processorKdCell({ semantic, value: snap.metrics.kd.value }),
    volumeEligibility: readVolumeEligibility(item as never),
    siteOriginUrl: siteOrigin ? { declaredCanonicalUrl: siteOrigin.declaredCanonicalUrl, resolvedUrl: siteOrigin.resolvedUrl, sourceUrl: siteOrigin.sourceUrl, lastCheckedAt: siteOrigin.lastCheckedAt } : null,
    publicationProtected: resolveKeywordPublication({ status: item.status, semantic }).isPublished,
    vinculo: resolveKeywordVinculo({ status: item.status, semantic, plan }),
    subject: subjectHeadline(resolveSubjectArticleView({
      keywordId: item.id,
      keyword: item.keyword,
      semantic,
      groupOf: () => null,
      keywordTextOf: id => ctx.byId.get(id)?.keyword ?? null,
      convertedTo: ctx.converted.get(item.id) ?? null,
      subjectSemanticOf: keywordSemanticOf,
    })),
    primaryPolicy: readPrimaryKeywordPolicy({ publicationDeclared: publicationLink.state === "published", status: item.status, semantic: semantic as never }),
    publicationRead: readPublicationLink({ status: item.status, evidence: siteOrigin }),
    processRun: { with: matchesProcessorRunFilter(item as never, "with_process" as never), without: matchesProcessorRunFilter(item as never, "without_process" as never) },
  };
}

const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const GRUPO = "07fec332-4b0a-43cb-af19-cedfd9b24897";
const ASSUNTO = "s-5";
const PRINCIPAL = "s-6";

/** Linhas sintéticas de borda (formatos que as 33 reais não cobrem). */
export const SINTETICAS: Row[] = [
  // Sem DNA nenhum.
  { id: "s-1", brand_id: BRAND, keyword: "linha sem dna", status: "bruto", intent: null, lista_id: null, volume_search: null, results_allintitle: null, kgr_score: null, volume_source: "real", analise_semantica: null },
  // Formato antigo: só campos planos (sem contrato da Lógica), com nicho e funil revisados.
  { id: "s-2", brand_id: BRAND, keyword: "formato antigo plano", status: "em_revisao", intent: "informacional", lista_id: null, volume_search: 320, results_allintitle: 40, kgr_score: 0.125, volume_source: "real",
    analise_semantica: { intencao_principal: "Informativo", intencao_revisada: "Comercial", nicho: "Internet", nicho_override: "Fibra", funnel: "MOFU", funnel_revisado: "BOFU", kgr_aplicabilidade: "applicable", kgr_decisao_origem: "human", dna_campos_logicos: { x: "pesado" }, evidencias_logicas: ["a", "b"] } },
  // Aprovada e depois mexida (diverge): a planilha tem de mostrar "Em revisão".
  { id: "s-3", brand_id: BRAND, keyword: "aprovada mexida", status: "aprovado", intent: "comercial", lista_id: null, volume_search: 900, results_allintitle: 10, kgr_score: 0.011, volume_source: "real",
    analise_semantica: { aprovacao: { contentHash: "x", signature: "fnv1a-v3:nao-bate", approvedAt: "2026-10-01T00:00:00Z", approvedBy: "dono", version: 2 }, intencao_principal: "Comercial", dna_campos_logicos: { y: 1 } } },
  // Publicada por vínculo, com histórico do vínculo (fica no painel).
  { id: "s-4", brand_id: BRAND, keyword: "publicada vinculo", status: "publicado", intent: "informacional", lista_id: null, volume_search: 50, results_allintitle: 3, kgr_score: 0.06, volume_source: "real",
    analise_semantica: { site_origin: { publicationStatus: "published", resolvedUrl: "https://ex.com/a", declaredCanonicalUrl: "https://ex.com/a", siteRole: "article", publicationConfirmedAt: "2026-09-01T00:00:00Z", publicationConfirmedBy: "dono", publication_link_history: [{ at: "2026-09-01" }] }, primary_keyword_policy: "locked", site_origins: [{ x: 1 }] } },
  // Assunto com plano (cadastro) e a principal declarada dele, em outra linha: a trava e o Assunto da coluna Vínculo.
  { id: ASSUNTO, brand_id: BRAND, keyword: "diferença entre internet e wifi", status: "aprovado", intent: "informacional", lista_id: null, group_id: GRUPO, volume_search: 0, results_allintitle: null, kgr_score: null, volume_source: "real",
    analise_semantica: {
      keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, entry: { title: "Diferença entre internet e Wi-Fi", source: "cadastro" }, plan: { groupId: GRUPO, planVersion: 1, order: 2, role: "Suporte", scope: "Explica a diferença.", declaredPrincipal: { keywordId: PRINCIPAL, phrase: "internet fibra óptica" } } },
      keyword_subject_actor: "11111111-1111-4111-8111-111111111111", keyword_subject_at: "2026-10-13T10:00:00+00:00", keyword_subject_origin: "import",
      nicho_override: "Conectividade", funnel: "TOFU", intencao_principal: "Informativo",
    } },
  { id: PRINCIPAL, brand_id: BRAND, keyword: "internet fibra óptica", status: "aprovado", intent: "comercial", lista_id: null, group_id: GRUPO, volume_search: 2400, results_allintitle: 90, kgr_score: 0.0375, volume_source: "real",
    analise_semantica: { keyword_declared_principal: { subjectKeywordId: ASSUNTO, groupId: GRUPO, planVersion: 1 }, intencao_principal: "Comercial", funnel: "BOFU", nicho_override: "Fibra" } },
];

const BASE_FILTERS: MineradorTableFilters = {
  searchQuery: "", status: "Todos", intent: "Todos", listId: "Todos", siteRelation: "Todos", siteArchitecture: "Todos",
  sitePublication: "Todos", kgrApplicability: "Todos", kgrMeasurement: "Todos", volumeEligibility: "Todos", processRun: "Todos",
  sortColumn: "keyword", sortDirection: "asc",
};

/** Todas as combinações de filtro/ordenação que a planilha oferece, com a ordem resultante dos ids. */
export function listModel(rows: readonly Row[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const run = (label: string, filters: Partial<MineradorTableFilters>) => {
    out[label] = deriveMineradorTableRows(rows as never, [], { ...BASE_FILTERS, ...filters }).map(row => row.id);
  };
  for (const sortColumn of ["keyword", "results_allintitle", "volume_search", "kgr_score", "cpc", "keyword_difficulty", "nicho", "lista"] as const) {
    for (const sortDirection of ["asc", "desc"] as const) run(`sort:${sortColumn}:${sortDirection}`, { sortColumn, sortDirection });
  }
  for (const status of ["bruto", "em_revisao", "aprovado", "publicado", "descartado"]) run(`status:${status}`, { status });
  for (const intent of ["unknown", "informational", "commercial", "transactional", "navigational", "informacional", "comercial", "transacional"]) run(`intent:${intent}`, { intent });
  for (const group of KGR_FILTER_GROUPS) for (const option of group.options) run(`kgr:${option.value}`, parseCombinedKgrFilter(option.value));
  for (const group of VINCULO_FILTER_GROUPS) for (const option of group.options) run(`vinculo:${option.value}`, parseCombinedVinculoFilter(option.value));
  for (const option of PROCESS_RUN_FILTER_OPTIONS) run(`process:${option.value}`, { processRun: option.value as never });
  for (const volumeEligibility of ["operational", "pending", "eligible", "below_threshold", "unavailable", "measurement_failed"] as const) run(`volume:${volumeEligibility}`, { volumeEligibility });
  run("search:a", { searchQuery: "a" });
  return out;
}
