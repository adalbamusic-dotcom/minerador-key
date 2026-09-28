import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SERP_CACHE_LENSES, SERP_CACHE_STAGE, SERP_CACHE_SUBJECT_TYPE, normalizeSerpCacheKeyword, serpCacheLensLabel, serpCacheSubjectId, type SerpCacheLens } from "../lib/editorial/serp-cache.ts";
import { ArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { normalizeSerpPageUrl } from "../lib/arquiteto/serp-subject-overlap.ts";
import { DIFFERENTIATION_STAGE, DIFFERENTIATION_SUBJECT_TYPE } from "../lib/arquiteto/published-differentiation.ts";
import type { DifferentiationRunPorts } from "../lib/arquiteto/published-differentiation-run.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";
import {
  DifferentiationApplyRequestSchema,
  DifferentiationPlanRequestSchema,
  DifferentiationRunRequestSchema,
  handleDifferentiationApply,
  handleDifferentiationPlan,
  handleDifferentiationRun,
  type DifferentiationHandlerDeps,
} from "../lib/server/arquiteto-differentiation.ts";

/**
 * DIFERENCIAR PUBLICADOS — o servidor (plan, run e apply), executado de verdade.
 *
 * Roda SÓ pelo script `npm run -s test:arquiteto:servidor` (`--conditions=react-server`
 * e o registro de TS de `scripts/node-ts-register.mjs`, que resolve `@/lib`):
 * com `node --test` puro o arquivo nem carrega (ERR_MODULE_NOT_FOUND). O banco é uma
 * tabela em memória com a forma do `postgrest-js` (colunas com caminho JSON,
 * filtros, trava de versão); o provider são portas falsas. Nenhuma rede,
 * nenhum crédito, nenhum banco remoto.
 */

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida no teste do servidor da diferenciação.");
}) as typeof fetch;

const MARCA = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const OUTRA_MARCA = "4a737e74-e35d-4a49-8284-87b3f964e495";
const ATOR = "11111111-1111-4111-8111-111111111111";
const K_CAPTAR = "aaaaaaaa-0000-4000-8000-000000000001";
const K_ATRAIR = "aaaaaaaa-0000-4000-8000-000000000002";
const K_OUTRO = "aaaaaaaa-0000-4000-8000-000000000003";
const K_ANUNCIOS = "aaaaaaaa-0000-4000-8000-000000000005";
const CAPTAR = "como captar clientes para clínica de estética";
const ATRAIR = "como atrair pacientes para clínica de estética";
const NOW = new Date("2026-09-27T12:00:00Z");

type Fixture = { serp: Array<{ keyword: string; lente: string; urls: string[] | null }> };
const REAL = JSON.parse(readFileSync(new URL("./fixtures/adalbapro-publicados-serp-2026-09-26.json", import.meta.url), "utf8")) as Fixture;

/* ---------------------------- banco em memória ---------------------------- */

type Linha = Record<string, unknown>;
type Filtro = { coluna: string; tipo: "eq" | "in" | "is"; valor: unknown };

function caminho(linha: Linha, expressao: string): unknown {
  const partes = expressao.split(/->>?/);
  const ultimo = expressao.lastIndexOf("->");
  const texto = ultimo >= 0 && expressao.slice(ultimo, ultimo + 3) === "->>";
  let valor: unknown = linha[partes[0]];
  for (const parte of partes.slice(1)) {
    if (valor === null || valor === undefined) return null;
    valor = Array.isArray(valor) ? valor[Number(parte)] : (valor as Linha)[parte];
  }
  if (valor === undefined) return null;
  return texto && valor !== null && typeof valor !== "string" ? JSON.stringify(valor) : valor;
}

function projetar(linha: Linha, colunas: string): Linha {
  if (colunas === "*") return structuredClone(linha);
  return Object.fromEntries(colunas.split(",").map(item => {
    const [apelido, expressao] = item.includes(":") ? item.split(":") : [item, item];
    return [apelido, structuredClone(caminho(linha, expressao))];
  }));
}

class Consulta {
  op: "select" | "insert" | "update" = "select";
  colunas = "*";
  filtros: Filtro[] = [];
  valores: Linha | null = null;
  unica = false;
  ordens: Array<{ coluna: string; asc: boolean }> = [];
  faixa: [number, number] | null = null;
  limite: number | null = null;
  readonly banco: Banco;
  readonly tabela: string;
  constructor(banco: Banco, tabela: string) { this.banco = banco; this.tabela = tabela; }
  select(colunas: string) { this.colunas = colunas; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "eq", valor }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ coluna, tipo: "in", valor }); return this; }
  is(coluna: string, valor: unknown) { this.filtros.push({ coluna, tipo: "is", valor }); return this; }
  order(coluna: string, opcoes: { ascending?: boolean } = {}) { this.ordens.push({ coluna, asc: opcoes.ascending !== false }); return this; }
  range(de: number, ate: number) { this.faixa = [de, ate]; return this; }
  limit(n: number) { this.limite = n; return this; }
  insert(valores: Linha) { this.op = "insert"; this.valores = valores; return this; }
  update(valores: Linha) { this.op = "update"; this.valores = valores; return this; }
  maybeSingle() { this.unica = true; return this; }
  single() { this.unica = true; return this; }
  then<A, B = never>(resolve: (valor: { data: unknown; error: unknown }) => A, reject?: (motivo: unknown) => B) {
    return Promise.resolve().then(() => this.banco.executar(this)).then(resolve, reject);
  }
}

