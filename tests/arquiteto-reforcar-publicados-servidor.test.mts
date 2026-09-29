import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SERP_CACHE_LENSES, SERP_CACHE_STAGE, SERP_CACHE_SUBJECT_TYPE, normalizeSerpCacheKeyword, serpCacheLensLabel, serpCacheSubjectId, type SerpCacheLens } from "../lib/editorial/serp-cache.ts";
import { ArticleDNASchema, type ArticleDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { CanonicalWorkflowItem } from "../lib/arquiteto/canonical-workspace.ts";
import type { DifferentiationRunPorts } from "../lib/arquiteto/published-differentiation-run.ts";
import { REINFORCEMENT_SEARCH_SUBJECT_TYPE } from "../lib/arquiteto/published-reinforcement-search.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";
import {
  PublishedReinforcementRequestSchema,
  handlePublishedReinforcement,
  inProcessRequestHeaders,
  stableUuid,
  type ArticleSerpReferenceRow,
  type PublishedReinforcementDeps,
  type WorkingCopyPatch,
} from "../lib/server/arquiteto-published-reinforcement.ts";
import { buildCanonicalWorkflowWorkspaceItems } from "../lib/arquiteto/canonical-workspace.ts";
import { PUBLISHED_REINFORCEMENT_SWAP_REASON, recordedPublishedSwapsOf } from "../lib/arquiteto/published-formation-serp.ts";
import { resolveArticleFormationState } from "../lib/arquiteto/article-formation-decision.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { articleApprovalRevalidationIssues } from "../lib/arquiteto/article-approval-revalidation.ts";
import {
  ReinforcementSearchPlanRequestSchema,
  ReinforcementSearchRunRequestSchema,
  handleReinforcementSearchPlan,
  handleReinforcementSearchRun,
} from "../lib/server/arquiteto-published-reinforcement-search.ts";

/**
 * REFORÇAR PUBLICADOS — o servidor (prévia, aplicar e a busca em lote),
 * executado de verdade sobre um banco em memória com a forma do postgrest-js.
 * Roda SÓ pelo `npm run -s test:arquiteto:servidor`. Nenhuma rede, nenhum
 * crédito, nenhum banco remoto: as portas de escrita e do provider são dublês.
 */

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida no teste do servidor do Reforçar publicados.");
}) as typeof fetch;

const MARCA = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const OUTRA_MARCA = "4a737e74-e35d-4a49-8284-87b3f964e495";
const ATOR = "11111111-1111-4111-8111-111111111111";
const TERRITORIO = "territory:0b8f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const NOW = new Date("2026-09-28T12:00:00Z");
const K_PUB = "aaaaaaaa-0000-4000-8000-000000000001";
const K_A = "aaaaaaaa-0000-4000-8000-000000000002";
const K_B = "aaaaaaaa-0000-4000-8000-000000000003";
const K_DENT = "aaaaaaaa-0000-4000-8000-000000000004";
const PUB = "como atrair pacientes para clínica";
const URL_PUB = "https://adalbapro.com.br/blog/como-atrair-pacientes-para-clinica";

type FixtureLinha = { keywordId: string; keyword: string; lenses: Array<{ lens: string; urls: string[] | null }> };
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/arquiteto-serp-mesmo-assunto-adalbapro.json", import.meta.url), "utf8")) as { keywords: FixtureLinha[] };
const urlsDe = (texto: string, lente: string) => FIXTURE.keywords.find(linha => linha.keyword === texto)?.lenses.find(leitura => leitura.lens === lente)?.urls ?? null;

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

const siteOrigin = (url: string) => ({ publicationStatus: "published", sourceUrl: url, resolvedUrl: url, canonicalUrl: url, urlSituation: "canonical_confirmed", lastCheckedAt: "2026-09-20T10:00:00Z", publicationConfirmedBy: ATOR, publicationConfirmedAt: "2026-09-20T10:00:00Z" });
function keyword(id: string, texto: string, extra: Linha = {}, marca = MARCA): Linha {
  return { id, brand_id: marca, keyword: texto, status: "aprovado", volume_search: 20, volume_source: "google_ads", intent: "Informativo", deleted_at: null, lista_id: null, analise_semantica: {}, ...extra };
}
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
const cacheReal = (texto: string, marca = MARCA) => SERP_CACHE_LENSES.map(lens => entradaDeCache(texto, lens, urlsDe(texto, serpCacheLensLabel(lens)), marca));

type Mesa = { itens: CanonicalWorkflowItem[] };
const item = (keywordId: string, payload: Record<string, unknown> = { territoryRef: TERRITORIO }): CanonicalWorkflowItem => ({
  id: stableUuid("item", keywordId), marcaId: MARCA, subjectType: "keyword", subjectId: keywordId, articleId: null, stage: "architect", state: "received",
  sourceEntityId: keywordId, sourceVersionId: null, sourceContentHash: null, payload, lockVersion: 1, createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z",
});

function montar() {
  const banco = new Banco();
  banco.linhas("minerador_keywords").push(
    keyword(K_PUB, PUB, { volume_search: null, volume_source: null, intent: "Comercial", analise_semantica: { site_origin: siteOrigin(URL_PUB), primary_keyword_policy: "reviewable" } }),
    keyword(K_A, "como atrair pacientes"),
    keyword(K_B, "como atrair pacientes para o consultório"),
    keyword(K_DENT, "marketing digital para dentistas", { volume_search: 70, analise_semantica: { site_origin: siteOrigin("https://adalbapro.com.br/blog/marketing-digital-para-dentistas"), primary_keyword_policy: "locked" } }),
    keyword("bbbbbbbb-0000-4000-8000-000000000001", PUB, { analise_semantica: { site_origin: siteOrigin("https://outra.com/x"), primary_keyword_policy: "reviewable" } }, OUTRA_MARCA),
  );
  banco.linhas("editorial_workflow_items").push(...cacheReal(PUB), ...cacheReal("como atrair pacientes"), ...cacheReal("como atrair pacientes para o consultório"), ...cacheReal("marketing digital para dentistas"), ...cacheReal(PUB, OUTRA_MARCA));
  const mesa: Mesa = { itens: [item(K_PUB), item(K_A), item(K_B), item(K_DENT)] };
  const patches: WorkingCopyPatch[][] = [];
  const versoes: Array<VersionEnvelope<ArticleDNA>> = [];
  // O parecer de SERP do artigo publicado, gravado pelo Processar (a evidência que a aprovação exige).
  // A composição que ele observou (2026-09-28): só a página, como os 21 pareceres de produção.
  const pareceres: ArticleSerpReferenceRow[] = [{ candidateRef: `article-candidate:${TERRITORIO}:${K_PUB}`, territoryRef: TERRITORIO, reference: { entityId: "assessment-pub", versionId: "assessment-pub:base-1", contentHash: `sha256:${"b".repeat(64)}` }, composition: { keywordIds: [K_PUB], principalKeywordId: K_PUB } }];
  const vigentes = () => {
    const porEntidade = new Map<string, VersionEnvelope<ArticleDNA>>();
    for (const versao of versoes) if (!porEntidade.has(versao.entityId) || porEntidade.get(versao.entityId)!.versionNumber < versao.versionNumber) porEntidade.set(versao.entityId, versao);
    return [...porEntidade.values()];
  };
  const deps = (extra: Partial<PublishedReinforcementDeps> = {}): PublishedReinforcementDeps => ({
    store: { supabase: banco as never, brandId: MARCA, actorUserId: ATOR },
    now: () => NOW,
    readWorkspace: async () => ({ workflowItems: structuredClone(mesa.itens), keywords: banco.linhas("minerador_keywords").filter(linha => linha.brand_id === MARCA) as never, siloDnas: [], articleDnas: structuredClone(vigentes()) }),
    readArticleSerpReferences: async () => structuredClone(pareceres),
    patchWorkingCopy: async updates => {
      patches.push(updates);
      for (const update of updates) {
        const alvo = mesa.itens.find(entrada => entrada.id === update.workflowItemId)!;
        if (alvo.lockVersion !== update.expectedLock) throw new Error("lock vencido");
        alvo.payload = { ...alvo.payload, ...update.assignment };
        alvo.lockVersion += 1;
      }
    },
    persistArticleVersion: async version => {
      versoes.push(version);
      banco.linhas("editorial_artifact_versions").push({ version_id: version.versionId, entity_id: version.entityId, marca_id: MARCA, artifact_type: "article_dna", version_number: version.versionNumber, previous_version_id: version.previousVersionId, content_hash: version.contentHash, origin: version.origin, change_reason: version.changeReason, created_at: version.createdAt, created_by: version.createdBy, status: "approved", payload: version.payload });
      return { status: "PERSISTED", versionId: version.versionId };
    },
    ...extra,
  });
  return { banco, mesa, patches, versoes, deps, pareceres };
}

