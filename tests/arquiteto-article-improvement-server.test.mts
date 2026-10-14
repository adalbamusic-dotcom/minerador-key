import assert from "node:assert/strict";
import { register } from "node:module";
import { mock, test } from "node:test";
import { ArticleDNASchema, ProvisionalArticleGroupSchema } from "../lib/arquiteto/contracts.ts";
import { articleSerpBaseHash, articleSerpIntentOf, resolveArticleFormationSerpState } from "../lib/arquiteto/article-serp-gate.ts";
import { suggestArticleSlug } from "../lib/arquiteto/article-formation.ts";
import { SERP_SUBJECT_LENS_LABELS } from "../lib/arquiteto/serp-subject-overlap.ts";
import { linhaDaMesa, declarado } from "./arquiteto-assunto-fixtures.mts";
import { deriveLogicalKeywordBatchItem } from "../lib/minerador/logical-batch.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";

// Only the I/O boundaries are simulated. The planner, orchestration, ArticleDNA
// construction, versioning and exact composition checks run their real code.
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n) {
  if(s==='next/server') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class NextRequest extends Request {}')}; return n(s,c); }`)}`);
globalThis.fetch = async () => { throw new Error("Network forbidden in improvement tests"); };
const brandId = "61d2e019-f44f-4fa3-af2f-d86b95628ab3", actorUserId = "11111111-1111-4111-8111-111111111111";
const oldId = "aaaaaaaa-0000-4000-8000-000000000001", newId = "aaaaaaaa-0000-4000-8000-000000000002";
const territory = "territory:0b8f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const url = "https://adalbapro.com.br/captacao-de-pacientes/como-captar-clientes-para-clinica-de-estetica";
const semantic = { entidade_central: "captação de pacientes", problema_percebido: "poucos agendamentos", publico: "gestores de clínicas", resultado_desejado: "ampliar agendamentos", intencao_principal: "Informativa", modificadores: "agenda da clínica" };
let rows: any[], articles: any[], journal: any[], assessments: any[], marker: any;
let paid = 0, plansMissing = 0, failReadback = false, failPatch = false, incomplete = false, wrongRole = false;
let external = false, qualification: string[] = [];
// Leitura da IA: keywords com SERP sem páginas em comum, ordem dos passos e lentes que só chegam depois de pagar.
let disjoint = new Set<string>(), events: string[] = [], incompleteUntilPaid = false;
// Keywords que o Google separa da principal: a composição com elas diverge (par "nenhuma" nas 4 lentes).
let diverge = new Set<string>();
// Volume de outra era (provider antigo): medido de novo no Google Ads no preparo, gravado no "Gravar melhorias".
let legacyVolumes = new Map<string, number | null>(), legacyAsked: string[] = [], legacyFail = false, measured: string[][] = [];
let logicRan: string[] = [];
// D2(a): a principal declarada sem volume cujo parecer vem das sustentações (o que a rota real da SERP devolve).
let supportBasisPrincipal: string | null = null;
// D2(a): a principal declarada sem SERP no cache e sem sustentação com as 4 lentes — a rota não devolve parecer.
let noSerpPrincipal: string | null = null;
const discoveredPhrase = "captação de pacientes para clínica de estética";
// F3 · ler antes de buscar: consultas ao Google Ads pela porta da medição inteira, gravações por replay e o que o Minerador já sabe.
let medicoesProvider: string[][] = [], replays: string[] = [], knownInBrand = new Map<string, any>();
const clone = (v: any) => structuredClone(v);
// Postgres JSONB does not keep key order and drops undefined: the mock behaves the same.
const jsonb = (v: any): any => Array.isArray(v) ? v.map(jsonb) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([p], [q]) => q.length - p.length || (p < q ? 1 : -1)).map(([k, x]) => [k, jsonb(x)])) : v;
const json = (data: any) => new Response(JSON.stringify({ success: true, data }));
class Query {
  filters: [string, any][] = [];
  eq(k: string, v: any) { this.filters.push([k,v]); return this; }
  select() { return this; }
  // A busca da execução reaproveitável (2026-10-12): filtro por campo do payload, mais recente primeiro.
  gte() { return this; }
  order() { return this; }
  limit() { return this; }
  matches(r: any) { return this.filters.every(([k,v]) => k.startsWith("payload->>") ? r.payload?.[k.slice(10)] === v : r[k] === v); }
  async maybeSingle() { return { data: clone(journal.find(r => this.matches(r)) ?? null), error: null }; }
  then(resolve: any, reject: any) { return Promise.resolve({ data: journal.filter(r => this.matches(r)).reverse().map(clone), error: null }).then(resolve, reject); }
}
const context: any = { brandId, actorUserId, module: "arquiteto", action: "edit", supabase: { from: () => new Query() } };
const runtime: any = { context, authorize: async (module: string, action: string) => ({ ...context, module, action }) };
mock.module("../lib/server/arquiteto-territory-store.ts", { namedExports: { listTerritoryWorkflowItems: async () => [{territoryRef:territory,territory:{lifecycleStatus:"confirmed",centralEntity:"clínica de estética",macroIntent:"Informativa",slugState:{publishedSlug:"captacao-de-pacientes"}}}] } });
const workspace = () => ({ workflowItems: [], keywords: clone(rows), articleDnas: clone(articles), siloDnas: [] });
function setup() {
  journal=[]; articles=[]; assessments=[]; marker=null; paid=0; plansMissing=0; failReadback=false; failPatch=false; incomplete=false; wrongRole=false; external=false;qualification=[];disjoint=new Set();events=[];incompleteUntilPaid=false;diverge=new Set();legacyVolumes=new Map();legacyAsked=[];legacyFail=false;measured=[];logicRan=[];supportBasisPrincipal=null;noSerpPrincipal=null;medicoesProvider=[];replays=[];knownInBrand=new Map();
  rows = [oldId,newId].map((id,i) => ({ id, brand_id: brandId, keyword: i ? "captação de pacientes para clínica de estética" : "como captar clientes para clínica de estética", intent: "Informativa", volume_search: i ? 50 : null, volume_source: i ? "google_ads" : null, analise_semantica: semantic, isPublished: !i, publishedUrl: !i ? url : undefined, primaryKeywordPolicy: !i ? "reviewable" : "free", territoryRef: i ? "territory:other" : territory, keywordDnaRef: { entityId: id, versionId: `${id}:v1`, contentHash: `sha256:${"a".repeat(64)}` }, canonicalWorkflow: { id: `workflow-${id}`, lockVersion: 1, payload: { semanticQualification: { intent: "Informativa", semanticState: "conclusive" }, approvedDna: { analiseSemantica: semantic } } } }));
}
mock.module("../lib/arquiteto/canonical-workspace.ts", { namedExports: { buildCanonicalWorkflowWorkspaceItems: (_w: any,k: any) => k } });
mock.module("../lib/server/arquiteto-workspace.ts", { namedExports: { loadCanonicalArquitetoWorkspace: async () => workspace(), createMineradorArquitetoHandoff: async () => { assert.ok(external);qualification.push("handoff"); } } });
mock.module("../lib/server/arquiteto-differentiation-store.ts", { namedExports: {
  readDifferentiationBrandKeywords: async () => ({ pages: rows[0].isPublished ? [{ keywordId: oldId, keyword: rows[0].keyword, url, canonical: url, slug: url.split('/').at(-1), post: "reviewable" }] : [], existingByNormalized: new Map(rows.map(r=>[normalizeKeyword(r.keyword),r.id])), knownVolumeByNormalized: knownInBrand }),
  readPublishedFootprints: async (_c: any, queries: any[]) => ({ missingLenses: [], footprints: queries.map(q => ({ ...q, lenses: SERP_SUBJECT_LENS_LABELS.map(lens => ({ lens, urls: (disjoint.has(q.keywordId) ? ["https://outro.org/1","https://outro.org/2","https://outro.org/3","https://outro.org/4"] : ["https://example.org/1","https://example.org/2","https://example.org/3","https://example.org/4"]) })) })) }),
} });
mock.module("../lib/server/arquiteto-differentiation-runtime.ts", { namedExports: {
  readGoogleAdsAverageVolumes: async (input: any) => {
    if (!external) {
      legacyAsked.push(...input.keywords);
      if (legacyFail) throw new Error("Google Ads fora do ar");
      return new Map(input.keywords.filter((k: string) => legacyVolumes.has(normalizeKeyword(k))).map((k: string) => [normalizeKeyword(k), legacyVolumes.get(normalizeKeyword(k))!]));
    }
    return new Map([[normalizeKeyword(discoveredPhrase),50]]);
  },
  // A IA real nunca é chamada nos testes: a do runtime injetado é simulada.
  proposeArticleImprovementAiPicks: async () => { throw new Error("IA real proibida nos testes"); },
} });
mock.module("../lib/server/arquiteto-serp-http.ts", { namedExports: { handleArchitectFormationSerp: async (req: Request) => {
  const body = await req.json();
  // Same limits as the real route: at most 20 groups, each a valid group.
  assert.ok(body.groups.length >= 1 && body.groups.length <= 20, `groups per request: ${body.groups.length}`);
  for (const group of body.groups) ProvisionalArticleGroupSchema.parse(group);
  if (body.mode === "plan") return json({ plan: { paidQueries: plansMissing, estimatedCostUsd: { min: plansMissing * .002, max: plansMissing * .003 }, missingDetails: [] } });
  if (body.authorizedPaidQueries) { paid += body.authorizedPaidQueries; incompleteUntilPaid = false; }
  else assert.equal(body.cacheOnly, true, "no implicit provider call");
  for (const group of body.groups) {
    if (noSerpPrincipal && group.principalSuggestion.keywordId === noSerpPrincipal) continue;
    const record = { candidateRef: group.id, payload: { formationBaseHash: body.formationBaseHashes[group.id], verdict: group.keywordIds.some((id: string) => diverge.has(id)) ? "DIVERGENCE" : "INCONCLUSIVE", interpretation: { lenses: { perLens: SERP_SUBJECT_LENS_LABELS.map(lens => ({ lens, pairs: group.keywordIds.filter((id: string) => diverge.has(id)).map((id: string) => ({ left: group.principalSuggestion.keywordId, right: id, level: "nenhuma" })) })), requested: SERP_SUBJECT_LENS_LABELS, observed: incomplete || incompleteUntilPaid ? SERP_SUBJECT_LENS_LABELS.slice(0,3) : SERP_SUBJECT_LENS_LABELS, missing: incomplete || incompleteUntilPaid ? ["mobile-ios"] : [] } }, assessment: { id: `assessment:${group.id}`, contentHash: `sha256:${"b".repeat(64)}`, keywordDnaReferences: group.keywordIds.map((keywordId: string) => ({ keywordId })), recommendations: group.keywordIds.map((keywordId: string) => ({ keywordId, currentRole: wrongRole ? "secundaria" : group.roles[keywordId] })), ...(supportBasisPrincipal && group.principalSuggestion.keywordId === supportBasisPrincipal ? { supportBasis: { kind: "declared_principal_supports", principalKeywordId: supportBasisPrincipal, anchorKeywordId: group.keywordIds.find((id: string) => id !== supportBasisPrincipal), supportKeywordIds: group.keywordIds.filter((id: string) => id !== supportBasisPrincipal), reason: "Parecer pelas sustentações: “captação de pacientes para clínica de estética” — a principal declarada “Claro Vivo ou TIM internet” não tem volume nem SERP no cache (D2a); nenhuma coleta nova foi feita." } } : {}) } } };
    assessments = [...assessments.filter(a => a.candidateRef !== group.id), record];
  }
  return json({});
} } });
mock.module("../lib/server/arquiteto-article-serp-store.ts", { namedExports: {
  listArticleFormationSerpAssessments: async () => clone(assessments),
  saveArticleFormationSerpAssessment: async (_c:any,input:any) => {const record={candidateRef:input.candidateRef,payload:{...clone(input),humanResolution:null}};assessments=[...assessments.filter(a=>a.candidateRef!==input.candidateRef),record];return record;},
  resolveArticleFormationSerpAssessment: async (_c: any, input: any) => { const a=assessments.find(a=>a.candidateRef===input.candidateRef); a.payload.humanResolution=clone(input.resolution); return a; },
  readbackArticleFormationSerpAssessment: async (_c: any,id: string) => clone(assessments.find(a=>a.candidateRef===id)),
  // F2 das listas leves (2026-10-14): a melhoria relê UM parecer pelo candidateRef.
  findArticleFormationSerpAssessment: async (_c: any,id: string) => clone(assessments.find(a=>a.candidateRef===id)) ?? null,
} });
mock.module("../lib/server/arquiteto-workspace-http.ts", { namedExports: { handleArchitectWorkspacePatch: async (req: Request) => {
  if(failPatch) throw new Error("fixture write failed");
  const body=await req.json();
  for(const u of body.updates) { const r=rows.find(r=>r.canonicalWorkflow.id===u.workflowItemId); assert.equal(u.expectedLock,r.canonicalWorkflow.lockVersion); Object.assign(r,u.assignment); Object.assign(r.canonicalWorkflow.payload,u.assignment); r.canonicalWorkflow.lockVersion++; }
  return json({});
} } });
mock.module("../lib/server/minerador-google-ads-metrics-http.ts", { namedExports: { handleGoogleAdsKeywordMetrics: async (req: Request, _params: any, _ctx: any, options: any = {}) => {
  // F3 · replay: grava a medição já recebida, sem consultar o Google Ads (nada entra em medicoesProvider).
  if (options.replay) {
    const body = await req.json(); const textos = body.keywordIds.map((id: string) => rows.find(r => r.id === id).keyword);
    const lido = await options.replay({ keywords: textos });
    for (const metric of lido.metrics) { replays.push(metric.matchedRequestedKeywords[0]); const row = rows.find(r => normalizeKeyword(r.keyword) === normalizeKeyword(metric.matchedRequestedKeywords[0])); row.volume_search = metric.averageMonthlySearches; row.volume_source = "google_ads"; }
    if (external) qualification.push("metrics");
    return json({ projections: body.keywordIds.map((keywordId: string) => ({ keywordId })) });
  }
  assert.ok(external);qualification.push("metrics");rows[1].volume_search=50;rows[1].volume_source="google_ads";return json({}); } } });