class Banco {
  tabelas = new Map<string, Linha[]>();
  log: Consulta[] = [];
  private seq = 1;
  from(tabela: string) { return new Consulta(this, tabela); }
  linhas(tabela: string) { if (!this.tabelas.has(tabela)) this.tabelas.set(tabela, []); return this.tabelas.get(tabela)!; }
  executar(consulta: Consulta) {
    this.log.push(consulta);
    const linhas = this.linhas(consulta.tabela);
    if (consulta.op === "insert") {
      const nova: Linha = { id: `linha-${this.seq++}`, lock_version: 1, ...structuredClone(consulta.valores!) };
      if (consulta.tabela === "editorial_workflow_items" && linhas.some(linha => ["marca_id", "subject_type", "subject_id", "stage"].every(chave => linha[chave] === nova[chave]))) {
        return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      linhas.push(nova);
      const projetada = projetar(nova, consulta.colunas);
      return { data: consulta.unica ? projetada : [projetada], error: null };
    }
    let alvo = linhas.filter(linha => consulta.filtros.every(({ coluna, tipo, valor }) =>
      tipo === "eq" ? linha[coluna] === valor : tipo === "is" ? (linha[coluna] ?? null) === valor : (valor as unknown[]).includes(linha[coluna])));
    if (consulta.op === "update") {
      for (const linha of alvo) Object.assign(linha, structuredClone(consulta.valores!), { lock_version: Number(linha.lock_version) + 1 });
    }
    for (const ordem of [...consulta.ordens].reverse()) {
      alvo = [...alvo].sort((a, b) => {
        const x = a[ordem.coluna] as number | string;
        const y = b[ordem.coluna] as number | string;
        return (x < y ? -1 : x > y ? 1 : 0) * (ordem.asc ? 1 : -1);
      });
    }
    if (consulta.faixa) alvo = alvo.slice(consulta.faixa[0], consulta.faixa[1] + 1);
    if (consulta.limite !== null) alvo = alvo.slice(0, consulta.limite);
    const projetadas = alvo.map(linha => projetar(linha, consulta.colunas));
    return { data: consulta.unica ? projetadas[0] ?? null : projetadas, error: null };
  }
}

/* ---------------------------------- dados ---------------------------------- */

function keyword(id: string, texto: string, extra: Linha = {}, marca = MARCA): Linha {
  return { id, brand_id: marca, keyword: texto, status: "aprovado", volume_search: 10, volume_source: "google_ads", intent: "Comercial", deleted_at: null, analise_semantica: {}, ...extra };
}
const publicada = (url: string, posto: string) => ({
  // A evidência que `readPublicationLink` exige para dizer "publicada".
  site_origin: { publicationStatus: "published", sourceUrl: url, resolvedUrl: url, canonicalUrl: url, urlSituation: "canonical_confirmed", lastCheckedAt: "2026-09-20T10:00:00Z", publicationConfirmedBy: ATOR, publicationConfirmedAt: "2026-09-20T10:00:00Z" },
  primary_keyword_policy: posto,
});

function entradaDeCache(texto: string, lens: SerpCacheLens, urls: string[] | null, marca = MARCA): Linha {
  const query = { keyword: texto, locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced" as const };
  return {
    id: `cache-${Math.random()}`, lock_version: 1, marca_id: marca, subject_type: SERP_CACHE_SUBJECT_TYPE, stage: SERP_CACHE_STAGE, subject_id: serpCacheSubjectId(query),
    payload: {
      meta: { keyword: texto, normalizedKeyword: normalizeSerpCacheKeyword(texto), locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced", depth: 10, collectedAt: "2026-09-20T12:00:00+00:00", providerRequestId: "req", keywordId: null, collectedBy: "minerador" },
      observation: { competitorDomains: [] },
      ...(urls ? { digest: { organic: urls.map(url => ({ url, title: "t", description: "d" })) } } : {}),
    },
  };
}

function cacheReal(texto: string, marca = MARCA): Linha[] {
  return SERP_CACHE_LENSES.map(lens => entradaDeCache(texto, lens, REAL.serp.find(linha => linha.keyword === texto && linha.lente === serpCacheLensLabel(lens))?.urls ?? null, marca));
}

function referencia(keywordId: string, role: "principal" | "secundaria") {
  return { keywordId, keywordDnaVersionId: `legacy:dna-${keywordId}:v1`, keywordDnaContentHash: `legacy:dna-${keywordId}`, role, strategicContribution: "Sustenta.", coveredIntentions: ["informacional"], requiredTopics: [], excludedTopics: [], classificationOrigin: "system" as const, confidence: 0.7, humanConfirmed: false };
}
function artigo(articleId: string, principal: string, outras: string[], slug: string): ArticleDNA {
  return ArticleDNASchema.parse({
    schemaVersion: 1, articleId, brandId: MARCA, principalKeywordId: principal, secondaryKeywordIds: outras, narrativeReinforcementIds: [],
    keywordReferences: [referencia(principal, "principal"), ...outras.map(id => referencia(id, "secundaria"))],
    siloId: null, hierarchy: "Suporte", suggestedSlug: slug, canonical: `https://adalbapro.com.br/${slug}`, mainIntent: "informacional", auxiliaryIntents: [],
    audience: "Donas de clínica", problem: "Agenda vazia", desiredResult: "Agenda cheia", journeyStage: "TOFU", brandObjective: "Serviço",
    promise: "Clientes", angle: "Prático", cta: "Conhecer", coverage: ["captação"], excludedSubjects: [], antiCannibalizationBoundary: "Não trata de gestão.",
    nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [], questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [],
    confidence: 0.7, humanPendingDecisions: [],
  });
}
async function linhaDeVersao(payload: ArticleDNA): Promise<Linha> {
  const envelope = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "human", changeReason: "inicial", createdBy: ATOR, payload, createdAt: "2026-09-21T00:00:00.000Z" });
  return { version_id: envelope.versionId, entity_id: envelope.entityId, marca_id: MARCA, artifact_type: "article_dna", version_number: 1, previous_version_id: null, content_hash: envelope.contentHash, origin: "human", change_reason: "inicial", created_at: envelope.createdAt, created_by: ATOR, status: "approved", payload };
}

const URL_CAPTAR = "https://adalbapro.com.br/blog/como-captar-clientes-para-clinica-de-estetica";
const URL_ATRAIR = "https://adalbapro.com.br/blog/como-atrair-pacientes-para-clinica-de-estetica";

async function montarBanco() {
  const banco = new Banco();
  banco.linhas("minerador_keywords").push(
    keyword(K_CAPTAR, CAPTAR, { analise_semantica: publicada(URL_CAPTAR, "reviewable") }),
    keyword(K_ATRAIR, ATRAIR, { volume_search: null, analise_semantica: publicada(URL_ATRAIR, "locked") }),
    keyword(K_OUTRO, "promoções para estética", { analise_semantica: publicada("https://adalbapro.com.br/blog/promocoes-para-estetica", "locked") }),
    keyword(K_ANUNCIOS, "anúncios para clínica de estética", { volume_search: 320 }),
    // Outra marca com as mesmas keywords e o mesmo cache: nunca entra (R4).
    keyword("bbbbbbbb-0000-4000-8000-000000000001", CAPTAR, { analise_semantica: publicada("https://outra.com/captar", "reviewable") }, OUTRA_MARCA),
  );
  banco.linhas("editorial_workflow_items").push(...cacheReal(CAPTAR), ...cacheReal(ATRAIR), ...cacheReal("promoções para estética"), ...cacheReal(CAPTAR, OUTRA_MARCA));
  banco.linhas("editorial_artifact_versions").push(
    await linhaDeVersao(artigo("article-captar", K_CAPTAR, [K_ANUNCIOS], "blog/como-captar-clientes-para-clinica-de-estetica")),
    await linhaDeVersao(artigo("article-atrair", K_ATRAIR, [], "blog/como-atrair-pacientes-para-clinica-de-estetica")),
  );
  return banco;
}

/* ------------------------------ portas falsas ------------------------------ */

const paginas = (texto: string) => new Set(REAL.serp.filter(linha => linha.keyword === texto).flatMap(linha => linha.urls || []).map(url => normalizeSerpPageUrl(url)!));
const so = (de: string, contra: string) => [...new Set(REAL.serp.filter(linha => linha.keyword === de).flatMap(linha => linha.urls || []))].filter(url => !paginas(contra).has(normalizeSerpPageUrl(url)!));
const novas = (prefixo: string, n: number) => Array.from({ length: n }, (_, i) => `https://${prefixo}.com.br/p${i + 1}`);
const SERP_CANDIDATAS: Record<string, string[]> = {
  "anúncios para clínica de estética": [...so(CAPTAR, ATRAIR).slice(0, 3), ...novas("anuncios", 7)],
  "instagram para clínica de estética": [...so(ATRAIR, CAPTAR).slice(0, 3), ...novas("instagram", 7)],
};
const VOLUME: Record<string, number> = { "anúncios para clínica de estética": 320, "instagram para clínica de estética": 480 };

function portas() {
  const registro = { openExecution: 0, ideias: 0, serp: 0, usoAds: [] as string[] };
  const run: Omit<DifferentiationRunPorts, "now"> = {
    async openExecution() {
      registro.openExecution += 1;
      return {
        ledgerCapability: false,
        findUsage: async () => false,
        async googleAdsIdeas(seed) {
          registro.ideias += 1;
          const texto = seed.kind === "keyword_and_url" ? "" : seed.keywords.join(" ");
          const lista = texto.includes("captar") ? ["anúncios para clínica de estética"] : texto.includes("atrair") ? ["instagram para clínica de estética"] : [];
          return { requestId: "r", ideas: lista.map(item => ({ keyword: item, averageMonthlySearches: VOLUME[item], competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null })) };
        },
        async recordGoogleAdsUsage(event) { registro.usoAds.push(event.suffix); },
        async collectSerp(request, opcoes) {
          opcoes.onRequestStarted();
          registro.serp += 1;
          const urls = SERP_CANDIDATAS[request.query.keyword] || [];
          return { providerRequestId: "s", costUsd: 0.002, digest: { version: "organic-digest-v1", depth: 10, organic: urls.map((url, i) => ({ rank_group: i + 1, url, domain: "d", title: "t", description: "d" })) } as never, organicCount: urls.length, stored: true, error: null };
        },
        async recordDataForSeoUsage() { return "skipped" as const; },
      };
    },
    async googleAdsVolumes(lista) { return new Map(lista.map(item => [normalizeKeyword(item), VOLUME[item] ?? null])); },
    async readFootprints(alvos) { return { footprints: [], missingLenses: alvos.flatMap(alvo => ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ keywordId: alvo.keywordId, lens, reason: "sem entrada no cache" }))) }; },
  };
  return { run, registro };
}

