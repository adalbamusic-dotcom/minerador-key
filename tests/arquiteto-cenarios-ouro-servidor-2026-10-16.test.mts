import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { register } from "node:module";
import { mock, test } from "node:test";
import { ArticleDNASchema, ProvisionalArticleGroupSchema } from "../lib/arquiteto/contracts.ts";
import { SERP_SUBJECT_LENS_LABELS } from "../lib/arquiteto/serp-subject-overlap.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";
import { declarado, linhaDaMesa } from "./arquiteto-assunto-fixtures.mts";
import { ATOR, AZUL, LINHAS_AZUL, MARCA_WIFI, TERRITORIO_AZUL, VOLUME_VALIDADO, codigoSemComentarios, escopoDo, semanticoDoPlano } from "./arquiteto-cenarios-ouro-fixtures.mts";
import { planGroupSiloClosure } from "../lib/arquiteto/plan-article-sheet.ts";

/*
 * F0 DA LINHA ÚNICA DO ARQUITETO — CENÁRIOS-OURO NO SERVIDOR (2026-10-16).
 *
 * SDD `docs/compartilhado/sdd-linha-unica-do-arquiteto-2026-10-16.md` §11.1.
 * O núcleo real da melhoria (`handleArticleImprovement`: prepare → apply) roda
 * de verdade; só as fronteiras de I/O são simuladas, o MESMO arranjo de
 * `tests/arquiteto-article-improvement-server.test.mts` (mesa, parecer da
 * SERP, cache, PATCH da cópia de trabalho, gravador e marcador em memória).
 * O gravador simulado guarda o TIPO e o STATUS de cada gravação — é o que os
 * cenários conferem ("só ArticleDNA", "aprovado").
 *
 * Cenários aqui: C2/C3 (o plano formado HOJE por B, sem fechar o Silo), C6
 * (Assunto sem plano: troca a principal com volume), C9 (publicado Livre sem
 * volume pela melhoria), C10 (keyword solta no recorte do grupo), C11 (o
 * servidor recusa a troca da Travada e da Livre com volume) e C15 (falha
 * depois do PATCH e antes do append). Nada muda no produto nesta fase.
 *
 * Nenhuma rede (`fetch` lança), nenhum banco, nenhum provider, nenhuma IA real.
 * Roda pelo `npm run test:arquiteto:cenarios` (precisa de
 * `--experimental-test-module-mocks`).
 */

register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n) {
  if(s==='next/server') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class NextRequest extends Request {}')}; return n(s,c); }`)}`);
let chamadasDeRede = 0;
globalThis.fetch = (async () => { chamadasDeRede += 1; throw new Error("Rede proibida nos cenários-ouro do servidor."); }) as typeof fetch;

/* ------------------------------------------------- estado em memória */

const sha = (c: string) => `sha256:${c.repeat(64)}`;
type Row = Record<string, any>;
type Gravacao = { type: string; status: string; version: any };
let marca = MARCA_WIFI;
let rows: Row[] = [], gravacoes: Gravacao[] = [], journal: any[] = [], assessments: any[] = [], marker: any = null;
let territorios: any[] = [], grupoDe = new Map<string, string>(), paginasPublicadas: any[] = [];
let pago = 0, falharAppend = false, patches = 0, chamadasSerp = 0;
/** 2026-10-19 · V4: as principais SEM as 4 lentes no cache até a coleta paga (o plano as conta; o só-cache não dá parecer). */
let semLentesAtePagar = new Set<string>();
/** 2026-10-19 · V5: os grupos que a guarda de retrabalho da rota real barra (a coleta paga da mesma consulta já deu inconclusiva). */
let barradosPelaGuarda = new Set<string>();
/** 2026-10-19 · os motivos do refazer que o "Melhorar publicados…" mandou à rota da SERP (a guarda não barra a recoleta). */
const motivosDoRefazer: string[] = [];
const RECUSA_DA_GUARDA = "A mesma recusa aconteceu em 18/10 às 22:34: a SERP paga desta composição deu parecer inconclusivo (Decidir explicitamente: a evidência não confirma nem rejeita); pagar de novo a mesma composição repetiria o resultado — mude a composição ou decida \"Manter\" com motivo.";
const clone = (v: any) => structuredClone(v);
// Postgres JSONB não guarda a ordem das chaves e descarta undefined: o dublê faz igual.
const jsonb = (v: any): any => Array.isArray(v) ? v.map(jsonb) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([p], [q]) => q.length - p.length || (p < q ? 1 : -1)).map(([k, x]) => [k, jsonb(x)])) : v;
const json = (data: any) => new Response(JSON.stringify({ success: true, data }));
const artigos = () => gravacoes.filter(g => g.type === "article_dna").map(g => g.version);
/** A leitura canônica devolve a versão vigente de cada artigo (`latestByEntity`). */
const vigentes = () => { const por = new Map<string, any>(); for (const v of artigos()) if (!por.has(v.entityId) || por.get(v.entityId).versionNumber < v.versionNumber) por.set(v.entityId, v); return [...por.values()]; };

class Query {
  filters: [string, any][] = [];
  eq(k: string, v: any) { this.filters.push([k, v]); return this; }
  select() { return this; }
  gte() { return this; }
  order() { return this; }
  limit() { return this; }
  matches(r: any) { return this.filters.every(([k, v]) => k.startsWith("payload->>") ? r.payload?.[k.slice(10)] === v : r[k] === v); }
  async maybeSingle() { return { data: clone(journal.find(r => this.matches(r)) ?? null), error: null }; }
  then(resolve: any, reject: any) { return Promise.resolve({ data: journal.filter(r => this.matches(r)).reverse().map(clone), error: null }).then(resolve, reject); }
}
const contexto = () => ({ brandId: marca, actorUserId: ATOR, module: "arquiteto", action: "edit", supabase: { from: () => new Query() } }) as any;
const autorizados: string[] = [];
const runtime = () => { const context = contexto(); return { context, authorize: async (module: string, action: string) => { autorizados.push(`${module}:${action}`); return { ...context, module, action }; } } as any; };