mock.module("../lib/server/arquiteto-persistence.ts", { namedExports: { appendArquitetoArtifact: async (_c: any,_type: any,version: any) => { ArticleDNASchema.parse(version.payload); articles.push(clone(version)); return { version }; } } });
mock.module("../lib/server/arquiteto-article-formation-marker-store.ts", { namedExports: {
  readArticleFormationMarker: async () => clone(marker), saveArticleFormationMarker: async (_c: any,payload: any) => { marker={payload:clone(payload)}; }, readbackArticleFormationMarker: async () => failReadback ? {payload:{concludedFormations:[]}} : clone(marker),
} });
mock.module("../lib/server/pipeline-repositories.ts", { namedExports: { WorkflowRepository: class {
  context: any; constructor(c: any){this.context=c;}
  async create(input: any){ journal.push({id:journal.length?`journal-${journal.length}`:"journal", marca_id:this.context.brandId,subject_type:input.subjectType,subject_id:input.subjectId,stage:input.stage,payload:jsonb(clone(input.payload)),lock_version:1}); }
  async update(id: string,lock: number,input: any){const r=journal.find(r=>r.id===id&&r.marca_id===this.context.brandId); assert.equal(r.lock_version,lock); Object.assign(r,{...clone(input),...(input.payload?{payload:jsonb(clone(input.payload))}:{})});r.lock_version++;return{data:clone(r)};}
} } });
const subjectImportActual = await import("../lib/minerador/subject-discovery-import.ts");
mock.module("../lib/minerador/subject-discovery-import.ts", { namedExports: { ...subjectImportActual, importSubjectDiscoveryWithCore: async (input:any)=>{
  assert.ok(external);qualification.push("import"); const logic=deriveLogicalKeywordBatchItem({id:newId,keyword:discoveredPhrase,location:null,intent:null,analise_semantica:{}},null,new Date().toISOString());
  const jaNoMinerador=knownInBrand.get(normalizeKeyword(input.request.items[0].keyword));
  rows.push({...clone(rows[0]),id:newId,keyword:input.request.items[0].keyword,isPublished:false,publishedUrl:undefined,volume_search:jaNoMinerador?.known.volume??null,volume_source:jaNoMinerador?"google_ads":null,territoryRef:null,analise_semantica:logic.update.analise_semantica,primaryKeywordPolicy:"free",keywordDnaRef:{entityId:newId,versionId:`${newId}:v1`,contentHash:`sha256:${"c".repeat(64)}`},canonicalWorkflow:{id:`workflow-${newId}`,lockVersion:1,payload:{approvedDna:{analiseSemantica:logic.update.analise_semantica}}}});return {ok:true};
} } });
mock.module("../lib/server/minerador-keyword-decision-core.ts", { namedExports: {
  runKeywordLogicWithCore: async (input:any)=>{
    // Membro sem intenção: a Lógica do Minerador (grátis, determinística) preenche a intenção.
    if (!external) { logicRan.push(...input.keywordIds); for (const id of input.keywordIds) { const row = rows.find(r => r.id === id); row.intent = "Informativa"; row.analise_semantica = { ...row.analise_semantica, intencao_principal: "Informativa" }; } return {readbackConfirmed:true,missingIds:[]}; }
    qualification.push("logic");return {readbackConfirmed:true,missingIds:[]};},
  readDecisionKeywords: async()=>({rows:[rows[1]],missingCount:0}),keywordDecisionEntries:()=>[{outcome:"applied"}],
  applyKeywordDecisionEntries:async()=>{qualification.push("approve");return[{outcome:"applied"}];},
} });
mock.module("../lib/server/google-ads-canonical.ts", { namedExports: {
  resolveGoogleAdsCanonicalContext:async()=>{assert.ok(external);return {customerId:"1234567890",managerCustomerId:null,targeting:null};},
  createGoogleAdsCanonicalClient:async()=>({client:{}}),targetingToProviderInput:()=>({}),defaultGoogleAdsCanonicalTargeting:()=>({}),
} });
mock.module("../lib/google/ads/keyword-ideas.ts",{namedExports:{generateGoogleAdsKeywordIdeas:async()=>{events.push("busca");return {ideas:[{keyword:discoveredPhrase}],nextPageToken:null};}}});
mock.module("../lib/server/arquiteto-published-reinforcement.ts", { namedExports: { stableUuid: (...parts: string[]) => parts.includes("improvement") ? "dddddddd-0000-4000-8000-000000000001" : "eeeeeeee-0000-4000-8000-000000000001" } });
mock.module("../lib/server/minerador-volume-measure.ts", { namedExports: { measureKeywordVolume: async (_c: any, ids: string[], deps: any = {}) => {
  measured.push([...ids]);
  // F3 · com a medição guardada, o núcleo do "Medir volume" grava pelo replay (nenhuma consulta nova).
  if (deps.measure) {
    await deps.measure(new Request("http://localhost/medir", { method: "POST", body: JSON.stringify({ keywordIds: ids }) }), { params: Promise.resolve({ brandId }) }, _c);
    return { outcomes: ids.map(id => { const row = rows.find(r => r.id === id); return { keywordId: id, keyword: row.keyword, outcome: row.volume_source === "google_ads" ? "confirmed" : "failed", volume: row.volume_search ?? null }; }) };
  }
  return { outcomes: ids.map(id => { const row = rows.find(r => r.id === id); const v = legacyVolumes.get(normalizeKeyword(row.keyword)); if (typeof v === "number") { row.volume_search = v; row.volume_source = "google_ads"; } return { keywordId: id, keyword: row.keyword, outcome: typeof v === "number" ? "confirmed" : "failed", volume: v ?? null, reason: typeof v === "number" ? undefined : "Sem medição confirmada." }; }) };
} } });
const {handleArticleImprovement,projectImprovementRun}=await import("../lib/server/arquiteto-article-improvement.ts");
function assertReloadGate(kind:"published"|"subject") {
  const formation=marker.payload.concludedFormations[0];
  const bound=assessments.find(a=>a.candidateRef===formation.candidateRef).payload;
  const expected=articleSerpBaseHash({territoryRef:territory,principalKeywordId:formation.principalKeywordId,roles:formation.members,suggestedSlug:kind==="published"?null:suggestArticleSlug({principal:rows.find(r=>r.id===formation.principalKeywordId),siloSlug:"captacao-de-pacientes"}),intents:formation.members.map((m:any)=>{const row=rows.find(r=>r.id===m.keywordId);return {keywordId:m.keywordId,intent:articleSerpIntentOf(row)};}),siloContext:{centralEntity:"clínica de estética",macroIntent:"Informativa"}});
  assert.equal(bound.formationBaseHash,expected);
  const gate=resolveArticleFormationSerpState({candidateRef:formation.candidateRef,expectedBaseHash:expected,observed:{formationBaseHash:bound.formationBaseHash,verdict:bound.verdict,lensesComplete:true,humanDecisionBaseHash:bound.humanResolution.formationBaseHash}});
  assert.notEqual(gate.state,"stale");assert.notEqual(gate.state,"missing");
}
const LER={ai:true,measure:true} as const;
// F3 (2026-10-14): sem `authorizeReading` o prepare só LÊ (nada de IA nem de Google Ads); estes cenários são os da leitura autorizada.
const prepare=()=>handleArticleImprovement(runtime,{brandId,action:"prepare",authorizeReading:LER});
const apply=(run: any)=>handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:run.decisionHash});

test("single acceptance swaps Livre, preserves published identity, transfers, materializes and reads back", async()=>{
  setup();const run=await prepare(); assert.equal(run.proposals[0].status,"ready",JSON.stringify(run.proposals)); assert.equal(paid,0); assert.equal(articles.length,0);
  const result=await apply(run); assert.equal(result.state,"complete");assert.equal(result.outcomes[0].status,"improved",JSON.stringify(result.outcomes));
  const dna=articles[0].payload;assert.equal(dna.principalKeywordId,newId);assert.deepEqual(dna.secondaryKeywordIds,[oldId]);assert.equal(dna.canonical,url);assert.equal(dna.suggestedSlug,url.split('/').at(-1));assert.equal(dna.territoryRef,territory);assert.equal(rows[1].territoryRef,territory);assert.equal(dna.primaryKeywordMetrics.volumeSearch,50);
  assert.equal(assessments.find(a=>a.candidateRef===oldId).payload.humanResolution.decidedBy,actorUserId);
  const resume=await apply(result);assert.equal(resume.state,"complete");assert.equal(articles.length,1);assert.equal(paid,0);
  assert.deepEqual(projectImprovementRun(result).beforeAssignments,{});assertReloadGate("published");
});
test("stale hash and other actor or brand refuse the saved preview",async()=>{
  setup();const run=await prepare();await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:"0".repeat(64)}),/prévia mudou/);
  await assert.rejects(()=>handleArticleImprovement({...runtime,context:{...context,actorUserId:"other"}},{brandId,action:"status",runId:run.runId}),/ator/);
  await assert.rejects(()=>handleArticleImprovement(runtime,{brandId:"other",action:"status",runId:run.runId}),/Marca divergente/);assert.equal(articles.length,0);
});
test("incomplete lenses and incorrect final primary cannot appear ready",async()=>{
  for(const problem of ["incomplete","wrongRole"]){setup();if(problem==="incomplete")incomplete=true;else wrongRole=true;const run=await prepare();assert.equal(run.proposals[0].status,"insufficient_evidence");await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:run.decisionHash,targetIds:[oldId]}),/prontas/);assert.equal(articles.length,0);}
});
test("readback failure never announces material improvement and keeps the accepted set",async()=>{
  setup();const run=await prepare();failReadback=true;const result=await apply(run);assert.equal(result.outcomes[0].status,"failed");assert.deepEqual(result.acceptedIds,[oldId]);const again=await apply(result);assert.equal(again.outcomes[0].status,"failed");assert.equal(articles.length,1);
});
test("write failure does not emit approved DNA",async()=>{
  setup();const run=await prepare();failPatch=true;const result=await apply(run);assert.equal(result.outcomes[0].status,"failed");assert.equal(articles.length,0);assert.equal(paid,0);
});
test("changed architecture rejects cost authorization before any provider call",async()=>{
  setup();plansMissing=1;const run=await prepare();rows[0].keyword="Changed after preview";await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"collect",runId:run.runId,decisionHash:run.decisionHash,authorizedCostUsd:run.costs.estimatedCostUsd.max}),/arquitetura mudou/);assert.equal(paid,0);
});
test("cost ceiling is enforced server-side independently of interface",async()=>{
  setup();plansMissing=1;const run=await prepare();await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"collect",runId:run.runId,decisionHash:run.decisionHash,authorizedCostUsd:2}),/teto total/);assert.equal(paid,0);
});
test("declared subject automatically forms around a measured principal and survives working-copy reload",async()=>{
  setup();
  const subject=linhaDaMesa({id:oldId,keyword:"Como transformar interesse em agendamento na clínica",brandId,semantic:{...semantic,...declarado("Apresentar os serviços e conduzir os contatos para a agenda.")}});
  rows[0]={...rows[0],...subject,isPublished:false,publishedUrl:undefined};rows[0].canonicalWorkflow.lockVersion=1;
  const run=await prepare();assert.equal(run.targets[0].kind,"subject");assert.equal(run.proposals[0].status,"ready",JSON.stringify(run.proposals));
  const result=await apply(run);assert.equal(result.outcomes[0].status,"improved",JSON.stringify(result.outcomes));
  const dna=articles[0].payload;assert.equal(dna.subject.keywordId,oldId);assert.equal(dna.principalKeywordId,newId);assert.equal(dna.keywordReferences.length,1);assert.equal(dna.keywordReferences.some((r:any)=>r.keywordId===oldId),false);assert.equal(rows[1].articleSubjectAnchor.subjectKeywordId,oldId);assertReloadGate("subject");assert.equal(dna.suggestedSlug,suggestArticleSlug({principal:rows[1],siloSlug:"captacao-de-pacientes"}));
});
/*
 * F4 · O ARQUITETO SÓ LÊ (SDD 2026-10-13 `sdd-arquiteto-so-le-e-listas-leves`,
 * item 2; ajuste declarado 2026-10-14). Antes: a ideia externa era importada,
 * qualificada, medida, aprovada e enviada NO MINERADOR pelo "Gravar melhorias"
 * (qualification = import, logic, metrics, approve, handoff). Agora a linha fica
 * "Precisa do Minerador", a sugestão é gravada para a caixa do Minerador e o
 * apply é recusado sem nenhuma chamada ao Minerador.
 */