function deps(banco: Banco, extra: Partial<DifferentiationHandlerDeps> = {}): DifferentiationHandlerDeps {
  return { store: { supabase: banco as never, brandId: MARCA, actorUserId: ATOR }, now: () => NOW, ...extra };
}

const dados = (outcome: { body: Record<string, unknown> }) => outcome.body.data as Record<string, unknown>;

/* ---------------------------------- testes ---------------------------------- */

test("detectar (grátis): o grupo captar × atrair, só da marca, sem gravar e sem provider", async () => {
  const banco = await montarBanco();
  const saida = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  assert.equal(saida.status, 200, JSON.stringify(saida.body));
  const grupos = dados(saida).groups as Array<{ groupId: string; members: Array<{ keywordId: string; url: string | null; post: string; articleId: string | null }>; strongPairs: Array<{ sharedPageCount: number }> }>;
  assert.equal(grupos.length, 1);
  assert.deepEqual(grupos[0].members.map(membro => membro.keywordId).sort(), [K_CAPTAR, K_ATRAIR].sort());
  assert.equal(grupos[0].strongPairs[0].sharedPageCount, 6);
  const captar = grupos[0].members.find(membro => membro.keywordId === K_CAPTAR)!;
  assert.equal(captar.url, URL_CAPTAR, "a URL vem do Vínculo");
  assert.equal(captar.post, "free");
  assert.equal(captar.articleId, "article-captar", "o artigo vem do índice estreito do ArticleDNA");
  assert.equal(grupos[0].members.find(membro => membro.keywordId === K_ATRAIR)!.post, "locked");
  assert.equal(dados(saida).paid, false);
  // R4/R5: toda consulta filtra a marca; o payload do ArticleDNA e o analise_semantica inteiro não trafegam.
  for (const consulta of banco.log) {
    const coluna = consulta.tabela === "minerador_keywords" ? "brand_id" : "marca_id";
    assert.ok(consulta.filtros.some(filtro => filtro.coluna === coluna && filtro.valor === MARCA), `${consulta.tabela} sem filtro de marca`);
    assert.ok(!consulta.colunas.split(",").includes("analise_semantica"), "analise_semantica inteira não trafega");
    assert.ok(!(consulta.tabela === "editorial_artifact_versions" && consulta.colunas.split(",").includes("payload")), "a detecção não lê o payload do ArticleDNA");
  }
  assert.ok(banco.log.every(consulta => consulta.op === "select"), "detectar não grava");
  assert.equal(chamadasDeRede, 0);
});