const pedido = (extra: Record<string, unknown> = {}) => PublishedReinforcementRequestSchema.parse({ brandId: MARCA, mode: "preview", pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A, K_B] }], ...extra });
const dados = (outcome: { body: Record<string, unknown> }) => outcome.body.data as Record<string, unknown>;
const tomDe = (data: Record<string, unknown>) => data.tone;

/* ---------------------------------- testes ---------------------------------- */

test("prévia: grátis e sem gravar — primeiro ArticleDNA do publicado, as duas de 7 páginas e o hash", async () => {
  const { banco, patches, versoes, deps } = montar();
  const saida = await handlePublishedReinforcement(deps(), pedido());
  assert.equal(saida.status, 200, JSON.stringify(saida.body));
  const data = dados(saida);
  const [plano] = data.pages as Array<{ status: string; dna: { mode: string }; add: Array<{ keywordId: string; level: string; sharedPageCount: number }> }>;
  assert.equal(plano.status, "ready");
  assert.equal(plano.dna.mode, "first");
  assert.deepEqual(plano.add.map(item => [item.keywordId, item.level, item.sharedPageCount]), [[K_A, "strong", 7], [K_B, "strong", 7]]);
  assert.match(String(data.decisionHash), /^sha256:[0-9a-f]{64}$/);
  assert.match(String(data.message), /Nada foi gravado ainda\. Para gravar: confirme "Reforçar publicados"/);
  assert.equal(data.written, false);
  assert.ok(banco.log.every(consulta => consulta.op === "select"), "a prévia não grava");
  assert.equal(patches.length + versoes.length, 0);
  // R4: toda consulta filtra a marca.
  for (const consulta of banco.log) {
    const coluna = consulta.tabela === "minerador_keywords" ? "brand_id" : "marca_id";
    assert.ok(consulta.filtros.some(filtro => filtro.coluna === coluna && filtro.valor === MARCA), `${consulta.tabela} sem filtro de marca`);
  }
});

test("aplicar: hash exigido; com o hash, composição e ArticleDNA aprovados com releitura, URL/slug/canonical do site", async () => {
  const { banco, mesa, patches, versoes, deps, pareceres } = montar();
  // O parecer gravado descreve a composição que vai ser gravada (publicada + as duas).
  pareceres[0].composition = { keywordIds: [K_PUB, K_A, K_B], principalKeywordId: K_PUB };
  const previa = dados(await handlePublishedReinforcement(deps(), pedido()));
  const errado = await handlePublishedReinforcement(deps(), pedido({ mode: "apply", decisionHash: "sha256:outro", operationRequestId: "33333333-3333-4333-8333-333333333333" }));
  assert.equal(errado.status, 409);
  assert.equal(errado.body.code, "PREVIEW_CHANGED");
  assert.equal(patches.length + versoes.length, 0, "hash errado: nada gravado");

  const certo = await handlePublishedReinforcement(deps(), pedido({ mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "33333333-3333-4333-8333-333333333333" }));
  assert.equal(certo.status, 200, JSON.stringify(certo.body));
  const data = dados(certo);
  assert.equal(data.readbackConfirmed, true, JSON.stringify(data));
  assert.equal(data.tone, "success");
  assert.match(String(data.message), /^1 artigo publicado gravado e confirmados na releitura, com 2 keywords novas nos artigos\. URL, slug e canonical não mudaram\.$/);
  // Composição: o mesmo articleFormationRef nos três itens, principal = a publicada.
  const refs = new Set(mesa.itens.filter(entrada => [K_PUB, K_A, K_B].includes(entrada.subjectId)).map(entrada => entrada.payload.articleFormationRef));
  assert.equal(refs.size, 1);
  assert.match(String([...refs][0]), /^article-formation:/);
  assert.equal((mesa.itens.find(entrada => entrada.subjectId === K_PUB)!.payload.articleFormationDecision as { role: string }).role, "principal");
  // ArticleDNA v1: id = a keyword publicada, identidade do site.
  assert.equal(versoes.length, 1);
  const dna = ArticleDNASchema.parse(versoes[0].payload);
  assert.equal(versoes[0].entityId, K_PUB);
  assert.equal(versoes[0].versionNumber, 1);
  assert.equal(dna.principalKeywordId, K_PUB);
  assert.deepEqual(dna.keywordReferences.map(reference => reference.keywordId), [K_PUB, K_A, K_B]);
  assert.equal(dna.suggestedSlug, "como-atrair-pacientes-para-clinica");
  assert.equal(dna.canonical, URL_PUB);
  assert.equal(dna.publishedIdentityRef?.publishedUrl, URL_PUB);
  assert.equal(dna.territoryRef, TERRITORIO);
  // Aprovado pela confirmação humana: arquitetura confirmada e a evidência SERP do artigo; a portaria da rota de artefatos passa.
  assert.equal(dna.architectureStatus, "architecture_confirmed");
  assert.equal(dna.serpAssessmentRef?.versionId, "assessment-pub:base-1");
  assert.deepEqual(articleApprovalRevalidationIssues({ version: versoes[0], authorizedBrandId: MARCA }), []);

  // A tabela da mesa: a composição gravada reagrupa o publicado com as 3 keywords (não "1 keyword").
  const linhas = buildCanonicalWorkflowWorkspaceItems(structuredClone(mesa.itens), banco.linhas("minerador_keywords").filter(linha => linha.brand_id === MARCA) as never, MARCA) as unknown as Array<Record<string, unknown>>;
  const universo = buildArticleFormationUniverse({
    siloRef: TERRITORIO, siloLabel: "Captação", siloSlug: null,
    keywords: linhas.map(linha => ({
      keywordId: String(linha.id), keyword: String(linha.keyword), intent: null, volume: (linha.volume_search as number | null) ?? null, kgr: null, entity: null, problem: null,
      isPublished: String(linha.id) === K_PUB || String(linha.id) === K_DENT,
      humanFormationRef: resolveArticleFormationState(linha).formationRef, humanRole: resolveArticleFormationState(linha).decision?.role ?? null,
    }) as ArticleFormationKeyword),
  });
  const doPublicado = universo.candidates.find(candidato => candidato.principalKeywordId === K_PUB)!;
  assert.deepEqual(doPublicado.keywords.map(item => item.keywordId), [K_PUB, K_A, K_B], "a linha do publicado passa a contar 3 keywords");

  // De novo, com nova prévia: nada muda (sem versão nova, sem patch).
  const denovo = dados(await handlePublishedReinforcement(deps(), pedido()));
  assert.equal((denovo.pages as Array<{ status: string }>)[0].status, "unchanged");
  assert.equal(chamadasDeRede, 0);
});