test("F4 · ideia externa: 'Precisa do Minerador', vira sugestão do Arquiteto e o apply não toca o Minerador",async()=>{
  setup();external=true;rows=rows.slice(0,1);
  const logic=deriveLogicalKeywordBatchItem({id:oldId,keyword:discoveredPhrase,location:null,intent:null,analise_semantica:{}},null,new Date().toISOString());
  rows[0].analise_semantica=logic.update.analise_semantica;rows[0].canonicalWorkflow.payload.approvedDna.analiseSemantica=logic.update.analise_semantica;rows[0].canonicalWorkflow.payload.semanticQualification={};
  const run=await handleArticleImprovement(runtime,{brandId,action:"prepare",discover:true,authorizeReading:LER});
  const p=run.proposals[0];
  assert.equal(p.status,"insufficient_evidence",JSON.stringify(run.proposals));assert.equal(p.needsMinerador?.newKeywordIds.length,1);assert.match(p.reasons.join(" "),/Precisa do Minerador: 1 keyword\(s\) nova\(s\)/);
  assert.equal(qualification.length,0);assert.equal(rows.length,1);
  // A sugestão: item de workflow do Arquiteto, chave = a execução; nada no Minerador.
  const sugestao=journal.find(r=>r.subject_type==="architect_minerador_suggestions");
  assert.ok(sugestao,"a sugestão foi gravada");assert.equal(sugestao.subject_id,`improvement:${run.runId}`);assert.equal(sugestao.stage,"architect");
  assert.equal(sugestao.payload.items.length,1);assert.equal(sugestao.payload.items[0].kind,"new_keyword");assert.equal(sugestao.payload.items[0].keyword,discoveredPhrase);
  assert.equal(sugestao.payload.items[0].keywordId,null);assert.equal(sugestao.payload.items[0].targetKeywordId,oldId);assert.equal(sugestao.payload.items[0].searchId,run.runId);
  assert.ok(run.notices.some((n:string)=>/sugestão\(ões\) foram para o Minerador/.test(n)),JSON.stringify(run.notices));
  // O pedido antigo de aprovar as novas é recusado com o caminho; a linha não é aceitável.
  await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:run.decisionHash,approveNewKeywords:true}),/não aprova keyword no Minerador/);
  await assert.rejects(()=>handleArticleImprovement(runtime,{brandId,action:"apply",runId:run.runId,decisionHash:run.decisionHash,targetIds:[oldId]}),/precisam do Minerador/);
  assert.deepEqual(qualification,[],"nenhum núcleo do Minerador foi chamado");assert.equal(articles.length,0);assert.equal(rows.length,1);assert.equal(paid,0);
  // A projeção do navegador e do MCP leva o needsMinerador.
  assert.deepEqual(projectImprovementRun(run).proposals[0].needsMinerador,p.needsMinerador);
});
test("lost journal response recovers a committed article without another version",async()=>{
  setup();const run=await prepare();const completed=await apply(run);assert.equal(completed.outcomes[0].status,"improved");
  journal[0].payload={...completed,state:"applying",outcomes:[],leaseUntil:new Date(Date.now()-1000).toISOString()};
  const recovered=await apply(run);assert.equal(recovered.outcomes[0].status,"improved");assert.match(recovered.outcomes[0].message,/recuperada/);assert.equal(articles.length,1);
});
test("one target failure keeps the accepted batch and the next subject still materializes",async()=>{
  setup();const subjectId="aaaaaaaa-0000-4000-8000-000000000003", supportId="aaaaaaaa-0000-4000-8000-000000000004";
  const subject=linhaDaMesa({id:subjectId,keyword:"Agenda e agendamento da clínica",brandId,semantic:{...semantic,...declarado()}});
  rows.push({...clone(rows[0]),...subject,isPublished:false,publishedUrl:undefined,primaryKeywordPolicy:"free",canonicalWorkflow:{...(subject.canonicalWorkflow as object),lockVersion:1}}, {...clone(rows[1]),id:supportId,keyword:"Captação de pacientes e agendamentos",keywordDnaRef:{...rows[1].keywordDnaRef,entityId:supportId,versionId:`${supportId}:v1`},canonicalWorkflow:{...clone(rows[1].canonicalWorkflow),id:`workflow-${supportId}`}});
  const run=await prepare();assert.equal(run.proposals.filter(p=>p.status==="ready").length,2,JSON.stringify(run.proposals));
  failPatch=true;const partial=await apply(run);assert.equal(partial.state,"applying");assert.equal(partial.outcomes[0].status,"failed");assert.equal(partial.acceptedIds?.length,2);
  failPatch=false;const completed=await apply(partial);assert.equal(completed.state,"complete");assert.equal(completed.acceptedIds?.length,2);assert.equal(completed.outcomes.filter(o=>o.status==="improved").length,1);assert.equal(completed.outcomes.filter(o=>o.status==="failed").length,1);
});
test("campo volátil (lock, carimbo da SERP) entre a prévia e o aplicar não derruba a melhoria; mudança real de Silo derruba", async()=>{
  setup();const run=await prepare();assert.equal(run.proposals[0].status,"ready",JSON.stringify(run.proposals));
  // O que o "Processar artigos" e a própria prévia mudam na linha: versão de lock, carimbos.
  for(const row of rows){row.canonicalWorkflow={...(row.canonicalWorkflow??{}),lockVersion:(row.canonicalWorkflow?.lockVersion??1)+7};row.updatedAt="2026-09-30T01:00:00.000Z";row.serpStamp="novo";}
  const result=await apply(run);assert.equal(result.outcomes[0].status,"improved",JSON.stringify(result.outcomes));
  setup();const outra=await prepare();rows[0].territoryRef="outro-silo";
  const recusada=await apply(outra);assert.equal(recusada.outcomes[0].status,"failed");assert.match(recusada.outcomes[0].message,/mudaram desde a prévia/);
});
test("coleta interrompida antes desta versão (presa em collecting, sem progresso) termina só pelo cache, sem pagar de novo", async()=>{
  setup();plansMissing=3;const run=await prepare();
  journal[0].payload={...journal[0].payload,state:"collecting",reservedCostUsd:.02};
  delete journal[0].payload.collect;
  // Um grupo por chamada: a tela chama de novo enquanto estiver "collecting".
  let resumed=await handleArticleImprovement(runtime,{brandId,action:"collect",runId:run.runId,decisionHash:run.decisionHash});
  for(let i=0;i<20&&resumed.state==="collecting";i++) resumed=await handleArticleImprovement(runtime,{brandId,action:"collect",runId:run.runId,decisionHash:run.decisionHash});
  assert.equal(resumed.state,"prepared",JSON.stringify(resumed.notices));
  assert.equal(paid,0,"nada pago na retomada");
  assert.equal((resumed as any).collect,undefined);
});
test("coleta nova grava o progresso por grupo e termina em prepared", async()=>{
  setup();plansMissing=1;const run=await prepare();
  const pedido={brandId,action:"collect" as const,runId:run.runId,decisionHash:run.decisionHash,authorizedCostUsd:run.costs.estimatedCostUsd.max};
  let done=await handleArticleImprovement(runtime,pedido);let chamadas=1;
  while(done.state==="collecting"&&chamadas<20){assert.ok((done as any).collect?.doneGroupIds.length>=1,"progresso gravado a cada chamada");done=await handleArticleImprovement(runtime,pedido);chamadas++;}
  assert.equal(done.state,"prepared");assert.ok(paid<=run.costs.paidQueries);
});

/*
 * LEITURA EDITORIAL DA IA NA LISTA (decisão do dono, 2026-09-30). A IA é
 * simulada pelo runtime injetado; nenhuma chamada real. A candidata da lista
 * não tem par na SERP do publicado (páginas diferentes) nem DNA em comum:
 * sem a IA, ninguém a sugeriria.
 */
const listPhrase = "captação de clientes para clínica";
function listCandidate() {
  // F4 (2026-10-14): keyword recebida chega aprovada, com a Lógica (só a intenção; sem entidade nem problema em comum).
  // Sem intenção ela seria "Precisa do Minerador · rodar a Lógica" — o Arquiteto não roda a Lógica.
  rows[1] = { ...rows[1], keyword: listPhrase, volume_search: 390, volume_source: "google_ads", analise_semantica: { intencao_principal: "Informativa" }, canonicalWorkflow: { ...rows[1].canonicalWorkflow, payload: { semanticQualification: {}, approvedDna: { analiseSemantica: { intencao_principal: "Informativa" } } } } };
  disjoint.add(newId);
}
// A IA recebe apelidos curtos (A1 = o publicado, K1 = a keyword da lista), nunca os ids reais.
const aiPick = { picks: [{ targetId: "A1", keywordId: "K1", role: "principal", reason: "Quem busca captar clientes para a clínica lê este passo a passo." }] };
function aiRuntime(answer: () => Promise<unknown>) {
  const prompts: any[] = [];
  return { prompts, runtime: { ...runtime, editorialAi: async (prompt: any) => { prompts.push(prompt); events.push("ia"); return answer(); } } };
}