test("prévia, rodada e aceite: hash exigido, grupo relido, readback e decisão registrada", async () => {
  const banco = await montarBanco();
  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const groupId = (dados(deteccao).groups as Array<{ groupId: string }>)[0].groupId;

  // Prévia: grátis, gravada na proposta (estágio architect, subject_type livre).
  const previa = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  assert.equal(previa.status, 200, JSON.stringify(previa.body));
  const plano = dados(previa).plan as { planHash: string; costRange: { minUsd: number; maxUsd: number } };
  assert.deepEqual(plano.costRange, { minUsd: 0, maxUsd: 0.14 }, "só a SERP: 2 páginas × 5 candidatas × 4 lentes");
  const linha = banco.linhas("editorial_workflow_items").find(item => item.subject_type === DIFFERENTIATION_SUBJECT_TYPE)!;
  assert.equal(linha.stage, DIFFERENTIATION_STAGE);
  assert.equal(linha.marca_id, MARCA);
  assert.equal(linha.state, "planned");
  assert.equal(linha.created_by, ATOR);

  // Rodada com hash errado: nada é pago (o provider nem abre).
  const falsas = portas();
  const errado = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "33333333-3333-4333-8333-333333333333", authorizedPlan: { planHash: "sha256:outro", maxCostUsd: 0.284 } }));
  assert.equal(errado.status, 409);
  assert.equal(errado.body.code, "PAID_PLAN_CHANGED");
  assert.equal(falsas.registro.openExecution, 0);
  assert.throws(() => DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "33333333-3333-4333-8333-333333333333", authorizedPlan: { planHash: plano.planHash, maxCostUsd: 0.9 } }), "o teto de US$ 0,50 é conferido no pedido");

  // Rodada certa.
  const certa = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "44444444-4444-4444-8444-444444444444", authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } }));
  assert.equal(certa.status, 200, JSON.stringify(certa.body));
  const rodada = dados(certa);
  const avaliacao = rodada.evaluation as { state: string; pages: Array<{ keywordId: string; newPrincipal: { keyword: string } | null; secondaries: Array<{ keyword: string }> }> };
  assert.equal(avaliacao.state, "differentiated");
  assert.equal(avaliacao.pages.find(pagina => pagina.keywordId === K_CAPTAR)!.newPrincipal?.keyword, "anúncios para clínica de estética");
  assert.deepEqual(avaliacao.pages.find(pagina => pagina.keywordId === K_ATRAIR)!.secondaries.map(item => item.keyword), ["instagram para clínica de estética"]);
  assert.equal((rodada.proposal as { state: string }).state, "proposed");
  assert.equal(falsas.registro.serp, 8, "2 candidatas × 4 lentes");
  assert.equal(falsas.registro.ideias, 4, "as keywords novas vêm do Google Ads: 2 sementes por página");
  assert.deepEqual([...falsas.registro.usoAds].sort(), ["keyword_seed:p1", "keyword_seed:p2", "url_seed:p1", "url_seed:p2"]);
  assert.deepEqual(rodada.labsFailures, []);
  assert.deepEqual(rodada.adsFailures, []);
  assert.equal(rodada.paid, true);

  // Aceite com a prévia errada: nada é gravado.
  const versoes: Array<VersionEnvelope<ArticleDNA>> = [];
  const gravar: DifferentiationHandlerDeps["persistArticleVersion"] = async version => {
    versoes.push(version);
    banco.linhas("editorial_artifact_versions").push({ version_id: version.versionId, entity_id: version.entityId, marca_id: MARCA, artifact_type: "article_dna", version_number: version.versionNumber, previous_version_id: version.previousVersionId, content_hash: version.contentHash, origin: version.origin, change_reason: version.changeReason, created_at: version.createdAt, created_by: version.createdBy, status: "proposed", payload: version.payload });
    return { status: "PERSISTED", versionId: version.versionId };
  };
  const velha = await handleDifferentiationApply(deps(banco, { persistArticleVersion: gravar }), DifferentiationApplyRequestSchema.parse({ brandId: MARCA, groupId, decision: "accept", evaluationHash: "sha256:velha" }));
  assert.equal(velha.status, 409);
  assert.equal(versoes.length, 0);

  const aceite = await handleDifferentiationApply(deps(banco, { persistArticleVersion: gravar }), DifferentiationApplyRequestSchema.parse({ brandId: MARCA, groupId, decision: "accept", evaluationHash: rodada.evaluationHash }));
  assert.equal(aceite.status, 200, JSON.stringify(aceite.body));
  const resultado = dados(aceite);
  const porPagina = new Map((resultado.pages as Array<{ keywordId: string; written: boolean; readbackConfirmed: boolean | null; swap: { applied: boolean } ; ingest: Array<{ keyword: string }> }>).map(pagina => [pagina.keywordId, pagina]));
  assert.equal(porPagina.get(K_CAPTAR)!.written, true);
  assert.equal(porPagina.get(K_CAPTAR)!.swap.applied, true, "a nova principal já está no ArticleDNA, Posto Livre, não ranqueia");
  assert.equal(porPagina.get(K_ATRAIR)!.swap.applied, false);
  assert.deepEqual(porPagina.get(K_ATRAIR)!.ingest.map(item => item.keyword), ["instagram para clínica de estética"], "a nova vai ao Processador");
  assert.equal(versoes.length, 2);
  const captar = versoes.find(versao => versao.entityId === "article-captar")!;
  assert.equal(captar.versionNumber, 2);
  assert.equal(captar.createdBy, ATOR);
  assert.equal(captar.origin, "human");
  assert.equal(captar.payload.principalKeywordId, K_ANUNCIOS);
  assert.equal(captar.payload.suggestedSlug, "blog/como-captar-clientes-para-clinica-de-estetica");
  assert.ok(captar.payload.differentiation.some(linha => linha.startsWith("Diferenciação: ")));
  assert.equal(resultado.readbackConfirmed, true);
  assert.equal((resultado.proposal as { state: string }).state, "partially_applied", "há keyword nova esperando o Minerador");
  const lotes = resultado.ingestBatches as Array<{ subjectPhrase: string; searchId: string }>;
  assert.equal(lotes[0].subjectPhrase, ATRAIR);
  assert.equal(lotes[0].searchId, "44444444-4444-4444-8444-444444444444");
  const registrada = banco.linhas("editorial_workflow_items").find(item => item.subject_type === DIFFERENTIATION_SUBJECT_TYPE)!;
  const decisoes = (registrada.payload as { decisions: Array<{ decision: string; actorId: string }> }).decisions;
  assert.deepEqual(decisoes.map(item => [item.decision, item.actorId]), [["accept", ATOR]]);
  assert.equal(chamadasDeRede, 0);
});