test("keyword nova: sem o aceite de aprovar no Minerador é recusada; com ele, a ordem dos núcleos e a releitura", async () => {
  const { banco, mesa, versoes, deps, pareceres } = montar();
  // O resultado gravado da busca em lote desta página.
  banco.linhas("editorial_workflow_items").push({ id: "busca-1", lock_version: 1, marca_id: MARCA, subject_type: REINFORCEMENT_SEARCH_SUBJECT_TYPE, stage: "architect", subject_id: "rs-0000000000000001", state: "proposed", payload: { run: { operationRequestId: "55555555-5555-4555-8555-555555555555", executedAt: "2026-09-28T11:00:00Z", pages: [{ keywordId: K_PUB, suggestions: [{ candidateId: "cand:captar pacientes clinica", keyword: "captar pacientes clínica", normalizedKeyword: "captar pacientes clinica", adsVolume: 50, level: "strong", sharedPageCount: 4, origins: ["ads_url_seed"], evidence: [] }] }] } } });
  const passos: string[] = [];
  const NOVA = "aaaaaaaa-0000-4000-8000-000000000009";
  const minerador: NonNullable<PublishedReinforcementDeps["minerador"]> = {
    importKeywords: async request => {
      passos.push(`import:${request.subjectPhrase}:${request.items.map(item => item.keyword).join("|")}`);
      assert.equal(request.subjectKeywordId, null);
      banco.linhas("minerador_keywords").push(keyword(NOVA, "captar pacientes clínica", { status: "bruto", volume_search: null, volume_source: null }));
      return { ok: true };
    },
    runLogic: async ids => { passos.push(`logica:${ids.join(",")}`); return { ok: true, reason: null }; },
    measureVolume: async ids => { passos.push(`volume:${ids.join(",")}`); Object.assign(banco.linhas("minerador_keywords").find(linha => linha.id === NOVA)!, { volume_search: 50, volume_source: "google_ads" }); return { ok: true, reason: null }; },
    readVolumes: async ids => new Map(ids.map(id => [id, { volume: 50, validated: true }])),
    approve: async ids => { passos.push(`aprovar:${ids.join(",")}`); return { ok: true, reason: null }; },
    handoff: async ids => { passos.push(`enviar:${ids.join(",")}`); mesa.itens.push(item(NOVA, {})); },
  };
  const base = { pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A], newKeywords: ["captar pacientes clínica"] }] };
  const previa = dados(await handlePublishedReinforcement(deps({ minerador }), pedido(base)));
  assert.match(String(previa.approvalText), /você aprova estas keywords no Minerador/);
  const semAceite = await handlePublishedReinforcement(deps({ minerador }), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "66666666-6666-4666-8666-666666666666" }));
  assert.equal(semAceite.status, 422);
  assert.equal(semAceite.body.code, "HUMAN_APPROVAL_REQUIRED");
  assert.deepEqual(passos, []);

  const comAceite = await handlePublishedReinforcement(deps({ minerador }), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "66666666-6666-4666-8666-666666666666", approveNewKeywords: true }));
  assert.equal(comAceite.status, 200, JSON.stringify(comAceite.body));
  assert.deepEqual(passos, [`import:${PUB}:captar pacientes clínica`, `logica:${NOVA}`, `volume:${NOVA}`, `aprovar:${NOVA}`, `enviar:${NOVA}`]);
  assert.equal(dados(comAceite).readbackConfirmed, true, JSON.stringify(dados(comAceite)));
  // 2026-09-28: a keyword nova nunca foi confrontada pelo parecer gravado. A mesa
  // (Minerador e composição) fica gravada; o ArticleDNA espera o parecer desta composição.
  assert.equal(versoes.length, 0, "nenhum ArticleDNA com o parecer de outra composição");
  assert.match(String(dados(comAceite).message), /O ArticleDNA ainda não foi gravado: Entram keywords novas: o parecer da SERP gravado não as confrontou. Próximo passo: "Processar artigos"/);
  const formacao = String(mesa.itens.find(entrada => entrada.subjectId === K_PUB)!.payload.articleFormationRef);
  assert.equal(mesa.itens.find(entrada => entrada.subjectId === NOVA)!.payload.articleFormationRef, formacao);
  // O "Processar artigos" (cache) grava o parecer da formação com a composição nova.
  pareceres.push({ candidateRef: formacao, territoryRef: TERRITORIO, reference: { entityId: "assessment-formacao", versionId: "assessment-formacao:base-2", contentHash: `sha256:${"e".repeat(64)}` }, composition: { keywordIds: [K_PUB, K_A, NOVA], principalKeywordId: K_PUB } });
  const segunda = dados(await handlePublishedReinforcement(deps({ minerador }), pedido({ pages: [{ publishedKeywordId: K_PUB }] })));
  const [planoSegundo] = segunda.pages as Array<{ status: string; dna: { mode: string }; lines: string[] }>;
  assert.equal(planoSegundo.status, "ready");
  assert.equal(planoSegundo.dna.mode, "first");
  const gravada = dados(await handlePublishedReinforcement(deps({ minerador }), pedido({ pages: [{ publishedKeywordId: K_PUB }], mode: "apply", decisionHash: segunda.decisionHash, operationRequestId: "67676767-6767-4676-8676-676767676767" })));
  assert.equal(gravada.readbackConfirmed, true, JSON.stringify(gravada));
  assert.equal(passos.length, 5, "a segunda confirmação não passa de novo pelo Minerador");
  const dna = ArticleDNASchema.parse(versoes.at(-1)!.payload);
  assert.equal(dna.serpAssessmentRef?.versionId, "assessment-formacao:base-2", "o DNA leva o parecer DESTA composição");
  assert.deepEqual(dna.keywordReferences.map(reference => reference.keywordId), [K_PUB, K_A, NOVA]);
  // A keyword nova entrou no Silo do publicado.
  assert.equal(mesa.itens.find(entrada => entrada.subjectId === NOVA)!.payload.territoryRef, TERRITORIO);
});

test("um passo falha: para com o motivo, nada depois dele é gravado", async () => {
  const { banco, patches, versoes, deps } = montar();
  banco.linhas("editorial_workflow_items").push({ id: "busca-2", lock_version: 1, marca_id: MARCA, subject_type: REINFORCEMENT_SEARCH_SUBJECT_TYPE, stage: "architect", subject_id: "rs-0000000000000002", state: "proposed", payload: { run: { operationRequestId: "55555555-5555-4555-8555-555555555556", executedAt: "2026-09-28T11:00:00Z", pages: [{ keywordId: K_PUB, suggestions: [{ keyword: "captar pacientes clínica", normalizedKeyword: normalizeKeyword("captar pacientes clínica"), adsVolume: 50, level: "strong", sharedPageCount: 4, origins: ["ads_url_seed"], evidence: [] }] }] } } });
  const minerador: NonNullable<PublishedReinforcementDeps["minerador"]> = {
    importKeywords: async () => { banco.linhas("minerador_keywords").push(keyword("aaaaaaaa-0000-4000-8000-00000000000a", "captar pacientes clínica")); return { ok: true }; },
    runLogic: async () => ({ ok: false, reason: "a releitura não confirmou a Lógica" }),
    measureVolume: async () => { throw new Error("não devia chegar aqui"); },
    readVolumes: async () => new Map(),
    approve: async () => { throw new Error("não devia chegar aqui"); },
    handoff: async () => { throw new Error("não devia chegar aqui"); },
  };
  const base = { pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A], newKeywords: ["captar pacientes clínica"] }] };
  const previa = dados(await handlePublishedReinforcement(deps({ minerador }), pedido(base)));
  const saida = await handlePublishedReinforcement(deps({ minerador }), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "77777777-7777-4777-8777-777777777777", approveNewKeywords: true }));
  const data = dados(saida);
  assert.equal(data.written, false);
  assert.equal(data.readbackConfirmed, false);
  assert.equal(data.tone, "warning");
  assert.match(String(data.message), /Parou antes do fim: "como atrair pacientes para clínica": a Lógica não foi confirmada/);
  assert.match(String(data.message), /já ficou gravado: 1 keyword\(s\) importada\(s\) no Minerador \("captar pacientes clínica"\)/, "o import já gravou: é dito");
  assert.equal(patches.length + versoes.length, 0, "nem composição nem ArticleDNA");
});

