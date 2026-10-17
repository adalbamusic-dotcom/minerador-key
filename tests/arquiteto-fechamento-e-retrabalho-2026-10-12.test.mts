import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  markSiloConsolidationIndeterminate,
  openSiloConsolidationOperation,
  registerSiloConsolidationAttempt,
  retryPreservesEnvelope,
  siloConsolidationFailureDisposition,
  siloConsolidationOperationForRetry,
  siloConsolidationRequestBody,
  siloPageCanonicalRefusal,
  SILO_PUBLISHED_CANONICAL_MISSING_MESSAGE,
  SILO_SITE_REQUIRED_MESSAGE,
  type SiloConsolidationOperation,
} from "../lib/arquiteto/silo-consolidation-operation.ts";
import { resolveSiloPagePublicationIdentity } from "../lib/arquiteto/silo-page-publication-identity.ts";
import { consolidateRemoteSiloFromWorkingCopy } from "../lib/arquiteto/canonical-workspace.ts";
import {
  improvementAiUsageKey,
  improvementDiscoveryCostSentence,
  improvementDiscoveryMaxRequests,
  improvementInputsFingerprint,
  improvementReuseSeed,
  IMPROVEMENT_REUSE_WINDOW_MS,
  type ImprovementReusableRun,
} from "../lib/arquiteto/article-improvement-reuse.ts";
import { ArticleImprovementRequestSchema } from "../lib/arquiteto/article-improvement-request.ts";
import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import type { ImprovementKeyword } from "../lib/arquiteto/article-improvement.ts";

/*
 * DIAGNÓSTICO DE 2026-10-12 (WifiConecta, d4fa133a-…).
 *
 * (a) Fechar o Silo falhava no servidor com SILO_PAGE_APPROVAL_GATE_MISSING /
 *     SILO_PAGE_APPROVAL_CANONICAL_MISSING porque `marcas.site_url` estava
 *     NULL: a URL canônica da SiloPage nova nasce do site + slug.
 * (b) A retomada reenviava a operação congelada (com canonical null) depois
 *     de uma recusa 409 de domínio, que não gravou nada — a recusa se repetia.
 * (c) Cada "Preparar" da melhoria chamava a IA e a busca no Google Ads de
 *     novo, sem registro de uso.
 *
 * Tudo com fixtures, sem rede. A orquestração do servidor (reaproveitamento
 * com zero chamada nova, busca sob pedido, registro de uso) é provada pelo
 * núcleo real em `arquiteto-article-improvement-server.test.mts`
 * (`npm run test:arquiteto:lentes`), que precisa de mocks de módulo.
 */

const semComentarios = (codigo: string) => codigo
  .split("\n")
  .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("/*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("{/*"))
  .join("\n");

const brandId = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const territoryRef = "territory:0b8f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

function operacao(canonical: string | null, lock = 3): SiloConsolidationOperation {
  return openSiloConsolidationOperation({
    brandId,
    action: "create",
    territoryRef,
    territoryExpectedLock: 2,
    workingCopyExpectedLock: lock,
    siloDna: { versionId: "dna:v1", versionNumber: 1, createdAt: "2026-10-12T15:00:00.000Z", contentHash: "sha256:a", previousVersionId: null, payload: { siloId: "silo-1" } } as never,
    siloPage: { versionId: "page:v1", versionNumber: 1, createdAt: "2026-10-12T15:00:00.000Z", contentHash: "sha256:b", previousVersionId: null, payload: { siloPageId: "page-1", siloId: "silo-1", slug: "roteadores", canonical } } as never,
    statuses: { siloDna: "approved", siloPage: "approved" },
    decision: { actorUserId: "ator", decidedAt: "2026-10-12T15:00:00.000Z", reason: "fixture", territoryRef, pillarArticleId: "a1", supportArticleIds: [], excludedArticleIds: [], publishedIdentityResolved: false } as never,
    siloPageApproval: null,
  });
}

/** O cliente real (`consolidateRemoteSiloFromWorkingCopy`) diante de uma resposta simulada. */
async function falhaDoCliente(status: number, body: unknown): Promise<unknown> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    await consolidateRemoteSiloFromWorkingCopy(siloConsolidationRequestBody(operacao("https://wificonecta.com.br/roteadores")));
    return null;
  } catch (error) {
    return error;
  } finally {
    globalThis.fetch = original;
  }
}