test("rodada: SERP do grupo mudou desde a prévia → nada é pago", async () => {
  const banco = await montarBanco();
  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const groupId = (dados(deteccao).groups as Array<{ groupId: string }>)[0].groupId;
  const previa = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  const plano = dados(previa).plan as { planHash: string; costRange: { maxUsd: number } };
  // Uma lente do captar muda no cache: o par deixa de dividir as mesmas páginas.
  const cache = banco.linhas("editorial_workflow_items").filter(item => item.subject_type === SERP_CACHE_SUBJECT_TYPE && item.marca_id === MARCA && (item.payload as { meta: { keyword: string } }).meta.keyword === CAPTAR);
  for (const entrada of cache) (entrada.payload as { digest?: unknown }).digest = { organic: novas("mudou", 10).map(url => ({ url, title: "t", description: "d" })) };
  const falsas = portas();
  const saida = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "55555555-5555-4555-8555-555555555555", authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } }));
  assert.equal(saida.status, 409);
  assert.equal(saida.body.code, "PLAN_STALE");
  assert.equal(falsas.registro.openExecution + falsas.registro.ideias + falsas.registro.serp, 0);
});

test("Manter como está: registrado com ator e o grupo sai do painel até a SERP mudar", async () => {
  const banco = await montarBanco();
  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const groupId = (dados(deteccao).groups as Array<{ groupId: string }>)[0].groupId;
  const manter = await handleDifferentiationApply(deps(banco), DifferentiationApplyRequestSchema.parse({ brandId: MARCA, groupId, decision: "keep" }));
  assert.equal(manter.status, 200, JSON.stringify(manter.body));
  assert.equal(dados(manter).readbackConfirmed, true);
  const linha = banco.linhas("editorial_workflow_items").find(item => item.subject_type === DIFFERENTIATION_SUBJECT_TYPE)!;
  assert.equal(linha.state, "kept");
  assert.equal((linha.payload as { kept: { actorId: string } }).kept.actorId, ATOR);
  const depois = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  assert.equal((dados(depois).groups as Array<{ kept: boolean }>)[0].kept, true);
  assert.throws(() => DifferentiationApplyRequestSchema.parse({ brandId: MARCA, groupId, decision: "accept" }), "aceitar exige o hash da prévia");
});