test("IA simulada: publicado sem par da SERP ganha proposta pronta editorial_ai, com o motivo, e grava pelo parecer do cache", async () => {
  setup(); listCandidate();
  const semIa = await prepare();
  assert.notEqual(semIa.proposals[0].status, "ready", "sem a IA, a lista não vira proposta");
  assert.equal(semIa.editorialAi?.status, "off"); assert.equal(semIa.notices.filter(n => /Leitura da IA desligada/.test(n)).length, 1);
  setup(); listCandidate();
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER });
  const proposal = run.proposals[0];
  assert.equal(proposal.status, "ready", JSON.stringify(proposal));
  assert.equal(proposal.evidenceBasis, "editorial_ai");
  assert.deepEqual(proposal.addIds, [newId]);
  assert.equal(proposal.principalId, oldId, "sem o núcleo do slug, a sugestão de principal entra como secundária");
  assert.match(proposal.reasons.join(" "), /entra como secundária/);
  assert.deepEqual(proposal.aiReasons, [{ keywordId: newId, reason: aiPick.picks[0].reason }]);
  assert.equal(run.editorialAi?.status, "answered"); assert.equal(prompts.length, 1);
  const pedido = JSON.parse(prompts[0].user);
  assert.deepEqual(pedido.alvos.map((a: any) => [a.targetId, a.tema]), [["A1", rows[0].keyword]]); assert.deepEqual(pedido.lista.map((k: any) => [k.keywordId, k.keyword, k.volume]), [["K1", listPhrase, 390]]);
  assert.ok(!prompts[0].user.includes(newId) && !prompts[0].user.includes(oldId), "ids reais não vão para a IA");
  assert.ok(prompts[0].timeoutMs <= 45000, "limite de tempo seguro dentro dos 120 s da rota");
  assert.deepEqual(events, ["ia"], "com proposta pronta pela lista, não há busca nova no Google Ads");
  assert.equal(paid, 0); assert.equal(articles.length, 0, "nada gravado sem o clique do dono");
  assert.equal(projectImprovementRun(run).keywords.some(k => k.id === newId), true);
  const result = await handleArticleImprovement(comIa, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash });
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  assert.deepEqual(articles[0].payload.secondaryKeywordIds, [newId]);
  assert.equal(articles[0].payload.principalKeywordId, oldId); assert.equal(prompts.length, 1, "aplicar não chama a IA"); assert.equal(paid, 0);
});

test("IA com id inventado ou keyword barrada não vira proposta; só o que passa nas barreiras entra", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => ({ picks: [{ targetId: "A1", keywordId: "K7", role: "principal", reason: "Apelido que não existe na lista." }, { targetId: "A1", keywordId: newId, role: "principal", reason: "Id real que a IA nunca recebeu." }] }));
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER });
  assert.notEqual(run.proposals[0].evidenceBasis, "editorial_ai");
  assert.equal(run.editorialAi?.rejectedCount, 2); assert.ok(run.editorialAi!.rejected.every(r => /id inventado/.test(r.reason)));
  assert.ok(run.notices.some(n => /recusada\(s\) pelas regras do código/.test(n)));
});

test("falha da IA não derruba: aviso único e a ordem segue lista → busca nova no Google Ads", async () => {
  setup(); listCandidate(); external = true;
  const { runtime: comIa } = aiRuntime(async () => { throw new Error("A IA excedeu o tempo limite."); });
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare", discover: true, authorizeReading: LER });
  assert.equal(run.editorialAi?.status, "failed");
  assert.equal(run.notices.filter(n => /Leitura da IA indisponível agora/.test(n)).length, 1);
  assert.deepEqual(events.slice(0, 2), ["ia", "busca"], "a IA na lista vem antes da busca nova");
  assert.ok(!run.proposals.some(p => p.evidenceBasis === "editorial_ai"));
  assert.equal(paid, 0);
});

test("IA que não responde no limite de tempo: a preparação segue sem ela", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(() => new Promise(() => {}));
  const run = await handleArticleImprovement({ ...comIa, editorialAiTimeoutMs: 20 } as any, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(run.editorialAi?.status, "failed"); assert.match(run.editorialAi!.message!, /tempo limite/);
  assert.ok(run.proposals.every(p => p.evidenceBasis !== "editorial_ai"));
});

test("faltando lente, a linha da IA fica 'precisa validar' (passo 2 pago) e o collect reaproveita a resposta guardada", async () => {
  setup(); listCandidate(); plansMissing = 1; incompleteUntilPaid = true;
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER });
  const proposal = run.proposals[0];
  assert.equal(proposal.status, "insufficient_evidence"); assert.equal(proposal.needsValidation, true, JSON.stringify(proposal));
  assert.match(proposal.reasons.join(" "), /Precisa validar no Google/);
  assert.ok(run.costs.paidQueries > 0, "o passo 2 pago aparece com prévia de custo");
  await assert.rejects(() => handleArticleImprovement(comIa, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, targetIds: [oldId] }), /prontas/);
  const pedido = { brandId, action: "collect" as const, runId: run.runId, decisionHash: run.decisionHash, authorizedCostUsd: run.costs.estimatedCostUsd.max };
  let done = await handleArticleImprovement(comIa, pedido);
  for (let i = 0; i < 20 && done.state === "collecting"; i++) done = await handleArticleImprovement(comIa, pedido);
  assert.equal(done.state, "prepared");
  assert.equal(paid > 0, true, "a composição escolhida pela IA foi validada no passo 2");
  assert.equal(done.proposals[0].status, "ready", JSON.stringify(done.proposals[0]));
  assert.equal(done.proposals[0].evidenceBasis, "editorial_ai");
  assert.equal(prompts.length, 1, "a IA não é chamada de novo no collect");
});

test("prazo da etapa: composição que não começou a tempo fica 'precisa validar', sem ler parecer nem pagar", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => aiPick);
  const run = await handleArticleImprovement({ ...comIa, compositionDeadlineMs: -1 } as any, { brandId, action: "prepare", authorizeReading: LER });
  const proposal = run.proposals[0];
  assert.equal(proposal.evidenceBasis, "editorial_ai");
  assert.equal(proposal.status, "insufficient_evidence"); assert.equal(proposal.needsValidation, true);
  assert.match(proposal.reasons.join(" "), /Faltou tempo nesta etapa/);
  assert.equal(assessments.length, 0, "nenhum parecer começou depois do prazo"); assert.equal(paid, 0); assert.equal(articles.length, 0);
});

test("falha da IA vai para a execução como texto fixo, nunca a mensagem crua do provider", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => { throw Object.assign(new Error("upstream 401: chave sk-segredo-123 recusada em https://api.exemplo"), { code: "AI_PROVIDER_UNAVAILABLE" }); });
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(run.editorialAi?.status, "failed"); assert.equal(run.editorialAi?.message, "A IA está indisponível.");
  assert.ok(!JSON.stringify(run).includes("sk-segredo"), "nada do erro cru na execução");
  const formato = aiRuntime(async () => { throw Object.assign(new Error("Campo picks.0.role: Invalid enum"), { code: "AI_OUTPUT_INVALID" }); });
  setup(); listCandidate();
  assert.equal((await handleArticleImprovement(formato.runtime, { brandId, action: "prepare", authorizeReading: LER })).editorialAi?.message, "A resposta da IA veio fora do formato.");
});

test("uma escolha malformada da IA não derruba a boa, e a recusa guarda o texto para a tela", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => ({ picks: [{ ...aiPick.picks[0], role: "Secundária" }, { targetId: "A1", keywordId: "K1", role: "reforço", reason: "Papel inválido." }] }));
  const run = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(run.proposals[0].status, "ready", JSON.stringify(run.proposals[0])); assert.equal(run.proposals[0].evidenceBasis, "editorial_ai");
  assert.equal(run.editorialAi?.rejectedCount, 1); assert.match(run.editorialAi!.rejected[0].reason, /fora do formato/);
});
test("publicado que também é Assunto declarado grava: a página fora da lista de keywords não conta como 'keyword mudou' (caso real)", async()=>{
  setup();
  // A página publicada é também um Assunto declarado: readInputs a tira da lista de keywords, na prévia e no aplicar.
  const pagina=linhaDaMesa({id:oldId,keyword:"como captar clientes para clínica de estética",brandId,semantic:{...semantic,...declarado()}});
  rows[0]={...rows[0],analise_semantica:(pagina as any).analise_semantica ?? rows[0].analise_semantica,canonicalWorkflow:{...(rows[0].canonicalWorkflow as object),payload:{...((rows[0].canonicalWorkflow as any)?.payload??{}),...((pagina as any).canonicalWorkflow?.payload??{})}}};
  const run=await prepare();
  const alvo=run.proposals.find((p:any)=>p.targetId===oldId);
  assert.equal(alvo?.status,"ready",JSON.stringify(alvo));
  assert.ok(!run.keywords.some((k:any)=>k.id===oldId),"a página declarada fica fora da lista, como em produção");
  const result=await apply(run);
  assert.notEqual(result.outcomes[0].status,"failed",JSON.stringify(result.outcomes));
});

test("o Google separou parte da composição: sai quem não divide páginas com a principal e a menor é conferida de novo, sem custo (caso real 'campanhas de marketing', 2026-09-30)", async()=>{
  setup();
  const k3 = "aaaaaaaa-0000-4000-8000-000000000003";
  rows.push({ ...clone(rows[1]), id: k3, keyword: "captação de pacientes em clínica de estética", volume_search: 40, territoryRef: "territory:other", keywordDnaRef: { entityId: k3, versionId: `${k3}:v1`, contentHash: `sha256:${"d".repeat(64)}` }, canonicalWorkflow: { ...clone(rows[1].canonicalWorkflow), id: `workflow-${k3}` } });
  diverge = new Set([k3]);
  const run = await prepare();
  const p = run.proposals[0];
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.equal(p.principalId, newId);
  assert.ok(!p.memberIds.includes(k3) && !p.addIds.includes(k3), "a que o Google separou fica de fora");
  assert.match(p.reasons.join(" "), /O Google separou “captação de pacientes em clínica de estética” da principal/);
  assert.equal(paid, 0, "a composição menor sai do cache");
});

test("composição menor com a página sem volume como principal: a âncora é a entrada de maior volume (caso real 'como captar clientes', 2026-09-30)", async()=>{
  setup();
  rows[0].primaryKeywordPolicy = "locked";
  const k3 = "aaaaaaaa-0000-4000-8000-000000000003";
  rows.push({ ...clone(rows[1]), id: k3, keyword: "captação de pacientes em clínica de estética", volume_search: 40, territoryRef: "territory:other", keywordDnaRef: { entityId: k3, versionId: `${k3}:v1`, contentHash: `sha256:${"d".repeat(64)}` }, canonicalWorkflow: { ...clone(rows[1].canonicalWorkflow), id: `workflow-${k3}` } });
  diverge = new Set([k3]);
  const run = await prepare();
  const p = run.proposals[0];
  assert.equal(p.principalId, oldId, "Travado: a página continua a principal");
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.deepEqual(p.addIds, [newId]);
  assert.match(p.reasons.join(" "), /O Google separou/);
  assert.equal(paid, 0);
});

test("o Google separa todas as entradas da página: a linha diz 'outro assunto' e aponta as Sobras (caso real 'como captar clientes', 2026-09-30)", async()=>{
  setup();
  rows[0].primaryKeywordPolicy = "locked"; rows[0].volume_search = 10; rows[0].volume_source = "google_ads";
  diverge = new Set([newId]);
  const run = await prepare();
  const p = run.proposals[0];
  assert.notEqual(p.status, "ready");
  assert.match(p.reasons.join(" "), /O Google trata “captação de pacientes para clínica de estética” como outro assunto/, JSON.stringify(p.reasons));
  assert.match(p.reasons.join(" "), /Sobras/);
  assert.equal(paid, 0);
});

// F4 (ajuste declarado 2026-10-14): a medição feita no preparo NÃO é gravada pelo Arquiteto — a linha espera o Minerador.
test("volume de outra era é medido no Google Ads no preparo e a principal sem volume seria trocada; F4: a gravação da medição é do Minerador (caso real 'tráfego pago vs orgânico', 2026-09-30)", async()=>{
  setup();
  rows[1].volume_search = 140; rows[1].volume_source = "previous";
  legacyVolumes = new Map([[normalizeKeyword(rows[1].keyword), 50]]);
  const run = await prepare();
  assert.ok(legacyAsked.includes(rows[1].keyword), "a keyword com volume antigo foi medida");
  const p = run.proposals[0];
  assert.equal(p.principalId, newId, "a principal sem volume daria lugar à medida");
  assert.equal(p.status, "insufficient_evidence", JSON.stringify(p.reasons));
  assert.deepEqual(p.needsMinerador?.measureKeywordIds, [newId]);
  assert.match(p.reasons.join(" "), /medição\(ões\) de volume para gravar no Minerador/);
  assert.ok(run.notices.some((n: string) => /medidas agora, com a sua autorização \(cota do Google Ads, sem custo em dólar\): 1 com volume/.test(n)), JSON.stringify(run.notices));
  const sugestao = journal.find(r => r.subject_type === "architect_minerador_suggestions");
  assert.equal(sugestao.payload.items[0].kind, "measure"); assert.equal(sugestao.payload.items[0].keywordId, newId); assert.equal(sugestao.payload.items[0].volume, 50);
  await assert.rejects(() => handleArticleImprovement(runtime, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, targetIds: [oldId] }), /precisam do Minerador/);
  assert.equal(rows[1].volume_source, "previous", "o Arquiteto não grava a medição no Minerador");
  assert.equal(measured.length, 0, "o núcleo do Medir volume não é chamado pelo Arquiteto");
  assert.equal(articles.length, 0); assert.equal(paid, 0);
});