mock.module("../lib/server/arquiteto-territory-store.ts", { namedExports: {
  listTerritoryWorkflowItems: async () => clone(territorios),
  createTerritoryWorkflowItem: async () => { throw new Error("criar território não é esperado nos cenários"); },
  updateTerritoryWorkflowItem: async () => { throw new Error("atualizar território não é esperado nos cenários"); },
} });
const recortado = (filtro: any) => {
  const tudo = { workflowItems: [], keywords: clone(rows), articleDnas: clone(vigentes()), siloDnas: [] };
  if (!grupoDe.size || !filtro || filtro.kind === "all") return tudo;
  const dentro = (id: string) => filtro.kind === "none" ? !grupoDe.has(id) : grupoDe.get(id) === filtro.groupId;
  return { ...tudo, keywords: tudo.keywords.filter((k: any) => dentro(k.id)), articleDnas: tudo.articleDnas.filter((a: any) => a.payload.keywordReferences.some((r: any) => dentro(r.keywordId))) };
};
mock.module("../lib/arquiteto/canonical-workspace.ts", { namedExports: { buildCanonicalWorkflowWorkspaceItems: (_w: any, k: any) => k } });
mock.module("../lib/server/arquiteto-workspace.ts", { namedExports: { loadCanonicalArquitetoWorkspace: async (_c: any, options: any = {}) => recortado(options.groupFilter), createMineradorArquitetoHandoff: async () => { throw new Error("o Arquiteto não envia ao Minerador"); } } });
mock.module("../lib/server/arquiteto-differentiation-store.ts", { namedExports: {
  readDifferentiationBrandKeywords: async () => ({ pages: clone(paginasPublicadas), existingByNormalized: new Map(rows.map(r => [normalizeKeyword(r.keyword), r.id])), knownVolumeByNormalized: new Map() }),
  // 2026-10-16 · §15: o vocabulário da SERP da principal em cache; vazio aqui (o amarelo tem o arquivo próprio).
  readPrincipalSerpVocabulary: async () => new Map(),
  // A SERP do cache por fixture: as mesmas 4 páginas nas 4 lentes = o Google junta.
  readPublishedFootprints: async (_c: any, queries: any[]) => ({ missingLenses: [], footprints: queries.map(q => ({ ...q, lenses: SERP_SUBJECT_LENS_LABELS.map(lens => ({ lens, urls: ["https://example.org/1", "https://example.org/2", "https://example.org/3", "https://example.org/4"] })) })) }),
} });
mock.module("../lib/server/arquiteto-differentiation-runtime.ts", { namedExports: {
  readGoogleAdsAverageVolumes: async () => new Map(),
  proposeArticleImprovementAiPicks: async () => { throw new Error("IA real proibida nos cenários"); },
} });
mock.module("../lib/server/arquiteto-serp-http.ts", { namedExports: { handleArchitectFormationSerp: async (req: Request) => {
  chamadasSerp += 1;
  const body = await req.json();
  for (const group of body.groups) ProvisionalArticleGroupSchema.parse(group);
  // A guarda da rota real (F5): só no plano e na execução paga; todos barrados = 409; parte barrada = some do pedido e volta em `rework`.
  // 2026-10-19 · como a rota real: o motivo do refazer (`reworkOverride`) passa, e a coleta de UMA keyword só nunca é barrada.
  if (body.reworkOverride) motivosDoRefazer.push(body.reworkOverride.reason);
  const guarda = (body.mode === "plan" || !body.cacheOnly) && !body.reworkOverride;
  const recusados = guarda ? body.groups.filter((group: any) => barradosPelaGuarda.has(group.id) && group.keywordIds.length > 1) : [];
  const rework = recusados.length ? { rework: { articles: recusados.map((group: any) => ({ articleId: group.id, message: RECUSA_DA_GUARDA })) } } : {};
  if (recusados.length && recusados.length === body.groups.length) return new Response(JSON.stringify({ success: false, code: "REWORK_SAME_REFUSAL", error: `REWORK_SAME_REFUSAL: ${RECUSA_DA_GUARDA}`, ...rework }), { status: 409 });
  body.groups = body.groups.filter((group: any) => !recusados.includes(group));
  const faltam = body.groups.filter((group: any) => semLentesAtePagar.has(group.principalSuggestion.keywordId));
  if (body.mode === "plan") return json({ ...rework, plan: { paidQueries: faltam.length * 4, estimatedCostUsd: { min: faltam.length * 0.008, max: faltam.length * 0.014 }, missingDetails: faltam.flatMap((group: any) => SERP_SUBJECT_LENS_LABELS.map(lens => ({ keyword: group.keywords.find((k: any) => k.id === group.principalSuggestion.keywordId)?.keyword, keywordId: group.principalSuggestion.keywordId, lens, primary: true, reason: "sem entrada" }))) } });
  if (body.authorizedPaidQueries) { pago += body.authorizedPaidQueries; for (const group of faltam) semLentesAtePagar.delete(group.principalSuggestion.keywordId); }
  else assert.equal(body.cacheOnly, true, "nenhuma chamada paga implícita");
  for (const group of body.groups) {
    if (semLentesAtePagar.has(group.principalSuggestion.keywordId)) continue;
    const record = { candidateRef: group.id, payload: { formationBaseHash: body.formationBaseHashes[group.id], verdict: "INCONCLUSIVE", interpretation: { lenses: { perLens: SERP_SUBJECT_LENS_LABELS.map(lens => ({ lens, pairs: [] })), requested: SERP_SUBJECT_LENS_LABELS, observed: SERP_SUBJECT_LENS_LABELS, missing: [] } }, assessment: { id: `assessment:${group.id}`, contentHash: sha("b"), keywordDnaReferences: group.keywordIds.map((keywordId: string) => ({ keywordId })), recommendations: group.keywordIds.map((keywordId: string) => ({ keywordId, currentRole: group.roles[keywordId] })) } } };
    assessments = [...assessments.filter(a => a.candidateRef !== group.id), record];
  }
  return json({});
} } });
mock.module("../lib/server/arquiteto-article-serp-store.ts", { namedExports: {
  listArticleFormationSerpAssessments: async () => clone(assessments),
  saveArticleFormationSerpAssessment: async (_c: any, input: any) => { const record = { candidateRef: input.candidateRef, payload: { ...clone(input), humanResolution: null } }; assessments = [...assessments.filter(a => a.candidateRef !== input.candidateRef), record]; return record; },
  resolveArticleFormationSerpAssessment: async (_c: any, input: any) => { const a = assessments.find(item => item.candidateRef === input.candidateRef); a.payload.humanResolution = clone(input.resolution); return a; },
  readbackArticleFormationSerpAssessment: async (_c: any, id: string) => clone(assessments.find(a => a.candidateRef === id)),
  findArticleFormationSerpAssessment: async (_c: any, id: string) => clone(assessments.find(a => a.candidateRef === id)) ?? null,
} });
mock.module("../lib/server/arquiteto-workspace-http.ts", { namedExports: { handleArchitectWorkspacePatch: async (req: Request) => {
  const body = await req.json();
  for (const u of body.updates) { const r = rows.find(item => item.canonicalWorkflow.id === u.workflowItemId); assert.equal(u.expectedLock, r!.canonicalWorkflow.lockVersion); Object.assign(r!, u.assignment); Object.assign(r!.canonicalWorkflow.payload, u.assignment); r!.canonicalWorkflow.lockVersion++; }
  patches += 1;
  return json({});
} } });
mock.module("../lib/server/minerador-google-ads-metrics-http.ts", { namedExports: { handleGoogleAdsKeywordMetrics: async () => { throw new Error("o Arquiteto não grava medição no Minerador"); } } });
// O gravador: guarda o tipo e o STATUS. `falharAppend` simula a queda depois do PATCH e antes do append (C15).
mock.module("../lib/server/arquiteto-persistence.ts", { namedExports: { appendArquitetoArtifact: async (_c: any, type: string, version: any, status = "proposed") => {
  if (falharAppend) throw new Error("O gravador do ArticleDNA caiu (dublê).");
  if (type === "article_dna") ArticleDNASchema.parse(version.payload);
  gravacoes.push({ type, status, version: clone(version) });
  return { version, status: "PERSISTED" };
} } });
mock.module("../lib/server/arquiteto-article-formation-marker-store.ts", { namedExports: {
  readArticleFormationMarker: async () => clone(marker), saveArticleFormationMarker: async (_c: any, payload: any) => { marker = { payload: clone(payload) }; }, readbackArticleFormationMarker: async () => clone(marker),
} });
mock.module("../lib/server/pipeline-repositories.ts", { namedExports: { WorkflowRepository: class {
  context: any; constructor(c: any) { this.context = c; }
  async create(input: any) { journal.push({ id: journal.length ? `journal-${journal.length}` : "journal", marca_id: this.context.brandId, subject_type: input.subjectType, subject_id: input.subjectId, stage: input.stage, payload: jsonb(clone(input.payload)), lock_version: 1 }); }
  async update(id: string, lock: number, input: any) { const r = journal.find(item => item.id === id && item.marca_id === this.context.brandId); assert.equal(r.lock_version, lock); Object.assign(r, { ...clone(input), ...(input.payload ? { payload: jsonb(clone(input.payload)) } : {}) }); r.lock_version++; return { data: clone(r) }; }
} } });
const subjectImportActual = await import("../lib/minerador/subject-discovery-import.ts");
mock.module("../lib/minerador/subject-discovery-import.ts", { namedExports: { ...subjectImportActual, importSubjectDiscoveryWithCore: async () => { throw new Error("o Arquiteto não importa keyword no Minerador"); } } });
mock.module("../lib/server/minerador-keyword-decision-core.ts", { namedExports: {
  runKeywordLogicWithCore: async () => { throw new Error("o Arquiteto não roda a Lógica"); },
  readDecisionKeywords: async () => ({ rows: [], missingCount: 0 }), keywordDecisionEntries: () => [], applyKeywordDecisionEntries: async () => { throw new Error("o Arquiteto não aprova no Minerador"); },
} });
mock.module("../lib/server/google-ads-canonical.ts", { namedExports: {
  resolveGoogleAdsCanonicalContext: async () => { throw new Error("Google Ads proibido nos cenários"); },
  createGoogleAdsCanonicalClient: async () => ({ client: {} }), targetingToProviderInput: () => ({}), defaultGoogleAdsCanonicalTargeting: () => ({}),
} });
mock.module("../lib/google/ads/keyword-ideas.ts", { namedExports: { generateGoogleAdsKeywordIdeas: async () => { throw new Error("busca nova proibida nos cenários"); } } });
mock.module("../lib/server/arquiteto-published-reinforcement.ts", { namedExports: { stableUuid: (...parts: string[]) => { const h = createHash("sha256").update(parts.join("|")).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; } } });
mock.module("../lib/server/minerador-volume-measure.ts", { namedExports: { measureKeywordVolume: async () => { throw new Error("o Arquiteto não mede no Minerador"); } } });
/** 2026-10-19 · a localidade da SERP da marca (`resolveBrandSerpTarget`): `null` = nacional (o de antes); São Paulo nos cenários do verde. */
let territorioDaMarca: unknown = null;
mock.module("../lib/server/brand-serp-target.ts", { namedExports: {
  BRAND_SERP_LOCATION_COLUMNS: "id,localizacao",
  resolveBrandSerpTarget: async () => ({ territory: territorioDaMarca, codes: { locationCode: territorioDaMarca ? 1001773 : 2076, languageCode: "pt" }, label: territorioDaMarca ? "São Paulo (cidade)" : "Brasil", source: territorioDaMarca ? "brand" : "national", readFailed: false }),
} });
const { handleArticleImprovement, projectImprovementRun, observedSerpIntentOfRow } = await import("../lib/server/arquiteto-article-improvement.ts");
const { BRAND_SERP_SAO_PAULO_CITY } = await import("../lib/marca/brand-serp-location.ts");