test("as rotas: brandId resolvido no servidor, ator autenticado, run paga pelo núcleo da Pesquisa por Assunto", () => {
  const limpa = (arquivo: string) => readFileSync(new URL(`../app/api/arquiteto/cannibalization/${arquivo}/route.ts`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const plan = limpa("plan");
  const run = limpa("run");
  const apply = limpa("apply");
  for (const fonte of [plan, run, apply]) assert.match(fonte, /resolvePipelineContext\(/);
  assert.match(plan, /action: parsed\.data\.groupId && !parsed\.data\.resume \? "edit" : "view"/, "reler é só ver");
  assert.match(plan, /proposeDifferentiationAiAngles\(\{ actorUserId: context\.actorUserId, brandId: context\.brandId, client: context\.supabase,/, "a IA resolve a Connection como as outras rotas do Arquiteto");
  assert.match(run, /buildSubjectDiscoveryPorts\(\{.*usage: \{ module: "arquiteto", collectedBy: "arquiteto" \}/);
  assert.doesNotMatch(run, /serper|rapidapi/i);
  assert.match(apply, /appendArquitetoArtifact\(context, "article_dna", version, "proposed"\)/);
  assert.doesNotMatch(plan + apply, /openExecution|collectAndCacheSerp|executeDataForSeo/, "plan e apply não pagam");
});

/* ------------------------ a prévia vale UMA rodada ------------------------ */

async function rodadaFeita() {
  const banco = await montarBanco();
  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const groupId = (dados(deteccao).groups as Array<{ groupId: string }>)[0].groupId;
  const previa = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  const plano = dados(previa).plan as { planHash: string; costRange: { maxUsd: number } };
  const falsas = portas();
  const pedido = (operationRequestId: string) => DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId, authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } });
  const primeira = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), pedido("66666666-6666-4666-8666-666666666666"));
  assert.equal(primeira.status, 200, JSON.stringify(primeira.body));
  return { banco, groupId, plano, falsas, pedido, primeira };
}
const proposta = (banco: Banco) => banco.linhas("editorial_workflow_items").find(item => item.subject_type === DIFFERENTIATION_SUBJECT_TYPE)!;

test("a prévia vale uma rodada: outro id não paga de novo; o mesmo id devolve o resultado gravado", async () => {
  const { banco, falsas, pedido, primeira } = await rodadaFeita();
  const pagas = { ideias: falsas.registro.ideias, serp: falsas.registro.serp, open: falsas.registro.openExecution };

  const outra = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), pedido("77777777-7777-4777-8777-777777777777"));
  assert.equal(outra.status, 409);
  assert.equal(outra.body.code, "DIFFERENTIATION_ALREADY_RUN");

  const mesma = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), pedido("66666666-6666-4666-8666-666666666666"));
  assert.equal(mesma.status, 200);
  assert.equal(dados(mesma).replayed, true);
  assert.equal(dados(mesma).paid, false);
  assert.equal(dados(mesma).evaluationHash, dados(primeira).evaluationHash, "o resultado pago, relido");
  assert.deepEqual({ ideias: falsas.registro.ideias, serp: falsas.registro.serp, open: falsas.registro.openExecution }, pagas, "nada foi pago de novo");
});

