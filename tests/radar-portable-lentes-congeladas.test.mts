import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { serpCacheObservationFromBody } from "../lib/server/serp-cache-observation.ts";
import { SERP_CACHE_LENSES, serpCacheLensLabel, type SerpCacheLens } from "../lib/editorial/serp-cache.ts";
import { SerpCollectionRecordSchema, type SerpCollectionRecord } from "../lib/editorial/contracts.ts";
import { buildRadarSerpLensSet, radarSerpMissingLens, radarSerpObservedLens } from "../lib/radar/serp/lens-set.ts";
import { buildRadarFrozenSerpLensBlock, radarFrozenSerpLensesFromLensSet } from "../lib/radar/serp/frozen-lenses.ts";
import { buildRadarEvidenceBundleFromAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import type { RadarEvidenceBundle } from "../lib/radar/evidence-bundle.ts";
import type { RadarPlannerHandoffReadiness } from "../lib/radar/planner-handoff.ts";
import type { SerpResearchSnapshot, SerpSearchInput } from "../lib/radar/serp/contracts.ts";
import {
  RADAR_PORTABLE_FROZEN_LENSES_SINCE,
  radarPortableFrozenLensesState,
  radarPortableNewerSerpCollection,
  radarPortableSerpLenses,
  radarPortableSerpLensesColumns,
  radarPortableSerpLensesMarkdown,
  radarPortableSerpObservedColumns,
  type RadarPortableFrozenLensesInput,
  type RadarPortableSerpLensLookup,
} from "../lib/radar/portable-serp-observed.ts";
import {
  radarPortableExportDossierGapsInput,
  radarPortableExportFrozenLensesInput,
  radarPortableExportResearchLimitations,
  radarPortableExportRows,
  radarPortableExportSerpObservedInput,
} from "../lib/radar/portable-export-batch.ts";
import {
  RADAR_PORTABLE_DOSSIER_V3_COVERAGE,
  RADAR_PORTABLE_NOT_EXPORTED,
  radarPortableDossierGapColumns,
} from "../lib/radar/portable-dossier-gaps.ts";
import {
  radarLimitationsMarkdown,
  radarPortableActionableLimitations,
  type RadarPortableExportInput,
} from "../lib/radar/portable-export.ts";
import { RADAR_FROZEN_LENSES_SINCE, radarFrozenLensView } from "../modules/radar/radar-serp-lens-view.ts";
import { RADAR_SERP_NO_ORGANIC_REASON } from "../lib/radar/serp/lens-set.ts";

/*
 * ===== O EXPORT LÊ AS LENTES DO PACOTE, E O CACHE SÓ DEPOIS =====
 *
 * Desde o adendo R3 o FINALIZE copia as quatro lentes para o bundle
 * congelado, e o dossiê V3 as entrega ao Redator em `serpLenses`. O export
 * lia as lentes só do CACHE — o que o cache sabe no momento do clique, não o
 * que o pacote congelou. Esta suíte prova, sobre a coleta real do
 * repositório passada pelo mesmo cálculo de observação do cache:
 *
 *   - a coluna abre pela CÓPIA congelada, a mesma do dossiê (invariante 30);
 *   - o cache vem depois, rotulado como o leitor do Redator o rotula:
 *     observação fora do pacote, posterior ou não ao congelamento;
 *   - pacote sem a cópia diz por quê (legado, sem SERP conferida, perfil);
 *   - nada do motivo cru da coleta, id ou assinatura atravessa;
 *   - a coleta posterior diz a data da VERSÃO e a da SERP (adendo R2, §10);
 *   - toda chave do dossiê V3 tem destino no CSV.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================== a bancada real ============================== */

const CORPO = JSON.parse(await readFile(new URL("./fixtures/dataforseo-google-skincare-facial-advanced-desktop-windows.json", import.meta.url), "utf8")) as Record<string, unknown>;
const ID_DA_TAREFA = String((CORPO.tasks as Array<{ id: string }>)[0].id);

const MARCA = "5d1f6c2a-8b3e-4c7a-9f10-2b6e8d4a1c33";
const ARTIGO = "a7e2c1d4-3b5f-4e6a-8c9d-0f1e2a3b4c5d";
const DNA_DO_ARTIGO = "c3b2a1f0-9e8d-4c7b-a6f5-e4d3c2b1a0f9";
const KEYWORD = "e1d2c3b4-a5f6-4e7d-8c9b-0a1f2e3d4c5b";
const KEYWORD_SECUNDARIA = "b9a8f7e6-d5c4-4b3a-8f2e-1d0c9b8a7f6e";
const KEYWORD_SEM_TEXTO = "9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f";
const CONSULTA_SEM_TEXTO = "q:reforco-sem-texto";

const OBSERVADA_EM = "2026-09-20T08:00:00.000Z";
const PAGA_EM = "2026-09-21T10:00:00.000Z";
const CONGELADO_EM = "2026-09-23T15:00:00.000Z";
const ANTES_DAS_LENTES = "2026-09-10T13:00:00.000Z";
const EXPORTADO_EM = "2026-09-25T12:00:00.000Z";

const [WINDOWS, MACOS, ANDROID, IOS] = SERP_CACHE_LENSES;

const busca = (keyword: string, keywordId = KEYWORD): SerpSearchInput => ({
  brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA_DO_ARTIGO,
  keywordId, keywordDnaVersionId: "kdna-1", keyword,
  location: "2076", language: "pt", device: "desktop", operatingSystem: "windows",
  expectedIntent: "informacional", expectedFormat: "Suporte",
  requiredTopics: ["limpeza"], articleEntities: ["sérum"],
  resultLimit: 10, version: 3, previousSnapshotId: null,
});

/** A lente celular: a mesma coleta sem os três primeiros orgânicos e sem o AI Overview. */
function corpoCelular(corpo: Record<string, unknown>) {
  const copia = structuredClone(corpo) as { tasks: Array<{ result: Array<{ items: Array<{ type: string }>; item_types: string[] }> }> };
  const resultado = copia.tasks[0].result[0];
  let retirados = 0;
  resultado.items = resultado.items.filter(item => {
    if (item.type === "ai_overview") return false;
    if (item.type === "organic" && retirados < 3) { retirados += 1; return false; }
    return true;
  });
  resultado.item_types = resultado.item_types.filter(tipo => tipo !== "ai_overview");
  return copia;
}

const observacao = (corpo: unknown, lens: SerpCacheLens, keyword = "skincare facial", collectedAt = OBSERVADA_EM) =>
  serpCacheObservationFromBody(corpo, { keyword, locationCode: 2076, languageCode: "pt", lens, collectedAt });

const RECUSA_DO_FORNECEDOR = "A resposta do provider não é uma SERP. (provider 40501: Invalid Field: 'os'.)";
const FALHA_DE_REDE = "DataForSEO respondeu HTTP 500 (timeout) na lente macOS.";

/** As quatro lentes da canônica: Windows do cache, macOS com falha de rede, Android paga pelo Radar, iOS recusada. */
const LENTES_DA_CANONICA = buildRadarSerpLensSet([
  radarSerpObservedLens({ lens: WINDOWS, source: "cache", meta: { collectedBy: "minerador", collectedAt: OBSERVADA_EM, depth: 20, providerRequestId: ID_DA_TAREFA }, observation: observacao(CORPO, WINDOWS) }),
  radarSerpMissingLens(MACOS, FALHA_DE_REDE, { kind: "request_failed" }),
  radarSerpObservedLens({ lens: ANDROID, source: "paid", meta: { collectedBy: "radar", collectedAt: PAGA_EM, depth: 10, providerRequestId: `${ID_DA_TAREFA}-android` }, observation: observacao(corpoCelular(CORPO), ANDROID, "skincare facial", PAGA_EM) }),
  radarSerpMissingLens(IOS, RECUSA_DO_FORNECEDOR, { kind: "provider_refused" }),
]);

const PESQUISA: SerpResearchSnapshot = {
  ...normalizeDataForSeoSerpResponse(CORPO, busca("skincare facial"), { locationCode: 2076, languageCode: "pt" }, OBSERVADA_EM, ID_DA_TAREFA),
  payloadDepth: "advanced",
  providerDepth: 20,
  lensSet: LENTES_DA_CANONICA,
  cacheProvenance: { source: "cache", collectedBy: "minerador", providerRequestId: ID_DA_TAREFA, cacheCollectedAt: OBSERVADA_EM, snapshotOpenedAt: "2026-09-22T10:00:00.000Z" },
};

const registro = (research: SerpResearchSnapshot, id: string): SerpCollectionRecord => SerpCollectionRecordSchema.parse({
  id, input: { keyword: research.query, articleId: ARTIGO, location: research.location, language: research.language, device: research.device },
  status: "collected", provider: "dataforseo", origin: "real", isMock: false, snapshot: null, cost: null, error: null,
  dnaIntent: null, conflictReason: null, humanDecisionRequired: false, research,
});

const REGISTRO_V3 = registro(PESQUISA, "registro-serp-v3");

/*
 * A VERSÃO 4, ABERTA DEPOIS DO CONGELAMENTO, COM SERP OBSERVADA ANTES.
 *
 * É o caso do adendo R2 §10: com cache, uma versão nova pode trazer a SERP
 * que o Google mostrou num dia anterior ao da versão que a investigação leu.
 */
const REGISTRO_V4 = registro({
  ...PESQUISA,
  id: `${PESQUISA.id}-v4`,
  version: 4,
  collectedAt: "2026-09-19T08:00:00.000Z",
  cacheProvenance: { ...PESQUISA.cacheProvenance!, snapshotOpenedAt: "2026-09-24T10:00:00.000Z" },
}, "registro-serp-v4");

const LENTES_DA_AUXILIAR = buildRadarSerpLensSet([
  radarSerpObservedLens({ lens: WINDOWS, source: "cache", meta: { collectedBy: "arquiteto", collectedAt: OBSERVADA_EM, depth: 10, providerRequestId: "aux-w" }, observation: observacao(CORPO, WINDOWS, "skin care noturno") }),
  radarSerpObservedLens({ lens: MACOS, source: "cache", meta: { collectedBy: "arquiteto", collectedAt: OBSERVADA_EM, depth: 10, providerRequestId: "aux-m" }, observation: observacao(CORPO, MACOS, "skin care noturno") }),
  radarSerpObservedLens({ lens: ANDROID, source: "cache", meta: { collectedBy: "arquiteto", collectedAt: OBSERVADA_EM, depth: 10, providerRequestId: "aux-a" }, observation: observacao(CORPO, ANDROID, "skin care noturno") }),
  radarSerpMissingLens(IOS, RECUSA_DO_FORNECEDOR, { kind: "provider_refused" }),
]);

const LENTES_DO_REFORCO = buildRadarSerpLensSet([
  radarSerpObservedLens({ lens: WINDOWS, source: "cache", meta: { collectedBy: "minerador", collectedAt: OBSERVADA_EM, depth: 20, providerRequestId: "ref-w" }, observation: observacao(CORPO, WINDOWS, "rotina facial") }),
  radarSerpMissingLens(MACOS, FALHA_DE_REDE, { kind: "request_failed" }),
  radarSerpMissingLens(ANDROID, "Lente não observada.", { kind: "not_observed" }),
  radarSerpMissingLens(IOS, RECUSA_DO_FORNECEDOR, { kind: "provider_refused" }),
]);

/** O bloco que o FINALIZE grava — pela função real de R3, com o id do REGISTRO, como o FINALIZE grava. */
const BLOCO = buildRadarFrozenSerpLensBlock({
  canonical: { snapshotId: REGISTRO_V3.id, snapshotHash: PESQUISA.contentHash, lensSet: LENTES_DA_CANONICA },
  auxiliary: [
    { queryId: "q:secundaria", keywordId: KEYWORD_SECUNDARIA, keyword: "skin care noturno", snapshotHash: "aux-hash-1", lenses: radarFrozenSerpLensesFromLensSet(LENTES_DA_AUXILIAR) },
    { queryId: CONSULTA_SEM_TEXTO, keywordId: KEYWORD_SEM_TEXTO, keyword: null, snapshotHash: "aux-hash-2", lenses: radarFrozenSerpLensesFromLensSet(LENTES_DO_REFORCO) },
  ],
  singleLensAuxiliary: 1,
})!;

const FUNDAMENTO = { brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA_DO_ARTIGO, articleDnaContentHash: "sha256:dna-do-artigo" };

const analiseDoGoogle = (finalizedBundle: Record<string, unknown>) => ({
  finalizedBundle,
  serpSnapshotId: PESQUISA.id,
  serpSnapshotHash: PESQUISA.contentHash,
  serpDecisions: [],
  deepResearch: null,
});

const LIMITACAO_DA_CAMADA = "A amostra  comparável tem só oito páginas.";

/* O standing que o mesmo FINALIZE carimba (adendo R1): aqui, SERP rejeitada na revisão. */
const STANDING = {
  authoritative: false, current: true, sufficient: true, valid: false,
  reason: "A revisão humana rejeitou esta SERP: ela não tem precedência sobre o terreno competitivo.",
  basis: { snapshotId: PESQUISA.id, snapshotHash: PESQUISA.contentHash, reviewStatus: "rejected", sufficiencyLevel: "SUFFICIENT", invalidReasons: ["SNAPSHOT_REJECTED"] },
};
const ANALISE = analiseDoGoogle({ frozenAt: CONGELADO_EM, limitations: [LIMITACAO_DA_CAMADA], search: { lenses: BLOCO }, serpStanding: STANDING });
const ANALISE_LEGADA = analiseDoGoogle({ frozenAt: ANTES_DAS_LENTES, limitations: [LIMITACAO_DA_CAMADA] });
const ANALISE_SEM_COPIA = analiseDoGoogle({ frozenAt: CONGELADO_EM, limitations: [LIMITACAO_DA_CAMADA] });

/** O dossiê V3 que o Redator recebe, montado pelo builder real. */
function dossie(payload: unknown): RadarEvidenceBundle {
  const resultado = buildRadarEvidenceBundleFromAnalysis({
    payload,
    article: FUNDAMENTO,
    competitiveBlueprint: null,
    keywordContext: { principal: "skincare facial", secondary: ["skin care noturno"], narrativeReinforcements: [], resolution: "ARTICLE_DNA_HYDRATION" },
    observedAt: CONGELADO_EM,
  });
  assert.ok(resultado.ok, "a bancada precisa montar um dossiê V3 real");
  return resultado.bundle;
}

const DOSSIE = dossie(ANALISE);
const DOSSIE_LEGADO = dossie(ANALISE_LEGADA);
const DOSSIE_SEM_COPIA = dossie(ANALISE_SEM_COPIA);

function dossieDoYoutube(): RadarEvidenceBundle {
  const resultado = buildRadarEvidenceBundleFromAnalysis({
    payload: {
      youtubeFrozenInvestigation: {
        frozenVersion: 1, finalizedAt: "2026-09-24T10:00:00.000Z", finalizedBy: MARCA,
        runRef: { runId: `run:${ARTIGO}`, runVersion: 1, runFingerprint: "f", collectedAt: "2026-09-24T09:00:00.000Z", queriesExecuted: 3, universeSize: 38, selectedVideoIds: ["v1"] },
        run: null, multimodal: null, limitations: ["O gancho interno dos vídeos não foi observado."],
      },
    },
    article: FUNDAMENTO, competitiveBlueprint: null, observedAt: "2026-09-24T10:00:00.000Z",
  });
  assert.ok(resultado.ok);
  return resultado.bundle;
}

/* ============================== o cache da marca ============================== */

const KEYWORDS = [
  { keyword: "skincare facial", role: "principal" as const, keywordId: KEYWORD },
  { keyword: "skin care noturno", role: "secundaria" as const, keywordId: KEYWORD_SECUNDARIA },
];

const acerto = (keyword: string, lens: SerpCacheLens, collectedAt: string, corpo: unknown = CORPO, extra: string[] = []): RadarPortableSerpLensLookup => {
  const obs = observacao(corpo, lens, keyword, new Date(collectedAt).toISOString());
  return {
    request: { query: { keyword, lens } },
    hit: { meta: { collectedAt }, observation: { ...obs, competitorDomains: [...extra, ...obs.competitorDomains] } },
    missReason: null,
  };
};
const falta = (keyword: string, lens: SerpCacheLens, motivo = "sem entrada"): RadarPortableSerpLensLookup => ({ request: { query: { keyword, lens } }, hit: null, missReason: motivo });

/*
 * O CACHE NO MOMENTO DO EXPORT, lente a lente da principal:
 *   Windows  a MESMA coleta que o pacote congelou (mesma data, +00:00);
 *   macOS    gravada no instante exato do congelamento — não é posterior;
 *   Android  recoletada DEPOIS do congelamento, com um domínio que o pacote não viu;
 *   iOS      sem entrada.
 */
const CACHE_NO_EXPORT: RadarPortableSerpLensLookup[] = [
  acerto("skincare facial", WINDOWS, "2026-09-20T08:00:00+00:00"),
  acerto("skincare facial", MACOS, CONGELADO_EM),
  acerto("skincare facial", ANDROID, "2026-09-24T09:00:00.000Z", corpoCelular(CORPO), ["so-no-cache.com.br"]),
  falta("skincare facial", IOS),
  acerto("skin care noturno", WINDOWS, "2026-09-22T08:00:00.000Z"),
  falta("skin care noturno", MACOS),
  falta("skin care noturno", ANDROID, "validade vencida"),
  falta("skin care noturno", IOS),
];

const LENTES_DO_PACOTE = radarPortableExportFrozenLensesInput({
  profile: "GOOGLE", bundle: DOSSIE, analysis: ANALISE, records: [REGISTRO_V3, REGISTRO_V4],
});

const colunas = (frozen: RadarPortableFrozenLensesInput | undefined, lookups = CACHE_NO_EXPORT, readFailed = false) =>
  radarPortableSerpLensesColumns({ keywords: KEYWORDS, lookups, readFailed, ...(frozen ? { frozen } : {}) });

/* ============================== a higiene ============================== */

const SEGREDOS = [
  MARCA, ARTIGO, DNA_DO_ARTIGO, KEYWORD, KEYWORD_SECUNDARIA, KEYWORD_SEM_TEXTO, CONSULTA_SEM_TEXTO, ID_DA_TAREFA,
  PESQUISA.id, PESQUISA.contentHash, BLOCO.lensSetHash!, "aux-hash-1", "aux-hash-2", "q:secundaria",
];
const PROIBIDOS = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i,
  /sha256:/i,
  /dataforseo/i,
  /\bprovider/i,
  /40501/,
  /Invalid Field/,
  /HTTP 500/,
  /\blenses:[0-9a-f]{8}\b/,
  /serpSnapshotId|snapshotId|contentHash|providerRequestId|keywordId|queryId|lensSetHash|snapshotHash/,
];
function assertHigiene(texto: string, onde: string) {
  for (const segredo of SEGREDOS) assert.equal(texto.includes(segredo), false, `${onde}: vazou ${segredo}`);
  for (const padrao of PROIBIDOS) {
    const achado = texto.match(padrao);
    assert.equal(achado, null, `${onde}: ${padrao} casou com "${achado?.[0]}"`);
  }
}

