import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SERP_CACHE_LENSES, SERP_CACHE_STAGE, SERP_CACHE_SUBJECT_TYPE, normalizeSerpCacheKeyword, serpCacheLensLabel, serpCacheSubjectId, type SerpCacheLens } from "../lib/editorial/serp-cache.ts";
import { ArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { CanonicalWorkflowItem } from "../lib/arquiteto/canonical-workspace.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import { articleApprovalRevalidationIssues } from "../lib/arquiteto/article-approval-revalidation.ts";
import { normalizeSerpPageUrl } from "../lib/arquiteto/serp-subject-overlap.ts";
import type { DifferentiationRunPorts } from "../lib/arquiteto/published-differentiation-run.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";
import { PublishedReinforcementRequestSchema, handlePublishedReinforcement, stableUuid, type ArticleSerpReferenceRow, type PublishedReinforcementDeps } from "../lib/server/arquiteto-published-reinforcement.ts";
import { DifferentiationApplyRequestSchema, DifferentiationPlanRequestSchema, DifferentiationRunRequestSchema, handleDifferentiationApply, handleDifferentiationPlan, handleDifferentiationRun, type DifferentiationHandlerDeps } from "../lib/server/arquiteto-differentiation.ts";
import { codigoSemComentarios } from "./arquiteto-cenarios-ouro-fixtures.mts";

/*
 * F0 DA LINHA ÚNICA DO ARQUITETO — CENÁRIOS-OURO DOS PUBLICADOS (2026-10-16).
 *
 * SDD `docs/compartilhado/sdd-linha-unica-do-arquiteto-2026-10-16.md` §11.1,
 * C7 (reforço) e C8 (diferenciação). Os núcleos reais do servidor rodam sobre
 * um banco em memória com a forma do `postgrest-js` (o mesmo dublê de
 * `arquiteto-reforcar-publicados-servidor` e `arquiteto-diferenciacao-publicados-servidor`);
 * o provider é porta falsa, a SERP vem das fixtures reais lidas do cache da
 * AdalbaPro. O status e a permissão com que cada ROTA grava são lidos do
 * código da rota (sem comentários): é a parte que a F1 e a F5 mudam.
 *
 * Nenhuma rede, nenhum crédito, nenhum banco remoto.
 */

let chamadasDeRede = 0;
globalThis.fetch = (async () => { chamadasDeRede += 1; throw new Error("Rede proibida nos cenários-ouro dos publicados."); }) as typeof fetch;

const MARCA = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ATOR = "11111111-1111-4111-8111-111111111111";

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
    if (consulta.op === "update") for (const linha of alvo) Object.assign(linha, structuredClone(consulta.valores!), { lock_version: Number(linha.lock_version) + 1 });
    for (const ordem of [...consulta.ordens].reverse()) {
      alvo = [...alvo].sort((a, b) => { const x = a[ordem.coluna] as number | string; const y = b[ordem.coluna] as number | string; return (x < y ? -1 : x > y ? 1 : 0) * (ordem.asc ? 1 : -1); });
    }
    if (consulta.faixa) alvo = alvo.slice(consulta.faixa[0], consulta.faixa[1] + 1);
    if (consulta.limite !== null) alvo = alvo.slice(0, consulta.limite);
    const projetadas = alvo.map(linha => projetar(linha, consulta.colunas));
    return { data: consulta.unica ? projetadas[0] ?? null : projetadas, error: null };
  }
}
function entradaDeCache(texto: string, lens: SerpCacheLens, urls: string[] | null): Linha {
  const query = { keyword: texto, locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced" as const };
  return {
    id: `cache-${texto}-${lens}`, lock_version: 1, marca_id: MARCA, subject_type: SERP_CACHE_SUBJECT_TYPE, stage: SERP_CACHE_STAGE, subject_id: serpCacheSubjectId(query),
    payload: {
      meta: { keyword: texto, normalizedKeyword: normalizeSerpCacheKeyword(texto), locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced", depth: 10, collectedAt: "2026-09-20T12:00:00+00:00", providerRequestId: "req", keywordId: null, collectedBy: "minerador" },
      observation: { competitorDomains: [] },
      ...(urls ? { digest: { organic: urls.map(url => ({ url, title: "t", description: "d" })) } } : {}),
    },
  };
}
const publicada = (url: string, posto: string) => ({ site_origin: { publicationStatus: "published", sourceUrl: url, resolvedUrl: url, canonicalUrl: url, urlSituation: "canonical_confirmed", lastCheckedAt: "2026-09-20T10:00:00Z", publicationConfirmedBy: ATOR, publicationConfirmedAt: "2026-09-20T10:00:00Z" }, primary_keyword_policy: posto });

/* ======================================================================= */
/* C7 · Publicado Travado com DNA: Reforçar → prévia → Gravar reforços      */
/* ======================================================================= */

type FixtureLinha = { keywordId: string; keyword: string; lenses: Array<{ lens: string; urls: string[] | null }> };
const SERP_ADALBA = JSON.parse(readFileSync(new URL("./fixtures/arquiteto-serp-mesmo-assunto-adalbapro.json", import.meta.url), "utf8")) as { keywords: FixtureLinha[] };
const urlsDe = (texto: string, lente: string) => SERP_ADALBA.keywords.find(linha => linha.keyword === texto)?.lenses.find(leitura => leitura.lens === lente)?.urls ?? null;
const TERRITORIO = "territory:0b8f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const K_PUB = "aaaaaaaa-0000-4000-8000-000000000001", K_A = "aaaaaaaa-0000-4000-8000-000000000002", K_B = "aaaaaaaa-0000-4000-8000-000000000003", K_C = "aaaaaaaa-0000-4000-8000-000000000006";
const PUB = "como atrair pacientes para clínica";
const URL_PUB = "https://adalbapro.com.br/blog/como-atrair-pacientes-para-clinica";
/** Uma keyword da lista sem fixture própria: o cache dela é o top 10 da página publicada (o Google junta as duas). */
const TEXTO_C = "como atrair pacientes para a clínica";

function montarReforco() {
  const banco = new Banco();
  const kw = (id: string, texto: string, extra: Linha = {}): Linha => ({ id, brand_id: MARCA, keyword: texto, status: "aprovado", volume_search: 20, volume_source: "google_ads", intent: "Informativo", deleted_at: null, lista_id: null, analise_semantica: {}, ...extra });
  // O publicado é TRAVADO ao slug.
  banco.linhas("minerador_keywords").push(kw(K_PUB, PUB, { volume_search: null, volume_source: null, intent: "Comercial", analise_semantica: publicada(URL_PUB, "locked") }), kw(K_A, "como atrair pacientes"), kw(K_B, "como atrair pacientes para o consultório"), kw(K_C, TEXTO_C));
  const cache = (texto: string, de = texto) => SERP_CACHE_LENSES.map(lens => entradaDeCache(texto, lens, urlsDe(de, serpCacheLensLabel(lens))));
  banco.linhas("editorial_workflow_items").push(...cache(PUB), ...cache("como atrair pacientes"), ...cache("como atrair pacientes para o consultório"), ...cache(TEXTO_C, PUB));
  const item = (keywordId: string): CanonicalWorkflowItem => ({ id: stableUuid("item", keywordId), marcaId: MARCA, subjectType: "keyword", subjectId: keywordId, articleId: null, stage: "architect", state: "received", sourceEntityId: keywordId, sourceVersionId: null, sourceContentHash: null, payload: { territoryRef: TERRITORIO }, lockVersion: 1, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z" });
  const mesa = { itens: [item(K_PUB), item(K_A), item(K_B), item(K_C)] };
  const versoes: Array<VersionEnvelope<ArticleDNA>> = [];
  const pareceres: ArticleSerpReferenceRow[] = [{ candidateRef: `article-candidate:${TERRITORIO}:${K_PUB}`, territoryRef: TERRITORIO, reference: { entityId: "assessment-pub", versionId: "assessment-pub:base-1", contentHash: `sha256:${"b".repeat(64)}` }, composition: { keywordIds: [K_PUB, K_A], principalKeywordId: K_PUB } }];
  const vigentes = () => { const por = new Map<string, VersionEnvelope<ArticleDNA>>(); for (const v of versoes) if (!por.has(v.entityId) || por.get(v.entityId)!.versionNumber < v.versionNumber) por.set(v.entityId, v); return [...por.values()]; };
  const deps = (): PublishedReinforcementDeps => ({
    store: { supabase: banco as never, brandId: MARCA, actorUserId: ATOR },
    now: () => new Date("2026-10-16T12:00:00Z"),
    readWorkspace: async () => ({ workflowItems: structuredClone(mesa.itens), keywords: banco.linhas("minerador_keywords").filter(linha => linha.brand_id === MARCA) as never, siloDnas: [], articleDnas: structuredClone(vigentes()) }),
    readArticleSerpReferences: async () => structuredClone(pareceres),
    patchWorkingCopy: async updates => { for (const update of updates) { const alvo = mesa.itens.find(entrada => entrada.id === update.workflowItemId)!; if (alvo.lockVersion !== update.expectedLock) throw new Error("lock vencido"); alvo.payload = { ...alvo.payload, ...update.assignment }; alvo.lockVersion += 1; } },
    // A rota liga esta porta a `appendArquitetoArtifact(context, "article_dna", version, "approved")` (ver o fim do cenário).
    persistArticleVersion: async version => {
      versoes.push(version);
      banco.linhas("editorial_artifact_versions").push({ version_id: version.versionId, entity_id: version.entityId, marca_id: MARCA, artifact_type: "article_dna", version_number: version.versionNumber, previous_version_id: version.previousVersionId, content_hash: version.contentHash, origin: version.origin, change_reason: version.changeReason, created_at: version.createdAt, created_by: version.createdBy, status: "approved", payload: version.payload });
      return { status: "PERSISTED", versionId: version.versionId };
    },
  });
  return { versoes, pareceres, deps };
}
const pedidoReforco = (keywordIds: string[], extra: Record<string, unknown> = {}) => PublishedReinforcementRequestSchema.parse({ brandId: MARCA, mode: "preview", pages: [{ publishedKeywordId: K_PUB, keywordIds }], ...extra });
const dados = (saida: { body: Record<string, unknown> }) => saida.body.data as Record<string, unknown>;

test("C7 · publicado TRAVADO com DNA + 2 keywords da lista com SERP Forte: prévia → 'Gravar reforços' → v2 aprovada com as 2, URL/slug/canonical iguais e o parecer da composição nova; HOJE a rota grava 'approved' com a permissão 'edit' — muda na F1", async () => {
  const { versoes, pareceres, deps } = montarReforco();
  // O DNA de hoje (v1): o publicado com "como atrair pacientes".
  const previaV1 = dados(await handlePublishedReinforcement(deps(), pedidoReforco([K_A])));
  const v1 = await handlePublishedReinforcement(deps(), pedidoReforco([K_A], { mode: "apply", decisionHash: previaV1.decisionHash, operationRequestId: "31313131-3131-4313-8313-313131313131" }));
  assert.equal(v1.status, 200, JSON.stringify(v1.body));
  assert.equal(versoes.length, 1);
  const antes = ArticleDNASchema.parse(versoes[0].payload);

  // O parecer da composição NOVA (publicado + as 3) já está gravado (o Processar o grava).
  pareceres[0] = { ...pareceres[0], reference: { entityId: "assessment-pub", versionId: "assessment-pub:base-2", contentHash: `sha256:${"c".repeat(64)}` }, composition: { keywordIds: [K_PUB, K_A, K_B, K_C], principalKeywordId: K_PUB } };
  const previa = dados(await handlePublishedReinforcement(deps(), pedidoReforco([K_B, K_C])));
  const [pagina] = previa.pages as Array<{ status: string; dna: { mode: string }; add: Array<{ keywordId: string; level: string }> }>;
  assert.equal(pagina.status, "ready", JSON.stringify(pagina));
  assert.equal(pagina.dna.mode, "successor", "vN+1 de um DNA que já existe");
  assert.deepEqual(pagina.add.map(item => [item.keywordId, item.level]).sort(), [[K_B, "strong"], [K_C, "strong"]].sort(), "as 2 com SERP Forte");
  assert.equal(previa.written, false, "a prévia não grava");
  assert.equal(versoes.length, 1);
  const gravado = await handlePublishedReinforcement(deps(), pedidoReforco([K_B, K_C], { mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "32323232-3232-4323-8323-323232323232" }));
  assert.equal(gravado.status, 200, JSON.stringify(gravado.body));
  assert.equal(dados(gravado).readbackConfirmed, true);
  const v2 = versoes.at(-1)!;
  const depois = ArticleDNASchema.parse(v2.payload);
  assert.equal(v2.versionNumber, 2);
  assert.equal(v2.previousVersionId, versoes[0].versionId);
  assert.deepEqual(depois.keywordReferences.map(reference => reference.keywordId).sort(), [K_PUB, K_A, K_B, K_C].sort(), "as keywords adicionadas; nada some");
  assert.equal(depois.principalKeywordId, K_PUB, "Travado: a principal fica");
  assert.deepEqual([depois.suggestedSlug, depois.canonical, depois.publishedIdentityRef?.publishedUrl], [antes.suggestedSlug, antes.canonical, antes.publishedIdentityRef?.publishedUrl], "URL, slug e canonical iguais");
  assert.equal(depois.serpAssessmentRef?.versionId, "assessment-pub:base-2", "o parecer da composição nova");
  assert.deepEqual(articleApprovalRevalidationIssues({ version: v2, authorizedBrandId: MARCA }), []);
  // A rota: grava APROVADO pelo writer canônico, com o contexto 'edit' (route.ts:39 e :57) — muda na F1 ('approve' no núcleo).
  const rota = codigoSemComentarios("app/api/arquiteto/published-reinforcement/route.ts");
  assert.match(rota, /const context = await resolvePipelineContext\(\{ brandId: body\.brandId, module: "arquiteto", action: aplicar \? "edit" : "view" \}\);/);
  assert.match(rota, /appendArquitetoArtifact\(context, "article_dna", version, "approved"\)/);
  assert.equal(chamadasDeRede, 0);
});

/* ======================================================================= */
/* C8 · Diferenciação: 2 publicados com 3+ páginas em comum                  */
/* ======================================================================= */

type FixtureDif = { serp: Array<{ keyword: string; lente: string; urls: string[] | null }> };
const SERP_DIF = JSON.parse(readFileSync(new URL("./fixtures/adalbapro-publicados-serp-2026-09-26.json", import.meta.url), "utf8")) as FixtureDif;
const K_CAPTAR = "aaaaaaaa-0000-4000-8000-000000000011", K_ATRAIR = "aaaaaaaa-0000-4000-8000-000000000012", K_ANUNCIOS = "aaaaaaaa-0000-4000-8000-000000000015";
const CAPTAR = "como captar clientes para clínica de estética", ATRAIR = "como atrair pacientes para clínica de estética";
/*
 * 2026-10-17 · PRINCIPAL DE IDENTIDADE (dono): com a URL feita da principal ("como-captar-clientes-para-clinica-de-
 * estetica"), a Livre fica e a diferenciação não a troca (conferido em `arquiteto-diferenciacao-publicados`). Para o C8
 * exercitar a troca do aceite, a página de "captar" tem um slug que não foi feito da principal (fora da identidade).
 */
const SLUG_CAPTAR = "blog/captacao-para-clinica-de-estetica";
const URL_CAPTAR = `https://adalbapro.com.br/${SLUG_CAPTAR}`, URL_ATRAIR = "https://adalbapro.com.br/blog/como-atrair-pacientes-para-clinica-de-estetica";

function referencia(keywordId: string, role: "principal" | "secundaria") {
  return { keywordId, keywordDnaVersionId: `legacy:dna-${keywordId}:v1`, keywordDnaContentHash: `legacy:dna-${keywordId}`, role, strategicContribution: "Sustenta.", coveredIntentions: ["informacional"], requiredTopics: [], excludedTopics: [], classificationOrigin: "system" as const, confidence: 0.7, humanConfirmed: false };
}
function artigoPublicado(articleId: string, principal: string, outras: string[], slug: string): ArticleDNA {
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
async function montarDiferenciacao() {
  const banco = new Banco();
  const kw = (id: string, texto: string, extra: Linha = {}): Linha => ({ id, brand_id: MARCA, keyword: texto, status: "aprovado", volume_search: 10, volume_source: "google_ads", intent: "Comercial", deleted_at: null, analise_semantica: {}, ...extra });
  banco.linhas("minerador_keywords").push(kw(K_CAPTAR, CAPTAR, { analise_semantica: publicada(URL_CAPTAR, "reviewable") }), kw(K_ATRAIR, ATRAIR, { volume_search: null, analise_semantica: publicada(URL_ATRAIR, "locked") }), kw(K_ANUNCIOS, "anúncios para clínica de estética", { volume_search: 320 }));
  const cache = (texto: string) => SERP_CACHE_LENSES.map(lens => entradaDeCache(texto, lens, SERP_DIF.serp.find(linha => linha.keyword === texto && linha.lente === serpCacheLensLabel(lens))?.urls ?? null));
  banco.linhas("editorial_workflow_items").push(...cache(CAPTAR), ...cache(ATRAIR));
  const linhaDeVersao = async (payload: ArticleDNA): Promise<Linha> => {
    const envelope = await createVersionEnvelope({ entityId: payload.articleId, versionNumber: 1, origin: "human", changeReason: "inicial", createdBy: ATOR, payload, createdAt: "2026-09-21T00:00:00.000Z" });
    return { version_id: envelope.versionId, entity_id: envelope.entityId, marca_id: MARCA, artifact_type: "article_dna", version_number: 1, previous_version_id: null, content_hash: envelope.contentHash, origin: "human", change_reason: "inicial", created_at: envelope.createdAt, created_by: ATOR, status: "approved", payload };
  };
  banco.linhas("editorial_artifact_versions").push(
    await linhaDeVersao(artigoPublicado("article-captar", K_CAPTAR, [K_ANUNCIOS], SLUG_CAPTAR)),
    await linhaDeVersao(artigoPublicado("article-atrair", K_ATRAIR, [], "blog/como-atrair-pacientes-para-clinica-de-estetica")),
  );
  return banco;
}
const paginasDe = (texto: string) => new Set(SERP_DIF.serp.filter(linha => linha.keyword === texto).flatMap(linha => linha.urls || []).map(url => normalizeSerpPageUrl(url)!));
const soDe = (de: string, contra: string) => [...new Set(SERP_DIF.serp.filter(linha => linha.keyword === de).flatMap(linha => linha.urls || []))].filter(url => !paginasDe(contra).has(normalizeSerpPageUrl(url)!));
const novas = (prefixo: string, n: number) => Array.from({ length: n }, (_, i) => `https://${prefixo}.com.br/p${i + 1}`);
const SERP_CANDIDATAS: Record<string, string[]> = { "anúncios para clínica de estética": [...soDe(CAPTAR, ATRAIR).slice(0, 3), ...novas("anuncios", 7)], "instagram para clínica de estética": [...soDe(ATRAIR, CAPTAR).slice(0, 3), ...novas("instagram", 7)] };
const VOLUME: Record<string, number> = { "anúncios para clínica de estética": 320, "instagram para clínica de estética": 480 };
function portasFalsas(): Omit<DifferentiationRunPorts, "now"> {
  return {
    async openExecution() {
      return {
        ledgerCapability: false, findUsage: async () => false,
        async googleAdsIdeas(seed) {
          const texto = seed.kind === "keyword_and_url" ? "" : seed.keywords.join(" ");
          const lista = texto.includes("captar") ? ["anúncios para clínica de estética"] : texto.includes("atrair") ? ["instagram para clínica de estética"] : [];
          return { requestId: "r", ideas: lista.map(item => ({ keyword: item, averageMonthlySearches: VOLUME[item], competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null })) };
        },
        async recordGoogleAdsUsage() {},
        async collectSerp(request, opcoes) {
          opcoes.onRequestStarted();
          const urls = SERP_CANDIDATAS[request.query.keyword] || [];
          return { providerRequestId: "s", costUsd: 0.002, digest: { version: "organic-digest-v1", depth: 10, organic: urls.map((url, i) => ({ rank_group: i + 1, url, domain: "d", title: "t", description: "d" })) } as never, organicCount: urls.length, stored: true, error: null };
        },
        async recordDataForSeoUsage() { return "skipped" as const; },
      };
    },
    async googleAdsVolumes(lista) { return new Map(lista.map(item => [normalizeKeyword(item), VOLUME[item] ?? null])); },
    async readFootprints(alvos) { return { footprints: [], missingLenses: alvos.flatMap(alvo => ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ keywordId: alvo.keywordId, lens, reason: "sem entrada no cache" }))) }; },
  };
}

test("C8 · diferenciação de 2 publicados com 3+ páginas em comum: detect → preview → run (fixture) → aceitar = nota 'Diferenciação:', nada some, URL intacta; HOJE grava 'proposed', sem PATCH da cópia de trabalho nem marcador — muda na F5 (R2: aprovado)", async () => {
  const banco = await montarDiferenciacao();
  const deps = (extra: Partial<DifferentiationHandlerDeps> = {}): DifferentiationHandlerDeps => ({ store: { supabase: banco as never, brandId: MARCA, actorUserId: ATOR }, now: () => new Date("2026-10-16T12:00:00Z"), ...extra });
  const deteccao = await handleDifferentiationPlan(deps(), DifferentiationPlanRequestSchema.parse({ brandId: MARCA }));
  const grupos = dados(deteccao).groups as Array<{ groupId: string; members: Array<{ keywordId: string }>; strongPairs: Array<{ sharedPageCount: number }> }>;
  assert.equal(grupos.length, 1);
  assert.ok(grupos[0].strongPairs[0].sharedPageCount >= 3, "3+ páginas em comum no top 10");
  const groupId = grupos[0].groupId;
  const previa = dados(await handleDifferentiationPlan(deps(), DifferentiationPlanRequestSchema.parse({ brandId: MARCA, groupId })));
  const plano = previa.plan as { planHash: string; costRange: { maxUsd: number } };
  const rodada = dados(await handleDifferentiationRun(deps({ openRunPorts: async () => portasFalsas() }), DifferentiationRunRequestSchema.parse({ brandId: MARCA, groupId, operationRequestId: "44444444-4444-4444-8444-444444444444", authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } })));
  assert.equal((rodada.evaluation as { state: string }).state, "differentiated");
  const gravadas: Array<VersionEnvelope<ArticleDNA>> = [];
  const gravar: DifferentiationHandlerDeps["persistArticleVersion"] = async version => {
    gravadas.push(version);
    // O status que a ROTA passa ao writer canônico (cannibalization/apply/route.ts:30): 'proposed'.
    banco.linhas("editorial_artifact_versions").push({ version_id: version.versionId, entity_id: version.entityId, marca_id: MARCA, artifact_type: "article_dna", version_number: version.versionNumber, previous_version_id: version.previousVersionId, content_hash: version.contentHash, origin: version.origin, change_reason: version.changeReason, created_at: version.createdAt, created_by: version.createdBy, status: "proposed", payload: version.payload });
    return { status: "PERSISTED", versionId: version.versionId };
  };
  /*
   * 2026-10-17 · a keyword NOVA ("instagram para clínica de estética", fora da
   * marca) entra NESTE aceite, pelos núcleos do Minerador, só com o aceite dela;
   * a que já existe ("anúncios…") é só lida. SUBSTITUI a F4 (ia como sugestão).
   */
  const semAceite = await handleDifferentiationApply(deps({ persistArticleVersion: gravar }), DifferentiationApplyRequestSchema.parse({ brandId: MARCA, groupId, decision: "accept", evaluationHash: rodada.evaluationHash }));
  assert.equal(semAceite.status, 422);
  assert.equal(semAceite.body.code, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(gravadas.length, 0, "sem o aceite das novas, nada é gravado");
  const chamadasDoMinerador: string[] = [];
  const NOVA = "cccccccc-0000-4000-8000-000000000001";
  const minerador: NonNullable<DifferentiationHandlerDeps["minerador"]> = {
    importKeywords: async pedido => { chamadasDoMinerador.push(`import:${pedido.items.map(item => item.keyword).join("|")}`); banco.linhas("minerador_keywords").push({ id: NOVA, brand_id: MARCA, keyword: pedido.items[0].keyword, status: "pendente", volume_search: null, volume_source: null, intent: null, deleted_at: null, analise_semantica: {} }); return { ok: true, createdIds: [NOVA] }; },
    runLogic: async ids => { chamadasDoMinerador.push(`logic:${ids.join(",")}`); return { ok: true, reason: null }; },
    measureVolume: async ids => { chamadasDoMinerador.push(`volume:${ids.join(",")}`); return { ok: true, reason: null }; },
    readVolumes: async ids => new Map(ids.map(id => [id, { volume: 480, validated: true }])),
    approve: async ids => { chamadasDoMinerador.push(`approve:${ids.join(",")}`); return { ok: true, reason: null }; },
    handoff: async ids => { chamadasDoMinerador.push(`handoff:${ids.join(",")}`); },
  };
  const aceite = await handleDifferentiationApply(deps({ persistArticleVersion: gravar, minerador }), DifferentiationApplyRequestSchema.parse({ brandId: MARCA, groupId, decision: "accept", evaluationHash: rodada.evaluationHash, approveNewKeywords: true }));
  assert.equal(aceite.status, 200, JSON.stringify(aceite.body));
  assert.equal(dados(aceite).readbackConfirmed, true);
  assert.deepEqual(chamadasDoMinerador, ["import:instagram para clínica de estética", `logic:${NOVA}`, `volume:${NOVA}`, `approve:${NOVA}`, `handoff:${NOVA}`], "só a nova, na ordem das telas");
  const atrair = (dados(aceite).pages as Array<{ keywordId: string; formation: Array<{ keywordId: string }> }>).find(pagina => pagina.keywordId === K_ATRAIR)!;
  assert.deepEqual(atrair.formation.map(item => item.keywordId), [NOVA], "a nova segue para 'Colocar no artigo', a mesma etapa da keyword do Minerador fora do artigo");
  const captar = gravadas.find(versao => versao.entityId === "article-captar")!;
  assert.equal(captar.versionNumber, 2);
  assert.ok(captar.payload.differentiation.some(linha => linha.startsWith("Diferenciação: ")), "a nota 'Diferenciação:'");
  assert.ok(Array.isArray(captar.payload.excludedSubjects), "excludedSubjects no DNA (o Redator lê)");
  const ids = captar.payload.keywordReferences.map(reference => reference.keywordId);
  assert.ok([K_CAPTAR, K_ANUNCIOS].every(id => ids.includes(id)), "nada some: a página e a secundária ficam no artigo");
  assert.equal(captar.payload.suggestedSlug, SLUG_CAPTAR);
  assert.equal(captar.payload.canonical, URL_CAPTAR, "URL intacta");
  assert.equal(captar.createdBy, ATOR);
  // HOJE: a rota grava 'proposed' com 'edit'; o núcleo não faz PATCH da cópia de trabalho, não atualiza o marcador e não revalida — muda na F5.
  const rota = codigoSemComentarios("app/api/arquiteto/cannibalization/apply/route.ts");
  assert.match(rota, /appendArquitetoArtifact\(context, "article_dna", version, "proposed"\)/);
  const nucleo = codigoSemComentarios("lib/server/arquiteto-differentiation.ts");
  const aplicar = nucleo.slice(nucleo.indexOf("export async function handleDifferentiationApply("));
  assert.doesNotMatch(aplicar, /handleArchitectWorkspacePatch|patchWorkingCopy|saveArticleFormationMarker|articleApprovalRevalidationIssues/, "HOJE: sem PATCH, sem marcador, sem revalidação");
  // §9 · a melhoria lê a versão 'proposed' como a vigente: a leitura canônica pega a última versão por entidade, sem filtro de status.
  const leitura = codigoSemComentarios("lib/server/arquiteto-workspace.ts");
  assert.match(leitura, /const articleDnasVigentes = latestByEntity\(artifacts\.articleDnas\)\.filter\(version =>\s*version\.payload\.keywordReferences\.some/);
  assert.equal(chamadasDeRede, 0);
});