test("rodada em andamento (outra aba, outro id): 409 sem abrir o provider; a reserva é por lock_version", async () => {
  const banco = await montarBanco();
  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const groupId = (dados(deteccao).groups as Array<{ groupId: string }>)[0].groupId;
  const previa = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  const plano = dados(previa).plan as { planHash: string; costRange: { maxUsd: number } };
  const falsas = portas();
  // Enquanto a primeira aba paga, a segunda chega: a proposta já está reservada.
  let segunda: Awaited<ReturnType<typeof handleDifferentiationRun>> | null = null;
  const lenta = { ...falsas.run, async openExecution() {
    assert.equal(proposta(banco).state, "running", "reservada ANTES de pagar");
    segunda = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "88888888-8888-4888-8888-888888888888", authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } }));
    return falsas.run.openExecution();
  } };
  const primeira = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => lenta }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "99999999-9999-4999-8999-999999999999", authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } }));
  assert.equal(primeira.status, 200, JSON.stringify(primeira.body));
  assert.equal(segunda!.status, 409);
  assert.equal(segunda!.body.code, "OPERATION_IN_PROGRESS");
  assert.equal(falsas.registro.openExecution, 1, "só a primeira abriu o provider");
  assert.equal(proposta(banco).state, "proposed");
  assert.equal((proposta(banco).payload as { running?: unknown }).running, undefined, "a reserva some ao terminar");

  // Recusa antes de pagar devolve a prévia: o provider indisponível não trava o grupo.
  const banco2 = await montarBanco();
  await handleDifferentiationPlan(deps(banco2), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  const plano2 = (proposta(banco2).payload as { plan: { planHash: string; costRange: { maxUsd: number } } }).plan;
  const fora = await handleDifferentiationRun(deps(banco2, { openRunPorts: async () => { throw new Error("sem credencial"); } }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "12121212-1212-4212-8212-121212121212", authorizedPlan: { planHash: plano2.planHash, maxCostUsd: plano2.costRange.maxUsd } }));
  assert.equal(fora.body.code, "DATAFORSEO_UNAVAILABLE");
  assert.equal(proposta(banco2).state, "planned", "a prévia volta a valer");
});

test("prévia v1 (com Labs) gravada antes da troca: a rodada é recusada antes de reservar, sem abrir o provider", async () => {
  const banco = await montarBanco();
  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const groupId = (dados(deteccao).groups as Array<{ groupId: string }>)[0].groupId;
  await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  const linha = proposta(banco);
  const payload = linha.payload as { plan: { version: string; planHash: string; costRange: { maxUsd: number }; pages: Array<Record<string, unknown>> } };
  // A prévia como o código de antes a gravava: v1, com Labs e sem as sementes do Google Ads.
  payload.plan.version = "published-differentiation-plan-v1";
  payload.plan.pages = payload.plan.pages.map(pagina => ({ ...pagina, ads: undefined, labs: [{ callId: "p1:keyword_ideas", endpoint: "keyword_ideas", input: String(pagina.keyword) }] }));
  const versaoAntes = linha.lock_version;
  const falsas = portas();
  const saida = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "14141414-1414-4414-8414-141414141414", authorizedPlan: { planHash: payload.plan.planHash, maxCostUsd: 0.284 } }));
  assert.equal(saida.status, 409);
  assert.equal(saida.body.code, "DIFFERENTIATION_PLAN_OUTDATED");
  assert.match(String(saida.body.error), /antes da troca para o Google Ads.*nada foi pago/);
  assert.equal(falsas.registro.openExecution + falsas.registro.ideias + falsas.registro.serp, 0, "nada foi aberto nem pago");
  assert.equal(proposta(banco).state, "planned", "nada foi reservado");
  assert.equal(proposta(banco).lock_version, versaoAntes, "a proposta não foi regravada");

  // Planejar de novo troca a prévia por uma v2, que roda normalmente.
  const nova = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  assert.equal((dados(nova).plan as { version: string }).version, "published-differentiation-plan-v2");
});

