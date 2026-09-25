import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCompleteHumanReview, completeHumanReview } from "../lib/minerador/human-review.ts";
import { planHumanReviewCompletionBatch } from "../lib/minerador/human-review-completion-batch.ts";
import { partitionSubjectKeywords } from "../lib/minerador/vinculo-screen.ts";
import { processorCpcCell, processorVolumeCell, PROCESSOR_PROCESSED_EMPTY_HINT } from "../lib/minerador/processor-table-cells.ts";
import { candidatesAnsweredWithoutVolume, discoveryVolumeCell } from "../lib/minerador/discovery-table-cells.ts";
import { candidateMatchesDiscoveryOrganization, EMPTY_DISCOVERY_ORGANIZATION } from "../lib/minerador/discovery-organization.ts";
import type { DiscoveryCandidate } from "../lib/minerador/discovery-keywords.ts";
import { normalizeMineradorLastOrganization } from "../lib/minerador/last-organization.ts";
import { VINCULO_FILTER_GROUPS } from "../lib/minerador/table-view.ts";
import { formatBatchElapsed, formatBatchProgressCompact, runProgressiveBatch } from "../lib/ui/batch-progress.ts";
import { NATIVE_SELECT_THEME } from "../lib/ui/native-select-theme.ts";
import { PAGE_TYPE_HUMAN_DECLARED_REASON } from "../lib/arquiteto/editorial-unit-declaration.ts";

/*
 * Correções da revisão de 2026-09-24 sobre a planilha, o rodapé e o lote.
 * Fixtures locais; nenhuma rede, nenhum banco.
 */