const trecho = (md: string, de: string, ate?: string) => md.slice(md.indexOf(de), ate ? md.indexOf(ate) : undefined);

/* ============================== 1 · a cópia primeiro ============================== */

test("1 · a coluna abre pela CÓPIA congelada — a mesma que o dossiê entrega ao Redator — e o cache vem depois", () => {
  assert.deepEqual(DOSSIE.serpLenses, BLOCO, "a bancada: o dossiê V3 precisa carregar o bloco congelado");
  assert.equal(LENTES_DO_PACOTE.block, DOSSIE.serpLenses, "a coluna lê o bloco do DOSSIÊ, não uma segunda leitura");
  assert.equal(LENTES_DO_PACOTE.frozenAt, CONGELADO_EM);
  assert.equal(LENTES_DO_PACOTE.canonicalQuery, "skincare facial");
  assert.equal(LENTES_DO_PACOTE.sameSerpAsObserved, true);

  const { serp_lenses_md: md, serp_lenses_json: json } = colunas(LENTES_DO_PACOTE);
  const lentes = JSON.parse(json);
  const pacote = lentes.frozenPackage;
  assert.equal(pacote.state, "frozen");
  assert.ok(json.indexOf("\"frozenPackage\"") < json.indexOf("\"keywords\""), "no JSON, o pacote precisa vir antes do cache");
  assert.match(pacote.statement, /^Congeladas no pacote: 2 de 4 na SERP canônica \(faltou desktop · macOS, celular · iOS\), e 2 pesquisa\(s\) auxiliar\(es\) com as lentes contadas\. É a fonte de verdade do pacote/);

  /* As quatro lentes, na ordem, com a proveniência do congelamento — nunca a do cache. */
  const canonica = pacote.canonical;
  assert.equal(canonica.query, "skincare facial");
  assert.equal(canonica.sameSerpAsObserved, true);
  assert.equal(canonica.observedLenses, 2);
  assert.equal(canonica.totalLenses, 4);
  assert.equal(canonica.datesSpreadDays, BLOCO.datesSpreadDays);
  assert.deepEqual(canonica.readings.map((item: { lens: string }) => item.lens), SERP_CACHE_LENSES.map(serpCacheLensLabel));
  const [windows, macos, android, ios] = canonica.readings;
  assert.equal(windows.origin, "Cache · pago pelo Minerador");
  assert.equal(windows.collectedAt, OBSERVADA_EM);
  assert.deepEqual(windows.competitorDomains, [...new Set(BLOCO.lenses[0].competitorDomains)].slice(0, 10));
  assert.deepEqual(windows.aiOverviewDomains, [...new Set(BLOCO.lenses[0].aiOverviewDomains)].slice(0, 10));
  assert.equal(windows.organicCount, BLOCO.lenses[0].organicCount);
  assert.ok(windows.blocks.includes("Pessoas também perguntam"), "os blocos saem em português");
  assert.equal(android.origin, "Pago na coleta da investigação · Radar");
  assert.equal(android.collectedAt, PAGA_EM);
  assert.equal(android.competitorDomains.includes("so-no-cache.com.br"), false, "o domínio que só o cache viu entrou na cópia congelada");

  /* A falta é dita — e dita sem o texto cru da coleta. */
  assert.equal(macos.observed, false);
  assert.equal(macos.missing, "a coleta desta lente falhou; o detalhe técnico da falha não é exportado");
  assert.equal(ios.missing, "o serviço de coleta recusou esta lente para esta consulta e este local");

  /* As auxiliares do pacote: contagem e lentes faltantes, a sem texto pelo nome neutro. */
  assert.deepEqual(pacote.auxiliary, [
    { keyword: "skin care noturno", observedLenses: 3, totalLenses: 4, missingLenses: ["celular · iOS"] },
    { keyword: null, observedLenses: 1, totalLenses: 4, missingLenses: ["desktop · macOS", "celular · Android", "celular · iOS"] },
  ]);
  assert.match(pacote.notCopied, /Buscas relacionadas, títulos e trechos não são copiados por lente/);

  /* As limitações do congelamento: as mesmas frases, portáteis. */
  assert.ok(pacote.limitations.some((item: string) => item === "Celular · iOS não foi observada na SERP canônica congelada: o serviço de coleta recusou esta lente para esta consulta e este local."));
  assert.ok(pacote.limitations.some((item: string) => /^Só em Desktop · Windows: .*É registro de divergência entre aparelhos, não reforço de conclusão/.test(item)));
  assert.ok(pacote.limitations.some((item: string) => item.startsWith("Na pesquisa auxiliar \"consulta auxiliar sem texto registrado\", ")));
  assert.ok(pacote.limitations.some((item: string) => /1 pesquisa\(s\) auxiliar\(es\) desta investigação são anteriores às quatro lentes/.test(item)));

  /* No Markdown, o pacote primeiro, o cache depois — com títulos distintos. */
  const pacoteMd = md.indexOf("## Pacote congelado · lentes da SERP (fonte de verdade)");
  const cacheMd = md.indexOf("## Cache da marca · observação fora do pacote");
  assert.ok(pacoteMd > 0 && cacheMd > pacoteMd, "o pacote precisa vir antes do cache no Markdown");
  assert.match(md, /^# SERP por lente\n/);
  assert.match(md, /- Consulta canônica: skincare facial \(a mesma SERP descrita em serp_observed_md\)/);
  assert.match(md, /### desktop-windows \(desktop · Windows\) — Cache · pago pelo Minerador · coletada em 2026-09-20 08:00 UTC/);
  assert.match(md, /### mobile-ios \(celular · iOS\) — faltou: o serviço de coleta recusou esta lente/);
  assert.match(md, /- "skin care noturno": 3 de 4 lentes · faltou celular · iOS/);
  assert.match(md, /- consulta auxiliar sem texto registrado: 1 de 4 lentes/);

  assertHigiene(md, "serp_lenses_md");
  assertHigiene(json, "serp_lenses_json");
});

/* ============================== 2 · o cache, rotulado ============================== */

test("2 · o cache é observação FORA do pacote, e cada lente diz se é posterior ao congelamento", () => {
  const { serp_lenses_md: md, serp_lenses_json: json } = colunas(LENTES_DO_PACOTE);
  const lentes = JSON.parse(json);
  assert.equal(lentes.source, "cache de SERP da marca");
  assert.match(lentes.note, /datada e não revisada pelo Radar\. Não faz parte do pacote congelado e não o substitui/);

  const [principal, secundaria] = lentes.keywords;
  const porLente = Object.fromEntries(principal.readings.map((item: { lens: string }) => [item.lens, item]));
  assert.deepEqual([porLente["desktop-windows"].afterPackage, porLente["desktop-windows"].sameAsFrozen], [false, true], "a mesma coleta, com +00:00");
  assert.deepEqual([porLente["desktop-macos"].afterPackage, porLente["desktop-macos"].sameAsFrozen], [false, false], "no instante do congelamento não é posterior; e o pacote não observou a macOS");
  assert.deepEqual([porLente["mobile-android"].afterPackage, porLente["mobile-android"].sameAsFrozen], [true, false]);
  assert.deepEqual([porLente["mobile-ios"].afterPackage, porLente["mobile-ios"].sameAsFrozen], [null, null], "lente sem observação não tem data para comparar");
  assert.ok(porLente["mobile-android"].competitorDomains.includes("so-no-cache.com.br"), "o cache continua dizendo o que ele sabe");

  /* A secundária não tem lente canônica congelada: só a régua do tempo. */
  const windowsDaSecundaria = secundaria.readings[0];
  assert.deepEqual([windowsDaSecundaria.afterPackage, windowsDaSecundaria.sameAsFrozen], [false, null]);

  const cache = trecho(md, "## Cache da marca · observação fora do pacote");
  assert.match(cache, /### skincare facial \(principal\)/);
  assert.match(cache, /#### desktop-windows \(desktop · Windows\) — coletada em 2026-09-20 08:00 UTC · a mesma coleta que o pacote congelou/);
  assert.match(cache, /#### desktop-macos \(desktop · macOS\) — coletada em 2026-09-23 15:00 UTC · anterior ao congelamento, mas não é a coleta que o pacote congelou/);
  assert.match(cache, /#### mobile-android \(celular · Android\) — coletada em 2026-09-24 09:00 UTC · posterior ao pacote: não o substitui\n/);
  assert.match(cache, /#### mobile-ios \(celular · iOS\) — sem observação válida no cache: nenhuma coleta desta lente no cache/);
  assert.match(cache, /#### desktop-windows \(desktop · Windows\) — coletada em 2026-09-22 08:00 UTC · anterior ao congelamento do pacote/);
  assert.equal(trecho(md, "## Pacote congelado", "## Cache da marca").includes("so-no-cache.com.br"), false, "o cache vazou para a parte do pacote");

  /* Lente que o pacote NÃO observou nunca é "a mesma coleta" — nem com a data do cache ilegível. */
  const semData = acerto("skincare facial", IOS, CONGELADO_EM);
  const ilegivel = JSON.parse(colunas(LENTES_DO_PACOTE, [{ ...semData, hit: { ...semData.hit!, meta: { collectedAt: "data ilegível" } } }]).serp_lenses_json);
  const iosIlegivel = ilegivel.keywords[0].readings[3];
  assert.equal(iosIlegivel.observed, true);
  assert.deepEqual([iosIlegivel.afterPackage, iosIlegivel.sameAsFrozen], [null, false]);
});

test("2 · pacote com lentes só nas auxiliares: a canônica é anterior às lentes, e isso é dito", () => {
  const soAuxiliares = buildRadarFrozenSerpLensBlock({
    canonical: null,
    auxiliary: [{ queryId: "q:secundaria", keywordId: KEYWORD_SECUNDARIA, keyword: "skin care noturno", snapshotHash: "aux-hash-1", lenses: radarFrozenSerpLensesFromLensSet(LENTES_DA_AUXILIAR) }],
    singleLensAuxiliary: 0,
  })!;
  const entrada: RadarPortableFrozenLensesInput = { profile: "GOOGLE", block: soAuxiliares, frozenAt: CONGELADO_EM, canonicalQuery: "skincare facial" };
  assert.equal(radarPortableFrozenLensesState(entrada), "frozen");
  const { serp_lenses_md: md, serp_lenses_json: json } = colunas(entrada);
  const pacote = JSON.parse(json).frozenPackage;
  assert.equal(pacote.canonical, null);
  assert.equal(pacote.notCopied, null);
  assert.equal(pacote.statement, "Congeladas só nas pesquisas auxiliares (1): a SERP canônica que a investigação leu é anterior às quatro lentes e observou um aparelho só.");
  assert.deepEqual(pacote.auxiliary, [{ keyword: "skin care noturno", observedLenses: 3, totalLenses: 4, missingLenses: ["celular · iOS"] }]);
  assert.ok(pacote.limitations.includes("A SERP canônica congelada é anterior às quatro lentes: ela observou um aparelho só."));
  assert.equal(/- Consulta canônica:/.test(md), false, "consulta canônica sem lente congelada");
  /* Sem canônica congelada, nenhuma lente do cache é "a mesma coleta" do pacote. */
  const leituras = JSON.parse(json).keywords.flatMap((item: { readings: Array<{ sameAsFrozen: boolean | null }> }) => item.readings);
  assert.ok(leituras.every((item: { sameAsFrozen: boolean | null }) => item.sameAsFrozen === null));
  assertHigiene(md, "só auxiliares · md");
  assertHigiene(json, "só auxiliares · json");
});

test("2 · mudança só aditiva: com o pacote, cada leitura do cache é a de antes mais a relação com o pacote", () => {
  const antes = JSON.parse(colunas(undefined).serp_lenses_json);
  const depois = JSON.parse(colunas(LENTES_DO_PACOTE).serp_lenses_json);
  assert.equal("frozenPackage" in antes, false);
  assert.equal(JSON.stringify(antes).includes("afterPackage"), false, "sem o pacote a coluna ganhou campo");
  assert.deepEqual(Object.keys(depois).filter(chave => chave !== "frozenPackage"), Object.keys(antes));
  for (const chave of ["source", "lenses", "omittedKeywords", "limitations", "cellLimitNotice", "usage"]) assert.deepEqual(depois[chave], antes[chave], chave);
  depois.keywords.forEach((keyword: { readings: Array<Record<string, unknown>>; divergence: unknown }, k: number) => {
    assert.deepEqual(keyword.divergence, antes.keywords[k].divergence);
    keyword.readings.forEach((leitura, l) => {
      const { afterPackage, sameAsFrozen, ...resto } = leitura;
      assert.deepEqual(resto, antes.keywords[k].readings[l], "a leitura do cache mudou além da relação com o pacote");
      assert.ok(afterPackage === null || typeof afterPackage === "boolean");
      assert.ok(sameAsFrozen === null || typeof sameAsFrozen === "boolean");
    });
  });
  assert.match(colunas(undefined).serp_lenses_md, /^# SERP por lente \(cache da marca\)\n/);
});

test("2 · invariante 30: regravar, vencer ou perder o cache não muda uma vírgula da parte do pacote", () => {
  const referencia = colunas(LENTES_DO_PACOTE);
  const outroCache = SERP_CACHE_LENSES.map(lens => acerto("skincare facial", lens, "2026-09-26T08:00:00.000Z", corpoCelular(CORPO), ["regravado.com.br"]));
  for (const [nome, variante] of [
    ["regravado", colunas(LENTES_DO_PACOTE, outroCache)],
    ["vazio", colunas(LENTES_DO_PACOTE, [])],
    ["leitura falhou", colunas(LENTES_DO_PACOTE, [], true)],
  ] as const) {
    assert.deepEqual(JSON.parse(variante.serp_lenses_json).frozenPackage, JSON.parse(referencia.serp_lenses_json).frozenPackage, `${nome}: o pacote mudou com o cache`);
    assert.equal(trecho(variante.serp_lenses_md, "## Pacote congelado", "## Cache da marca"), trecho(referencia.serp_lenses_md, "## Pacote congelado", "## Cache da marca"), nome);
  }
  assert.match(colunas(LENTES_DO_PACOTE, [], true).serp_lenses_md, /a leitura do cache falhou nesta exportação/);
});

/* ============================== 3 · a ausência dita ============================== */

test("3 · pacote sem a cópia diz por quê: anterior às lentes, sem SERP conferida, ou perfil que não congela lentes", () => {
  const legado = radarPortableExportFrozenLensesInput({ profile: "GOOGLE", bundle: DOSSIE_LEGADO, analysis: ANALISE_LEGADA, records: [REGISTRO_V3] });
  assert.equal(DOSSIE_LEGADO.serpLenses, undefined);
  assert.equal(radarPortableFrozenLensesState(legado), "legacy");
  const pacoteLegado = JSON.parse(colunas(legado).serp_lenses_json).frozenPackage;
  assert.equal(pacoteLegado.state, "legacy");
  assert.equal(pacoteLegado.canonical, null);
  assert.deepEqual(pacoteLegado.auxiliary, []);
  assert.match(pacoteLegado.statement, new RegExp(`^Não congeladas: a investigação foi finalizada antes de ${RADAR_PORTABLE_FROZEN_LENSES_SINCE}.*Nenhuma lente pode ser atribuída a este pacote\\.$`));
  /* O cache continua lá, e agora tudo o que ele sabe é posterior ao congelamento legado. */
  const lentesDoLegado = JSON.parse(colunas(legado).serp_lenses_json);
  const cacheDoLegado = lentesDoLegado.keywords[0].readings[0];
  assert.deepEqual([cacheDoLegado.afterPackage, cacheDoLegado.sameAsFrozen], [true, null]);
  assert.match(lentesDoLegado.note, /o pacote desta investigação não tem cópia das lentes, e nada desta leitura pode ser atribuído a ele/);
  assert.equal(colunas(legado).serp_lenses_md.includes("cópia congelada"), false, "pacote legado falando de uma cópia que não existe");

  const semCopia = radarPortableExportFrozenLensesInput({ profile: "GOOGLE", bundle: DOSSIE_SEM_COPIA, analysis: ANALISE_SEM_COPIA, records: [REGISTRO_V3] });
  assert.equal(radarPortableFrozenLensesState(semCopia), "absent");
  const fraseSemCopia = JSON.parse(colunas(semCopia).serp_lenses_json).frozenPackage.statement;
  assert.equal(fraseSemCopia, "Não congeladas neste pacote: o congelamento não gravou cópia das lentes (a SERP lida não trazia as quatro lentes conferidas, ou o pacote foi finalizado antes de o congelamento passar a copiá-las). Nenhuma lente pode ser atribuída a este pacote.");
  assert.equal(/^Não congeladas neste pacote: a SERP que a investigação leu não trazia/.test(fraseSemCopia), false, "a ausência voltou a afirmar uma causa só");
  const telaSemCopia = radarFrozenLensView({ frozenAt: CONGELADO_EM })!;
  assert.equal(telaSemCopia.state, "absent");
  assert.match(telaSemCopia.label, /^Lentes não congeladas nesta investigação: o FINALIZE não gravou cópia das lentes \(a SERP lida não trazia as quatro lentes conferidas, ou a investigação foi finalizada antes de o FINALIZE copiá-las\)\.$/);

  /* Um bloco num dossiê que não é do Google não é lido: o YouTube não congela lentes. */
  const youtube = radarPortableExportFrozenLensesInput({ profile: "YOUTUBE", bundle: { ...dossieDoYoutube(), serpLenses: BLOCO }, analysis: {}, records: [REGISTRO_V3] });
  assert.equal(youtube.block, null);
  assert.equal(radarPortableFrozenLensesState(youtube), "not_applicable");
  const md = colunas(youtube).serp_lenses_md;
  assert.match(md, /Não se aplicam a este pacote: a cópia das quatro lentes da SERP existe só na investigação de páginas do Google, e este artigo foi investigado pelo perfil YouTube\./);
  assert.equal(/### desktop-windows \(desktop · Windows\) — Cache · pago/.test(md), false);

  /* O dia do corte é o mesmo da tela: as duas leituras do legado não se separam. */
  assert.equal(RADAR_PORTABLE_FROZEN_LENSES_SINCE, RADAR_FROZEN_LENSES_SINCE);

  for (const [nome, entrada] of [["legado", legado], ["sem cópia", semCopia], ["youtube", youtube]] as const) {
    const saida = colunas(entrada);
    assertHigiene(saida.serp_lenses_md, `${nome} · md`);
    assertHigiene(saida.serp_lenses_json, `${nome} · json`);
  }
});

test("3 · a SERP congelada só ganha nome quando id E assinatura batem com o bloco", () => {
  const adulterado = registro({ ...PESQUISA, contentHash: "b".repeat(64) }, "registro-serp-v3");
  const semNome = radarPortableExportFrozenLensesInput({ profile: "GOOGLE", bundle: DOSSIE, analysis: ANALISE, records: [adulterado] });
  assert.equal(semNome.canonicalQuery, null, "outro conteúdo com o mesmo id virou a SERP congelada");
  assert.equal(semNome.sameSerpAsObserved, null, "a SERP vinculada com assinatura que não confere não é comparável");
  assert.match(colunas(semNome).serp_lenses_md, /- Consulta canônica: não identificada entre as coletas gravadas da marca\n/);

  /* O FINALIZE grava o id do REGISTRO; um bloco que guardou o id da pesquisa também é reconhecido. */
  assert.equal(DOSSIE.serpLenses?.canonicalSnapshotId, REGISTRO_V3.id);
  assert.notEqual(REGISTRO_V3.id, PESQUISA.id, "a bancada precisa separar o id do registro do id da pesquisa");
  const pelaPesquisa = radarPortableExportFrozenLensesInput({
    profile: "GOOGLE", bundle: { ...DOSSIE, serpLenses: { ...BLOCO, canonicalSnapshotId: PESQUISA.id } }, analysis: ANALISE, records: [REGISTRO_V3],
  });
  assert.equal(pelaPesquisa.canonicalQuery, "skincare facial");
  assert.equal(pelaPesquisa.sameSerpAsObserved, true);
  const outroId = radarPortableExportFrozenLensesInput({
    profile: "GOOGLE", bundle: { ...DOSSIE, serpLenses: { ...BLOCO, canonicalSnapshotId: "registro-que-nao-existe" } }, analysis: ANALISE, records: [REGISTRO_V3],
  });
  assert.equal(outroId.canonicalQuery, null, "a mesma assinatura com outro id virou a SERP congelada");

  /* A SERP vinculada ao dossiê é outra coleta: dito, não escondido. */
  const outraVinculada = radarPortableExportFrozenLensesInput({
    profile: "GOOGLE",
    bundle: { ...DOSSIE, research: { ...DOSSIE.research, google: { ...DOSSIE.research.google!, refs: [{ ...DOSSIE.research.google!.refs[0], ref: "registro-serp-v4", fingerprint: null }] } } },
    analysis: ANALISE,
    records: [REGISTRO_V3, REGISTRO_V4],
  });
  assert.equal(outraVinculada.canonicalQuery, "skincare facial");
  assert.equal(outraVinculada.sameSerpAsObserved, false);
  assert.match(colunas(outraVinculada).serp_lenses_md, /\(não é a SERP descrita em serp_observed_md\)/);
});

/* ============================== 4 · a situação e as limitações ============================== */

const PRONTO: RadarPlannerHandoffReadiness = { ready: true, headline: "Pacote pronto", blocks: [] };

const situacao = (bundle: RadarEvidenceBundle, analysis: unknown, profile: "GOOGLE" | "YOUTUBE" = "GOOGLE") => radarPortableDossierGapColumns(radarPortableExportDossierGapsInput({
  analysis: analysis as { finalizedBundle?: unknown }, profile, bundle, readiness: PRONTO,
  article: { articleDnaVersionId: DNA_DO_ARTIGO, articleDnaContentHash: "sha256:dna-do-artigo" }, exportedAt: EXPORTADO_EM,
})).research_status_md;

test("4 · research_status_md diz a situação das lentes com a MESMA frase da coluna de lentes", () => {
  const google = situacao(DOSSIE, ANALISE);
  const frase = JSON.parse(colunas(LENTES_DO_PACOTE).serp_lenses_json).frozenPackage.statement;
  assert.ok(google.includes(`- Lentes da SERP: ${frase} O detalhe por lente está em serp_lenses_md.`), "a situação e a coluna de lentes discordam");
  assert.ok(google.indexOf("- Lentes da SERP:") > google.indexOf("## Situação da SERP") && google.indexOf("- Lentes da SERP:") < google.indexOf("## Sinal cruzado"));
  /* O standing congelado no mesmo FINALIZE: a conclusão gravada, e a origem dita. */
  assert.match(google, /- Tem precedência sobre o terreno competitivo: não\. A revisão humana rejeitou esta SERP/);
  assert.match(google, /- Vigente: sim · suficiente: sim · válida: não\./);
  assert.match(google, /- Origem: avaliada e gravada no congelamento da investigação\./);
  assert.match(situacao(DOSSIE_LEGADO, ANALISE_LEGADA), /- Origem: esta fotografia é anterior ao registro da situação da SERP/);

  assert.match(situacao(DOSSIE_LEGADO, ANALISE_LEGADA), /- Lentes da SERP: Não congeladas: a investigação foi finalizada antes de 2026-09-23/);
  assert.equal(/serp_lenses_md\./.test(situacao(DOSSIE_LEGADO, ANALISE_LEGADA)), false, "pacote sem lentes apontou para o detalhe");
  assert.match(situacao(dossieDoYoutube(), {}, "YOUTUBE"), /- Lentes da SERP: Não se aplicam a este pacote/);
  assertHigiene(google, "research_status_md");
});

test("4 · as limitações das lentes chegam a limitations_md portáteis; as outras passam intactas; o legado é idêntico", () => {
  const brutas = DOSSIE.limitations;
  assert.ok(brutas.some(item => item.includes("(provider 40501")), "a bancada: o dossiê carrega o motivo cru da coleta");
  const portateis = radarPortableExportResearchLimitations(DOSSIE);
  assert.equal(portateis.length, brutas.length, "limitação sumiu ou apareceu");
  assert.ok(portateis.includes(LIMITACAO_DA_CAMADA), "limitação que não é das lentes foi reescrita");
  assert.ok(portateis.includes("Desktop · macOS não foi observada na SERP canônica congelada: a coleta desta lente falhou; o detalhe técnico da falha não é exportado."));
  assert.ok(portateis.some(item => item.startsWith("Na pesquisa auxiliar \"consulta auxiliar sem texto registrado\", ")));

  const md = radarLimitationsMarkdown(radarPortableActionableLimitations(portateis));
  assert.match(md, /Celular · iOS não foi observada na SERP canônica congelada: o serviço de coleta recusou esta lente/);
  assertHigiene(md, "limitations_md");

  assert.deepEqual(radarPortableExportResearchLimitations(DOSSIE_LEGADO), DOSSIE_LEGADO.limitations);
  assert.notEqual(radarPortableExportResearchLimitations(DOSSIE_LEGADO), DOSSIE_LEGADO.limitations, "devolveu a lista do dossiê para ser mexida");
});

/* ============================== 5 · a coleta posterior (R2 §10) ============================== */

test("5 · a coleta posterior diz a data da VERSÃO e a da SERP; a coleta antiga sai como antes", () => {
  const posterior = radarPortableNewerSerpCollection([REGISTRO_V3, REGISTRO_V4], ARTIGO, REGISTRO_V3);
  assert.deepEqual(posterior, { collectedAt: "2026-09-19T08:00:00.000Z", openedAt: "2026-09-24T10:00:00.000Z" });

  const semAbertura = registro({ ...PESQUISA, id: `${PESQUISA.id}-v5`, version: 5, collectedAt: "2026-09-26T08:00:00.000Z", cacheProvenance: undefined }, "registro-serp-v5");
  assert.deepEqual(radarPortableNewerSerpCollection([REGISTRO_V3, semAbertura], ARTIGO, REGISTRO_V3), { collectedAt: "2026-09-26T08:00:00.000Z" });

  const entrada = radarPortableExportSerpObservedInput({
    records: [REGISTRO_V3, REGISTRO_V4], articleId: ARTIGO, bundle: DOSSIE, analysis: ANALISE, reviews: [], reviewsReadable: true,
  });
  const { serp_observed_md: md, serp_observed_json: json } = radarPortableSerpObservedColumns(entrada);
  assert.match(md, /> Há coleta posterior à investigação \(versão aberta em 2026-09-24 10:00 UTC; SERP observada em 2026-09-19 08:00 UTC\), não usada\./);
  const serp = JSON.parse(json);
  assert.equal(serp.newerCollectionNotUsed.openedAt, "2026-09-24T10:00:00.000Z");
  /* A ficha da SERP da investigação: observada num dia, versão aberta em outro. */
  assert.equal(serp.versionOpenedAt, "2026-09-22T10:00:00.000Z");
  assert.match(md, /- SERP observada em: 2026-09-20 08:00 UTC · versão aberta em: 2026-09-22 10:00 UTC/);
  assert.equal(/- Coleta: /.test(md), false);

  const status = radarPortableDossierGapColumns(radarPortableExportDossierGapsInput({
    analysis: ANALISE, profile: "GOOGLE", bundle: DOSSIE, readiness: PRONTO,
    article: { articleDnaVersionId: DNA_DO_ARTIGO, articleDnaContentHash: "sha256:dna" }, exportedAt: EXPORTADO_EM,
    newerSerpCollection: entrada.newerCollection,
  })).research_status_md;
  assert.match(status, /- Há coleta de SERP posterior à investigação \(versão aberta em 2026-09-24T10:00:00\.000Z; SERP observada em 2026-09-19T08:00:00\.000Z\), não usada por ela\./);

  /* Snapshot sem a data da versão: a ficha de sempre. */
  const antigo = radarPortableSerpObservedColumns({ ...entrada, snapshot: { ...PESQUISA, cacheProvenance: undefined }, newerCollection: null });
  assert.match(antigo.serp_observed_md, /- Coleta: 2026-09-20 08:00 UTC/);
  assert.equal("versionOpenedAt" in JSON.parse(antigo.serp_observed_json), false);
  assertHigiene(md, "serp_observed_md");
});

/* ============================== 6 · a linha e o dossiê V3 inteiro ============================== */

const entradaDaLinha = (extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput => ({
  profile: "GOOGLE",
  blueprintView: { blueprint: null, sample: { label: "página(s) comparável(is)", count: 0 } } as never,
  exportedAt: EXPORTADO_EM,
  article: {
    principalKeyword: "skincare facial", secondaryKeywords: ["skin care noturno"], narrativeReinforcements: [],
    intent: "Informacional", funnel: "Topo", siloName: "skincare", articleRole: "SUPORTE", slug: "skincare-facial", mustCover: [],
  },
  researchLimitations: radarPortableExportResearchLimitations(DOSSIE),
  serpObserved: radarPortableExportSerpObservedInput({ records: [REGISTRO_V3], articleId: ARTIGO, bundle: DOSSIE, analysis: ANALISE, reviews: [], reviewsReadable: true }),
  dossierGaps: radarPortableExportDossierGapsInput({
    analysis: ANALISE, profile: "GOOGLE", bundle: DOSSIE, readiness: PRONTO,
    article: { articleDnaVersionId: DNA_DO_ARTIGO, articleDnaContentHash: "sha256:dna" }, exportedAt: EXPORTADO_EM,
  }),
  ...extra,
});

test("6 · a ponte do lote leva as lentes do pacote à linha — e sem elas a coluna sai como antes", () => {
  const artigo = { articleId: ARTIGO, entrada: entradaDaLinha(), lentes: KEYWORDS };
  const leitura = { lookups: CACHE_NO_EXPORT, readFailed: false };
  const com = radarPortableExportRows({ articles: [{ ...artigo, lentesCongeladas: LENTES_DO_PACOTE }], lenses: leitura, plan: null }).get(ARTIGO)!;
  const sem = radarPortableExportRows({ articles: [artigo], lenses: leitura, plan: null }).get(ARTIGO)!;

  assert.equal(JSON.parse(com.serp_lenses_json).frozenPackage.state, "frozen");
  assert.equal("frozenPackage" in JSON.parse(sem.serp_lenses_json), false);
  assert.deepEqual(Object.keys(com), Object.keys(sem), "a linha ganhou ou perdeu coluna: a mudança é dentro das colunas existentes");
  assert.match(com.limitations_md, /Celular · iOS não foi observada na SERP canônica congelada: o serviço de coleta recusou esta lente/);
  assert.match(com.research_status_md, /- Lentes da SERP: Congeladas no pacote: 2 de 4/);
  for (const [coluna, valor] of Object.entries(com)) assertHigiene(valor, coluna);
});

test("6 · a conferência do dossiê V3: toda chave tem destino, e toda coluna citada existe na linha", () => {
  const linha = radarPortableExportRows({
    articles: [{ articleId: ARTIGO, entrada: entradaDaLinha(), lentes: KEYWORDS, lentesCongeladas: LENTES_DO_PACOTE }],
    lenses: { lookups: CACHE_NO_EXPORT, readFailed: false },
    plan: null,
  }).get(ARTIGO)!;
  const colunasDaLinha = new Set(Object.keys(linha));

  const chavesDoDossie = Object.keys(DOSSIE);
  assert.ok(chavesDoDossie.includes("serpLenses") && chavesDoDossie.includes("keywordContext") && chavesDoDossie.includes("serpStanding"), "a bancada precisa do dossiê com as chaves opcionais");
  for (const chave of chavesDoDossie) {
    assert.ok(chave in RADAR_PORTABLE_DOSSIER_V3_COVERAGE, `a chave ${chave} do dossiê V3 não tem destino no CSV`);
  }
  for (const [chave, destino] of Object.entries(RADAR_PORTABLE_DOSSIER_V3_COVERAGE)) {
    if (destino.startsWith(RADAR_PORTABLE_NOT_EXPORTED)) continue;
    const citadas = destino.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) || [];
    assert.ok(citadas.length > 0, `${chave}: o destino não cita coluna`);
    for (const coluna of citadas) assert.ok(colunasDaLinha.has(coluna), `${chave}: a coluna ${coluna} não existe na linha`);
  }
  const naoExportadas = Object.entries(RADAR_PORTABLE_DOSSIER_V3_COVERAGE).filter(([, destino]) => destino.startsWith(RADAR_PORTABLE_NOT_EXPORTED)).map(([chave]) => chave).sort();
  assert.deepEqual(naoExportadas, ["binding", "bundleHash", "bundleId", "bundleVersion"], "só a identidade técnica fica fora do CSV");
});

/* ============================== 6b · o teto da célula ============================== */

test("6 · tamanho: pacote e cache inflados cabem na célula, o corte é dito, e o pacote nunca some", () => {
  const longo = (semente: string, n: number) => Array.from({ length: n }, (_, indice) => `${semente}${indice}`).join(" ");
  const muitas = Array.from({ length: 10 }, (_, indice) => ({ keyword: `keyword inflada ${indice}`, role: "secundaria" as const }));
  const inflado: RadarPortableSerpLensLookup[] = muitas.flatMap((item, k) => SERP_CACHE_LENSES.map((lens, l) => ({
    request: { query: { keyword: item.keyword, lens } },
    hit: {
      meta: { collectedAt: "2026-09-24T08:00:00.000Z" },
      observation: {
        lens: serpCacheLensLabel(lens), depth: 10, organicCount: 10,
        competitorDomains: Array.from({ length: 30 }, (_, d) => `dominio-${k}-${l}-${d}-${longo("x", 3).replace(/ /g, "")}.com.br`),
        itemTypes: ["organic", "people_also_ask", "video"],
        questions: Array.from({ length: 30 }, (_, q) => `${longo("pergunta", 8)} ${q}?`),
        relatedSearches: Array.from({ length: 30 }, (_, r) => `${longo("busca", 6)} ${r}`),
        aiOverviewDomains: Array.from({ length: 20 }, (_, a) => `citado-${a}.com.br`),
        commercialSignals: true,
      },
    },
    missReason: null,
  })));
  const saida = radarPortableSerpLensesColumns({ keywords: muitas, lookups: inflado, frozen: LENTES_DO_PACOTE });
  assert.ok(saida.serp_lenses_md.length <= 24_000, `md com ${saida.serp_lenses_md.length}`);
  assert.ok(saida.serp_lenses_json.length <= 24_000, `json com ${saida.serp_lenses_json.length}`);
  const lentes = JSON.parse(saida.serp_lenses_json);
  assert.ok(lentes.cellLimitNotice, "a redução não foi declarada");
  assert.equal(lentes.frozenPackage.state, "frozen", "o pacote sumiu para caber o cache");
  assert.equal(lentes.frozenPackage.canonical.readings.length, 4);
  assert.match(saida.serp_lenses_md, /## Pacote congelado · lentes da SERP \(fonte de verdade\)/);

  /* O último recurso: nem reduzido coube — o esqueleto ainda diz a situação do pacote. */
  const apertado = radarPortableSerpLensesColumns({ keywords: KEYWORDS, lookups: CACHE_NO_EXPORT, frozen: LENTES_DO_PACOTE }, 1500);
  assert.ok(apertado.serp_lenses_md.length <= 1500);
  assert.match(apertado.serp_lenses_md, /Célula cortada aqui/);
  const esqueleto = JSON.parse(apertado.serp_lenses_json);
  assert.equal(esqueleto.frozenPackage.state, "frozen");
  assert.match(esqueleto.frozenPackage.statement, /^Congeladas no pacote: 2 de 4/);
  assertHigiene(apertado.serp_lenses_json, "esqueleto");
});

/* ============================== 6c · o cache cede antes do pacote ============================== */

const cacheInflado = (quantas: number) => {
  const muitas = Array.from({ length: quantas }, (_, indice) => ({ keyword: `keyword inflada ${indice}`, role: "secundaria" as const }));
  const lookups: RadarPortableSerpLensLookup[] = muitas.flatMap((item, k) => SERP_CACHE_LENSES.map((lens, l) => ({
    request: { query: { keyword: item.keyword, lens } },
    hit: {
      meta: { collectedAt: "2026-09-24T08:00:00.000Z" },
      observation: {
        lens: serpCacheLensLabel(lens), depth: 10, organicCount: 10,
        competitorDomains: Array.from({ length: 30 }, (_, d) => `dominio-${k}-${l}-${d}-xxxxxxxx.com.br`),
        itemTypes: ["organic", "people_also_ask", "video"],
        questions: Array.from({ length: 30 }, (_, q) => `${"pergunta longa ".repeat(8)}${q}?`),
        relatedSearches: Array.from({ length: 30 }, (_, r) => `${"busca longa ".repeat(6)}${r}`),
        aiOverviewDomains: Array.from({ length: 20 }, (_, a) => `citado-${a}.com.br`),
        commercialSignals: true,
      },
    },
    missReason: null,
  })));
  return { keywords: muitas, lookups };
};

test("6 · tamanho: o volume do cache nunca tira dado do pacote — o cache é cortado primeiro", () => {
  const sozinho = colunas(LENTES_DO_PACOTE);
  const pacoteSozinho = JSON.parse(sozinho.serp_lenses_json).frozenPackage;
  assert.equal(JSON.parse(sozinho.serp_lenses_json).cellLimitNotice, null, "a bancada: o pacote sozinho cabe sem corte");

  for (const quantas of [6, 10]) {
    const saida = radarPortableSerpLensesColumns({ ...cacheInflado(quantas), frozen: LENTES_DO_PACOTE });
    assert.ok(saida.serp_lenses_md.length <= 24_000 && saida.serp_lenses_json.length <= 24_000);
    const lentes = JSON.parse(saida.serp_lenses_json);
    assert.deepEqual(lentes.frozenPackage, pacoteSozinho, `${quantas} keywords: o cache tirou dado do pacote`);
    assert.equal(
      trecho(saida.serp_lenses_md, "## Pacote congelado", "## Cache da marca"),
      trecho(sozinho.serp_lenses_md, "## Pacote congelado", "## Cache da marca"),
      `${quantas} keywords: o Markdown do pacote foi cortado pelo cache`,
    );
    assert.equal(lentes.cellLimitNotice, "Listas do cache reduzidas para caber numa célula de planilha; o pacote congelado não foi reduzido. Cada corte está declarado.");
    assert.ok(lentes.keywords[0].readings[0].questions.length < 8, "o cache não foi reduzido");
  }
  const [windows, , android] = pacoteSozinho.canonical.readings;
  assert.equal(windows.competitorDomains.length, Math.min(10, new Set(BLOCO.lenses[0].competitorDomains).size));
  assert.equal(android.questions.length, Math.min(8, new Set(BLOCO.lenses[2].questions).size));
  assert.equal(pacoteSozinho.omittedLimitations, 0);
});

test("6 · tamanho: o pacote só é reduzido depois que o cache chegou ao mínimo, e o aviso diz isso", () => {
  const entrada = { ...cacheInflado(10), frozen: LENTES_DO_PACOTE };
  const minimo = radarPortableSerpLenses(entrada, 3, 3);
  const orcamento = Math.max(radarPortableSerpLensesMarkdown(minimo).length, JSON.stringify(minimo).length);
  const cacheNoMinimo = radarPortableSerpLenses(entrada, 3, 0);
  assert.ok(
    Math.max(radarPortableSerpLensesMarkdown(cacheNoMinimo).length, JSON.stringify(cacheNoMinimo).length) > orcamento,
    "a bancada: o cache no mínimo com o pacote inteiro precisa passar do orçamento",
  );
  const lentes = JSON.parse(radarPortableSerpLensesColumns(entrada, orcamento).serp_lenses_json);
  assert.equal(lentes.cellLimitNotice, "Listas do cache e do pacote congelado reduzidas para caber numa célula de planilha: o cache já estava no mínimo. Cada corte está declarado.");
  assert.deepEqual(lentes.keywords, JSON.parse(JSON.stringify(minimo.keywords)), "o pacote foi reduzido antes de o cache chegar ao mínimo");
  assert.equal(lentes.frozenPackage.state, "frozen");

  const semPacote = JSON.parse(radarPortableSerpLensesColumns(cacheInflado(10)).serp_lenses_json);
  assert.equal(semPacote.cellLimitNotice, "Listas reduzidas para caber numa célula de planilha; cada corte está declarado.", "sem o pacote o aviso de sempre mudou");
});

test("6 · último recurso: o resumo por lente do pacote fica, e as keywords do cache saem primeiro", () => {
  const longas = Array.from({ length: 10 }, (_, indice) => ({ keyword: `keyword inflada ${indice} ${"palavra ".repeat(40)}`.trim(), role: "secundaria" as const }));
  const esqueleto = (orcamento: number) => radarPortableSerpLensesColumns({ keywords: longas, lookups: [], frozen: LENTES_DO_PACOTE }, orcamento);

  const comCache = JSON.parse(esqueleto(6000).serp_lenses_json);
  const soPacote = JSON.parse(esqueleto(2500).serp_lenses_json);
  for (const [nome, json] of [["com cache", comCache], ["só o pacote", soPacote]] as const) {
    const canonica = json.frozenPackage.canonical;
    assert.equal(json.frozenPackage.state, "frozen", nome);
    assert.equal(canonica.observedLenses, 2, nome);
    assert.deepEqual(canonica.readings.map((item: { lens: string }) => item.lens), SERP_CACHE_LENSES.map(serpCacheLensLabel), nome);
    assert.deepEqual(canonica.readings.map((item: { observed: boolean }) => item.observed), [true, false, true, false], nome);
    assert.equal(canonica.readings[1].missing, "a coleta desta lente falhou; o detalhe técnico da falha não é exportado", nome);
    assert.equal(canonica.readings[2].origin, "Pago na coleta da investigação · Radar", nome);
    assert.equal(json.frozenPackage.auxiliary.length, 2, nome);
  }
  assert.equal(comCache.keywords.length, 6);
  assert.match(comCache.cellLimitNotice, /saem o resumo por lente do pacote congelado e, do cache, só as keywords/);
  assert.deepEqual(soPacote.keywords, []);
  assert.equal(soPacote.omittedKeywords, 10);
  assert.match(soPacote.cellLimitNotice, /as keywords do cache ficaram de fora/);

  /* No Markdown, o pacote inteiro fica antes do ponto de corte quando cabe. */
  const md = esqueleto(5000).serp_lenses_md;
  assert.ok(md.length <= 5000);
  assert.match(JSON.parse(esqueleto(5000).serp_lenses_json).cellLimitNotice, /nem reduzidas/, "a bancada: 5000 precisa cair no último recurso");
  const pacoteMd = trecho(radarPortableSerpLensesMarkdown(radarPortableSerpLenses({ keywords: longas, lookups: [], frozen: LENTES_DO_PACOTE }, 3, 0)), "## Pacote congelado", "\n## Cache da marca");
  assert.ok(md.includes(pacoteMd), "o Markdown cortou o pacote antes do cache");
  assert.match(md, /Célula cortada aqui/);
  for (const texto of [JSON.stringify(comCache), JSON.stringify(soPacote), md]) assertHigiene(texto, "esqueleto com pacote");
});

test("5b · rótulos e tetos do pacote: zero orgânico, limitações omitidas e cache sem data comparável", () => {
  /* (1) A lente congelada que voltou sem orgânico diz isso, em português. */
  const semOrganico = buildRadarFrozenSerpLensBlock({
    canonical: {
      snapshotId: REGISTRO_V3.id, snapshotHash: PESQUISA.contentHash,
      lensSet: buildRadarSerpLensSet([
        radarSerpObservedLens({ lens: WINDOWS, source: "cache", meta: { collectedBy: "minerador", collectedAt: OBSERVADA_EM, depth: 20, providerRequestId: ID_DA_TAREFA }, observation: observacao(CORPO, WINDOWS) }),
        radarSerpMissingLens(MACOS, RADAR_SERP_NO_ORGANIC_REASON),
        radarSerpObservedLens({ lens: ANDROID, source: "paid", meta: { collectedBy: "radar", collectedAt: PAGA_EM, depth: 10, providerRequestId: `${ID_DA_TAREFA}-android` }, observation: observacao(corpoCelular(CORPO), ANDROID, "skincare facial", PAGA_EM) }),
        radarSerpMissingLens(IOS, RECUSA_DO_FORNECEDOR, { kind: "provider_refused" }),
      ]),
    },
    auxiliary: [],
    singleLensAuxiliary: 0,
  })!;
  const vazia = colunas({ ...LENTES_DO_PACOTE, block: semOrganico });
  const macos = JSON.parse(vazia.serp_lenses_json).frozenPackage.canonical.readings[1];
  assert.equal(macos.missing, "a lente voltou sem nenhum resultado orgânico (pode ser resposta vazia transitória)");
  assert.match(vazia.serp_lenses_md, /### desktop-macos \(desktop · macOS\) — faltou: a lente voltou sem nenhum resultado orgânico \(pode ser resposta vazia transitória\)\n/);

  /* (2) Mais de 12 limitações no nível 0: o teto conta o corte e o diz. */
  const extras = Array.from({ length: 15 }, (_, indice) => `Limitação adicional número ${indice + 1} escrita no congelamento.`);
  const muitas = colunas({ ...LENTES_DO_PACOTE, block: { ...BLOCO, limitations: [...BLOCO.limitations, ...extras] } });
  const pacote = JSON.parse(muitas.serp_lenses_json).frozenPackage;
  const total = pacote.limitations.length + pacote.omittedLimitations;
  assert.equal(pacote.limitations.length, 12);
  assert.equal(total, JSON.parse(colunas(LENTES_DO_PACOTE).serp_lenses_json).frozenPackage.limitations.length + extras.length);
  assert.ok(pacote.omittedLimitations > 0);
  assert.ok(muitas.serp_lenses_md.includes(`- Mais ${pacote.omittedLimitations} limitação(ões) omitida(s) nesta célula; todas estão em limitations_md.`));

  /* (3) Pacote com congelamento de data ilegível: o cache diz que não há como comparar. */
  const semMomento = colunas({ ...LENTES_DO_PACOTE, frozenAt: "data ilegível" });
  const cache = trecho(semMomento.serp_lenses_md, "## Cache da marca · observação fora do pacote");
  assert.match(cache, /#### desktop-macos \(desktop · macOS\) — coletada em 2026-09-23 15:00 UTC · sem data para comparar com o congelamento do pacote\n/);
  assert.match(cache, /#### desktop-windows \(desktop · Windows\) — coletada em 2026-09-20 08:00 UTC · a mesma coleta que o pacote congelou\n/);
  assert.match(semMomento.serp_lenses_md, /- Congelamento do pacote: instante não registrado/);
  for (const saida of [vazia, muitas, semMomento]) {
    assertHigiene(saida.serp_lenses_md, "5b · md");
    assertHigiene(saida.serp_lenses_json, "5b · json");
  }
});

/* ============================== 7 · a rota ============================== */

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

test("7 · a rota liga a cópia do dossiê e as limitações portáteis, sem leitura nova", async () => {
  const rota = semComentarios(await readFile(new URL("../app/api/editorial/radar-export/route.ts", import.meta.url), "utf8"));
  assert.match(rota, /lentesCongeladas: radarPortableExportFrozenLensesInput\(\{ profile: perfil, bundle, analysis: payload, records: snapshots\.records \}\)/);
  assert.match(rota, /researchLimitations: radarPortableExportResearchLimitations\(bundle\)/);
  assert.equal(/researchLimitations: bundle\.limitations/.test(rota), false, "a rota voltou a mandar o motivo cru das lentes");
  assert.equal((rota.match(/lookupSerpCache\(/g) || []).length, 1, "leitura de cache a mais");
  assert.equal((rota.match(/new SerpSnapshotRepository\(\)\.list\(/g) || []).length, 1, "leitura de snapshots a mais");
  assert.equal(/radarFrozenSerpLensesOf|finalizedBundle\?*\.search/.test(rota), false, "a rota leu o bloco por fora do dossiê");

  const lote = semComentarios(await readFile(new URL("../lib/radar/portable-export-batch.ts", import.meta.url), "utf8"));
  assert.match(lote, /\.\.\.\(artigo\.lentesCongeladas \? \{ frozen: artigo\.lentesCongeladas \} : \{\}\)/);
  assert.match(lote, /block: input\.profile === "GOOGLE" \? input\.bundle\.serpLenses \?\? null : null/);
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