test("nova prévia não apaga a avaliação paga: recusada (também pelo MCP); reler é grátis; nova rodada só com pedido explícito", async () => {
  const { banco, groupId, primeira } = await rodadaFeita();
  const hash = dados(primeira).evaluationHash as string;

  const previa = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  assert.equal(previa.status, 409);
  assert.equal(previa.body.code, "DIFFERENTIATION_EVALUATION_PENDING");
  assert.equal(proposta(banco).state, "proposed");
  assert.equal((proposta(banco).payload as { evaluationHash: string }).evaluationHash, hash, "a avaliação continua gravada");

  const escritas = banco.log.filter(consulta => consulta.op !== "select").length;
  const relida = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId, resume: true }));
  assert.equal(relida.status, 200);
  assert.equal((dados(relida).run as { evaluationHash: string }).evaluationHash, hash);
  assert.equal(dados(relida).paid, false);
  assert.equal(banco.log.filter(consulta => consulta.op !== "select").length, escritas, "reler não grava");

  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  assert.deepEqual((dados(deteccao).groups as Array<{ proposal: { state: string; hasRun: boolean } }>)[0].proposal, { state: "proposed", hasRun: true, executedAt: NOW.toISOString(), runningSince: null });

  const nova = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId, replaceEvaluation: true }));
  assert.equal(nova.status, 200, JSON.stringify(nova.body));
  const payload = proposta(banco).payload as { run?: unknown; evaluationHash?: string; history: Array<{ evaluationHash: string; operationRequestId: string }> };
  assert.equal(proposta(banco).state, "planned");
  assert.equal(payload.run, undefined);
  assert.deepEqual(payload.history.map(item => [item.evaluationHash, item.operationRequestId]), [[hash, "66666666-6666-4666-8666-666666666666"]], "o que foi pago vai ao histórico");
});

test("Manter como está não é desfeito pela prévia (nem pelo MCP); rodada e grupo mantido também recusam", async () => {
  const banco = await montarBanco();
  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const groupId = (dados(deteccao).groups as Array<{ groupId: string }>)[0].groupId;
  await handleDifferentiationApply(deps(banco), DifferentiationApplyRequestSchema.parse({ brandId: MARCA, groupId, decision: "keep" }));
  const previa = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  assert.equal(previa.status, 409);
  assert.equal(previa.body.code, "DIFFERENTIATION_GROUP_KEPT");
  assert.equal(proposta(banco).state, "kept");
  assert.equal((proposta(banco).payload as { kept: { actorId: string } }).kept.actorId, ATOR);
  const depois = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  assert.equal((dados(depois).groups as Array<{ kept: boolean }>)[0].kept, true);
});

test("rodada: publicado que saiu do Vínculo desde a prévia → nada é pago", async () => {
  const banco = await montarBanco();
  const deteccao = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const groupId = (dados(deteccao).groups as Array<{ groupId: string }>)[0].groupId;
  const previa = await handleDifferentiationPlan(deps(banco), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId }));
  const plano = dados(previa).plan as { planHash: string; costRange: { maxUsd: number } };
  banco.linhas("minerador_keywords").find(linha => linha.id === K_ATRAIR)!.deleted_at = "2026-09-27T12:30:00Z";
  const falsas = portas();
  const saida = await handleDifferentiationRun(deps(banco, { openRunPorts: async () => falsas.run }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "13131313-1313-4313-8313-131313131313", authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } }));
  assert.equal(saida.status, 409);
  assert.equal(saida.body.code, "PLAN_STALE");
  assert.match(String(saida.body.error), /não é mais um publicado/);
  assert.equal(falsas.registro.openExecution + falsas.registro.ideias + falsas.registro.serp, 0);
  assert.equal(proposta(banco).state, "planned", "nada foi reservado");
});

test("aceite sem páginas marcadas leva só as Diferenciado; nada Diferenciado → 409 sem gravar", async () => {
  const { banco, groupId, primeira } = await rodadaFeita();
  const linha = proposta(banco);
  const payload = linha.payload as { run: { evaluation: { pages: Array<{ state: string; newPrincipal: unknown; secondaries: unknown[] }> } } };
  for (const pagina of payload.run.evaluation.pages) { pagina.state = "weak"; pagina.newPrincipal = null; pagina.secondaries = []; }
  const versoes: unknown[] = [];
  const nada = await handleDifferentiationApply(deps(banco, { persistArticleVersion: async version => { versoes.push(version); return { status: "PERSISTED", versionId: version.versionId }; } }), DifferentiationApplyRequestSchema.parse({ brandId: MARCA, groupId, decision: "accept", evaluationHash: dados(primeira).evaluationHash }));
  assert.equal(nada.status, 409);
  assert.equal(nada.body.code, "NOTHING_TO_APPLY");
  assert.equal(versoes.length, 0);
});