function stripComments(source: string) {
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
const panels = stripComments(readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8"));
const discoveryTable = stripComments(readFileSync(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8"));
const vinculoSelectsSource = stripComments(readFileSync(new URL("../components/editorial/vinculo-selects.tsx", import.meta.url), "utf8"));
const orderSelect = stripComments(readFileSync(new URL("../modules/minerador/keyword-table/keyword-table-order.tsx", import.meta.url), "utf8"));
const proposal = stripComments(readFileSync(new URL("../lib/arquiteto/architecture-working-proposal.ts", import.meta.url), "utf8"));

function kgrCalculable(extra: Record<string, unknown> = {}) {
  return {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    nicho: "Serviços condominiais",
    funnel: "TOFU",
    funnel_source: "qualificacao_logica",
    dna_revisao_humana: "pendente",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-08-18T12:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", resultsAllintitle: 336, measuredAt: "2026-08-18T12:01:00.000Z" },
    kgr_aplicabilidade: "pending",
    ...extra,
  };
}

const subject = { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null } };

test("Assunto anula o KGR também na conclusão: o lote conclui e o KGR em grupo continua pulando", () => {
  assert.equal(canCompleteHumanReview(kgrCalculable()).pendingKgrDecision, true, "sem Assunto, o KGR calculável continua exigido");

  const semantic = kgrCalculable(subject);
  assert.equal(canCompleteHumanReview(semantic).pendingKgrDecision, undefined);
  const completed = completeHumanReview({ semantic, intent: "Informativa", actorId: "human-1", completedAt: "2026-09-24T12:00:00.000Z" });
  assert.equal((completed.human_review as { kgrDecisionReviewed: boolean }).kgrDecisionReviewed, true);
  assert.equal(completed.kgr_aplicabilidade, "pending", "a conclusão não inventa a aplicabilidade");

  const keyword = { id: "a", keyword: "seo para clínicas", intent: "Informativa", analise_semantica: semantic };
  const plan = planHumanReviewCompletionBatch([keyword], { actorId: "human-1", completedAt: "2026-09-24T12:00:00.000Z" });
  assert.deepEqual(plan.pendingKgrIds, []);
  assert.equal(plan.updates.length, 1);

  const partition = partitionSubjectKeywords([keyword]);
  assert.deepEqual(partition.subjects.map(item => item.id), ["a"]);
  assert.equal(partition.eligible.length, 0);

  assert.match(panels, /const subjectLocksKgr = subjectDeclared;/, "a Revisão desliga o KGR sempre que há Assunto");
});

test("Volume em grupo: keyword que o Google Ads não devolve termina em 0 apagado, não em — nem Erro", () => {
  const attempts = { volume: { state: "success" as const, finishedAt: "2026-09-24T12:00:00.000Z" } };
  const cell = processorVolumeCell({ semantic: {}, value: null, attempts });
  assert.equal(cell.tone, "processed_empty");
  assert.equal(cell.text, "0");
  assert.equal(cell.hint, PROCESSOR_PROCESSED_EMPTY_HINT);
  assert.equal(processorCpcCell({ semantic: {}, value: null, attempts }).tone, "processed_empty");
  assert.equal(processorVolumeCell({ semantic: {}, value: null }).tone, "not_processed", "sem tentativa e sem marcador, segue —");
  assert.equal(processorVolumeCell({ semantic: {}, value: null, attempts: { volume: { state: "failed" } } }).tone, "error");

  const start = workspace.indexOf("const unmatchedIds = new Set(");
  const handler = workspace.slice(start, start + 900);
  assert.match(handler, /setProcessAttempt\(chunkIds\.filter\(id => !confirmedIds\.includes\(id\) && unmatchedIds\.has\(id\)\), "volume", "success", chunkRequestId\)/);
  assert.doesNotMatch(handler, /clearProcessAttempt\(/);
});

function manual(id: string, patch: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    candidateId: id, keyword: `kw ${id}`, canonicalKeyword: `kw ${id}`, averageMonthlySearches: null, monthlySearchVolumes: [], competition: null,
    competitionIndex: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null, currencyCode: "BRL", timeZone: null,
    targeting: null, source: "manual", provider: null, providerVersion: null, measuredAt: null, existingKeywordId: null, ...patch,
  };
}

test("Descobrir: candidata pedida em Atualizar métricas e fora das projections vira 0 apagado; o dado segue null", () => {
  assert.deepEqual(candidatesAnsweredWithoutVolume(["a", "b", "c", "b"], [{ keywordId: "a" }, { keywordId: null }]), ["b", "c"]);
  assert.deepEqual(candidatesAnsweredWithoutVolume(["a"], undefined), ["a"]);

  const candidate = manual("b");
  assert.equal(discoveryVolumeCell(candidate).tone, "not_processed");
  const answered = discoveryVolumeCell(candidate, { answeredWithoutData: true });
  assert.equal(answered.tone, "processed_empty");
  assert.equal(answered.text, "0");
  assert.equal(candidate.averageMonthlySearches, null, "ADR-020: nada vira zero no dado");
  assert.equal(candidateMatchesDiscoveryOrganization(candidate, "", "", "", new Set(), "", { ...EMPTY_DISCOVERY_ORGANIZATION, volume: "has" }), false, "o filtro Com volume não conta o 0 apagado");

  assert.match(discoveryTable, /const answeredEmpty = candidatesAnsweredWithoutVolume\(requestedIds, payload\.projections\);/);
  assert.match(discoveryTable, /discoveryVolumeCell\(candidate, \{ answeredWithoutData: volumeAnsweredIds\.has\(candidate\.candidateId\) \}\)/);
});

test("Descobrir: keyword quebra linha como no Processador, sem cortar", () => {
  assert.match(discoveryTable, /const keywordCell = "[^"]*whitespace-normal break-words"/);
  assert.doesNotMatch(discoveryTable, /const keywordCell = "[^"]*(?:whitespace-nowrap|truncate)/);
});

test("preferência antiga com Vínculo que o seletor não oferece volta para Todos", () => {
  for (const legacy of ["not_confirmed", "not_found", "redirected", "canonical_conflict"]) {
    assert.equal(normalizeMineradorLastOrganization({ filterSitePublication: legacy }).filterSitePublication, "Todos", legacy);
  }
  const offered = VINCULO_FILTER_GROUPS[0].options.map(option => option.value.split(":").at(-1) as string);
  for (const value of offered) {
    assert.equal(normalizeMineradorLastOrganization({ filterSitePublication: value }).filterSitePublication, value, value);
  }
});

test("Revisão Humana: na publicada a troca do tipo não grava o peso declarado", () => {
  assert.match(panels, /void onAction\?\.\(vinculo\.publicationDeclared \? \{ type: "page_type", pageType: choice\.pageType \} : \{ type: "page_type", pageType: choice\.pageType, stance: choice\.stance \}\)/);
});

test("gravação individual do tipo leva tipo e peso para a revisão aberta", () => {
  const branch = workspace.slice(workspace.indexOf('if (action.type === "page_type")'), workspace.indexOf('if (action.type === "primary_policy")'));
  assert.match(branch, /PAGE_TYPE_DRAFT_KEYS\.filter\(key => key in applied\.semantic\)/);
  assert.match(branch, /setHumanReviewDrafts\(current => current\[item\.id\]/);
  assert.match(workspace, /const PAGE_TYPE_DRAFT_KEYS = \["keyword_page_type", "keyword_page_type_stance", "keyword_page_type_actor", "keyword_page_type_at", "keyword_page_type_history"\] as const;/);
});

test("Arquiteto: o tipo declarado pelo humano não contradiz a primária provisória", () => {
  assert.match(PAGE_TYPE_HUMAN_DECLARED_REASON, /primária segue provisória/);
  assert.doesNotMatch(PAGE_TYPE_HUMAN_DECLARED_REASON, /a formação respeita esta decisão/);
  assert.match(proposal, /isHumanDeclaredPageType\(declaracao\)\s*\?\s*`O humano declarou "\$\{nome\}" como Silo no Minerador/);
});

test("selects nativos: tema compartilhado alcança optgroup e respeita o tema claro", () => {
  assert.match(NATIVE_SELECT_THEME, /\bscheme-dark\b/);
  assert.match(NATIVE_SELECT_THEME, /in-\[\.light\]:scheme-light/);
  assert.match(NATIVE_SELECT_THEME, /\*\*:bg-background/);
  assert.match(NATIVE_SELECT_THEME, /\*\*:text-foreground/);
  assert.doesNotMatch(NATIVE_SELECT_THEME, /(^|\s)\*:/);
  assert.match(orderSelect, /\$\{NATIVE_SELECT_THEME\}/, "Organização das linhas, compartilhado pelas duas planilhas");
  // 2026-09-24 (pedido do dono): Posto, Potencial e Assunto saíram para o
  // componente comum com o rodapé (vinculo-selects.tsx), com a classe própria
  // que carrega o mesmo tema.
  const reviewSelects = panels.match(/<select[\s\S]*?<\/select>/g) || [];
  const vinculoSelects = vinculoSelectsSource.match(/<select[\s\S]*?<\/select>/g) || [];
  assert.ok(reviewSelects.length + vinculoSelects.length >= 5);
  for (const select of reviewSelects) assert.match(select, /NATIVE_SELECT_THEME/, "todo select da Revisão abre no tema");
  assert.match(vinculoSelectsSource, /export const VINCULO_SELECT_CLASS = `[^`]*\$\{NATIVE_SELECT_THEME\}`;/);
  assert.equal(vinculoSelects.length, 3, "os três selects do Vínculo");
  for (const select of vinculoSelects) assert.match(select, /className=\{VINCULO_SELECT_CLASS\}/, "os selects do Vínculo abrem no tema");
});

test("rodapé: nenhuma ação cortada em silêncio e o Potencial sem largura fixa", () => {
  const bar = workspace.slice(workspace.indexOf("<KeywordTableBulkBarShell"), workspace.indexOf("</KeywordTableBulkBarShell>"));
  assert.match(bar, /className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden/);
  assert.doesNotMatch(bar, /flex-1 items-center gap-1 overflow-hidden/);
  // Atualizado em 2026-09-24 (pedido do dono): os 3 selects do Vínculo voltaram
  // a ser um seletor só, "Vínculo", um botão que abre o painel dos três grupos.
  const triggerStart = bar.indexOf("data-vinculo-batch-trigger");
  const vinculoTrigger = bar.slice(triggerStart, bar.indexOf("</button>", triggerStart));
  const triggerClass = vinculoTrigger.match(/className="([^"]*)"/)?.[1] ?? "";
  assert.match(triggerClass, /\b2xl:inline-flex\b/);
  assert.doesNotMatch(` ${triggerClass}`, /\s(?:sm:)?w-(?:\d|\[)/, "o Vínculo sem largura fixa");
  assert.equal((bar.match(/ 2xl:block /g) || []).length, 1, "o KGR aparece no rodapé só de 2xl para cima");
  assert.equal((bar.match(/ 2xl:inline-flex /g) || []).length, 1, "o Vínculo também");
  assert.equal((bar.match(/ 2xl:hidden"/g) || []).length, 2, "e ficam em Mais ações abaixo disso");
  assert.equal((bar.match(/min-\[1800px\]:block/g) || []).length, 1, "Status");
  assert.equal((bar.match(/min-\[1800px\]:hidden"/g) || []).length, 2, "Status e Excluir em Mais ações");
  assert.match(bar, /min-\[1800px\]:flex lg:px-2"/, "Excluir no rodapé só em tela larga");
});

test("KGR em grupo passa por confirmação: a seta no select fechado não grava", () => {
  const bar = workspace.slice(workspace.indexOf("<KeywordTableBulkBarShell"), workspace.indexOf("</KeywordTableBulkBarShell>"));
  const kgrSelects = bar.match(/aria-label="Aplicabilidade do KGR das selecionadas"[\s\S]*?onChange=\{[^\n]*\}/g) || [];
  assert.equal(kgrSelects.length, 2);
  for (const select of kgrSelects) {
    assert.match(select, /setKgrBatchConfirm\(nextApplicability\)/);
    assert.doesNotMatch(select, /handleBatchKgrApplicability/);
  }
  const dialog = workspace.slice(workspace.indexOf("{kgrBatchConfirm && kgrBatchPreview && ("), workspace.indexOf("<DeleteConfirmation open={deleteSimpleOpen}"));
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /void handleBatchKgrApplicability\(nextApplicability as KgrApplicability\)/);
  assert.match(dialog, /disabled=\{updating \|\| bulkActionProcessing \|\| kgrBatchPreview\.updates === 0\}/);
  assert.match(workspace, /describeSubjectSkipped\(subjects\.length, "KGR"\)\]\.filter/, "a prévia conta os Assuntos pulados");
});

test("texto vivo curto e relógio do bloco: dá para ver que o lote segue vivo", async () => {
  let clock = 1_000;
  const snapshots: Array<{ done: number; chunkStartedAtMs?: number }> = [];
  const final = await runProgressiveBatch({
    label: "Resultados",
    items: ["a", "b", "c", "d", "e", "f"],
    itemId: item => item,
    chunkSize: 2,
    now: () => clock,
    yieldToUi: async () => { clock += 5_000; },
    runChunk: async chunk => chunk.map(id => ({ id, status: "succeeded" as const })),
    onProgress: snapshot => { snapshots.push({ done: snapshot.done, chunkStartedAtMs: snapshot.chunkStartedAtMs }); },
  });
  assert.equal(final.done, 6);
  assert.deepEqual([...new Set(snapshots.map(item => item.chunkStartedAtMs).filter(value => value !== undefined))], [1_000, 6_000, 11_000]);

  assert.equal(formatBatchProgressCompact({ ...final, status: "running", done: 5, remaining: 25, total: 30, failed: 2 }), "5 de 30 · faltam 25");
  assert.match(formatBatchProgressCompact(final), /^Concluído: 6 ok, 0 com falha$/);
  assert.equal(formatBatchElapsed(1_000, 41_000), "há 40s");
  assert.equal(formatBatchElapsed(0, 150_000), "há 2 min");
  assert.equal(formatBatchElapsed(null, 10), null);

  assert.match(workspace, /window\.setInterval\(\(\) => setBulkProgressNowMs\(Date\.now\(\)\), 1000\)/);
  assert.match(workspace, /\$\{bulkChunkElapsed \? ` · \$\{bulkChunkElapsed\}` : ""\}/);
});