test("parada no meio: os publicados seguintes são nomeados como não tentados; o que falhou diz o que já ficou gravado", async () => {
  const { mesa, pareceres, deps } = montar();
  pareceres[0].composition = { keywordIds: [K_PUB, K_A], principalKeywordId: K_PUB };
  pareceres.push({ candidateRef: `article-candidate:${TERRITORIO}:${K_DENT}`, territoryRef: TERRITORIO, reference: { entityId: "assessment-dent", versionId: "assessment-dent:base", contentHash: `sha256:${"c".repeat(64)}` }, composition: { keywordIds: [K_DENT], principalKeywordId: K_DENT } });
  const base = { pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A] }, { publishedKeywordId: K_DENT }] };
  const previa = dados(await handlePublishedReinforcement(deps(), pedido(base)));
  assert.deepEqual((previa.pages as Array<{ status: string }>).map(page => page.status), ["ready", "ready"]);
  let chamadas = 0;
  const saida = dados(await handlePublishedReinforcement(deps({
    patchWorkingCopy: async updates => {
      chamadas += 1;
      for (const update of updates) { const alvo = mesa.itens.find(entrada => entrada.id === update.workflowItemId)!; alvo.payload = { ...alvo.payload, ...update.assignment }; alvo.lockVersion += 1; }
    },
    persistArticleVersion: async () => { throw new Error("banco fora do ar"); },
  }), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "12121212-1212-4121-8121-121212121212" })));
  assert.equal(chamadas, 1);
  assert.equal(tomDe(saida), "warning");
  assert.match(String(saida.message), /Não gravado: "como atrair pacientes para clínica" \(o ArticleDNA não foi gravado: banco fora do ar\) — já ficou gravado: a composição do artigo na mesa \(2 keywords\)/);
  assert.match(String(saida.message), /Não tentados \(nada foi gravado neles\): "marketing digital para dentistas"/);
  assert.deepEqual(saida.notAttempted, [{ publishedKeywordId: K_DENT, keyword: "marketing digital para dentistas" }]);
});

test("aprovação exige a evidência SERP do artigo: sem parecer gravado, a prévia recusa com o motivo; o papel humano de reforço e o Silo de quem já estava no artigo são preservados", async () => {
  const semParecer = montar();
  semParecer.pareceres.length = 0;
  const [recusado] = dados(await handlePublishedReinforcement(semParecer.deps(), pedido({ pages: [{ publishedKeywordId: K_PUB }] }))).pages as Array<{ status: string; refusal: string }>;
  assert.equal(recusado.status, "refused");
  assert.match(recusado.refusal, /ainda não tem parecer da SERP gravado\. Rode "Processar artigos" para este artigo \(cache primeiro/);
  // Com reforço marcado, a mesa é gravada e o ArticleDNA espera o parecer (nunca aprovado sem ele).
  const [adiado] = dados(await handlePublishedReinforcement(semParecer.deps(), pedido())).pages as Array<{ status: string; dnaDeferred: string | null }>;
  assert.equal(adiado.status, "ready");
  assert.match(String(adiado.dnaDeferred), /ainda não tem parecer da SERP gravado/);

  // K_A já está na formação do publicado como REFORÇO (decisão humana) e noutro Silo.
  const { mesa, patches, versoes, deps, pareceres } = montar();
  pareceres[0].composition = { keywordIds: [K_PUB, K_A, K_B], principalKeywordId: K_PUB };
  const ref = "article-formation:11111111-2222-4333-8444-555555555555";
  const OUTRO_SILO = "territory:99999999-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  const decisao = (role: string) => ({ operation: "move", role, reason: "humano", source: "human", decidedAt: "2026-09-20T00:00:00Z" });
  Object.assign(mesa.itens.find(entrada => entrada.subjectId === K_PUB)!.payload, { articleFormationRef: ref, articleFormationDecision: decisao("principal") });
  Object.assign(mesa.itens.find(entrada => entrada.subjectId === K_A)!.payload, { articleFormationRef: ref, articleFormationDecision: decisao("reforco"), territoryRef: OUTRO_SILO });
  const base = { pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_B] }] };
  pedido(base);
  const previa = dados(await handlePublishedReinforcement(deps(), pedido(base)));
  const aplicado = dados(await handlePublishedReinforcement(deps(), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "13131313-1313-4131-8131-131313131313" })));
  assert.equal(aplicado.readbackConfirmed, true, JSON.stringify(aplicado));
  const itemA = mesa.itens.find(entrada => entrada.subjectId === K_A)!;
  assert.equal((itemA.payload.articleFormationDecision as { role: string }).role, "reforco", "a decisão humana de reforço não é regravada");
  assert.equal(itemA.payload.territoryRef, OUTRO_SILO, "quem já estava no artigo não muda de Silo sem aviso");
  assert.ok(patches.flat().every(patch => patch.workflowItemId !== itemA.id), "nenhum patch no item que já estava na formação");
  const dna = ArticleDNASchema.parse(versoes.at(-1)!.payload);
  assert.deepEqual(dna.narrativeReinforcementIds, [K_A], "o reforço narrativo entra no ArticleDNA como decidido");
  assert.deepEqual(dna.secondaryKeywordIds, [K_B]);
});

test("formação do publicado com outra principal decidida, ou keyword já no ArticleDNA de outro artigo: recusado antes de gravar", async () => {
  const { banco, mesa, versoes, deps } = montar();
  // Posto Travado: a principal decidida na mesa não pode virar troca (a régua recusa).
  Object.assign(banco.linhas("minerador_keywords").find(linha => linha.id === K_PUB)!, { analise_semantica: { site_origin: siteOrigin(URL_PUB), primary_keyword_policy: "locked" } });
  const ref = "article-formation:21111111-2222-4333-8444-555555555555";
  const decisao = (role: string) => ({ operation: "move", role, reason: "humano", source: "human", decidedAt: "2026-09-20T00:00:00Z" });
  Object.assign(mesa.itens.find(entrada => entrada.subjectId === K_PUB)!.payload, { articleFormationRef: ref, articleFormationDecision: decisao("secundaria") });
  Object.assign(mesa.itens.find(entrada => entrada.subjectId === K_A)!.payload, { articleFormationRef: ref, articleFormationDecision: decisao("principal") });
  const [plano] = dados(await handlePublishedReinforcement(deps(), pedido({ pages: [{ publishedKeywordId: K_PUB }] }))).pages as Array<{ status: string; refusal: string }>;
  assert.equal(plano.status, "refused");
  assert.match(plano.refusal, /"como atrair pacientes" como principal, por decisão sua/);

  // K_B já está no ArticleDNA vigente de outro artigo.
  const outro = montar();
  outro.versoes.push({ versionId: "v-outro", entityId: "artigo-outro", versionNumber: 1, previousVersionId: null, contentHash: `sha256:${"d".repeat(64)}`, origin: "human", changeReason: "x", createdAt: NOW.toISOString(), createdBy: ATOR, payload: { brandId: MARCA, keywordReferences: [{ keywordId: K_B }] } as never });
  const [comAlheia] = dados(await handlePublishedReinforcement(outro.deps(), pedido())).pages as Array<{ add: Array<{ keywordId: string }>; refused: Array<{ keyword: string; reason: string }> }>;
  assert.deepEqual(comAlheia.add.map(item => item.keywordId), [K_A]);
  assert.match(comAlheia.refused.find(item => item.keyword === "como atrair pacientes para o consultório")!.reason, /Já está no ArticleDNA de outro artigo/);
  assert.equal(versoes.length, 0);
});