test("volume antigo: Google Ads fora do ar avisa e não inventa volume; já medida no Google Ads não é medida de novo", async()=>{
  setup();
  rows[1].volume_search = 140; rows[1].volume_source = "previous"; legacyFail = true;
  const run = await prepare();
  assert.notEqual(run.proposals[0].status, "ready");
  assert.ok(run.notices.some((n: string) => /Não deu para medir no Google Ads o volume de/.test(n)));
  assert.equal(articles.length, 0);
  setup();
  rows[0].volume_source = "google_ads";
  await prepare();
  assert.ok(!legacyAsked.includes(rows[0].keyword), "medida sem média não volta a ser pedida a cada preparo");
});

test("keyword 'Bruto' (coluna 'Pendente', análise sem intenção): o parecer gravado pela melhoria tem o MESMO hash que a mesa espera — não nasce desatualizado (caso real 'tráfego pago vs orgânico', 2026-09-30)", async()=>{
  setup();
  for (const row of rows) { row.intent = "Pendente"; row.analise_semantica = { ...semantic, intencao_principal: undefined }; }
  const run = await prepare();
  assert.equal(run.proposals[0].status, "ready", JSON.stringify(run.proposals[0].reasons));
  const result = await apply(run);
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  assertReloadGate("published");
});

// F4 (ajuste declarado 2026-10-14): antes a Lógica do Minerador rodava AQUI ao gravar (W2). Agora a linha espera o Minerador.
test("keyword 'Bruto' sem intenção em lugar nenhum: F4 — 'Precisa do Minerador · rodar a Lógica', nada gravado e a Lógica não roda pelo Arquiteto (2026-10-01 → 2026-10-14)", async()=>{
  setup();
  for (const row of rows) {
    row.intent = "Pendente"; row.analise_semantica = { ...semantic, intencao_principal: undefined };
    row.canonicalWorkflow.payload.semanticQualification = { semanticState: "pending" };
    row.canonicalWorkflow.payload.approvedDna = { analiseSemantica: {} };
  }
  const run = await prepare();
  const p = run.proposals[0];
  assert.equal(p.status, "insufficient_evidence", JSON.stringify(p.reasons));
  assert.deepEqual([...(p.needsMinerador?.logicKeywordIds ?? [])].sort(), [oldId, newId].sort());
  const sugestao = journal.find(r => r.subject_type === "architect_minerador_suggestions");
  assert.deepEqual(sugestao.payload.items.map((item: any) => item.kind).sort(), ["logic", "logic"]);
  await assert.rejects(() => handleArticleImprovement(runtime, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, targetIds: [oldId] }), /precisam do Minerador/);
  assert.deepEqual(logicRan, [], "a Lógica não rodou pelo Arquiteto");
  assert.equal(articles.length, 0); assert.equal(qualification.includes("approve"), false, "nada é aprovado no Minerador");
});

test("a sucessora da melhoria leva a classificação e as intenções auxiliares da composição NOVA, não as da anterior (2026-10-01)", async()=>{
  setup();
  const run = await prepare();
  const result = await apply(run);
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  const dna = articles[0].payload;
  assert.ok(dna.classification, "classificação gravada na sucessora");
  assert.equal(dna.classification.intent.value, "INFORMATIONAL", JSON.stringify(dna.classification.intent));
  assert.ok(!dna.auxiliaryIntents.includes("Pendente"));
});

test("publicado aprovado sem classificação e com intenção 'unknown': a linha 'Atualizar o DNA com a SERP' aparece pronta e grava a decisão da SERP sem mudar a composição (caso real 'tráfego pago vs orgânico', 2026-10-01)", async()=>{
  setup();
  // Nada a melhorar na composição: a candidata não tem volume validado.
  rows[1].volume_source = "previous";
  const { buildFirstPublishedArticleDna } = await import("../lib/arquiteto/published-reinforcement.ts");
  const { createVersionEnvelope } = await import("../lib/arquiteto/versioning.ts");
  const primeiro = buildFirstPublishedArticleDna({ brandId, page: { keywordId: oldId, keyword: rows[0].keyword, url, canonical: url }, territoryRef: territory, keywords: [rows[0]], roles: { [oldId]: "principal" }, siloVersions: [] });
  assert.ok(primeiro.ok);
  const assessmentId = `serp-formation:${brandId}:${oldId}:v1`, hashSerp = "serpbase:aaaaaaaaaaaaaaaa";
  const dnaPayload = { ...primeiro.payload, mainIntent: "unknown", classification: undefined, architectureStatus: "architecture_confirmed", serpAssessmentRef: { entityId: assessmentId, versionId: `${assessmentId}:${hashSerp}`, contentHash: `sha256:${"c".repeat(64)}` } };
  delete (dnaPayload as any).classification;
  articles.push(await createVersionEnvelope({ entityId: oldId, versionNumber: 3, origin: "human", changeReason: "fixture", createdBy: actorUserId, payload: dnaPayload as never }));
  const lentes = { requested: [...SERP_SUBJECT_LENS_LABELS], observed: [...SERP_SUBJECT_LENS_LABELS], missing: [] };
  assessments.push({ candidateRef: oldId, payload: { formationBaseHash: hashSerp, verdict: "COMPATIBLE", humanResolution: { formationBaseHash: hashSerp }, assessment: { id: assessmentId, contentHash: `sha256:${"c".repeat(64)}`, recommendations: [{ keywordId: oldId, currentRole: "principal" }] }, interpretation: { observedIntent: "informacional", observedFunnel: "topo", intentShares: { informacional: 70, comercial: 20, transacional: 10, lenses: 4, results: 40 }, lenses: lentes } } });

  const run = await prepare();
  const p = run.proposals[0];
  assert.equal(p.status, "ready", JSON.stringify(p));
  assert.ok(p.serpRefresh, "linha de atualização pela SERP");
  assert.deepEqual(p.addIds, []); assert.deepEqual(p.removeIds, []);
  assert.match(p.reasons.join(" "), /Atualizar o DNA com a SERP/);
  assert.ok(run.notices.some((n: string) => /atualizados com a SERP vigente/.test(n)));

  const result = await apply(run);
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  const gravado = articles.at(-1)!;
  assert.equal(gravado.versionNumber, 4);
  assert.equal(gravado.payload.mainIntent, "informational");
  assert.equal(gravado.payload.classification.intent.value, "INFORMATIONAL");
  assert.equal(gravado.payload.classification.intent.source, "serp");
  assert.equal(gravado.payload.journeyStage, "Topo de funil (SERP)");
  assert.deepEqual(gravado.payload.keywordReferences.map((r: any) => r.keywordId), [oldId], "a composição não muda");
  assert.equal(gravado.payload.canonical, url);
  assert.ok(marker.payload.concludedFormations.some((f: any) => f.materializedArticleId === oldId), "a formação entra no marcador");
  assert.equal(paid, 0);
});

test("keyword que está na formação da mesa do publicado e fora do DNA é do próprio artigo: ao gravar, a que não entra é liberada para 'Keywords não agrupadas', nomeada (caso real 'dentistas', 2026-10-01)", async()=>{
  setup();
  const ref = "article-formation:mesa-do-publicado";
  rows[0].articleFormationRef = ref; rows[0].canonicalWorkflow.payload.articleFormationRef = ref;
  const sobra = "aaaaaaaa-0000-4000-8000-000000000009";
  rows.push({ ...clone(rows[0]), id: sobra, keyword: "keyword antiga sem volume validado", isPublished: false, publishedUrl: undefined, primaryKeywordPolicy: "free", volume_search: 30, volume_source: "previous", articleFormationRef: ref, articleFormationDecision: { operation: "move", role: "secundaria", source: "human" }, keywordDnaRef: { entityId: sobra, versionId: `${sobra}:v1`, contentHash: `sha256:${"e".repeat(64)}` }, canonicalWorkflow: { ...clone(rows[0].canonicalWorkflow), id: `workflow-${sobra}`, payload: { ...clone(rows[0].canonicalWorkflow.payload), articleFormationRef: ref, articleFormationDecision: { operation: "move", role: "secundaria", source: "human" } } } });
  const { buildFirstPublishedArticleDna } = await import("../lib/arquiteto/published-reinforcement.ts");
  const { createVersionEnvelope } = await import("../lib/arquiteto/versioning.ts");
  const primeiro = buildFirstPublishedArticleDna({ brandId, page: { keywordId: oldId, keyword: rows[0].keyword, url, canonical: url }, territoryRef: territory, keywords: [rows[0]], roles: { [oldId]: "principal" }, siloVersions: [] });
  assert.ok(primeiro.ok);
  articles.push(await createVersionEnvelope({ entityId: oldId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: actorUserId, payload: primeiro.payload }));
  const run = await prepare();
  assert.equal(run.proposals[0].status, "ready", JSON.stringify(run.proposals[0]));
  const result = await apply(run);
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  const liberada = rows.find(r => r.id === sobra);
  assert.equal(liberada.articleFormationRef ?? null, null, "liberada da formação da mesa");
  assert.match(result.outcomes[0].message, /keyword antiga sem volume validado.*liberada para “Keywords não agrupadas”/);
});

/*
 * MELHORIA SEM RETRABALHO (WifiConecta, 2026-10-12). Nove "Preparar" numa
 * tarde, cada um com IA e busca nova no Google Ads de novo. Agora: mesmos
 * insumos reaproveitam a execução anterior (zero chamada nova de IA e de
 * busca), a busca nova só roda sob pedido, e as duas chamadas vão para o
 * registro de uso (integration_usage_events) pelo runtime injetado.
 */
function usageRuntime(base: any) {
  const usage: any[] = [];
  return { usage, runtime: { ...base, recordUsage: async (event: any) => { usage.push(event); } } };
}

test("2026-10-12 · Preparar de novo com os mesmos insumos reaproveita a execução: zero chamada nova de IA e de busca", async () => {
  setup(); listCandidate();
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  const { usage, runtime: comUso } = usageRuntime(comIa);
  const primeira = await handleArticleImprovement(comUso, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(prompts.length, 1);
  assert.equal(primeira.reusedFromRunId, null);
  assert.match(primeira.inputsHash ?? "", /^[a-f0-9]{64}$/);
  assert.deepEqual(usage.map(u => [u.kind, u.resultStatus, u.runId]), [["editorial_ai", "succeeded", primeira.runId]], "a IA vai para o registro de uso");
  const medidasAntes = legacyAsked.length;
  const segunda = await handleArticleImprovement(comUso, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(prompts.length, 1, "a IA não é chamada de novo");
  assert.ok(!events.includes("busca"), "nenhuma busca nova no Google Ads");
  assert.equal(usage.length, 1, "nada novo no registro de uso");
  // F5 (guarda de retrabalho): mesmos insumos e a mesma prévia = a MESMA execução, com o aviso; nenhuma linha nova (as 9 viram 1).
  assert.equal(segunda.runId, primeira.runId);
  assert.equal(journal.filter(r => r.subject_type === "article_improvement_run").length, 1);
  assert.equal(segunda.rework?.verdict, "same_inputs_reuse");
  assert.equal(segunda.rework?.previous?.resultRef, primeira.runId);
  assert.match(segunda.rework?.message ?? "", /^Já feito com os mesmos insumos em \d\d\/\d\d às \d\d:\d\d — \d+ alvo\(s\), IA leu a lista/);
  assert.equal(segunda.editorialAi?.status, "answered");
  assert.deepEqual(segunda.proposals.map(p => [p.targetId, p.status, p.evidenceBasis]), primeira.proposals.map(p => [p.targetId, p.status, p.evidenceBasis]));
  assert.equal(legacyAsked.length, medidasAntes, "as medições também não são repetidas");
});

test("2026-10-12 · insumo diferente (lista mudou) prepara de novo, com a IA", async () => {
  setup(); listCandidate();
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER });
  rows[1].volume_search = 480;
  const outra = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(prompts.length, 2);
  assert.equal(outra.reusedFromRunId, null);
});