/* --------------------------------------------------------- linhas */

const SEMANTICO = { entidade_central: "internet residencial", problema_percebido: "conexão ruim em casa", publico: "quem vai contratar internet", resultado_desejado: "escolher bem", intencao_principal: "Informativa" };
/** Uma linha da mesa no formato do servidor (pacote aprovado, workflow com trava, KeywordDNA). */
function linhaDoServidor(id: string, keyword: string, semantic: Record<string, unknown>, extra: Row = {}): Row {
  const base = linhaDaMesa({ id, keyword, brandId: marca, semantic: { ...SEMANTICO, ...semantic } }) as Row;
  return {
    ...base, intent: "Informativa", volume_search: null, volume_source: null, isPublished: false, primaryKeywordPolicy: "free", territoryRef: TERRITORIO_AZUL,
    keywordDnaRef: { entityId: id, versionId: `${id}:v1`, contentHash: sha("a") },
    canonicalWorkflow: { ...base.canonicalWorkflow, id: `workflow-${id}`, lockVersion: 1, payload: { ...base.canonicalWorkflow.payload, semanticQualification: { intent: "Informativa", semanticState: "conclusive" } } },
    ...extra,
  };
}
const territorio = (territoryRef: string, nome: string, slug: string) => ({ territoryRef, lockVersion: 1, territory: { name: nome, lifecycleStatus: "confirmed", centralEntity: nome, macroIntent: "Informativa", reasons: [], slugState: { publishedSlug: null, confirmed: slug, proposals: [] } } });
function zerar(m = MARCA_WIFI) {
  marca = m; rows = []; gravacoes = []; journal = []; assessments = []; marker = null; territorios = []; grupoDe = new Map(); paginasPublicadas = [];
  pago = 0; falharAppend = false; patches = 0; chamadasSerp = 0; autorizados.length = 0; semLentesAtePagar = new Set(); barradosPelaGuarda = new Set(); motivosDoRefazer.length = 0; territorioDaMarca = null;
}
const prepare = (extra: Record<string, unknown> = {}) => handleArticleImprovement(runtime(), { brandId: marca, action: "prepare", ...extra } as any);
const apply = (run: any, extra: Record<string, unknown> = {}) => handleArticleImprovement(runtime(), { brandId: marca, action: "apply", runId: run.runId, decisionHash: run.decisionHash, ...extra } as any);

/** A mesa real do azul no servidor: as 7 do plano, com a versão de cada uma e o volume medido onde há. */
function mesaAzulNoServidor() {
  zerar();
  territorios = [territorio(TERRITORIO_AZUL, "Wi-Fi e fibra óptica", "wifi-e-fibra")];
  rows = LINHAS_AZUL.map(linha => linhaDoServidor(linha.id, linha.keyword, semanticoDoPlano(linha), linha.volume !== null ? { volume_search: linha.volume, volume_source: "google_ads" } : {}));
  grupoDe = new Map(LINHAS_AZUL.map(linha => [linha.id, AZUL]));
}