test("keywords novas sem volume do Google Ads: sucessora igual não grava versão, e a mensagem diz o que ficou no Minerador", async () => {
  const { banco, versoes, deps } = montar();
  // O publicado já tem o ArticleDNA v1 (gravado pelo Reforçar).
  const primeira = dados(await handlePublishedReinforcement(deps(), pedido({ pages: [{ publishedKeywordId: K_PUB }] })));
  await handlePublishedReinforcement(deps(), pedido({ pages: [{ publishedKeywordId: K_PUB }], mode: "apply", decisionHash: primeira.decisionHash, operationRequestId: "14141414-1414-4141-8141-141414141414" }));
  assert.equal(versoes.length, 1);
  banco.linhas("editorial_workflow_items").push({ id: "busca-9", lock_version: 1, marca_id: MARCA, subject_type: REINFORCEMENT_SEARCH_SUBJECT_TYPE, stage: "architect", subject_id: "rs-0000000000000009", state: "proposed", payload: { run: { operationRequestId: "55555555-5555-4555-8555-555555555559", executedAt: "2026-09-28T11:00:00Z", pages: [{ keywordId: K_PUB, suggestions: [{ keyword: "captar pacientes clínica", normalizedKeyword: normalizeKeyword("captar pacientes clínica"), adsVolume: 50, level: "strong", sharedPageCount: 4, origins: ["ads_url_seed"], evidence: [] }] }] } } });
  const NOVA = "aaaaaaaa-0000-4000-8000-00000000000e";
  let carregou = 0;
  const loadMinerador = async (): Promise<NonNullable<PublishedReinforcementDeps["minerador"]>> => {
    carregou += 1;
    return {
      importKeywords: async () => { banco.linhas("minerador_keywords").push(keyword(NOVA, "captar pacientes clínica", { status: "bruto", volume_search: null, volume_source: null })); return { ok: true }; },
      runLogic: async () => ({ ok: true, reason: null }),
      measureVolume: async () => ({ ok: true, reason: null }),
      readVolumes: async ids => new Map(ids.map(id => [id, { volume: 0, validated: false }])),
      approve: async () => { throw new Error("sem volume não é aprovada"); },
      handoff: async () => { throw new Error("sem volume não é enviada"); },
    };
  };
  const base = { pages: [{ publishedKeywordId: K_PUB, newKeywords: ["captar pacientes clínica"] }] };
  const previa = dados(await handlePublishedReinforcement(deps({ loadMinerador }), pedido(base)));
  assert.equal(carregou, 0, "a prévia não confere permissão do Minerador");
  const saida = dados(await handlePublishedReinforcement(deps({ loadMinerador }), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "15151515-1515-4151-8151-151515151515", approveNewKeywords: true })));
  assert.equal(carregou, 1, "o Minerador só é montado quando a prévia confirmada tem keyword nova");
  assert.equal(versoes.length, 1, "sucessora igual à vigente: nenhuma versão nova");
  assert.equal(saida.written, false);
  assert.equal(saida.tone, "info");
  assert.match(String(saida.message), /o ArticleDNA não mudou\. Gravado só: 1 keyword\(s\) importada\(s\) no Minerador \("captar pacientes clínica"\); a Lógica delas; o Volume do Google Ads delas\./);
  assert.match(String(saida.message), /Ficaram de fora: "captar pacientes clínica" \(o Google Ads não confirmou volume: ficou no Minerador, fora do artigo\)/);
  assert.doesNotMatch(String(saida.message), /já tinham tudo/);

  // Sem keyword nova confirmada, o Minerador nem é montado (sem 403 desnecessário).
  let semNova = 0;
  const outra = dados(await handlePublishedReinforcement(deps({ loadMinerador: async () => { semNova += 1; throw new Error("403"); } }), pedido({ pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A] }] })));
  await handlePublishedReinforcement(deps({ loadMinerador: async () => { semNova += 1; throw new Error("403"); } }), pedido({ pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A] }], mode: "apply", decisionHash: outra.decisionHash, operationRequestId: "16161616-1616-4161-8161-161616161616" }));
  assert.equal(semNova, 0);
});

test("keyword que já existe no Minerador em outro estado do Arquiteto não é reenviada; chamadas em processo levam só a sessão", async () => {
  const { banco, mesa, deps } = montar();
  const EXISTENTE = "aaaaaaaa-0000-4000-8000-00000000000f";
  banco.linhas("minerador_keywords").push(keyword(EXISTENTE, "captar pacientes clínica"));
  banco.linhas("editorial_workflow_items").push({ id: "item-retirado", lock_version: 2, marca_id: MARCA, subject_type: "keyword", stage: "architect", subject_id: EXISTENTE, state: "returned", payload: {} });
  banco.linhas("editorial_workflow_items").push({ id: "busca-10", lock_version: 1, marca_id: MARCA, subject_type: REINFORCEMENT_SEARCH_SUBJECT_TYPE, stage: "architect", subject_id: "rs-000000000000000a", state: "proposed", payload: { run: { operationRequestId: "55555555-5555-4555-8555-55555555555a", executedAt: "2026-09-28T11:00:00Z", pages: [{ keywordId: K_PUB, suggestions: [{ keyword: "captar pacientes clínica", normalizedKeyword: normalizeKeyword("captar pacientes clínica"), adsVolume: 50, level: "strong", sharedPageCount: 4, origins: ["ads_url_seed"], evidence: [], existingKeywordId: EXISTENTE }] }] } } });
  const [plano] = dados(await handlePublishedReinforcement(deps(), pedido({ pages: [{ publishedKeywordId: K_PUB, newKeywords: ["captar pacientes clínica"] }] }))).pages as Array<{ create: unknown[]; refused: Array<{ reason: string }> }>;
  assert.deepEqual(plano.create, []);
  assert.match(plano.refused[0].reason, /Está no Arquiteto em outro estado \("returned"\): ela não é reenviada sozinha/);
  assert.equal(mesa.itens.length, 4);

  const cabecalhos = inProcessRequestHeaders(new Headers({ cookie: "sb=1", "content-length": "999", "content-type": "text/plain", "x-outro": "y" }));
  assert.equal(cabecalhos.get("cookie"), "sb=1");
  assert.equal(cabecalhos.get("content-type"), "application/json");
  assert.equal(cabecalhos.get("content-length"), null, "o tamanho do corpo original não vai para outro corpo");
  assert.equal(cabecalhos.get("x-outro"), null);
  const rota = readFileSync("app/api/arquiteto/published-reinforcement/route.ts", "utf8");
  assert.doesNotMatch(rota, /headers: request\.headers/);
  assert.equal((rota.match(/headers: cabecalhos/g) || []).length, 2);
});