test("2026-10-12 · leitura da IA que falhou não é semente: só ela é tentada de novo", async () => {
  setup(); listCandidate();
  let falhar = true;
  const { prompts, runtime: comIa } = aiRuntime(async () => { if (falhar) throw new Error("A IA excedeu o tempo limite."); return aiPick; });
  const { usage, runtime: comUso } = usageRuntime(comIa);
  const primeira = await handleArticleImprovement(comUso, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(primeira.editorialAi?.status, "failed");
  assert.deepEqual(usage.map(u => [u.kind, u.resultStatus]), [["editorial_ai", "failed"]], "a chamada que falhou também fica no registro");
  falhar = false;
  const segunda = await handleArticleImprovement(comUso, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(prompts.length, 2);
  assert.equal(segunda.reusedFromRunId, primeira.runId);
  assert.equal(segunda.editorialAi?.status, "answered");
  assert.ok(segunda.notices.some(n => /tinha falhado e foi tentada de novo/.test(n)));
});

test("2026-10-12 · a busca nova no Google Ads só roda sob pedido, e cada chamada vai para o registro de uso", async () => {
  setup(); external = true; rows = rows.slice(0, 1);
  const logic = deriveLogicalKeywordBatchItem({ id: oldId, keyword: discoveredPhrase, location: null, intent: null, analise_semantica: {} }, null, new Date().toISOString());
  rows[0].analise_semantica = logic.update.analise_semantica; rows[0].canonicalWorkflow.payload.approvedDna.analiseSemantica = logic.update.analise_semantica; rows[0].canonicalWorkflow.payload.semanticQualification = {};
  const { usage, runtime: comUso } = usageRuntime(runtime);
  const semPedido = await handleArticleImprovement(comUso, { brandId, action: "prepare", authorizeReading: LER });
  assert.ok(!events.includes("busca"), "prepare sem pedido não busca");
  assert.equal(semPedido.discovery?.requested, false);
  assert.deepEqual(semPedido.discovery?.gapTargetIds, [oldId]);
  assert.notEqual(semPedido.proposals[0].status, "ready");
  assert.ok(semPedido.notices.some(n => /não roda sozinha/.test(n)), JSON.stringify(semPedido.notices));
  assert.equal(usage.length, 0);
  const comPedido = await handleArticleImprovement(comUso, { brandId, action: "prepare", discover: true, authorizeReading: LER });
  assert.deepEqual(events.filter(e => e === "busca").length, 1);
  assert.equal(comPedido.discovery?.requested, true);
  assert.equal(comPedido.discovery?.requests, 1);
  assert.equal(comPedido.reusedFromRunId, semPedido.runId, "a busca pedida reaproveita o resto da preparação");
  // F4 (ajuste declarado 2026-10-14): a proposta com a ideia da busca fica "Precisa do Minerador" (antes: "ready", importada no apply).
  assert.equal(comPedido.proposals[0].status, "insufficient_evidence", JSON.stringify(comPedido.proposals));
  assert.equal(comPedido.proposals[0].needsMinerador?.newKeywordIds.length, 1);
  assert.deepEqual(comPedido.discovery?.gapTargetIds, [], "à espera do Minerador, o alvo não pede outra busca");
  assert.deepEqual(usage.map(u => [u.kind, u.resultStatus, u.runId, u.suffix, u.receivedCount]), [["google_ads_discovery", "succeeded", comPedido.runId, "url_seed:p1", 1]]);
});

test("2026-10-12 · registro de uso que falha não derruba a preparação e fica dito", async () => {
  setup(); listCandidate();
  const { runtime: comIa } = aiRuntime(async () => aiPick);
  const run = await handleArticleImprovement({ ...comIa, recordUsage: async () => { throw new Error("ledger fora"); } }, { brandId, action: "prepare", authorizeReading: LER });
  assert.equal(run.state, "prepared");
  assert.equal(run.editorialAi?.status, "answered");
  assert.equal(run.notices.filter(n => /registro de uso de uma chamada desta preparação não foi confirmado/.test(n)).length, 1);
});

/*
 * F5 · GUARDA DE RETRABALHO (SDD 2026-10-12 §10.3). O registro da melhoria é a
 * própria execução (`inputsHash`): "Refazer mesmo assim" só com motivo; a busca
 * já feita com os mesmos insumos não se repete; o Assunto com lista da
 * Pesquisa por Assunto do Minerador não entra na busca nova.
 */
test("F5 · Refazer mesmo assim (com motivo): a IA é chamada de novo e a execução nova diz o motivo", async () => {
  setup(); listCandidate();
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  const primeira = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER });
  const refeita = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: LER, reworkOverride: { reason: "quero outra leitura da IA" } });
  assert.equal(prompts.length, 2, "com motivo, a IA é chamada de novo");
  assert.notEqual(refeita.runId, primeira.runId);
  assert.equal(refeita.reusedFromRunId, null);
  assert.equal(refeita.reworkOverride?.reason, "quero outra leitura da IA");
  assert.equal(refeita.rework?.verdict, "same_inputs_reuse");
  assert.ok(refeita.notices.some(n => /Refeito com os mesmos insumos .* por pedido \(“quero outra leitura da IA”\)/.test(n)), JSON.stringify(refeita.notices));
});

test("F5 · a busca nova no Google Ads já feita com os mesmos insumos não é repetida", async () => {
  setup(); external = true; rows = rows.slice(0, 1);
  const logic = deriveLogicalKeywordBatchItem({ id: oldId, keyword: discoveredPhrase, location: null, intent: null, analise_semantica: {} }, null, new Date().toISOString());
  rows[0].analise_semantica = logic.update.analise_semantica; rows[0].canonicalWorkflow.payload.approvedDna.analiseSemantica = logic.update.analise_semantica; rows[0].canonicalWorkflow.payload.semanticQualification = {};
  await handleArticleImprovement(runtime, { brandId, action: "prepare", authorizeReading: LER });
  const comPedido = await handleArticleImprovement(runtime, { brandId, action: "prepare", discover: true, authorizeReading: LER });
  assert.equal(events.filter(e => e === "busca").length, 1);
  const deNovo = await handleArticleImprovement(runtime, { brandId, action: "prepare", discover: true, authorizeReading: LER });
  assert.equal(events.filter(e => e === "busca").length, 1, "nenhuma chamada nova de ideias de keywords");
  assert.equal(deNovo.runId, comPedido.runId, "a mesma execução volta, com o aviso");
  assert.equal(deNovo.rework?.verdict, "same_inputs_reuse");
});

test("F5 · Assunto com lista da Pesquisa por Assunto do Minerador não entra na busca nova (as sustentações saem da lista)", async () => {
  setup(); external = false;
  const subject = linhaDaMesa({ id: oldId, keyword: "Como transformar interesse em agendamento na clínica", brandId, semantic: { ...semantic, ...declarado("Apresentar os serviços e conduzir os contatos para a agenda.") } });
  rows[0] = { ...rows[0], ...subject, isPublished: false, publishedUrl: undefined }; rows[0].canonicalWorkflow.lockVersion = 1;
  // A sustentação que a Pesquisa por Assunto trouxe para ele, ainda sem volume: o Assunto fica sem proposta.
  rows[1] = { ...rows[1], volume_search: null, volume_source: null, analise_semantica: { ...semantic, subject_discovery: { version: 1, searches: [], subjectKeywordIds: [oldId] } } };
  const run = await handleArticleImprovement(runtime, { brandId, action: "prepare", discover: true, authorizeReading: LER });
  assert.equal(run.targets[0].kind, "subject");
  assert.ok(!events.includes("busca"), "nenhuma busca nova para o Assunto com lista");
  assert.deepEqual(run.discovery?.gapTargetIds, [], "o Assunto com lista não conta como alvo da busca");
  assert.notEqual(run.proposals[0].status, "ready", "o Assunto ficou sem proposta: sem a guarda, ele seria alvo da busca");
  assert.ok(run.notices.some(n => /Assunto\(s\) com lista da Pesquisa por Assunto do Minerador não entram na busca nova/.test(n)), JSON.stringify(run.notices));
});

/*
 * D2(a) NO "GRAVAR MELHORIAS" (backlog do Arquiteto, SDD 2026-10-12 §17): o
 * Assunto do plano declarado com a principal declarada SEM volume e SEM SERP
 * no cache. O parecer vem das sustentações (sem pagar) e o ArticleDNA nasce com
 * a principal declarada, o papel e o escopo do plano e a proveniência em
 * `serpStrategy.rationale`. Sem o parecer pelas sustentações, recusa e aponta
 * a D2(b) — nada é gravado.
 */
const declaredId = "aaaaaaaa-0000-4000-8000-00000000000d";
const planGroupId = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
function declaredPlanScenario() {
  setup();
  const plan = { groupId: planGroupId, planVersion: 1, order: 3, role: "Suporte", scope: "Compara as três operadoras para o CEP da pessoa, sem prometer preço.", declaredPrincipal: { keywordId: declaredId, phrase: "Claro Vivo ou TIM internet" } };
  const subjectSemantic = { ...semantic, ...declarado("Comparar as operadoras."), keyword_subject: { declared: true, note: "Comparar as operadoras.", destinationUrl: null, destinationCheck: null, plan } };
  const subject = linhaDaMesa({ id: oldId, keyword: "Claro, Vivo ou TIM: qual escolher", brandId, semantic: subjectSemantic });
  rows[0] = { ...rows[0], ...subject, isPublished: false, publishedUrl: undefined }; rows[0].canonicalWorkflow.lockVersion = 1;
  rows[1] = { ...rows[1], territoryRef: territory };
  const principal = linhaDaMesa({ id: declaredId, keyword: "Claro Vivo ou TIM internet", brandId, semantic: { ...semantic, keyword_declared_principal: { subjectKeywordId: oldId, groupId: planGroupId, planVersion: 1 } } });
  rows.push({ ...clone(rows[1]), ...principal, volume_search: null, volume_source: null, territoryRef: territory, keywordDnaRef: { entityId: declaredId, versionId: `${declaredId}:v1`, contentHash: `sha256:${"d".repeat(64)}` }, canonicalWorkflow: { ...(principal.canonicalWorkflow as object), id: `workflow-${declaredId}`, lockVersion: 1 } });
}

test("D2(a) · Gravar melhorias do Assunto do plano: principal declarada sem volume, parecer pelas sustentações, papel e escopo do plano no ArticleDNA", async () => {
  declaredPlanScenario(); supportBasisPrincipal = declaredId;
  const run = await prepare();
  const proposta = run.proposals.find(p => p.targetId === oldId)!;
  assert.equal(proposta.status, "ready", JSON.stringify(run.proposals));
  assert.equal(proposta.principalId, declaredId, "a principal declarada é cabeceira fixa (D1-bis)");
  assert.equal(paid, 0);
  const result = await apply(run);
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  assert.equal(paid, 0, "nada foi pago: o parecer veio das sustentações no cache (D2a)");
  const dna = articles[0].payload;
  assert.equal(dna.principalKeywordId, declaredId);
  assert.equal(dna.subject.keywordId, oldId);
  assert.equal(dna.hierarchy, "Suporte", "o papel do plano vira a hierarquia");
  assert.equal(dna.promise, "Compara as três operadoras para o CEP da pessoa, sem prometer preço.", "o escopo do plano vira a promessa");
  assert.ok(dna.serpStrategy.rationale.some((line: string) => line.startsWith("Parecer pelas sustentações")), JSON.stringify(dna.serpStrategy.rationale));
});