/* ======================================================================= */
/* C2 · C3 — o plano formado HOJE por B (a melhoria com origin plan_sheet)  */
/* ======================================================================= */

/*
 * 2026-10-17 (noite) · F2 DA LINHA ÚNICA (o dono, no amarelo: "cadê o verdadeiro papel do arquiteto? 3 botões já é
 * suficiente"). SUBSTITUI o "HOJE por B: 6 DNAs; a Livre sem volume e sem sustentação fica de fora; NENHUM SiloDNA no
 * mesmo ato — muda na F2": (1) a Livre sem volume que é a principal de IDENTIDADE (no título do Assunto, T12) forma com
 * ela, pela SERP dela (G6) — L13 vale só fora da identidade; (2) o Silo do plano fecha no mesmo ato do Concluir: a tela
 * relê os DNAs e grava o par pelo fechamento canônico (`writeSiloPairFromArticles`); a decisão é de domínio
 * (`planGroupSiloClosure`) e é conferida aqui com os 7 DNAs gravados.
 */
test("C2/C3 · servidor · 'Concluir formação' das 7 linhas do azul pela linha única: 7 DNAs aprovados (a Livre de identidade forma com a principal dela) com hierarquia = papel e promessa = escopo, a Travada intacta; o Silo do plano fica PRONTO para fechar no mesmo ato (Pilar e ordem do plano)", async () => {
  mesaAzulNoServidor();
  const ids = LINHAS_AZUL.map(linha => linha.id);
  const run = await prepare({ group: AZUL, targetIds: ids, origin: "plan_sheet" });
  assert.equal(run.origin, "plan_sheet");
  assert.equal(run.groupScope?.groupId, AZUL);
  assert.equal(gravacoes.length, 0, "a prévia não grava nada");
  const prontas = run.proposals.filter((p: any) => p.status === "ready").map((p: any) => p.targetId).sort();
  assert.deepEqual(prontas, ["k10", "k11", "k12", "k13", "k14", "k15", "k9"], JSON.stringify(run.proposals.map((p: any) => [p.targetId, p.status, p.reasons])));
  const livre: any = run.proposals.find((p: any) => p.targetId === "k10");
  assert.ok(livre, "a Livre de identidade está na leitura");
  assert.equal(livre.principalId, "k10", "a principal de identidade fica (T12)");
  assert.deepEqual(livre.memberIds, ["k10"], "forma só com a principal quando nenhum reforço tem par (a busca nova é do Processar)");
  assert.ok(livre.reasons.some((r: string) => /^Principal de identidade: “diferença entre internet e Wi-Fi”/.test(r)), JSON.stringify(livre.reasons));
  for (const p of run.proposals.filter((item: any) => item.status === "ready")) assert.equal(p.principalId, p.targetId, `${p.targetId}: a principal declarada (travada pelo volume) ou de identidade fica`);
  // Uma confirmação; cada chamada do apply avança um artigo até `complete` (o mesmo laço da tela e do MCP).
  let fim = await apply(run, { targetIds: prontas });
  for (let volta = 0; fim.state !== "complete" && volta < 10; volta += 1) fim = await apply(fim);
  assert.equal(fim.state, "complete", JSON.stringify(fim.outcomes));
  assert.ok(fim.outcomes.every((o: any) => ["improved", "dna_created"].includes(o.status)), JSON.stringify(fim.outcomes));
  const dnas = artigos();
  assert.equal(dnas.length, 7);
  for (const versao of dnas) {
    const linha = LINHAS_AZUL.find(item => item.id === versao.payload.subject?.keywordId)!;
    assert.ok(linha, "cada DNA carrega o Assunto do plano");
    assert.equal(versao.payload.hierarchy, linha.role, `${linha.id}: hierarquia = papel do plano`);
    assert.equal(versao.payload.promise, escopoDo(linha.order), `${linha.id}: promessa = escopo do plano`);
    assert.equal(versao.payload.principalKeywordId, linha.id, `${linha.id}: a principal travada intacta`);
    assert.equal(versao.payload.territoryRef, TERRITORIO_AZUL, "no Silo do plano");
    assert.match(versao.payload.serpAssessmentRef.versionId, /^assessment:.+:serpbase:[0-9a-f]{16}$/, "serpAssessmentRef = `${id}:${formationBaseHash}`");
  }
  assert.equal(dnas.find((v: any) => v.payload.subject.keywordId === "k9").payload.hierarchy, "Pilar");
  assert.deepEqual([...new Set(gravacoes.map(g => `${g.type}:${g.status}`))], ["article_dna:approved"], "o servidor da melhoria grava só ArticleDNA aprovado; o par do Silo é do fechamento canônico, no mesmo ato, pela tela");
  // O Silo do plano fecha no mesmo ato: a decisão do domínio com os 7 DNAs gravados — pronto, Pilar = k9, a ordem do plano.
  const fechamento = planGroupSiloClosure({
    planRows: LINHAS_AZUL.map(linha => ({ keywordId: linha.id, keyword: linha.keyword, role: linha.role, order: linha.order })),
    articles: dnas.map((v: any) => ({ articleId: v.payload.articleId, subjectKeywordId: v.payload.subject?.keywordId ?? null, territoryRef: v.payload.territoryRef ?? null })),
  });
  assert.equal(fechamento.state, "ready", JSON.stringify(fechamento));
  if (fechamento.state === "ready") {
    assert.equal(fechamento.territoryRef, TERRITORIO_AZUL);
    assert.equal(fechamento.pillarArticleId, dnas.find((v: any) => v.payload.subject.keywordId === "k9").payload.articleId);
    assert.deepEqual(fechamento.orderedArticleIds, [...LINHAS_AZUL].sort((a, b) => a.order - b.order).map(linha => dnas.find((v: any) => v.payload.subject.keywordId === linha.id).payload.articleId));
  }
  // A tela chama o MESMO par do fechamento canônico (nenhum gravador novo), depois de reler os DNAs.
  const tela = codigoSemComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  const fechar = tela.slice(tela.indexOf("const closePlanGroupSilos = async"), tela.indexOf("closePlanGroupSilosRef.current = closePlanGroupSilos;"));
  assert.match(fechar, /const decisao = planGroupSiloClosure\(\{/);
  assert.match(fechar, /await writeSiloPairFromArticles\(\{/);
  assert.match(tela, /onConcluded: groupIds => closePlanGroupSilosRef\.current\(groupIds\),/);
  assert.ok(autorizados.includes("arquiteto:approve"), "o append aprovado pede 'approve'");
  assert.equal(pago, 0, "nada pago: o parecer veio do cache");
  assert.equal(chamadasDeRede, 0);
});

/* ======================================================================= */
/* C6 · Assunto sem plano pela melhoria: 10 → 500                           */
/* ======================================================================= */

test("C6 · servidor · Assunto SEM plano com DNA (principal de volume 10) e candidata de 500 na lista: HOJE prepare → apply troca para a de 500 e grava v2 aprovada — muda na F4: fica (R1)", async () => {
  zerar("61d2e019-f44f-4fa3-af2f-d86b95628ab3");
  const t = "territory:0b8f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  territorios = [territorio(t, "Captação de pacientes", "captacao-de-pacientes")];
  const assunto = linhaDoServidor("assunto", "Como transformar interesse em agendamento na clínica", declarado("Conduzir os contatos para a agenda."), { territoryRef: t });
  const p10 = linhaDoServidor("p10", "captação de pacientes para clínica", { entidade_central: "captação de pacientes" }, { territoryRef: t, volume_search: 10, volume_source: "google_ads" });
  rows = [assunto, p10];
  // 1 · o Assunto forma em torno da principal com volume (a de 10 é a única).
  const primeiro = await prepare({ authorizeReading: { ai: true, measure: true } });
  assert.equal(primeiro.proposals[0].status, "ready", JSON.stringify(primeiro.proposals));
  assert.equal(primeiro.proposals[0].principalId, "p10");
  assert.equal((await apply(primeiro)).outcomes[0].status, "improved");
  assert.equal(artigos().length, 1);
  // 2 · a de 500 chega à lista: HOJE a melhoria troca a principal que já tem volume (needsPrimary do Assunto, article-improvement.ts:399-401).
  rows.push(linhaDoServidor("c500", "captação de pacientes para clínica de estética", { entidade_central: "captação de pacientes" }, { territoryRef: t, volume_search: 500, volume_source: "google_ads" }));
  const segundo = await prepare({ authorizeReading: { ai: true, measure: true } });
  const proposta = segundo.proposals.find((p: any) => p.targetId === "assunto")!;
  assert.equal(proposta.currentPrimaryId, "p10");
  assert.equal(proposta.principalId, "c500", "HOJE troca — muda na F4: a principal com volume definido fica");
  const fim = await apply(segundo);
  assert.equal(fim.outcomes[0].status, "improved", JSON.stringify(fim.outcomes));
  const v2 = vigentes()[0];
  assert.equal(v2.versionNumber, 2);
  assert.equal(v2.payload.principalKeywordId, "c500");
  assert.equal(v2.payload.primaryKeywordDecision?.status, "confirmed");
  assert.ok(v2.payload.secondaryKeywordIds.includes("p10"), "a antiga fica secundária");
  assert.equal(gravacoes.at(-1)!.status, "approved");
});

/* ======================================================================= */
/* C9 · publicado Livre sem volume pela melhoria                            */
/* ======================================================================= */

/*
 * 2026-10-17 · PRINCIPAL DE IDENTIDADE (dono): com o slug feito da principal ("como-captar-clientes-para-clinica-de-
 * estetica"), a Livre sem volume FICA e a melhoria só reforça. A troca do C9/C15 é a da principal FORA da identidade:
 * a mesma página com um slug que não foi feito dela (`URL_PUB`); a real (`URL_DE_IDENTIDADE`) é conferida no C9.
 */
const URL_DE_IDENTIDADE = "https://adalbapro.com.br/captacao-de-pacientes/como-captar-clientes-para-clinica-de-estetica";
const URL_PUB = "https://adalbapro.com.br/captacao-de-pacientes/captacao-para-clinica-de-estetica";
function publicadoLivreSemVolume(url = URL_PUB) {
  zerar("61d2e019-f44f-4fa3-af2f-d86b95628ab3");
  const t = "territory:0b8f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
  territorios = [territorio(t, "Captação de pacientes", "captacao-de-pacientes")];
  const pub = linhaDoServidor("pub", "como captar clientes para clínica de estética", { entidade_central: "captação de pacientes" }, { territoryRef: t, isPublished: true, publishedUrl: url, primaryKeywordPolicy: "reviewable" });
  const nova = linhaDoServidor("nova", "captação de pacientes para clínica de estética", { entidade_central: "captação de pacientes" }, { territoryRef: "territory:outro", volume_search: 50, volume_source: "google_ads" });
  rows = [pub, nova];
  paginasPublicadas = [{ keywordId: "pub", keyword: pub.keyword, url, canonical: url, slug: url.split("/").at(-1), post: "reviewable" }];
  return { t };
}

test("C9 · servidor · publicado Livre, principal sem volume: de identidade, a melhoria não troca e não paga SERP de candidata; fora da identidade, troca, a antiga fica secundária, primaryKeywordDecision confirmada, URL/slug/canonical intactos e grava APROVADO (a mesa grava 'proposed' — muda na F5)", async () => {
  publicadoLivreSemVolume(URL_DE_IDENTIDADE);
  const real = await prepare({ authorizeReading: { ai: true, measure: true } });
  assert.equal(real.proposals[0].principalId, "pub", `principal de identidade: fica (${JSON.stringify(real.proposals[0].reasons)})`);
  assert.ok(!(real.costs?.missingDetails ?? []).some((d: any) => /captacao de pacientes para clinica/.test(String(d.keyword))), "nenhuma SERP de candidata a principal entra no plano pago");
  const { t } = publicadoLivreSemVolume();
  const run = await prepare({ authorizeReading: { ai: true, measure: true } });
  assert.equal(run.proposals[0].status, "ready", JSON.stringify(run.proposals));
  const fim = await apply(run);
  assert.equal(fim.outcomes[0].status, "improved", JSON.stringify(fim.outcomes));
  const dna = artigos()[0].payload;
  assert.equal(dna.principalKeywordId, "nova");
  assert.deepEqual(dna.secondaryKeywordIds, ["pub"]);
  assert.equal(dna.canonical, URL_PUB);
  assert.equal(dna.suggestedSlug, URL_PUB.split("/").at(-1));
  assert.equal(dna.territoryRef, t);
  assert.equal(dna.primaryKeywordDecision?.status, "confirmed");
  assert.equal(dna.primaryKeywordDecision?.actorId, ATOR);
  assert.equal(gravacoes[0].status, "approved", "a melhoria grava aprovado");
  // A projeção do navegador e do MCP leva o mesmo hash da prévia (C13: o MCP chama este mesmo núcleo).
  assert.equal(projectImprovementRun(run).decisionHash, run.decisionHash);
});

/* ======================================================================= */
/* C10 · keyword solta no recorte do grupo                                  */
/* ======================================================================= */

/** 2026-10-18 · "sem média no Google Ads" há um dia: volume 0 pela régua do Assunto pela principal (§6.1). */
const SEM_MEDIA_RECENTE = () => ({ volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), averageMonthlySearches: null } });
function linhaDoPlanoAzul(id: string, keyword: string, ordem: number, opcoes: { lock?: "locked" | "free"; volume?: number; titulo?: string; semMedia?: boolean } = {}) {
  const semantico = { ...(opcoes.volume ? VOLUME_VALIDADO : {}), ...(opcoes.semMedia ? SEM_MEDIA_RECENTE() : {}), keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, entry: { title: opcoes.titulo ?? keyword, source: "cadastro" }, plan: { groupId: AZUL, planVersion: 4, order: ordem, role: "Suporte", scope: escopoDo(ordem), declaredPrincipal: { keywordId: id, phrase: keyword }, ...(opcoes.lock ? { lock: opcoes.lock } : {}) } }, keyword_subject_actor: ATOR, keyword_subject_at: "2026-10-13T10:00:00+00:00", keyword_subject_origin: "import", keyword_declared_principal: { subjectKeywordId: id, groupId: AZUL, planVersion: 4 } };
  return linhaDoServidor(id, keyword, semantico, opcoes.volume ? { volume_search: opcoes.volume, volume_source: "google_ads" } : {});
}
const apoioDe = (id: string, keyword: string, volume: number, de: string) => linhaDoServidor(id, keyword, { ...VOLUME_VALIDADO, subject_discovery: { version: 1, searches: [], subjectKeywordIds: [de] } }, { volume_search: volume, volume_source: "google_ads" });

test("C10 · servidor · keyword SOLTA (sem Assunto, grupo ou artigo) com volume, no recorte do grupo do plano: entra na lista; vira principal SÓ da Livre sem volume FORA da identidade (2026-10-17); a de identidade, a Travada e a Livre com volume a recebem como secundária", async () => {
  /*
   * 2026-10-18 · A RÉGUA DO ASSUNTO PELA PRINCIPAL (SDD 2026-10-18 §6.1 e §6.3-b/c) SUBSTITUI a de 17/10 ("identidade fica"):
   *  - volume 0 ("sem média") de identidade → a solta com volume assume (leva o núcleo do Assunto e cabe nele);
   *  - volume 0 fora do Assunto ("Wi-Fi caindo no quarto") → a solta NÃO leva o núcleo do Assunto: a principal fica (régua c);
   *  - volume desconhecido (nunca medida) → nada se decide; a Travada e a Livre com volume ficam (T1/T2).
   */
  for (const caso of [{ nome: "Livre de identidade com volume 0", opcoes: { semMedia: true }, principal: "solta" }, { nome: "Livre fora do Assunto com volume 0", opcoes: { titulo: "Wi-Fi caindo no quarto: o que fazer", semMedia: true }, principal: "k10" }, { nome: "Livre com volume desconhecido", opcoes: {}, principal: "k10" }, { nome: "Travada", opcoes: { lock: "locked" as const }, principal: "k10" }, { nome: "Livre com volume 30", opcoes: { volume: 30 }, principal: "k10" }]) {
    zerar();
    territorios = [territorio(TERRITORIO_AZUL, "Wi-Fi e fibra óptica", "wifi-e-fibra")];
    rows = [linhaDoPlanoAzul("k10", "diferença entre internet e wi-fi", 10, caso.opcoes), linhaDoServidor("solta", "diferença entre internet e wi-fi em casa", {}, { volume_search: 900, volume_source: "google_ads" })];
    grupoDe = new Map([["k10", AZUL]]);
    const run = await prepare({ group: AZUL, targetIds: ["k10"], origin: "plan_sheet" });
    assert.ok(run.keywords.some((k: any) => k.id === "solta"), `${caso.nome}: a solta está na lista da marca`);
    assert.equal(run.targets.some((t: any) => t.id === "solta"), false, "a solta nunca é alvo");
    const proposta = run.proposals.find((p: any) => p.targetId === "k10")!;
    assert.equal(proposta.principalId, caso.principal, `${caso.nome}: ${JSON.stringify(proposta.reasons)}`);
    if (proposta.status === "ready") assert.ok(proposta.memberIds.includes("solta"), `${caso.nome}: a solta reforça`);
  }
});

/* ======================================================================= */
/* C11 · o servidor recusa a troca fora da R1                               */
/* ======================================================================= */

test("C11 · servidor · 'Procurar outra principal' nas 3 linhas: a Travada sem volume e a Livre com volume 10 voltam recusadas COM o motivo; a Livre sem volume troca pela sustentação", async () => {
  zerar();
  territorios = [territorio(TERRITORIO_AZUL, "Wi-Fi e fibra óptica", "wifi-e-fibra")];
  rows = [
    linhaDoPlanoAzul("t1", "roteador wi-fi 6", 20, { lock: "locked" }), apoioDe("s1", "roteador wi-fi 6 vale a pena", 300, "t1"),
    linhaDoPlanoAzul("t2", "internet para home office", 21, { volume: 10 }), apoioDe("s2", "melhor internet para home office", 300, "t2"),
    linhaDoPlanoAzul("t3", "diferença entre internet e wi-fi", 22), apoioDe("s3", "internet e wi-fi qual a diferença", 210, "t3"),
  ];
  grupoDe = new Map(rows.map(r => [r.id, AZUL]));
  const run = await prepare({ group: AZUL, targetIds: ["t1", "t2", "t3"], origin: "plan_sheet", principalChoice: { t1: "s1", t2: "s2", t3: "s3" } });
  const de = (id: string) => run.proposals.find((p: any) => p.targetId === id)!;
  assert.notEqual(de("t1").status, "ready");
  assert.equal(de("t1").principalId, "t1");
  assert.ok(de("t1").reasons.some((r: string) => /^Travada \(/.test(r)), JSON.stringify(de("t1").reasons));
  assert.notEqual(de("t2").status, "ready");
  assert.equal(de("t2").principalId, "t2");
  assert.ok(de("t2").reasons.some((r: string) => /Volume definido no DNA/.test(r)), JSON.stringify(de("t2").reasons));
  assert.equal(de("t3").status, "ready", JSON.stringify(de("t3")));
  assert.equal(de("t3").principalId, "s3");
  await assert.rejects(() => apply(run, { targetIds: ["t1"] }), /prontas/, "o servidor recusa gravar a linha recusada");
  assert.equal(gravacoes.length, 0);
});

/* ======================================================================= */
/* C15 · gravação parcial: falha depois do PATCH e antes do append          */
/* ======================================================================= */

test("C15 · servidor · o gravador cai depois do PATCH da cópia de trabalho e antes do append: nenhuma versão; a cópia de trabalho ficou gravada; nova prévia lê o estado real e grava uma versão só", async () => {
  publicadoLivreSemVolume();
  const run = await prepare({ authorizeReading: { ai: true, measure: true } });
  falharAppend = true;
  const caiu = await apply(run);
  assert.equal(caiu.outcomes[0].status, "failed");
  assert.equal(artigos().length, 0, "nenhuma versão gravada");
  assert.equal(patches, 1, "o PATCH da cópia de trabalho JÁ foi gravado (a gravação não é atômica, SDD §12 risco 5)");
  assert.equal(rows.find(r => r.id === "nova")!.articleFormationRef, rows.find(r => r.id === "pub")!.articleFormationRef, "a composição nova ficou na mesa");
  falharAppend = false;
  // Retomar a MESMA execução: a linha que falhou fica 'failed' (não é tentada de novo) — nada duplicado.
  const retomada = await apply(caiu);
  assert.equal(artigos().length, 0);
  assert.equal(retomada.outcomes[0].status, "failed", JSON.stringify(retomada.outcomes));
  assert.equal(retomada.outcomes[0].message, "O gravador do ArticleDNA caiu (dublê).", "HOJE a linha repete o erro cru do gravador (ver o cenário vermelho logo abaixo) — muda na F3");
  // Nova prévia lê o estado real (a composição que ficou na mesa) e grava UMA versão.
  const nova = await prepare({ authorizeReading: { ai: true, measure: true } });
  const fim = await apply(nova);
  assert.equal(fim.outcomes[0].status, "improved", JSON.stringify(fim.outcomes));
  assert.equal(artigos().length, 1, "uma versão só");
});

test("C15 · servidor · a mensagem da falha diz que houve gravação PARCIAL (a cópia de trabalho ficou) e o caminho", { todo: "vermelho até a F3 (a SDD põe o C15 nos testes da F3 e manda decidir a retomada dos runs 'applying' na F2): hoje a linha só repete o erro cru do gravador, sem dizer que a cópia de trabalho JÁ foi gravada; a SDD §11.1 C15 pede 'a mensagem diz a gravação parcial'" }, async () => {
  publicadoLivreSemVolume();
  const run = await prepare({ authorizeReading: { ai: true, measure: true } });
  falharAppend = true;
  const caiu = await apply(run);
  falharAppend = false;
  assert.match(caiu.outcomes[0].message, /parcial/i);
});

/* ======================================================================= */
/* V4 · a coleta paga cobre a principal que o plano contou (verde, 19/10)    */
/* ======================================================================= */

/*
 * 2026-10-19 · CASO REAL DO VERDE (AdalbaPro): o plano disse "124 consultas" e só 64 foram pagas — as 16 principais
 * (com volume) das propostas que a SERP do cache ainda não tinha caíam em "sem parecer da SERP" SEM `needsValidation`,
 * e a coleta (`validationGroups`) as pulava; a prévia seguinte pedia as mesmas 64. Agora a linha sem parecer por falta
 * de lente fica "precisa coletar", a coleta paga exatamente a principal que o plano contou e a prévia seguinte não
 * pede de novo.
 */
test("V4 · servidor · a principal com volume sem as 4 lentes no cache: a prévia conta a coleta dela, a linha fica 'precisa coletar' (needsValidation) e a coleta autorizada PAGA a mesma principal; depois nada mais é pedido", async () => {
  publicadoLivreSemVolume(URL_DE_IDENTIDADE);
  rows[0] = { ...rows[0], volume_search: 90, volume_source: "google_ads" };
  rows[1] = { ...rows[1], territoryRef: rows[0].territoryRef };
  semLentesAtePagar = new Set(["pub"]);
  const run = await prepare({ authorizeReading: { ai: true, measure: true } });
  const linha: any = run.proposals.find((p: any) => p.targetId === "pub");
  assert.equal(linha.status, "insufficient_evidence", JSON.stringify(linha));
  assert.equal(linha.needsValidation, true, "sem parecer por falta de lente = precisa coletar (antes: ficava sem needsValidation e a coleta pulava)");
  assert.ok(linha.reasons.some((r: string) => /^Falta a SERP da principal “como captar clientes para clínica de estética” no cache \(4 lentes\)/.test(r)), JSON.stringify(linha.reasons));
  assert.equal(run.costs.paidQueries, 4, "o plano conta as 4 lentes da principal");
  const pedido = { brandId: marca, action: "collect" as const, runId: run.runId, decisionHash: run.decisionHash, authorizedCostUsd: run.costs.estimatedCostUsd.max };
  let fim: any = await handleArticleImprovement(runtime(), pedido as any);
  for (let volta = 0; fim.state === "collecting" && volta < 10; volta += 1) fim = await handleArticleImprovement(runtime(), pedido as any);
  assert.equal(fim.state, "prepared", JSON.stringify(fim.notices));
  assert.equal(pago, 4, "a coleta paga a principal que o plano contou");
  assert.equal(fim.costs.paidQueries, 0, "a prévia seguinte não pede a mesma coleta de novo");
  assert.notEqual(fim.proposals.find((p: any) => p.targetId === "pub").needsValidation, true);
  assert.equal(chamadasDeRede, 0);
});

/*
 * 2026-10-19 · V2 (verde) no servidor: a intenção "pela SERP" que a régua c usa para tirar uma secundária é a
 * `evidencia_serp` CONCLUSIVA nas 4 lentes (G1/G9: lente faltando nunca decide). Caso real: "como atrair pacientes
 * para clínica de estética" tem "Local" conclusivo com 3 lentes lidas — não decide.
 */
test("V2 · servidor · a intenção da SERP do KeywordDNA só conta com as 4 lentes e conclusiva (3 lentes, misto ou fraca = a SERP não decidiu)", () => {
  const evidencia = (intent: Record<string, unknown>, lidas: number) => ({ evidencia_serp: { intent, funnel: { strength: "conclusive", value: "TOFU" }, versionId: "kq:v1", contentHash: sha("c"), collectedAt: "2026-09-26T20:09:00.912Z", semanticState: "conclusive", lentes: { lidas, intent: lidas, funnel: lidas } } });
  const linha = (semantic: Record<string, unknown>) => linhaDoServidor("x", "como atrair pacientes para clínica de estética", semantic) as Parameters<typeof observedSerpIntentOfRow>[0];
  assert.equal(observedSerpIntentOfRow(linha(evidencia({ strength: "conclusive", value: "Local" }, 4))), "Local");
  assert.equal(observedSerpIntentOfRow(linha(evidencia({ strength: "conclusive", value: "Local" }, 3))), null, "3 lentes não decidem");
  assert.equal(observedSerpIntentOfRow(linha(evidencia({ strength: "mixed", value: null, rotulos: ["Local", "Comercial"], cobertura: 0.94 }, 4))), null, "misto não decide");
  assert.equal(observedSerpIntentOfRow(linha({})), null, "sem evidência");
});

/* ======================================================================= */
/* V5 · a guarda de retrabalho barra UMA coleta, nunca a coleta inteira     */
/* ======================================================================= */

/*
 * 2026-10-19 · CASO REAL DO VERDE (02:17 UTC): "Autorizar 84 consulta(s)…" pagou 12 e parou com 409
 * REWORK_SAME_REFUSAL no plano por grupo de UM grupo (o artigo 24679c44, cuja coleta paga de 18/10 22:34 deu
 * inconclusiva e cujo cache em São Paulo vale) — a execução ficou presa em "collecting" e a tela não disse nada.
 * Agora: (1) a prévia conhece o grupo barrado (o plano devolve a recusa), não o cobra e a linha diz a recusa e a
 * saída; (2) se a guarda barrar um grupo só na coleta, ele vira aviso e a coleta segue com os outros.
 */
function doisPublicados() {
  publicadoLivreSemVolume(URL_DE_IDENTIDADE);
  rows[0] = { ...rows[0], volume_search: 90, volume_source: "google_ads" };
  rows[1] = { ...rows[1], territoryRef: rows[0].territoryRef };
  const url2 = "https://adalbapro.com.br/captacao-de-pacientes/marketing-odontologico-para-clinicas";
  const dna2 = { entidade_central: "marketing odontológico", problema_percebido: "poucos pacientes no consultório", publico: "dentistas", resultado_desejado: "agenda cheia" };
  rows.push(linhaDoServidor("pub2", "marketing odontológico para clínicas", dna2, { territoryRef: rows[0].territoryRef, isPublished: true, publishedUrl: url2, primaryKeywordPolicy: "reviewable", volume_search: 60, volume_source: "google_ads" }));
  rows.push(linhaDoServidor("nova2", "marketing odontológico para clínicas pequenas", dna2, { territoryRef: rows[0].territoryRef, volume_search: 30, volume_source: "google_ads" }));
  paginasPublicadas.push({ keywordId: "pub2", keyword: "marketing odontológico para clínicas", url: url2, canonical: url2, slug: url2.split("/").at(-1), post: "reviewable" });
  semLentesAtePagar = new Set(["pub", "pub2"]);
}
const coletar = async (run: any) => {
  const pedido = { brandId: marca, action: "collect" as const, runId: run.runId, decisionHash: run.decisionHash, authorizedCostUsd: run.costs.estimatedCostUsd.max };
  let fim: any = await handleArticleImprovement(runtime(), pedido as any);
  for (let volta = 0; fim.state === "collecting" && volta < 10; volta += 1) fim = await handleArticleImprovement(runtime(), pedido as any);
  return fim;
};

/*
 * 2026-10-19 (tarde) · DECISÕES DO DONO: "tem que fazer uma nova coleta da SERP quando refizer os processos"; a coleta que
 * só enche o cache de UMA keyword (sem composição) não entra no registro da guarda de retrabalho; a recoleta ao refazer
 * não é barrada. SUBSTITUI, no refazedor, "a coleta já paga e inconclusiva sai do custo e da coleta" (V5 de 19/10, manhã):
 * o plano conta e a coleta paga só o que falta no cache (G3); a guarda de retrabalho continua valendo para a composição.
 */
test("V5 · servidor · no refazedor, a coleta da principal (uma keyword só) já paga e inconclusiva NÃO é barrada: entra no custo, é paga no que falta no cache e o pedido leva o motivo do refazer", async () => {
  doisPublicados();
  barradosPelaGuarda = new Set(["pub2"]);
  const run = await prepare({ authorizeReading: { ai: true, measure: true } });
  assert.equal(run.costs.paidQueries, 8, "as duas principais entram no custo (nada barrado)");
  assert.equal(run.costs.reworkRefused, undefined);
  assert.equal(run.proposals.find((p: any) => p.targetId === "pub2")?.needsValidation, true);
  const fim = await coletar(run);
  assert.equal(fim.state, "prepared", JSON.stringify(fim.notices));
  assert.equal(pago, 8, "as duas são pagas: a recoleta ao refazer não é barrada");
  assert.ok(motivosDoRefazer.length > 0 && motivosDoRefazer.every(m => /Melhorar publicados/.test(m)), JSON.stringify(motivosDoRefazer));
  assert.equal(chamadasDeRede, 0);
});

test("V5 · servidor · a coleta de uma keyword só nunca é barrada pela guarda (a rota tira do portão o grupo de 1 keyword); a composição de 2+ continua sob a guarda", () => {
  const rota = codigoSemComentarios("lib/server/arquiteto-serp-http.ts");
  assert.match(rota, /groups: parsed\.data\.groups\.filter\(group => group\.keywordIds\.length > 1\)/);
  const melhoria = codigoSemComentarios("lib/server/arquiteto-article-improvement.ts");
  assert.match(melhoria, /run\.origin === "plan_sheet" \? \{\} : \{ reworkOverride: \{ reason: REFAZER_SERP_REWORK_REASON \} \}/);
});

/*
 * 2026-10-19 (tarde) · DECISÃO DO DONO: "SERP coletada antes da localidade de São Paulo (nacional) não vale como
 * evidência para decidir o refazer". A `evidencia_serp` do Minerador (nacional, sem localidade gravada) não vira a
 * intenção observada e a intenção que ela pôs na qualificação dá lugar à da Lógica — com a marca numa cidade.
 */
test("V10 · servidor · com a marca em São Paulo (cidade), a SERP nacional do Minerador não decide a intenção: nem a observada, nem a da qualificação (vale a da Lógica); marca nacional, a régua de antes", async () => {
  const montar = () => {
    publicadoLivreSemVolume(URL_DE_IDENTIDADE);
    const evidencia = { evidencia_serp: { intent: { strength: "conclusive", value: "Local" }, funnel: { strength: "conclusive", value: "TOFU" }, versionId: "kq:v1", contentHash: sha("c"), collectedAt: "2026-09-25T05:41:04.374Z", semanticState: "conclusive", lentes: { lidas: 4, intent: 4, funnel: 4 } }, intencao_principal: "Comercial" };
    for (const row of rows) {
      Object.assign(row.analise_semantica, evidencia);
      const pacote = row.canonicalWorkflow.payload.approvedDna?.analiseSemantica;
      if (pacote) Object.assign(pacote, evidencia);
      row.canonicalWorkflow.payload.semanticQualification = { intent: "Local", semanticState: "conclusive" };
    }
  };
  montar();
  territorioDaMarca = BRAND_SERP_SAO_PAULO_CITY.territory;
  const local = await prepare({ authorizeReading: { ai: true, measure: true } });
  const alvo: any = local.targets.find((t: any) => t.id === "pub")!;
  assert.equal(alvo.observedIntent, undefined, "a SERP nacional não é a intenção observada");
  assert.equal(alvo.signals.intent, "Comercial", "vale a intenção da Lógica, não a que a SERP nacional pôs na qualificação");
  assert.ok(local.keywords.every((k: any) => k.observedIntent === undefined));
  montar();
  const nacional = await prepare({ authorizeReading: { ai: true, measure: true } });
  assert.equal((nacional.targets.find((t: any) => t.id === "pub") as any).observedIntent, "Local", "marca nacional: a régua de antes");
  assert.equal(chamadasDeRede, 0);
});

test("C2/C3 · estrutural · B monta o DNA no servidor e não chama o fechamento canônico do Silo (a lista do que sai na F2)", () => {
  const servidor = codigoSemComentarios("lib/server/arquiteto-article-improvement.ts");
  assert.match(servidor, /const draft = deterministicArticleDnaPayload\(group, context\.brandId\);/, "HOJE: B monta o ArticleDNA no servidor (applyTarget) — muda na F2");
  assert.match(servidor, /const comPlano = applyDeclaredPlanToArticleDna\(payload, /);
  assert.doesNotMatch(servidor, /runCanonicalSiloClosure|consolidateSiloFromWorkingCopyCore|persistSiloPairAtomic/, "HOJE: B não fecha o Silo — muda na F2 (o fechamento canônico no mesmo ato)");
});