test("busca em lote: publicados que disputam o mesmo assunto vão à diferenciação; prévia, rodada paga e a mesma rodada sem pagar", async () => {
  const { banco } = montar();
  // Mais um publicado que divide 5 páginas com o de "clínica" (canibalização).
  const K_CONS = "aaaaaaaa-0000-4000-8000-00000000000c";
  banco.linhas("minerador_keywords").push(keyword(K_CONS, "como atrair clientes para consultório", { volume_search: null, analise_semantica: { site_origin: siteOrigin("https://adalbapro.com.br/blog/como-atrair-clientes-para-consultorio"), primary_keyword_policy: "locked" } }));
  banco.linhas("editorial_workflow_items").push(...cacheReal("como atrair clientes para consultório"));
  const store = { supabase: banco as never, brandId: MARCA, actorUserId: ATOR };
  const plano = await handleReinforcementSearchPlan({ store, now: () => NOW }, ReinforcementSearchPlanRequestSchema.parse({ brandId: MARCA, pageKeywordIds: [K_PUB, K_CONS, K_DENT] }));
  assert.equal(plano.status, 200, JSON.stringify(plano.body));
  const data = dados(plano);
  assert.deepEqual((data.differentiation as Array<{ keywordIds: string[] }>).map(grupo => [...grupo.keywordIds].sort()), [[K_PUB, K_CONS].sort()]);
  const previa = data.plan as { planHash: string; costRange: { maxUsd: number }; pages: Array<{ keywordId: string }> };
  assert.deepEqual(previa.pages.map(page => page.keywordId), [K_DENT], "só o sem par segue a regra de reforço");
  assert.equal(previa.costRange.maxUsd, 0.07, "1 página × 5 candidatas × US$ 0,014");
  assert.throws(() => ReinforcementSearchRunRequestSchema.parse({ brandId: MARCA, searchId: data.searchId, operationRequestId: "88888888-8888-4888-8888-888888888888", authorizedPlan: { planHash: previa.planHash, maxCostUsd: 1.5 } }), "o teto de US$ 1,00 é conferido no pedido");

  let pagas = 0;
  const ports: Omit<DifferentiationRunPorts, "now"> = {
    async openExecution() {
      return {
        ledgerCapability: false,
        findUsage: async () => false,
        googleAdsIdeas: async () => ({ requestId: "r", ideas: [{ keyword: "marketing para dentistas", averageMonthlySearches: 210, competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null }] }),
        recordGoogleAdsUsage: async () => undefined,
        async collectSerp(request, opcoes) {
          opcoes.onRequestStarted();
          pagas += 1;
          const urls = (FIXTURE.keywords.find(linha => linha.keyword === request.query.keyword)?.lenses.flatMap(leitura => leitura.urls || []) || []).slice(0, 10);
          return { providerRequestId: "s", costUsd: 0.002, digest: { version: "organic-digest-v1", depth: 10, organic: urls.map((url, i) => ({ rank_group: i + 1, url, domain: "d", title: "t", description: "d" })) } as never, organicCount: urls.length, stored: true, error: null };
        },
        recordDataForSeoUsage: async () => "skipped" as const,
      };
    },
    googleAdsVolumes: async lista => new Map(lista.map(item => [normalizeKeyword(item), 210])),
    readFootprints: async alvos => ({ footprints: [], missingLenses: alvos.flatMap(alvo => ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ keywordId: alvo.keywordId, lens, reason: "sem cache" }))) }),
  };
  const corpo = ReinforcementSearchRunRequestSchema.parse({ brandId: MARCA, searchId: data.searchId, operationRequestId: "88888888-8888-4888-8888-888888888888", authorizedPlan: { planHash: previa.planHash, maxCostUsd: previa.costRange.maxUsd } });
  const rodada = await handleReinforcementSearchRun({ store, now: () => NOW, openRunPorts: async () => ports }, corpo);
  assert.equal(rodada.status, 200, JSON.stringify(rodada.body));
  const resultado = dados(rodada);
  const [pagina] = resultado.pages as Array<{ keywordId: string; suggestions: Array<{ keyword: string; level: string }> }>;
  assert.deepEqual(pagina.suggestions.map(item => [item.keyword, item.level]), [["marketing para dentistas", "strong"]]);
  assert.equal(resultado.paid, true);
  assert.equal(pagas, 4);
  const repetida = await handleReinforcementSearchRun({ store, now: () => NOW, openRunPorts: async () => ports }, corpo);
  assert.equal(dados(repetida).replayed, true);
  assert.equal(pagas, 4, "a mesma rodada devolve o gravado, sem pagar");
  const outra = await handleReinforcementSearchRun({ store, now: () => NOW, openRunPorts: async () => ports }, { ...corpo, operationRequestId: "99999999-9999-4999-8999-999999999999" });
  assert.equal(outra.body.code, "REINFORCEMENT_ALREADY_RUN");
  const linha = banco.linhas("editorial_workflow_items").find(entrada => entrada.subject_type === REINFORCEMENT_SEARCH_SUBJECT_TYPE)!;
  assert.equal(linha.state, "proposed");
  assert.equal(linha.stage, "architect");

  // Rodada paga que PARA no meio: a mesma prévia não roda de novo com outro id (o teto vale por rodada).
  const nova = await handleReinforcementSearchPlan({ store, now: () => NOW }, ReinforcementSearchPlanRequestSchema.parse({ brandId: MARCA, pageKeywordIds: [K_DENT], replaceResult: true }));
  const planoNovo = dados(nova).plan as { planHash: string; costRange: { maxUsd: number } };
  // Paga a SERP e, depois, a rodada quebra (o relógio falha): a exceção sai do meio da rodada.
  let quebrou = false;
  const agoraQueQuebra = () => { if (quebrou) throw new Error("falha no meio da rodada"); return NOW; };
  const quebradas: Omit<DifferentiationRunPorts, "now"> = { ...ports, async openExecution() { const execucao = await ports.openExecution(); return { ...execucao, async collectSerp(request, opcoes) { const coleta = await execucao.collectSerp(request, opcoes); quebrou = true; return coleta; } }; } };
  const corpoNovo = ReinforcementSearchRunRequestSchema.parse({ brandId: MARCA, searchId: dados(nova).searchId, operationRequestId: "17171717-1717-4171-8171-171717171717", authorizedPlan: { planHash: planoNovo.planHash, maxCostUsd: planoNovo.costRange.maxUsd } });
  await assert.rejects(handleReinforcementSearchRun({ store, now: agoraQueQuebra, openRunPorts: async () => quebradas }, corpoNovo));
  assert.ok(quebrou, "a SERP foi paga antes da quebra");
  const antes = pagas;
  const outraTentativa = await handleReinforcementSearchRun({ store, now: () => NOW, openRunPorts: async () => ports }, { ...corpoNovo, operationRequestId: "18181818-1818-4181-8181-181818181818" });
  assert.equal(outraTentativa.status, 409);
  assert.equal(outraTentativa.body.code, "REINFORCEMENT_ALREADY_RUN");
  assert.match(String(outraTentativa.body.error), /parou no meio/);
  assert.equal(pagas, antes, "nada pago de novo com a mesma prévia");
  // Uma prévia nova (outra rodada, outra confirmação) é permitida e arquiva a interrompida.
  const replanejada = await handleReinforcementSearchPlan({ store, now: () => NOW }, ReinforcementSearchPlanRequestSchema.parse({ brandId: MARCA, pageKeywordIds: [K_DENT] }));
  assert.equal(replanejada.status, 200, JSON.stringify(replanejada.body));
  const historico = (banco.linhas("editorial_workflow_items").find(entrada => entrada.subject_type === REINFORCEMENT_SEARCH_SUBJECT_TYPE)!.payload as { history: Array<{ interrupted: boolean }> }).history;
  assert.equal(historico.at(-1)?.interrupted, true);
  assert.equal(chamadasDeRede, 0);
});