test("D2(a) · sem parecer pelas sustentações, Gravar melhorias recusa e aponta a D2(b); nada é gravado", async () => {
  declaredPlanScenario(); supportBasisPrincipal = null; noSerpPrincipal = declaredId;
  const run = await prepare();
  const proposta = run.proposals.find(p => p.targetId === oldId)!;
  // Sem parecer, a linha não fica pronta: a principal declarada continua fixa e o motivo é dito (a saída é a D2(b), paga, por clique).
  assert.equal(proposta.status, "insufficient_evidence", JSON.stringify(run.proposals));
  assert.equal(proposta.principalId, declaredId);
  assert.ok(proposta.reasons.includes("sem parecer da SERP"), JSON.stringify(proposta.reasons));
  await assert.rejects(() => handleArticleImprovement(runtime, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, targetIds: [oldId] }), /prontas/);
  assert.equal(articles.length, 0, "nenhum ArticleDNA sem parecer");
  assert.equal(paid, 0);
});

/*
 * F3 · LER ANTES DE BUSCAR (SDD 2026-10-13 `sdd-arquiteto-so-le-e-listas-leves`, item 3; D4).
 * Portas que contam chamadas: `measureVolumes` (a consulta ao Google Ads da
 * preparação), a IA injetada, `legacyAsked` (a média antiga) e `replays` (a
 * gravação da medição guardada, que não consulta o Google Ads).
 */
const metrica = (keyword: string, media: number) => ({ keyword, normalizedKeyword: normalizeKeyword(keyword), averageMonthlySearches: media, monthlySearchVolumes: [], competition: null, competitionIndex: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null, currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: {}, customerId: "******7890", provider: "google_ads", providerVersion: "v25", measuredAt: "2026-10-14T10:00:00.000Z", canonicalKeyword: keyword, closeVariants: [], normalizedCloseVariants: [], matchedRequestedKeywords: [keyword] });
function medindo(base: any, medias: Map<string, number>) {
  return { ...base, measureVolumes: async (keywords: readonly string[]) => {
    medicoesProvider.push([...keywords]);
    return { metrics: keywords.filter(k => medias.has(normalizeKeyword(k))).map(k => ({ metric: metrica(k, medias.get(normalizeKeyword(k))!), requestId: "ads-req-1" })), unmatched: keywords.filter(k => !medias.has(normalizeKeyword(k))) };
  } };
}
const diasAtras = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

test("F3 · DNA completo: a leitura grátis não chama IA nem Google Ads e diz 'grátis'", async () => {
  setup(); rows[0].volume_search = 10; rows[0].volume_source = "google_ads";
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  const run = await handleArticleImprovement(medindo(comIa, new Map()), { brandId, action: "prepare" });
  assert.equal(run.proposals[0].status, "ready", JSON.stringify(run.proposals));
  assert.deepEqual([prompts.length, medicoesProvider.length, legacyAsked.length, paid], [0, 0, 0, 0], "zero chamada");
  assert.equal(run.editorialAi, undefined);
  assert.equal(run.reading?.free, true); assert.equal(run.reading?.needsPaidReading, false);
  assert.equal(run.reading?.known.volumeMeasured, 2);
  assert.equal(run.reading?.sentences.cost, "Custa: nada (grátis).");
});

test("F3 · falta medir: a prévia diz já temos · falta · custa e NÃO chama nada sem a autorização", async () => {
  setup(); rows[1].volume_search = 140; rows[1].volume_source = "previous";
  const run = await handleArticleImprovement(medindo(runtime, new Map([[normalizeKeyword(rows[1].keyword), 50]])), { brandId, action: "prepare" });
  assert.deepEqual([medicoesProvider.length, legacyAsked.length, measured.length], [0, 0, 0]);
  assert.equal(run.reading?.needsPaidReading, true);
  assert.deepEqual(run.reading?.missing.volumeToMeasureSample.map(k => [k.keyword, k.reason]).sort(), [[rows[0].keyword, "never_measured"], [rows[1].keyword, "other_provider"]].sort());
  assert.deepEqual(run.reading?.plan.googleAds, { keywords: 2, calls: 1, moneyUsd: 0, quota: true });
  assert.match(run.reading?.sentences.cost ?? "", /Google Ads: 1 consulta\(s\) de métricas para 2 keyword\(s\) — sem custo em dólar, usa a cota da marca/);
  assert.notEqual(run.proposals[0].principalId, newId, "sem medir, a troca pela keyword de volume antigo não é proposta");
});

/*
 * F3 + F4 (ajuste declarado 2026-10-14): a preparação mede uma vez; o
 * ARQUITETO NÃO GRAVA a medição (antes: "Gravar melhorias" a gravava pelo
 * replay). A medição guardada vai no registro da sugestão (só no servidor); o
 * Minerador a grava pelo MESMO núcleo do "Medir volume" com o replay, no
 * clique do dono, sem consultar o Google Ads de novo; e a próxima preparação
 * aqui lê o volume gravado e grava só o ArticleDNA.
 */
test("F3 · medição única: a preparação mede uma vez; F4 — o Minerador grava a MESMA medição (replay) e o Arquiteto grava só o ArticleDNA", async () => {
  setup(); rows[1].volume_search = 140; rows[1].volume_source = "previous";
  const rt = medindo(runtime, new Map([[normalizeKeyword(rows[1].keyword), 50]]));
  const run = await handleArticleImprovement(rt, { brandId, action: "prepare", authorizeReading: { measure: true } });
  assert.equal(medicoesProvider.length, 1, "uma consulta ao Google Ads na preparação");
  assert.deepEqual([...medicoesProvider[0]].sort(), [rows[0].keyword, rows[1].keyword].sort(), "só as que faltavam");
  assert.equal(run.proposals[0].principalId, newId, JSON.stringify(run.proposals[0]));
  assert.deepEqual(run.proposals[0].needsMinerador?.measureKeywordIds, [newId]);
  assert.equal(run.reading?.done.measuredKeywords, 2);
  assert.ok(projectImprovementRun(run).keywords.every(k => !("measurement" in k)), "a medição guardada não vai ao navegador");
  const registro = journal.find(r => r.subject_type === "architect_minerador_suggestions");
  const item = registro.payload.items.find((i: any) => i.kind === "measure" && i.keywordId === newId);
  assert.equal(item.hasStoredMeasurement, true);
  assert.equal(registro.payload.measurements[item.id].metric.averageMonthlySearches, 50, "a medição guardada fica no registro, no servidor");
  await assert.rejects(() => handleArticleImprovement(rt, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, targetIds: [oldId] }), /precisam do Minerador/);
  assert.equal(rows[1].volume_source, "previous", "o Arquiteto não grava a medição"); assert.deepEqual(replays, []); assert.equal(measured.length, 0);
  // No Minerador, pelo clique do dono: o núcleo do "Medir volume" grava a MESMA medição pelo replay.
  const { replayStoredMeasurements } = await import("../lib/server/minerador-architect-suggestions.ts");
  const { measureKeywordVolume } = await import("../lib/server/minerador-volume-measure.ts");
  const { handleGoogleAdsKeywordMetrics } = await import("../lib/server/minerador-google-ads-metrics-http.ts");
  const replay = replayStoredMeasurements([registro.payload.measurements[item.id]]);
  await measureKeywordVolume({ ...context, module: "minerador", action: "edit" }, [newId], { measure: (req: any, params: any, ctx: any) => (handleGoogleAdsKeywordMetrics as any)(req, params, ctx, { replay }) });
  assert.deepEqual(replays, [rows[1].keyword], "gravada pelo replay");
  assert.equal(rows[1].volume_source, "google_ads");
  assert.equal(medicoesProvider.length, 1, "gravar não consulta o Google Ads de novo");
  // De volta ao Arquiteto: a próxima preparação lê o volume gravado; gravar escreve só o ArticleDNA.
  const outra = await handleArticleImprovement(rt, { brandId, action: "prepare" });
  assert.equal(outra.proposals[0].status, "ready", JSON.stringify(outra.proposals[0]));
  const result = await apply(outra);
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  assert.equal(articles[0].payload.primaryKeywordMetrics.volumeSearch, 50);
  assert.equal(measured.length, 1, "só a gravação do Minerador: o apply do Arquiteto não mediu");
  // Preparar de novo com os mesmos insumos: nada falta, nada é chamado.
  setup(); rows[1].volume_search = 140; rows[1].volume_source = "previous";
  const primeira = await handleArticleImprovement(rt, { brandId, action: "prepare", authorizeReading: { measure: true } });
  const segunda = await handleArticleImprovement(rt, { brandId, action: "prepare", authorizeReading: { measure: true } });
  assert.equal(medicoesProvider.length, 1, "a segunda preparação reaproveita a medição");
  assert.equal(segunda.runId, primeira.runId);
  assert.equal(segunda.reading?.needsPaidReading, false);
});

test("F3 · D4: 'sem média' há menos de 30 dias não é medido de novo; com mais de 30, é", async () => {
  for (const [idade, medida] of [[5, false], [40, true]] as const) {
    setup();
    rows[1].volume_search = null; rows[1].volume_source = null;
    const quando = diasAtras(idade);
    rows[1].analise_semantica = { ...semantic, volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: quando, averageMonthlySearches: null } };
    const run = await handleArticleImprovement(runtime, { brandId, action: "prepare", authorizeReading: { measure: true } });
    assert.equal(legacyAsked.includes(rows[1].keyword), medida, `${idade} dias`);
    // A recente continua com a data do Minerador (não foi remedida); a vencida ganhou a data desta medição.
    assert.equal(run.keywords.find(k => k.id === newId)?.noAverageAt === quando, !medida, `${idade} dias`);
    if (!medida) assert.ok((run.reading?.known.noAverageRecent ?? 0) >= 1);
  }
});

test("F3 · a IA só roda com a autorização e recebe o resumo do DNA", async () => {
  setup(); listCandidate();
  const { prompts, runtime: comIa } = aiRuntime(async () => aiPick);
  const livre = await handleArticleImprovement(comIa, { brandId, action: "prepare" });
  assert.equal(prompts.length, 0);
  assert.deepEqual(livre.reading?.plan.ai, { calls: 1, costUsd: null, provider: "OpenRouter" });
  assert.notEqual(livre.proposals[0].evidenceBasis, "editorial_ai");
  const lida = await handleArticleImprovement(comIa, { brandId, action: "prepare", authorizeReading: { ai: true } });
  assert.equal(prompts.length, 1);
  const pedido = JSON.parse(prompts[0].user);
  assert.equal(pedido.alvos[0].dna.entidade, "captação de pacientes");
  assert.equal(pedido.alvos[0].dna.problema, "poucos agendamentos");
  assert.equal(lida.proposals[0].evidenceBasis, "editorial_ai");
  assert.equal(lida.reusedFromRunId, livre.runId, "a leitura grátis serviu de semente");
  assert.ok(lida.notices.some(n => /só o que faltava foi chamado agora, com a sua autorização/.test(n)), JSON.stringify(lida.notices));
  assert.equal(lida.reading?.done.aiCalls, 1);
});