// ------------------------------------------------ (a) fechamento sem site

test("(a) sem site da marca a SiloPage nova não tem canonical e o fechamento é recusado no cliente com a frase do que fazer", () => {
  const identidade = resolveSiloPagePublicationIdentity({ slug: "roteadores", brandSiteUrl: null });
  assert.equal(identidade.canonical, null);
  assert.equal(identidade.publicationStatus, "new");
  assert.equal(siloPageCanonicalRefusal(identidade), SILO_SITE_REQUIRED_MESSAGE);
  assert.equal(SILO_SITE_REQUIRED_MESSAGE, "Declare o site da marca em Marca → Site para fechar o Silo (a URL canônica da página do Silo nasce do site + slug)");
});

test("(a) com o site declarado o canonical nasce de site + slug e nada é recusado", () => {
  const identidade = resolveSiloPagePublicationIdentity({ slug: "roteadores", brandSiteUrl: "wificonecta.com.br" });
  assert.equal(identidade.canonical, "https://wificonecta.com.br/roteadores");
  assert.equal(siloPageCanonicalRefusal(identidade), null);
});

test("(a) página publicada sem canonical no catálogo pede a sincronização do site, não o site", () => {
  assert.equal(siloPageCanonicalRefusal({ canonical: null, publicationStatus: "published" }), SILO_PUBLISHED_CANONICAL_MISSING_MESSAGE);
  assert.equal(siloPageCanonicalRefusal({ canonical: "  ", publicationStatus: "new" }), SILO_SITE_REQUIRED_MESSAGE);
});

test("(a) o fechamento recusa antes de montar e enviar o envelope", () => {
  const fonte = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));
  const recusa = fonte.indexOf("const semCanonical = siloPageCanonicalRefusal(identidadePublicavel);");
  const monta = fonte.indexOf("const prepared = await createSiloConsolidationVersions(");
  const envia = fonte.indexOf("await consolidateRemoteSiloFromWorkingCopy(");
  assert.ok(recusa > 0 && recusa < monta && monta < envia, "a recusa vem antes de montar e de enviar");
  assert.match(fonte, /if \(semCanonical\) throw new Error\(semCanonical\);/);
});

// ------------------------------------------ (a) prévia com cópia de trabalho

test("(a) a prévia avisa também quando a SiloPage ainda não foi gravada (cópia de trabalho)", () => {
  const fonte = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));
  const inicio = fonte.indexOf("const siloPagePreflight = useMemo(() => {");
  const fim = fonte.indexOf("const workingCopyRestorePlan = useMemo(");
  assert.ok(inicio > 0 && fim > inicio);
  const previa = fonte.slice(inicio, fim);
  // As páginas gravadas continuam, e a frase vem antes do código do portão.
  assert.match(previa, /const paginasGravadas = Object\.values\(acceptedSiloPages\)\.map/);
  assert.match(previa, /aprovadaAgora \? \[\] : \[siloPageCanonicalRefusal\(identidade\)\]/);
  // As cópias de trabalho abertas sem SiloPage gravada entram, resolvidas como no fechamento.
  assert.match(previa, /const semPaginaGravada = remoteSiloWorkingCopies/);
  assert.match(previa, /!siloWorkingCopyIsReadOnly\(remote, consolidatedTerritoryRefs\)/);
  assert.match(previa, /!territoriosComPagina\.has\(remote\.workingCopy\.territoryRef\)/);
  assert.match(previa, /resolveSiloWorkingCopyIdentity\(/);
  assert.match(previa, /const motivo = siloPageCanonicalRefusal\(identidade\);/);
  assert.match(previa, /siloPage: "cópia de trabalho, ainda não gravada"/);
  assert.match(previa, /return \[\.\.\.paginasGravadas, \.\.\.semPaginaGravada\];/);
  assert.match(previa, /remoteSiloWorkingCopies, remoteTerritories, consolidatedTerritoryRefs\]\);/);
});

test("(a) a cópia de trabalho sem site produz exatamente a frase do aviso", () => {
  // A mesma resolução que a prévia faz para a cópia de trabalho: slug do Silo, sem catálogo, sem site.
  const identidade = resolveSiloPagePublicationIdentity({ slug: "roteadores-wifi", brandSiteUrl: null, observation: null });
  assert.equal(siloPageCanonicalRefusal(identidade), SILO_SITE_REQUIRED_MESSAGE);
});