test("pedido: a mesma keyword em dois publicados, ou uma publicada como reforço, é recusada antes de ler", () => {
  assert.throws(() => PublishedReinforcementRequestSchema.parse({ brandId: MARCA, mode: "preview", pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A] }, { publishedKeywordId: K_DENT, keywordIds: [K_A] }] }), /um artigo só/);
  assert.throws(() => PublishedReinforcementRequestSchema.parse({ brandId: MARCA, mode: "preview", pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_DENT] }, { publishedKeywordId: K_DENT }] }), /publicada nunca entra/);
  assert.throws(() => PublishedReinforcementRequestSchema.parse({ brandId: MARCA, mode: "apply", pages: [{ publishedKeywordId: K_PUB }] }), /hash da prévia/);
});

test("keyword nova que o dono rejeitou no Minerador não volta sozinha", async () => {
  const { banco, deps } = montar();
  banco.linhas("minerador_keywords").push(keyword("aaaaaaaa-0000-4000-8000-00000000000d", "captar pacientes clínica", { status: "rejeitado" }));
  banco.linhas("editorial_workflow_items").push({ id: "busca-3", lock_version: 1, marca_id: MARCA, subject_type: REINFORCEMENT_SEARCH_SUBJECT_TYPE, stage: "architect", subject_id: "rs-0000000000000003", state: "proposed", payload: { run: { operationRequestId: "55555555-5555-4555-8555-555555555557", executedAt: "2026-09-28T11:00:00Z", pages: [{ keywordId: K_PUB, suggestions: [{ keyword: "captar pacientes clínica", normalizedKeyword: normalizeKeyword("captar pacientes clínica"), adsVolume: 50, level: "strong", sharedPageCount: 4, origins: ["ads_url_seed"], evidence: [] }] }] } } });
  const saida = dados(await handlePublishedReinforcement(deps(), pedido({ pages: [{ publishedKeywordId: K_PUB, newKeywords: ["captar pacientes clínica"] }] })));
  const [plano] = saida.pages as Array<{ create: unknown[]; refused: Array<{ keyword: string; reason: string }> }>;
  assert.deepEqual(plano.create, []);
  assert.match(plano.refused[0].reason, /rejeitou no Minerador/);
  assert.equal(saida.approvalText, null);
});

/* ================= correção de 2026-09-28: os defeitos vistos em produção ================= */

const papelNaMesa = (mesa: Mesa, keywordId: string) => (mesa.itens.find(entrada => entrada.subjectId === keywordId)!.payload.articleFormationDecision as { role: string } | undefined)?.role;

test("Defeito 2+3: a troca grava na mesa a nova principal e a página como secundária; a que troca a entidade do slug é recusada", async () => {
  const { mesa, versoes, deps, pareceres } = montar();
  // O parecer desta composição: a página e "como atrair pacientes", já com a nova principal.
  pareceres[0].composition = { keywordIds: [K_PUB, K_A], principalKeywordId: K_A };
  const consultorio = dados(await handlePublishedReinforcement(deps(), pedido({ pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_B], swapKeywordId: K_B }] })));
  const [planoConsultorio] = consultorio.pages as Array<{ swap: { state: string; reason: string } }>;
  assert.equal(planoConsultorio.swap.state, "refused");
  assert.match(planoConsultorio.swap.reason, /troca a entidade do slug: o slug diz "clinica" e ela diz "consultorio"/);

  const base = { pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A], swapKeywordId: K_A }] };
  const previa = dados(await handlePublishedReinforcement(deps(), pedido(base)));
  const [plano] = previa.pages as Array<{ status: string; swap: { state: string; reason: string }; dnaDeferred: string | null }>;
  assert.equal(plano.swap.state, "apply", plano.swap.reason);
  assert.equal(plano.dnaDeferred, null);
  const aplicado = dados(await handlePublishedReinforcement(deps(), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "41414141-4141-4141-8141-414141414141" })));
  assert.equal(aplicado.readbackConfirmed, true, JSON.stringify(aplicado));
  const dna = ArticleDNASchema.parse(versoes.at(-1)!.payload);
  assert.equal(versoes.at(-1)!.entityId, K_PUB, "o artigo continua identificado pela página");
  assert.equal(dna.principalKeywordId, K_A);
  assert.equal(dna.primaryKeywordDecision?.previousKeywordId, K_PUB);
  assert.equal(dna.suggestedSlug, "como-atrair-pacientes-para-clinica");
  assert.equal(papelNaMesa(mesa, K_A), "principal", "a mesa diz o que o ArticleDNA diz");
  assert.equal(papelNaMesa(mesa, K_PUB), "secundaria");
});

test("Defeito 3: DNA gravado com o parecer de 1 keyword e a mesa desalinhada da troca (c937661d) — a confirmação alinha a mesa e, depois do Processar, a sucessora leva o parecer certo", async () => {
  const { mesa, versoes, deps, pareceres } = montar();
  pareceres[0].composition = { keywordIds: [K_PUB, K_A], principalKeywordId: K_A };
  const base = { pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A], swapKeywordId: K_A }] };
  const previa = dados(await handlePublishedReinforcement(deps(), pedido(base)));
  await handlePublishedReinforcement(deps(), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "42424242-4242-4242-8242-424242424242" }));
  assert.equal(versoes.length, 1);
  // O estado de produção: o parecer observou só a página, e a mesa ficou com a página como principal.
  pareceres[0].composition = { keywordIds: [K_PUB], principalKeywordId: K_PUB };
  for (const [id, role] of [[K_PUB, "principal"], [K_A, "secundaria"]] as const) {
    const alvo = mesa.itens.find(entrada => entrada.subjectId === id)!;
    alvo.payload = { ...alvo.payload, articleFormationDecision: { ...(alvo.payload.articleFormationDecision as object), role } };
  }
  const pedidoSo = { pages: [{ publishedKeywordId: K_PUB }] };
  const alinhar = dados(await handlePublishedReinforcement(deps(), pedido(pedidoSo)));
  const [planoAlinhar] = alinhar.pages as Array<{ status: string; dnaDeferred: string | null; lines: string[] }>;
  assert.equal(planoAlinhar.status, "ready");
  assert.ok(planoAlinhar.lines.some(linha => /Alinha na mesa a troca já confirmada no ArticleDNA: "como atrair pacientes" principal e "como atrair pacientes para clínica" secundária/.test(linha)), planoAlinhar.lines.join(" | "));
  assert.match(String(planoAlinhar.dnaDeferred), /foi aprovado com o parecer da SERP de outra composição \(2 keywords no artigo\)/);
  const alinhado = dados(await handlePublishedReinforcement(deps(), pedido({ ...pedidoSo, mode: "apply", decisionHash: alinhar.decisionHash, operationRequestId: "43434343-4343-4343-8343-434343434343" })));
  assert.equal(alinhado.readbackConfirmed, true, JSON.stringify(alinhado));
  assert.equal(versoes.length, 1, "nenhuma versão com o parecer de outra composição");
  assert.equal(papelNaMesa(mesa, K_A), "principal");
  assert.equal(papelNaMesa(mesa, K_PUB), "secundaria");
  assert.match(String(alinhado.message), /O ArticleDNA ainda não foi gravado: O ArticleDNA v1 foi aprovado com o parecer da SERP de outra composição/);

  // "Processar artigos" (cache) grava o parecer da formação: a composição do DNA, com a principal trocada.
  const formacao = String(mesa.itens.find(entrada => entrada.subjectId === K_PUB)!.payload.articleFormationRef);
  pareceres.push({ candidateRef: formacao, territoryRef: TERRITORIO, reference: { entityId: "assessment-formacao", versionId: "assessment-formacao:base-9", contentHash: `sha256:${"f".repeat(64)}` }, composition: { keywordIds: [K_A, K_PUB], principalKeywordId: K_A } });
  const refresco = dados(await handlePublishedReinforcement(deps(), pedido(pedidoSo)));
  const [planoRefresco] = refresco.pages as Array<{ status: string; serpRefresh: boolean; dna: { mode: string } }>;
  assert.equal(planoRefresco.status, "ready");
  assert.equal(planoRefresco.serpRefresh, true);
  const gravado = dados(await handlePublishedReinforcement(deps(), pedido({ ...pedidoSo, mode: "apply", decisionHash: refresco.decisionHash, operationRequestId: "44444444-4444-4444-8444-444444444445" })));
  assert.equal(gravado.readbackConfirmed, true, JSON.stringify(gravado));
  assert.equal(versoes.length, 2);
  const v2 = ArticleDNASchema.parse(versoes.at(-1)!.payload);
  assert.equal(versoes.at(-1)!.versionNumber, 2);
  assert.equal(v2.serpAssessmentRef?.versionId, "assessment-formacao:base-9");
  assert.equal(v2.principalKeywordId, K_A, "a troca confirmada é preservada");
  assert.deepEqual(v2.keywordReferences.map(reference => reference.keywordId).sort(), [K_PUB, K_A].sort(), "nenhuma keyword some");
  assert.equal(v2.canonical, URL_PUB);
  assert.deepEqual(articleApprovalRevalidationIssues({ version: versoes.at(-1)!, authorizedBrandId: MARCA }), []);
  // De novo: nada muda.
  const denovo = dados(await handlePublishedReinforcement(deps(), pedido(pedidoSo)));
  assert.equal((denovo.pages as Array<{ status: string }>)[0].status, "unchanged");
});