// F4 (ajuste declarado 2026-10-14): as duas ideias viram "Sugestões do Arquiteto"; o apply não importa nem grava nada no Minerador.
test("F3 · busca nova: ideia que o Minerador já mediu não é medida de novo; a nova é medida uma vez e a medição vai guardada na sugestão (F4)", async () => {
  const comoExterna = () => {
    setup(); external = true; rows = rows.slice(0, 1);
    const logic = deriveLogicalKeywordBatchItem({ id: oldId, keyword: discoveredPhrase, location: null, intent: null, analise_semantica: {} }, null, new Date().toISOString());
    rows[0].analise_semantica = logic.update.analise_semantica; rows[0].canonicalWorkflow.payload.approvedDna.analiseSemantica = logic.update.analise_semantica; rows[0].canonicalWorkflow.payload.semanticQualification = {};
  };
  // (a) já no Minerador com volume medido: "já temos".
  comoExterna();
  knownInBrand = new Map([[normalizeKeyword(discoveredPhrase), { keywordId: newId, known: { state: "measured", volume: 50, measuredAt: diasAtras(90) } }]]);
  const rt = medindo(runtime, new Map([[normalizeKeyword(discoveredPhrase), 50]]));
  const jaTemos = await handleArticleImprovement(rt, { brandId, action: "prepare", discover: true });
  assert.equal(medicoesProvider.length, 0, "a ideia que o Minerador já mediu não vai ao Google Ads");
  assert.ok(jaTemos.notices.some(n => /já existem no Minerador com volume medido/.test(n)), JSON.stringify(jaTemos.notices));
  assert.equal(jaTemos.proposals[0].needsMinerador?.newKeywordIds.length, 1);
  const registroJa = journal.find(r => r.subject_type === "architect_minerador_suggestions" && r.subject_id === `improvement:${jaTemos.runId}`);
  assert.equal(registroJa.payload.items[0].keywordId, newId, "a sugestão aponta a keyword que já está no Minerador");
  assert.equal(registroJa.payload.items[0].hasStoredMeasurement, false, "nada a gravar: o Minerador já mediu");
  await assert.rejects(() => handleArticleImprovement(rt, { brandId, action: "apply", runId: jaTemos.runId, decisionHash: jaTemos.decisionHash, approveNewKeywords: true }), /não aprova keyword/);
  assert.deepEqual(qualification, [], "nada importado, medido, aprovado ou enviado pelo Arquiteto");
  // (b) ideia nova: medida uma vez na busca; a medição vai guardada na sugestão (o Minerador grava sem consultar de novo).
  comoExterna();
  const nova = await handleArticleImprovement(rt, { brandId, action: "prepare", discover: true });
  assert.equal(medicoesProvider.length, 1);
  const registroNovo = journal.find(r => r.subject_type === "architect_minerador_suggestions" && r.subject_id === `improvement:${nova.runId}`);
  const itemNovo = registroNovo.payload.items[0];
  assert.deepEqual([itemNovo.kind, itemNovo.keywordId, itemNovo.hasStoredMeasurement], ["new_keyword", null, true]);
  assert.equal(registroNovo.payload.measurements[itemNovo.id].metric.averageMonthlySearches, 50);
  await assert.rejects(() => handleArticleImprovement(rt, { brandId, action: "apply", runId: nova.runId, decisionHash: nova.decisionHash, targetIds: [oldId] }), /precisam do Minerador/);
  assert.equal(medicoesProvider.length, 1, "nenhuma consulta nova");
  assert.deepEqual(replays, []); assert.deepEqual(qualification, []); assert.equal(articles.length, 0);
});

/*
 * F5 · PLANILHA PRIMEIRO (SDD 2026-10-13 `sdd-arquiteto-so-le-e-listas-leves`, item 5).
 * O artigo do plano (cadastro único: o Assunto mora na keyword) com trava LIVRE
 * (sem volume) e uma sustentação com volume da lista do Assunto. As ações da
 * planilha usam a MESMA melhoria recortada por grupo: prévia (prepare, grátis),
 * uma confirmação (apply), recusa por item e releitura — e nenhuma porta do
 * Minerador é chamada.
 */
function planSheetScenario(lock?: "locked" | "free") {
  setup();
  const plan = { groupId: planGroupId, planVersion: 1, order: 10, role: "Suporte", scope: "Explica a diferença entre a internet contratada e a rede Wi-Fi da casa.", declaredPrincipal: { keywordId: oldId, phrase: "diferença entre internet e wi-fi" }, ...(lock ? { lock } : {}) };
  const subjectSemantic = { ...semantic, keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, entry: { title: "Diferença entre internet e Wi-Fi: o que muda na sua casa", source: "cadastro" }, plan }, keyword_subject_actor: actorUserId, keyword_subject_at: "2026-10-13T10:00:00+00:00", keyword_subject_origin: "import", keyword_declared_principal: { subjectKeywordId: oldId, groupId: planGroupId, planVersion: 1 } };
  const subject = linhaDaMesa({ id: oldId, keyword: "diferença entre internet e wi-fi", brandId, semantic: subjectSemantic });
  rows[0] = { ...rows[0], ...subject, isPublished: false, publishedUrl: undefined, primaryKeywordPolicy: "free", volume_search: null, volume_source: null, territoryRef: territory };
  rows[0].canonicalWorkflow.lockVersion = 1;
  const apoio = linhaDaMesa({ id: newId, keyword: "internet e wi-fi qual a diferença", brandId, semantic: { ...semantic, subject_discovery: { version: 1, searches: [], subjectKeywordIds: [oldId] } } });
  rows[1] = { ...rows[1], ...apoio, volume_search: 50, volume_source: "google_ads", territoryRef: territory, canonicalWorkflow: { ...(apoio.canonicalWorkflow as object), id: `workflow-${newId}`, lockVersion: 1 } };
}
const minerador = () => ({ measured: measured.length, logic: logicRan.length, qualification: qualification.length, replays: replays.length, medicoes: medicoesProvider.length });

test("F5 · Trocar principal (livre): prévia com a escolha do humano, uma confirmação, nova principal no ArticleDNA e nada no Minerador", async () => {
  planSheetScenario();
  const run = await handleArticleImprovement(runtime, { brandId, action: "prepare", group: planGroupId, targetIds: [oldId], origin: "plan_sheet", principalChoice: { [oldId]: newId } });
  assert.equal(run.origin, "plan_sheet");
  assert.equal(run.groupScope?.groupId, planGroupId, "a prévia é recortada pelo grupo do plano");
  const proposta = run.proposals.find(p => p.targetId === oldId)!;
  assert.equal(proposta.status, "ready", JSON.stringify(run.proposals));
  assert.equal(proposta.principalId, newId);
  assert.equal(proposta.currentPrimaryId, oldId);
  assert.deepEqual(proposta.memberIds, [newId], "a keyword do Assunto não é secundária do próprio artigo: continua como o Assunto (fundamento)");
  assert.ok(proposta.reasons.some(reason => /Troca de principal escolhida por você na planilha/.test(reason)), JSON.stringify(proposta.reasons));
  assert.equal(articles.length, 0, "a prévia não grava ArticleDNA");
  const result = await apply(run);
  assert.equal(result.state, "complete");
  assert.equal(result.outcomes[0].status, "improved", JSON.stringify(result.outcomes));
  const dna = articles[0].payload;
  assert.equal(dna.principalKeywordId, newId);
  assert.equal(dna.subject.keywordId, oldId, "o Assunto continua no artigo");
  assert.equal(dna.hierarchy, "Suporte"); assert.equal(dna.promise, "Explica a diferença entre a internet contratada e a rede Wi-Fi da casa.");
  assert.deepEqual(minerador(), { measured: 0, logic: 0, qualification: 0, replays: 0, medicoes: 0 }, "nada gravado no Minerador");
  assert.equal(paid, 0);
});

test("F5 · Trocar principal recusa por linha: travada e candidata fora da regra não trocam; o resto do lote segue", async () => {
  planSheetScenario("locked");
  const travada = await handleArticleImprovement(runtime, { brandId, action: "prepare", group: planGroupId, targetIds: [oldId], origin: "plan_sheet", principalChoice: { [oldId]: newId } });
  const linha = travada.proposals.find(p => p.targetId === oldId)!;
  assert.notEqual(linha.status, "ready");
  assert.equal(linha.principalId, oldId, "a principal travada nunca é trocada");
  assert.ok(linha.reasons.some(reason => /Principal travada · mude a trava no Minerador/.test(reason)), JSON.stringify(linha.reasons));
  await assert.rejects(() => handleArticleImprovement(runtime, { brandId, action: "apply", runId: travada.runId, decisionHash: travada.decisionHash, targetIds: [oldId] }), /prontas/);
  planSheetScenario();
  const fora = await handleArticleImprovement(runtime, { brandId, action: "prepare", group: planGroupId, targetIds: [oldId], origin: "plan_sheet", principalChoice: { [oldId]: "keyword-de-fora" } });
  assert.ok(fora.proposals[0].reasons.some(reason => /não é candidata a principal/.test(reason)), JSON.stringify(fora.proposals[0].reasons));
  assert.notEqual(fora.proposals[0].status, "ready");
  assert.equal(articles.length, 0);
  assert.deepEqual(minerador(), { measured: 0, logic: 0, qualification: 0, replays: 0, medicoes: 0 });
});

test("F5 · Concluir formação pela planilha: alvo que não é do plano é recusado POR ITEM (o lote segue); sem a origem, o lote inteiro recusa como antes", async () => {
  planSheetScenario();
  const run = await handleArticleImprovement(runtime, { brandId, action: "prepare", group: planGroupId, targetIds: [oldId, "nao-e-alvo"], origin: "plan_sheet" });
  assert.deepEqual(run.refusedTargets?.map(item => item.id), ["nao-e-alvo"]);
  assert.match(run.refusedTargets![0].reason, /não está recebida no Arquiteto/);
  assert.ok(run.proposals.some(p => p.targetId === oldId));
  await assert.rejects(() => handleArticleImprovement(runtime, { brandId, action: "prepare", targetIds: [oldId, "nao-e-alvo"] }), /não pertence à marca/);
  // A formação grava pelo mesmo núcleo (prepare → apply) e relê; nada no Minerador.
  const pronta = run.proposals.find(p => p.targetId === oldId)!;
  assert.equal(pronta.status, "ready", JSON.stringify(run.proposals));
  const result = await handleArticleImprovement(runtime, { brandId, action: "apply", runId: run.runId, decisionHash: run.decisionHash, targetIds: [oldId] });
  assert.equal(result.state, "complete");
  assert.ok(["improved", "dna_created"].includes(result.outcomes[0].status), JSON.stringify(result.outcomes));
  assert.equal(articles.length, 1, "um ArticleDNA, relido pelo núcleo");
  assert.equal(articles[0].payload.subject.keywordId, oldId);
  assert.deepEqual(minerador(), { measured: 0, logic: 0, qualification: 0, replays: 0, medicoes: 0 }, "nada gravado no Minerador");
});

test("F5 · o painel de texto fica para publicados: excludePlanArticles tira o Assunto com plano dos alvos", async () => {
  planSheetScenario();
  const painel = await handleArticleImprovement(runtime, { brandId, action: "prepare", excludePlanArticles: true });
  assert.equal(painel.targets.some(target => target.id === oldId), false, "o artigo do plano é da planilha");
  const sem = await handleArticleImprovement(runtime, { brandId, action: "prepare" });
  assert.equal(sem.targets.some(target => target.id === oldId), true, "sem a opção, o contrato de sempre");
});

/*
 * 2026-10-14 · CASO REAL WifiConecta: a keyword do plano está dentro do
 * ArticleDNA vigente de OUTRO artigo (`melhor-para-jogos-online`, Assunto
 * Mega/Giga do laranja, Silo "planos de internet"). Pela planilha, só esta
 * linha é recusada, dizendo onde está presa e o caminho; nada é gravado.
 */
test("2026-10-14 · Concluir formação pela planilha: keyword presa no artigo de outro Assunto recusa POR ITEM com o caminho; sem a origem, o contrato de sempre", async () => {
  planSheetScenario();
  const intrusoId = "9df07c7b-16ae-414e-aadc-9f460c5f537b";
  articles.push({ entityId: intrusoId, versionId: `${intrusoId}:v1`, versionNumber: 1, payload: { articleId: intrusoId, brandId, subject: { keywordId: intrusoId, phrase: "Internet de 300, 500, 600 Mega ou 1 Giga: qual velocidade contratar?" }, principalKeywordId: oldId, keywordReferences: [{ keywordId: oldId, role: "principal" }], suggestedSlug: "melhor-para-jogos-online", siloId: "territory:planos-de-internet", territoryRef: "territory:planos-de-internet" } });
  const run = await handleArticleImprovement(runtime, { brandId, action: "prepare", group: planGroupId, targetIds: [oldId], origin: "plan_sheet" });
  assert.deepEqual(run.refusedTargets?.map(item => item.id), [oldId]);
  assert.match(run.refusedTargets![0].reason, /^Presa no artigo “melhor-para-jogos-online”.*Assunto “Internet de 300, 500, 600 Mega ou 1 Giga.*“Retirar artigo do Silo” nesse artigo/);
  assert.equal(run.proposals.some(p => p.targetId === oldId), false, "a linha presa não vira proposta");
  assert.equal(articles.length, 1, "nada gravado");
  assert.deepEqual(minerador(), { measured: 0, logic: 0, qualification: 0, replays: 0, medicoes: 0 });
  assert.equal(paid, 0);
});