// ----------------------------------------- (b) 409 descarta, 5xx retoma

test("(b) recusa 409 de domínio do servidor descarta a operação congelada", async () => {
  for (const mensagem of [
    "SILO_PAGE_APPROVAL_GATE_MISSING: SILO_PAGE_APPROVAL_CANONICAL_MISSING",
    "SILO_NOT_READY_FOR_CONSOLIDATION: PILLAR_MISSING",
    "HUMAN_SILO_CONSOLIDATION_REQUIRED: ",
    "ARTICLE_VERSION_MISMATCH: a1",
  ]) {
    const erro = await falhaDoCliente(409, { success: false, error: mensagem, code: "CONFLICT" });
    assert.ok(erro instanceof Error, mensagem);
    assert.equal(siloConsolidationFailureDisposition(erro), "discard", mensagem);
  }
});

test("(b) rede, 5xx, lock velho e recusa da RPC continuam indeterminados (retomada segura)", async () => {
  const servidor = await falhaDoCliente(503, { success: false, error: "Não foi possível concluir a operação canônica do Arquiteto.", code: "QUERY_FAILURE" });
  assert.equal(siloConsolidationFailureDisposition(servidor), "indeterminate");
  const semCorpo = await falhaDoCliente(502, "<html>gateway</html>");
  assert.equal(siloConsolidationFailureDisposition(semCorpo), "indeterminate");
  const stale = await falhaDoCliente(409, { success: false, error: "STALE_WORKING_COPY", code: "CONFLICT" });
  assert.equal(siloConsolidationFailureDisposition(stale), "indeterminate", "o lock pode ter mudado pelo commit anterior");
  const consumida = await falhaDoCliente(409, { success: false, error: "WORKING_COPY_ALREADY_CONSUMED", code: "CONFLICT" });
  assert.equal(siloConsolidationFailureDisposition(consumida), "indeterminate");
  assert.equal(siloConsolidationFailureDisposition(new TypeError("Failed to fetch")), "indeterminate");
  assert.equal(siloConsolidationFailureDisposition(Object.assign(new Error("SILO_PAGE_APPROVAL_STALE: x"), { code: "CONFLICT", status: 503 })), "indeterminate");
  assert.equal(siloConsolidationFailureDisposition(null), "indeterminate");
});

test("(b) depois do 5xx a retomada reenvia o mesmo corpo; depois do 409 a próxima tentativa remonta", () => {
  const primeira = registerSiloConsolidationAttempt(operacao("https://wificonecta.com.br/roteadores"));
  const corpo = siloConsolidationRequestBody(primeira);
  // 5xx: indeterminada, retomada byte a byte.
  const pendente = markSiloConsolidationIndeterminate(primeira, "503");
  const retomada = siloConsolidationOperationForRetry(pendente, { territoryRef, workingCopyExpectedLock: 3 });
  assert.equal(retomada, pendente);
  assert.ok(retryPreservesEnvelope(corpo, siloConsolidationRequestBody(retomada!)).ok);
  // 409 de domínio: o fechamento grava null no lugar da operação.
  const depoisDo409 = siloConsolidationFailureDisposition(Object.assign(new Error("SILO_PAGE_APPROVAL_GATE_MISSING: x"), { code: "CONFLICT" })) === "discard" ? null : pendente;
  assert.equal(siloConsolidationOperationForRetry(depoisDo409, { territoryRef, workingCopyExpectedLock: 3 }), null);
});

test("(b) operação congelada com canonical null nunca é retomada (nunca passou no portão), mesmo se ficou indeterminada", () => {
  const congelada = markSiloConsolidationIndeterminate(operacao(null), "rede");
  assert.equal(siloConsolidationOperationForRetry(congelada, { territoryRef, workingCopyExpectedLock: 3 }), null);
  assert.equal(siloConsolidationOperationForRetry(operacao("https://wificonecta.com.br/roteadores"), { territoryRef, workingCopyExpectedLock: 4 }), null, "outro lock é outra operação");
  assert.equal(siloConsolidationOperationForRetry({ ...operacao("https://wificonecta.com.br/roteadores"), state: "settled" }, { territoryRef, workingCopyExpectedLock: 3 }), null);
});