/* ================= corretor de 2026-09-28: a troca que espera o ArticleDNA ================= */

test("Corretor: troca sem o parecer da composição — a mesa grava a troca com o marcador e a reconhece; a confirmação seguinte a aplica sem a caixinha, e a página segue sendo o artigo", async () => {
  const { mesa, versoes, deps, pareceres } = montar();
  // Só o parecer da página (1 keyword): a troca vai para a mesa e o primeiro ArticleDNA espera o "Processar artigos".
  const base = { pages: [{ publishedKeywordId: K_PUB, keywordIds: [K_A], swapKeywordId: K_A }] };
  const previa = dados(await handlePublishedReinforcement(deps(), pedido(base)));
  const [plano] = previa.pages as Array<{ status: string; swap: { state: string; reason: string }; dnaDeferred: string | null }>;
  assert.equal(plano.swap.state, "apply", plano.swap.reason);
  assert.match(String(plano.dnaDeferred), /descreve outra composição/);
  const aplicado = dados(await handlePublishedReinforcement(deps(), pedido({ ...base, mode: "apply", decisionHash: previa.decisionHash, operationRequestId: "51515151-5151-4151-8151-515151515151" })));
  assert.equal(aplicado.written, false, "nenhum ArticleDNA sem o parecer desta composição");
  assert.equal(versoes.length, 0);
  const [desfecho] = aplicado.pages as Array<{ dnaDeferred: string | null; partial: string[] }>;
  assert.ok(desfecho.partial.length > 0 && desfecho.dnaDeferred, "a mesa foi gravada: a tela relê");
  const decisao = (id: string) => mesa.itens.find(entrada => entrada.subjectId === id)!.payload.articleFormationDecision as { role: string; reason: string };
  assert.deepEqual([decisao(K_A).role, decisao(K_A).reason], ["principal", PUBLISHED_REINFORCEMENT_SWAP_REASON]);
  assert.deepEqual([decisao(K_PUB).role, decisao(K_PUB).reason], ["secundaria", PUBLISHED_REINFORCEMENT_SWAP_REASON]);
  // A mesa reconhece a troca gravada (sem ela, a formação abriria "publicada e não é a principal").
  const linhas = mesa.itens.map(entrada => ({ id: entrada.subjectId, isPublished: entrada.subjectId === K_PUB, ...entrada.payload }));
  assert.equal(recordedPublishedSwapsOf(linhas).get(K_PUB), K_A);

  // "Processar artigos" (cache) grava o parecer da formação, com a nova principal e os papéis.
  const formacao = String(mesa.itens.find(entrada => entrada.subjectId === K_PUB)!.payload.articleFormationRef);
  pareceres.push({ candidateRef: formacao, territoryRef: TERRITORIO, reference: { entityId: "assessment-troca", versionId: "assessment-troca:base-3", contentHash: `sha256:${"e".repeat(64)}` }, composition: { keywordIds: [K_PUB, K_A], principalKeywordId: K_A, roles: { [K_A]: "principal", [K_PUB]: "secundaria" } } });
  const pedidoSo = { pages: [{ publishedKeywordId: K_PUB }] };
  const segunda = dados(await handlePublishedReinforcement(deps(), pedido(pedidoSo)));
  const [plano2] = segunda.pages as Array<{ status: string; swap: { state: string; reason: string }; dnaDeferred: string | null }>;
  assert.equal(plano2.swap.state, "apply", plano2.swap.reason);
  assert.match(plano2.swap.reason, /Troca que você confirmou na confirmação anterior do Reforçar \(gravada na mesa, esperando o ArticleDNA\)/);
  assert.equal(plano2.dnaDeferred, null);
  const gravado = dados(await handlePublishedReinforcement(deps(), pedido({ ...pedidoSo, mode: "apply", decisionHash: segunda.decisionHash, operationRequestId: "52525252-5252-4252-8252-525252525252" })));
  assert.equal(gravado.readbackConfirmed, true, JSON.stringify(gravado));
  assert.equal(versoes.length, 1);
  const dna = ArticleDNASchema.parse(versoes.at(-1)!.payload);
  assert.equal(versoes.at(-1)!.entityId, K_PUB, "o artigo continua identificado pela página");
  assert.equal(dna.principalKeywordId, K_A);
  assert.equal(dna.primaryKeywordDecision?.previousKeywordId, K_PUB);
  assert.equal(dna.serpAssessmentRef?.versionId, "assessment-troca:base-3", "o parecer DESTA composição");
  assert.equal(dna.canonical, URL_PUB);

  // Uma formação da Revisão humana com outra principal (sem o marcador) não vira troca implícita.
  const outra = montar();
  const ref = "article-formation:61616161-2222-4333-8444-555555555555";
  const humana = (role: string) => ({ operation: "move", role, reason: "humano", source: "human", decidedAt: "2026-09-20T00:00:00Z" });
  Object.assign(outra.mesa.itens.find(entrada => entrada.subjectId === K_PUB)!.payload, { articleFormationRef: ref, articleFormationDecision: humana("secundaria") });
  Object.assign(outra.mesa.itens.find(entrada => entrada.subjectId === K_A)!.payload, { articleFormationRef: ref, articleFormationDecision: humana("principal") });
  const [semTroca] = dados(await handlePublishedReinforcement(outra.deps(), pedido(pedidoSo))).pages as Array<{ status: string; refusal: string; swap: { state: string } }>;
  assert.equal(semTroca.status, "refused");
  assert.match(semTroca.refusal, /como principal, por decisão sua: confirme a composição na mesa antes/);
});