test("(b) o fechamento decide pelo descarte só no catch, e a retomada passa pelo filtro", () => {
  const fonte = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));
  assert.match(fonte, /let operation = siloConsolidationOperationForRetry\(pendingConsolidationRef\.current, \{/);
  assert.match(fonte, /pendingConsolidationRef\.current = siloConsolidationFailureDisposition\(error\) === "discard"\s*\n\s*\? null\s*\n\s*: markSiloConsolidationIndeterminate\(/);
});

// --------------------------------------------- (c) melhoria sem retrabalho

const sinais = (id: string, texto: string) => resolveKeywordDnaSignals({ keywordId: id, text: texto });
const kw = (id: string, keyword: string, volume: number | null, extra: Partial<ImprovementKeyword> = {}): ImprovementKeyword => ({ id, keyword, volume, volumeValidated: Boolean(volume), signals: sinais(id, keyword), ownerId: null, published: false, territoryRef: "territory:a", external: false, ...extra });
const lista = [kw("k1", "roteador wifi mesh", 880), kw("k2", "melhor roteador para casa", 1300), kw("k3", "wifi lento o que fazer", null)];
const agora = new Date("2026-10-12T18:00:00.000Z");

function anterior(extra: Partial<ImprovementReusableRun> = {}): ImprovementReusableRun {
  return { version: 1, runId: "11111111-1111-4111-8111-111111111111", brandId, createdAt: "2026-10-12T16:00:00.000Z", inputsHash: "h".repeat(64), keywords: [...lista, kw("x1", "roteador mesh tp-link", 590, { external: true })], editorialAi: { status: "answered", askedTargetIds: ["p1"], listSize: 3, picks: [], rejected: [], rejectedCount: 0 }, ...extra };
}

test("(c) a impressão digital dos insumos não depende da ordem e muda quando a lista ou o alvo muda", () => {
  const base = { version: 1, brandId, sourceHashes: { p1: "a", p2: "b" }, keywords: lista };
  const mesma = { version: 1, brandId, sourceHashes: { p2: "b", p1: "a" }, keywords: [...lista].reverse() };
  assert.deepEqual(improvementInputsFingerprint(base), improvementInputsFingerprint(mesma));
  assert.notDeepEqual(improvementInputsFingerprint(base), improvementInputsFingerprint({ ...base, keywords: [kw("k1", "roteador wifi mesh", 990), ...lista.slice(1)] }));
  assert.notDeepEqual(improvementInputsFingerprint(base), improvementInputsFingerprint({ ...base, sourceHashes: { p1: "a", p2: "c" } }));
  assert.notDeepEqual(improvementInputsFingerprint(base), improvementInputsFingerprint({ ...base, sourceHashes: { p1: "a" } }), "outro recorte de alvos é outra preparação");
});

test("(c) mesmos insumos: a semente traz a leitura da IA, as medições e a busca anteriores (zero chamada nova)", () => {
  const seed = improvementReuseSeed(anterior(), { version: 1, brandId, inputsHash: "h".repeat(64), now: agora });
  assert.ok(seed);
  assert.equal(seed.fromRunId, "11111111-1111-4111-8111-111111111111");
  assert.equal(seed.editorialAi?.status, "answered");
  assert.equal(seed.keywords.filter(k => k.external).length, 1, "a keyword da busca anterior volta, sem buscar de novo");
  assert.match(seed.notice, /reaproveitei a leitura da IA, as medições de volume, 1 keyword\(s\) da busca no Google Ads, sem chamada nova de IA nem de Google Ads/);
  // Cópia, não referência: a execução nova não altera a anterior.
  seed.keywords[0].volume = 1;
  assert.equal(anterior().keywords[0].volume, 880);
});

test("(c) insumo diferente, outra marca, outra versão ou fora da janela não reaproveitam", () => {
  const esperado = { version: 1, brandId, inputsHash: "h".repeat(64), now: agora };
  assert.equal(improvementReuseSeed(anterior({ inputsHash: "g".repeat(64) }), esperado), null);
  assert.equal(improvementReuseSeed(anterior({ inputsHash: undefined }), esperado), null, "execução de antes desta versão não tem impressão");
  assert.equal(improvementReuseSeed(anterior({ brandId: "61d2e019-f44f-4fa3-af2f-d86b95628ab3" }), esperado), null);
  assert.equal(improvementReuseSeed(anterior({ version: 2 }), esperado), null);
  assert.equal(improvementReuseSeed(anterior({ createdAt: new Date(agora.getTime() - IMPROVEMENT_REUSE_WINDOW_MS - 1).toISOString() }), esperado), null);
  assert.equal(improvementReuseSeed(null, esperado), null);
});

test("(c) leitura da IA que falhou não é semente; o resto é", () => {
  const seed = improvementReuseSeed(anterior({ editorialAi: { status: "failed", askedTargetIds: ["p1"], listSize: 3, picks: [], rejected: [], rejectedCount: 0, message: "A IA excedeu o tempo limite." } }), { version: 1, brandId, inputsHash: "h".repeat(64), now: agora });
  assert.ok(seed);
  assert.equal(seed.editorialAi, null);
  assert.match(seed.notice, /tinha falhado e foi tentada de novo/);
});

test("(c) a busca nova só existe sob pedido: o pedido aceita `discover`, o prepare só busca com ele", () => {
  assert.equal(ArticleImprovementRequestSchema.parse({ brandId, action: "prepare" }).discover, undefined);
  assert.equal(ArticleImprovementRequestSchema.parse({ brandId, action: "prepare", discover: true }).discover, true);
  assert.equal(ArticleImprovementRequestSchema.safeParse({ brandId, action: "prepare", discover: "sim" }).success, false);
  const servidor = semComentarios(readFileSync("lib/server/arquiteto-article-improvement.ts", "utf8"));
  const chamadas = [...servidor.matchAll(/await discover\(/g)];
  assert.equal(chamadas.length, 1, "uma única chamada da busca");
  assert.match(servidor, /if \(gaps\.length && request\.discover === true\) try \{ run\.keywords = await discover\(runtime, run, gaps,/);
});

test("(c) o custo da busca nova é dito antes do clique, na tela", () => {
  assert.equal(improvementDiscoveryMaxRequests(3), 6);
  assert.equal(improvementDiscoveryMaxRequests(100), 40);
  assert.equal(improvementDiscoveryMaxRequests(0), 0);
  const frase = improvementDiscoveryCostSentence(3);
  assert.match(frase, /até 6 chamada\(s\)/);
  assert.match(frase, /Grátis \(cota do Google Ads\): cada chamada conta 1 unidade na cota de Descoberta da marca e fica no registro de uso/);
  const painel = semComentarios(readFileSync("modules/arquiteto/article-improvement-panel.tsx", "utf8"));
  assert.match(painel, /onClick=\{\(\) => setConfirm\("discover"\)\}>Buscar keywords novas no Google Ads \(\{discoveryGaps\}\) · \{GOOGLE_ADS_FREE_LABEL\}<\/button>/);
  assert.match(painel, /\{improvementDiscoveryCostSentence\(discoveryGaps\)\}/);
  // 2026-10-13 · a busca nova mantém o recorte (cor) da execução que ela completa.
  assert.match(painel, /confirm === "discover" \? execute\("prepare", \{ \.\.\.recorteDaExecucao, discover: true \}\)/);
  assert.match(painel, /\.\.\.\(action === "prepare" && options\.discover \? \{ discover: true \} : \{\}\)/);
});

test("(c) registro de uso: a IA e a busca vão para integration_usage_events pelo caminho de sempre", () => {
  assert.equal(improvementAiUsageKey("openrouter", "run-1", "succeeded"), "openrouter:article_improvement_ai:run-1");
  assert.equal(improvementAiUsageKey("openrouter", "run-1", "failed"), "openrouter:article_improvement_ai:run-1:failed");
  const servidor = semComentarios(readFileSync("lib/server/arquiteto-article-improvement.ts", "utf8"));
  assert.match(servidor, /recordUsage: event => recordImprovementUsageEvent\(context, event\)/);
  assert.match(servidor, /await recordIntegrationUsageForResource\(\{\s*\n\s*resource: provider\.resource, operation: "module_operation", module: "arquiteto"/);
  assert.match(servidor, /await recordGoogleAdsDiscoveryUsage\(\{/);
  assert.match(servidor, /usageKeySuffix: event\.suffix, module: "arquiteto", dependencies/);
  assert.match(servidor, /kind: "editorial_ai", runId: run\.runId, resultStatus: "succeeded"/);
  assert.match(servidor, /kind: "editorial_ai", runId: run\.runId, resultStatus: "failed"/);
  assert.match(servidor, /kind: "google_ads_discovery", runId: run\.runId, resultStatus: "succeeded"/);
  assert.match(servidor, /kind: "google_ads_discovery", runId: run\.runId, resultStatus: "failed"/);
});
